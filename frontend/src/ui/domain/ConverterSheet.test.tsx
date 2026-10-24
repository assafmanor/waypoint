// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FxRates } from '@waypoint/shared';
import { wrapNav } from '../../test/nav-harness';
import { ConverterSheet } from './ConverterSheet';
import { t } from '../../i18n/he';

const FX: FxRates = {
  base: 'USD',
  rates: { USD: 1, ILS: 3.7, JPY: 152.1, KWD: 0.307 },
  publishedAt: '2026-08-09T00:02:31.000Z',
  nextUpdateAt: '2026-08-10T00:02:31.000Z',
  provider: 'Rates By Exchange Rate API',
  providerUrl: 'https://www.exchangerate-api.com',
};

afterEach(cleanup);

type Props = Parameters<typeof ConverterSheet>[0];
const open = (over: Partial<Props> = {}) => {
  const props: Props = {
    fx: FX,
    from: 'JPY',
    to: 'ILS',
    asOf: '9.8',
    canRefresh: false,
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onChangeFrom: vi.fn(),
    onChangeTo: vi.fn(),
    onSwap: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(wrapNav(<ConverterSheet {...props} />));
  // `Modal` portals to <body>, so the render's own container holds nothing.
  const sides = () => Array.from(document.querySelectorAll<HTMLInputElement>('.cv-amt'));
  return { props, tripField: () => sides()[0], homeField: () => sides()[1] };
};

describe('ConverterSheet — minor units are the arithmetic (ADR-0180 §5)', () => {
  it('converts the typed side into the other, at each currency’s own precision', () => {
    const { tripField, homeField } = open();
    fireEvent.change(tripField(), { target: { value: '1000' } });
    // ¥1,000 at 3.7/152.1 ≈ ₪24.33, and the shekel side shows agorot because the
    // shekel HAS agorot — not because the code assumed two places.
    expect(homeField().value).toBe('24.33');
  });

  it('drives the trip side when the HOME side is the one being typed in', () => {
    // The authored side is whichever was last touched; there is no third state
    // where both are authored, which is what stops the pair drifting.
    const { tripField, homeField } = open();
    fireEvent.change(homeField(), { target: { value: '100' } });
    expect(tripField().value).toBe('4111');
  });

  it('drops a fraction the currency does not have', () => {
    // The yen side of ₪100 is ¥4,111.xx in real arithmetic; JPY's exponent is 0,
    // so the field a person could type back into shows an integer.
    const { tripField, homeField } = open();
    fireEvent.change(homeField(), { target: { value: '100' } });
    expect(tripField().value).not.toContain('.');
  });

  it('keeps a three-place currency’s third place', () => {
    const { tripField, homeField } = open({ to: 'KWD' });
    fireEvent.change(tripField(), { target: { value: '10000' } });
    expect(homeField().value).toMatch(/^\d+\.\d{1,3}$/);
  });

  it('empties the other side rather than showing 0 for a half-typed number', () => {
    const { tripField, homeField } = open();
    fireEvent.change(tripField(), { target: { value: '' } });
    expect(homeField().value).toBe('');
  });

  it('reads a comma as the decimal point a phone keypad meant', () => {
    const { tripField, homeField } = open({ from: 'ILS', to: 'JPY' });
    fireEvent.change(tripField(), { target: { value: '1,5' } });
    expect(homeField().value).toBe('62');
  });
});

describe('ConverterSheet — no error state anywhere on this surface (§4)', () => {
  it('says there is no rate yet, rather than failing, when none is held', () => {
    open({ fx: null });
    expect(screen.getByText(/אין עדיין שער שמור/)).toBeTruthy();
  });

  it('says the pair is unpriceable, in the same voice', () => {
    // A pair the source does not carry degrades EXACTLY like a set we never
    // fetched — a sentence, not an error.
    open({ to: 'KPW' });
    expect(screen.getByText(/אין שער לצמד/)).toBeTruthy();
  });
});

describe('ConverterSheet — the "as of" IS the refresh (§8)', () => {
  it('is plain text when a press could not change the number', () => {
    // The common case: we hold the current set. A control that reliably does
    // nothing implies the number is live and contradicts the date beside it.
    open({ canRefresh: false });
    expect(document.querySelector('button.cv-asof')).toBeNull();
    expect(document.querySelector('.cv-asof')?.textContent).toContain('9.8');
  });

  it('becomes a button once the source says a newer set should exist', () => {
    open({ canRefresh: true });
    expect(document.querySelector('button.cv-asof')).not.toBeNull();
  });

  it('carries a glyph and no word of its own — the date is the label', () => {
    open({ canRefresh: true });
    const btn = document.querySelector('button.cv-asof')!;
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.textContent).toBe('נכון ל־⁦9.8⁩');
  });

  it('asks for a new set on press', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    open({ canRefresh: true, onRefresh });
    fireEvent.click(document.querySelector('button.cv-asof')!);
    expect(onRefresh).toHaveBeenCalled();
  });
});

describe('ConverterSheet — the pair is the sheet’s, not the trip’s', () => {
  it('turns the pair over without writing either setting', () => {
    const { props } = open();
    fireEvent.click(screen.getByLabelText(t.fx.swap));
    expect(props.onSwap).toHaveBeenCalled();
    expect(props.onChangeFrom).not.toHaveBeenCalled();
    expect(props.onChangeTo).not.toHaveBeenCalled();
  });
});
