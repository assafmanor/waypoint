// @vitest-environment jsdom
//
// `HostDocuments` is the section every read surface reuses (ADR-0174 §3), and what is only
// true HERE — and would otherwise be re-proved per host, or silently wrong on one of them —
// is which links a host RESOLVES. That goes through `lib/host-context.ts`, so this file
// drives the pairing and the inheritance rather than the two hosts a screen happens to wire.
//
// The case worth the file is the booked event: its links may sit on its BOOKING, because a
// booked event is materialized server-side and has no client id when the booking saves
// (ADR-0093 / ADR-0172 §2). A section reading `eventId` alone shows nothing on the commonest
// hosted row there is, and no per-host test would catch it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Booking, DocumentAttachment, DocumentSummary, TripEvent } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import type { NoteHostKind } from '../lib/notes';

let tripEvents: TripEvent[] = [];
let tripBookings: Booking[] = [];
let tripDocuments: DocumentSummary[] = [];
let tripAttachments: DocumentAttachment[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    // Built from this file's own fixtures, so the pairing is real rather than stubbed —
    // which is the whole point of the booked-event case below.
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: { id: 't1' },
    events: tripEvents,
    bookings: tripBookings,
    documents: tripDocuments,
    documentAttachments: tripAttachments,
  }),
}));
// The chip carries the app's ONE per-entity sync grammar (ADR-0092), so the outbox mock
// owes what `EntitySyncBadge`/`useUnsynced` read as well as the queued-upload list.
vi.mock('../lib/outbox', () => ({
  usePendingUploads: () => [],
  useSyncStatus: () => ({ state: 'synced' }),
  SYNC_STATE: { SYNCED: 'synced', PENDING: 'pending', FAILED: 'failed' },
}));

import { HostDocuments } from './HostDocuments';
import { buildHostContextIndex } from '../lib/host-context';
import { t } from '../i18n/he';

const doc = (id: string, title: string): DocumentSummary =>
  ({
    id,
    tripId: 't1',
    title,
    type: 'other',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    updatedBy: 'u1',
  }) as DocumentSummary;

const link = (id: string, documentId: string, host: Partial<DocumentAttachment>) =>
  ({
    id,
    tripId: 't1',
    documentId,
    createdBy: 'u1',
    createdAt: '2026-08-01T10:00:00Z',
    ...host,
  }) as DocumentAttachment;

const show = (kind: NoteHostKind, id: string) =>
  render(wrapNav(<HostDocuments host={{ kind, id }} />));

describe('HostDocuments', () => {
  beforeEach(() => {
    tripEvents = [];
    tripBookings = [];
    tripDocuments = [doc('d1', 'כרטיס עלייה למטוס')];
    tripAttachments = [];
  });
  afterEach(cleanup);

  it('renders NOTHING when the host carries no document', () => {
    // The one place it parts from `HostNotes`, deliberately: that section says "אין פתקים"
    // because it carries a `＋ פתק` beside it and the line is what the invitation is for.
    // A read surface has no add control, so an empty section is a header teaching nothing.
    show('booking', 'b1');
    expect(screen.queryByText(t.docs.section)).toBeNull();
  });

  it('lists a host’s own attached document', () => {
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('booking', 'b1');
    expect(screen.getByText('כרטיס עלייה למטוס')).toBeTruthy();
    expect(screen.getByText(t.docs.section)).toBeTruthy();
  });

  it('shows a BOOKED EVENT the document that sits on its booking', () => {
    // The trap this file exists for. Nothing here is on the event.
    tripBookings = [{ id: 'b1', tripId: 't1', title: 'טיסה' } as Booking];
    tripEvents = [{ id: 'e1', tripId: 't1', bookingId: 'b1' } as TripEvent];
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('event', 'e1');
    expect(screen.getByText('כרטיס עלייה למטוס')).toBeTruthy();
  });

  it('shows a BOOKING the document that sits on its event, which is the same union read back', () => {
    tripBookings = [{ id: 'b1', tripId: 't1', title: 'טיסה' } as Booking];
    tripEvents = [{ id: 'e1', tripId: 't1', bookingId: 'b1' } as TripEvent];
    tripAttachments = [link('a1', 'd1', { eventId: 'e1' })];
    show('booking', 'b1');
    expect(screen.getByText('כרטיס עלייה למטוס')).toBeTruthy();
  });

  it('has NO detach on a read surface, and that asymmetry is the decision', () => {
    // Detaching is an authoring act and stays on the host's form (ADR-0174 §2): one less
    // control on every read surface, and no destructive tap where you came to look.
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('booking', 'b1');
    expect(screen.queryByLabelText(t.docs.attach.detach)).toBeNull();
  });

  it('makes the whole chip the way IN — the reach the app did not have', () => {
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('booking', 'b1');
    expect(screen.getByRole('button', { name: /כרטיס עלייה למטוס/ })).toBeTruthy();
  });

  it('renders a document this reader cannot see as an ABSENCE, never a stub', () => {
    // ADR-0173 §6's visibility rule, and it comes along for free because the resolution runs
    // over the document list the reader already has. This adds a pointer and no permission.
    tripDocuments = [];
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('booking', 'b1');
    expect(screen.queryByText(t.docs.section)).toBeNull();
  });

  it('collapses two links to one document into ONE chip', () => {
    // Both rows of a pair may carry their own link to the same file; the reader is looking
    // at one context and one document, so showing it twice would be an artifact of storage.
    tripBookings = [{ id: 'b1', tripId: 't1', title: 'טיסה' } as Booking];
    tripEvents = [{ id: 'e1', tripId: 't1', bookingId: 'b1' } as TripEvent];
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' }), link('a2', 'd1', { eventId: 'e1' })];
    show('event', 'e1');
    expect(screen.getAllByText('כרטיס עלייה למטוס')).toHaveLength(1);
  });

  it('lets a PLACE display its one context’s document, and says where it came from', () => {
    // A place is a one-way inheritor: it displays and can never originate (ADR-0173 §4). The
    // "from" line matters a shade more here than it does for a note — the document is not
    // about this place, it belongs to a booking that could be deleted out from under it.
    tripBookings = [{ id: 'b1', tripId: 't1', title: 'מלון פארק', placeId: 'p1' } as Booking];
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('place', 'p1');
    expect(screen.getByText('כרטיס עלייה למטוס')).toBeTruthy();
    expect(screen.getByText(t.docs.from('מלון פארק'))).toBeTruthy();
  });

  it('shows a place with TWO relevant contexts nothing at all', () => {
    // Ambiguity resolves to absence in both directions (ADR-0172 §3), so a place that gains
    // a second reference simply stops resolving rather than leaking one context into another.
    tripBookings = [
      { id: 'b1', tripId: 't1', title: 'מלון פארק', placeId: 'p1' } as Booking,
      { id: 'b2', tripId: 't1', title: 'ארוחה', placeId: 'p1' } as Booking,
    ];
    tripAttachments = [link('a1', 'd1', { bookingId: 'b1' })];
    show('place', 'p1');
    expect(screen.queryByText(t.docs.section)).toBeNull();
  });
});
