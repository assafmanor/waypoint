// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  afterEach(() => cleanup());

  it('renders title, body, and the confirm/cancel labels; moves focus in', () => {
    render(
      wrapNav(
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
      wrapNav(
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
      wrapNav(
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

  // The cascade's slot (ADR-0152 §2). Its own line rather than more body text, because
  // every body here ends in a question and a count belongs before the answer.
  it('renders the consequence as its own line under the body, and omits it when absent', () => {
    const { rerender } = render(
      wrapNav(
        <ConfirmDialog
          tone="danger"
          title="למחוק?"
          body="הפעולה בלתי הפיכה"
          consequence="3 פתקים יימחקו"
          confirmLabel="מחק"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    const line = document.querySelector('.confirm-consequence');
    expect(line?.textContent).toBe('3 פתקים יימחקו');
    expect(line?.previousElementSibling?.className).toBe('confirm-text');

    rerender(
      wrapNav(
        <ConfirmDialog
          tone="danger"
          title="למחוק?"
          body="הפעולה בלתי הפיכה"
          confirmLabel="מחק"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    expect(document.querySelector('.confirm-consequence')).toBeNull();
  });

  it('applies the tone as a data attribute (styling hook)', () => {
    render(
      wrapNav(
        <ConfirmDialog tone="hard" title="t" onCancel={() => {}}>
          {null}
        </ConfirmDialog>,
      ),
    );
    expect(document.querySelector('.confirm[data-tone="hard"]')).toBeTruthy();
  });
});
