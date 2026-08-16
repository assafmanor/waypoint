// @vitest-environment jsdom
// The attach slot (ADR-0173 §5). What is worth pinning here is the shape the MOCKUP changed
// and the rule the ADR is strictest about:
//
//  • Empty is ONE control. The drawn version had a header, an empty line and two entrances
//    and measured 86px on a form that already reaches ~1565px; the amendment cut that to a
//    single 40px control, and a regression to the old shape would look like a nicety.
//  • An attachment never widens visibility (§6). A link whose document this reader cannot
//    see renders as NOTHING — not a stub, not a placeholder.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DocumentAttachment, DocumentSummary } from '@waypoint/shared';
import { buildHostContextIndex } from '../lib/host-context';
import { t } from '../i18n/he';

const attachDocument = vi.fn(async () => undefined);
const detachDocument = vi.fn(async () => {});

let documents: DocumentSummary[] = [];
let documentAttachments: DocumentAttachment[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    zoneCrossings: [],
    users: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
    },
    trip: { id: 't1' },
    documents,
    documentAttachments,
    // The pair map every context resolves through (ADR-0172 §1) — empty here, so each host
    // is a context of one and the union has nothing extra to find.
    hostContexts: buildHostContextIndex([], []),
    bookings: [],
    events: [],
    attachmentVerbs: { attachDocument, detachDocument },
  }),
}));
// No IndexedDB in this environment, and a queued upload is not what these tests are about.
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [] };
});

import { DocumentAttachField, useDocumentAttach } from './DocumentAttach';
import { wrapNav } from '../test/nav-harness';

const doc = (id: string, title: string): DocumentSummary =>
  ({
    id,
    tripId: 't1',
    type: 'other',
    title,
    mimeType: 'application/pdf',
    sizeBytes: 10,
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T09:00:00.000Z',
    updatedBy: 'u1',
  }) as DocumentSummary;

const link = (id: string, documentId: string): DocumentAttachment => ({
  id,
  tripId: 't1',
  documentId,
  bookingId: 'b1',
  createdBy: 'u1',
  createdAt: '2026-08-08T10:00:00.000Z',
});

function Host({ host }: { host?: { kind: 'booking'; id: string } }) {
  const state = useDocumentAttach();
  return <DocumentAttachField state={state} host={host} />;
}

const show = (host?: { kind: 'booking'; id: string }) => render(wrapNav(<Host host={host} />));

afterEach(() => {
  cleanup();
  documents = [];
  documentAttachments = [];
  attachDocument.mockClear();
  detachDocument.mockClear();
});

describe('the empty slot is one control (§5’s amendment)', () => {
  it('shows the single attach control and nothing else', () => {
    show({ kind: 'booking', id: 'b1' });
    expect(screen.getByText(t.docs.attach.attach)).toBeTruthy();
    // The header, the chip list and the two-entrance split are what the amendment removed.
    expect(screen.queryByText(t.docs.attach.title)).toBeNull();
    expect(screen.queryByText(t.docs.attach.pick)).toBeNull();
    expect(screen.queryByText(t.docs.attach.upload)).toBeNull();
  });

  it('opens the picker from that one control, so it is not a dead end', () => {
    documents = [doc('d1', 'דרכון של דנה')];
    show({ kind: 'booking', id: 'b1' });
    fireEvent.click(screen.getByText(t.docs.attach.attach));
    expect(screen.getByText('דרכון של דנה')).toBeTruthy();
  });
});

describe('once something is attached', () => {
  it('grows the header, the chip and both entrances', () => {
    documents = [doc('d1', 'אישור הזמנה')];
    documentAttachments = [link('a1', 'd1')];
    show({ kind: 'booking', id: 'b1' });

    expect(screen.getByText(t.docs.attach.title)).toBeTruthy();
    expect(screen.getByText('אישור הזמנה')).toBeTruthy();
    expect(screen.getByText(t.docs.attach.pick)).toBeTruthy();
    expect(screen.getByText(t.docs.attach.upload)).toBeTruthy();
    // …and the empty state's single control is gone.
    expect(screen.queryByText(t.docs.attach.attach)).toBeNull();
  });

  it('detaches the LINK, which is all a detach ever removes', () => {
    documents = [doc('d1', 'אישור הזמנה')];
    documentAttachments = [link('a1', 'd1')];
    show({ kind: 'booking', id: 'b1' });

    fireEvent.click(screen.getByLabelText(t.docs.attach.detach));
    expect(detachDocument).toHaveBeenCalledWith('a1');
  });
});

// §6, on the surface where it is visible: the ADR adds a pointer, not a permission.
describe('an attachment never widens visibility', () => {
  it('renders nothing at all for a document this reader cannot see', () => {
    documents = [];
    documentAttachments = [link('a1', 'd-someone-elses')];
    show({ kind: 'booking', id: 'b1' });

    // Not a stub and not a placeholder — the slot reads as empty, which is the truth for
    // this reader.
    expect(screen.getByText(t.docs.attach.attach)).toBeTruthy();
    expect(screen.queryByText(t.docs.attach.title)).toBeNull();
  });

  it('offers only documents the reader can see, and marks the ones already here', () => {
    documents = [doc('d1', 'אישור הזמנה'), doc('d2', 'ביטוח נסיעות')];
    documentAttachments = [link('a1', 'd1')];
    show({ kind: 'booking', id: 'b1' });

    fireEvent.click(screen.getByText(t.docs.attach.pick));
    const alreadyHere = screen.getByText('אישור הזמנה', { selector: '.doc-pick-t' });
    expect(alreadyHere.closest('button')?.disabled).toBe(true);
    expect(screen.getByText('ביטוח נסיעות').closest('button')?.disabled).toBe(false);
  });
});

// On a CREATE there is no host id yet, so a pick is STAGED and the form's own save writes
// it — the same arrangement the notes composer has, for the same reason (§5).
describe('creating a host', () => {
  it('stages the pick instead of writing it, and shows it as a chip', () => {
    documents = [doc('d1', 'אישור הזמנה')];
    show(undefined);

    fireEvent.click(screen.getByText(t.docs.attach.attach));
    fireEvent.click(screen.getByText('אישור הזמנה', { selector: '.doc-pick-t' }));

    expect(attachDocument).not.toHaveBeenCalled();
    expect(screen.getByText('אישור הזמנה', { selector: '.doc-chip-n' })).toBeTruthy();
  });

  it('unstages one without touching the network', () => {
    documents = [doc('d1', 'אישור הזמנה')];
    show(undefined);

    fireEvent.click(screen.getByText(t.docs.attach.attach));
    fireEvent.click(screen.getByText('אישור הזמנה', { selector: '.doc-pick-t' }));
    fireEvent.click(screen.getByLabelText(t.docs.attach.detach));

    expect(detachDocument).not.toHaveBeenCalled();
    expect(screen.getByText(t.docs.attach.attach)).toBeTruthy();
  });
});

// An EDIT has a host, so there is nothing to wait for and the link is written now.
describe('editing a host', () => {
  it('writes the link straight away', () => {
    documents = [doc('d1', 'אישור הזמנה')];
    show({ kind: 'booking', id: 'b1' });

    fireEvent.click(screen.getByText(t.docs.attach.attach));
    fireEvent.click(screen.getByText('אישור הזמנה', { selector: '.doc-pick-t' }));

    expect(attachDocument).toHaveBeenCalledWith({ documentId: 'd1', bookingId: 'b1' });
  });
});
