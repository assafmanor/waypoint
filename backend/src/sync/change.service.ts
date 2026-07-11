import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Change, ChangeAction } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toChangeDto } from './change.mapper';
import { SyncGateway } from './sync.gateway';

export interface MutateInput<T> {
  tripId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: ChangeAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  apply: (tx: Prisma.TransactionClient) => Promise<T>;
}

export interface MutateResult<T> {
  entity: T;
  change: Change;
}

/**
 * The single choke point for data-plane mutations (ADR-0019): entity write + Change
 * insert commit in one transaction, and the WS broadcast fires only after commit.
 */
@Injectable()
export class ChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SyncGateway,
  ) {}

  async mutate<T>(input: MutateInput<T>): Promise<MutateResult<T>> {
    const [entity, changeRow] = await this.prisma.$transaction(async (tx) => {
      const entity = await input.apply(tx);
      const changeRow = await tx.change.create({
        data: {
          tripId: input.tripId,
          actorUserId: input.actorUserId,
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          before: input.before as Prisma.InputJsonValue | undefined,
          after: input.after as Prisma.InputJsonValue | undefined,
        },
      });
      return [entity, changeRow] as const;
    });

    const change = toChangeDto(changeRow);
    this.gateway.broadcast(input.tripId, change);
    return { entity, change };
  }
}
