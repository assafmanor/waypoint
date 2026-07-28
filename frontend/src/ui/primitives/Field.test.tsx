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
