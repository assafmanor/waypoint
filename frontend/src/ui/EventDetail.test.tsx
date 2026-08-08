// @vitest-environment jsdom
//
// `EventDetail` is `BookingDetail`'s peer over the shared `DetailSheet` (ADR-0174 §4), so
// what is worth asserting here is the part that is NOT the shell: the facts it states, the
// hard-commitment guard, and the one behaviour the archive depends on — that a read-only
// trip gets the read with no way to write from it (ADR-0040).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Booking, Place, TripEvent } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { setSimulatedNow } from '../lib/useClock';

let tripPlaces: Place[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    hostContexts: buildHostContextIndex([], []),
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    events: [],
    bookings: [] as Booking[],
    places: tripPlaces,
    notes: [],
    documents: [],
    documentAttachments: [],
    users: [],
    noteVerbs: { createNote: vi.fn(), updateNote: vi.fn() },
    enrichments: {},
  }),
}));
// The chip carries the app's ONE per-entity sync grammar (ADR-0092), so the outbox mock
// owes what `EntitySyncBadge`/`useUnsynced` read as well as the queued-upload list.
vi.mock('../lib/outbox', () => ({
  usePendingUploads: () => [],
  useSyncStatus: () => ({ state: 'synced' }),
  SYNC_STATE: { SYNCED: 'synced', PENDING: 'pending', FAILED: 'failed' },
}));

import { EventDetail } from './EventDetail';
import { buildHostContextIndex } from '../lib/host-context';
import { t } from '../i18n/he';

const event = (over: Partial<TripEvent> = {}): TripEvent =>
  ({
    id: 'e1',
    tripId: 't1',
    date: '2026-04-14',
    title: 'ארוחת ערב · איצ׳יראן',
    icon: '🍜',
    kind: 'soft',
    status: 'planned',
    startsAt: '2026-04-14T10:00:00Z',
    endsAt: '2026-04-14T11:30:00Z',
    sortOrder: 0,
    ...over,
  }) as TripEvent;

const show = (e: TripEvent, onEdit?: () => void) =>
  render(wrapNav(<EventDetail event={e} onClose={vi.fn()} onEdit={onEdit} />));

describe('EventDetail', () => {
  beforeEach(() => {
    setSimulatedNow(new Date('2026-04-14T08:00:00Z').getTime());
    tripPlaces = [];
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('states the event and its kind', () => {
    show(event());
    expect(screen.getByText('ארוחת ערב · איצ׳יראן')).toBeTruthy();
    expect(screen.getByText(t.event.soft)).toBeTruthy();
  });

  it('shows the hard-commitment guard on a hard event, and not on a soft one', () => {
    // ADR-0011, and it is what ADR-0053 made a read surface FOR: the read stands between
    // you and the edit of a real commitment.
    show(event({ kind: 'hard' }));
    expect(screen.getByText(t.index.detail.hardNote)).toBeTruthy();
    cleanup();
    show(event());
    expect(screen.queryByText(t.index.detail.hardNote)).toBeNull();
  });

  it('states the location even when the event has none', () => {
    // A row gated on having something to show meant no surface anywhere said a thing was
    // placeless, which cost a false bug report on the booking side. Same rule here.
    show(event());
    expect(screen.getByText(t.index.detail.location)).toBeTruthy();
    expect(screen.getByText(t.index.detail.noLocation)).toBeTruthy();
  });

  it('states a placed event’s address and offers the map hand-off', () => {
    tripPlaces = [
      {
        id: 'p1',
        tripId: 't1',
        name: 'Ichiran Shibuya',
        address: 'Jinnan, Shibuya City',
        lat: 35.6,
        lng: 139.7,
      } as Place,
    ];
    show(event({ placeId: 'p1' }));
    expect(screen.getByText('Jinnan, Shibuya City')).toBeTruthy();
    expect(screen.getByText(t.actions.navigate)).toBeTruthy();
  });

  it('reaches the editor through its own control', () => {
    const onEdit = vi.fn();
    show(event(), onEdit);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.index.detail.edit) }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  // **THE ARCHIVE'S WHOLE POINT** (ADR-0040): a finished trip is browsable, so the read
  // opens — and nothing on it may write, so the one control that could is absent rather
  // than disabled (ADR-0150 §8: a disabled primary is not a stand-in for "you may not").
  it('carries NO way to edit when the trip is a read-only archive', () => {
    show(event());
    expect(screen.queryByRole('button', { name: new RegExp(t.index.detail.edit) })).toBeNull();
  });
});
