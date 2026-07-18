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

/** One entity's change descriptor within a multi-entity mutation. */
export interface ChangeOp {
  entityType: string;
  entityId: string;
  action: ChangeAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface MutateManyInput<T> {
  tripId: string;
  actorUserId: string;
  // Applies the writes and returns the primary entity plus one op per Change to
  // record. Ops are inserted (and broadcast) in array order — put dependencies
  // first (e.g. the booking before its event).
  apply: (tx: Prisma.TransactionClient) => Promise<{ entity: T; ops: ChangeOp[] }>;
}

export interface MutateManyResult<T> {
  entity: T;
  changes: Change[];
}

/**
 * Serializes all writes for a trip on a per-trip Postgres transaction advisory
 * lock (ADR-0067). Held until the enclosing transaction commits/rolls back, so
 * concurrent mutations of the same trip queue instead of interleaving — which
 * makes `Change.seq` allocation order equal commit order and closes B-01 (a
 * higher `seq` becoming visible before a lower one commits, letting a client's
 * cursor skip the lower change forever). `hashtext` maps the cuid `tripId` to
 * the `bigint` the lock API takes; cross-trip key collisions only ever serialize
 * two unrelated trips briefly (harmless at this scale). Different trips never
 * contend.
 */
async function lockTrip(tx: Prisma.TransactionClient, tripId: string): Promise<void> {
  // Wrapped in a subselect: the driver adapter can't map the `void` return of
  // `pg_advisory_xact_lock` directly, and Postgres still evaluates the volatile
  // lock call inside the scanned subquery.
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${tripId}))) _lock`;
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
      await lockTrip(tx, input.tripId);
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

  /**
   * Like `mutate()`, but records several `Change` rows for one atomic write (ADR-0048):
   * the entity write plus every op's Change commit in a single transaction, and the WS
   * broadcasts fire in order only after commit. Used where one save touches multiple
   * entities — e.g. auto-creating an Event alongside its Booking (ADR-0047 §1).
   */
  async mutateMany<T>(input: MutateManyInput<T>): Promise<MutateManyResult<T>> {
    const [entity, changeRows] = await this.prisma.$transaction(async (tx) => {
      await lockTrip(tx, input.tripId);
      const { entity, ops } = await input.apply(tx);
      const changeRows = [];
      for (const op of ops) {
        changeRows.push(
          await tx.change.create({
            data: {
              tripId: input.tripId,
              actorUserId: input.actorUserId,
              entityType: op.entityType,
              entityId: op.entityId,
              action: op.action,
              before: op.before as Prisma.InputJsonValue | undefined,
              after: op.after as Prisma.InputJsonValue | undefined,
            },
          }),
        );
      }
      return [entity, changeRows] as const;
    });

    const changes = changeRows.map(toChangeDto);
    for (const change of changes) this.gateway.broadcast(input.tripId, change);
    return { entity, changes };
  }

  /**
   * Fan out a change that is intentionally NOT persisted. Used only for trip
   * deletion (ADR-0039): the trip's own `Change` feed is cascade-deleted with
   * the trip (`onDelete: Cascade`), so there is nothing durable to log against —
   * but connected members must still be told live that the trip is gone so
   * their client can leave it. Everything else goes through `mutate()`.
   */
  broadcastEphemeral(tripId: string, change: Change): void {
    this.gateway.broadcast(tripId, change);
  }
}
