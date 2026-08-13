// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';

const NOW = '2026-07-20T09:00:00Z';
const doc = (id: string, type: DocumentType, title: string): DocumentSummary => ({
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

let tripDocuments: DocumentSummary[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', name: 'יפן · אביב', timezone: 'Asia/Tokyo' },
    documents: tripDocuments,
    // The rows carry a note mark now (ADR-0152 §6), so the section reads the note list.
    notes: [],
  }),
}));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [], useIsOffline: () => false };
});

import { IndexDocumentsView } from './IndexDocumentsView';
import { t } from '../i18n/he';

const show = (onClose = () => {}) =>
  render(wrapNav(<IndexDocumentsView onClose={onClose} />, { mode: true }));

const chip = (label: string) => screen.getByRole('radio', { name: new RegExp(label) });
const back = () => screen.getByRole('button', { name: t.index.backAria });

describe('IndexDocumentsView (ADR-0098/ADR-0101)', () => {
  afterEach(() => {
    cleanup();
    tripDocuments = [];
  });

  it('renders the back row titled "מסמכים" (ADR-0101) and the DocumentsSection content', () => {
    show();
    expect(back()).toBeTruthy();
    expect(screen.getByText(t.docs.title)).toBeTruthy();
    expect(screen.queryByText(t.index.back)).toBeNull();
    expect(screen.getByText(t.docs.emptyTitle)).toBeTruthy();
  });

  it('calls onClose when the back button is tapped', () => {
    const onClose = vi.fn();
    show(onClose);
    fireEvent.click(back());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ADR-0102 / ADR-0052 §7: a filtered screen is not ready to leave, it is ready to show
  // everything again — and the header's arrow runs the SAME handler as system back
  // (ADR-0103), which is the whole reason the filter state lives in this component.
  describe('back peels the type filter before it leaves', () => {
    it('resets the chip on the first back and closes only on the second', () => {
      tripDocuments = [
        doc('d1', DOCUMENT_TYPE.PASSPORT, 'דרכון של דנה'),
        doc('d2', DOCUMENT_TYPE.TICKET, 'הלוך · NRT'),
      ];
      const onClose = vi.fn();
      show(onClose);

      fireEvent.click(chip(t.docs.type.ticket));
      expect(chip(t.docs.type.ticket).getAttribute('aria-checked')).toBe('true');

      fireEvent.click(back());
      expect(onClose).not.toHaveBeenCalled();
      expect(chip(t.docs.filter.all).getAttribute('aria-checked')).toBe('true');

      fireEvent.click(back());
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
