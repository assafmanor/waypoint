// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialogFocus } from './useDialogFocus';

function Dialog({ onClose, trap }: { onClose: () => void; trap?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose, { trap });
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="d">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

describe('useDialogFocus', () => {
  afterEach(() => cleanup());

  it('moves focus to the dialog container on open (not the first field)', () => {
    render(<Dialog onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Dialog onClose={() => {}} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('traps Tab within the dialog when trap is set', () => {
    render(<Dialog onClose={() => {}} trap />);
    const [first, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    screen.getByRole('dialog').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not trap Tab when trap is unset', () => {
    render(<Dialog onClose={() => {}} />);
    const [, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // No wrap: focus stays where the browser would take it (still last in jsdom).
    expect(document.activeElement).toBe(last);
  });
});
