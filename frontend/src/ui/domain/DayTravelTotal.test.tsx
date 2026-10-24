// @vitest-environment jsdom
//
// The component's contract is three claims and each is a rule rather than a rendering detail
// (ADR-0206 §V1.9 / §AP): the hedge is on the minutes and never on the kilometres, half a line is
// the honest read where a day has distance and no timeable duration, and nothing at all is what
// an unmeasured day says (§D4).
//
// Queried by `t.*` and never by a copy literal (`frontend/CLAUDE.md`), and the phrases are
// composed from the shipped formatters for the same reason — a spec that hard-codes `3.2 ק״מ`
// asserts the formatter's output rather than this component's.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DayTravelTotal } from './DayTravelTotal';
import { formatDistance } from '../../lib/distance';
import { approxTravelTime } from '../../lib/duration';
import { t } from '../../i18n/he';

describe('DayTravelTotal', () => {
  afterEach(cleanup);

  it('states the distance and the HEDGED duration, in that order', () => {
    render(
      <DayTravelTotal
        total={{ distanceMeters: 3_200, travelSeconds: 48 * 60, partial: false, airMeters: null }}
      />,
    );
    const line = t.travel.dayTotal(formatDistance(3_200), approxTravelTime(48 * 60)!);
    expect(screen.getByText(line)).toBeTruthy();
    // §D5 is what carries "this counts what could be counted", so it has to be ON the minutes and
    // absent from the kilometres — an asserted absence, because the hedge riding the wrong half
    // would still render a plausible-looking line.
    expect(line).toContain('~');
    expect(line.split('·')[0]).not.toContain('~');
  });

  // §AA4's day: real kilometres, no minutes this app may state. Never a `~0 דק׳` beside them.
  it('states the distance alone when no leg could be timed', () => {
    render(
      <DayTravelTotal
        total={{ distanceMeters: 11_700, travelSeconds: null, partial: false, airMeters: null }}
      />,
    );
    expect(screen.getByText(formatDistance(11_700))).toBeTruthy();
  });

  // Hidden rather than zero (§D4) — a day nothing was measured on and a day with no travel in it
  // must read the same, or the reader can tell "not computed" from "not computable".
  it('renders nothing when the day has no distance', () => {
    const { container } = render(
      <DayTravelTotal
        total={{ distanceMeters: null, travelSeconds: null, partial: false, airMeters: null }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  // A duration with no distance is a number about nothing, and the guard is the distance's.
  it('renders nothing on a duration with no distance behind it', () => {
    const { container } = render(
      <DayTravelTotal
        total={{ distanceMeters: null, travelSeconds: 20 * 60, partial: false, airMeters: null }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  // ── A FLOOR SAYS IT IS ONE (ADR-0206 §AT2) ──────────────────────────────────────────────
  //
  // A hole with an end nobody placed is missing from both halves for good, so the same numbers
  // have to make a smaller claim. The word leads the line because each half is a floor.
  it('leads with the floor where a hole could not be measured at all', () => {
    render(
      <DayTravelTotal
        total={{ distanceMeters: 3_200, travelSeconds: 48 * 60, partial: true, airMeters: null }}
      />,
    );
    const line = t.travel.dayTotal(formatDistance(3_200), approxTravelTime(48 * 60)!);
    expect(screen.getByText(t.travel.dayTotalFloor(line))).toBeTruthy();
  });

  // Half a line takes the same word, off the same string — which is why it wraps the line rather
  // than joining the two halves: a day of declared legs has no minutes for a qualifier to attach
  // to, and a second copy of this phrase is what would drift.
  it('leads with the floor on a distance standing alone', () => {
    render(
      <DayTravelTotal
        total={{ distanceMeters: 11_700, travelSeconds: null, partial: true, airMeters: null }}
      />,
    );
    expect(screen.getByText(t.travel.dayTotalFloor(formatDistance(11_700)))).toBeTruthy();
  });

  // A complete day must NOT wear it — an asserted absence, because the qualifier is the whole
  // difference between a total and a floor and a line carrying it always says nothing at all.
  it('says nothing about a floor when every hole was measured', () => {
    render(
      <DayTravelTotal
        total={{ distanceMeters: 3_200, travelSeconds: 48 * 60, partial: false, airMeters: null }}
      />,
    );
    const line = t.travel.dayTotal(formatDistance(3_200), approxTravelTime(48 * 60)!);
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByText(t.travel.dayTotalFloor(line))).toBeNull();
  });

  // ── The air half (ADR-0212 §3) ───────────────────────────────────────────────────────────
  //
  // The claim is a SEPARATION, so the spec is about what the two numbers do to each other: the
  // ground half must read exactly as it did with no flight on the day, and the carried half must
  // not be summed into it. Folding them is what takes 69 ק״מ to 5,362 ק״מ, and a test that only
  // asserted "5,362 appears" would pass on the version this rule exists to prevent.
  it('keeps the air half OUT of the ground half', () => {
    render(
      <DayTravelTotal
        total={{
          distanceMeters: 69_302,
          travelSeconds: 52 * 60,
          partial: false,
          airMeters: 2_361_309 + 2_930_941,
        }}
      />,
    );
    const ground = t.travel.dayTotal(formatDistance(69_302), approxTravelTime(52 * 60)!);
    expect(screen.getByText(ground)).toBeTruthy();
    expect(screen.getByText(formatDistance(2_361_309 + 2_930_941))).toBeTruthy();
    // The combined number must appear NOWHERE — the defect is a plausible-looking single line.
    expect(screen.queryByText(formatDistance(69_302 + 2_361_309 + 2_930_941))).toBeNull();
  });

  // A day whose whole movement is a flight: the guard widened for this, and before §3 it rendered
  // nothing at all because "no ground distance" meant "no travel".
  it('states the air half on a day with no ground travel', () => {
    render(
      <DayTravelTotal
        total={{ distanceMeters: null, travelSeconds: null, partial: false, airMeters: 2_930_941 }}
      />,
    );
    expect(screen.getByText(formatDistance(2_930_941))).toBeTruthy();
  });

  // §D4 survives the widening: neither half means nothing at all, exactly as before.
  it('still renders nothing when the day has neither half', () => {
    const { container } = render(
      <DayTravelTotal
        total={{ distanceMeters: null, travelSeconds: null, partial: false, airMeters: null }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  // The floor is the GROUND half's claim — an unplaced hole is a leg nobody could measure, and a
  // carried leg either has two picked places or has no distance at all. It must not wrap the air.
  it('leaves the air half outside the floor qualifier', () => {
    render(
      <DayTravelTotal
        total={{
          distanceMeters: 3_200,
          travelSeconds: 48 * 60,
          partial: true,
          airMeters: 2_930_941,
        }}
      />,
    );
    const line = t.travel.dayTotal(formatDistance(3_200), approxTravelTime(48 * 60)!);
    expect(screen.getByText(t.travel.dayTotalFloor(line))).toBeTruthy();
    expect(screen.getByText(formatDistance(2_930_941))).toBeTruthy();
  });
});
