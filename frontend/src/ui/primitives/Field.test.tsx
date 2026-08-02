// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  afterEach(() => cleanup());

  it('renders the label as a real <label> tied to the control by id', () => {
    render(
      <Field label="קוד" htmlFor="c">
        <input id="c" />
      </Field>,
    );
    expect(screen.getByLabelText('קוד')).toBe(screen.getByRole('textbox'));
  });

  it('wires aria-describedby onto the control and announces the error', () => {
    render(
      <Field label="קוד" error="שגיאה">
        <input />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('שגיאה');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  // The mark the whole refusal is drawn from (ADR-0150): the control's outline, the
  // label's hue and what the nudge animates all key off this one attribute, so a
  // form that shows a message without it would say no invisibly.
  it('marks the field itself while an error is shown', () => {
    const { container, rerender } = render(
      <Field label="קוד" error="שגיאה">
        <input />
      </Field>,
    );
    expect(container.querySelector('.field')?.hasAttribute('data-invalid')).toBe(true);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
    rerender(
      <Field label="קוד">
        <input />
      </Field>,
    );
    expect(container.querySelector('.field')?.hasAttribute('data-invalid')).toBe(false);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
  });

  // ADR-0150 §7: a two-ended field can be wrong at ONE end, and `[data-invalid] input`
  // reddens every control under it — so a date range whose end is backwards must not have
  // its perfectly good start accused too. The message still reads and the label still turns.
  it('leaves the shell unmarked when the controls mark themselves', () => {
    const { container } = render(
      <Field label="תאריכים" error="שגיאה" controlsMarked>
        <input aria-label="מ" />
        <input aria-label="עד" data-invalid="" />
      </Field>,
    );
    const shell = container.querySelector('.field')!;
    expect(shell.hasAttribute('data-invalid')).toBe(false);
    // …but it is still a refused field, which is what turns the label.
    expect(shell.hasAttribute('data-refused')).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('שגיאה');
    expect(screen.getByLabelText('מ').hasAttribute('data-invalid')).toBe(false);
  });

  // A host may add its own arrival/stagger modifier, but never opt out of `.field` itself.
  it('keeps its own class while taking the host’s', () => {
    const { container } = render(
      <Field className="birth-in" style={{ marginTop: '4px' }}>
        <input />
      </Field>,
    );
    const shell = container.querySelector('.field') as HTMLElement;
    expect(shell.classList.contains('birth-in')).toBe(true);
    expect(shell.style.marginTop).toBe('4px');
  });

  // The hint is the error slot's quiet peer: it never blocks a save, so it must not
  // announce itself as an alert or claim the control's `aria-describedby`.
  it('renders a hint without making it an alert', () => {
    render(
      <Field label="מיקום" hint="בלי מיקום אין סימון במפה">
        <input />
      </Field>,
    );
    expect(screen.getByText('בלי מיקום אין סימון במפה')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toBeNull();
  });

  it('shows a hint and an error together, the error last', () => {
    const { container } = render(
      <Field label="מיקום" hint="הערה" error="שגיאה">
        <input />
      </Field>,
    );
    const texts = [...container.querySelectorAll('.field-hint, .field-error')].map(
      (el) => el.textContent,
    );
    expect(texts).toEqual(['הערה', 'שגיאה']);
  });

  it('omits the hint slot when no hint is given', () => {
    const { container } = render(
      <Field label="מיקום">
        <input />
      </Field>,
    );
    expect(container.querySelector('.field-hint')).toBeNull();
  });

  it('omits the error slot and describedby wiring when there is no error', () => {
    render(
      <Field label="קוד">
        <input />
      </Field>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toBeNull();
  });
});
