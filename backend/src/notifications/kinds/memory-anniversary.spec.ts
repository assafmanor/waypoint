import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND, type TripRecap } from '@waypoint/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { DEDUP, NOTIFY_PREF, type DueInput, type TripZones } from '../notification-kind';
import { memoryAnniversaryPayload, yearsAgoExactly } from '../notify-copy';
import {
  ANNIVERSARY_HOUR,
  anniversaryCandidates,
  memoryAnniversaryKind,
} from './memory-anniversary.kind';

const HOUR = 60 * 60 * 1000;
/** 06:00 UTC = 09:00 in Tel Aviv (IDT), a year to the day after Japan's first day. */
const AT9 = Date.parse('2027-09-23T06:00:00Z');

interface TripRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}
const JAPAN: TripRow = {
  id: 'jp',
  name: 'יפן ׳26',
  startDate: '2026-09-23',
  endDate: '2026-10-02',
};

function fakePrisma(trips: TripRow[], members: Record<string, string[]>) {
  const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
  return {
    trip: {
      findMany: ({ where }: { where: { startDate?: { in: Date[] }; id?: { in: string[] } } }) => {
        const rows = where.startDate
          ? trips.filter((trip) =>
              where.startDate!.in.some((date) => date.getTime() === day(trip.startDate).getTime()),
            )
          : trips.filter((trip) => where.id!.in.includes(trip.id));
        return Promise.resolve(
          rows.map((trip) => ({
            ...trip,
            startDate: day(trip.startDate),
            endDate: day(trip.endDate),
            timezone: 'Asia/Tokyo',
          })),
        );
      },
    },
    membership: {
      findMany: ({ where }: { where: { tripId: { in: string[] } } }) =>
        Promise.resolve(
          where.tripId.in.flatMap((tripId) =>
            (members[tripId] ?? []).map((userId) => ({ tripId, userId })),
          ),
        ),
    },
  } as unknown as PrismaService;
}

/** Home is Tel Aviv: the trip came back, so the last segment is where the morning is read. */
const zonesFor = (): Promise<TripZones> =>
  Promise.resolve({ crossings: [], primaryZone: 'Asia/Jerusalem', bookings: [], places: [] });

const recapNaming = (place: string | undefined) => (): Promise<TripRecap> =>
  Promise.resolve({ memoryPlace: place } as TripRecap);

/** `null` is a recap with no place that happened. */
const input = (
  prisma: PrismaService,
  nowMs: number,
  place: string | null = 'אסקוסה',
): DueInput => ({
  prisma,
  nowMs,
  zonesFor,
  recapFor: recapNaming(place ?? undefined),
});

describe('memory.anniversary declares its policy (ADR-0239 §8)', () => {
  it('is not time-critical, keys on the aimed-at hour, and has its own switch', () => {
    expect(memoryAnniversaryKind.timeCritical).toBe(false);
    expect(memoryAnniversaryKind.dedup).toBe(DEDUP.BY_INSTANT);
    expect(memoryAnniversaryKind.pref).toBe(NOTIFY_PREF.MEMORIES);
  });
});

describe('memory.anniversary is due', () => {
  it('at the morning hour on the day, to every member, naming the recap place', async () => {
    const prisma = fakePrisma([JAPAN], { jp: ['u1', 'u2'] });
    const sends = await memoryAnniversaryKind.due(input(prisma, AT9));
    expect(sends.map((send) => send.userId)).toEqual(['u1', 'u2']);
    expect(sends[0]).toMatchObject({
      tripId: 'jp',
      subjectId: 'jp',
      kind: NOTIFICATION_KIND.MEMORY_ANNIVERSARY,
      aimedAtMs: AT9,
      payload: { title: 'יפן ׳26', body: `${yearsAgoExactly(1)} · אסקוסה`, url: '/?trip=jp' },
    });
  });

  it('aims every minute of the hour at the hour, so the ledger sends it once', async () => {
    const prisma = fakePrisma([JAPAN], { jp: ['u1'] });
    const later = await memoryAnniversaryKind.due(input(prisma, AT9 + 37 * 60_000));
    expect(later[0].aimedAtMs).toBe(AT9);
  });

  it('is silent outside the hour, on another day, and with no place that happened', async () => {
    const prisma = fakePrisma([JAPAN], { jp: ['u1'] });
    expect(await memoryAnniversaryKind.due(input(prisma, AT9 - HOUR))).toEqual([]);
    expect(await memoryAnniversaryKind.due(input(prisma, AT9 + 24 * HOUR))).toEqual([]);
    expect(await memoryAnniversaryKind.due(input(prisma, AT9, null))).toEqual([]);
  });

  it('is silent for a trip that has not ended, however long it runs', async () => {
    const long = { ...JAPAN, endDate: '2027-12-01' };
    expect(await memoryAnniversaryKind.due(input(fakePrisma([long], { jp: ['u1'] }), AT9))).toEqual(
      [],
    );
  });

  it('sends two trips that began on one day as two pushes', async () => {
    const other = {
      ...JAPAN,
      id: 'is',
      name: 'איסלנד',
      startDate: '2025-09-23',
      endDate: '2025-09-27',
    };
    const sends = await memoryAnniversaryKind.due(
      input(fakePrisma([JAPAN, other], { jp: ['u1'], is: ['u1'] }), AT9),
    );
    expect(sends.map((send) => [send.tripId, send.payload.body])).toEqual([
      ['jp', `${yearsAgoExactly(1)} · אסקוסה`],
      ['is', `${yearsAgoExactly(2)} · אסקוסה`],
    ]);
  });

  it('fires a February 29 trip on February 28 in a common year', async () => {
    const leap = { ...JAPAN, startDate: '2028-02-29', endDate: '2028-03-04' };
    const at = Date.parse('2029-02-28T07:00:00Z'); // 09:00 in Tel Aviv (IST)
    expect(ANNIVERSARY_HOUR).toBe(9);
    const sends = await memoryAnniversaryKind.due(input(fakePrisma([leap], { jp: ['u1'] }), at));
    expect(sends).toHaveLength(1);
  });
});

describe('anniversaryCandidates', () => {
  it('names a day either side, in each past year, and only real dates', () => {
    const keys = anniversaryCandidates(Date.parse('2027-03-01T12:00:00Z')).map((date) =>
      date.toISOString().slice(0, 10),
    );
    expect(keys).toEqual(expect.arrayContaining(['2026-02-28', '2026-03-01', '2026-03-02']));
    expect(keys).toContain('2024-02-29');
    expect(keys).not.toContain('2027-03-01');
    expect(keys.every((key) => !key.startsWith('2025-02-29'))).toBe(true);
  });
});

describe('the anniversary copy (ADR-0241 §7)', () => {
  it('climbs the year ladder with the dual as a word', () => {
    expect([1, 2, 3].map(yearsAgoExactly)).toEqual([
      'לפני שנה בדיוק',
      'לפני שנתיים בדיוק',
      'לפני 3 שנים בדיוק',
    ]);
  });

  it('carries no question, no exclamation and no em dash', () => {
    const { title, body } = memoryAnniversaryPayload({
      tripId: 't',
      tripName: 'יפן ׳26',
      years: 1,
      place: 'אסקוסה',
    });
    expect(`${title} ${body}`).not.toMatch(/[?!—]/);
  });
});
