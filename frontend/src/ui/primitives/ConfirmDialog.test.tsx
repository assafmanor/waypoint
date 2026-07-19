// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../Toast';
import { NavProvider } from '../../state/nav-state';
import { ConfirmDialog } from './ConfirmDialog';

// ConfirmDialog renders on Modal → useOverlay (NavProvider + router + toast).
function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('ConfirmDialog', () => {
  afterEach(() => cleanup());

  it('renders title, body, and the confirm/cancel labels; moves focus in', () => {
    render(
      wrap(
        <ConfirmDialog
          tone="danger"
          title="למחוק?"
          body="הפעולה בלתי הפיכה"
          confirmLabel="מחק"
          cancelLabel="בטל"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('למחוק?');
    expect(screen.getByText('הפעולה בלתי הפיכה')).toBeTruthy();
    expect(screen.getByText('מחק')).toBeTruthy();
    expect(screen.getByText('בטל')).toBeTruthy();
    // Focus lands on the dialog card (no keyboard-popping field focus).
    expect(document.activeElement).toBe(dialog);
  });

  it('fires onConfirm and onCancel from the action buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      wrap(
        <ConfirmDialog
          tone="neutral"
          title="t"
          confirmLabel="כן"
          cancelLabel="לא"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      ),
    );
    fireEvent.click(screen.getByText('כן'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('לא'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape via the overlay/focus contract', () => {
    const onCancel = vi.fn();
    render(
      wrap(
        <ConfirmDialog
          tone="hard"
          title="t"
          confirmLabel="כן"
          onConfirm={() => {}}
          onCancel={onCancel}
        />,
      ),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies the tone as a data attribute (styling hook)', () => {
    render(
      wrap(
        <ConfirmDialog tone="hard" title="t" onCancel={() => {}}>
          {null}
        </ConfirmDialog>,
      ),
    );
    expect(document.querySelector('.confirm[data-tone="hard"]')).toBeTruthy();
  });
});
