import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type MaybeItem as PrismaMaybeItem } from '@prisma/client';
import {
  ENTITY_TYPE,
  type CreateMaybeItemInput,
  type MaybeItem,
  type UpdateMaybeItemInput,
} from '@waypoint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { toMaybeItemDto } from '../trips/trips.mapper';

@Injectable()
export class MaybeItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  /** Add an idea to the shelf (Plan-mode research/build-the-shelf, ADR-0025 Tier 3). */
  async create(
    tripId: string,
    actorUserId: string,
    input: CreateMaybeItemInput,
  ): Promise<MaybeItem> {
    const id = input.id ?? randomUUID();
    try {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: id,
        action: 'create',
        after: input,
        apply: (tx) =>
          tx.maybeItem.create({
            data: {
              id,
              tripId,
              title: input.title,
              icon: input.icon,
              category: input.category,
              placeId: input.placeId,
              targetDate: input.targetDate,
              consumed: false,
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          }),
      });
      return toMaybeItemDto(entity);
    } catch (err) {
      // Client-generated id makes an offline-outbox retry idempotent (as in
      // events.service.create): a duplicate id is "already applied", not an error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toMaybeItemDto(await this.requireMaybeItem(tripId, id));
      }
      throw err;
    }
  }

  /** Remove an idea from the shelf (Tier 3). */
  async remove(tripId: string, maybeItemId: string, actorUserId: string): Promise<void> {
    const before = await this.requireMaybeItem(tripId, maybeItemId);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.MAYBE_ITEM,
      entityId: maybeItemId,
      action: 'delete',
      before: toMaybeItemDto(before),
      apply: (tx) => tx.maybeItem.delete({ where: { id: maybeItemId } }),
    });
  }

  /** Marks a maybe-shelf item consumed server-side (T-058) so a post-reconnect
   *  resync (sync-and-offline.md "Bootstrap & catch-up") reflects it instead of
   *  reverting the client's optimistic local flag back to unscheduled.
   *
   *  Standalone rather than folded into event creation because the client
   *  currently builds the scheduled event itself (icon, default time slot,
   *  `maybeMeta()`-derived location — see `frontend/src/state/verbs.ts`'s
   *  `schedule()`); a combined server-side "schedule" endpoint would need
   *  that derivation moved server-side too. If that ever gets built, this
   *  endpoint (and the frontend's separate `consumeMaybeItem` call) becomes
   *  redundant and should be removed in the same change. */
  async consume(tripId: string, maybeItemId: string, actorUserId: string): Promise<MaybeItem> {
    const before = await this.requireMaybeItem(tripId, maybeItemId);
    if (before.consumed) return toMaybeItemDto(before);

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.MAYBE_ITEM,
      entityId: maybeItemId,
      action: 'update',
      before: toMaybeItemDto(before),
      after: { consumed: true },
      apply: (tx) =>
        tx.maybeItem.update({
          where: { id: maybeItemId },
          data: { consumed: true, updatedBy: actorUserId },
        }),
    });
    return toMaybeItemDto(entity);
  }

  /** **The inverse of `consume`, and the reason it exists is undo.** Scheduling an idea
   *  consumes it; undoing that schedule puts the event back on the shelf **locally**, through
   *  the reducer's snapshot — but until this endpoint there was nothing to tell the server, so
   *  a resync re-consumed the idea and it vanished again. The client had the whole thing right
   *  except that its compensating write had nowhere to go.
   *
   *  A dedicated action rather than a `consumed` field on `update`, for two reasons. `update`
   *  is ADR-0116 §1's day-aim — *a pencil mark, not a schedule* — and folding a lifecycle flag
   *  into it muddles the two. And its `apply` writes `targetDate` unconditionally, so a patch
   *  carrying only `consumed` would silently clear the idea's day.
   *
   *  Idempotent, like `consume`: restoring an unconsumed idea is a no-op rather than a 409,
   *  because an undo can be replayed by an outbox flush that already succeeded. */
  async restore(tripId: string, maybeItemId: string, actorUserId: string): Promise<MaybeItem> {
    const before = await this.requireMaybeItem(tripId, maybeItemId);
    if (!before.consumed) return toMaybeItemDto(before);

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.MAYBE_ITEM,
      entityId: maybeItemId,
      action: 'update',
      before: toMaybeItemDto(before),
      after: { consumed: false },
      apply: (tx) =>
        tx.maybeItem.update({
          where: { id: maybeItemId },
          data: { consumed: false, updatedBy: actorUserId },
        }),
    });
    return toMaybeItemDto(entity);
  }

  /** Re-aim an idea at a day, or back to "someday" with `null` (ADR-0116 §1). A
   *  pencil mark, not a schedule — nothing about `consumed` changes, so the idea
   *  stays parked either way. (`restore` above is what changes it back.) */
  async update(
    tripId: string,
    maybeItemId: string,
    input: UpdateMaybeItemInput,
    actorUserId: string,
  ): Promise<MaybeItem> {
    const before = await this.requireMaybeItem(tripId, maybeItemId);
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: ENTITY_TYPE.MAYBE_ITEM,
      entityId: maybeItemId,
      action: 'update',
      before: toMaybeItemDto(before),
      after: input,
      apply: (tx) =>
        tx.maybeItem.update({
          where: { id: maybeItemId },
          data: { targetDate: input.targetDate ?? null, updatedBy: actorUserId },
        }),
    });
    return toMaybeItemDto(entity);
  }

  private async requireMaybeItem(tripId: string, maybeItemId: string): Promise<PrismaMaybeItem> {
    const item = await this.prisma.maybeItem.findFirst({ where: { id: maybeItemId, tripId } });
    if (!item) throw new NotFoundException('Maybe item not found');
    return item;
  }
}
