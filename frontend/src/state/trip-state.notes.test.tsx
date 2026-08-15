// @vitest-environment jsdom
// Provider-level coverage for the notes sync path (ADR-0152). Two things here are
// SILENT failures rather than compile errors, which is exactly why they get a test:
//
//  1. The memory channel is a `Partial<Record<EntityType, …>>`, so a missing `note` entry
//     compiles clean and simply means a peer's note never appears until a reload.
//  2. The host-cascade rule runs beside the channels rather than inside one, because a
//     database cascade writes NO Change rows for the notes it removes (§2) — nothing else
//     in the app would ever tell this client they are gone.
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  type Change,
  type Note,
  type TripSnapshot,
} from '@waypoint/shared';
import { TRIP } from '../fixtures';

const h = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  onChange: null as ((change: Change) => void) | null,
}));

vi.mock('../lib/api', () => ({
  fetchSnapshot: h.fetchSnapshot,
  fetchChanges: vi.fn().mockResolvedValue([]),
  isHardEventConfirmError: () => false,
}));
vi.mock('../lib/cache', () => ({
  cacheSnapshot: vi.fn().mockResolvedValue(undefined),
  readCachedSnapshot: vi.fn().mockResolvedValue(null),
  applyChangeToCache: vi.fn(),
  clearTripCache: vi.fn(),
  coerceClearedFields: (patch: unknown) => patch,
  coerceTripPatch: (patch: unknown) => patch,
}));
vi.mock('../lib/outbox', () => ({
  isOffline: () => true,
  flushOutbox: vi.fn().mockResolvedValue(undefined),
  getSyncFailures: () => [],
  subscribeSyncFailures: () => () => {},
  restOrQueue: vi.fn(),
  OUTBOX_VERB: {},
}));
// Capture the provider's own change handler so a "peer wrote a note" frame can be
// delivered the way the socket would deliver it.
vi.mock('../lib/ws', () => ({
  openTripStream: (_tripId: string, _seq: string, handlers: { onChange: (c: Change) => void }) => {
    h.onChange = handlers.onChange;
    return () => {};
  },
}));
vi.mock('../lib/useClock', () => ({
  getNow: () => Date.parse('2026-07-08T12:00:00+09:00'),
  useClock: () => new Date('2026-07-08T12:00:00+09:00'),
}));
vi.mock('./auth-state', () => ({ useAuth: () => ({ me: null }) }));
vi.mock('../ui/Toast', () => ({ useToast: () => () => {} }));

import { TripProvider, useTrip } from './trip-state';

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  tripId: TRIP.id,
  body: `note ${id}`,
  source: 'member',
  createdBy: 'u-assaf',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u-assaf',
  ...over,
});

const SNAPSHOT: TripSnapshot = {
  trip: TRIP,
  members: [],
  users: [],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  notes: [note('n1', { eventId: 'e1' }), note('n2', { eventId: 'e2' }), note('n3')],
  tasks: [],
  documentAttachments: [],
  enrichments: {},
  fxRates: null,
  latestSeq: '10',
};

function Probe() {
  const { notes } = useTrip();
  return <div data-testid="ids">{notes.map((n) => n.id).join(',')}</div>;
}

const wrap = (children: ReactNode) => (
  <MemoryRouter initialEntries={['/']}>
    <TripProvider tripId={TRIP.id}>{children}</TripProvider>
  </MemoryRouter>
);

const ids = () => screen.getByTestId('ids').textContent;

const deliver = async (change: Partial<Change>) =>
  act(async () => {
    h.onChange?.({
      id: 'c1',
      seq: '11',
      tripId: TRIP.id,
      actorUserId: 'u-other',
      entityType: ENTITY_TYPE.NOTE,
      entityId: 'n-new',
      action: CHANGE_ACTION.CREATE,
      createdAt: '2026-07-08T03:00:00.000Z',
      ...change,
    } as Change);
  });

describe('notes through the provider (ADR-0152)', () => {
  beforeEach(async () => {
    h.onChange = null;
    h.fetchSnapshot.mockResolvedValue(SNAPSHOT);
    render(wrap(<Probe />));
    await screen.findByTestId('ids');
  });

  afterEach(cleanup);

  it('seeds the reactive list from the snapshot', () => {
    expect(ids()).toBe('n1,n2,n3');
  });

  // The memory channel. Without its one registry entry this silently does nothing.
  it('applies a peer’s note create to the list', async () => {
    await deliver({ entityId: 'n-new', after: { id: 'n-new', body: 'מזומן בלבד' } });
    expect(ids()).toContain('n-new');
  });

  it('applies a peer’s note edit in place', async () => {
    await deliver({
      entityId: 'n3',
      action: CHANGE_ACTION.UPDATE,
      after: { body: 'תוקן על ידי חבר' },
    });
    expect(ids()).toBe('n1,n2,n3');
  });

  it('applies a peer’s note delete', async () => {
    await deliver({ entityId: 'n2', action: CHANGE_ACTION.DELETE });
    expect(ids()).toBe('n1,n3');
  });

  // The cascade. The server sends ONE change — the host's delete — and no note change at
  // all, because Postgres removed those rows without writing any.
  it('drops a deleted host’s notes on the host’s own delete change', async () => {
    await deliver({
      entityType: ENTITY_TYPE.EVENT,
      entityId: 'e1',
      action: CHANGE_ACTION.DELETE,
    });
    expect(ids()).toBe('n2,n3');
  });

  it('leaves the list alone when the deleted host hosted nothing', async () => {
    await deliver({
      entityType: ENTITY_TYPE.EVENT,
      entityId: 'e-unrelated',
      action: CHANGE_ACTION.DELETE,
    });
    expect(ids()).toBe('n1,n2,n3');
  });
});
