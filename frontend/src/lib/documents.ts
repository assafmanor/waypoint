// Documents grouping for the Index section (ADR-0047/0049): one group per type,
// in a fixed order, empty groups omitted. Pure so it's unit-testable.
//
// Since 2026-08-13 this file also owns the section's **filter + search** derivation
// (ADR-0052 §7), built in the shape the two sibling Index screens already use — a chip
// predicate, a query predicate, and both handed to the app's ONE reveal (ADR-0120) rather
// than to `Array.filter`. `index-bookings.ts` and `notes.ts` are the templates and the
// differences from them are noted where they occur.
import {
  DOCUMENT_TYPE,
  matchesAnyTerm,
  type DocumentSummary,
  type DocumentType,
} from '@waypoint/shared';
import { countVisible, revealRows, type Revealed } from './filter-reveal';
import { t } from '../i18n/he';
import type { PendingUpload } from './outbox';

/** Display order for the document-type groups — the shared table's own order (its
 *  header explains why that is the one place it is stated), which is also the order
 *  the upload and manage grids offer. */
const TYPE_ORDER = Object.values(DOCUMENT_TYPE);

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

/** **"Every type", as a chip value** — the leading filter chip, and the state the screen
 *  opens in. A sentinel rather than `undefined` so the chip row stays a plain
 *  single-select `radiogroup` with one option always checked.
 *
 *  Prefixed so it can never collide with a `DocumentType`, present or future. It is the
 *  third of these (`NOTE_CATEGORY_ALL`, `index-bookings.ts`'s `CATEGORY_ALL`) and it is
 *  deliberately a third rather than a shared constant: each is a different filter UNION,
 *  the literal is two characters, and collapsing them would touch two shipped screens to
 *  save nothing a reader was confused by. */
export const DOCUMENT_TYPE_ALL = '@all' as const;

export type DocumentTypeFilter = DocumentType | typeof DOCUMENT_TYPE_ALL;

/** How many documents each type holds — what the chips print, and what decides which
 *  chips exist at all (ADR-0101: only a type that HAS a document gets one). */
export function countDocumentsByType(docs: DocumentSummary[]): Record<DocumentType, number> {
  const counts = Object.fromEntries(Object.values(DOCUMENT_TYPE).map((ty) => [ty, 0])) as Record<
    DocumentType,
    number
  >;
  for (const d of docs) counts[d.type] += 1;
  return counts;
}

export function matchesDocumentType(doc: DocumentSummary, filter: DocumentTypeFilter): boolean {
  return filter === DOCUMENT_TYPE_ALL || doc.type === filter;
}

/** The terms a query is matched against, exactly the shape `index-bookings.ts`'s
 *  `searchTerms` established: the title, then **the type label singular and plural**, then a
 *  short synonym list. The type label is the half the owner asked for by name — typing
 *  `כרטיס` finds every ticket — and it matters more here than for a booking, because a
 *  document's title is very often just its type (`דרכון`) and the thing you are hunting is
 *  "the boarding pass", not a name you chose. */
function searchTerms(doc: DocumentSummary): (string | undefined)[] {
  return [
    doc.title,
    t.docs.type[doc.type],
    t.docs.group[doc.type],
    ...t.docs.typeSynonyms[doc.type],
  ];
}

/** Search match: title, type label (singular or plural), or a synonym — case- and
 *  punctuation-insensitive through the shared `matchesAnyTerm`. A blank query matches
 *  everything (ADR-0098 §2). */
export function matchesDocumentQuery(doc: DocumentSummary, query: string): boolean {
  if (!query.trim()) return true;
  return matchesAnyTerm(query, searchTerms(doc));
}

/** One type's group, with its rows already marked visible/hidden for the reveal. */
export interface DocumentRevealGroup {
  type: DocumentType;
  rows: Revealed<DocumentSummary>[];
  /** How many of `rows` are visible — 0 means the whole group collapses (heading and card
   *  frame included), which is why the count is here and not recomputed at the row. */
  visible: number;
}

/**
 * **Per-group visibility against the chip + the query** (ADR-0052 §7), through the app's one
 * shared reveal.
 *
 * Two things about the shape, both deliberate:
 *
 *  - **The groups survive filtering** rather than being dropped. `groupDocuments` already
 *    omits a type with no documents at all; a group whose documents all fail the predicate
 *    stays here with `visible: 0` so the caller can *collapse* it. `groups.filter(...)` is the
 *    `.filter()`-instead-of-reveal one-off ADR-0120 exists to end — it would pop a heading and
 *    a card frame out with no animation while the rows beside them collapse.
 *  - **The stagger is continuous across groups.** `revealRows` takes a `startIndex` and
 *    returns the next one for exactly this (its own comment says "upcoming → past"), so eight
 *    groups reveal as one list rather than eight lists each restarting the delay at zero.
 */
export function visibleDocumentGroups(
  docs: DocumentSummary[],
  filter: DocumentTypeFilter,
  query: string,
): DocumentRevealGroup[] {
  let startIndex = 0;
  return groupDocuments(docs).map((group) => {
    const { rows, nextIndex } = revealRows(
      group.docs,
      (doc) => matchesDocumentType(doc, filter) && matchesDocumentQuery(doc, query),
      startIndex,
    );
    startIndex = nextIndex;
    return { type: group.type, rows, visible: countVisible(rows) };
  });
}

/** How many rows the whole section will show — what the "nothing matches" state keys off,
 *  since every filtered-out row and group stays mounted. */
export function countVisibleDocuments(groups: DocumentRevealGroup[]): number {
  return groups.reduce((n, g) => n + g.visible, 0);
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
