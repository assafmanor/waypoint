// @vitest-environment jsdom
//
// The mark on a document's row (ADR-0152 §6). The document row is the one host row with no
// meta line of its own, so the mark BRINGS one — the reason this has a test at all is that
// the row must not grow a meta node when there is nothing to put in it (an empty
// `.wp-listrow-meta` is a rendered blank line), and its height claim is e2e's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DOCUMENT_TYPE, type DocumentSummary, type Note } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';

const NOW = '2026-07-20T09:00:00Z';

const doc = (id: string, title: string): DocumentSummary => ({
  id,
  tripId: 't1',
  type: DOCUMENT_TYPE.PASSPORT,
  title,
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const note = (id: string, documentId: string): Note =>
  ({
    id,
    tripId: 't1',
    body: 'בתוקף עד מרץ',
    documentId,
    source: 'member',
    createdBy: 'u1',
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'u1',
  }) as Note;

let tripDocuments: DocumentSummary[] = [];
let tripNotes: Note[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    documents: tripDocuments,
    notes: tripNotes,
  }),
}));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [], useIsOffline: () => false };
});

import { DocumentsSection } from './DocumentsSection';

const rowMeta = () => document.querySelector('.wp-listrow-meta');

describe('DocumentsSection — the note mark', () => {
  beforeEach(() => {
    tripDocuments = [doc('d1', 'דרכון של דנה')];
    tripNotes = [];
  });
  afterEach(() => cleanup());

  it('renders no meta line at all when the document has no notes', () => {
    render(wrapNav(<DocumentsSection />));
    expect(screen.getByText('דרכון של דנה')).toBeTruthy();
    expect(rowMeta()).toBeNull();
  });

  it('brings a meta line carrying the mark once it has one, with no count at 1', () => {
    tripNotes = [note('n1', 'd1')];
    render(wrapNav(<DocumentsSection />));
    expect(rowMeta()?.querySelector('.note-mark')).toBeTruthy();
    expect(rowMeta()?.textContent).toBe('');
  });

  it('counts past 1, and counts only this document’s notes', () => {
    tripNotes = [note('n1', 'd1'), note('n2', 'd1'), note('n3', 'd-other')];
    render(wrapNav(<DocumentsSection />));
    expect(rowMeta()?.querySelector('.note-mark')?.textContent).toBe('2');
  });
});
