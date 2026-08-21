// @vitest-environment jsdom
//
// Two subjects, both about what the row and the section render rather than how they look:
//
//  - **The mark on a document's row** (ADR-0152 §6). The document row is the one host row
//    with no meta line of its own, so the mark BRINGS one — the reason this has a test at all
//    is that the row must not grow a meta node when there is nothing to put in it (an empty
//    `.wp-listrow-meta` is a rendered blank line), and its height claim is e2e's.
//  - **The type chips and the search** (ADR-0052 §7). What is worth pinning here is the pair
//    of things a reasonable implementation gets wrong: a filtered-out row must stay MOUNTED
//    and collapse (ADR-0120, never `Array.filter`), and the search must reach a document by
//    its CATEGORY when the title says nothing — which is the half the owner asked for.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  DOCUMENT_TYPE,
  type DocumentSummary,
  type DocumentType,
  type Note,
} from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';

const NOW = '2026-07-20T09:00:00Z';

const doc = (
  id: string,
  title: string,
  type: DocumentType = DOCUMENT_TYPE.PASSPORT,
): DocumentSummary => ({
  id,
  tripId: 't1',
  type,
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
    zoneCrossings: [],
    users: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
      tickTask: async () => {},
    },
    trip: { id: 't1', name: 'יפן · אביב', timezone: 'Asia/Tokyo' },
    documents: tripDocuments,
    notes: tripNotes,
  }),
}));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [], useIsOffline: () => false };
});

import { DocumentsSection } from './DocumentsSection';
import { DOCUMENT_TYPE_ALL, type DocumentTypeFilter } from '../lib/documents';
import { t } from '../i18n/he';

const rowMeta = () => document.querySelector('.wp-listrow-meta');

describe('DocumentsSection — the note mark', () => {
  beforeEach(() => {
    tripDocuments = [doc('d1', 'דרכון של דנה')];
    tripNotes = [];
  });
  afterEach(() => cleanup());

  it('renders no meta line at all when the document has no notes', () => {
    render(wrapNav(<DocumentsSection />, { mode: true }));
    expect(screen.getByText('דרכון של דנה')).toBeTruthy();
    expect(rowMeta()).toBeNull();
  });

  it('brings a meta line carrying the mark once it has one, with no count at 1', () => {
    tripNotes = [note('n1', 'd1')];
    render(wrapNav(<DocumentsSection />, { mode: true }));
    expect(rowMeta()?.querySelector('.note-mark')).toBeTruthy();
    expect(rowMeta()?.textContent).toBe('');
  });

  it('counts past 1, and counts only this document’s notes', () => {
    tripNotes = [note('n1', 'd1'), note('n2', 'd1'), note('n3', 'd-other')];
    render(wrapNav(<DocumentsSection />, { mode: true }));
    expect(rowMeta()?.querySelector('.note-mark')?.textContent).toBe('2');
  });
});

describe('DocumentsSection — the type chips and the search (ADR-0052 §7)', () => {
  // A filter and a search only mean anything over a library, so: three types, one of them
  // with two documents, and one title that says nothing about its category.
  beforeEach(() => {
    tripDocuments = [
      doc('p1', 'דרכון של דנה'),
      doc('p2', 'דרכון של אסף'),
      doc('t1', 'הלוך · NRT', DOCUMENT_TYPE.TICKET),
      doc('r1', 'שינג׳וקו', DOCUMENT_TYPE.RESERVATION),
    ];
    tripNotes = [];
  });
  afterEach(() => cleanup());

  let filter: DocumentTypeFilter = DOCUMENT_TYPE_ALL;
  const show = (onFilterChange?: (f: DocumentTypeFilter) => void) =>
    render(
      wrapNav(<DocumentsSection filter={filter} onFilterChange={onFilterChange} />, {
        mode: true,
      }),
    );

  const chips = () => [...document.querySelectorAll('.filter-row .choice-pill')];
  const chipNamed = (label: string) =>
    chips().find((c) => c.textContent?.startsWith(label)) as HTMLElement;
  const groupHeads = () =>
    [...document.querySelectorAll('.doc-group .gt')].map((e) => e.textContent);
  const visibleRowTitles = () =>
    [...document.querySelectorAll('.wp-reveal:not(.hidden) .wp-listrow-title')].map(
      (e) => e.textContent,
    );
  const mountedRowTitles = () =>
    [...document.querySelectorAll('.wp-listrow-title')].map((e) => e.textContent);

  beforeEach(() => {
    filter = DOCUMENT_TYPE_ALL;
  });

  it('renders one worded chip per type that HAS a document, led by הכל with the total', () => {
    show();
    // Worded, not `compact` — the brief asked for the row "where category titles are also
    // shown", which is the bookings density. `compact` is the Map's alone now (ADR-0122 §2).
    expect(chips()[0].textContent).toContain(t.docs.filter.all);
    expect(chips()[0].textContent).toContain('4');
    const labels = chips()
      .slice(1)
      .map((c) => c.textContent);
    expect(labels.some((l) => l?.includes(t.docs.type.passport) && l.includes('2'))).toBe(true);
    expect(labels.some((l) => l?.includes(t.docs.type.ticket))).toBe(true);
    // No document of this type, so no chip (ADR-0101).
    expect(labels.some((l) => l?.includes(t.docs.type.health))).toBe(false);
  });

  it('reports a chip tap upward instead of filtering locally (the state lives on the screen)', () => {
    const onFilterChange = vi.fn();
    show(onFilterChange);
    fireEvent.click(chipNamed(t.docs.type.ticket));
    expect(onFilterChange).toHaveBeenCalledWith(DOCUMENT_TYPE.TICKET);
  });

  // ADR-0120, and the reason this is asserted rather than trusted: the naive version is
  // `docs.filter(...)`, which unmounts the row and animates nothing.
  it('hides a filtered-out row in place — still mounted, marked hidden — and keeps its group', () => {
    filter = DOCUMENT_TYPE.TICKET;
    show();
    expect(visibleRowTitles()).toEqual(['הלוך · NRT']);
    expect(mountedRowTitles()).toHaveLength(4);
    // The group heading is still rendered; its whole `RevealRow` is what carries `hidden`.
    expect(groupHeads()).toContain(t.docs.group.passport);
    const passportGroup = document.querySelector('.doc-group')?.closest('.wp-reveal');
    expect(passportGroup?.className).toContain('hidden');
  });

  it('says so when a chip matches nothing rather than showing an empty card', () => {
    tripDocuments = [doc('p1', 'דרכון של דנה')];
    filter = DOCUMENT_TYPE.TICKET;
    show();
    // The chip has no documents, so it falls back to "all" (ADR-0101) — which means the
    // library shows. The refusal state is reachable only through the query, below.
    expect(visibleRowTitles()).toEqual(['דרכון של דנה']);
  });

  describe('search', () => {
    const openSearch = () => fireEvent.click(screen.getByLabelText(t.docs.search.button));
    const type = (value: string) =>
      fireEvent.change(document.querySelector('.wp-searchfield input') as HTMLInputElement, {
        target: { value },
      });

    it('opens the overlay and hides the section behind it', () => {
      show();
      openSearch();
      expect(screen.getByText(t.docs.search.modeTitle)).toBeTruthy();
      // Not merely covered: leaving the list mounted underneath the portal duplicates every
      // row for assistive tech.
      expect(document.querySelectorAll('.filter-row')).toHaveLength(0);
    });

    it('finds a document by its CATEGORY when the title says nothing about it', () => {
      show();
      openSearch();
      type(t.docs.type.ticket);
      expect(visibleRowTitles()).toEqual(['הלוך · NRT']);
    });

    it('keeps the group heading over each result — the category title the brief asked for', () => {
      show();
      openSearch();
      type('שינג׳וקו');
      expect(visibleRowTitles()).toEqual(['שינג׳וקו']);
      expect(groupHeads()).toContain(t.docs.group.reservation);
    });

    it('searches every type regardless of the chip in force (ADR-0102)', () => {
      filter = DOCUMENT_TYPE.PASSPORT;
      show();
      openSearch();
      type(t.docs.type.ticket);
      expect(visibleRowTitles()).toEqual(['הלוך · NRT']);
    });

    it('offers no action when nothing matches — the search field is already the control', () => {
      show();
      openSearch();
      type('אין דבר כזה');
      expect(screen.getByText(t.docs.search.noResults)).toBeTruthy();
      expect(visibleRowTitles()).toEqual([]);
    });
  });
});
