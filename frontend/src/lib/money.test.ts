import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formats an amount in the given currency', () => {
    expect(formatMoney(1200, 'JPY')).toContain('1,200');
  });

  // A currency-less trip (ADR-0032's /new never collects one) must not reach
  // formatMoney with `undefined` — Intl.NumberFormat throws for that, and
  // with no ErrorBoundary in the app that blanks the whole screen (the bug
  // this test guards against). Callers must check trip.currency before calling.
  it('throws for a missing currency — callers must guard first', () => {
    expect(() => formatMoney(1200, undefined as unknown as string)).toThrow();
  });
});
