// Documents grouping for the Index section (ADR-0047/0049): one group per type,
// in a fixed order, empty groups omitted. Pure so it's unit-testable.
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';

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

/** Human file size, e.g. "1.2MB" / "540KB" — the honest meta on a doc row. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
