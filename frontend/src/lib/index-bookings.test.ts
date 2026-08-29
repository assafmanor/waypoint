import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { type ZoneEvidence } from './places';
import {
  CATEGORY_ALL,
  matchesCategory,
  matchesQuery,
  typeChipAddsMeaning,
  scheduleLabel,
  scheduleParts,
  splitBookings,
  visibleRows,
} from './index-bookings';
import { t } from '../i18n/he';
import { FILTER_STAGGER_MAX_MS, FILTER_STAGGER_MS } from '../constants';

const TZ = 'Asia/Tokyo';
const NOW = Date.parse('2026-07-07T12:00:00+09:00'); // "today" = 2026-07-07 in Tokyo
// A window that CONTAINS the tests' today, so the schedule line reads relative (`dayLabel`);
// the off-trip day-number reading is asserted on its own below.
const TRIP = { startDate: '2026-07-01', endDate: '2026-07-31' };
const ISO = '2026-07-01T00:00:00Z';

const booking = (
  id: string,
  title: string,
  type: Booking['type'] = BOOKING_TYPE.HOTEL,
): Booking => ({
  id,
  tripId: 't1',
  type,
  title,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

const place = (id: string, name: string): Place => ({
  id,
  tripId: 't1',
  name,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

const linkedEvent = (
  bookingId: string,
  date: string,
  hhmm = '09:00',
  endHhmm?: string,
): TripEvent => ({
  id: `ev-${bookingId}`,
  tripId: 't1',
  date,
  title: 'x',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  startsAt: `${date}T${hhmm}:00+09:00`,
  ...(endHhmm ? { endsAt: `${date}T${endHhmm}:00+09:00` } : {}),
  bookingId,
  sortOrder: 1,
  source: 'manual',
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

/** Strip a linked event's clock times, leaving only its calendar date. */
const untimed = (event: TripEvent): TripEvent => {
  const bare = { ...event };
  delete bare.startsAt;
  delete bare.endsAt;
  return bare;
};

/** Turn a single-day linked event into a multi-day span (check-in → check-out). */
const span_ = (event: TripEvent, endDate: string, hhmm: string): TripEvent => ({
  ...event,
  endDate,
  endsAt: `${endDate}T${hhmm}:00+09:00`,
});

/** The zone evidence the two schedule readers now take (ADR-0107): with no places and no
 *  crossings every event resolves to the primary zone, which is what these cases assert.
 *  The cross-zone case builds its own below. */
const EVIDENCE: ZoneEvidence = {
  events: [],
  bookings: [],
  places: [],
  crossings: [],
  primaryZone: TZ,
};

describe('splitBookings', () => {
  it('files a booking whose linked event is before today under past', () => {
    const b = booking('b1', 'old');
    const { past, upcoming } = splitBookings([b], [linkedEvent('b1', '2026-07-05')], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
    expect(past[0].event?.id).toBe('ev-b1');
  });

  it('files a same-day booking under past once its end instant has passed', () => {
    // arrives 11:00, now is 12:00 — behind you, even though it is still "today"
    const b = booking('b1', 'landed');
    const { past, upcoming } = splitBookings(
      [b],
      [linkedEvent('b1', '2026-07-07', '09:00', '11:00')],
      TZ,
      NOW,
    );
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
  });

  it('keeps a same-day booking upcoming while its end instant is still ahead', () => {
    // starts 14:00 / ends 16:00, now is 12:00 — still to come
    const b = booking('b1', 'later today');
    const { past, upcoming } = splitBookings(
      [b],
      [linkedEvent('b1', '2026-07-07', '14:00', '16:00')],
      TZ,
      NOW,
    );
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1']);
    expect(past).toHaveLength(0);
  });

  it('files a same-day end-less booking under past once its single moment has passed', () => {
    const b = booking('b1', 'departed'); // departs 09:00, no arrival time; now 12:00
    const { past } = splitBookings([b], [linkedEvent('b1', '2026-07-07', '09:00')], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
  });

  it('keeps an untimed booking on today upcoming until midnight', () => {
    const b = booking('b1', 'no clock time');
    const { past, upcoming } = splitBookings(
      [b],
      [untimed(linkedEvent('b1', '2026-07-07'))],
      TZ,
      NOW,
    );
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1']);
    expect(past).toHaveLength(0);
  });

  it('treats an unlinked booking as upcoming and sorts it after scheduled ones', () => {
    const scheduled = booking('b1', 'scheduled');
    const loose = booking('b2', 'loose');
    const { upcoming, past } = splitBookings(
      [loose, scheduled],
      [linkedEvent('b1', '2026-07-09')],
      TZ,
      NOW,
    );
    expect(past).toHaveLength(0);
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1', 'b2']);
    expect(upcoming[1].event).toBeUndefined();
  });

  it('orders scheduled rows chronologically', () => {
    const early = booking('b1', 'early');
    const late = booking('b2', 'late');
    const { upcoming } = splitBookings(
      [late, early],
      [linkedEvent('b2', '2026-07-10', '08:00'), linkedEvent('b1', '2026-07-08', '08:00')],
      TZ,
      NOW,
    );
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1', 'b2']);
  });

  it('keeps an in-progress multi-day stay upcoming until its check-out passes', () => {
    const b = booking('b1', 'hotel'); // checked in 07-05, checks out 07-09; today is 07-07
    const span = span_(linkedEvent('b1', '2026-07-05', '15:00'), '2026-07-09', '11:00');
    const { past, upcoming } = splitBookings([b], [span], TZ, NOW);
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1']);
    expect(past).toHaveLength(0);
  });

  it('files a multi-day stay under past only after its check-out day', () => {
    const b = booking('b1', 'hotel'); // checked out 07-06, before today (07-07)
    const span = span_(linkedEvent('b1', '2026-07-04', '15:00'), '2026-07-06', '11:00');
    const { past, upcoming } = splitBookings([b], [span], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
  });
});

describe('scheduleLabel (span-aware, ADR-0053)', () => {
  const hotel = booking('h', 'hotel', BOOKING_TYPE.HOTEL);

  it('shows the check-in time before the stay begins', () => {
    const ev = span_(linkedEvent('h', '2026-07-10', '15:00'), '2026-07-14', '11:00');
    const label = scheduleLabel(ev, hotel, EVIDENCE, new Date(NOW), TRIP); // today 07-07, before check-in
    expect(label).toContain('צ׳ק-אין');
    expect(label).toContain('15:00');
    expect(label).not.toContain('צ׳ק-אאוט');
  });

  it('reads the day relative to today, not as a trip day-number (ADR-0085)', () => {
    // today 07-07: a flight tomorrow / in three days reads מחר / עוד N ימים.
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const tomorrow = scheduleLabel(
      linkedEvent('f', '2026-07-08', '08:30'),
      flight,
      EVIDENCE,
      new Date(NOW),
      TRIP,
    );
    expect(tomorrow).toBe('המראה · מחר · 08:30');
    const soon = scheduleLabel(
      linkedEvent('f', '2026-07-10', '08:30'),
      flight,
      EVIDENCE,
      new Date(NOW),
      TRIP,
    );
    expect(soon).toContain('עוד 3 ימים');
  });

  it('names the day by its TRIP-DAY NUMBER before the trip starts (ADR-0085 amendment)', () => {
    // The rows in the field report: from 2026-11-29 a trip on 12-11..12-22 printed
    // `עוד 13 ימים` / `עוד 14` / `עוד 15` down consecutive rows — each one the trip-day
    // number plus 11, the one constant the screen never states.
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const preTrip = { startDate: '2026-12-11', endDate: '2026-12-22' };
    const before = new Date('2026-11-29T12:00:00+09:00');
    const label = (date: string) =>
      scheduleLabel(linkedEvent('f', date, '08:30'), flight, EVIDENCE, before, preTrip);
    expect(label('2026-12-11')).toBe('המראה · יום 1 · 08:30');
    expect(label('2026-12-13')).toBe('המראה · יום 3 · 08:30');
    expect(label('2026-12-22')).toBe('המראה · יום 12 · 08:30');
  });

  it('names a finished trip\'s days by number too, in place of "לפני N ימים"', () => {
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const pastTrip = { startDate: '2026-07-05', endDate: '2026-07-14' };
    const after = new Date('2026-09-01T12:00:00+09:00');
    const label = scheduleLabel(
      linkedEvent('f', '2026-07-07', '08:30'),
      flight,
      EVIDENCE,
      after,
      pastTrip,
    );
    expect(label).toContain('יום 3');
    expect(label).not.toContain('לפני');
  });

  it('shows the check-out day (no time) mid-stay', () => {
    const ev = span_(linkedEvent('h', '2026-07-05', '15:00'), '2026-07-14', '11:00');
    const label = scheduleLabel(ev, hotel, EVIDENCE, new Date(NOW), TRIP); // today 07-07, mid-stay
    expect(label).toContain('צ׳ק-אאוט');
    expect(label).not.toContain('11:00');
    expect(label).not.toContain('צ׳ק-אין');
  });

  it('drops the verb once check-out has passed, even on the same day', () => {
    // checked out today at 11:00, now is 12:00 — already behind you (ADR-0089).
    const ev = span_(linkedEvent('h', '2026-07-04', '15:00'), '2026-07-07', '11:00');
    const label = scheduleLabel(ev, hotel, EVIDENCE, new Date(NOW), TRIP);
    expect(label).not.toContain('צ׳ק-אאוט');
    expect(label).toBe('היום · 11:00');
  });

  it('drops the transition verb for a booking behind you (ADR-0089)', () => {
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const past = scheduleLabel(
      linkedEvent('f', '2026-07-05', '08:30'),
      flight,
      EVIDENCE,
      new Date(NOW),
      TRIP,
    );
    expect(past).not.toContain('המראה');
    expect(past).toBe('שלשום · 08:30');
    // still names the verb while it's ahead of you
    const ahead = scheduleLabel(
      linkedEvent('f', '2026-07-09', '08:30'),
      flight,
      EVIDENCE,
      new Date(NOW),
      TRIP,
    );
    expect(ahead).toContain('המראה');
  });

  it('shows the check-in day on the check-in day itself', () => {
    const ev = span_(linkedEvent('h', '2026-07-07', '15:00'), '2026-07-10', '11:00');
    const label = scheduleLabel(ev, hotel, EVIDENCE, new Date(NOW), TRIP); // today 07-07 = check-in day
    expect(label).toContain('צ׳ק-אין');
    expect(label).toContain('היום');
    expect(label).toContain('15:00');
  });
});

describe('matchesCategory (ADR-0098 §2 category filter)', () => {
  it('matches everything for "all"', () => {
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.FLIGHT), CATEGORY_ALL)).toBe(true);
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.HOTEL), CATEGORY_ALL)).toBe(true);
  });

  it("matches only the booking's own type otherwise", () => {
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.FLIGHT), BOOKING_TYPE.FLIGHT)).toBe(
      true,
    );
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.HOTEL), BOOKING_TYPE.FLIGHT)).toBe(
      false,
    );
  });
});

describe('matchesQuery (ADR-0098 §2 search)', () => {
  it('matches everything for a blank query', () => {
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), '')).toBe(true);
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), '   ')).toBe(true);
  });

  it('matches by title, case-insensitively', () => {
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), 'ramen')).toBe(true);
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), 'RAMEN')).toBe(true);
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), 'sushi')).toBe(false);
  });

  it('matches by confirmation code, case-insensitively', () => {
    const b = { ...booking('b1', 'x'), confirmationCode: 'NA832' };
    expect(matchesQuery(b, 'na832')).toBe(true);
    expect(matchesQuery(b, 'zz')).toBe(false);
  });

  it("matches by the booking's type label, singular or plural (ADR-0102)", () => {
    const r = booking('b1', 'Ichiran Ramen', BOOKING_TYPE.RESTAURANT);
    expect(matchesQuery(r, 'מסעדה')).toBe(true);
    expect(matchesQuery(r, 'מסעדות')).toBe(true);
    expect(matchesQuery(r, 'טיסה')).toBe(false);
  });

  it("doesn't cross-match a different type's label", () => {
    const flight = booking('b1', 'x', BOOKING_TYPE.FLIGHT);
    expect(matchesQuery(flight, 'מסעדה')).toBe(false);
    expect(matchesQuery(flight, 'טיסות')).toBe(true);
  });

  it('matches a hotel booking by alternate lodging vocabulary, not just "לינה" (ADR-0102)', () => {
    const h = booking('b1', 'x', BOOKING_TYPE.HOTEL);
    expect(matchesQuery(h, 'מלון')).toBe(true);
    expect(matchesQuery(h, 'הוסטל')).toBe(true);
    expect(matchesQuery(h, 'דירה')).toBe(true);
    expect(matchesQuery(h, 'airbnb')).toBe(true);
    expect(matchesQuery(h, 'AIRBNB')).toBe(true);
  });

  it('matches the other types by their alternate vocabulary too (ADR-0102)', () => {
    expect(matchesQuery(booking('b1', 'x', BOOKING_TYPE.FLIGHT), 'מטוס')).toBe(true);
    expect(matchesQuery(booking('b2', 'x', BOOKING_TYPE.RESTAURANT), 'ארוחה')).toBe(true);
    expect(matchesQuery(booking('b3', 'x', BOOKING_TYPE.ACTIVITY), 'טיול')).toBe(true);
    expect(matchesQuery(booking('b3', 'x', BOOKING_TYPE.ACTIVITY), 'כרטיס')).toBe(true);
  });

  // **The vocabulary split ADR-0162 §4 makes**, asserted in both directions — the whole
  // reason the car words MOVED off `transit` instead of being listed on both types.
  it('sends the car words to the hire and the vehicle words to the journey', () => {
    const hire = booking('b1', 'x', BOOKING_TYPE.CAR);
    const journey = booking('b2', 'x', BOOKING_TYPE.TRANSIT);

    for (const q of ['השכרת רכב', 'רכב שכור', 'מכונית', 'hertz']) {
      expect(matchesQuery(hire, q)).toBe(true);
      // The point: a bus no longer answers a search for a rental.
      expect(matchesQuery(journey, q)).toBe(false);
    }
    for (const q of ['אוטובוס', 'מעבורת', 'הסעה', 'רכבל']) {
      expect(matchesQuery(journey, q)).toBe(true);
      expect(matchesQuery(hire, q)).toBe(false);
    }
  });

  // The bare word is NOT a discriminator, and that is `matchesAnyTerm`'s substring
  // semantics rather than a synonym-list mistake: `רכב` is a prefix of both `רכבת` (train)
  // and `רכבל` (cable car). Pinned so nobody "fixes" the lists over it — the cure would be
  // word-boundary matching for every search in the app, which is a separate decision.
  it('matches a train and a cable car for a bare "רכב", by substring', () => {
    expect(matchesQuery(booking('b1', 'x', BOOKING_TYPE.CAR), 'רכב')).toBe(true);
    expect(matchesQuery(booking('b2', 'x', BOOKING_TYPE.TRAIN), 'רכב')).toBe(true); // רכבת
    expect(matchesQuery(booking('b3', 'x', BOOKING_TYPE.TRANSIT), 'רכב')).toBe(true); // רכבל
    // …and the same in the other direction: `אוטו` is a prefix of `אוטובוס`, so the
    // colloquial word for a car reaches the bus. Kept in the list anyway — it IS what
    // people type, and the alternative is a car nobody finds by its everyday name.
    expect(matchesQuery(booking('b1', 'x', BOOKING_TYPE.CAR), 'אוטו')).toBe(true);
    expect(matchesQuery(booking('b3', 'x', BOOKING_TYPE.TRANSIT), 'אוטו')).toBe(true);
    // A word that shares no prefix is still cleanly excluded.
    expect(matchesQuery(booking('b4', 'x', BOOKING_TYPE.HOTEL), 'רכב')).toBe(false);
  });

  // The place facet: a booking is findable by WHERE it is, not only by what it's called.
  describe('by linked place', () => {
    const PLACES = [
      place('pl-shinjuku', 'Shinjuku'),
      place('pl-nrt', 'נתב״ג'),
      place('pl-fra', 'פרנקפורט'),
    ];

    it("matches a single-place booking by its place's name", () => {
      const hotel = { ...booking('b1', 'Granbell'), placeId: 'pl-shinjuku' };
      expect(matchesQuery(hotel, 'shinjuku', PLACES)).toBe(true);
      expect(matchesQuery(hotel, 'shibuya', PLACES)).toBe(false);
    });

    // BOTH ends, deliberately: `פרנקפורט` has to find the flight that lands there.
    it('matches a transport booking by either endpoint', () => {
      const flight = {
        ...booking('b1', 'JL407', BOOKING_TYPE.FLIGHT),
        fromPlaceId: 'pl-nrt',
        toPlaceId: 'pl-fra',
      };
      expect(matchesQuery(flight, 'נתב״ג', PLACES)).toBe(true);
      expect(matchesQuery(flight, 'פרנקפורט', PLACES)).toBe(true);
      expect(matchesQuery(flight, 'Shinjuku', PLACES)).toBe(false);
    });

    // Free via `matchesAnyTerm`, and worth pinning: a name is stored text, so nobody
    // types its gershayim.
    it('is case- and punctuation-insensitive on the place name too', () => {
      const hotel = { ...booking('b1', 'Granbell'), placeId: 'pl-shinjuku' };
      expect(matchesQuery(hotel, 'SHINJUKU', PLACES)).toBe(true);
      const flight = { ...booking('b2', 'JL407', BOOKING_TYPE.FLIGHT), fromPlaceId: 'pl-nrt' };
      expect(matchesQuery(flight, 'נתבג', PLACES)).toBe(true);
    });

    it('leaves the other facets alone for a booking with no linked place', () => {
      const loose = booking('b1', 'Ichiran Ramen', BOOKING_TYPE.RESTAURANT);
      expect(matchesQuery(loose, 'ramen', PLACES)).toBe(true);
      expect(matchesQuery(loose, 'מסעדות', PLACES)).toBe(true);
      expect(matchesQuery(loose, 'shinjuku', PLACES)).toBe(false);
    });

    // A place the trip no longer holds resolves to nothing, and a term that resolves to
    // nothing must not turn into a match-everything.
    it('ignores a placeId with no matching place row', () => {
      const orphan = { ...booking('b1', 'Granbell'), placeId: 'pl-gone' };
      expect(matchesQuery(orphan, 'shinjuku', PLACES)).toBe(false);
      expect(matchesQuery(orphan, 'granbell', PLACES)).toBe(true);
    });
  });
});

describe('visibleRows (ADR-0098 §4 stagger)', () => {
  const rows = (n: number, type: Booking['type'] = BOOKING_TYPE.HOTEL) =>
    Array.from({ length: n }, (_, i) => ({ booking: booking(`b${i}`, `row${i}`, type) }));

  it('marks every row visible and increments the delay for "all" with no query', () => {
    const { rows: out, nextIndex } = visibleRows(rows(3), CATEGORY_ALL, '', []);
    expect(out.every((r) => r.visible)).toBe(true);
    expect(out.map((r) => r.delayMs)).toEqual([0, FILTER_STAGGER_MS, FILTER_STAGGER_MS * 2]);
    expect(nextIndex).toBe(3);
  });

  it('hides non-matching rows with a zero delay, and only counts visible ones toward the stagger', () => {
    const mixed = [
      { booking: booking('b1', 'x', BOOKING_TYPE.FLIGHT) },
      { booking: booking('b2', 'y', BOOKING_TYPE.HOTEL) },
      { booking: booking('b3', 'z', BOOKING_TYPE.FLIGHT) },
    ];
    const { rows: out, nextIndex } = visibleRows(mixed, BOOKING_TYPE.FLIGHT, '', []);
    expect(out.map((r) => r.visible)).toEqual([true, false, true]);
    expect(out[1].delayMs).toBe(0);
    expect(out[2].delayMs).toBe(FILTER_STAGGER_MS); // second VISIBLE row, not third row
    expect(nextIndex).toBe(2);
  });

  it('caps the delay at FILTER_STAGGER_MAX_MS for a long list', () => {
    const { rows: out } = visibleRows(rows(50), CATEGORY_ALL, '', []);
    expect(out.at(-1)?.delayMs).toBe(FILTER_STAGGER_MAX_MS);
  });

  it('chains a startIndex so upcoming → past shares one continuous stagger', () => {
    const upcoming = visibleRows(rows(2), CATEGORY_ALL, '', []);
    const past = visibleRows(rows(2), CATEGORY_ALL, '', [], upcoming.nextIndex);
    expect(past.rows.map((r) => r.delayMs)).toEqual([FILTER_STAGGER_MS * 2, FILTER_STAGGER_MS * 3]);
  });

  // The place facet reaching all the way through the row predicate — the actual work
  // here, since neither function could see a place before.
  it('hides a row whose place does not match, and keeps the one whose does', () => {
    const mixed = [
      { booking: { ...booking('b1', 'Granbell'), placeId: 'pl-shinjuku' } },
      { booking: { ...booking('b2', 'Hoshinoya'), placeId: 'pl-kyoto' } },
    ];
    const places = [place('pl-shinjuku', 'Shinjuku'), place('pl-kyoto', 'Kyoto')];
    const { rows: out } = visibleRows(mixed, CATEGORY_ALL, 'kyoto', places);
    expect(out.map((r) => r.visible)).toEqual([false, true]);
  });
});

// **The chip that repeated the title** (ADR-0163's amendment, owner report 2026-08-04).
// §3's fallback titles a hire with no company by its TYPE LABEL, which is right on every
// title-only surface and made the Index row say `השכרת רכב` twice, adjacent.
describe('scheduleParts (ADR-0179 §2d) — which EDGE the row is reading', () => {
  const hotel = booking('h', 'hotel', BOOKING_TYPE.HOTEL);

  it('reads the START edge before and on the opening day', () => {
    const ahead = span_(linkedEvent('h', '2026-07-10', '15:00'), '2026-07-14', '11:00');
    expect(scheduleParts(ahead, hotel, EVIDENCE, new Date(NOW), TRIP).edge).toBe('start');
    const onTheDay = span_(linkedEvent('h', '2026-07-07', '15:00'), '2026-07-10', '11:00');
    expect(scheduleParts(onTheDay, hotel, EVIDENCE, new Date(NOW), TRIP).edge).toBe('start');
  });

  it('flips to the CLOSING edge once the opening day has passed — the one row the verb is kept for', () => {
    const midStay = span_(linkedEvent('h', '2026-07-05', '15:00'), '2026-07-14', '11:00');
    const parts = scheduleParts(midStay, hotel, EVIDENCE, new Date(NOW), TRIP);
    expect(parts.edge).toBe('end');
    // The verb is the only thing that can say WHICH end this is — `11:00` cannot.
    expect(parts.verb).toBe('צ׳ק-אאוט');
  });

  it('a single-day booking is always a start edge, so it never draws the verb on the row', () => {
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const parts = scheduleParts(
      linkedEvent('f', '2026-07-09', '08:30'),
      flight,
      EVIDENCE,
      new Date(NOW),
      TRIP,
    );
    expect(parts.edge).toBe('start');
    expect(parts.day).toBe('מחרתיים');
    expect(parts.time).toBe('08:30');
  });

  it('still drops the verb entirely once the booking is behind you (ADR-0089 unchanged)', () => {
    const checkedOut = span_(linkedEvent('h', '2026-07-04', '15:00'), '2026-07-07', '11:00');
    const parts = scheduleParts(checkedOut, hotel, EVIDENCE, new Date(NOW), TRIP);
    expect(parts.edge).toBe('end');
    expect(parts.verb).toBeUndefined();
  });

  // **The owner's field report, as the Index row states it** (2026-08-21). The trip's primary
  // zone is Iceland; the flight leaves Tel Aviv. The row read the departure in Reykjavik and
  // so named a time no clock on the itinerary shows — the same defect `BookingDetail` had,
  // one tap away, while the day card beside it was already right.
  it('reads a departure in its ORIGIN zone, not the trip primary (ADR-0107)', () => {
    const flight = booking('f', 'TLV→VIE', BOOKING_TYPE.FLIGHT);
    const withRoute: Booking = { ...flight, fromPlaceId: 'pl-tlv', toPlaceId: 'pl-vie' };
    const ev: TripEvent = {
      ...linkedEvent('f', '2026-07-09', '09:00'),
      startsAt: '2026-07-09T12:30:00Z', // 15:30 in Tel Aviv, 16:15Z arrival in Vienna
      endsAt: '2026-07-09T16:15:00Z',
    };
    const evidence: ZoneEvidence = {
      events: [ev],
      bookings: [withRoute],
      places: [
        { ...place('pl-tlv', 'נתב״ג'), timezone: 'Asia/Jerusalem' },
        { ...place('pl-vie', 'וינה'), timezone: 'Europe/Vienna' },
      ],
      crossings: [],
      primaryZone: 'Atlantic/Reykjavik',
    };
    expect(scheduleParts(ev, withRoute, evidence, new Date(NOW), TRIP).time).toBe('15:30');
  });

  // The closing edge takes the OTHER zone — the row's two edges cannot share one answer,
  // which is the whole reason this reads through `eventDisplayZones` rather than one zone.
  it('reads a closing edge in its DESTINATION zone', () => {
    const hire = booking('c', 'hire', BOOKING_TYPE.CAR);
    const withRoute: Booking = { ...hire, fromPlaceId: 'pl-tlv', toPlaceId: 'pl-vie' };
    const ev: TripEvent = {
      ...linkedEvent('c', '2026-07-05', '09:00'),
      endDate: '2026-07-07',
      endsAt: '2026-07-07T09:00:00Z', // 11:00 in Vienna
    };
    const evidence: ZoneEvidence = {
      events: [ev],
      bookings: [withRoute],
      places: [
        { ...place('pl-tlv', 'נתב״ג'), timezone: 'Asia/Jerusalem' },
        { ...place('pl-vie', 'וינה'), timezone: 'Europe/Vienna' },
      ],
      crossings: [],
      primaryZone: 'Atlantic/Reykjavik',
    };
    // today (07-07 in Tokyo) is past the opening day, so the row reads the closing edge.
    const parts = scheduleParts(ev, withRoute, evidence, new Date(NOW), TRIP);
    expect(parts.edge).toBe('end');
    expect(parts.time).toBe('11:00');
  });

  it('an untimed event still reports its day, so the row keeps a when line to hang the lock on', () => {
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const untimed = { ...linkedEvent('f', '2026-07-09', '08:30'), startsAt: undefined };
    const parts = scheduleParts(untimed, flight, EVIDENCE, new Date(NOW), TRIP);
    expect(parts.time).toBeUndefined();
    expect(parts.day).toBe('מחרתיים');
  });
});

describe('typeChipAddsMeaning', () => {
  it('is false when the BADGE already says the type (ADR-0179 §2b)', () => {
    // The row draws ✈️ beside the chip on an amber transport tint, under a filter chip
    // reading `טיסה N` — the type four times over.
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.FLIGHT, title: 'נתב״ג ← נריטה' }, '✈️')).toBe(
      false,
    );
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.HOTEL, title: 'Granbell' }, '🏨')).toBe(false);
  });

  it('survives exactly where an icon override has taken the type off the badge', () => {
    // `chosenIcon(event?.icon)` lets an event override the glyph, so a hotel wearing ⭐ no
    // longer says what it is — and the chip is the only thing left that can.
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.HOTEL, title: 'Granbell' }, '⭐')).toBe(true);
  });

  it('keeps both terms — either redundancy alone is enough to drop the chip', () => {
    // A hire with no company is titled by its own type label, even wearing an override.
    expect(
      typeChipAddsMeaning({ type: BOOKING_TYPE.CAR, title: t.index.bookingType.car }, '⭐'),
    ).toBe(false);
  });

  it('drops the chip when the title is nothing but the type label', () => {
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.CAR, title: t.index.bookingType.car })).toBe(
      false,
    );
    // Whitespace should not smuggle the chip back in.
    expect(
      typeChipAddsMeaning({ type: BOOKING_TYPE.CAR, title: `  ${t.index.bookingType.car} ` }),
    ).toBe(false);
  });

  it('keeps it whenever the two say different things', () => {
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.CAR, title: 'Hertz' })).toBe(true);
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.HOTEL, title: 'Granbell' })).toBe(true);
    expect(typeChipAddsMeaning({ type: BOOKING_TYPE.FLIGHT, title: 'נתב״ג ← נריטה' })).toBe(true);
  });

  // Keyed on the strings, not on "is this a hire" — so any type that ends up named after
  // itself is covered with no new branch.
  it('covers a non-car type titled by its own label', () => {
    expect(
      typeChipAddsMeaning({ type: BOOKING_TYPE.HOTEL, title: t.index.bookingType.hotel }),
    ).toBe(false);
  });
});
