// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ZoneShiftPill } from './ZoneShiftPill';
import { t } from '../i18n/he';

describe('ZoneShiftPill', () => {
  afterEach(() => cleanup());

  it('renders a signed shift LTR with the clock glyph and the shift title', () => {
    const { container } = render(<ZoneShiftPill minutes={360} />);
    const pill = container.querySelector('.wp-tzshift')!;
    expect(pill.textContent).toContain('+6');
    expect(pill.getAttribute('dir')).toBe('ltr');
    expect(pill.getAttribute('title')).toBe(t.event.zoneShift);
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
