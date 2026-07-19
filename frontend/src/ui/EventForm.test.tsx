// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// EventForm folds into the Modal primitive (U-01). The state hooks are mocked so
// the test exercises the overlay/focus behavior, not the trip data plane.
vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
      updatedBy: 'u1',
    },
    activeDate: '2026-07-20',
    events: [],
  }),
}));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({ create: vi.fn(), update: vi.fn(), schedule: vi.fn() }),
}));

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { EventForm } from './EventForm';
import { t } from '../i18n/he';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('EventForm (folded into Modal, U-01)', () => {
  afterEach(() => cleanup());

  it('renders as a body-portalled dialog and moves focus into the card', () => {
    render(wrap(<EventForm onClose={() => {}} />));
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.modal-overlay')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);
  });

  it('closes on Escape when the form is untouched (overlay/back path)', () => {
    const onClose = vi.fn();
    render(wrap(<EventForm onClose={onClose} />));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click when untouched', () => {
    const onClose = vi.fn();
    render(wrap(<EventForm onClose={onClose} />));
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(wrap(<EventForm onClose={() => {}} />));
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('guards a dirty close: Escape prompts a discard confirm instead of closing', () => {
    const onClose = vi.fn();
    render(wrap(<EventForm onClose={onClose} />));
    fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
      target: { value: 'ארוחת ערב' },
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // The discard confirm appears; confirming it runs the close.
    expect(screen.getByText(t.common.discardTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(t.common.discardConfirm));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
