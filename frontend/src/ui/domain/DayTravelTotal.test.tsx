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
    render(<DayTravelTotal total={{ distanceMeters: 3_200, travelSeconds: 48 * 60 }} />);
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
    render(<DayTravelTotal total={{ distanceMeters: 11_700, travelSeconds: null }} />);
    expect(screen.getByText(formatDistance(11_700))).toBeTruthy();
  });

  // Hidden rather than zero (§D4) — a day nothing was measured on and a day with no travel in it
  // must read the same, or the reader can tell "not computed" from "not computable".
  it('renders nothing when the day has no distance', () => {
    const { container } = render(
      <DayTravelTotal total={{ distanceMeters: null, travelSeconds: null }} />,
    );
    expect(container.innerHTML).toBe('');
  });

  // A duration with no distance is a number about nothing, and the guard is the distance's.
  it('renders nothing on a duration with no distance behind it', () => {
    const { container } = render(
      <DayTravelTotal total={{ distanceMeters: null, travelSeconds: 20 * 60 }} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
