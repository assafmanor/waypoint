// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { Modal } from './Modal';
import { Sheet } from '../Sheet';

describe('Modal', () => {
  afterEach(() => cleanup());

  it('renders via a body portal with role="dialog"', () => {
    render(
      wrapNav(
        <Modal variant="sheet" ariaLabel="m" onClose={() => {}}>
          <button>inner</button>
        </Modal>,
      ),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    // Portalled to document.body, not nested in the React container.
    expect(dialog.closest('.modal-overlay')?.parentElement).toBe(document.body);
  });

  it('moves focus into the card on open', () => {
    render(
      wrapNav(
        <Modal variant="sheet" ariaLabel="m" onClose={() => {}}>
          <button>inner</button>
        </Modal>,
      ),
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      wrapNav(
        <Modal variant="dialog" ariaLabel="m" onClose={onClose}>
          <button>inner</button>
        </Modal>,
      ),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Escape is a back trigger with ONE owner (ADR-0103 §2). Before that, every open
  // Modal added its own `document` listener and closed itself on Escape — and
  // `stopPropagation` does not stop sibling listeners on the same target, so a
  // nested prompt over a sheet took both down on a single press.
  it('peels exactly one overlay on Escape when two are stacked', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      wrapNav(
        <>
          <Modal variant="sheet" ariaLabel="outer" onClose={closeOuter}>
            <button>outer body</button>
          </Modal>
          <Modal variant="dialog" ariaLabel="inner" onClose={closeInner}>
            <button>inner body</button>
          </Modal>
        </>,
      ),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    // The one opened last is the one that goes; the sheet under it survives.
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('closes on backdrop click but not on inner click', () => {
    const onClose = vi.fn();
    render(
      wrapNav(
        <Modal variant="sheet" ariaLabel="m" onClose={onClose}>
          <button>inner</button>
        </Modal>,
      ),
    );
    fireEvent.click(screen.getByText('inner'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      wrapNav(
        <Modal variant="sheet" ariaLabel="m" onClose={() => {}}>
          <button>inner</button>
        </Modal>,
      ),
    );
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('labels the dialog by its title when one is given', () => {
    render(
      wrapNav(
        <Modal variant="sheet" title="שלום" onClose={() => {}}>
          <button>inner</button>
        </Modal>,
      ),
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('שלום');
    expect(dialog.getAttribute('aria-label')).toBeNull();
  });

  it('variant="dialog" traps Tab', () => {
    render(
      wrapNav(
        <Modal variant="dialog" ariaLabel="m" onClose={() => {}}>
          <button>first</button>
          <button>last</button>
        </Modal>,
      ),
    );
    const [first, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('variant="sheet" does not trap Tab', () => {
    render(
      wrapNav(
        <Modal variant="sheet" ariaLabel="m" onClose={() => {}}>
          <button>first</button>
          <button>last</button>
        </Modal>,
      ),
    );
    const [, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // No wrap: focus stays where the browser would take it (still last in jsdom).
    expect(document.activeElement).toBe(last);
  });

  it('variant="full" does not close on backdrop click (ADR-0101)', () => {
    const onClose = vi.fn();
    render(
      wrapNav(
        <Modal variant="full" ariaLabel="m" onClose={onClose}>
          <button>inner</button>
        </Modal>,
      ),
    );
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('variant="full" focuses initialFocusRef instead of the container', () => {
    function FullWithInput({ onClose }: { onClose: () => void }) {
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <Modal variant="full" ariaLabel="m" onClose={onClose} initialFocusRef={inputRef}>
          <input ref={inputRef} placeholder="search" />
        </Modal>
      );
    }
    render(wrapNav(<FullWithInput onClose={() => {}} />));
    expect(document.activeElement).toBe(screen.getByPlaceholderText('search'));
  });
});

// The exit (ADR-0140). Every test above closes SYNCHRONOUSLY and that is the real
// contract in jsdom: with no stylesheet the duration token is unreadable, and
// `motionDurationMs` treats "no readable duration" as "no animation is running", so
// the close does not wait. These tests make the token readable to exercise the other
// branch — the one that actually ships.
describe('Modal exit animation', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty('--t-quick');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** jsdom resolves inline custom properties through getComputedStyle, so this is
   *  enough to make the primitive believe a stylesheet is present. */
  const withDuration = (ms: number) =>
    document.documentElement.style.setProperty('--t-quick', `${ms}ms`);

  const openSheet = (onClose: () => void) =>
    render(
      wrapNav(
        <Modal variant="sheet" ariaLabel="m" onClose={onClose}>
          <button>inner</button>
        </Modal>,
      ),
    );

  it('marks the overlay closing and defers onClose until the exit has played', () => {
    vi.useFakeTimers();
    withDuration(140);
    const onClose = vi.fn();
    openSheet(onClose);

    fireEvent.click(document.querySelector('.modal-overlay')!);
    // The caller has NOT been told yet — it unmounts us on onClose, which is exactly
    // why calling it first meant nothing ever animated out.
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')!.classList).toContain('is-closing');

    vi.advanceTimersByTime(139);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once when several exits land during the animation', () => {
    vi.useFakeTimers();
    withDuration(140);
    const onClose = vi.fn();
    openSheet(onClose);

    const overlay = document.querySelector('.modal-overlay')!;
    fireEvent.click(overlay);
    // A second backdrop tap and an Escape while the card is already leaving. Without
    // the idempotence guard each would restart the exit and re-queue the close.
    fireEvent.click(overlay);
    fireEvent.keyDown(document, { key: 'Escape' });

    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose after unmounting mid-exit', () => {
    vi.useFakeTimers();
    withDuration(140);
    const onClose = vi.fn();
    const { unmount } = openSheet(onClose);

    fireEvent.click(document.querySelector('.modal-overlay')!);
    unmount();
    vi.advanceTimersByTime(500);
    // The pending timer is cleared, so a caller that tore the overlay down for its
    // own reasons is never called back about a close it did not ask for.
    expect(onClose).not.toHaveBeenCalled();
  });

  // The correctness half of ADR-0140: App.css kills the animation under reduced
  // motion, so a timer that still waited for it would hold a dismissed overlay on
  // screen — mounted, opaque, and holding focus — for 140ms of nothing.
  it('closes instantly under prefers-reduced-motion, with no closing state', () => {
    withDuration(140);
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onClose = vi.fn();
    openSheet(onClose);

    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives children the same animated close, so an in-card control matches a back', () => {
    vi.useFakeTimers();
    withDuration(140);
    const onClose = vi.fn();
    render(
      wrapNav(
        <Modal variant="dialog" ariaLabel="m" onClose={onClose}>
          {(close) => <button onClick={close}>ביטול</button>}
        </Modal>,
      ),
    );

    fireEvent.click(screen.getByText('ביטול'));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')!.classList).toContain('is-closing');
    vi.advanceTimersByTime(140);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet (thin wrapper over Modal, unchanged behavior)', () => {
  afterEach(() => cleanup());

  it('renders a body-portalled dialog, focuses the card, and does not trap Tab', () => {
    const onClose = vi.fn();
    render(
      wrapNav(
        <Sheet title="חשבון" onClose={onClose}>
          <button>first</button>
          <button>last</button>
        </Sheet>,
      ),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.modal-overlay')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);
    // Sheet inherits variant="sheet" → no trap.
    const [, last] = screen.getAllByRole('button');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(last);
    // Escape still closes.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
