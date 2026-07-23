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
  type ResolvePlaceInput,
  type SearchPlacesInput,
  type UpdatePlaceInput,
} from '@waypoint/shared';
import { assertPlacesInTrip } from '../common/trip-scope.util';
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
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.PLACE,
        entityId: id,
        action: 'create',
        after: input,
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
              updatedBy: actorUserId,
            },
          }),
      });
      return toPlaceDto(entity);
    } catch (err) {
      // Client-generated id (ADR-0018): an offline-outbox retry re-POSTs the same id;
      // treat the unique-constraint hit as "already applied" (sync-and-offline.md).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toPlaceDto(await this.requirePlace(tripId, id));
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
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.PLACE,
      entityId: placeId,
      action: 'update',
      before: toPlaceDto(before),
      after: input,
      apply: (tx) =>
        tx.place.update({
          where: { id: placeId },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.googlePlaceId !== undefined && { googlePlaceId: input.googlePlaceId }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.lat !== undefined && { lat: input.lat }),
            ...(input.lng !== undefined && { lng: input.lng }),
            updatedBy: actorUserId,
          },
        }),
    });
    return toPlaceDto(entity);
  }

  /** Autocomplete relay (ADR-0108 §1). Pure passthrough to Google under the trip's
   *  session token — no DB read/write, no spend when the session terminates in a
   *  pick. The `alreadyInTrip` dedup chip is a client-side derivation over the
   *  snapshot (ADR-0110 §1), so nothing trip-specific is needed here. */
  searchPlaces(input: SearchPlacesInput): Promise<PlacePrediction[]> {
    return this.google.autocomplete(input.input, input.sessionToken);
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
    const cached = await this.prisma.place.findFirst({
      where: { tripId, googlePlaceId: input.googlePlaceId },
    });
    if (cached) return toPlaceDto(cached);

    const details = await this.google.placeDetails(input.googlePlaceId, input.sessionToken);
    const timezone = this.resolveTimezone(details.lat, details.lng);

    if (input.enrichPlaceId) {
      return this.enrichExisting(tripId, actorUserId, input.enrichPlaceId, details, timezone);
    }
    return this.createEnriched(tripId, actorUserId, details, timezone);
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
      // A concurrent pick of the same place in the same trip trips the
      // (tripId, googlePlaceId) unique constraint — the dedup guarantee holding under
      // a race. Return the row the other request just wrote (zero extra spend).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.place.findFirst({
          where: { tripId, googlePlaceId: details.googlePlaceId },
        });
        if (winner) return toPlaceDto(winner);
      }
      throw err;
    }
  }

  /** Adopt the Google id/coords/zone onto an existing coordless Place-lite (the
   *  "auto-enriches on next pick" flow, ADR-0106 §12 / ADR-0110 §1). */
  private async enrichExisting(
    tripId: string,
    actorUserId: string,
    enrichPlaceId: string,
    details: PlaceDetails,
    timezone: string | undefined,
  ): Promise<Place> {
    await assertPlacesInTrip(this.prisma, tripId, [enrichPlaceId]);
    const before = await this.requirePlace(tripId, enrichPlaceId);
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
        entityId: enrichPlaceId,
        action: CHANGE_ACTION.UPDATE,
        before: toPlaceDto(before),
        after: data,
        apply: (tx) =>
          tx.place.update({
            where: { id: enrichPlaceId },
            data: { updatedBy: actorUserId, ...data },
          }),
      });
      return toPlaceDto(entity);
    } catch (err) {
      // A concurrent pick already linked this Google place to another row in the trip
      // (dedup race). The uniqueness constraint wins — return the already-enriched row
      // rather than a duplicate; the Place-lite stays as-is (ADR-0108 §3).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.place.findFirst({
          where: { tripId, googlePlaceId: details.googlePlaceId },
        });
        if (winner) return toPlaceDto(winner);
      }
      throw err;
    }
  }

  private async requirePlace(tripId: string, placeId: string): Promise<PrismaPlace> {
    const place = await this.prisma.place.findFirst({ where: { id: placeId, tripId } });
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }
}
