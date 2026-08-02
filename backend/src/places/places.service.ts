import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Place as PrismaPlace } from '@prisma/client';
import { find as findTimezone } from 'geo-tz';
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  type CreatePlaceInput,
  type Place,
  type PlacePrediction,
  type PlaceResult,
  type ResolvePlaceInput,
  type SearchPlacesInput,
  type SearchPlacesTextInput,
  type UpdatePlaceInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { toPlaceDto } from '../trips/trips.mapper';
import { GooglePlacesClient, type PlaceDetails } from './google-places.client';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
    private readonly google: GooglePlacesClient,
  ) {}

  async list(tripId: string): Promise<Place[]> {
    const places = await this.prisma.place.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    return places.map(toPlaceDto);
  }

  async create(tripId: string, actorUserId: string, input: CreatePlaceInput): Promise<Place> {
    const id = input.id ?? randomUUID();
    // THE ZONE IS RESOLVED FOR ANY CALLER THAT SUPPLIES COORDINATES, not only the enriched
    // path (ADR-0147 §3). Until the canvas could drop a pin, the only place with coordinates
    // came from Google, so `resolveTimezone` was called only in `resolvePlace` — and a place
    // created straight from coordinates landed with `timezone: null`, which silently falls
    // back to the trip's zone (ADR-0107). That is wrong for exactly the traveller who marks
    // a spot across a border. Same helper, so there is one place that knows how.
    const timezone = this.resolveTimezone(input.lat, input.lng);
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.PLACE,
        entityId: id,
        action: 'create',
        after: { ...input, timezone },
        apply: (tx) =>
          tx.place.create({
            data: {
              id,
              tripId,
              name: input.name,
              googlePlaceId: input.googlePlaceId,
              address: input.address,
              lat: input.lat,
              lng: input.lng,
              timezone,
              icon: input.icon,
              // Present only on an undo restoring a row we cached ourselves (ADR-0157 §4);
              // every ordinary create leaves them undefined and Google fills them on enrich.
              rating: input.rating,
              userRatingsTotal: input.userRatingsTotal,
              updatedBy: actorUserId,
            },
          }),
      });
      return toPlaceDto(entity);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Two constraints can trip P2002 now (the @@unique([tripId, googlePlaceId])
        // added in ADR-0108, alongside the id primary key):
        //  - same client id re-POSTed → an offline-outbox retry (ADR-0018), already applied;
        //  - a googlePlaceId already present on another row → dedup, return that row
        //    rather than a spurious 404 for the never-inserted id.
        const existing =
          (await this.prisma.place.findFirst({ where: { id, tripId } })) ??
          (input.googlePlaceId ? await this.findByGoogleId(tripId, input.googlePlaceId) : null);
        if (existing) return toPlaceDto(existing);
      }
      throw err;
    }
  }

  async update(
    tripId: string,
    placeId: string,
    actorUserId: string,
    input: UpdatePlaceInput,
  ): Promise<Place> {
    const before = await this.requirePlace(tripId, placeId);
    // Moving a place moves its zone with it — the same rule `create` above now follows, and
    // for the same reason (ADR-0147 §3). Only when BOTH coordinates arrive: a partial update
    // that names the place says nothing about where it is, and recomputing from one axis
    // would be recomputing from nothing.
    const moved = input.lat !== undefined && input.lng !== undefined;
    const timezone = moved ? this.resolveTimezone(input.lat, input.lng) : undefined;
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.PLACE,
      entityId: placeId,
      action: 'update',
      after: moved ? { ...input, timezone } : input,
      before: toPlaceDto(before),
      apply: (tx) =>
        tx.place.update({
          where: { id: placeId },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.googlePlaceId !== undefined && { googlePlaceId: input.googlePlaceId }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.lat !== undefined && { lat: input.lat }),
            ...(input.lng !== undefined && { lng: input.lng }),
            ...(input.icon !== undefined && { icon: input.icon }),
            ...(input.rating !== undefined && { rating: input.rating }),
            ...(input.userRatingsTotal !== undefined && {
              userRatingsTotal: input.userRatingsTotal,
            }),
            ...(moved && { timezone }),
            updatedBy: actorUserId,
          },
        }),
    });
    return toPlaceDto(entity);
  }

  /**
   * **Delete a place, and let the database say what that costs** (ADR-0157).
   *
   * The referencing rows are NOT touched here, and that is deliberate: the four FKs that
   * point at a place are `onDelete: SetNull` and a note's is `onDelete: Cascade`
   * (`schema.prisma`), so an event keeps its slot and loses its location, and the place's
   * own notes go with it. Re-implementing either in application code would be a second
   * opinion about a rule the schema already states.
   *
   * What that costs the sync layer is one `Change` row for the place and nothing for the
   * cascade — Postgres writes no changes of its own. The client applies the same two rules
   * locally off this one delete (`dropNotesForHostChange`'s twin for the place FKs,
   * ADR-0152 §2's precedent), which is why the delete has to be a change at all rather than
   * a quiet row removal.
   */
  async remove(tripId: string, placeId: string, actorUserId: string): Promise<void> {
    const before = await this.requirePlace(tripId, placeId);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.PLACE,
      entityId: placeId,
      action: CHANGE_ACTION.DELETE,
      before: toPlaceDto(before),
      apply: (tx) => tx.place.delete({ where: { id: placeId } }),
    });
  }

  /** Autocomplete relay (ADR-0108 §1). Pure passthrough to Google under the trip's
   *  session token — no DB read/write, no spend when the session terminates in a
   *  pick. The `alreadyInTrip` dedup chip is a client-side derivation over the
   *  snapshot (ADR-0110 §1), so nothing trip-specific is needed here. */
  searchPlaces(input: SearchPlacesInput): Promise<PlacePrediction[]> {
    return this.google.autocomplete(input.input, input.sessionToken);
  }

  /** Text Search relay (ADR-0132 §7). Also a pure passthrough — the point of the SKU is
   *  that results arrive WITH coordinates, so they can be pins and not only rows. There
   *  is no session to close and therefore no $0 tail: every call is billed, which is why
   *  the client's min-chars floor and pause debounce carry more weight here than on the
   *  Autocomplete half. `bias` is the caller's viewport (free relevance). */
  searchPlacesText(input: SearchPlacesTextInput): Promise<PlaceResult[]> {
    return this.google.textSearch(input.input, input.bias);
  }

  /**
   * Enrich-on-pick (create-or-link), the cost floor (ADR-0108 §3). Dedup-before-spend:
   * a place already enriched in this trip returns its cached row with **zero** Google
   * spend and no new `geo-tz` work. On a miss, one Place Details call, resolve the zone
   * once via `geo-tz`, and persist through `ChangeService.mutate` — either enriching a
   * named-only Place-lite in place (`enrichPlaceId`, ADR-0110 §1) or minting a new row.
   */
  async resolvePlace(
    tripId: string,
    actorUserId: string,
    input: ResolvePlaceInput,
  ): Promise<Place> {
    // Dedup-before-spend: the (tripId, googlePlaceId) uniqueness constraint means at
    // most one row per Google place per trip. A hit short-circuits before any spend.
    // This also governs the enrichPlaceId corner (ADR-0110 §1): when the picked place
    // is already in the trip on another row, dedup wins and that row is returned —
    // the passed Place-lite is left as-is rather than creating a duplicate.
    const cached = await this.findByGoogleId(tripId, input.googlePlaceId);
    if (cached) return toPlaceDto(cached);

    // Validate the enrich target (and load its `before` state) BEFORE the paid Place
    // Details call, so a bogus/foreign enrichPlaceId is rejected without spending a SKU.
    const target = input.enrichPlaceId
      ? await this.requirePlace(tripId, input.enrichPlaceId)
      : null;

    // The Text Search half already HAS the name, address and point (ADR-0132 §7), so a
    // Details call here would buy the same place twice. Absent, this is the Autocomplete
    // path and the paid call stands. The zone is still resolved server-side from the
    // coordinates either way — that is ours, not Google's.
    const details = input.details
      ? { googlePlaceId: input.googlePlaceId, ...input.details }
      : await this.google.placeDetails(input.googlePlaceId, input.sessionToken);
    const timezone = this.resolveTimezone(details.lat, details.lng);

    return target
      ? this.enrichExisting(tripId, actorUserId, target, details, timezone)
      : this.createEnriched(tripId, actorUserId, details, timezone);
  }

  /** Resolve the IANA zone once from coords (ADR-0107/0108). `geo-tz` returns [] for
   *  open ocean and the like; a Place-lite (no coords) has no zone by definition. */
  private resolveTimezone(lat?: number, lng?: number): string | undefined {
    if (lat === undefined || lng === undefined) return undefined;
    return findTimezone(lat, lng)[0];
  }

  private async createEnriched(
    tripId: string,
    actorUserId: string,
    details: PlaceDetails,
    timezone: string | undefined,
  ): Promise<Place> {
    const id = randomUUID();
    // A fresh pick has no user-authored name, so it takes Google's displayName.
    const data = {
      googlePlaceId: details.googlePlaceId,
      name: details.name,
      address: details.address,
      lat: details.lat,
      lng: details.lng,
      timezone,
    };
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.PLACE,
        entityId: id,
        action: CHANGE_ACTION.CREATE,
        after: { id, tripId, ...data },
        apply: (tx) => tx.place.create({ data: { id, tripId, updatedBy: actorUserId, ...data } }),
      });
      return toPlaceDto(entity);
    } catch (err) {
      return this.recoverDedupRace(err, tripId, details.googlePlaceId);
    }
  }

  /** Adopt the Google id/coords/address/zone onto an existing coordless Place-lite (the
   *  "auto-enriches on next pick" flow, ADR-0106 §12 / ADR-0110 §1). The user's own
   *  name is preserved — ADR-0110 §1 adopts googlePlaceId/coords/timezone, not the
   *  label the user typed. `before` is the already-scope-checked row from resolvePlace.
   *
   *  **`name` and `icon` are omitted on purpose, and that omission is the whole policy
   *  ADR-0147 gave a surface to: what a human authored about a place outranks what Google
   *  says about it.** It was implemented here as an absence long before there was a way to
   *  author either from the app. Adding a field to this `data` object hands it back to
   *  Google — so anything user-authored stays out of it. */
  private async enrichExisting(
    tripId: string,
    actorUserId: string,
    before: PrismaPlace,
    details: PlaceDetails,
    timezone: string | undefined,
  ): Promise<Place> {
    const data = {
      googlePlaceId: details.googlePlaceId,
      address: details.address,
      lat: details.lat,
      lng: details.lng,
      timezone,
    };
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.PLACE,
        entityId: before.id,
        action: CHANGE_ACTION.UPDATE,
        before: toPlaceDto(before),
        after: data,
        apply: (tx) =>
          tx.place.update({
            where: { id: before.id },
            data: { updatedBy: actorUserId, ...data },
          }),
      });
      return toPlaceDto(entity);
    } catch (err) {
      return this.recoverDedupRace(err, tripId, details.googlePlaceId);
    }
  }

  /** A concurrent pick of the same Google place in the same trip trips the
   *  (tripId, googlePlaceId) unique constraint — the dedup guarantee holding under a
   *  race. Return the row the winning request wrote (zero extra spend); rethrow anything
   *  else. Shared by the create and enrich paths so the recovery can't drift. */
  private async recoverDedupRace(
    err: unknown,
    tripId: string,
    googlePlaceId: string,
  ): Promise<Place> {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await this.findByGoogleId(tripId, googlePlaceId);
      if (winner) return toPlaceDto(winner);
    }
    throw err;
  }

  private findByGoogleId(tripId: string, googlePlaceId: string): Promise<PrismaPlace | null> {
    return this.prisma.place.findFirst({ where: { tripId, googlePlaceId } });
  }

  private async requirePlace(tripId: string, placeId: string): Promise<PrismaPlace> {
    const place = await this.prisma.place.findFirst({ where: { id: placeId, tripId } });
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }
}
