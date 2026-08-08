// Documents grouping for the Index section (ADR-0047/0049): one group per type,
// in a fixed order, empty groups omitted. Pure so it's unit-testable.
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';
import type { PendingUpload } from './outbox';

/** Display order for the document-type groups. */
const TYPE_ORDER: DocumentType[] = [
  DOCUMENT_TYPE.PASSPORT,
  DOCUMENT_TYPE.INSURANCE,
  DOCUMENT_TYPE.VISA,
  DOCUMENT_TYPE.OTHER,
];

export interface DocumentGroup {
  type: DocumentType;
  docs: DocumentSummary[];
}

/** Group documents by type in TYPE_ORDER, dropping empty groups. Within a group,
 *  the caller's order is preserved (the list endpoint returns newest-last). */
export function groupDocuments(docs: DocumentSummary[]): DocumentGroup[] {
  return TYPE_ORDER.map((type) => ({
    type,
    docs: docs.filter((d) => d.type === type),
  })).filter((g) => g.docs.length > 0);
}

/**
 * **Every document this device can see, queued ones included** (ADR-0056/0058).
 *
 * A queued upload is not a `Document` yet — `outboxOpToCacheChanges` returns nothing for it
 * on purpose — so it is rendered from the outbox as a row of the same shape, with empty
 * timestamps standing for "not stamped yet". `DocumentsSection` grew this inline when it was
 * the only reader; the attach slot (ADR-0173 §5) is the second, and a document you have just
 * uploaded from a booking's own form is precisely the one you want to attach, so it is here
 * rather than copied (root `CLAUDE.md` rule 8).
 *
 * A server row always wins over a pending one of the same id — that is the flush landing.
 */
export function withPendingUploads(
  documents: DocumentSummary[],
  pending: PendingUpload[],
): DocumentSummary[] {
  const known = new Set(documents.map((d) => d.id));
  const rows: DocumentSummary[] = pending
    .filter((p) => !known.has(p.id))
    .map((p) => ({
      id: p.id,
      tripId: p.tripId,
      type: p.type,
      title: p.title,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      createdAt: '',
      updatedAt: '',
      updatedBy: '',
    }));
  return [...documents, ...rows];
}
