import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { buildDayGlance, ambientEventsOnDate } from './glance';

const TZ = 'Asia/Tokyo';
const OFF = '+09:00';
const DATE = '2026-07-07';
const at = (time: string, date = DATE) => `${date}T${time}:00${OFF}`;
const ms = (time: string, date = DATE) => Date.parse(at(time, date));
const day07 = ms('07:00');
const day23 = ms('23:00');

let seq = 0;
function ev(partial: Partial<TripEvent>): TripEvent {
  return {
    id: partial.id ?? `ev-${++seq}`,
    tripId: 't',
    date: DATE,
    title: partial.title ?? 'x',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    source: EVENT_SOURCE.MANUAL,
    sortOrder: 1,
    createdAt: at('00:00'),
    updatedAt: at('00:00'),
    updatedBy: 'u',
    ...partial,
  };
}

describe('buildDayGlance', () => {
  it('is empty when the day has no timed/skipped events', () => {
    const g = buildDayGlance([], DATE, ms('12:00'), day07, day23, TZ);
    expect(g.empty).toBe(true);
    expect(g.segs).toHaveLength(0);
    expect(g.markers).toHaveLength(0);
  });

  it('places sequential events and counts only now+upcoming as remaining', () => {
    const now = ms('12:30');
    const events = [
      ev({ id: 'a', status: EVENT_STATUS.DONE, startsAt: at('10:00'), endsAt: at('11:00') }),
      ev({ id: 'b', startsAt: at('12:00'), endsAt: at('13:00') }), // now
      ev({ id: 'c', startsAt: at('15:00'), endsAt: at('16:00') }), // upcoming
    ];
    const g = buildDayGlance(events, DATE, now, day07, day23, TZ);
    expect(g.empty).toBe(false);
    expect(g.segs).toHaveLength(3);
    expect(g.remaining).toBe(2); // b (now) + c (upcoming); a is done
    const a = g.segs.find((s) => s.key === 'a')!;
    expect(a.phase).toBe('done');
    expect(g.segs.find((s) => s.key === 'b')!.phase).toBe('now');
    expect(g.segs.find((s) => s.key === 'c')!.phase).toBe('upcoming');
    // 10:00 sits 3h into a 16h window → 0.1875 from the window start.
    expect(a.startFrac).toBeCloseTo(3 / 16, 5);
  });

  it('stretches the window to an overnight end, not padded to 07:00', () => {
    const events = [ev({ id: 'party', startsAt: at('22:00'), endsAt: at('02:00', '2026-07-08') })];
    const g = buildDayGlance(events, DATE, ms('23:30'), day07, day23, TZ);
    expect(g.windowStartMs).toBe(day07);
    expect(g.windowEndMs).toBe(ms('02:00', '2026-07-08')); // the actual end, not 07:00 next day
    expect(g.segs[0].nextDay).toBe(true);
    expect(g.segs[0].endFrac).toBeCloseTo(1, 5);
  });

  it('layers skipped events back in as struck segments, uncounted', () => {
    const now = ms('12:00');
    const events = [
      ev({ id: 'keep', startsAt: at('15:00'), endsAt: at('16:00') }),
      ev({ id: 'drop', status: EVENT_STATUS.SKIPPED, startsAt: at('10:00'), endsAt: at('11:00') }),
    ];
    const g = buildDayGlance(events, DATE, now, day07, day23, TZ);
    const skip = g.segs.find((s) => s.key === 'drop')!;
    expect(skip.phase).toBe('skipped');
    expect(g.remaining).toBe(1); // only the kept upcoming event
  });

  it('collapses a partial-overlap cluster to one composite segment (×N)', () => {
    const events = [
      ev({ id: 'bar', startsAt: at('20:00'), endsAt: at('22:00') }),
      ev({ id: 'gig', startsAt: at('21:00'), endsAt: at('23:00') }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.segs).toHaveLength(1);
    expect(g.segs[0].composite).toBe(true);
    expect(g.segs[0].clusterLike).toBe(true);
    expect(g.segs[0].count).toBe(2);
    expect(g.remaining).toBe(1); // the cluster is one block
  });

  it('collapses an envelope with nested children to one composite segment (כולל N)', () => {
    const events = [
      ev({ id: 'beach', startsAt: at('10:00'), endsAt: at('18:00') }),
      ev({ id: 'lunch', startsAt: at('12:00'), endsAt: at('13:00') }),
      ev({ id: 'kayak', startsAt: at('14:00'), endsAt: at('15:00') }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.segs).toHaveLength(1);
    expect(g.segs[0].composite).toBe(true);
    expect(g.segs[0].clusterLike).toBe(false);
    expect(g.segs[0].count).toBe(2); // two nested descendants
  });

  it('drops the count chip on a too-narrow composite (avoids adjacent-chip overlap)', () => {
    // Two short back-to-back clusters, each ~1h of a 16h window (~6%) — under the
    // width floor, so neither shows a number (the layered cue still marks them).
    const events = [
      ev({ id: 'a1', startsAt: at('09:00'), endsAt: at('10:00') }),
      ev({ id: 'a2', startsAt: at('09:30'), endsAt: at('10:00') }),
      ev({ id: 'b1', startsAt: at('10:30'), endsAt: at('11:30') }),
      ev({ id: 'b2', startsAt: at('11:00'), endsAt: at('11:30') }),
      // a wide envelope for contrast — this one keeps its number
      ev({ id: 'env', startsAt: at('13:00'), endsAt: at('19:00') }),
      ev({ id: 'kid', startsAt: at('14:00'), endsAt: at('15:00') }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    const composites = g.segs.filter((s) => s.composite);
    expect(composites).toHaveLength(3);
    expect(composites.filter((s) => s.showCount)).toHaveLength(1); // only the wide envelope
    expect(composites.every((s) => s.composite)).toBe(true); // all still marked composite
  });

  it('excludes an ambient hotel span from the rail + remaining (ADR-0054/0063)', () => {
    const now = ms('12:30');
    const events = [
      // a 4-night hotel checked in today: endsAt is days away, endDate set,
      // lodging category → isAmbient
      ev({
        id: 'hotel',
        category: 'lodging',
        kind: EVENT_KIND.HARD,
        startsAt: at('15:00'),
        endsAt: at('11:00', '2026-07-11'),
        endDate: '2026-07-11',
      }),
      ev({ id: 'b', startsAt: at('12:00'), endsAt: at('13:00') }), // now
      ev({ id: 'c', startsAt: at('15:00'), endsAt: at('16:00') }), // upcoming
    ];
    const g = buildDayGlance(events, DATE, now, day07, day23, TZ);
    // The hotel neither distorts the window (no multi-day stretch) nor counts.
    expect(g.windowEndMs).toBe(day23);
    expect(g.segs.some((s) => s.key === 'hotel')).toBe(false);
    expect(g.segs).toHaveLength(2);
    expect(g.remaining).toBe(2); // b + c only — the hotel is backdrop
  });

  it('marks a same-day flight departure + arrival as edge markers on its counted block', () => {
    const events = [
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        icon: '✈️',
        startsAt: at('09:00'),
        endsAt: at('11:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('08:00'), day07, day23, TZ);
    // The same-day flight is a counted block AND carries two markers.
    expect(g.segs.some((s) => s.key === 'flight')).toBe(true);
    expect(g.remaining).toBe(1);
    const keys = g.markers.map((m) => m.labelKey);
    // A flight refines to take-off/landing, not the generic departure/arrival.
    expect(keys).toEqual(['flightDeparture', 'flightArrival']); // sorted by clock position
    const dep = g.markers.find((m) => m.labelKey === 'flightDeparture')!;
    expect(dep.frac).toBeCloseTo(2 / 16, 5); // 09:00 is 2h into the 07:00 window
    expect(dep.icon).toBe('✈️');
  });

  it('marks a same-day train with generic departure/arrival, not flight wording', () => {
    const events = [
      ev({
        id: 'train',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        icon: '🚄',
        startsAt: at('09:00'),
        endsAt: at('11:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('08:00'), day07, day23, TZ);
    expect(g.markers.map((m) => m.labelKey)).toEqual(['departure', 'arrival']);
  });

  it('stacks two close transition markers into separate lanes (no chip overlap)', () => {
    // A short red-eye: departure + arrival only ~1h apart on a 16h window (~6%),
    // well under the chip-width gap, so they must not share a lane.
    const events = [
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        icon: '✈️',
        startsAt: at('22:00'),
        endsAt: at('23:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.markers).toHaveLength(2);
    expect(g.markerLaneCount).toBe(2);
    expect(g.markers.map((m) => m.lane).sort()).toEqual([0, 1]);
  });

  it('keeps well-separated markers on a single lane', () => {
    const events = [
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        startsAt: at('08:00'),
        endsAt: at('20:00'), // 12h apart → far beyond the gap
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.markerLaneCount).toBe(1);
    expect(g.markers.every((m) => m.lane === 0)).toBe(true);
  });

  it('stretches the window to a late transition so its marker stays on the rail', () => {
    // An overnight (ambient) flight departs late and lands after midnight: it is
    // not a counted block that stretches the window, so without folding the
    // transition instants in, the arrival marker would land past frac 1 and clip.
    const events = [
      ev({
        id: 'redeye',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        date: DATE,
        startsAt: at('23:30'),
        endsAt: at('02:00', '2026-07-08'),
        endDate: '2026-07-08',
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('20:00'), day07, day23, TZ);
    // Ambient → not a counted block, but its departure marks this day.
    expect(g.segs.some((s) => s.key === 'redeye')).toBe(false);
    const dep = g.markers.find((m) => m.labelKey === 'departure')!;
    expect(dep).toBeDefined();
    expect(dep.frac).toBeGreaterThanOrEqual(0);
    expect(dep.frac).toBeLessThanOrEqual(1);
    expect(g.windowEndMs).toBe(ms('23:30')); // stretched to the departure instant
  });

  it('is not empty on a day carrying only a transition marker', () => {
    // A hotel whose check-out lands on a day with no other events: the marker
    // must still render (previously the day read as empty and dropped it).
    const checkoutDay = '2026-07-10';
    const events = [
      ev({
        id: 'hotel',
        category: 'lodging',
        date: '2026-07-07',
        startsAt: at('15:00', '2026-07-07'),
        endsAt: at('11:00', checkoutDay),
        endDate: checkoutDay,
      }),
    ];
    const g = buildDayGlance(
      events,
      checkoutDay,
      ms('08:00', checkoutDay),
      ms('07:00', checkoutDay),
      ms('23:00', checkoutDay),
      TZ,
    );
    expect(g.empty).toBe(false);
    expect(g.markers).toHaveLength(1);
    expect(g.markers[0].labelKey).toBe('checkOut');
    expect(g.remaining).toBe(0);
  });

  it('marks an ambient hotel check-in on its check-in day, uncounted', () => {
    const events = [
      ev({
        id: 'hotel',
        category: 'lodging',
        icon: '🏨',
        startsAt: at('15:00'),
        endsAt: at('11:00', '2026-07-10'),
        endDate: '2026-07-10',
      }),
      ev({ id: 'other', startsAt: at('10:00'), endsAt: at('11:00') }),
    ];
    const g = buildDayGlance(events, DATE, ms('09:00'), day07, day23, TZ);
    expect(g.segs.some((s) => s.key === 'hotel')).toBe(false); // uncounted
    expect(g.markers).toHaveLength(1);
    expect(g.markers[0].labelKey).toBe('checkIn');
    expect(g.markers[0].frac).toBeCloseTo(8 / 16, 5); // 15:00 → 8h into the window
  });

  it('marks an ambient hotel check-out on its check-out day (backdrop, not a block)', () => {
    const checkoutDay = '2026-07-10';
    const events = [
      ev({
        id: 'hotel',
        category: 'lodging',
        date: '2026-07-07',
        startsAt: at('15:00', '2026-07-07'),
        endsAt: at('11:00', checkoutDay),
        endDate: checkoutDay,
      }),
      ev({
        id: 'brunch',
        date: checkoutDay,
        startsAt: at('09:00', checkoutDay),
        endsAt: at('10:00', checkoutDay),
      }),
    ];
    const g = buildDayGlance(
      events,
      checkoutDay,
      ms('08:00', checkoutDay),
      ms('07:00', checkoutDay),
      ms('23:00', checkoutDay),
      TZ,
    );
    // On the check-out day the hotel is not a block, but its check-out is marked.
    expect(g.segs.some((s) => s.key === 'hotel')).toBe(false);
    expect(g.markers).toHaveLength(1);
    expect(g.markers[0].labelKey).toBe('checkOut');
  });

  it('shows no rail marker on a middle night of a stay', () => {
    const middle = '2026-07-08';
    const events = [
      ev({
        id: 'hotel',
        category: 'lodging',
        date: '2026-07-07',
        startsAt: at('15:00', '2026-07-07'),
        endsAt: at('11:00', '2026-07-10'),
        endDate: '2026-07-10',
      }),
      ev({ id: 'walk', date: middle, startsAt: at('10:00', middle), endsAt: at('11:00', middle) }),
    ];
    const g = buildDayGlance(
      events,
      middle,
      ms('12:00', middle),
      ms('07:00', middle),
      ms('23:00', middle),
      TZ,
    );
    expect(g.markers).toHaveLength(0);
    expect(g.remaining).toBe(0); // walk already passed; hotel uncounted
  });

  it('finds ambient stays active on a date across their whole span (ADR-0054/0063)', () => {
    const hotel = ev({
      id: 'hotel',
      category: 'lodging',
      date: '2026-07-07',
      endDate: '2026-07-10',
    });
    const events = [hotel, ev({ id: 'plain', date: '2026-07-08' })];
    // check-in day, a middle night, checkout day → all covered; before/after not.
    expect(ambientEventsOnDate(events, '2026-07-07').map((e) => e.id)).toEqual(['hotel']);
    expect(ambientEventsOnDate(events, '2026-07-09').map((e) => e.id)).toEqual(['hotel']);
    expect(ambientEventsOnDate(events, '2026-07-10').map((e) => e.id)).toEqual(['hotel']);
    expect(ambientEventsOnDate(events, '2026-07-11')).toHaveLength(0);
    expect(ambientEventsOnDate(events, '2026-07-06')).toHaveLength(0);
  });

  it('does not treat a multi-day non-ambient event as ambient (profile-keyed)', () => {
    // A multi-day sightseeing pass has no ambient profile → stays a counted block.
    const pass = ev({
      id: 'pass',
      category: 'sightseeing',
      date: '2026-07-07',
      endDate: '2026-07-09',
    });
    expect(ambientEventsOnDate([pass], '2026-07-08')).toHaveLength(0);
  });

  it('reports nowFrac only when now is inside the window', () => {
    const events = [ev({ startsAt: at('10:00'), endsAt: at('11:00') })];
    expect(buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ).nowFrac).toBeCloseTo(
      5 / 16,
      5,
    );
    // browsing a future day: now is before the window start
    expect(buildDayGlance(events, DATE, ms('06:00'), day07, day23, TZ).nowFrac).toBeNull();
    // a past day: now is after the window end
    expect(buildDayGlance(events, DATE, ms('23:30'), day07, day23, TZ).nowFrac).toBeNull();
  });
});
