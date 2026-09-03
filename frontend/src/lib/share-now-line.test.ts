import { describe, expect, it } from 'vitest';
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  type SharedDay,
  type SharedEvent,
} from '@waypoint/shared';
import { shareNowLine } from './share-now-line';

const event = (title: string, startLabel?: string, endLabel?: string): SharedEvent => ({
  title,
  daypart: SHARE_DAYPART.MORNING,
  ...(startLabel ? { startLabel } : {}),
  ...(endLabel ? { endLabel } : {}),
});

const day = (sections: SharedDay['sections']): SharedDay => ({
  ordinal: 5,
  date: '2026-09-15',
  title: { kind: SHARE_DAY_KIND.NONE },
  summary: { kind: SHARE_DAY_SUMMARY_KIND.NONE },
  sections,
});

const FULL_DAY = day([
  {
    daypart: SHARE_DAYPART.MORNING,
    events: [event('Svartifoss', '08:30', '10:00'), event('Skaftafellsjökull', '10:30', '12:00')],
  },
  { daypart: SHARE_DAYPART.NOON, events: [event('Glacier Goodies', '12:30', '13:30')] },
  { daypart: SHARE_DAYPART.AFTERNOON, events: [event('Falljökull', '14:30', '18:00')] },
]);

describe('shareNowLine (ADR-0213 eleventh amendment §5)', () => {
  it('puts the marker above the first row that has not begun', () => {
    expect(shareNowLine(FULL_DAY, '14:05')).toEqual({
      daypart: SHARE_DAYPART.AFTERNOON,
      index: 0,
      inside: null,
    });
  });

  it('nails the marker INSIDE a row that is running, and still names the boundary', () => {
    // 15:00 is inside 14:30–18:00. Until ADR-0217 this was the file's one deviation from
    // `nowLinePlacement` and the choice was between two wrong answers — a line above a
    // running row, or one below it. `inside` is the third: the row holds the moment and the
    // mark goes in it. `daypart`/`index` still name where a boundary WOULD go, which is what
    // the screen falls back to when nothing holds.
    expect(shareNowLine(FULL_DAY, '15:00')).toEqual({
      daypart: SHARE_DAYPART.AFTERNOON,
      index: 1,
      inside: { daypart: SHARE_DAYPART.AFTERNOON, index: 0, thruFrac: 30 / 210 },
    });
  });

  it('is not dragged to the top of the day by an all-day container', () => {
    // The real seeded Tokyo day, which is what found this: a 10:00–16:00 guided tour as the
    // day's first row. Comparing ends, it is still running at 14:30, so the boundary landed
    // above a 10:00 row and told a reader following along that nothing had happened yet.
    const withTour = day([
      {
        daypart: SHARE_DAYPART.MORNING,
        events: [
          event('סיור יום בטוקיו', '10:00', '16:00'),
          event('שוק צוקיג׳י', '10:00', '12:00'),
        ],
      },
      {
        daypart: SHARE_DAYPART.AFTERNOON,
        events: [event('מקדש סנסו-ג׳י', '14:30', '16:00'), event('שינג׳וקו', '16:30', '19:30')],
      },
    ]);
    // …and now the INNERMOST of the two rows holding 14:30 takes the mark: the tour started
    // at 10:00 and the temple at 14:30, so the temple is the one we have just walked into.
    // Same rule, same comparison, same file as the day surfaces (`lib/now-inside.ts`).
    expect(shareNowLine(withTour, '14:30')).toEqual({
      daypart: SHARE_DAYPART.AFTERNOON,
      index: 1,
      inside: { daypart: SHARE_DAYPART.AFTERNOON, index: 0, thruFrac: 0 },
    });
  });

  it('lands after every row once the whole day is behind', () => {
    expect(shareNowLine(FULL_DAY, '22:10')).toEqual({
      daypart: SHARE_DAYPART.AFTERNOON,
      index: 1,
      inside: null,
    });
  });

  it('lands above the very first row before the day starts', () => {
    expect(shareNowLine(FULL_DAY, '06:00')).toEqual({
      daypart: SHARE_DAYPART.MORNING,
      index: 0,
      inside: null,
    });
  });

  it('sorts a pre-dawn hour last, agreeing with the grouping that filed it here', () => {
    // `sharePreviousNight` files a 00:30 landing on the night of the day BEFORE, so this
    // label is the day's LAST row. Ordered as a raw clock time it would be the first, and a
    // marker at 14:05 would sit above an event nineteen hours in the past.
    const withLanding = day([
      ...FULL_DAY.sections,
      { daypart: SHARE_DAYPART.NIGHT, events: [event('נחיתה', '00:30', '01:10')] },
    ]);
    expect(shareNowLine(withLanding, '14:05')).toEqual({
      daypart: SHARE_DAYPART.AFTERNOON,
      index: 0,
      inside: null,
    });
    expect(shareNowLine(withLanding, '23:00')).toEqual({
      daypart: SHARE_DAYPART.NIGHT,
      index: 0,
      inside: null,
    });
    // …and the same landing HOLDS the moment at 00:50, which needs no special case: both of
    // its labels are pre-dawn, so `dawnOrder` adds a day to each and the span is 40 minutes
    // long rather than 1400 minutes backwards.
    expect(shareNowLine(withLanding, '00:50')?.inside).toEqual({
      daypart: SHARE_DAYPART.NIGHT,
      index: 0,
      thruFrac: 20 / 40,
    });
  });

  it('refuses a day that crosses a time zone', () => {
    // `nowLabel` is the primary zone's wall clock; a travel day's labels are resolved per
    // event in their own zone (ADR-0107), so the comparison would be wrong by the shift.
    const travelDay = day([
      {
        daypart: SHARE_DAYPART.MORNING,
        events: [{ ...event('TLV → KEF', '08:00', '14:25'), zoneShiftMinutes: -180 }],
      },
    ]);
    expect(shareNowLine(travelDay, '10:00')).toBeNull();
  });

  it('refuses a day with no timed row at all — Summary, or a day of only ideas', () => {
    expect(
      shareNowLine(
        day([{ daypart: SHARE_DAYPART.MORNING, events: [event('ת׳ינגווליר')] }]),
        '10:00',
      ),
    ).toBeNull();
    expect(
      shareNowLine(
        day([{ daypart: SHARE_DAYPART.FLEXIBLE, events: [event('אם יישאר זמן')] }]),
        '10:00',
      ),
    ).toBeNull();
    expect(shareNowLine(day([]), '10:00')).toBeNull();
  });

  it('never places the marker inside the flexible remainder', () => {
    // Flexible renders last by design and carries no order, so a marker in it would claim
    // the day's unplaced ideas were part of its chronology.
    const withFlexible = day([
      ...FULL_DAY.sections,
      { daypart: SHARE_DAYPART.FLEXIBLE, events: [event('אם יישאר זמן')] },
    ]);
    expect(shareNowLine(withFlexible, '23:30')?.daypart).toBe(SHARE_DAYPART.AFTERNOON);
  });

  it('handles a row with a start and no end', () => {
    const openEnded = day([
      { daypart: SHARE_DAYPART.MORNING, events: [event('סיור', '09:00')] },
      { daypart: SHARE_DAYPART.EVENING, events: [event('ארוחה', '19:30', '21:00')] },
    ]);
    // **A point cannot hold a moment** (ADR-0217 §4) — and here that falls out of the data
    // rather than out of a rule: no end label, no span. 09:30 is "inside" a 09:00 row only if
    // an end is invented for it, which the projection never sent.
    expect(shareNowLine(openEnded, '09:30')).toEqual({
      daypart: SHARE_DAYPART.EVENING,
      index: 0,
      inside: null,
    });
    expect(shareNowLine(openEnded, '08:30')).toEqual({
      daypart: SHARE_DAYPART.MORNING,
      index: 0,
      inside: null,
    });
  });
});
