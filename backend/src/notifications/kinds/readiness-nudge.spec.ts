import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { DEDUP, NOTIFY_PREF, type DueInput, type TripZones } from '../notification-kind';
import { MILESTONES, NUDGE_HOUR, readinessNudgeKind } from './readiness-nudge.kind';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const utc = (iso: string) => Date.parse(iso);

/** 07:00 UTC = 10:00 in Tel Aviv — the nudge's hour. */
const AT10 = utc('2026-08-01T07:00:00Z');
/** Fourteen days after that morning, so `AT10` is the T-14 milestone. */
const START = '2026-08-15';

/** The two `trip.findMany` shapes this kind's tick produces. */
type TripWhere = { startDate: { gte: Date; lte: Date } } | { id: { in: string[] } };

interface Fixture {
  events?: unknown[];
  bookings?: unknown[];
  places?: unknown[];
  documents?: unknown[];
  members?: string[];
  startDate?: string;
  endDate?: string;
}

/**
 * A Prisma stand-in for the one query shape this kind sends plus the four per-trip loads.
 *
 * It honours the `startDate` range, because that range is what keeps the loop inverted: a
 * fake that returned the trip regardless would let the window be deleted without a failure.
 */
function fakePrisma(fx: Fixture = {}) {
  const startDate = new Date(`${fx.startDate ?? START}T00:00:00.000Z`);
  const endDate = new Date(`${fx.endDate ?? '2026-08-25'}T00:00:00.000Z`);
  const trip = {
    id: 'trip-1',
    startDate,
    endDate,
    timezone: 'Asia/Jerusalem',
    destination: 'Japan',
    destinationGooglePlaceId: null,
    destinationCountryCode: 'JP',
  };
  const members = fx.members ?? ['u-assaf', 'u-noam'];
  const calls: string[] = [];

  const prisma = {
    trip: {
      // **Two callers, two clause shapes.** The kind asks by `startDate` range; `tripAudience`
      // asks by `id`. A fake that ignored the difference would answer the range query for a
      // trip outside the window, letting that window be deleted with nothing failing.
      findMany: ({ where }: { where: TripWhere }) => {
        if ('id' in where) {
          calls.push('audience');
          return Promise.resolve(where.id.in.includes(trip.id) ? [trip] : []);
        }
        calls.push('trips');
        const inRange =
          startDate.getTime() >= where.startDate.gte.getTime() &&
          startDate.getTime() <= where.startDate.lte.getTime();
        return Promise.resolve(inRange ? [trip] : []);
      },
      findUniqueOrThrow: () => Promise.resolve({ timezone: trip.timezone }),
    },
    membership: {
      findMany: () => Promise.resolve(members.map((userId) => ({ tripId: 'trip-1', userId }))),
    },
    event: {
      findMany: () => {
        calls.push('events');
        return Promise.resolve(fx.events ?? []);
      },
    },
    booking: { findMany: () => Promise.resolve(fx.bookings ?? []) },
    place: { findMany: () => Promise.resolve(fx.places ?? []) },
    document: { findMany: () => Promise.resolve(fx.documents ?? []) },
  } as unknown as PrismaService;

  return { prisma, calls };
}

/**
 * **A trip with all five checks satisfied**, which is the only way to exercise the "say
 * nothing" branch. Each field below answers exactly one check, and the destination is
 * reached by ZONE (the place carries the trip's own timezone), which is `reachesDestination`'s
 * location route rather than its name fallback.
 */
const READY_TRIP: Fixture = {
  startDate: START,
  endDate: '2026-08-16',
  members: ['u-assaf', 'u-noam'],
  // `documents`: one passport per traveller.
  documents: [
    { id: 'd1', type: 'passport' },
    { id: 'd2', type: 'passport' },
  ],
  // `flights`: a leg INTO the destination and a leg OUT of it, read off the bookings' places.
  bookings: [
    { id: 'b-out', tripId: 'trip-1', type: 'flight', toPlaceId: 'p-dest', fromPlaceId: 'p-home' },
    { id: 'b-ret', tripId: 'trip-1', type: 'flight', fromPlaceId: 'p-dest', toPlaceId: 'p-home' },
  ],
  places: [
    { id: 'p-dest', tripId: 'trip-1', name: 'Tel Aviv', timezone: 'Asia/Jerusalem' },
    { id: 'p-home', tripId: 'trip-1', name: 'Elsewhere', timezone: 'Europe/London' },
  ],
  // `lodging`: a stay covering the trip's one night (15th→16th). `itinerary`: both days have
  // an event, so there are no empty days.
  events: [
    {
      id: 'ev-stay',
      tripId: 'trip-1',
      date: '2026-08-15',
      endDate: '2026-08-16',
      category: 'lodging',
      kind: 'hard',
      status: 'planned',
    },
    {
      id: 'ev-day2',
      tripId: 'trip-1',
      date: '2026-08-16',
      category: 'food',
      kind: 'soft',
      status: 'planned',
    },
  ],
};

const zonesFor = (): Promise<TripZones> =>
  Promise.resolve({ crossings: [], primaryZone: 'Asia/Jerusalem' });

const input = (prisma: PrismaService, nowMs: number): DueInput => ({ prisma, nowMs, zonesFor });

describe('readiness.nudge declares its policy', () => {
  it('is not timeCritical — an absence is never worth breaking quiet hours for', () => {
    expect(readinessNudgeKind.timeCritical).toBe(false);
  });

  it('rides notifyTasks, because ADR-0190 made a readiness check a task row', () => {
    // The alternative was a third `User` column for a thing the person already has a
    // control for. ADR-0198 §6 stays at two switches.
    expect(readinessNudgeKind.pref).toBe(NOTIFY_PREF.TASKS);
    expect(readinessNudgeKind.dedup).toBe(DEDUP.BY_INSTANT);
  });
});

describe('readiness.nudge', () => {
  it('fires at 10:00 on the T-14 milestone, to every member', async () => {
    const { prisma } = fakePrisma();
    const sends = await readinessNudgeKind.due(input(prisma, AT10));

    expect(sends.map((s) => s.userId).sort()).toEqual(['u-assaf', 'u-noam']);
    expect(sends[0].kind).toBe(NOTIFICATION_KIND.READINESS_NUDGE);
    expect(sends[0].payload.title).toBe('שבועיים לטיול');
  });

  it('fires at no other hour', async () => {
    for (const offset of [-3, -1, 1, 5]) {
      const { prisma } = fakePrisma();
      expect(await readinessNudgeKind.due(input(prisma, AT10 + offset * HOUR))).toEqual([]);
    }
  });

  it('aims at 10:00 itself, so all sixty minutes of the hour are ONE claim', async () => {
    const aims = new Set<number>();
    for (const minute of [0, 11, 30, 59]) {
      const { prisma } = fakePrisma();
      const sends = await readinessNudgeKind.due(input(prisma, AT10 + minute * 60_000));
      expect(sends).toHaveLength(2);
      for (const send of sends) aims.add(send.aimedAtMs);
    }
    expect([...aims]).toEqual([AT10]);
  });

  it.each([
    [14, 'שבועיים לטיול'],
    [7, 'שבוע לטיול'],
    [2, 'יומיים לטיול'],
  ])('names the T-%i milestone in Hebrew, with its dual form', async (days, title) => {
    // `שבועיים` and `יומיים` are duals, which no `${n} ימים` template can produce — the
    // reason the labels are a lookup rather than arithmetic.
    const { prisma } = fakePrisma({ startDate: START });
    const sends = await readinessNudgeKind.due(input(prisma, AT10 + (14 - days) * DAY));
    expect(sends[0]?.payload.title).toBe(title);
  });

  it('says NOTHING on a day that is not a milestone', async () => {
    // T-13, T-10, T-3: inside the query's window and deliberately not a milestone, which is
    // what makes this three sends over a run-up rather than a countdown.
    for (const days of [13, 10, 3]) {
      const { prisma } = fakePrisma();
      expect(await readinessNudgeKind.due(input(prisma, AT10 + (14 - days) * DAY))).toEqual([]);
    }
  });

  it('names ONLY what is still missing', async () => {
    // Two members satisfies `group`; everything else is open on an empty trip.
    const { prisma } = fakePrisma();
    const sends = await readinessNudgeKind.due(input(prisma, AT10));

    const body = sends[0].payload.body;
    expect(body).toContain('חסרים');
    expect(body).toContain('טיסות');
    expect(body).toContain('לינה');
    // `group` is satisfied by the second member, so it must not be named.
    expect(body).not.toContain("החבר'ה");
  });

  it('names the GROUP check on a trip nobody has joined yet', async () => {
    const { prisma } = fakePrisma({ members: ['solo'] });
    const sends = await readinessNudgeKind.due(input(prisma, AT10));
    expect(sends[0].payload.body).toContain("החבר'ה");
  });

  it('says NOTHING AT ALL when every check is satisfied', async () => {
    // A send whose content is congratulation is the app talking about itself — so the "all
    // done" branch must produce no send rather than a cheerful one. Fixture: a two-night
    // trip with both flight legs, a bed for its one night, an event on each day, and a
    // passport per traveller.
    const { prisma } = fakePrisma(READY_TRIP);
    expect(await readinessNudgeKind.due(input(prisma, AT10))).toEqual([]);
  });

  it('goes to the tasks surface, not to a second inbox (ADR-0004)', async () => {
    const { prisma } = fakePrisma();
    const sends = await readinessNudgeKind.due(input(prisma, AT10));
    // The trip's readiness is a SET of gaps, so this opens the list and no single row.
    expect(sends[0].payload.url).toBe('/?trip=trip-1&tab=index&focus=tasks');
  });

  it('keys each milestone apart, so T-14 cannot suppress T-7', async () => {
    const { prisma } = fakePrisma();
    const at14 = await readinessNudgeKind.due(input(prisma, AT10));
    const { prisma: p2 } = fakePrisma();
    const at7 = await readinessNudgeKind.due(input(p2, AT10 + 7 * DAY));

    expect(at14[0].subjectId).toBe('trip-1:t-14');
    expect(at7[0].subjectId).toBe('trip-1:t-7');
  });

  it('loads a trip’s data only for the trips its range returned', async () => {
    // The inverted loop: a trip whose start is outside every milestone window costs one
    // indexed query and no per-trip load at all.
    const { prisma, calls } = fakePrisma({ startDate: '2027-01-01' });
    expect(await readinessNudgeKind.due(input(prisma, AT10))).toEqual([]);
    expect(calls).toEqual(['trips']);
  });

  it('declares its milestones as the three the ADR chose', () => {
    expect([...MILESTONES]).toEqual([14, 7, 2]);
    expect(NUDGE_HOUR).toBe(10);
  });
});
