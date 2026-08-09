// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FxRates } from '@waypoint/shared';
import { RateCard, rateLine } from './RateCard';

/** A trimmed real set. USD base, because that is what the provider serves keyless. */
const FX: FxRates = {
  base: 'USD',
  rates: { USD: 1, ILS: 3.7, JPY: 152.1, KWD: 0.307 },
  publishedAt: '2026-08-09T00:02:31.000Z',
  nextUpdateAt: '2026-08-10T00:02:31.000Z',
  provider: 'Rates By Exchange Rate API',
  providerUrl: 'https://www.exchangerate-api.com',
};

afterEach(cleanup);

const card = (over: Partial<Parameters<typeof RateCard>[0]> = {}) =>
  render(<RateCard fx={FX} from="JPY" to="ILS" asOf="9.8" onOpen={vi.fn()} {...over} />).container;

describe('rateLine — the base is one a person can hold (ADR-0180 §5)', () => {
  it('states a small rate per 100, not per unit', () => {
    // `¥1 = ₪0.0243` is the same fact and does not fit at 360px. The point of
    // `rateBase` is that the LEFT side moves, so the right side clears 1.
    const line = rateLine(FX, 'JPY', 'ILS')!;
    expect(line).toContain('100');
    expect(line).not.toContain('0.02');
  });

  it('gives each side its OWN exponent, from one code path', () => {
    // The whole of §5, and it has to be asserted PER SIDE — the first draft
    // checked the whole line and failed on `₪1.00 = ¥41`, which is the correct
    // answer: the shekel side wants its two places and the yen side wants none,
    // in the same string. A `/100` anywhere in this chain would be wrong at one
    // end of the range or the other.
    const sides = (from: string, to: string) => rateLine(FX, from, to)!.split(' = ');
    // JPY → ILS: no minor unit on the left, two places on the right.
    expect(sides('JPY', 'ILS')[0]).not.toMatch(/\.\d/);
    expect(sides('JPY', 'ILS')[1]).toMatch(/\.\d{2}\D*$/);
    // ILS → JPY, the same pair reversed: the decimals swap sides with it.
    expect(sides('ILS', 'JPY')[0]).toMatch(/\.\d{2}\D*$/);
    expect(sides('ILS', 'JPY')[1]).not.toMatch(/\.\d/);
    // KWD is the third case the old `/100` comment did not know existed.
    expect(sides('ILS', 'KWD')[1]).toMatch(/\.\d{3}\D*$/);
  });

  it('answers null for a pair the source cannot price', () => {
    // Not an error and not a throw: no free source prices every ISO-4217 code,
    // and the picker deliberately offers every one the runtime knows.
    expect(rateLine(FX, 'JPY', 'KPW')).toBeNull();
  });
});

describe('RateCard — absence is keyed on existence, not age (§4)', () => {
  it('renders a set of ANY age, including one long past its next update', () => {
    // The card must not disappear because a rate is stale: a published rate is
    // still the last published rate, and offline-with-a-cache is deliberately
    // indistinguishable from stale here.
    const { container } = render(
      <RateCard
        fx={{ ...FX, nextUpdateAt: '2000-01-01T00:00:00.000Z' }}
        from="JPY"
        to="ILS"
        asOf="9.8"
        onOpen={vi.fn()}
      />,
    );
    expect(container.querySelector('.fx-card')).not.toBeNull();
  });

  it('renders nothing at all when there is no set', () => {
    expect(card({ fx: null }).querySelector('.fx-card')).toBeNull();
  });

  it('renders nothing when the trip has no currency', () => {
    expect(card({ from: null }).querySelector('.fx-card')).toBeNull();
  });

  it('renders nothing when the pair cannot be priced', () => {
    expect(card({ to: 'KPW' }).querySelector('.fx-card')).toBeNull();
  });
});

describe('RateCard — the whole card is the target (§3)', () => {
  it('is one button and holds no link of its own', () => {
    const container = card();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    // §9's attribution is the host's line, deliberately outside this component:
    // an `<a>` inside a `<button>` is invalid markup before it is a second target.
    expect(container.querySelector('a')).toBeNull();
  });

  it('opens the converter on a press', () => {
    const onOpen = vi.fn();
    render(<RateCard fx={FX} from="JPY" to="ILS" asOf="9.8" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows the source publication date it was handed, not a fetch time', () => {
    expect(card().textContent).toContain('9.8');
  });
});
