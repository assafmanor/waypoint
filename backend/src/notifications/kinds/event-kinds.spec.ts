import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { DEDUP, NOTIFY_PREF, type DueInput, type TripZones } from '../notification-kind';
import { eventSoonKind } from './event-soon.kind';
import { spanEdgeKind } from './span-edge.kind';
import { TOMORROW_HOUR, tripTomorrowKind } from './trip-tomorrow.kind';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const utc = (iso: string) => Date.parse(iso);

interface EventLike {
  id: string;
  tripId: string;
  title: string;
  date: Date;
  endDate: Date | null;
  category: string | null;
  icon: string | null;
  kind: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  startWindowEnd: Date | null;
  endWindowStart: Date | null;
  displayTimezone: string | null;
}

/** A hard, timed, single-day `food` event — the shape that fires `event.hard.soon` at a 30
 *  minute lead. Each test states only its own deviation. */
function ev(over: Partial<EventLike> = {}): EventLike {
  return {
    id: 'ev-1',
    tripId: 'trip-1',
    title: 'Ichiran Ramen',
    date: new Date(utc('2026-08-21T00:00:00Z')),
    endDate: null,
    category: 'food',
    icon: null,
    kind: 'hard',
    status: 'planned',
    startsAt: new Date(utc('2026-08-21T15:30:00Z')),
    endsAt: null,
    startWindowEnd: null,
    endWindowStart: null,
    displayTimezone: null,
    ...over,
  };
}

/**
 * A Prisma stand-in that honours the clauses the kinds actually send — `kind`, `status`, the
 * `startsAt` / `date` ranges, and `endDate: { not: null }`.
 *
 * Same design rule as phase A's fake, for the same reason it was worth stating there: a fake
 * looser than Prisma lets a query pass with its `kind: 'hard'` filter deleted, which is the
 * one filter ADR-0011 turns on.
 */
function fakePrisma(options: {
  events?: EventLike[];
  trips?: { id: string; name: string; startDate: Date; endDate: Date; timezone: string }[];
  members?: { tripId: string; userId: string }[];
}) {
  const events = options.events ?? [];
  const trips = options.trips ?? [
    {
      id: 'trip-1',
      name: 'יפן ׳26',
      startDate: new Date(utc('2026-08-19T00:00:00Z')),
      endDate: new Date(utc('2026-08-30T00:00:00Z')),
      timezone: 'Asia/Jerusalem',
    },
  ];
  const members = options.members ?? [
    { tripId: 'trip-1', userId: 'u-assaf' },
    { tripId: 'trip-1', userId: 'u-noam' },
  ];
  const queries: string[] = [];

  const inRange = (value: Date | null, range?: { gte?: Date; lte?: Date; not?: null }) => {
    if (!range) return true;
    if (range.not === null) return value !== null;
    if (value === null) return false;
    if (range.gte && value.getTime() < range.gte.getTime()) return false;
    if (range.lte && value.getTime() > range.lte.getTime()) return false;
    return true;
  };

  const prisma = {
    event: {
      findMany: ({
        where,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>;
        orderBy?: { startsAt: 'asc' };
        take?: number;
      }) => {
        queries.push('event.findMany');
        let rows = events.filter((e) => {
          if (where.kind !== undefined && e.kind !== where.kind) return false;
          if (where.status !== undefined && e.status !== where.status) return false;
          if (where.tripId !== undefined && e.tripId !== where.tripId) return false;
          if (where.date instanceof Date && e.date.getTime() !== where.date.getTime()) return false;
          if (
            where.date &&
            !(where.date instanceof Date) &&
            !inRange(e.date, where.date as never)
          ) {
            return false;
          }
          if (where.endDate !== undefined && !inRange(e.endDate, where.endDate as never)) {
            return false;
          }
          if (where.startsAt !== undefined && !inRange(e.startsAt, where.startsAt as never)) {
            return false;
          }
          return true;
        });
        if (orderBy) {
          rows = [...rows].sort((a, b) => (a.startsAt!.getTime() < b.startsAt!.getTime() ? -1 : 1));
        }
        return Promise.resolve(take ? rows.slice(0, take) : rows);
      },
    },
    trip: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        queries.push('trip.findMany');
        return Promise.resolve(
          trips.filter((t) => {
            const ids = (where.id as { in?: string[] } | undefined)?.in;
            if (ids && !ids.includes(t.id)) return false;
            if (where.startDate && !inRange(t.startDate, where.startDate as never)) return false;
            return true;
          }),
        );
      },
    },
    membership: {
      findMany: ({ where }: { where: { tripId: { in: string[] } } }) => {
        queries.push('membership.findMany');
        return Promise.resolve(members.filter((m) => where.tripId.in.includes(m.tripId)));
      },
    },
  } as unknown as PrismaService;
  return { prisma, queries };
}

const zonesFor =
  (zone = 'Asia/Jerusalem') =>
  (): Promise<TripZones> =>
    Promise.resolve({ crossings: [], primaryZone: zone });
const input = (prisma: PrismaService, nowMs: number, zone?: string): DueInput => ({
  prisma,
  nowMs,
  zonesFor: zonesFor(zone),
});

describe('the phase-B kinds declare their policy', () => {
  it('makes the two edge kinds timeCritical, and only those', () => {
    // The reason `timeCritical` exists at all: a 05:30 departure has to ring at 03:30 or the
    // feature is decorative (ADR-0197 §5). `trip.tomorrow` fires at 19:00, which is outside
    // the quiet window by construction and needs no exemption.
    expect(eventSoonKind.timeCritical).toBe(true);
    expect(spanEdgeKind.timeCritical).toBe(true);
    expect(tripTomorrowKind.timeCritical).toBe(false);
  });

  it('puts all three behind notifyObligations', () => {
    // A separate switch from `notifyTasks`: one is what a person wrote down, the other is what
    // the itinerary already committed them to, and somebody may want the flight and not the
    // chores (ADR-0198 §6).
    for (const kind of [eventSoonKind, spanEdgeKind, tripTomorrowKind]) {
      expect(kind.pref).toBe(NOTIFY_PREF.OBLIGATIONS);
      expect(kind.dedup).toBe(DEDUP.BY_INSTANT);
    }
  });
});

describe('event.hard.soon', () => {
  // 15:00 UTC = 18:00 Tel Aviv. A `food` event at 15:30 UTC has a 30-minute lead, so now is
  // exactly its instant.
  const now = utc('2026-08-21T15:00:00Z');

  it('fires the category’s lead ahead, to the whole group', () => {
    return (async () => {
      const { prisma } = fakePrisma({ events: [ev()] });
      const sends = await eventSoonKind.due(input(prisma, now));
      // Nobody is assigned a flight: an event is always the whole group's.
      expect(sends.map((s) => s.userId).sort()).toEqual(['u-assaf', 'u-noam']);
      expect(sends[0].kind).toBe(NOTIFICATION_KIND.EVENT_HARD_SOON);
      expect(sends[0].aimedAtMs).toBe(utc('2026-08-21T15:00:00Z'));
    })();
  });

  it('NEVER fires for a soft event — the line that keeps the budget honest', async () => {
    // ADR-0011: a soft item is free to move, slip and be skipped, so a ping about one
    // interrupts somebody about something that is by definition fine to ignore.
    const { prisma } = fakePrisma({ events: [ev({ kind: 'soft' })] });
    expect(await eventSoonKind.due(input(prisma, now))).toEqual([]);
  });

  it('never fires for a settled event', async () => {
    for (const status of ['done', 'skipped']) {
      const { prisma } = fakePrisma({ events: [ev({ status })] });
      expect(await eventSoonKind.due(input(prisma, now))).toEqual([]);
    }
  });

  it('uses the per-category lead: two hours for transport, thirty minutes for food', async () => {
    // ADR-0198 §3's table, read through `CATEGORY_TIME_PROFILE` rather than duplicated here —
    // an airport is the one place where two hours is not paranoid.
    const flight = ev({ category: 'transport', startsAt: new Date(now + 2 * HOUR) });
    const early = fakePrisma({ events: [flight] });
    expect(await eventSoonKind.due(input(early.prisma, now))).toHaveLength(2);

    // The same flight one minute earlier is not yet due.
    const notYet = fakePrisma({ events: [flight] });
    expect(await eventSoonKind.due(input(notYet.prisma, now - 60_000))).toEqual([]);
  });

  it('says nothing for a category whose lead is zero', async () => {
    // `sightseeing`, `nature`, `shopping`, `other` — rarely hard, and when they are the day
    // surfaces carry them.
    for (const category of ['sightseeing', 'nature', 'shopping', 'other', null]) {
      const { prisma } = fakePrisma({ events: [ev({ category })] });
      expect(await eventSoonKind.due(input(prisma, now))).toEqual([]);
    }
  });

  it('leaves an AMBIENT span to span.edge.soon', async () => {
    // The double-count ADR-0164 §3's `isAmbient` exists to prevent. Without this a hotel
    // check-in would fire from both kinds, an hour apart.
    const stay = ev({
      category: 'lodging',
      endDate: new Date(utc('2026-08-25T00:00:00Z')),
      startsAt: new Date(now + HOUR),
    });
    const { prisma } = fakePrisma({ events: [stay] });
    expect(await eventSoonKind.due(input(prisma, now))).toEqual([]);
  });

  it('still fires for a SAME-DAY lodging booking, which is not ambient', async () => {
    // ADR-0164: a stay whose check-in and check-out fall on one day is an ordinary block.
    const dayUse = ev({ category: 'lodging', startsAt: new Date(now + HOUR) });
    const { prisma } = fakePrisma({ events: [dayUse] });
    expect(await eventSoonKind.due(input(prisma, now))).toHaveLength(2);
  });

  it('prints the hour in the event’s own zone when it pins one', async () => {
    const { prisma } = fakePrisma({ events: [ev({ displayTimezone: 'Asia/Tokyo' })] });
    const sends = await eventSoonKind.due(input(prisma, now));
    // 15:30 UTC is 18:30 in Tel Aviv and 00:30 in Tokyo.
    expect(sends[0].payload.body).toContain('00:30');
  });

  it('says nothing about a trip that has ended', async () => {
    const { prisma } = fakePrisma({
      events: [ev()],
      trips: [
        {
          id: 'trip-1',
          name: 'x',
          startDate: new Date(utc('2026-07-01T00:00:00Z')),
          endDate: new Date(utc('2026-08-01T00:00:00Z')),
          timezone: 'UTC',
        },
      ],
    });
    expect(await eventSoonKind.due(input(prisma, now))).toEqual([]);
  });
});

describe('span.edge.soon', () => {
  const checkIn = utc('2026-08-21T13:00:00Z');
  /** A four-night stay: ambient, so its EDGES are the obligations and its middle is nothing. */
  const stay = (over: Partial<EventLike> = {}) =>
    ev({
      id: 'ev-stay',
      title: 'Hotel Nikko',
      category: 'lodging',
      startsAt: new Date(checkIn),
      endsAt: new Date(utc('2026-08-25T08:00:00Z')),
      endDate: new Date(utc('2026-08-25T00:00:00Z')),
      ...over,
    });

  it('fires an hour before the edge', async () => {
    const { prisma } = fakePrisma({ events: [stay()] });
    const sends = await spanEdgeKind.due(input(prisma, checkIn - HOUR));
    expect(sends).toHaveLength(2); // two members
    expect(sends[0].kind).toBe(NOTIFICATION_KIND.SPAN_EDGE_SOON);
    expect(sends[0].payload.body).toBe('Hotel Nikko');
  });

  it('aims at the CLOSING window bound when ADR-0184 gives one', async () => {
    // "A check-in that reads 17:00-21:00 is a deadline at 21:00, not an appointment at 17:00."
    const windowed = stay({ startWindowEnd: new Date(checkIn + 4 * HOUR) });
    const atOpen = fakePrisma({ events: [windowed] });
    // An hour before the OPENING is too early now — nothing is breachable yet.
    expect(await spanEdgeKind.due(input(atOpen.prisma, checkIn - HOUR))).toEqual([]);

    const atClose = fakePrisma({ events: [windowed] });
    const sends = await spanEdgeKind.due(input(atClose.prisma, checkIn + 3 * HOUR));
    expect(sends).toHaveLength(2);
    // 17:00 UTC = 20:00 Tel Aviv, which is the bound you can actually miss.
    expect(sends[0].payload.title).toContain('20:00');
  });

  it('uses the edge’s OWN word, refined by the glyph', async () => {
    const hotel = fakePrisma({ events: [stay()] });
    const [checkInSend] = await spanEdgeKind.due(input(hotel.prisma, checkIn - HOUR));
    expect(checkInSend.payload.title).toContain('צ׳ק-אין');

    // A car hire is picked up and returned, not checked in — `ICON_TIME_PROFILE`'s refinement,
    // read through the shared derivation rather than a second table here.
    const hire = fakePrisma({
      events: [stay({ category: 'transport', icon: '🚗' })],
    });
    const [pickup] = await spanEdgeKind.due(input(hire.prisma, checkIn - HOUR));
    expect(pickup.payload.title).toContain('איסוף הרכב');
  });

  it('keys the two edges apart, so the check-in does not suppress the check-out', async () => {
    // A span has two obligations days apart. Keying on the event id alone would let the first
    // ledger row swallow the second.
    const { prisma } = fakePrisma({ events: [stay()] });
    const start = await spanEdgeKind.due(input(prisma, checkIn - HOUR));
    const endPrisma = fakePrisma({ events: [stay()] });
    const end = await spanEdgeKind.due(input(endPrisma.prisma, utc('2026-08-25T08:00:00Z') - HOUR));

    expect(start[0].subjectId).toBe('ev-stay:start');
    expect(end[0].subjectId).toBe('ev-stay:end');
    expect(end[0].payload.title).toContain('צ׳ק-אאוט');
  });

  it('says NOTHING on the middle days', async () => {
    // ADR-0164's own measurement: nothing about the room needs doing on them.
    const { prisma } = fakePrisma({ events: [stay()] });
    expect(await spanEdgeKind.due(input(prisma, utc('2026-08-23T09:00:00Z')))).toEqual([]);
  });

  it('refuses an edge already behind us', async () => {
    // "Check out by 11:00" at 11:30 is worse than saying nothing.
    const { prisma } = fakePrisma({ events: [stay()] });
    expect(await spanEdgeKind.due(input(prisma, checkIn + 60_000))).toEqual([]);
  });

  it('ignores a single-day booking entirely — that is the other kind’s', async () => {
    const { prisma } = fakePrisma({ events: [stay({ endDate: null })] });
    expect(await spanEdgeKind.due(input(prisma, checkIn - HOUR))).toEqual([]);
  });

  it('never fires for a soft span', async () => {
    const { prisma } = fakePrisma({ events: [stay({ kind: 'soft' })] });
    expect(await spanEdgeKind.due(input(prisma, checkIn - HOUR))).toEqual([]);
  });
});

describe('trip.tomorrow', () => {
  /** 16:00 UTC = 19:00 in Tel Aviv, the evening before a trip starting 2026-08-22. */
  const at19 = utc('2026-08-21T16:00:00Z');
  const trips = [
    {
      id: 'trip-1',
      name: 'יפן ׳26',
      startDate: new Date(utc('2026-08-22T00:00:00Z')),
      endDate: new Date(utc('2026-08-30T00:00:00Z')),
      timezone: 'Asia/Tokyo',
    },
  ];

  it('fires at 19:00 the evening before day 1, to every member', async () => {
    const { prisma } = fakePrisma({ events: [], trips });
    const sends = await tripTomorrowKind.due(input(prisma, at19));
    expect(sends.map((s) => s.userId).sort()).toEqual(['u-assaf', 'u-noam']);
    expect(sends[0].kind).toBe(NOTIFICATION_KIND.TRIP_TOMORROW);
    expect(sends[0].payload.title).toBe('נוסעים מחר');
    expect(TOMORROW_HOUR).toBe(19);
  });

  it('reads 19:00 at HOME, not at the destination', async () => {
    // Before the first crossing `currentZone` answers the origin, which is exactly where
    // somebody is the evening before they travel. The trip's own zone is Tokyo here, and 19:00
    // there is the middle of the night in Tel Aviv.
    const { prisma } = fakePrisma({ events: [], trips });
    expect(await tripTomorrowKind.due(input(prisma, at19, 'Asia/Jerusalem'))).toHaveLength(2);
    const tokyo = fakePrisma({ events: [], trips });
    expect(await tripTomorrowKind.due(input(tokyo.prisma, at19, 'Asia/Tokyo'))).toEqual([]);
  });

  it('fires at no other hour', async () => {
    for (const offset of [-2 * HOUR, -HOUR, HOUR, 3 * HOUR]) {
      const { prisma } = fakePrisma({ events: [], trips });
      expect(await tripTomorrowKind.due(input(prisma, at19 + offset))).toEqual([]);
    }
  });

  it('does not fire the evening before day 2', async () => {
    const { prisma } = fakePrisma({ events: [], trips });
    expect(await tripTomorrowKind.due(input(prisma, at19 + DAY))).toEqual([]);
  });

  it('names the first timed thing on day 1 when there is one', async () => {
    const { prisma } = fakePrisma({
      events: [
        ev({
          id: 'ev-late',
          title: 'ארוחת בוקר',
          date: new Date(utc('2026-08-22T00:00:00Z')),
          startsAt: new Date(utc('2026-08-22T06:00:00Z')),
        }),
        ev({
          id: 'ev-flight',
          title: 'טיסה TLV → NRT',
          category: 'transport',
          date: new Date(utc('2026-08-22T00:00:00Z')),
          startsAt: new Date(utc('2026-08-22T03:20:00Z')),
        }),
      ],
      trips,
    });
    const sends = await tripTomorrowKind.due(input(prisma, at19));
    // The FIRST, by time — not the first the query happened to return.
    expect(sends[0].payload.body).toContain('טיסה TLV → NRT');
  });

  it('still fires when day 1 has nothing on a clock', async () => {
    // Common rather than exceptional, so the copy has a shape for it.
    const { prisma } = fakePrisma({ events: [], trips });
    const sends = await tripTomorrowKind.due(input(prisma, at19));
    expect(sends[0].payload.body).toBe('יפן ׳26');
  });

  it('aims at 19:00 itself, so every minute of the hour is ONE ledger claim', async () => {
    const aims = new Set<number>();
    for (const offset of [0, 3, 17, 30, 46, 59]) {
      const { prisma } = fakePrisma({ events: [], trips });
      const sends = await tripTomorrowKind.due(input(prisma, at19 + offset * 60_000));
      expect(sends).toHaveLength(2);
      for (const send of sends) aims.add(send.aimedAtMs);
    }
    expect([...aims]).toEqual([at19]);
  });

  it('is keyed on the trip, so one evening is one send', async () => {
    const { prisma } = fakePrisma({ events: [], trips });
    const sends = await tripTomorrowKind.due(input(prisma, at19));
    expect(sends[0].subjectId).toBe('trip-1');
  });
});
