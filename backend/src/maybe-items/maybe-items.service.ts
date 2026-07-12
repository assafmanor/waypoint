import { Injectable, NotFoundException } from '@nestjs/common';
import type { MaybeItem as PrismaMaybeItem } from '@prisma/client';
import type { MaybeItem } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { toMaybeItemDto } from '../trips/trips.mapper';

@Injectable()
export class MaybeItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  /** Marks a maybe-shelf item consumed server-side (T-058) so a post-reconnect
   *  resync (sync-and-offline.md "Bootstrap & catch-up") reflects it instead of
   *  reverting the client's optimistic local flag back to unscheduled. */
  async consume(tripId: string, maybeItemId: string, actorUserId: string): Promise<MaybeItem> {
    const before = await this.requireMaybeItem(tripId, maybeItemId);
    if (before.consumed) return toMaybeItemDto(before);

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'maybeItem',
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

  private async requireMaybeItem(tripId: string, maybeItemId: string): Promise<PrismaMaybeItem> {
    const item = await this.prisma.maybeItem.findFirst({ where: { id: maybeItemId, tripId } });
    if (!item) throw new NotFoundException('Maybe item not found');
    return item;
  }
}
