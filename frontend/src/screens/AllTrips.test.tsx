// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import type { Trip } from '@waypoint/shared';
import { t } from '../i18n/he';
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
]) as Trip[];

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
  afterEach(() => cleanup());

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

  it('offers sharing on every card', async () => {
    renderTrips();
    await screen.findByText('איסלנד עם המשפחה');

    for (const trip of TRIPS) {
      expect(screen.getByRole('button', { name: t.share.entryFor(trip.name) })).toBeTruthy();
    }
  });

  it('shares the card it was pressed on', async () => {
    const { onShare } = renderTrips();
    await screen.findByText('סוף שבוע ברומא');

    fireEvent.click(screen.getByRole('button', { name: t.share.entryFor('סוף שבוע ברומא') }));
    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' })),
    );
  });

  // The mockup rejected nesting the action inside the card button by name: a button in a
  // button is invalid HTML and gives the thumb two targets on the same rect.
  //
  // **This is the whole of what jsdom can say, and on its own it was not enough** — the
  // action shipped on a line of its own and this test stayed green, because a sibling that
  // has wrapped is still a sibling. Same-ROW is `e2e/trip-share-entry.spec.ts`'s, where
  // there are rects.
  it('keeps the share control a sibling of the card, never nested inside it', async () => {
    const { container } = renderTrips();
    await screen.findByText('איסלנד עם המשפחה');

    for (const action of container.querySelectorAll('.trip-share-action')) {
      expect(action.closest('button:not(.trip-share-action)')).toBeNull();
    }
  });
});
