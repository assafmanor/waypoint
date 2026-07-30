// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialogFocus } from './useDialogFocus';

function Dialog({ trap }: { trap?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { trap });
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="d">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

function DialogWithInitialFocus() {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDialogFocus(ref, { initialFocusRef: inputRef });
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="d">
      <input ref={inputRef} placeholder="search" />
    </div>
  );
}

describe('useDialogFocus', () => {
  afterEach(() => cleanup());

  it('moves focus to the dialog container on open (not the first field)', () => {
    render(<Dialog />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('focuses initialFocusRef instead of the container when given (ADR-0101 search mode)', () => {
    render(<DialogWithInitialFocus />);
    expect(document.activeElement).toBe(screen.getByPlaceholderText('search'));
  });

  // Escape is NOT this hook's job any more (ADR-0103 §2) — it is a back trigger
  // owned by `useOverlay`, so the topmost LAYER decides what it peels rather than
  // the dialog reaching past whatever is above it. Asserted in nav-state's tests.
  it('ignores Escape, leaving it to the back stack', () => {
    render(<Dialog />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeTruthy();
  });

  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Dialog />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('traps Tab within the dialog when trap is set', () => {
    render(<Dialog trap />);
    const [first, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    screen.getByRole('dialog').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not trap Tab when trap is unset', () => {
    render(<Dialog />);
    const [, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // No wrap: focus stays where the browser would take it (still last in jsdom).
    expect(document.activeElement).toBe(last);
  });
});
