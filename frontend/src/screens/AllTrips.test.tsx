// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Trip } from '@waypoint/shared';
import { t } from '../i18n/he';
import { DRAG_HOLD_MS } from '../constants';
import { daysUntilStart } from '../lib/mode';
import { setSimulatedNow } from '../lib/useClock';
import { wrapNav } from '../test/nav-harness';
import { ActiveTripIdProvider } from '../state/active-trip-id';

const TRIPS: Trip[] = vi.hoisted(() => [
  {
    id: 't1',
    name: 'איסלנד עם המשפחה',
    destination: 'Iceland',
    startDate: '2020-01-01',
    endDate: '2035-12-31',
    timezone: 'UTC',
    createdBy: 'u1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 't2',
    name: 'סוף שבוע ברומא',
    destination: 'Rome',
    startDate: '2035-01-01',
    endDate: '2035-01-05',
    timezone: 'UTC',
    createdBy: 'u1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
  {
    id: 't3',
    name: 'ליסבון',
    destination: 'Lisbon',
    startDate: '2024-03-01',
    endDate: '2024-03-08',
    timezone: 'UTC',
    createdBy: 'u1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  },
]) as Trip[];

// Pinned, so `chipSoon`'s countdown means the same thing on every day this suite runs
// (frontend/CLAUDE.md — a spec that reads the system clock passes for the wrong reason).
const NOW = Date.parse('2026-08-30T09:00:00.000Z');

vi.mock('../lib/cache', () => ({
  loadTripList: vi.fn().mockResolvedValue({ trips: TRIPS, fromCache: false }),
}));
vi.mock('../state/auth-state', () => ({
  useAuth: () => ({
    status: 'authed',
    me: {
      user: {
        id: 'u1',
        email: 'a@example.com',
        displayName: 'אסף',
        avatarHue: 'denim',
        avatarChoice: 'initials',
        googleAvatarUrl: null,
        uploadedAvatarUrl: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      memberships: [],
    },
  }),
}));
vi.mock('../lib/outbox', () => ({ useIsOffline: () => false }));
vi.mock('../lib/trip-handoff', () => ({ beginTripHandoff: () => false }));

const { AllTrips } = await import('./AllTrips');

describe('AllTrips sharing entry', () => {
  beforeEach(() => setSimulatedNow(NOW));
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  /** jsdom implements no `PointerEvent`, so the hook is written to accept an event carrying
   *  neither `isPrimary` nor `button` — a `MouseEvent` is exactly that. */
  const pointer = (el: Element, type: string, y: number) =>
    el.dispatchEvent(new MouseEvent(type, { clientX: 10, clientY: y, bubbles: true }));

  const renderTrips = (onShare = vi.fn()) => {
    const view = render(
      wrapNav(
        <ActiveTripIdProvider>
          <AllTrips onOpenAccount={() => {}} onShare={onShare} />
        </ActiveTripIdProvider>,
      ),
    );
    return { ...view, onShare };
  };

  // **The share control is gone from the row; the gesture is the way in** (ADR-0033's
  // 2026-08-30 amendment §1). The icon cost 42px of the content column and wrapped the meta
  // onto a third line — the owner's report. `useHoldToOpen` is the app's existing answer.
  it('opens the share sheet on a hold, for the card the finger was on', async () => {
    const { onShare } = renderTrips();
    await screen.findByText('סוף שבוע ברומא');

    vi.useFakeTimers();
    try {
      pointer(screen.getByText('סוף שבוע ברומא').closest('button')!, 'pointerdown', 10);
      // Inside `act`: the hold fires through a state update in the host, and an advance
      // outside it leaves React's queue unflushed.
      act(() => vi.advanceTimersByTime(DRAG_HOLD_MS));
    } finally {
      vi.useRealTimers();
    }
    expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
  });

  // Time arbitrates, not direction: a finger that moved was scrolling the list, and a list
  // that opened a sheet mid-scroll would be unusable.
  it('does not share on a hold that turns into a scroll', async () => {
    const { onShare } = renderTrips();
    await screen.findByText('סוף שבוע ברומא');

    vi.useFakeTimers();
    try {
      const card = screen.getByText('סוף שבוע ברומא').closest('button')!;
      pointer(card, 'pointerdown', 10);
      pointer(card, 'pointermove', 90);
      act(() => vi.advanceTimersByTime(DRAG_HOLD_MS));
    } finally {
      vi.useRealTimers();
    }
    expect(onShare).not.toHaveBeenCalled();
  });

  // The row costs nothing for the gesture: no button of its own, on any card.
  it('renders no share control on the list', async () => {
    const { container } = renderTrips();
    await screen.findByText('איסלנד עם המשפחה');

    expect(container.querySelector('.trip-share-action')).toBeNull();
    expect(screen.queryByRole('button', { name: t.share.entry })).toBeNull();
  });

  // §2/§3: the countdown is the one fact that varies inside a section and keeps the freed
  // slot; `הסתיים` repeated its own section heading and is deleted.
  it('shows a countdown on an upcoming trip and no chip on a finished one', async () => {
    const { container } = renderTrips();
    await screen.findByText('ליסבון');

    const soon = screen.getByText('סוף שבוע ברומא').closest('button')!;
    expect(soon.querySelector('.chip.soon')?.textContent).toBe(
      t.shell.allTrips.chipSoon(daysUntilStart(TRIPS[1], new Date(NOW)) ?? 0),
    );
    expect(screen.getByText('ליסבון').closest('button')!.querySelector('.chip')).toBeNull();
    expect(container.querySelector('.chip.past')).toBeNull();
  });
});
