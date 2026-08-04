import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPE,
  CATEGORY_DEFAULT_ICON,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import {
  ambientEventsOnDate,
  ambientSpanLabel,
  ambientSpanPosition,
  buildDayGlance,
  countsNights,
} from './glance';
import { DEFAULT_EVENT_ICON } from '../constants';
import { tripZoneCrossings, type ZoneContext } from './places';

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
    expect(g.anchors).toHaveLength(0);
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
    // The hotel neither distorts the window (no multi-day stretch) nor draws a block.
    expect(g.windowEndMs).toBe(day23);
    expect(g.segs.some((s) => s.key === 'hotel')).toBe(false);
    expect(g.segs).toHaveLength(2);
    // **Its CHECK-IN still counts** (ADR-0164). This assertion read `2` — b + c only —
    // while ADR-0077's "marking a transition is not counting a block" applied to the
    // number as well as to the rail. It does not any more: a 15:00 check-in with luggage
    // is a timed thing you can miss, and it lands on THIS day. The stay is still off the
    // counted rail, which is what ADR-0054 actually protects.
    expect(g.remaining).toBe(3); // b + c + the check-in ahead at 15:00
  });

  // The other half of the same rule, and the one that keeps ADR-0054 intact: a middle
  // night has nothing to do about the room, so it counts nothing.
  it('counts nothing for an ambient stay on a MIDDLE night (ADR-0164)', () => {
    const hotel = ev({
      id: 'hotel',
      category: 'lodging',
      kind: EVENT_KIND.HARD,
      startsAt: at('15:00'),
      endsAt: at('11:00', '2026-07-11'),
      endDate: '2026-07-11',
    });
    const g = buildDayGlance(
      [hotel],
      '2026-07-09',
      ms('12:30', '2026-07-09'),
      ms('07:00', '2026-07-09'),
      ms('23:00', '2026-07-09'),
      TZ,
    );
    expect(g.remaining).toBe(0);
    expect(g.anchors).toHaveLength(0);
  });

  it("counts an ambient span's CHECK-OUT on its own day, and not once it has passed", () => {
    const hotel = ev({
      id: 'hotel',
      category: 'lodging',
      kind: EVENT_KIND.HARD,
      startsAt: at('15:00'),
      endsAt: at('11:00', '2026-07-11'),
      endDate: '2026-07-11',
    });
    const before = buildDayGlance(
      [hotel],
      '2026-07-11',
      ms('09:00', '2026-07-11'),
      ms('07:00', '2026-07-11'),
      ms('23:00', '2026-07-11'),
      TZ,
    );
    expect(before.remaining).toBe(1); // check-out at 11:00 still ahead
    const after = buildDayGlance(
      [hotel],
      '2026-07-11',
      ms('12:00', '2026-07-11'),
      ms('07:00', '2026-07-11'),
      ms('23:00', '2026-07-11'),
      TZ,
    );
    expect(after.remaining).toBe(0); // behind you now
  });

  // **The guard against double-counting**, and the reason the rule keys on `isAmbient`
  // rather than on "has transitions": a same-day journey is already a counted block.
  it('does not count a same-day flight twice, block and transition', () => {
    const flight = ev({
      id: 'fl',
      category: 'transport',
      icon: '✈️',
      kind: EVENT_KIND.HARD,
      startsAt: at('14:00'),
      endsAt: at('16:00'),
    });
    const g = buildDayGlance([flight], DATE, ms('09:00'), day07, day23, TZ);
    expect(g.remaining).toBe(1);
    expect(g.anchors).toHaveLength(1); // drawn as a span anchor, counted once
  });

  // A multi-day CAR HIRE is the report that found this, and it must behave exactly like
  // the stay above — the rule is about spans, not about cars (ADR-0164).
  it("counts a car hire's pick-up and return, but not the days between", () => {
    const hire = ev({
      id: 'car',
      category: 'transport',
      icon: '🚗',
      kind: EVENT_KIND.HARD,
      startsAt: at('10:00'),
      endsAt: at('10:00', '2026-07-12'),
      endDate: '2026-07-12',
    });
    expect(buildDayGlance([hire], DATE, ms('08:00'), day07, day23, TZ).remaining).toBe(1); // pick-up
    expect(
      buildDayGlance(
        [hire],
        '2026-07-09',
        ms('08:00', '2026-07-09'),
        ms('07:00', '2026-07-09'),
        ms('23:00', '2026-07-09'),
        TZ,
      ).remaining,
    ).toBe(0);
    expect(
      buildDayGlance(
        [hire],
        '2026-07-12',
        ms('08:00', '2026-07-12'),
        ms('07:00', '2026-07-12'),
        ms('23:00', '2026-07-12'),
        TZ,
      ).remaining,
    ).toBe(1); // return
  });

  it('pairs a same-day flight into one span anchor over its counted block', () => {
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
    // The same-day flight is a counted block AND a single paired span anchor.
    const seg = g.segs.find((s) => s.key === 'flight')!;
    expect(seg).toBeDefined();
    expect(seg.spanned).toBe(true); // block tinted + yields "+1" to the span pill
    expect(g.remaining).toBe(1);
    expect(g.anchors).toHaveLength(1);
    const span = g.anchors[0];
    expect(span.kind).toBe('span');
    if (span.kind === 'span') {
      // A flight refines to take-off/landing, not the generic departure/arrival.
      expect(span.startLabelKey).toBe('flightDeparture');
      expect(span.endLabelKey).toBe('flightArrival');
      expect(span.startFrac).toBeCloseTo(2 / 16, 5); // 09:00 is 2h into the 07:00 window
      expect(span.endFrac).toBeCloseTo(4 / 16, 5); // 11:00 is 4h in
      expect(span.icon).toBe('✈️');
      expect(span.nextDay).toBe(false);
    }
  });

  // Reported from the phone: two skipped bus legs sat in the day's shelf and still
  // drew amber pills on the glance, reading exactly like the two flights that were
  // really happening. The struck block stays (ADR-0045); the commitment doesn't.
  it('gives a skipped bracketed booking a struck block but no anchor', () => {
    const events = [
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        startsAt: at('09:00'),
        endsAt: at('11:00'),
      }),
      ev({
        id: 'bus',
        category: 'transport',
        status: EVENT_STATUS.SKIPPED,
        startsAt: at('12:00'),
        endsAt: at('13:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('08:00'), day07, day23, TZ);
    expect(g.anchors.map((a) => a.key)).toEqual(['flight']);
    const bus = g.segs.find((s) => s.key === 'bus')!;
    expect(bus.phase).toBe('skipped');
    expect(bus.spanned).toBe(false); // no pill above it to tie the block to
    expect(g.remaining).toBe(1);
  });

  it('is empty on a day whose only bracketed booking is skipped and ambient', () => {
    const events = [
      ev({
        id: 'stay',
        category: 'lodging',
        date: DATE,
        endDate: '2026-07-09',
        status: EVENT_STATUS.SKIPPED,
        startsAt: at('15:00'),
        endsAt: at('11:00', '2026-07-09'),
      }),
    ];
    expect(buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ).empty).toBe(true);
  });

  // An event created with no category keeps the form's DEFAULT pin, and editing it
  // later to add one does NOT re-derive the glyph (`EventForm` treats an existing
  // event's icon as chosen). So a categorised event can still be carrying `📌` —
  // and before `chosenIcon` that pin shadowed the category's own glyph here.
  it('prefers the category glyph over an event still carrying the default pin', () => {
    const events = [
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        icon: DEFAULT_EVENT_ICON,
        startsAt: at('09:00'),
        endsAt: at('11:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('08:00'), day07, day23, TZ);
    const span = g.anchors[0];
    expect(span.kind).toBe('span');
    if (span.kind === 'span') {
      expect(span.icon).toBe(CATEGORY_DEFAULT_ICON.transport);
      expect(span.icon).not.toBe(DEFAULT_EVENT_ICON);
    }
  });

  it('still lets a genuinely picked glyph win over the category', () => {
    const events = [
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        icon: '🚀',
        startsAt: at('09:00'),
        endsAt: at('11:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('08:00'), day07, day23, TZ);
    const span = g.anchors[0];
    if (span.kind === 'span') expect(span.icon).toBe('🚀');
  });

  it('keeps the generic departure/arrival wording for a same-day train span', () => {
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
    const span = g.anchors[0];
    expect(span.kind).toBe('span');
    if (span.kind === 'span') {
      expect(span.startLabelKey).toBe('departure');
      expect(span.endLabelKey).toBe('arrival');
    }
  });

  it('draws a short red-eye as one span, not two stacked markers', () => {
    // Departure + arrival ~1h apart: as separate pills they used to ladder into
    // two lanes; as a span they are one object (ADR-0077).
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
    expect(g.anchors).toHaveLength(1);
    expect(g.anchors[0].kind).toBe('span');
    expect(g.anchorLaneCount).toBe(1);
    expect(g.anchorsCollapsed).toBe(false);
  });

  it('keeps well-separated anchors on a single lane', () => {
    const events = [
      // an ambient hotel check-in (a point) far from a morning flight (a span)
      ev({
        id: 'hotel',
        category: 'lodging',
        startsAt: at('15:00'),
        endsAt: at('11:00', '2026-07-10'),
        endDate: '2026-07-10',
      }),
      ev({
        id: 'flight',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        startsAt: at('08:00'),
        endsAt: at('09:30'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.anchors).toHaveLength(2);
    expect(g.anchorLaneCount).toBe(1);
    expect(g.anchorsCollapsed).toBe(false);
    expect(g.anchors.every((a) => a.lane === 0)).toBe(true);
  });

  it('pushes two pill-width-apart anchors onto separate lanes (no smear)', () => {
    // A checkout (point) and a check-in (point) ~0.30 of the rail apart: wide
    // enough that the old gap (0.28) kept them on one lane, where two heavy
    // pills still visually cover each other. The gap now matches a real phone
    // pill (~0.36), so they split to two lanes instead of smearing (ADR-0077).
    const events = [
      ev({
        id: 'hotelOut',
        category: 'lodging',
        date: '2026-07-04',
        startsAt: at('15:00', '2026-07-04'),
        endsAt: at('10:00'), // check-out today → a point at 0.1875
        endDate: DATE,
      }),
      ev({
        id: 'hotelIn',
        category: 'lodging',
        startsAt: at('14:48'), // check-in today → a point at ~0.4875 (gap ~0.30)
        endsAt: at('11:00', '2026-07-10'),
        endDate: '2026-07-10',
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.anchors).toHaveLength(2);
    expect(g.anchors.every((a) => a.kind === 'point')).toBe(true);
    expect(g.anchorLaneCount).toBe(2);
    expect(g.anchorsCollapsed).toBe(false); // two lanes is still readable above
    expect(g.anchors[0].lane).not.toBe(g.anchors[1].lane);
  });

  it('collapses a crowded anchor band to the legs line (ADR-0077 §D)', () => {
    // Three transition anchors clustered around midday → they would need >2
    // lanes, so the band collapses.
    const events = [
      ev({
        id: 'hotelOut',
        category: 'lodging',
        date: '2026-07-04',
        startsAt: at('15:00', '2026-07-04'),
        endsAt: at('11:30'), // check-out today
        endDate: DATE,
      }),
      ev({
        id: 'hotelIn',
        category: 'lodging',
        startsAt: at('12:30'), // check-in today
        endsAt: at('11:00', '2026-07-10'),
        endDate: '2026-07-10',
      }),
      ev({
        id: 'ferry',
        category: 'transport',
        kind: EVENT_KIND.HARD,
        startsAt: at('13:00'),
        endsAt: at('14:00'),
      }),
    ];
    const g = buildDayGlance(events, DATE, ms('12:00'), day07, day23, TZ);
    expect(g.anchors).toHaveLength(3);
    expect(g.anchorLaneCount).toBeGreaterThan(2);
    expect(g.anchorsCollapsed).toBe(true);
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
    // Ambient → not a counted block, but its departure marks this day (a point,
    // since the arrival lands on the next day).
    expect(g.segs.some((s) => s.key === 'redeye')).toBe(false);
    const dep = g.anchors.find((a) => a.kind === 'point' && a.labelKey === 'departure');
    expect(dep).toBeDefined();
    if (dep && dep.kind === 'point') {
      expect(dep.frac).toBeGreaterThanOrEqual(0);
      expect(dep.frac).toBeLessThanOrEqual(1);
    }
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
    expect(g.anchors).toHaveLength(1);
    const a = g.anchors[0];
    expect(a.kind).toBe('point');
    if (a.kind === 'point') expect(a.labelKey).toBe('checkOut');
    // Was `0` — the day drew the marker and counted nothing, so a day whose only real
    // commitment was being out of the room by 11:00 read `0 נותרו היום` (ADR-0164).
    expect(g.remaining).toBe(1);
  });

  it('marks an ambient hotel check-in on its check-in day (off the rail, but counted)', () => {
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
    expect(g.anchors).toHaveLength(1);
    const a = g.anchors[0];
    expect(a.kind).toBe('point');
    if (a.kind === 'point') {
      expect(a.labelKey).toBe('checkIn');
      expect(a.frac).toBeCloseTo(8 / 16, 5); // 15:00 → 8h into the window
    }
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
    expect(g.anchors).toHaveLength(1);
    const a = g.anchors[0];
    expect(a.kind).toBe('point');
    if (a.kind === 'point') expect(a.labelKey).toBe('checkOut');
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
    expect(g.anchors).toHaveLength(0);
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

  // ── THE AMBIENT STRIP'S READ-OUT (ADR-0163 §4) ────────────────────────────────
  // One derivation, and it replaced three hand-copied `stayNight`/`stayNights` pairs in
  // `DayView`, `PlanDay` and `Home` — so these are the first assertions the arithmetic
  // has ever had.
  describe('ambientSpanPosition / ambientSpanLabel', () => {
    const hotel = ev({
      category: 'lodging',
      icon: '🏨',
      date: '2026-07-07',
      endDate: '2026-07-11', // four nights
    });
    // A hire is `transport` + `🚗`, which is what carries its unit (ADR-0162 §3).
    const hire = ev({
      category: 'transport',
      icon: '🚗',
      date: '2026-07-07',
      endDate: '2026-07-12', // five days
    });

    it('counts the span and where the date falls inside it', () => {
      expect(ambientSpanPosition(hotel, '2026-07-07')).toEqual({ position: 1, total: 4 });
      expect(ambientSpanPosition(hotel, '2026-07-09')).toEqual({ position: 3, total: 4 });
      expect(ambientSpanPosition(hotel, '2026-07-11')).toEqual({ position: 4, total: 4 });
    });

    // A date outside the span cannot read `6 מתוך 4`, and a zero-length one cannot
    // read `0` — both clamped, because the caller decides which days show the strip.
    it('clamps to the span rather than counting past its ends', () => {
      expect(ambientSpanPosition(hotel, '2026-07-20').position).toBe(4);
      expect(ambientSpanPosition(hotel, '2026-07-01').position).toBe(1);
      const sameDay = ev({ category: 'lodging', date: '2026-07-07', endDate: '2026-07-07' });
      expect(ambientSpanPosition(sameDay, '2026-07-07')).toEqual({ position: 1, total: 1 });
    });

    // **The report.** A stay reads in nights; a hire read in nights too, which is a
    // hotel's word on a vehicle.
    it('reads a stay in nights and a hire in days', () => {
      expect(countsNights(hotel)).toBe(true);
      expect(countsNights(hire)).toBe(false);
      expect(ambientSpanLabel(hotel, '2026-07-09')).toBe('לילה 3 מתוך 4');
      // Jul 7 → Jul 12 is FIVE nights and SIX days — the hire's total said 5 until
      // ADR-0163 §4's amendment, because the unit changed and the count did not.
      expect(ambientSpanLabel(hire, '2026-07-09')).toBe('יום 3 מתוך 6');
    });

    // **The owner's example, exactly** (2026-08-04): a car held over days 1–3 of the trip
    // is three days, where the same dates are two nights in a room. This is the whole
    // difference between the two units, so it gets its own assertion rather than living
    // inside the one above.
    it('counts days 1→3 as three days for a hire and two nights for a stay', () => {
      const dates = { date: '2026-07-07', endDate: '2026-07-09' };
      const car = ev({ category: 'transport', icon: '🚗', ...dates });
      const room = ev({ category: 'lodging', icon: '🏨', ...dates });

      expect(ambientSpanPosition(car, '2026-07-07')).toEqual({ position: 1, total: 3 });
      expect(ambientSpanPosition(car, '2026-07-08')).toEqual({ position: 2, total: 3 });
      expect(ambientSpanPosition(car, '2026-07-09')).toEqual({ position: 3, total: 3 });
      expect(ambientSpanLabel(car, '2026-07-07')).toBe('יום 1 מתוך 3');

      expect(ambientSpanPosition(room, '2026-07-07')).toEqual({ position: 1, total: 2 });
      expect(ambientSpanLabel(room, '2026-07-08')).toBe('לילה 2 מתוך 2');
    });

    // The unit follows the GLYPH, not the category — so a hire keeps its days even
    // though it shares `transport` with every bus (ADR-0162 §3's refinement).
    it('leaves other transport on the category answer', () => {
      const bus = ev({
        category: 'transport',
        icon: '🚌',
        date: '2026-07-07',
        endDate: '2026-07-09',
      });
      expect(countsNights(bus)).toBe(false);
      // Three dates, so three days — the inclusive count applies to every non-nights
      // span, not only to the hire that exposed it.
      expect(ambientSpanLabel(bus, '2026-07-08')).toBe('יום 2 מתוך 3');
    });
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

describe('buildDayGlance — per-anchor display zones (ADR-0107)', () => {
  const JLM = 'Asia/Jerusalem';
  const KEF = 'Atlantic/Reykjavik';
  const place = (id: string, timezone: string): Place => ({
    id,
    tripId: 't',
    name: id,
    timezone,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  });
  const places = [place('tlv', JLM), place('kef', KEF)];
  const flightBooking: Booking = {
    id: 'bk',
    tripId: 't',
    type: BOOKING_TYPE.FLIGHT,
    title: 'flight',
    source: EVENT_SOURCE.MANUAL,
    fromPlaceId: 'tlv',
    toPlaceId: 'kef',
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  };
  // A westbound flight: 07:15 Jerusalem → 11:00 Reykjavik, a 6h45 flight that looks
  // like 3h45 if both ends are painted in one zone.
  const flight = ev({
    id: 'flight',
    bookingId: 'bk',
    category: 'transport',
    kind: EVENT_KIND.HARD,
    icon: '✈️',
    startsAt: '2026-07-07T07:15:00+03:00',
    endsAt: '2026-07-07T11:00:00+00:00',
  });
  const ctx = (events: TripEvent[]): ZoneContext => ({
    bookings: [flightBooking],
    places,
    crossings: tripZoneCrossings(events, [flightBooking], places),
    primaryZone: JLM,
    ambientZone: JLM,
  });

  it("attaches both ends' zones + the shift to a crossing span anchor", () => {
    const events = [flight];
    const g = buildDayGlance(events, DATE, ms('06:00'), day07, day23, JLM, ctx(events));
    const span = g.anchors[0];
    expect(span.kind).toBe('span');
    if (span.kind === 'span') {
      expect(span.zones?.startZone).toBe(JLM);
      expect(span.zones?.endZone).toBe(KEF);
      expect(span.zones?.deltaMinutes).toBe(-180); // Reykjavik is 3h behind
    }
  });

  it('leaves anchors zone-less without a context, so an un-wired caller is unchanged', () => {
    const g = buildDayGlance([flight], DATE, ms('06:00'), day07, day23, JLM);
    const span = g.anchors[0];
    if (span.kind === 'span') expect(span.zones).toBeUndefined();
  });

  it('decides the "+1" per-zone, so a same-local-day arrival is not marked next-day', () => {
    // 23:00 Jerusalem → 23:00 Reykjavik, a 3h westbound hop that lands the SAME
    // local day at its destination but reads as 02:00 next-day in the origin's zone.
    const redEye = ev({
      id: 'red',
      bookingId: 'bk',
      category: 'transport',
      kind: EVENT_KIND.HARD,
      startsAt: '2026-07-07T23:00:00+03:00',
      endsAt: '2026-07-07T23:00:00+00:00',
    });
    const events = [redEye];
    const zoned = buildDayGlance(events, DATE, ms('12:00'), day07, day23, JLM, ctx(events));
    const flat = buildDayGlance(events, DATE, ms('12:00'), day07, day23, JLM);
    const zonedSpan = zoned.anchors[0];
    const flatSpan = flat.anchors[0];
    if (zonedSpan.kind === 'span') expect(zonedSpan.nextDay).toBe(false);
    if (flatSpan.kind === 'span') expect(flatSpan.nextDay).toBe(true);
  });

  it("attaches a point anchor's own edge zone + its shift vs the day ambient", () => {
    // A hotel whose check-out lands on this day, in a zone 3h behind the ambient.
    const hotel: Booking = {
      ...flightBooking,
      id: 'bk-h',
      type: BOOKING_TYPE.HOTEL,
      fromPlaceId: undefined,
      toPlaceId: undefined,
      placeId: 'kef',
    };
    const stay = ev({
      id: 'stay',
      bookingId: 'bk-h',
      category: 'lodging',
      date: '2026-07-05',
      endDate: DATE,
      startsAt: '2026-07-05T15:00:00+00:00',
      endsAt: '2026-07-07T10:00:00+00:00',
    });
    const g = buildDayGlance([stay], DATE, ms('12:00'), day07, day23, JLM, {
      bookings: [hotel],
      places,
      crossings: [],
      primaryZone: JLM,
      ambientZone: JLM,
    });
    const point = g.anchors[0];
    expect(point.kind).toBe('point');
    if (point.kind === 'point') {
      expect(point.zone).toBe(KEF);
      expect(point.deltaMinutes).toBe(-180);
    }
  });
});
