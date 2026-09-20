import { describe, expect, it, vi } from 'vitest';
import {
  EVENT_CATEGORY,
  EVENT_KIND,
  EVENT_STATUS,
  type TripEvent,
  type ZoneEvidence,
} from '@waypoint/shared';
import { daysUntilStart, daysUntilStartOnDevice, deriveMode, tripPhase, tripToday } from './mode';

const NOW = '2026-07-01T00:00:00Z';
import { TRIP } from '../fixtures';

// The device's zone is read from `Intl` at load, so a spec about it must state it (frontend
// CLAUDE.md: the suite reads no environment it did not set).
vi.mock('../constants', async (orig) => ({
  ...(await orig<typeof import('../constants')>()),
  DEVICE_TIMEZONE: 'Asia/Jerusalem',
}));

describe('deriveMode', () => {
  it('is Plan mode before the trip starts', () => {
    expect(deriveMode(TRIP, new Date('2026-07-04T23:00:00+09:00'))).toBe('plan');
  });

  it('is Trip mode from startDate through endDate inclusive', () => {
    expect(deriveMode(TRIP, new Date('2026-07-05T00:00:01+09:00'))).toBe('trip');
    expect(deriveMode(TRIP, new Date('2026-07-14T23:59:00+09:00'))).toBe('trip');
  });

  it('is Plan mode after the trip ends', () => {
    expect(deriveMode(TRIP, new Date('2026-07-15T00:30:00+09:00'))).toBe('plan');
  });

  it('reads the calendar day in the trip timezone, not UTC', () => {
    // 2026-07-14 23:30 JST is still the last trip day locally, even though
    // it's already 2026-07-14T14:30Z / past midnight UTC the next day.
    expect(deriveMode(TRIP, new Date('2026-07-14T14:30:00Z'))).toBe('trip');
    // One hour later it's 2026-07-15 00:30 JST — Plan mode.
    expect(deriveMode(TRIP, new Date('2026-07-14T15:30:00Z'))).toBe('plan');
  });
});

describe('tripPhase', () => {
  it('is pre before the trip starts', () => {
    expect(tripPhase(TRIP, new Date('2026-07-04T23:00:00+09:00'))).toBe('pre');
  });

  it('is live from startDate through endDate inclusive', () => {
    expect(tripPhase(TRIP, new Date('2026-07-05T00:00:01+09:00'))).toBe('live');
    expect(tripPhase(TRIP, new Date('2026-07-14T23:59:00+09:00'))).toBe('live');
  });

  it('is past after the trip ends', () => {
    expect(tripPhase(TRIP, new Date('2026-07-15T00:30:00+09:00'))).toBe('past');
  });

  it('reads the calendar day in the trip timezone, not UTC', () => {
    expect(tripPhase(TRIP, new Date('2026-07-14T14:30:00Z'))).toBe('live');
    expect(tripPhase(TRIP, new Date('2026-07-14T15:30:00Z'))).toBe('past');
  });
});

describe('daysUntilStart', () => {
  it('counts down the trip-local calendar days before the trip starts', () => {
    expect(daysUntilStart(TRIP, new Date('2026-07-04T23:00:00+09:00'))).toBe(1);
    expect(daysUntilStart(TRIP, new Date('2026-06-30T12:00:00+09:00'))).toBe(5);
  });

  it('is null on and after startDate — no countdown once the trip has begun', () => {
    expect(daysUntilStart(TRIP, new Date('2026-07-05T00:00:01+09:00'))).toBeNull();
    expect(daysUntilStart(TRIP, new Date('2026-07-07T18:52:00+09:00'))).toBeNull();
  });

  it('is null after the trip has ended too', () => {
    expect(daysUntilStart(TRIP, new Date('2026-07-15T00:30:00+09:00'))).toBeNull();
  });
});

describe('with zone evidence — "today" is the itinerary\'s, not the destination\'s (ADR-0107 §4)', () => {
  const JLM = 'Asia/Jerusalem';
  const evidence = (crossings: ZoneEvidence['crossings'], primaryZone: string): ZoneEvidence => ({
    events: [],
    bookings: [],
    places: [],
    crossings,
    primaryZone,
  });

  it('counts the days to departure from home before the outbound flight (field report, 2026-09-09)', () => {
    // Iceland trip, 11–22 September; the outbound flight leaves Tel Aviv on the 11th.
    const trip = { startDate: '2026-09-11', endDate: '2026-09-22', timezone: 'Atlantic/Reykjavik' };
    const ev = evidence(
      [{ at: Date.parse('2026-09-11T05:00:00Z'), fromZone: JLM, toZone: 'Atlantic/Reykjavik' }],
      trip.timezone,
    );
    // 00:58 at home on the 9th — 21:58 on the 8th in Reykjavík. The hero said 3; it is 2.
    const at = new Date('2026-09-08T21:58:00Z');
    expect(daysUntilStart(trip, at)).toBe(3); // the primary-zone fallback, kept for the trip list
    expect(daysUntilStart(trip, at, ev)).toBe(2);
    expect(tripPhase(trip, at, ev)).toBe('pre');
  });

  it('starts the trip on the home midnight of startDate, before the flight leaves', () => {
    const ev = evidence(
      [{ at: Date.parse('2026-07-05T05:00:00Z'), fromZone: JLM, toZone: TRIP.timezone }],
      TRIP.timezone,
    );
    // 19:00 at home on the 4th is already 01:00 on the 5th in Tokyo — still the day before.
    const eve = new Date('2026-07-04T16:00:00Z');
    expect(tripPhase(TRIP, eve, ev)).toBe('pre');
    expect(daysUntilStart(TRIP, eve, ev)).toBe(1);
    expect(deriveMode(TRIP, eve, ev)).toBe('plan');
    // 00:30 at home on the 5th: the flight is today, so it is Trip mode.
    const morning = new Date('2026-07-04T21:30:00Z');
    expect(tripPhase(TRIP, morning, ev)).toBe('live');
    expect(daysUntilStart(TRIP, morning, ev)).toBeNull();
    expect(deriveMode(TRIP, morning, ev)).toBe('trip');
  });

  // The Tokyo case above passes for the wrong reason on a WESTWARD trip: Tokyo's midnight
  // comes before home's, so by home midnight the far side is already on day 1. Reykjavík's
  // comes three hours after, and `liveZone` read the departure day's ambient (the far side),
  // so Trip mode opened at 03:00 at home (owner's device, 2026-09-10: `26:59:48` to מחר).
  it("starts a westward trip on the home midnight too, not the far side's (field report, 2026-09-10)", () => {
    const trip = { startDate: '2026-09-11', endDate: '2026-09-22', timezone: 'Atlantic/Reykjavik' };
    const ev = evidence(
      [{ at: Date.parse('2026-09-11T05:00:00Z'), fromZone: JLM, toZone: 'Atlantic/Reykjavik' }],
      trip.timezone,
    );
    const homeMidnight = Date.parse('2026-09-10T21:00:00Z');
    expect(deriveMode(trip, new Date(homeMidnight - 1), ev)).toBe('plan');
    expect(daysUntilStart(trip, new Date(homeMidnight - 1), ev)).toBe(1);
    expect(deriveMode(trip, new Date(homeMidnight), ev)).toBe('trip');
    expect(daysUntilStart(trip, new Date(homeMidnight), ev)).toBeNull();
  });

  it('reads the destination once the crossing has departed, as the day view does', () => {
    const ev = evidence(
      [{ at: Date.parse('2026-07-05T05:00:00Z'), fromZone: JLM, toZone: TRIP.timezone }],
      TRIP.timezone,
    );
    // 23:30 JST on the last day is 17:30 at home — the trip is still live where you are.
    expect(tripPhase(TRIP, new Date('2026-07-14T14:30:00Z'), ev)).toBe('live');
    expect(tripPhase(TRIP, new Date('2026-07-14T15:30:00Z'), ev)).toBe('past');
  });

  it('falls back to the trip primary zone when no crossing anchors the itinerary', () => {
    const ev = evidence([], TRIP.timezone);
    expect(tripPhase(TRIP, new Date('2026-07-04T16:00:00Z'), ev)).toBe('live');
    expect(daysUntilStart(TRIP, new Date('2026-07-04T16:00:00Z'), ev)).toBeNull();
  });
});

describe('daysUntilStartOnDevice — a screen with no trip loaded counts from where the phone is', () => {
  // The all-trips list at 00:34 at home on the 10th said `מחרתיים` for a trip starting on the
  // 11th (owner, 2026-09-10): `daysUntilStart` with no evidence reads the trip's primary zone,
  // and in Reykjavík it was still the 9th.
  it('says tomorrow at home when the far side is still on the day before', () => {
    const trip = { startDate: '2026-09-11', endDate: '2026-09-22', timezone: 'Atlantic/Reykjavik' };
    const at = new Date('2026-09-09T21:34:00Z');
    expect(daysUntilStart(trip, at)).toBe(2); // the primary-zone fallback, kept for the skeleton
    expect(daysUntilStartOnDevice(trip.startDate, at)).toBe(1);
  });

  it('is zero on the date itself and negative after it', () => {
    expect(daysUntilStartOnDevice('2026-09-11', new Date('2026-09-10T21:00:00Z'))).toBe(0);
    expect(daysUntilStartOnDevice('2026-09-11', new Date('2026-09-12T12:00:00Z'))).toBe(-1);
  });
});

/* ── ADR-0236 §1: the trip is live while its last commitment is ───────────────────────
   The trip ends 2026-07-14. A flight home leaving ⁦22:10⁩ Tokyo that night lands at
   ⁦04:30⁩ local on the 15th — a day the trip does not have. The `E` numbers are the
   ADR's own edge-case register. */
const flightHome = (over: Partial<TripEvent> = {}): TripEvent => ({
  id: 'ev-home',
  tripId: TRIP.id,
  date: '2026-07-14',
  endDate: '2026-07-15',
  title: 'טוקיו → תל אביב',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  sortOrder: 0,
  source: 'manual',
  category: EVENT_CATEGORY.TRANSPORT,
  startsAt: '2026-07-14T22:10:00+09:00',
  endsAt: '2026-07-15T04:30:00+09:00',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u',
  ...over,
});
const hotel = (over: Partial<TripEvent> = {}): TripEvent =>
  flightHome({
    id: 'ev-hotel',
    category: EVENT_CATEGORY.LODGING,
    title: 'המלון',
    startsAt: '2026-07-10T15:00:00+09:00',
    endsAt: '2026-07-15T11:00:00+09:00',
    date: '2026-07-10',
    ...over,
  });
/** Mid-flight, after the trip's last midnight: the case the whole ADR is about. */
const MID_FLIGHT = new Date('2026-07-15T01:00:00+09:00');

describe('the live window ends at the last commitment (ADR-0236 §1)', () => {
  it('stays live while a leg that began inside the trip is still running', () => {
    expect(deriveMode(TRIP, MID_FLIGHT, undefined, [flightHome()])).toBe('trip');
    // …and without the events it is the calendar answer it has always been, which is what
    // the pre-snapshot chrome asks for (E20).
    expect(deriveMode(TRIP, MID_FLIGHT)).toBe('plan');
  });

  it('clamps the trip’s own today to the day that commitment belongs to (E11)', () => {
    expect(tripToday(TRIP, MID_FLIGHT, undefined, [flightHome()])).toBe('2026-07-14');
    // Which is the whole point: `dayPhase` then reads the last day as TODAY, not PAST.
    expect(tripToday(TRIP, MID_FLIGHT)).toBe('2026-07-15');
  });

  it('is over the moment the leg lands', () => {
    const landed = new Date('2026-07-15T04:31:00+09:00');
    expect(deriveMode(TRIP, landed, undefined, [flightHome()])).toBe('plan');
  });

  it('is NOT held open by a stay you are inside (E1)', () => {
    // `scheduleEvents` drops a held span you are inside (ADR-0227 §B) — the board would
    // have nothing to stand on, which is the empty shell ADR-0040 §1 refused.
    expect(deriveMode(TRIP, MID_FLIGHT, undefined, [hotel()])).toBe('plan');
  });

  it('is released by a done or skipped leg (E4)', () => {
    expect(
      deriveMode(TRIP, MID_FLIGHT, undefined, [flightHome({ status: EVENT_STATUS.DONE })]),
    ).toBe('plan');
    expect(
      deriveMode(TRIP, MID_FLIGHT, undefined, [flightHome({ status: EVENT_STATUS.SKIPPED })]),
    ).toBe('plan');
  });

  it('cannot be held open by an event stranded outside the trip (E5)', () => {
    // A date edit can leave an event past `endDate`. Without the "began inside" guard it
    // would hold a finished trip live forever.
    const stranded = flightHome({ date: '2026-07-15', endDate: '2026-07-16' });
    expect(deriveMode(TRIP, MID_FLIGHT, undefined, [stranded])).toBe('plan');
  });

  it('never opens the window early (E9)', () => {
    const beforeStart = new Date('2026-07-04T23:00:00+09:00');
    const early = flightHome({ date: '2026-07-04', endDate: '2026-07-05' });
    expect(deriveMode(TRIP, beforeStart, undefined, [early])).toBe('plan');
    expect(tripToday(TRIP, beforeStart, undefined, [early])).toBe('2026-07-04');
  });

  it('holds for a start-only commitment, on its category’s typical length (E3)', () => {
    const dinner = flightHome({
      id: 'ev-dinner',
      category: EVENT_CATEGORY.FOOD,
      endsAt: undefined,
      endDate: undefined,
      startsAt: '2026-07-14T23:40:00+09:00',
    });
    expect(deriveMode(TRIP, new Date('2026-07-15T00:20:00+09:00'), undefined, [dinner])).toBe(
      'trip',
    );
  });
});
