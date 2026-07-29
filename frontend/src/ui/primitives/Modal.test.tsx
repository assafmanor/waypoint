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
