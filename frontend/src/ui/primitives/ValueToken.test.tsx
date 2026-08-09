// @vitest-environment jsdom
// ValueToken (ADR-0177 §2) — the inline "a value you can change".
//
// What is worth asserting here is the VOCABULARY, not the geometry: jsdom reports
// every rect as zero, so the touch target and the line height are measured in the
// mockup and in an e2e pass, never here. What a unit test can hold is the part that
// drifted across five chromes before this existed — which tone a value wears, and
// that a host cannot quietly opt out of the box.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ValueToken, tokenClass } from './ValueToken';

describe('ValueToken', () => {
  afterEach(cleanup);

  it('wears amber only for a time, and ink for a word', () => {
    // ADR-0028's budget, and the reason the event form had two amber objects and so
    // marked nothing: the hue belongs to the clock alone.
    const { rerender } = render(<ValueToken kind="time">15:00</ValueToken>);
    expect(screen.getByRole('button').className).toContain('vt-time');

    rerender(<ValueToken kind="word">שעה</ValueToken>);
    expect(screen.getByRole('button').className).toContain('vt-word');
    expect(screen.getByRole('button').className).not.toContain('vt-time');
  });

  it('always carries the base class, whatever a host passes', () => {
    // The five chromes ADR-0177 §1 counted all began as a host styling the box itself.
    // `className` composes with `.vt`; it cannot replace it.
    render(
      <ValueToken kind="time" className="bld-time">
        15:00
      </ValueToken>,
    );
    const el = screen.getByRole('button');
    expect(el.className).toContain('vt');
    expect(el.className).toContain('bld-time');
  });

  it('marks an absence rather than rendering blank', () => {
    render(
      <ValueToken kind="time" empty>
        הוסף שעה
      </ValueToken>,
    );
    expect(screen.getByRole('button').className).toContain('vt-empty');
  });

  it('shows the open mark while its panel is up', () => {
    render(
      <ValueToken kind="time" open>
        15:00
      </ValueToken>,
    );
    expect(screen.getByRole('button').className).toContain('open');
  });

  it('names itself for a screen reader, since the caption is what this design removes', () => {
    render(
      <ValueToken kind="time" aria-label="התחלה">
        15:00
      </ValueToken>,
    );
    expect(screen.getByRole('button', { name: 'התחלה' })).toBeTruthy();
  });

  it('carries the refusal mark on the value itself (ADR-0150)', () => {
    // The point of §5: the mark lands on the value that is wrong, not on a cell that
    // also holds a value that is fine.
    render(
      <ValueToken kind="time" data-invalid="">
        15:00
      </ValueToken>,
    );
    expect(screen.getByRole('button').hasAttribute('data-invalid')).toBe(true);
  });

  it('opens on press, and cannot be pressed while disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ValueToken kind="time" onClick={onClick}>
        15:00
      </ValueToken>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <ValueToken kind="time" onClick={onClick} disabled>
        15:00
      </ValueToken>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('tokenClass', () => {
    // Exported because a date cannot render through the component — its real control is
    // the native input `DateField` owns (ADR-0176), so that component's wrapper wears
    // the class directly. Two call sites building the string by hand is how the fifth
    // chrome would start again.
    it('builds the same class list the component renders', () => {
      expect(tokenClass('date')).toBe('vt vt-date');
      expect(tokenClass('date', { empty: true })).toBe('vt vt-date vt-empty');
      expect(tokenClass('time', { open: true })).toBe('vt vt-time open');
    });

    it('composes a host class without dropping the base', () => {
      expect(tokenClass('time', { className: 'bld-time' })).toBe('vt vt-time bld-time');
    });
  });
});
