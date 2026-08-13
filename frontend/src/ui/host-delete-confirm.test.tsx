// @vitest-environment jsdom
//
// **A host's delete confirm names the notes the cascade will take** (ADR-0152 §2's
// 2026-08-02 amendment). One file for the three surfaces that have such a confirm, because
// the defect was that they disagreed: a note count is trivially right on any one of them and
// the thing worth pinning is that all three say it, in the same words, from the same
// derivation.
//
// The two hosts NOT here are here in spirit: an event's soft delete and an idea's removal
// have no confirm at all and need none — their undo restores the notes (`verbs.test.ts`).
// A `Place` HAS a delete now (ADR-0157), and its confirm names the same count in the same
// words — but from `screens/Map.tsx` rather than from a sheet, so it is asserted where its
// two entrances are (`Map.test.tsx`, `Map.embedded.test.tsx`) rather than in this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  BOOKING_TYPE,
  DOCUMENT_TYPE,
  EVENT_KIND,
  type Booking,
  type DocumentSummary,
  type Note,
  type TripEvent,
} from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

const NOW = '2026-07-20T09:00:00Z';

const note = (id: string, host: Partial<Record<'bookingId' | 'documentId' | 'eventId', string>>) =>
  ({
    id,
    tripId: 't1',
    body: `הפתק ${id}`,
    source: 'member',
    createdBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
    ...host,
  }) as Note;

const booking: Booking = {
  id: 'bk-1',
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: 'ריוקאן בהאקונה',
  source: 'manual',
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
} as Booking;

const doc: DocumentSummary = {
  id: 'd1',
  tripId: 't1',
  type: DOCUMENT_TYPE.PASSPORT,
  title: 'דרכון של דנה',
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
};

let tripNotes: Note[] = [];
let tripEvents: TripEvent[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex(tripEvents, [booking]),
    // Note hosts resolve through trip-state's one index; this file asserts nothing
    // about an inherited name or category, so the index-miss fallback carries it.
    noteHosts: new Map(),
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    bookings: [booking],
    events: tripEvents,
    places: [],
    users: [],
    notes: tripNotes,
    indexVerbs: { deleteBooking: vi.fn(async () => {}) },
    noteVerbs: { createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() },
  }),
}));
vi.mock('../lib/api', () => ({
  deleteDocument: vi.fn(async () => {}),
  updateDocument: vi.fn(async () => {}),
}));

import { BookingManageSheet } from './BookingManageSheet';
import { DocumentManageSheet } from './DocumentManageSheet';
import { ConfirmProvider, useConfirmHardEdit } from './ConfirmDialog';
import { buildHostContextIndex } from '../lib/host-context';

const consequence = () => document.querySelector('.confirm-consequence')?.textContent?.trim();

beforeEach(() => {
  tripNotes = [];
  tripEvents = [];
});
afterEach(() => cleanup());

describe('a booking’s delete confirm', () => {
  const openDelete = () => {
    render(wrapNav(<BookingManageSheet booking={booking} onClose={() => {}} onEdit={() => {}} />));
    fireEvent.click(screen.getByText(t.index.detail.delete));
  };

  it('names the booking’s note count', () => {
    tripNotes = [note('n1', { bookingId: 'bk-1' }), note('n2', { bookingId: 'bk-1' })];
    openDelete();
    expect(consequence()).toBe(t.notes.hostDelete(2));
  });

  it('counts only this booking’s notes, and says nothing when there are none', () => {
    tripNotes = [note('n1', { bookingId: 'bk-other' })];
    openDelete();
    expect(consequence()).toBeUndefined();
  });

  // **The whole CONTEXT's notes go on the `both` choice, and NOTHING goes above the choices**
  // (ADR-0172 §6). The line above used to name the booking's own on both branches; since §5
  // made `unlink` CARRY those notes to the surviving event, that line is now false in the
  // branch beside it, so it is gone rather than reworded. The count on `both` is the booking's
  // plus the event's, because the booking is the anchor and only this branch takes either.
  it('names the whole context on delete-both, and nothing above the choices', () => {
    tripEvents = [
      { id: 'ev-1', bookingId: 'bk-1', kind: EVENT_KIND.HARD, title: 'צ׳ק אין' } as TripEvent,
    ];
    tripNotes = [note('n1', { bookingId: 'bk-1' }), note('n2', { eventId: 'ev-1' })];
    openDelete();

    expect(consequence()).toBeUndefined();
    const both = screen.getByText(t.index.del.both).parentElement;
    expect(both?.querySelector('.bs-choice-s')?.textContent).toContain(t.notes.hostDelete(2));
    expect(screen.getByText(t.index.del.unlink).parentElement?.textContent).not.toContain('פתק');
  });
});

describe('a document’s delete confirm', () => {
  const openDelete = () => {
    render(wrapNav(<DocumentManageSheet tripId="t1" doc={doc} onClose={() => {}} />));
    fireEvent.click(screen.getByText(t.docs.manage.delete));
  };

  // It also has to BE a ConfirmDialog now: this was the last hand-rolled prompt of the
  // family ADR-0079 folded, and the note line lives on the primitive.
  it('is the shared confirm dialog, and it names the document’s note count', () => {
    tripNotes = [note('n1', { documentId: 'd1' })];
    openDelete();
    expect(document.querySelector('.confirm[data-tone="danger"]')).toBeTruthy();
    expect(screen.getByText(t.docs.manage.deleteBody)).toBeTruthy();
    expect(consequence()).toBe(t.notes.hostDelete(1));
  });

  it('says nothing about notes when the document has none', () => {
    openDelete();
    expect(consequence()).toBeUndefined();
  });
});

describe('the hard-event delete gate', () => {
  const hardEvent = { id: 'ev-1', title: 'טיסה לטוקיו', kind: EVENT_KIND.HARD } as TripEvent;

  function Raise({ action, notes }: { action: 'edit' | 'delete'; notes: number }) {
    const confirm = useConfirmHardEdit();
    return (
      <button type="button" onClick={() => void confirm(hardEvent, action, { notes })}>
        go
      </button>
    );
  }

  const raise = (action: 'edit' | 'delete', notes: number) => {
    render(
      wrapNav(
        <ConfirmProvider>
          <Raise action={action} notes={notes} />
        </ConfirmProvider>,
      ),
    );
    fireEvent.click(screen.getByText('go'));
  };

  it('names the count it was handed', () => {
    raise('delete', 3);
    expect(consequence()).toBe(t.notes.hostDelete(3));
  });

  // An edit keeps the event, so it keeps its notes — the line would be a lie.
  it('says nothing on an EDIT, whatever the count', () => {
    raise('edit', 3);
    expect(consequence()).toBeUndefined();
  });
});
