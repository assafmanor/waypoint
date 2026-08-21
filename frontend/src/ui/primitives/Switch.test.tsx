// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Switch } from './Switch';

describe('Switch', () => {
  afterEach(() => cleanup());

  it('is a switch to a screen reader, not a checkbox and not a button', () => {
    // `role="switch"` with `aria-checked` is the platform's own idiom for a boolean SETTING.
    // The app had none of these before, which is why this primitive exists at all.
    render(<Switch checked={false} onChange={() => {}} ariaLabel="התראות" />);
    const control = screen.getByRole('switch', { name: 'התראות' });
    expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('reports its state', () => {
    render(<Switch checked onChange={() => {}} ariaLabel="התראות" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('hands back the OPPOSITE of what it holds', () => {
    // Controlled: it never flips itself, so a failed server patch cannot leave the switch
    // showing a state the account does not have.
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} ariaLabel="התראות" />);
    screen.getByRole('switch').click();
    expect(onChange).toHaveBeenCalledWith(true);

    cleanup();
    onChange.mockClear();
    render(<Switch checked onChange={onChange} ariaLabel="כבוי" />);
    screen.getByRole('switch', { name: 'כבוי' }).click();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('is named by its host, because it carries no text of its own', () => {
    // A settings row's `.lab` sits BESIDE the control, so without this the switch would be
    // an unnamed control to anybody not looking at the screen.
    render(<Switch checked onChange={() => {}} ariaLabel="משימות ותזכורות" />);
    expect(screen.getByRole('switch', { name: 'משימות ותזכורות' })).toBeTruthy();
  });

  it('does not fire while disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} ariaLabel="התראות" disabled />);
    screen.getByRole('switch').click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the thumb as decoration, so the state is read once and not twice', () => {
    const { container } = render(<Switch checked onChange={() => {}} ariaLabel="התראות" />);
    expect(container.querySelector('.wp-switch-thumb')?.getAttribute('aria-hidden')).toBe('true');
  });
});
