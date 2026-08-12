// @vitest-environment jsdom
//
// The note written on the way, on the upload form (ADR-0152 §6b) — the same composer the
// booking form carries, with one thing that is only true here.
//
// **A document upload is outbox-first even when online** (ADR-0056): `queueDocumentUpload`
// enqueues and flushes in the background. So a note POSTed straight away would race that
// flush and almost always win it, and the server refuses a note whose host it cannot see
// (`assertNoteHostInTrip`). The note therefore goes on the outbox too, behind its host —
// which is what `{ queue: true }` below is, and why it is asserted rather than assumed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DOCUMENT_TYPE, type DocumentType } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';

// jsdom has no layout engine, so the form's focus-follows-into-view has nothing to call.
Element.prototype.scrollIntoView = vi.fn();

/** The two writes, in the shapes the assertions read them back in — the upload's own
 *  client-generated id is what the note's FK has to match. */
type UploadInput = { id: string; type: DocumentType; title: string };
const queueDocumentUpload = vi.fn((_tripId: string, _input: UploadInput, _file: File) => {
  order.push('upload');
  return Promise.resolve();
});
const createNote = vi.fn(
  (_input: { body: string; documentId?: string }, _opts?: { queue?: boolean }) => {
    order.push('note');
    return Promise.resolve(undefined);
  },
);
const order: string[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    noteVerbs: { createNote, updateNote: async () => {}, deleteNote: async () => {} },
  }),
}));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  // Wrapped rather than passed: the factory is hoisted above the `const` above it, so it
  // must not READ it until the call happens.
  return {
    ...actual,
    queueDocumentUpload: (tripId: string, input: UploadInput, file: File) =>
      queueDocumentUpload(tripId, input, file),
  };
});

import { DocumentUploadSheet } from './DocumentUploadSheet';
import { t } from '../i18n/he';

const composer = () => document.querySelector('.note-compose-in') as HTMLTextAreaElement;
const pickFile = () => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'passport.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
};
const save = () => fireEvent.click(screen.getByText(t.docs.upload.save));

describe('DocumentUploadSheet — notes written on the way', () => {
  beforeEach(() => {
    order.length = 0;
    queueDocumentUpload.mockClear();
    createNote.mockClear();
  });
  afterEach(() => cleanup());

  const open = () => render(wrapNav(<DocumentUploadSheet tripId="t1" onClose={() => {}} />));

  it('writes no note when the composer was never touched', async () => {
    open();
    pickFile();
    save();
    await waitFor(() => expect(queueDocumentUpload).toHaveBeenCalled());
    expect(createNote).not.toHaveBeenCalled();
  });

  it('takes what is still in the box at save, hosted by the document, with no ＋ pressed', async () => {
    open();
    pickFile();
    fireEvent.change(composer(), { target: { value: 'בתוקף עד מרץ 2030' } });
    save();

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    const [input, opts] = createNote.mock.calls[0];
    expect(input.body).toBe('בתוקף עד מרץ 2030');
    // The same client-generated id the upload carries, so the FK is valid on flush.
    expect(input.documentId).toBe(queueDocumentUpload.mock.calls[0][1].id);
    expect(opts).toEqual({ queue: true });
  });

  it('queues the notes AFTER the upload, so FIFO keeps the host FK valid', async () => {
    open();
    pickFile();
    fireEvent.change(composer(), { target: { value: 'הראשון' } });
    fireEvent.click(screen.getByLabelText(t.notes.composer.add));
    fireEvent.change(composer(), { target: { value: 'השני' } });
    save();

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
    expect(order).toEqual(['upload', 'note', 'note']);
    expect(createNote.mock.calls.map((c) => c[0].body)).toEqual(['הראשון', 'השני']);
  });

  // **The form opens on nothing** (owner, 2026-08-13): it used to open on `passport`, so
  // a quick upload filed a ticket as a passport. Unanswered is `other`, not a refusal.
  it('opens with no type chosen and files an unanswered upload as other', async () => {
    open();
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    pickFile();
    save();
    await waitFor(() => expect(queueDocumentUpload).toHaveBeenCalled());
    expect(queueDocumentUpload.mock.calls[0][1]).toMatchObject({
      type: DOCUMENT_TYPE.OTHER,
      title: t.docs.type.other,
    });
  });

  it('files it under the type that was chosen', async () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: t.docs.type.ticket }));
    pickFile();
    save();
    await waitFor(() => expect(queueDocumentUpload).toHaveBeenCalled());
    expect(queueDocumentUpload.mock.calls[0][1]).toMatchObject({ type: DOCUMENT_TYPE.TICKET });
  });

  // The refusal runs first: a form that will not save must not leave notes behind.
  it('writes nothing at all when the file is missing', () => {
    open();
    fireEvent.change(composer(), { target: { value: 'בתוקף עד מרץ' } });
    save();
    expect(queueDocumentUpload).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });
});
