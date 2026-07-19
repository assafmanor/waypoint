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
