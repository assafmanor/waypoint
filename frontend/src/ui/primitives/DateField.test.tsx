// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { DateField } from './DateField';
import { t } from '../../i18n/he';

describe('DateField', () => {
  afterEach(() => cleanup());

  // The whole reason this primitive exists (ADR-0176): what the reader sees is the
  // app's own day-first date, not the platform's rendering of the input's value.
  it('shows the value in the app format, whatever the platform would render', () => {
    const { container } = render(<DateField value="2026-08-09" onChange={() => {}} />);
    expect(container.querySelector('.df-face')?.textContent).toBe('09.08.2026');
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe(
      '2026-08-09',
    );
  });

  it('says what an empty field is for, and takes the host’s own words', () => {
    const { container, rerender } = render(<DateField value="" onChange={() => {}} />);
    expect(container.querySelector('.df-face')?.textContent).toBe(t.whenField.addDate);
    rerender(<DateField value="" onChange={() => {}} placeholder="יציאה" />);
    expect(container.querySelector('.df-face')?.textContent).toBe('יציאה');
  });

  // The native input is not replaced by the face — it is still the control that
  // carries the bounds and emits the value.
  it('stays a real date input: bounds, id, and a plain YYYY-MM-DD out', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField
        id="d1"
        value="2026-08-09"
        min="2026-08-01"
        max="2026-08-31"
        onChange={onChange}
      />,
    );
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect([input.id, input.min, input.max]).toEqual(['d1', '2026-08-01', '2026-08-31']);
    fireEvent.change(input, { target: { value: '2026-08-12' } });
    expect(onChange).toHaveBeenCalledWith('2026-08-12');
  });

  // The refusal marks the box — the wrapper is what wears the chrome now, so a mark
  // left on the input would paint nothing (ADR-0150).
  it('carries the refusal mark on the box, not on the bare input', () => {
    const { container } = render(<DateField value="" onChange={() => {}} data-invalid="" />);
    expect(container.querySelector('.df')?.hasAttribute('data-invalid')).toBe(true);
    expect(container.querySelector('input')?.hasAttribute('data-invalid')).toBe(false);
  });

  // The face repeats the input's own value, so a screen reader that read both would
  // hear the date twice.
  it('leaves the value to the input for assistive tech', () => {
    const { container } = render(<DateField value="2026-08-09" onChange={() => {}} />);
    expect(container.querySelector('.df-face')?.getAttribute('aria-hidden')).toBe('true');
  });
  // Two faces, both satisfying ADR-0176 (a reader never has to guess the order).
  // `numeric` stays the default so every existing caller is untouched; `named` is what
  // lets a date be a word in a sentence rather than a figure in a box (ADR-0177 §4),
  // and a named month cannot be read backwards at all.
  it('reads day-first and numeric by default', () => {
    const { container } = render(<DateField value="2026-09-11" onChange={() => {}} />);
    expect(container.querySelector('.df-face')?.textContent).toBe('11.09.2026');
  });

  it('reads by name when asked, and drops the year the trip already implies', () => {
    const { container } = render(
      <DateField value="2026-09-11" onChange={() => {}} format="named" />,
    );
    const face = container.querySelector('.df-face')?.textContent ?? '';
    expect(face).toContain('11');
    expect(face).not.toContain('2026');
    // The month is a WORD, which is the whole point — an order that cannot be misread.
    expect(/[\u0590-\u05FF]/.test(face)).toBe(true);
  });
});
