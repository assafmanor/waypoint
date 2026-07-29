// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ZoneShiftPill } from './ZoneShiftPill';
import { t } from '../i18n/he';

describe('ZoneShiftPill', () => {
  afterEach(() => cleanup());

  it('renders a signed shift with the clock mark and the shift title', () => {
    const { container } = render(<ZoneShiftPill minutes={360} />);
    const pill = container.querySelector('.wp-tzshift')!;
    expect(pill.textContent).toContain('+6');
    // The mark is an SVG since ADR-0137 — the pill is chrome, and chrome is icons.
    expect(pill.querySelector('svg')).not.toBeNull();
    expect(pill.getAttribute('title')).toBe(t.event.zoneShift);
  });

  it('reads number-then-unit: the pill is never forced LTR over its Hebrew (ADR-0118)', () => {
    const { container } = render(<ZoneShiftPill minutes={-180} />);
    const pill = container.querySelector('.wp-tzshift')!;
    // dir="ltr" here laid the pill out left-to-right, so it read "ש׳ 3−". The pill
    // stays in the RTL flow; only the signed number is an LTR island. Asserted on
    // the TEXT alone — the leading mark is an SVG and contributes none.
    expect(pill.getAttribute('dir')).toBeNull();
    expect(pill.textContent).toBe(' \u2066−3\u2069 ש׳');
  });

  it('a negative shift uses a real minus sign, never a hyphen', () => {
    const { container } = render(<ZoneShiftPill minutes={-180} />);
    const text = container.querySelector('.wp-tzshift')!.textContent!;
    expect(text).toContain('−3');
    expect(text).not.toContain('-3');
  });

  it('keeps the base class and adds the surface class (so surfaces only tweak)', () => {
    const { container } = render(<ZoneShiftPill minutes={90} className="on-dark" />);
    const pill = container.querySelector('.wp-tzshift')!;
    expect(pill.classList.contains('on-dark')).toBe(true);
    // Fractional zones keep their minutes.
    expect(pill.textContent).toContain('1:30');
  });
});
