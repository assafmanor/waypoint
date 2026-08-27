import { Injectable, NotFoundException } from '@nestjs/common';
import type { TravelModeOverride as PrismaTravelModeOverride } from '@prisma/client';
import {
  ENTITY_TYPE,
  travelOverridePair,
  type LegTravelMode,
  type SetTravelModeOverride,
  type TravelModeOverride,
} from '@waypoint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertPlacesInTrip } from '../common/trip-scope.util';
import { ChangeService } from '../sync/change.service';
import { toTravelModeOverrideDto } from '../trips/trips.mapper';

/**
 * **The per-leg travel-mode override** (ADR-0206 §V1.6 as amended by §Z2; keyed per §AM).
 *
 * The default mode is **derived** on the client from the trip's bookings (`derivedTravelMode`), and
 * §Z2 forbids a `defaultTravelMode` column — so this service owns the only persisted half: a row
 * per place pair, written only when somebody actually overrode the derivation.
 *
 * **Two verbs, and `set` is an upsert rather than a create/update pair.** A person is stating what
 * a journey IS; stating it twice is stating it once, and there is nothing at the edge that could
 * tell the two apart. That also makes an outbox retry idempotent for free, without the
 * client-generated-id dance the attachment service needs.
 *
 * Every mutation goes through `ChangeService.mutate` (ADR-0019), so a peer hears about a declared
 * leg exactly the way it hears about everything else.
 *
 * **What this service never does: route anything.** `transit` is a legal `mode` here and is not a
 * `TravelMode` — it can never reach `TRAVEL_GATE` or the provider's `COSTING`, both of which stay
 * `Record<TravelMode, …>` with three entries (§AM5). No request is made for a declared leg, ever.
 */
@Injectable()
export class TravelModesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  list(tripId: string): Promise<PrismaTravelModeOverride[]> {
    return this.prisma.travelModeOverride.findMany({ where: { tripId } });
  }

  /**
   * **Declare how this pair is travelled.** Idempotent on the pair, in both directions: the ids are
   * canonicalised by `travelOverridePair` before they are written, which is what makes the unique
   * constraint mean "one mode per pair" rather than "one per direction" (§AM2).
   */
  async set(
    tripId: string,
    actorUserId: string,
    input: SetTravelModeOverride,
  ): Promise<TravelModeOverride> {
    // Both ends are client-supplied ids, so both are scoped before either is written — a foreign
    // one would be an override across trips (B-06's class of bug).
    await assertPlacesInTrip(this.prisma, tripId, [input.fromPlaceId, input.toPlaceId]);
    const pair = travelOverridePair(input.fromPlaceId, input.toPlaceId);
    const existing = await this.prisma.travelModeOverride.findUnique({
      where: { tripId_fromPlaceId_toPlaceId: { tripId, ...pair } },
    });
    // **The id is settled BEFORE the write**, because `ChangeService.mutate` takes `entityId` up
    // front — the `Change` has to name the row it describes, and a cuid the upsert generates is
    // not knowable then. Same reason `DocumentAttachmentsService` mints one (ADR-0019's shape).
    //
    // **The existing row's id wins over the client's**, and the order matters: the PAIR is the
    // identity (§AM1) and the id is only its handle, so a client declaring a leg a peer already
    // declared updates that row rather than fighting the unique constraint. The client's own
    // optimistic row is then briefly stale, which the next snapshot replaces wholesale — the same
    // tolerance every other client-minted id carries, and `legTravelMode` reads the newest match
    // so the transient duplicate cannot flicker.
    const id = existing?.id ?? input.id ?? randomUUID();
    const mode: LegTravelMode = input.mode;
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.TRAVEL_MODE_OVERRIDE,
      entityId: id,
      action: existing ? 'update' : 'create',
      before: existing ? toTravelModeOverrideDto(existing) : undefined,
      // Read off the WRITTEN row rather than the input, so `updatedAt` and the canonicalised pair
      // in the broadcast are the ones the database actually holds.
      after: (row: PrismaTravelModeOverride) => toTravelModeOverrideDto(row),
      apply: (tx) =>
        tx.travelModeOverride.upsert({
          where: { tripId_fromPlaceId_toPlaceId: { tripId, ...pair } },
          create: { id, tripId, ...pair, mode, createdBy: actorUserId },
          update: { mode },
        }),
    });
    return toTravelModeOverrideDto(entity);
  }

  /**
   * **Take the declaration back**, which returns the leg to the derived mode rather than to
   * nothing — there is no "no mode" state, only "nobody said otherwise" (§Z2).
   */
  async clear(tripId: string, overrideId: string, actorUserId: string): Promise<void> {
    const before = await this.prisma.travelModeOverride.findFirst({
      where: { id: overrideId, tripId },
    });
    if (!before) throw new NotFoundException('Travel mode override not found');
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.TRAVEL_MODE_OVERRIDE,
      entityId: overrideId,
      action: 'delete',
      before: toTravelModeOverrideDto(before),
      apply: (tx) => tx.travelModeOverride.delete({ where: { id: overrideId } }),
    });
  }
}
