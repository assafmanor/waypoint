import 'reflect-metadata';
import { afterAll, describe, expect, it } from 'vitest';
import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipGuard } from './membership.guard';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const MEMBER_USER = 'u-assaf';
const NON_MEMBER_USER = 'u-noam';
const SEEDED_TRIP = 'trip-japan-26';

function contextFor(params: Record<string, string>, user?: { userId: string; email: string }) {
  const req = { params, user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('MembershipGuard', () => {
  const prisma = new PrismaService();
  const guard = new MembershipGuard(prisma);

  afterAll(async () => prisma.$disconnect());

  it('throws Unauthorized when there is no principal on the request', async () => {
    const ctx = contextFor({ tripId: SEEDED_TRIP }, undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws NotFound (not Forbidden) when the caller has no membership', async () => {
    const ctx = contextFor(
      { tripId: SEEDED_TRIP },
      { userId: NON_MEMBER_USER, email: 'noam@example.com' },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('allows a caller who is a member of the trip', async () => {
    const ctx = contextFor(
      { tripId: SEEDED_TRIP },
      { userId: MEMBER_USER, email: 'assaf@example.com' },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
