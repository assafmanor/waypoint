import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import {
  addDays,
  buildTimeTree,
  clampDate,
  dayProgress,
  countdownParts,
  deriveNow,
  eventPhase,
  formatCountdown,
  formatTime,
  formatTripDates,
  relativeDay,
  hardConflicts,
  isoToTimeInput,
  minutesUntil,
  monthLabelFor,
  shiftIso,
  type TimeGroup,
  type TimeItem,
  zonedIso,
  resolveEndIso,
  crossesMidnight,
  crossesMidnightZoned,
  formatZoneDelta,
  zoneOffsetMinutes,
} from './time';
import { DEMO_NOW, EVENTS, TRIP } from '../fixtures';

const tz = TRIP.timezone;
const startsOf = (id: string) => EVENTS.find((e) => e.id === id)!.startsAt!;

describe('formatTripDates', () => {
  it('numeric: compact DD.MM–DD.MM, no year by default', () => {
    expect(formatTripDates('2026-07-20', '2026-07-29')).toBe('20.07–29.07');
  });

  it('numeric with year: appends the middle-dot separator + year', () => {
    expect(formatTripDates('2026-07-20', '2026-07-29', { withYear: true })).toBe(
      '20.07–29.07 · 2026',
    );
  });

  // Prose with year — the trip-settings record. The four localized cases the
  // format must handle, year never repeated when both ends share it.
  it('prose+year, same day: one full date', () => {
    expect(formatTripDates('2026-09-11', '2026-09-11', { style: 'prose', withYear: true })).toBe(
      '11 בספטמבר 2026',
    );
  });

  it('prose+year, same month & year: day range + one month + year', () => {
    expect(formatTripDates('2026-09-11', '2026-09-22', { style: 'prose', withYear: true })).toBe(
      '11–22 בספטמבר 2026',
    );
  });

  it('prose+year, different months same year: year once, at the end', () => {
    expect(formatTripDates('2026-09-27', '2026-10-03', { style: 'prose', withYear: true })).toBe(
      '27 בספטמבר – 3 באוקטובר 2026',
    );
  });

  it('prose+year, December→January: year on both ends', () => {
    expect(formatTripDates('2026-12-27', '2027-01-03', { style: 'prose', withYear: true })).toBe(
      '27 בדצמבר 2026 – 3 בינואר 2027',
    );
  });

  it('uses an en dash (–), never a hyphen', () => {
    const range = formatTripDates('2026-09-11', '2026-09-22', { style: 'prose', withYear: true });
    expect(range).toContain('–');
    expect(range).not.toContain('-');
  });

  // Prose without year — hero surfaces (PlanHome) stay year-free in every case.
  it('prose without year: collapses a same-month range to one month name', () => {
    expect(formatTripDates('2026-07-20', '2026-07-29', { style: 'prose' })).toBe('20–29 ביולי');
  });

  it('prose without year: names both ends across a month boundary', () => {
    expect(formatTripDates('2026-07-29', '2026-08-03', { style: 'prose' })).toBe(
      '29 ביולי – 3 באוגוסט',
    );
  });

  it('prose without year: stays year-free even across a year boundary', () => {
    expect(formatTripDates('2026-12-27', '2027-01-03', { style: 'prose' })).toBe(
      '27 בדצמבר – 3 בינואר',
    );
  });

  it('reads dates as calendar days in UTC, immune to the runtime zone', () => {
    expect(formatTripDates('2026-01-01', '2026-01-01')).toBe('01.01–01.01');
  });
});

describe('deriveNow', () => {
  it('picks the in-progress soft block as now and the next planned event', () => {
    const { now, next } = deriveNow(EVENTS, DEMO_NOW);
    expect(now?.id).toBe('ev-shinjuku');
    expect(next?.id).toBe('ev-ichiran');
  });

  it('skips done/skipped events when choosing next', () => {
    const withoutIchiran = EVENTS.map((e) =>
      e.id === 'ev-ichiran' ? { ...e, status: EVENT_STATUS.SKIPPED } : e,
    );
    expect(deriveNow(withoutIchiran, DEMO_NOW).next?.id).toBe('ev-goldengai');
  });

  it('returns no now during a gap between events', () => {
    const gap = new Date('2026-07-07T21:15:00+09:00'); // after Ichiran ends, before Golden Gai
    const { now, next } = deriveNow(EVENTS, gap);
    expect(now).toBeUndefined();
    expect(next?.id).toBe('ev-goldengai');
  });
});

describe('eventPhase', () => {
  const soft = EVENTS.find((e) => e.id === 'ev-shinjuku')!; // 16:30–18:00 JST
  const before = new Date('2026-07-07T10:00:00+09:00');
  const during = new Date('2026-07-07T17:00:00+09:00');
  const after = new Date('2026-07-07T20:00:00+09:00');

  it('derives upcoming / now / passed from the clock against the event span', () => {
    expect(eventPhase(soft, before)).toBe('upcoming');
    expect(eventPhase(soft, during)).toBe('now');
    expect(eventPhase(soft, after)).toBe('passed');
  });

  it('lets a human-set status win over the clock', () => {
    expect(eventPhase({ ...soft, status: EVENT_STATUS.DONE }, before)).toBe('done');
    expect(eventPhase({ ...soft, status: EVENT_STATUS.SKIPPED }, during)).toBe('skipped');
  });

  it('reads an untimed planned event as upcoming (no span to place)', () => {
    expect(eventPhase({ ...soft, startsAt: undefined, endsAt: undefined }, after)).toBe('upcoming');
  });

  it('uses start ≤ now < end, matching deriveNow (end-exclusive)', () => {
    const start = new Date(soft.startsAt!);
    const end = new Date(soft.endsAt!);
    expect(eventPhase(soft, start)).toBe('now');
    expect(eventPhase(soft, end)).toBe('passed');
  });
});

describe('countdown + progress at the demo instant (18:52 JST)', () => {
  it('counts 38 minutes to Ichiran at 19:30', () => {
    expect(minutesUntil(startsOf('ev-ichiran'), DEMO_NOW)).toBe(38);
  });

  it('is ~74% through the 07:00–23:00 window', () => {
    expect(Math.round(dayProgress(DEMO_NOW, tz) * 100)).toBe(74);
  });

  it('formats the clock in the trip timezone', () => {
    expect(formatTime(DEMO_NOW, tz)).toBe('18:52');
  });
});

describe('addDays', () => {
  it('steps a date string forward and backward', () => {
    expect(addDays('2026-07-13', 1)).toBe('2026-07-14');
    expect(addDays('2026-07-13', -1)).toBe('2026-07-12');
  });

  it('crosses month/year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('monthLabelFor', () => {
  // Mirrors App.tsx's Header day-strip build: each date fed with the previous
  // pill's date (undefined for the first).
  const labelIndices = (dates: string[]) =>
    dates.flatMap((date, i) => (monthLabelFor(date, dates[i - 1]) ? [i] : []));

  it('labels only the first pill for a single-month trip', () => {
    const dates = ['2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14'];
    expect(labelIndices(dates)).toEqual([0]);
  });

  it('labels the first pill and each month rollover for a multi-month trip', () => {
    // Jul 29 -> Aug 3: rollover lands on index 3 (Aug 1).
    const dates = ['2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
    expect(labelIndices(dates)).toEqual([0, 3]);
  });

  it('sources the abbreviation from Intl, not a hardcoded table', () => {
    expect(monthLabelFor('2026-08-01', '2026-07-31')).toBe(
      new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' }).format(
        new Date('2026-08-01T00:00:00Z'),
      ),
    );
  });
});

describe('clampDate', () => {
  it('passes dates already inside the range through unchanged', () => {
    expect(clampDate('2026-07-10', '2026-07-05', '2026-07-15')).toBe('2026-07-10');
  });

  it('clamps a date below the range up to the minimum', () => {
    expect(clampDate('2026-07-01', '2026-07-05', '2026-07-15')).toBe('2026-07-05');
  });

  it('clamps a date past the range down to the maximum — the activeDate rollover bug', () => {
    expect(clampDate('2026-07-20', '2026-07-05', '2026-07-15')).toBe('2026-07-15');
  });
});

describe('shiftIso', () => {
  it('shifts an instant by whole minutes', () => {
    expect(shiftIso('2026-07-07T19:30:00+09:00', 30)).toBe('2026-07-07T11:00:00.000Z');
  });
});

describe('zonedIso', () => {
  it('combines a date + time reading them as wall-clock in the given timezone', () => {
    expect(zonedIso('2026-07-07', '19:30', 'Asia/Tokyo')).toBe('2026-07-07T10:30:00.000Z');
  });

  it('is DST-aware (same wall time, different offset either side of a transition)', () => {
    // America/New_York: EST (UTC-5) before, EDT (UTC-4) after the 2026-03-08 spring-forward.
    expect(zonedIso('2026-03-01', '12:00', 'America/New_York')).toBe('2026-03-01T17:00:00.000Z');
    expect(zonedIso('2026-06-01', '12:00', 'America/New_York')).toBe('2026-06-01T16:00:00.000Z');
  });

  it('resolves both sides of a same-day spring-forward transition correctly', () => {
    // 2026-03-08: clocks jump 02:00 EST (-05:00) -> 03:00 EDT (-04:00) at 07:00 UTC.
    // A naive single-lookup (e.g. anchored at noon UTC) gets the 01:30 case wrong by an hour.
    expect(zonedIso('2026-03-08', '01:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
    expect(zonedIso('2026-03-08', '04:30', 'America/New_York')).toBe('2026-03-08T08:30:00.000Z');
  });

  it('resolves both sides of a same-day fall-back transition correctly', () => {
    // 2026-11-01: clocks fall back 02:00 EDT (-04:00) -> 01:00 EST (-05:00) at 06:00 UTC.
    expect(zonedIso('2026-11-01', '00:30', 'America/New_York')).toBe('2026-11-01T04:30:00.000Z');
    expect(zonedIso('2026-11-01', '03:30', 'America/New_York')).toBe('2026-11-01T08:30:00.000Z');
  });

  it('handles half-hour and quarter-hour zone offsets', () => {
    expect(zonedIso('2026-07-07', '12:00', 'Asia/Kolkata')).toBe('2026-07-07T06:30:00.000Z'); // +05:30
    expect(zonedIso('2026-07-07', '12:00', 'Asia/Kathmandu')).toBe('2026-07-07T06:15:00.000Z'); // +05:45
  });

  it('resolves to a stable instant for a nonexistent (skipped) wall time without looping', () => {
    // 02:30 never occurs on 2026-03-08 (clocks jump 02:00 -> 03:00) — must not throw or hang.
    expect(() => zonedIso('2026-03-08', '02:30', 'America/New_York')).not.toThrow();
  });

  it('round-trips through isoToTimeInput for the trip timezone', () => {
    const iso = zonedIso('2026-07-07', '19:30', 'Asia/Tokyo');
    expect(isoToTimeInput(iso, 'Asia/Tokyo')).toBe('19:30');
  });
});

describe('resolveEndIso (overnight events, ADR-0037)', () => {
  it('keeps a later end on the same day', () => {
    expect(resolveEndIso('2026-07-07', '19:30', '21:00', 'Asia/Tokyo')).toBe(
      zonedIso('2026-07-07', '21:00', 'Asia/Tokyo'),
    );
  });

  it('rolls an earlier end onto the next calendar day', () => {
    // 23:00 → 02:00 is the next morning, a later instant, not a 21h backwards span.
    expect(resolveEndIso('2026-07-07', '23:00', '02:00', 'Asia/Tokyo')).toBe(
      zonedIso('2026-07-08', '02:00', 'Asia/Tokyo'),
    );
  });
});

describe('crossesMidnight', () => {
  it('is true only when start and end fall on different local days', () => {
    const start = zonedIso('2026-07-07', '23:00', 'Asia/Tokyo');
    expect(
      crossesMidnight(start, zonedIso('2026-07-08', '02:00', 'Asia/Tokyo'), 'Asia/Tokyo'),
    ).toBe(true);
    expect(
      crossesMidnight(start, zonedIso('2026-07-07', '23:45', 'Asia/Tokyo'), 'Asia/Tokyo'),
    ).toBe(false);
  });
});

describe('crossesMidnightZoned', () => {
  it('reads each end in its own zone — a TLV→Tokyo flight lands "+1" (ADR-0107 §8)', () => {
    // Depart 23:00 in Tel Aviv; land the next Tokyo calendar day.
    const dep = zonedIso('2026-07-07', '23:00', 'Asia/Jerusalem');
    const arr = zonedIso('2026-07-08', '18:00', 'Asia/Tokyo');
    expect(crossesMidnightZoned(dep, arr, 'Asia/Jerusalem', 'Asia/Tokyo')).toBe(true);
  });

  it('is false when both ends land on the same calendar day in their own zones', () => {
    // A short eastward hop that stays within one calendar day at each end.
    const dep = zonedIso('2026-07-07', '08:00', 'Asia/Jerusalem');
    const arr = zonedIso('2026-07-07', '15:00', 'Asia/Tokyo');
    expect(crossesMidnightZoned(dep, arr, 'Asia/Jerusalem', 'Asia/Tokyo')).toBe(false);
  });

  it('reduces to the single-zone crossesMidnight when both zones match', () => {
    const start = zonedIso('2026-07-07', '23:00', 'Asia/Tokyo');
    const end = zonedIso('2026-07-08', '02:00', 'Asia/Tokyo');
    expect(crossesMidnightZoned(start, end, 'Asia/Tokyo', 'Asia/Tokyo')).toBe(
      crossesMidnight(start, end, 'Asia/Tokyo'),
    );
  });
});

describe('zone offset + delta (ADR-0107)', () => {
  it('reads a zone offset in signed minutes, DST-correct', () => {
    const july = new Date('2026-07-15T12:00:00Z');
    expect(zoneOffsetMinutes(july, 'Asia/Tokyo')).toBe(540); // +9, no DST
    expect(zoneOffsetMinutes(july, 'Asia/Jerusalem')).toBe(180); // +3 (IDT, summer)
    expect(zoneOffsetMinutes(july, 'Atlantic/Reykjavik')).toBe(0); // GMT year-round
    expect(zoneOffsetMinutes(july, 'America/New_York')).toBe(-240); // -4 (EDT)
    expect(zoneOffsetMinutes(july, 'Asia/Kolkata')).toBe(330); // +5:30
  });

  it('formats a signed shift, hours unit for whole hours and H:MM for fractional', () => {
    expect(formatZoneDelta(360)).toBe('+6 ש׳');
    expect(formatZoneDelta(-180)).toBe('−3 ש׳'); // real minus sign, never a hyphen
    expect(formatZoneDelta(330)).toBe('+5:30');
    expect(formatZoneDelta(-345)).toBe('−5:45');
  });
});

describe('formatCountdown', () => {
  it('uses minutes under an hour', () => {
    expect(formatCountdown(1)).toEqual({ value: '1', unit: 'דקה' });
    expect(formatCountdown(38)).toEqual({ value: '38', unit: 'דקות' });
  });

  it('uses H:MM hours from an hour up to a day', () => {
    expect(formatCountdown(60)).toEqual({ value: '1:00', unit: 'שעות' });
    expect(formatCountdown(135)).toEqual({ value: '2:15', unit: 'שעות' });
  });

  it('uses a Hebrew day count from a day up (dual form, no numeral for 1-2)', () => {
    expect(formatCountdown(24 * 60)).toEqual({ value: '', unit: 'יום' });
    expect(formatCountdown(2 * 24 * 60)).toEqual({ value: '', unit: 'יומיים' });
    expect(formatCountdown(5 * 24 * 60 + 30)).toEqual({ value: '5', unit: 'ימים' });
  });
});

describe('relativeDay', () => {
  it('names near days in both directions', () => {
    expect(relativeDay(0)).toBe('היום');
    expect(relativeDay(1)).toBe('מחר');
    expect(relativeDay(2)).toBe('מחרתיים');
    expect(relativeDay(-1)).toBe('אתמול');
    expect(relativeDay(-2)).toBe('שלשום');
  });

  it('counts up past two days out (dual/plural via dayPhrase)', () => {
    expect(relativeDay(3)).toBe('עוד 3 ימים');
    expect(relativeDay(9)).toBe('עוד 9 ימים');
    expect(relativeDay(-3)).toBe('לפני 3 ימים');
    expect(relativeDay(-7)).toBe('לפני 7 ימים');
  });
});

describe('countdownParts', () => {
  it('reads near days as standalone words (no "בעוד" connective)', () => {
    expect(countdownParts(0)).toEqual({ value: '', unit: 'היום', prefix: '' });
    expect(countdownParts(1)).toEqual({ value: '', unit: 'מחר', prefix: '' });
    expect(countdownParts(2)).toEqual({ value: '', unit: 'מחרתיים', prefix: '' });
  });

  it('counts up with the connective past two days out', () => {
    expect(countdownParts(3)).toEqual({ value: '3', unit: 'ימים', prefix: 'בעוד' });
    expect(countdownParts(45)).toEqual({ value: '45', unit: 'ימים', prefix: 'בעוד' });
    expect(countdownParts(60)).toEqual({ value: '60', unit: 'ימים', prefix: 'בעוד' });
  });

  it('rounds to months past two months out (dual form included)', () => {
    expect(countdownParts(61)).toEqual({ value: '', unit: 'חודשיים', prefix: 'בעוד' });
    expect(countdownParts(100)).toEqual({ value: '3', unit: 'חודשים', prefix: 'בעוד' });
    expect(countdownParts(200)).toEqual({ value: '7', unit: 'חודשים', prefix: 'בעוד' });
  });
});

describe('hardConflicts', () => {
  const shinjuku = EVENTS.find((e) => e.id === 'ev-shinjuku')!;
  const ichiran = EVENTS.find((e) => e.id === 'ev-ichiran')!;

  it('is empty when a soft event only touches the following hard event (no overlap)', () => {
    expect(hardConflicts(shinjuku, EVENTS)).toEqual([]);
  });

  it("flags the hard event once the soft event's end runs past its start", () => {
    const delayed = { ...shinjuku, endsAt: shiftIso(shinjuku.endsAt!, 30) };
    expect(hardConflicts(delayed, EVENTS).map((e) => e.id)).toEqual(['ev-ichiran']);
  });

  it('ignores overlap between two soft events', () => {
    const a: TripEvent = {
      ...shinjuku,
      id: 'x-a',
      startsAt: '2026-07-07T10:00:00+09:00',
      endsAt: '2026-07-07T11:00:00+09:00',
    };
    const b: TripEvent = {
      ...shinjuku,
      id: 'x-b',
      startsAt: '2026-07-07T10:30:00+09:00',
      endsAt: '2026-07-07T11:30:00+09:00',
    };
    expect(hardConflicts(a, [a, b])).toEqual([]);
  });

  it('returns nothing for a hard event itself', () => {
    expect(hardConflicts(ichiran, EVENTS)).toEqual([]);
  });
});

describe('buildTimeTree — containment forest + per-level clustering', () => {
  const DAY = '2027-02-01';
  const at = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  let seq = 0;
  const ev = (
    id: string,
    start: string | null,
    end: string | null,
    kind: TripEvent['kind'] = EVENT_KIND.SOFT,
  ) =>
    ({
      id,
      tripId: 't',
      date: DAY,
      title: id,
      kind,
      startsAt: start ? at(start) : undefined,
      endsAt: end ? at(end) : undefined,
      status: EVENT_STATUS.PLANNED,
      sortOrder: seq++,
      source: 'manual',
      createdAt: at('00:00'),
      updatedAt: at('00:00'),
      updatedBy: 'u',
    }) satisfies TripEvent;

  // Compact structural view: 'id' for a leaf, {nest,children} for a container,
  // {cluster} for a partial-overlap group.
  type Shape = string | { nest: string; children: Shape[] } | { cluster: Shape[] };
  const itemShape = (item: TimeItem): Shape =>
    item.children.length === 0
      ? item.event.id
      : { nest: item.event.id, children: shape(item.children) };
  const shape = (groups: TimeGroup[]): Shape[] =>
    groups.map((g) =>
      g.kind === 'cluster' ? { cluster: g.items.map(itemShape) } : itemShape(g.item),
    );

  it('leaves non-overlapping events as flat singles', () => {
    const tree = buildTimeTree([
      ev('A', '09:00', '10:00'),
      ev('B', '11:00', '12:00'),
      ev('C', '13:00', '14:00'),
    ]);
    expect(shape(tree)).toEqual(['A', 'B', 'C']);
  });

  it('treats back-to-back (end === start) as NOT overlapping', () => {
    const tree = buildTimeTree([ev('A', '09:00', '10:00'), ev('B', '10:00', '11:00')]);
    expect(shape(tree)).toEqual(['A', 'B']);
  });

  it('clusters a partial overlap', () => {
    const tree = buildTimeTree([ev('A', '11:00', '13:00'), ev('B', '12:30', '14:00')]);
    expect(shape(tree)).toEqual([{ cluster: ['A', 'B'] }]);
  });

  it('nests a contained event under its container', () => {
    const tree = buildTimeTree([ev('A', '10:00', '18:00'), ev('B', '13:00', '14:00')]);
    expect(shape(tree)).toEqual([{ nest: 'A', children: ['B'] }]);
  });

  it('nests multiple contained events flat under one envelope', () => {
    const tree = buildTimeTree([
      ev('A', '10:00', '18:00'),
      ev('B', '11:00', '12:00'),
      ev('C', '13:00', '14:00'),
    ]);
    expect(shape(tree)).toEqual([{ nest: 'A', children: ['B', 'C'] }]);
  });

  it('nests a chain A ⊃ B ⊃ C (parent = smallest container)', () => {
    const tree = buildTimeTree([
      ev('A', '10:00', '20:00'),
      ev('B', '17:00', '19:00'),
      ev('C', '18:00', '18:45'),
    ]);
    expect(shape(tree)).toEqual([{ nest: 'A', children: [{ nest: 'B', children: ['C'] }] }]);
  });

  it('composes: overlap WITHIN containment (a nest holding a cluster)', () => {
    const tree = buildTimeTree([
      ev('A', '10:00', '18:00'),
      ev('B', '11:00', '13:00'),
      ev('C', '12:30', '14:00'),
    ]);
    expect(shape(tree)).toEqual([{ nest: 'A', children: [{ cluster: ['B', 'C'] }] }]);
  });

  it('composes: containment WITHIN overlap (a cluster member that is a nest)', () => {
    const tree = buildTimeTree([
      ev('A', '09:00', '12:00'),
      ev('D', '11:00', '18:00'),
      ev('E', '13:00', '14:00'),
    ]);
    expect(shape(tree)).toEqual([{ cluster: ['A', { nest: 'D', children: ['E'] }] }]);
  });

  it('treats equal spans as cluster peers, never nested', () => {
    const tree = buildTimeTree([ev('A', '10:00', '12:00'), ev('B', '10:00', '12:00')]);
    expect(shape(tree)).toEqual([{ cluster: ['A', 'B'] }]);
  });

  it('ignores skipped/unscheduled events but keeps done ones (they hold their slot)', () => {
    const done = { ...ev('D', '09:00', '10:00'), status: EVENT_STATUS.DONE };
    const skipped = { ...ev('S', '11:00', '12:00'), status: EVENT_STATUS.SKIPPED };
    const unscheduled = ev('U', null, null);
    const tree = buildTimeTree([done, skipped, unscheduled, ev('A', '13:00', '14:00')]);
    expect(shape(tree)).toEqual(['D', 'A']);
  });
});

describe('deriveNow — concurrent now/next sets', () => {
  const DAY = '2027-02-02';
  const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00Z`);
  const iso = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  let seq = 0;
  const ev = (id: string, start: string, end: string, kind: TripEvent['kind'] = EVENT_KIND.SOFT) =>
    ({
      id,
      tripId: 't',
      date: DAY,
      title: id,
      kind,
      startsAt: iso(start),
      endsAt: iso(end),
      status: EVENT_STATUS.PLANNED,
      sortOrder: seq++,
      source: 'manual',
      createdAt: iso('00:00'),
      updatedAt: iso('00:00'),
      updatedBy: 'u',
    }) satisfies TripEvent;

  it('returns every in-progress event, hard first as the primary', () => {
    const soft = ev('soft', '10:00', '17:00');
    const hard = ev('hard', '15:00', '16:00', EVENT_KIND.HARD);
    const { now, nowAll } = deriveNow([soft, hard], at('15:20'));
    expect(now?.id).toBe('hard');
    expect(nowAll.map((e) => e.id)).toEqual(['hard', 'soft']);
  });

  it('orders equal-kind concurrent events by ends-soonest', () => {
    const longer = ev('longer', '10:00', '16:00');
    const shorter = ev('shorter', '11:00', '15:00');
    const { now, nowAll } = deriveNow([longer, shorter], at('12:00'));
    expect(now?.id).toBe('shorter');
    expect(nowAll.map((e) => e.id)).toEqual(['shorter', 'longer']);
  });

  it('groups nextAll by the earliest upcoming start', () => {
    const p = ev('p', '18:00', '19:00');
    const q = ev('q', '18:00', '18:30');
    const later = ev('later', '20:00', '21:00');
    const { next, nextAll } = deriveNow([p, q, later], at('12:00'));
    expect(next?.id).toBe('q');
    expect(nextAll.map((e) => e.id)).toEqual(['q', 'p']);
  });
});
