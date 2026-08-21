import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { notifiableTaskWhere, tripAudience } from './trip-audience';

const utc = (iso: string) => Date.parse(iso);
const DAY = 24 * 60 * 60 * 1000;

function fake(
  trips: { id: string; endDate: Date; timezone: string }[],
  members: { tripId: string; userId: string }[],
) {
  const queries: string[] = [];
  const prisma = {
    trip: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) => {
        queries.push('trip');
        return Promise.resolve(trips.filter((t) => where.id.in.includes(t.id)));
      },
    },
    membership: {
      findMany: ({ where }: { where: { tripId: { in: string[] } } }) => {
        queries.push('membership');
        return Promise.resolve(members.filter((m) => where.tripId.in.includes(m.tripId)));
      },
    },
  } as unknown as PrismaService;
  return { prisma, queries };
}

const TRIPS = [
  { id: 'trip-1', endDate: new Date(utc('2026-08-30T00:00:00Z')), timezone: 'Asia/Jerusalem' },
  { id: 'trip-2', endDate: new Date(utc('2026-08-01T00:00:00Z')), timezone: 'Asia/Tokyo' },
];
const MEMBERS = [
  { tripId: 'trip-1', userId: 'u-assaf' },
  { tripId: 'trip-1', userId: 'u-noam' },
  { tripId: 'trip-2', userId: 'u-assaf' },
];
const NOW = utc('2026-08-21T12:00:00Z');

describe('notifiableTaskWhere', () => {
  it('is open-only, which is what makes the sweep’s index scan cheap', () => {
    // `status` LEADS the `(status, dueAt)` index precisely because most rows are settled, so
    // this clause is load-bearing for performance and not only for correctness.
    expect(notifiableTaskWhere).toEqual({ status: 'open' });
  });
});

describe('tripAudience', () => {
  it('resolves the whole tick in TWO queries, whatever the number of tasks', async () => {
    // The N+1 this helper exists to prevent — the same one `spentToday` was rewritten for.
    const { prisma, queries } = fake(TRIPS, MEMBERS);
    await tripAudience(
      prisma,
      Array.from({ length: 50 }, () => ({ tripId: 'trip-1' })),
      NOW,
    );
    expect(queries).toEqual(['trip', 'membership']);
  });

  it('asks nothing at all when there are no tasks', async () => {
    const { prisma, queries } = fake(TRIPS, MEMBERS);
    const audience = await tripAudience(prisma, [], NOW);
    expect(queries).toEqual([]);
    // And answers safely rather than throwing: no trip is live, nobody is a recipient.
    expect(audience.isLive('trip-1')).toBe(false);
    expect(audience.recipients({ tripId: 'trip-1', assigneeUserId: null })).toEqual([]);
  });

  it('deduplicates the trip ids it asks about', async () => {
    const { prisma } = fake(TRIPS, MEMBERS);
    const audience = await tripAudience(
      prisma,
      [{ tripId: 'trip-1' }, { tripId: 'trip-1' }, { tripId: 'trip-2' }],
      NOW,
    );
    expect(audience.isLive('trip-1')).toBe(true);
    expect(audience.isLive('trip-2')).toBe(false);
  });

  describe('isLive', () => {
    it('is true for a trip that has not STARTED — the owner’s correction', async () => {
      // Pre-trip is where task deadlines actually live, and the draft ADR's "inside the
      // access window" would have excluded exactly that run-up.
      const { prisma } = fake(
        [{ id: 't', endDate: new Date(utc('2027-06-01T00:00:00Z')), timezone: 'UTC' }],
        [{ tripId: 't', userId: 'u' }],
      );
      const audience = await tripAudience(prisma, [{ tripId: 't' }], NOW);
      expect(audience.isLive('t')).toBe(true);
    });

    it('stays live through the whole of the LAST day, not until midnight UTC', async () => {
      // `endDate` is a `@db.Date`, so it lands at 00:00 UTC of the final day. Comparing
      // against it directly would go dark at midnight UTC in the middle of that day for
      // anybody east of Greenwich.
      const endDate = new Date(utc('2026-08-21T00:00:00Z'));
      const { prisma } = fake(
        [{ id: 't', endDate, timezone: 'UTC' }],
        [{ tripId: 't', userId: 'u' }],
      );
      const audience = await tripAudience(prisma, [{ tripId: 't' }], utc('2026-08-21T22:00:00Z'));
      expect(audience.isLive('t')).toBe(true);

      const after = await tripAudience(prisma, [{ tripId: 't' }], endDate.getTime() + DAY + 60_000);
      expect(after.isLive('t')).toBe(false);
    });

    it('treats a trip the query did not return as not live', async () => {
      const { prisma } = fake([], []);
      const audience = await tripAudience(prisma, [{ tripId: 'ghost' }], NOW);
      expect(audience.isLive('ghost')).toBe(false);
    });
  });

  describe('recipients', () => {
    it('is the whole group when the task is nobody’s in particular', async () => {
      // "One of us" is a promise the group made, so the group hears it (ADR-0198 §2).
      const { prisma } = fake(TRIPS, MEMBERS);
      const audience = await tripAudience(prisma, [{ tripId: 'trip-1' }], NOW);
      expect(audience.recipients({ tripId: 'trip-1', assigneeUserId: null }).sort()).toEqual([
        'u-assaf',
        'u-noam',
      ]);
    });

    it('is the assignee alone when there is one', async () => {
      const { prisma } = fake(TRIPS, MEMBERS);
      const audience = await tripAudience(prisma, [{ tripId: 'trip-1' }], NOW);
      expect(audience.recipients({ tripId: 'trip-1', assigneeUserId: 'u-noam' })).toEqual([
        'u-noam',
      ]);
    });

    it('is EMPTY when the assignee has left the trip, and the group does not inherit it', async () => {
      // Membership is read at send time, so removal takes effect on the next tick with no
      // cancellation step (ADR-0197 §2.4) — and an addressed send with nobody at the address
      // is not a send to everybody.
      const { prisma } = fake(TRIPS, MEMBERS);
      const audience = await tripAudience(prisma, [{ tripId: 'trip-1' }], NOW);
      expect(audience.recipients({ tripId: 'trip-1', assigneeUserId: 'u-gone' })).toEqual([]);
    });
  });

  it('answers members and the primary zone per trip', async () => {
    const { prisma } = fake(TRIPS, MEMBERS);
    const audience = await tripAudience(prisma, [{ tripId: 'trip-1' }, { tripId: 'trip-2' }], NOW);
    expect(audience.members('trip-1').sort()).toEqual(['u-assaf', 'u-noam']);
    expect(audience.members('trip-2')).toEqual(['u-assaf']);
    expect(audience.primaryZone('trip-2')).toBe('Asia/Tokyo');
    // A trip nobody joined, and a trip that does not exist, both answer with no members
    // rather than throwing — a sweep must not die on a row it did not expect.
    expect(audience.members('nope')).toEqual([]);
    expect(audience.primaryZone('nope')).toBe('UTC');
  });
});
