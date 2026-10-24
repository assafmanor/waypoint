// @vitest-environment jsdom
//
// **THE BLOCK'S TWO CLOCKS READ IN THE LEG'S OWN TWO ZONES** (ADR-0206 §AQ1).
//
// Reported off a real trip: a Georgia trip (Asia/Tbilisi, UTC+4) whose stops were all in Israel
// (Asia/Jerusalem, UTC+3). The destination card read `20:00–21:00` and the journey row above it
// advised `יציאה 20:31` — a departure 31 minutes AFTER the thing it was for.
//
// The arithmetic was never wrong. `20:00 − 23 min drive − 5 min buffer` is `19:31`, and `19:31` in
// Jerusalem is `20:31` in Tbilisi: one instant, printed in a zone nobody on the trip was reading a
// watch in. Both day surfaces handed this row `trip.timezone` — the zone the trip is FILED under —
// while the card above it, the card below it and the now-line between them all read through the
// itinerary's own zones. The row was the only clock on the screen not doing so.
//
// **This file is the guard, and it is at the RENDER level deliberately.** The invariant in
// `lib/day-joins.test.ts` (§AQ1) — a stated departure is never later than the arrival it is
// counted back from — was true on `main` and stayed true throughout the defect, because the
// defect was in the formatting and not in the number. Nothing that reads instants could have
// caught it; only something that reads the string a person sees.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TRAVEL_MODE } from '@waypoint/shared';
import { JourneyRow } from './DayJoinRow';
import { dayJourney } from '../../lib/day-joins';
import { withoutBidiControls } from '../../lib/bidi';
import { t } from '../../i18n/he';

/** The reported trip: filed under Georgia, lived in Israel. One hour apart in August, which is
 *  the offset that turned a departure into an arrival. */
const TRIP_ZONE = 'Asia/Tbilisi';
const LEG_ZONE = 'Asia/Jerusalem';

/** The reported leg, to the minute: `פארק ריקה` 17:00–19:00, `כולי עלמא` 20:00–21:00, a 23-minute
 *  drive. Instants, so the fixture cannot drift with the box clock. */
const AT = (hhmm: string) => Date.parse(`2026-08-27T${hhmm}:00+03:00`);
const DRIVE_SECONDS = 1403;

const metaOf = (zones: { depart: string; arrive: string }, nowHHMM = '19:30') => {
  const journey = dayJourney({
    departAfterMs: AT('19:00'),
    arriveByMs: AT('20:00'),
    travelSeconds: DRIVE_SECONDS,
    nowMs: AT(nowHHMM),
  });
  render(<JourneyRow journey={journey!} travelMode={TRAVEL_MODE.DRIVING} zones={zones} />);
  return withoutBidiControls(document.querySelector('.day-trv-meta')?.textContent ?? '');
};

describe('JourneyRow — the departure reads where the traveller is standing (ADR-0206 §AQ1)', () => {
  afterEach(() => cleanup());

  it('states the departure in the leg’s zone, not the trip’s', () => {
    expect(metaOf({ depart: LEG_ZONE, arrive: LEG_ZONE })).toContain('19:31');
  });

  // The defect itself, pinned so the old wiring cannot come back by accident: handed the trip's
  // primary zone, this row prints the hour the report complained about.
  it('printed the reported 20:31 when it was handed the trip’s primary zone', () => {
    expect(metaOf({ depart: TRIP_ZONE, arrive: TRIP_ZONE })).toContain('20:31');
  });

  // **The invariant, at the level the defect actually lived at.** The destination starts at 20:00
  // as the card beside this row prints it; whatever the block says about leaving must be a time
  // before that, read on the same wall.
  it('never states a departure later than the arrival the card names', () => {
    const line = metaOf({ depart: LEG_ZONE, arrive: LEG_ZONE });
    const clock = /(\d{2}):(\d{2})/.exec(line);
    expect(clock).not.toBeNull();
    const minutes = Number(clock![1]) * 60 + Number(clock![2]);
    expect(minutes).toBeLessThan(20 * 60);
  });

  // A leg that crosses a zone has TWO answers, and the row gives each clock to the end it names —
  // so the departure agrees with the card above it and the arrival with the card below. The pair is
  // then deliberately not subtractable, which is ADR-0107's grammar and exactly what the two cards
  // either side of this block already do.
  //
  // Needs a leg that states BOTH clocks, which is §AJ2's clamp: a 25-minute hole holding a
  // 23-minute drive whose buffer does not fit, so the departure is the origin's own end (19:05) and
  // the arrival rides beside it (19:28 where you land, 20:28 where the trip is filed).
  it('gives each clock to the end it names when the leg crosses a zone', () => {
    const both = (zones: { depart: string; arrive: string }) => {
      const journey = dayJourney({
        departAfterMs: AT('19:05'),
        arriveByMs: AT('19:30'),
        travelSeconds: DRIVE_SECONDS,
        nowMs: AT('18:00'),
      });
      render(<JourneyRow journey={journey!} travelMode={TRAVEL_MODE.DRIVING} zones={zones} />);
      return withoutBidiControls(document.querySelector('.day-trv-meta')?.textContent ?? '');
    };
    // Both ends at home: one wall, both clocks on it.
    expect(both({ depart: LEG_ZONE, arrive: LEG_ZONE })).toBe(
      withoutBidiControls(t.travel.leaveThenArrive('19:05', '~19:28')),
    );
    cleanup();
    // Drive across the border: you leave at 19:05 and the clock says 20:28 when you get there.
    expect(both({ depart: LEG_ZONE, arrive: TRIP_ZONE })).toBe(
      withoutBidiControls(t.travel.leaveThenArrive('19:05', '~20:28')),
    );
  });
});
