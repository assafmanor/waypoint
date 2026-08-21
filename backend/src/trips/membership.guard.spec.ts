import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipGuard } from './membership.guard';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const MEMBER_USER = 'u-assaf';
const SEEDED_TRIP = 'trip-japan-26';

/**
 * **The outsider is created here, not borrowed from the seed.**
 *
 * This used to be `u-noam`, which worked only because the seeded trip happened to have one
 * membership — and stopped working the day the seed gave the demo trip its real five-person
 * roster (notifications phase A, which needs a group to fan out to). The non-membership was
 * incidental to the fixture and load-bearing for the test, which is the coupling that broke.
 *
 * So the premise is stated instead of inherited: a real user row, no membership anywhere.
 * Upserted so a re-run is safe, and removed afterwards so the seeded database is left as it
 * was found.
 */
const NON_MEMBER_USER = 'u-guard-outsider';
const NON_MEMBER_EMAIL = 'guard-outsider@example.test';

function contextFor(params: Record<string, string>, user?: { userId: string; email: string }) {
  const req = { params, user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('MembershipGuard', () => {
  const prisma = new PrismaService();
  const guard = new MembershipGuard(prisma);

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: NON_MEMBER_USER },
      create: { id: NON_MEMBER_USER, email: NON_MEMBER_EMAIL, displayName: 'לא חבר' },
      update: {},
    });
    // Belt and braces: if a previous run left one behind, the premise would be false and the
    // test would pass for the wrong reason — the failure mode this whole comment is about.
    await prisma.membership.deleteMany({ where: { userId: NON_MEMBER_USER } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: NON_MEMBER_USER } });
    await prisma.$disconnect();
  });

  it('throws Unauthorized when there is no principal on the request', async () => {
    const ctx = contextFor({ tripId: SEEDED_TRIP }, undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws NotFound (not Forbidden) when the caller has no membership', async () => {
    const ctx = contextFor(
      { tripId: SEEDED_TRIP },
      { userId: NON_MEMBER_USER, email: NON_MEMBER_EMAIL },
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
