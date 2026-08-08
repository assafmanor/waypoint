// Document attachments (ADR-0173). Pure derivations over the link list — no React, no
// Dexie, no clock — so both halves of the sync path and every render surface read one
// answer. The shape is `lib/notes.ts`'s, deliberately: the two features share the
// derivation and the grammar (`lib/host-context.ts`), and only the storage differs.
import {
  ATTACHMENT_HOST_FIELD,
  CHANGE_ACTION,
  ENTITY_TYPE,
  type AttachmentHostKey,
  type DocumentAttachment,
  type DocumentSummary,
  type EntityType,
} from '@waypoint/shared';
import { inContext, type HostContext } from './host-context';

/** The hosts an attachment can actually hang on — narrower than `NoteHostKind`, because the
 *  union is two members and not five (ADR-0173 §4: a place displays, never originates). */
export type AttachmentHostKind = keyof typeof ATTACHMENT_HOST_FIELD;

/** The `Change` fields these derivations read — the same subset `EntityChange` names in
 *  `lib/cache.ts`, so a live WS echo and an offline optimistic write both fit. */
type HostChange = { entityType: EntityType; entityId: string; action: string };

/** Is this link hosted by that entity? The predicate `inContext` takes, and the reason
 *  attachments can share the union with notes without sharing a row shape. */
export function isAttachedTo(
  attachment: DocumentAttachment,
  entityType: EntityType,
  entityId: string,
): boolean {
  const field = ATTACHMENT_HOST_FIELD[entityType as keyof typeof ATTACHMENT_HOST_FIELD];
  return field ? attachment[field] === entityId : false;
}

/**
 * **The sync half of the host cascade** (ADR-0173 §7) — third member of the family
 * `dropNotesForHostChange` and `clearPlaceRefsForChange` already form, and it needed no new
 * thinking, which is the evidence ADR-0157 §3's rule was worth writing down: *when a schema
 * says `Cascade` or `SetNull`, the client owes a local derivation off the parent's change.*
 *
 * The host FKs are `onDelete: Cascade` on the LINK row, so Postgres removes a deleted host's
 * links **without writing `Change` rows** — a peer holding the trip in memory or in Dexie
 * would keep rendering chips for a booking that is gone until its next full snapshot.
 *
 * **A deleted DOCUMENT is handled here too**, and it is the one cascade
 * `ATTACHMENT_HOST_FIELD` cannot name, because a document is not a host — it is the other
 * end of the row. Its `Cascade` is just as silent, and the rows have to go for the same
 * reason. (§6's resolution would already render them as nothing; leaving them would still
 * leave a count that lies.)
 *
 * Returns the SAME array reference when nothing was dropped, so every change that is not a
 * host or document delete cannot cause a re-render.
 */
export function dropAttachmentsForHostChange(
  attachments: DocumentAttachment[],
  change: HostChange,
): DocumentAttachment[] {
  if (change.action !== CHANGE_ACTION.DELETE) return attachments;
  const isDocument = change.entityType === ENTITY_TYPE.DOCUMENT;
  if (!isDocument && !(change.entityType in ATTACHMENT_HOST_FIELD)) return attachments;
  const kept = attachments.filter((a) =>
    isDocument
      ? a.documentId !== change.entityId
      : !isAttachedTo(a, change.entityType, change.entityId),
  );
  return kept.length === attachments.length ? attachments : kept;
}

/** This host's links, in the order they were attached — the list a form's chip row reads.
 *  `createdAt` and then `id`, so the several links one save can write in the same
 *  millisecond hold a stable order rather than a shuffling one. */
export function attachmentsForHost(
  attachments: DocumentAttachment[],
  kind: AttachmentHostKind,
  id: string,
): DocumentAttachment[] {
  return sortAttachments(attachments.filter((a) => isAttachedTo(a, kind, id)));
}

/** **Everything this surface shows** — its host's links and those of every other host in its
 *  context (ADR-0172 §1, reused whole by ADR-0173 §2). A linked booking and its event are
 *  one list; a place with exactly one relevant context shows that context's links under its
 *  own name, and can never originate one of its own (§4).
 *
 *  A link carries exactly one host FK, so it can match at most one member — no
 *  de-duplication is needed and none is done. Two SEPARATE links to the same document from
 *  the two rows of a pair would show that document twice, which is why the chip list
 *  resolves through `documentsForAttachments` below. */
export function attachmentsForContext(
  attachments: DocumentAttachment[],
  context: HostContext,
): DocumentAttachment[] {
  return sortAttachments(attachments.filter((a) => inContext(context, a, isAttachedTo)));
}

function sortAttachments(attachments: DocumentAttachment[]): DocumentAttachment[] {
  return [...attachments].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** One attached document, with the link that put it there — the chip row's row, since
 *  detaching needs the link's id and rendering needs the document's title. */
export interface AttachedDocument {
  attachment: DocumentAttachment;
  document: DocumentSummary;
}

/**
 * **The resolution, and the visibility rule is inside it** (ADR-0173 §6).
 *
 * A `Document` may be owned (`ownerUserId`, absent = group doc), and attaching it must not
 * turn a private document into a group one. So an attachment resolves **through the document
 * list the reader already has**: one they cannot see resolves to nothing and renders nothing
 * — an absence, not a stub, which is the same truthful degradation `noteHost` chose for an
 * unresolvable host. This ADR adds a pointer, not a permission.
 *
 * Two links to the same document from the two rows of one pair collapse to ONE chip, keyed
 * by the document: the reader is looking at one context and one document, and showing it
 * twice would be an artifact of storage. The earliest link wins, so the chip's detach
 * removes the one that has been there longest and a second press removes the other.
 */
export function documentsForAttachments(
  attachments: DocumentAttachment[],
  documents: DocumentSummary[],
): AttachedDocument[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const resolved: AttachedDocument[] = [];
  for (const attachment of attachments) {
    const document = byId.get(attachment.documentId);
    if (!document || seen.has(document.id)) continue;
    seen.add(document.id);
    resolved.push({ attachment, document });
  }
  return resolved;
}

/** The host half of a `createDocumentAttachment` input — `{ bookingId: id }` — looked up
 *  rather than spelled at the call site, which is what keeps a surface from attaching to the
 *  wrong field. `noteHostInput`'s twin, for the same reason. */
export function attachmentHostInput(
  kind: AttachmentHostKind,
  id: string,
): Partial<Record<AttachmentHostKey, string>> {
  return { [ATTACHMENT_HOST_FIELD[kind]]: id };
}

/** How many documents each host carries, keyed the way `noteCountsByHost` keys its lookup.
 *  Built once per link-list change rather than filtered per row. */
export function attachmentCountsByHost(attachments: DocumentAttachment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const attachment of attachments) {
    for (const [kind, field] of Object.entries(ATTACHMENT_HOST_FIELD) as [
      AttachmentHostKind,
      AttachmentHostKey,
    ][]) {
      const id = attachment[field];
      if (!id) continue;
      const key = `${kind}:${id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      break;
    }
  }
  return counts;
}

/** This host's attachment count, or 0. The key shape is this file's business, so callers
 *  ask by kind and id rather than building it. */
export const attachmentCountFor = (
  counts: Map<string, number>,
  kind: AttachmentHostKind,
  id: string,
): number => counts.get(`${kind}:${id}`) ?? 0;

/** **What a ROW's mark counts** — the whole context's attachments, not the host's own
 *  (ADR-0174 §1). `noteCountForContext`'s twin, and it exists for the same reason that one
 *  does: a booked event is server-materialized, so its links may sit on the booking, and a
 *  mark counting `eventId` alone would say nothing on the commonest hosted row of all.
 *
 *  A link carries exactly one host FK, so summing over the members double-counts nothing.
 *  The SECTION under the mark resolves through `attachmentsForContext` + `documentsForAttachments`
 *  over the same context, which additionally collapses two links to one document — so the two
 *  can differ by one on the one arrangement that produces it, and the section is the honest
 *  number. Naming it here rather than at a call site is what keeps four row hosts agreeing. */
export function attachmentCountForContext(
  counts: Map<string, number>,
  context: HostContext,
): number {
  return context.members.reduce(
    (total, m) =>
      m.kind in ATTACHMENT_HOST_FIELD
        ? total + attachmentCountFor(counts, m.kind as AttachmentHostKind, m.id)
        : total,
    0,
  );
}
