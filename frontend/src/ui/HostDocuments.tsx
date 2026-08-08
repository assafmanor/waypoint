// **A host's attached documents, on the surface the host already has** (ADR-0174 §3) —
// `HostNotes`'s peer in every respect, over the same `lib/host-context.ts` derivation.
//
// One connected component rather than a wiring per host, for the reason `HostNotes`'s own
// file records about itself: `BookingDetail` did it inline first, which was right for one
// host, and the place card and the expanded day card would have been the second and third
// copies of the same eight lines — the shape ADR-0094/0096 exist to stop. Documents were at
// exactly that moment.
//
// **The third consumer of ADR-0172's derivation, not a second copy of it.** A linked booking
// and event are ONE context, so a document attached on either row shows on both — and
// because the row's mark counts through the same `resolveHostContext` call, the mark and
// this section cannot disagree about what a host carries. That trap is real: a booked event
// is materialized server-side from a seed (ADR-0093), so at the moment a booking saves there
// is no client-held event id and the link lands on the BOOKING. An `eventId`-only read would
// show nothing on the commonest hosted row there is.
//
// **ADR-0173 §6's visibility rule comes along for free**, because the resolution is
// `documentsForAttachments` over the document list this reader already has: an attachment
// whose document this reader cannot see resolves to nothing and renders nothing. This adds a
// pointer and no permission.
//
// **Empty renders NOTHING, and that is the one place it parts from `HostNotes`.** That
// section says `אין פתקים` because it carries a `＋ פתק` beside it and the line is what the
// invitation is for. This one has no add control on any read surface (§2's asymmetry), so an
// empty section would be a header and a sentence teaching nothing — 56px on every booking
// and event that has never attached anything, which is most of them. It is the same
// arithmetic ADR-0173 §5's amendment already made about the form's empty slot.
import { useMemo } from 'react';
import { useTrip } from '../state/trip-state';
import { usePendingUploads } from '../lib/outbox';
import { withPendingUploads } from '../lib/documents';
import {
  attachmentsForContext,
  documentsForAttachments,
  isAttachedTo,
  type AttachedDocument,
} from '../lib/attachments';
import type { NoteHostRef } from '../lib/notes';
import { useAnchorName, useHostContext } from './HostNotes';
import { DocumentChips } from './DocumentChips';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './attach.css';

/** The host, by kind and id only — a document section names nothing, so unlike `HostNotes`
 *  it needs no `name` and asking for one would make four call sites carry a string that goes
 *  nowhere. */
export type DocumentHostRef = Pick<NoteHostRef, 'kind' | 'id'>;

export function HostDocuments({ host, className }: { host: DocumentHostRef; className?: string }) {
  const { trip, documents, documentAttachments } = useTrip();
  const pendingUploads = usePendingUploads(trip.id);
  // A document uploaded from this host's own form is not a `Document` until the outbox
  // flushes, and it is exactly the one you just attached — so the read surface has to see it
  // too, or a fresh attachment vanishes for as long as the upload is queued (ADR-0056/0092).
  const visible = useMemo(
    () => withPendingUploads(documents, pendingUploads),
    [documents, pendingUploads],
  );
  const context = useHostContext(host.kind, host.id);
  const attached = useMemo(
    () => documentsForAttachments(attachmentsForContext(documentAttachments, context), visible),
    [documentAttachments, context, visible],
  );
  // **Where an inherited document came from**, answered per document so only the inherited
  // ones are marked. Only a place can display a context it is not a member of (ADR-0172 §3),
  // and here it matters a shade more than it does for a note: the document is not ABOUT this
  // place, it belongs to a booking that could be deleted out from under it.
  const anchorName = useAnchorName(context, host);
  const from = (row: AttachedDocument) =>
    anchorName && !isAttachedTo(row.attachment, host.kind, host.id)
      ? t.docs.from(anchorName)
      : undefined;

  if (attached.length === 0) return null;
  return (
    <div className={'docr-sec' + (className ? ` ${className}` : '')}>
      <div className="docr-sec-h">
        <span className="t">
          <Icon name="documents" /> {t.docs.section}
        </span>
      </div>
      <DocumentChips
        className="docr-list"
        rows={attached.map((row) => ({ document: row.document, from: from(row) }))}
      />
    </div>
  );
}
