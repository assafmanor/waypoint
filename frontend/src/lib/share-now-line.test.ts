import { describe, expect, it } from 'vitest';
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  type SharedDay,
  type SharedEvent,
} from '@waypoint/shared';
import { shareNowLine, shareNowZone } from './share-now-line';

const event = (title: string, startLabel?: string, endLabel?: string): SharedEvent => ({
  title,
  daypart: SHARE_DAYPART.MORNING,
  ...(startLabel ? { startLabel } : {}),
  ...(endLabel ? { endLabel } : {}),
});

const day = (sections: SharedDay['sections']): SharedDay => ({
  ordinal: 5,
  date: '2026-09-15',
  timezone: 'Atlantic/Reykjavik',
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

describe('shareNowZone (ADR-0213 eighteenth amendment)', () => {
  const JLM = 'Asia/Jerusalem'; // +03:00 in September
  const KEF = 'Atlantic/Reykjavik'; // GMT year-round
  const TYO = 'Asia/Tokyo'; // +09:00

  /** The shape the derivation reads, and only that. */
  const spine = (...zones: [string, string][]) =>
    zones.map(([date, timezone]) => ({ date, timezone }));

  it('answers the day that holds the moment, on that day’s own clock', () => {
    const days = spine(['2026-09-14', JLM], ['2026-09-15', KEF], ['2026-09-16', KEF]);
    // 10:00 UTC on the 15th: 13:00 in Jerusalem, 10:00 in Reykjavik. Both call it the 15th,
    // and the card for the 15th is an Iceland card.
    expect(shareNowZone(days, JLM, new Date('2026-09-15T10:00:00Z'))).toBe(KEF);
  });

  it('is the departure day’s clock on the trip’s first morning, not the destination’s', () => {
    // The defect, at its plainest: day one is spent at home and the page used to print the
    // destination's clock on it. 06:00 in Tel Aviv is 03:00 in Iceland — a different day by
    // `shareToday`'s dawn rule, so the wrong zone did not merely shift the marker, it marked
    // the wrong card.
    const days = spine(['2026-09-14', JLM], ['2026-09-15', KEF]);
    const firstMorning = new Date('2026-09-14T03:00:00Z'); // 06:00 Jerusalem, 03:00 Reykjavik
    expect(shareNowZone(days, KEF, firstMorning)).toBe(JLM);
  });

  it('resolves an overlap at a seam to the day you are still standing in', () => {
    // Flying east, Jerusalem → Tokyo: the 15th (Jerusalem) runs until 05:00 on the 16th
    // Jerusalem time, and the 16th (Tokyo) began six hours before that. 22:00 Jerusalem on
    // the 15th is already the 16th in Tokyo; the evening is still the 15th's.
    const days = spine(['2026-09-15', JLM], ['2026-09-16', TYO]);
    expect(shareNowZone(days, TYO, new Date('2026-09-15T19:00:00Z'))).toBe(JLM);
  });

  it('fills the gap at the opposite seam with the day just left', () => {
    // Flying west, Tokyo → Jerusalem: the 15th (Tokyo) ends at 05:00 JST on the 16th
    // (20:00 UTC on the 15th) and the 16th (Jerusalem) does not begin until 02:00 UTC on the
    // 16th. Nothing claims those six hours; the clock that fits them is the one just left.
    const days = spine(['2026-09-15', TYO], ['2026-09-16', JLM]);
    const inTheGap = new Date('2026-09-15T22:00:00Z'); // 07:00 JST 16th, 01:00 IDT 16th
    expect(shareNowZone(days, JLM, inTheGap)).toBe(TYO);
  });

  it('falls back to the trip primary before the trip and to its last day after it', () => {
    const days = spine(['2026-09-15', KEF], ['2026-09-16', KEF]);
    expect(shareNowZone(days, JLM, new Date('2026-09-01T12:00:00Z'))).toBe(JLM);
    expect(shareNowZone(days, JLM, new Date('2026-10-01T12:00:00Z'))).toBe(KEF);
    expect(shareNowZone([], JLM, new Date('2026-09-15T12:00:00Z'))).toBe(JLM);
  });

  it('reads a card that swallowed two days as today while either of them is', () => {
    // `SharedDay.endDate` — the return that leaves at 02:00 and lands the next afternoon.
    const days = [
      { date: '2026-09-15', endDate: '2026-09-16', timezone: KEF },
      { date: '2026-09-17', timezone: JLM },
    ];
    expect(shareNowZone(days, JLM, new Date('2026-09-16T12:00:00Z'))).toBe(KEF);
  });
});
