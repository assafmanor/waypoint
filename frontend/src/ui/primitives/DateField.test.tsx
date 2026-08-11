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

  // \u2500\u2500 the platform's Clear is a cancellation (field report #38) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Android's date picker has a Clear button, and it reports itself as an empty value.
  // Forwarding one put an unparseable date into a form that derives a timezone from it
  // on EVERY render, so the app threw in render and \u2014 with no error boundary anywhere \u2014
  // unmounted itself. None of the tests below can see that crash; what they pin is the
  // reason it can no longer be reached.
  describe('the platform\u2019s Clear', () => {
    const clear = (input: HTMLInputElement) => fireEvent.change(input, { target: { value: '' } });
    const dateInput = (c: HTMLElement) => c.querySelector('input[type="date"]') as HTMLInputElement;

    it('never reaches the form as a value', () => {
      const onChange = vi.fn();
      const { container } = render(<DateField value="2026-09-12" onChange={onChange} />);
      clear(dateInput(container));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('puts the pre-picker date back on the control and on the face', () => {
      const { container } = render(<DateField value="2026-09-12" onChange={() => {}} />);
      const input = dateInput(container);
      fireEvent.pointerDown(input);
      clear(input);
      expect(input.value).toBe('2026-09-12');
      expect(container.querySelector('.df-face')?.textContent).toBe('12.09.2026');
    });

    // The sharp case: the picker committed a tentative date on the way, so rolling back
    // means telling the FORM to go back too \u2014 not merely leaving it where it is.
    it('rolls back a tentatively picked date rather than committing empty', () => {
      const onChange = vi.fn();
      const { container, rerender } = render(<DateField value="2026-09-12" onChange={onChange} />);
      const input = dateInput(container);
      fireEvent.pointerDown(input);
      fireEvent.change(input, { target: { value: '2026-09-14' } });
      expect(onChange).toHaveBeenLastCalledWith('2026-09-14');
      rerender(<DateField value="2026-09-14" onChange={onChange} />);

      clear(input);
      expect(onChange).toHaveBeenLastCalledWith('2026-09-12');
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    // Reopening the picker on a date just picked rolls back to THAT date \u2014 the value
    // showing when this interaction started, not the one the form opened with.
    it('rolls back to the date showing when the picker opened, not to the form\u2019s first', () => {
      const onChange = vi.fn();
      const { container, rerender } = render(<DateField value="2026-09-12" onChange={onChange} />);
      const input = dateInput(container);
      fireEvent.pointerDown(input);
      fireEvent.change(input, { target: { value: '2026-09-14' } });
      rerender(<DateField value="2026-09-14" onChange={onChange} />);

      fireEvent.pointerDown(input); // the picker opens a second time
      clear(input);
      expect(onChange).toHaveBeenLastCalledWith('2026-09-14');
    });

    it('still commits a date the picker actually selected', () => {
      const onChange = vi.fn();
      const { container } = render(<DateField value="2026-09-12" onChange={onChange} />);
      fireEvent.pointerDown(dateInput(container));
      fireEvent.change(dateInput(container), { target: { value: '2026-09-20' } });
      expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-09-20');
    });
  });

  // \u2500\u2500 the face is what the field reads at rest (field report #36) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  describe('typing vs. merely holding focus', () => {
    const dateInput = (c: HTMLElement) => c.querySelector('input[type="date"]') as HTMLInputElement;
    const typing = (c: HTMLElement) => c.querySelector('.df')?.hasAttribute('data-typing');

    // The bug this replaces: the face stepped aside on `:focus-within`, and the
    // platform's picker leaves the input focused when it closes \u2014 so the field read the
    // platform's own format (`12.9.2026`) and clipped it, in exactly the state the
    // reader checks the date they just entered.
    it('keeps the face up while the field merely has focus', () => {
      const { container } = render(<DateField value="2026-09-12" onChange={() => {}} />);
      fireEvent.focus(dateInput(container));
      expect(typing(container)).toBe(false);
    });

    it('steps aside for a keyboard edit, and comes back when the field is left', () => {
      const { container } = render(<DateField value="2026-09-12" onChange={() => {}} />);
      const input = dateInput(container);
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: '1' });
      expect(typing(container)).toBe(true);
      fireEvent.blur(input);
      expect(typing(container)).toBe(false);
    });

    // Tab is how a keyboard user LEAVES; counting it as an edit would flash the
    // platform's format on the way out.
    it('does not count Tab as an edit', () => {
      const { container } = render(<DateField value="2026-09-12" onChange={() => {}} />);
      fireEvent.keyDown(dateInput(container), { key: 'Tab' });
      expect(typing(container)).toBe(false);
    });

    // A date types segment by segment and reports '' in between. That is an incomplete
    // entry, not a Clear: the segments must keep taking keys rather than being reset
    // under the typist \u2014 and the empty still never reaches the form.
    it('holds a half-typed date without rolling it back or forwarding it', () => {
      const onChange = vi.fn();
      const { container } = render(<DateField value="2026-09-12" onChange={onChange} />);
      const input = dateInput(container);
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: '1' });
      fireEvent.change(input, { target: { value: '' } });
      expect(onChange).not.toHaveBeenCalled();
      expect(input.value).toBe('');
      // Leaving the field is what makes the control and the form agree again.
      fireEvent.blur(input);
      expect(input.value).toBe('2026-09-12');
    });
  });
});
