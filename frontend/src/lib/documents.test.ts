import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';
import { groupDocuments } from './documents';

const ISO = '2026-07-01T00:00:00Z';
const doc = (id: string, type: DocumentType): DocumentSummary => ({
  id,
  tripId: 't1',
  type,
  title: id,
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

describe('groupDocuments', () => {
  it('groups by type in passport→insurance→visa→other order, dropping empties', () => {
    const groups = groupDocuments([
      doc('v1', DOCUMENT_TYPE.VISA),
      doc('p1', DOCUMENT_TYPE.PASSPORT),
      doc('p2', DOCUMENT_TYPE.PASSPORT),
    ]);
    expect(groups.map((g) => g.type)).toEqual([DOCUMENT_TYPE.PASSPORT, DOCUMENT_TYPE.VISA]);
    expect(groups[0].docs.map((d) => d.id)).toEqual(['p1', 'p2']);
  });

  it('returns [] for no documents', () => {
    expect(groupDocuments([])).toEqual([]);
  });
});
