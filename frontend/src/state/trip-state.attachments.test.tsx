// @vitest-environment jsdom
// Provider-level coverage for the attachment sync path (ADR-0173), the sibling of
// `trip-state.notes.test.tsx` — and it exists for the same two silent-failure reasons:
//
//  1. The memory channel is a `Partial<Record<EntityType, …>>`, so a missing
//     `documentAttachment` entry compiles clean and simply means a peer's attach never
//     appears until a reload.
//  2. The host-cascade rule runs beside the channels rather than inside one, because a
//     database cascade writes NO `Change` rows for the links it removes (§7) — nothing else
//     in the app would ever tell this client they are gone. The backend spec pins that
//     silence as a fact; this pins what the client owes because of it.
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  type Change,
  type DocumentAttachment,
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
  deleteBooking: vi.fn().mockResolvedValue(undefined),
  createDocumentAttachment: vi.fn().mockResolvedValue(undefined),
  deleteDocumentAttachment: vi.fn().mockResolvedValue(undefined),
  // The document channel evicts the blob cache on a delete (ADR-0055/0058); this suite is
  // about the LINKS the same delete cascades away, and there is no IndexedDB here.
  evictDocumentBlob: vi.fn(),
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
  // Queued, so every write below stays optimistic and this suite asserts what the SCREEN
  // holds rather than what a server echoed.
  restOrQueue: vi.fn().mockResolvedValue(undefined),
  enqueueOutbox: vi.fn().mockResolvedValue(undefined),
  OUTBOX_VERB: {},
}));
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

const link = (id: string, over: Partial<DocumentAttachment> = {}): DocumentAttachment => ({
  id,
  tripId: TRIP.id,
  documentId: `doc-${id}`,
  createdBy: 'u-assaf',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const SNAPSHOT: TripSnapshot = {
  trip: TRIP,
  members: [],
  users: [],
  // A linked pair, so the unlink branch below has a surviving event to carry links to. Only
  // the fields the carry reads are real — the rest is not this suite's subject.
  events: [{ id: 'e1', tripId: TRIP.id, bookingId: 'b1' } as TripSnapshot['events'][number]],
  bookings: [{ id: 'b1', tripId: TRIP.id } as TripSnapshot['bookings'][number]],
  documents: [],
  maybeItems: [],
  places: [],
  notes: [],
  tasks: [],
  documentAttachments: [
    link('a1', { bookingId: 'b1' }),
    link('a2', { eventId: 'e1' }),
    link('a3', { bookingId: 'b2', documentId: 'doc-shared' }),
  ],
  enrichments: {},
  fxRates: null,
  latestSeq: '10',
};

function Probe() {
  const { documentAttachments, indexVerbs } = useTrip();
  verbs = indexVerbs;
  return (
    <div>
      <div data-testid="ids">{documentAttachments.map((a) => a.id).join(',')}</div>
      <div data-testid="hosts">
        {documentAttachments.map((a) => `${a.documentId}@${a.eventId ?? a.bookingId}`).join(',')}
      </div>
    </div>
  );
}

/** The provider's own index verbs, captured off the probe so a test can drive
 *  `deleteBooking` the way the delete confirm does. */
let verbs: ReturnType<typeof useTrip>['indexVerbs'];

const wrap = (children: ReactNode) => (
  <MemoryRouter initialEntries={['/']}>
    <TripProvider tripId={TRIP.id}>{children}</TripProvider>
  </MemoryRouter>
);

const ids = () => screen.getByTestId('ids').textContent;
const hosts = () => screen.getByTestId('hosts').textContent;

const deliver = async (change: Partial<Change>) =>
  act(async () => {
    h.onChange?.({
      id: 'c1',
      seq: '11',
      tripId: TRIP.id,
      actorUserId: 'u-other',
      entityType: ENTITY_TYPE.DOCUMENT_ATTACHMENT,
      entityId: 'a-new',
      action: CHANGE_ACTION.CREATE,
      createdAt: '2026-07-08T03:00:00.000Z',
      ...change,
    } as Change);
  });

describe('document attachments through the provider (ADR-0173)', () => {
  beforeEach(async () => {
    h.onChange = null;
    h.fetchSnapshot.mockResolvedValue(SNAPSHOT);
    render(wrap(<Probe />));
    await screen.findByTestId('ids');
  });

  afterEach(cleanup);

  it('seeds the reactive list from the snapshot', () => {
    expect(ids()).toBe('a1,a2,a3');
  });

  // The memory channel. Without its one registry entry this silently does nothing.
  it('applies a peer’s attach to the list', async () => {
    await deliver({ entityId: 'a-new', after: { id: 'a-new', documentId: 'd9', eventId: 'e9' } });
    expect(ids()).toContain('a-new');
  });

  it('applies a peer’s detach', async () => {
    await deliver({ entityId: 'a2', action: CHANGE_ACTION.DELETE });
    expect(ids()).toBe('a1,a3');
  });

  // The cascade. The server sends ONE change — the host's delete — and no attachment change
  // at all, because Postgres removed those rows without writing any.
  it('drops a deleted host’s links on the host’s own delete change', async () => {
    await deliver({
      entityType: ENTITY_TYPE.BOOKING,
      entityId: 'b1',
      action: CHANGE_ACTION.DELETE,
    });
    expect(ids()).toBe('a2,a3');
  });

  // The other end of the row, silent in exactly the same way.
  it('drops a deleted DOCUMENT’s links', async () => {
    await deliver({
      entityType: ENTITY_TYPE.DOCUMENT,
      entityId: 'doc-shared',
      action: CHANGE_ACTION.DELETE,
    });
    expect(ids()).toBe('a1,a2');
  });

  it('leaves the list alone when the deleted host carried nothing', async () => {
    await deliver({
      entityType: ENTITY_TYPE.BOOKING,
      entityId: 'b-unrelated',
      action: CHANGE_ACTION.DELETE,
    });
    expect(ids()).toBe('a1,a2,a3');
  });

  // **ADR-0173 §3's unlink** — the branch whose whole promise is that the event survives.
  // The booking is the context's anchor, so without this its cascade would take link rows
  // the user is explicitly choosing to keep the other half of. A link has no PATCH, so the
  // carry is an attach; it happens BEFORE the delete, which offline is what puts it ahead
  // on the FIFO outbox.
  it('carries the booking’s links to the surviving event on unlink', async () => {
    await act(async () => {
      await verbs.deleteBooking('b1', { deleteEvents: false });
    });
    // `a1` put `doc-a1` on the booking; a NEW link now says that same document belongs to
    // the surviving event, so nothing the reader could see disappears with the booking.
    expect(hosts()).toContain('doc-a1@e1');
  });

  // Delete-both takes the whole context, so there is nothing to carry — and even then it
  // takes only the LINKS. The documents are never at risk, which is why the confirm says
  // nothing about them (§3).
  it('carries nothing when the event is going too', async () => {
    await act(async () => {
      await verbs.deleteBooking('b1', { deleteEvents: true });
    });
    expect(hosts()).not.toContain('doc-a1@e1');
  });
});
