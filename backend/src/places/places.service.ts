import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Place as PrismaPlace } from '@prisma/client';
import { find as findTimezone } from 'geo-tz';
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  HOUSEKEEPING_CHANGE,
  type CreatePlaceInput,
  type Place,
  type PlacePrediction,
  type PlaceResult,
  type ResolvePlaceInput,
  type SearchPlacesInput,
  type SearchPlacesTextInput,
  type UpdatePlaceInput,
} from '@waypoint/shared';
import { EnrichmentScheduler } from '../enrichment/enrichment.scheduler';
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
    private readonly scheduler: EnrichmentScheduler,
  ) {}

  async list(tripId: string): Promise<Place[]> {
    const places = await this.prisma.place.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    return places.map(toPlaceDto);
  }

  /**
   * **How long an orphan is left alone before the sweep may take it** (ADR-0157 §6).
   *
   * It is one number doing two jobs, and both want it generous rather than tight:
   *
   *  - **The row is a PAID cache.** `resolvePlace` dedups on `(tripId, googlePlaceId)`, so
   *    deleting an enriched orphan means the next pick of that place buys Place Details
   *    again (ADR-0108 §3). The cache's value is highest right after the pick — pick,
   *    cancel, re-pick tomorrow — and about zero a week later.
   *  - **An undo must still find what it re-links to.** Deleting the last thing that
   *    referenced a place orphans it, and undoing that delete puts the reference back.
   *
   * A week satisfies both with room to spare. Deliberately NOT env-tunable: nothing about
   * it is deployment-specific, and the number is only meaningful alongside the reasoning.
   */
  static readonly ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * **Delete the places nothing points at any more** (ADR-0157 §6) — the GC that ADR-0112
   * left open ("cache-only rows still accumulate … a later GC is possible if it ever
   * matters, not needed now"). It matters at the snapshot: every orphan is downloaded on
   * every cold load, and nothing can ever show it, because the Map's list and pins are
   * built from references (ADR-0110 §2). An invisible row is not a harmless row.
   *
   * **What is spared, and why each one is not an orphan:**
   *  - anything a reference points at — the definition;
   *  - **a place carrying notes.** Its notes are authored data, `Note.placeId` is
   *    `onDelete: Cascade`, and they are *visible*: the notes screen lists them under this
   *    place's name (ADR-0153 §8). A sweep that destroyed them would be the one thing this
   *    whole feature is careful not to do silently;
   *  - anything touched inside `ORPHAN_GRACE_MS`.
   *
   * Each deletion goes through `ChangeService` like every other data-plane write (ADR-0019),
   * so a peer's list and Dexie cache lose the row too rather than carrying it until the next
   * snapshot.
   */
  async sweepOrphans(
    tripId: string,
    actorUserId: string,
    graceMs: number = PlacesService.ORPHAN_GRACE_MS,
  ): Promise<Place[]> {
    const orphans = await this.prisma.place.findMany({
      where: {
        tripId,
        updatedAt: { lt: new Date(Date.now() - graceMs) },
        // The four `SetNull` FKs and the one `Cascade` one, as relation filters — the same
        // set `place-refs.ts` names on the client, and the reason a sixth FK has to be
        // added here too or the sweep would delete a row something still points at.
        events: { none: {} },
        bookings: { none: {} },
        bookingsFrom: { none: {} },
        bookingsTo: { none: {} },
        maybeItems: { none: {} },
        notes: { none: {} },
      },
    });
    if (orphans.length === 0) return [];

    const dtos = orphans.map(toPlaceDto);
    await this.changes.mutateMany({
      tripId,
      actorUserId,
      apply: async (tx) => {
        await tx.place.deleteMany({ where: { id: { in: orphans.map((p) => p.id) } } });
        return {
          entity: dtos,
          ops: dtos.map((place) => ({
            entityType: ENTITY_TYPE.PLACE,
            entityId: place.id,
            action: CHANGE_ACTION.DELETE,
            before: place,
            // Marks these as the server tidying up rather than as this actor's edit, so the
            // change feed does not report a housekeeping delete against whoever happened to
            // pick a place that minute. A delete's `after` is otherwise unused, and no
            // applier reads it — see `HOUSEKEEPING_CHANGE`.
            after: HOUSEKEEPING_CHANGE,
          })),
        };
      },
    });
    return dtos;
  }

  /**
   * **The sweep runs where places are MINTED**, and nowhere else (ADR-0157 §6).
   *
   * That is the whole scheduling decision, and it is deliberate rather than convenient: a
   * create is the only moment the table grows, it is already a write with a transaction and
   * a change stream, and it bounds the work to the trip in hand. The repo has no scheduler
   * and this is not a good enough reason to introduce one (root rule 8).
   *
   * **Best-effort, always.** A pick is a user action with a form waiting on it; a
   * housekeeping query must never be what fails it. `ponytail:` the next mint retries.
   */
  private async sweepAfterMint(tripId: string, actorUserId: string): Promise<void> {
    try {
      await this.sweepOrphans(tripId, actorUserId);
    } catch {
      // ponytail: a failed sweep costs nothing but the rows it did not take.
    }
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
              nickname: input.nickname,
              category: input.category,
              // Present only on an undo restoring a row we cached ourselves (ADR-0157 §4);
              // every ordinary create leaves them undefined and Google fills them on enrich.
              rating: input.rating,
              userRatingsTotal: input.userRatingsTotal,
              updatedBy: actorUserId,
            },
          }),
      });
      // The table just grew, so this is where it gets tidied (ADR-0157 §6). After the
      // create, never before: the row we are about to return must not be a candidate.
      await this.sweepAfterMint(tripId, actorUserId);
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
            // An empty string is how the form CLEARS a nickname, so it is written as null
            // rather than skipped — `undefined` here would mean "not mentioned" and leave the
            // old label in force, which is the one thing a cleared field must not do.
            ...(input.nickname !== undefined && { nickname: input.nickname || null }),
            ...(input.category !== undefined && { category: input.category }),
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
  async searchPlacesText(input: SearchPlacesTextInput): Promise<PlaceResult[]> {
    const results = await this.google.textSearch(input.input, input.bias, input.kind);
    // **A restriction that finds nothing is dropped once, and that is not a hedge — it is the
    // one thing that makes the strict filter safe to ship** (field report #6).
    //
    // `includedType` takes a single type and Google lists `airport` and `international_airport`
    // separately; whether every international airport also carries the generic `airport` type
    // is undocumented, and no session here had an API key to measure it. Under
    // `strictTypeFiltering` the failure mode is silent and total — Ben Gurion simply is not in
    // the list, on the surface a person is trying to pick their departure airport from. So an
    // EMPTY restricted answer is re-asked unrestricted: one extra call, only when the first one
    // already returned nothing, and never on the path that works. Delete this the day the
    // overlap is verified against a real key.
    if (input.kind && results.length === 0) {
      return this.google.textSearch(input.input, input.bias);
    }
    return results;
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
    if (cached) {
      // A dedup hit still wants a pass: the row is in this trip, and whether the *world's*
      // facts about it have ever been fetched is a separate question (the store is global and
      // this trip may be the first to hold it). Harmless to repeat — the in-flight guard
      // collapses a form's re-picks, and a fresh row's pass returns without asking anyone.
      this.scheduleEnrichment(cached);
      return toPlaceDto(cached);
    }

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

    const place = target
      ? await this.enrichExisting(tripId, actorUserId, target, details, timezone)
      : await this.createEnriched(tripId, actorUserId, details, timezone);
    // The other mint (ADR-0157 §6). The dedup hit above returns before reaching this, which
    // is right: a hit added no row, and it is also the path a form's re-pick takes — the one
    // moment the cache is earning its keep.
    await this.sweepAfterMint(tripId, actorUserId);
    // **The pick's own trigger** (ADR-0166 §14), and the reason it is here rather than nowhere:
    // this is the moment a person is looking at the place they just added, so it is the moment
    // enrichment is worth having. It narrowly revises §6's "`resolvePlace` is untouched" while
    // keeping the guarantee that sentence was protecting — the call is synchronous, returns
    // instantly, and cannot throw, so the pick stays exactly as fast and exactly as failable as
    // it was. A source being slow or down is invisible from here.
    this.scheduleEnrichment(place);
    return place;
  }

  /**
   * Hand a just-picked place to the enrichment scheduler. Never awaited, never throws.
   *
   * The `try` is not belt-and-braces: §6's guarantee is that the pick is **exactly as failable
   * as it was**, and that has to hold structurally at the call site rather than depending on
   * the scheduler staying well-behaved forever. Same reasoning, and the same shape, as
   * `sweepAfterMint` above — a pick is a paid write with a form waiting on it.
   */
  private scheduleEnrichment(place: Place | PrismaPlace): void {
    try {
      this.scheduler.schedule({
        name: place.name,
        googlePlaceId: place.googlePlaceId ?? undefined,
        lat: place.lat ?? undefined,
        lng: place.lng ?? undefined,
      });
    } catch {
      // ponytail: the snapshot read's own trigger picks this place up regardless.
    }
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
   *  **`name`, `icon` and `category` are omitted on purpose, and that omission is the whole
   *  policy ADR-0147 gave a surface to: what a human authored about a place outranks what
   *  Google says about it.** It was implemented here as an absence long before there was a way
   *  to author any of them from the app. Adding a field to this `data` object hands it back to
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
