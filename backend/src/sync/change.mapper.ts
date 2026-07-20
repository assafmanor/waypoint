import type { Change as PrismaChange } from '@prisma/client';
import type { Change as SharedChange } from '@waypoint/shared';

export const toChangeDto = (c: PrismaChange): SharedChange => ({
  id: c.id,
  seq: c.seq.toString(), // BigInt serialized as string (ADR-0019)
  tripId: c.tripId,
  actorUserId: c.actorUserId,
  // The column is a plain string; the backend only ever writes ENTITY_TYPE values
  // (change.service), so it maps cleanly onto the shared union (ADR-0094).
  entityType: c.entityType as SharedChange['entityType'],
  entityId: c.entityId,
  action: c.action,
  before: (c.before as Record<string, unknown> | null) ?? undefined,
  after: (c.after as Record<string, unknown> | null) ?? undefined,
  createdAt: c.createdAt.toISOString(),
});
