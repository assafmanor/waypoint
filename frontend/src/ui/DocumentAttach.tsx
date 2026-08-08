// **A document is attached ON THE WAY** (ADR-0173 §5, owner's call): adding one to a booking
// or an event never sends you to another screen first. The host's own form carries this slot,
// with two entrances — pick a document the trip already holds, or upload a new one through
// `DocumentUploadSheet`, reused rather than forked into an "attach and upload" variant.
//
// **THE EMPTY STATE IS ONE CONTROL, AND THE MOCKUP IS WHY** (§5's same-day amendment). Drawn
// with a header, an empty-state line and both entrances it measured **86px**
// (`mockups/notes-and-documents-in-context-v1.html` §1) on a form ADR-0155 already measures
// at ~1565px against ~675px of visible phone — a fixed toll on every booking, paid for a
// capability most bookings will never use. So the header, the chip list and the split into
// two entrances appear only once something is attached: 40px empty, ~34px per chip after.
// Same rule the notes composer settled on for the same reason: **the composer is small until
// there is something to compose with.**
//
// **A chip is a document, not a link.** Two rows of one pair may each carry their own link to
// the same file, and the reader is looking at one context and one document — `documentsForAttachments`
// collapses that, and it is also where §6's visibility rule lives: a link whose document this
// reader cannot see resolves to NOTHING, never a stub.
import { useMemo, useState } from 'react';
import type { DocumentSummary } from '@waypoint/shared';
import { useTrip, type AttachmentVerbs } from '../state/trip-state';
import { usePendingUploads } from '../lib/outbox';
import { withPendingUploads } from '../lib/documents';
import {
  attachmentHostInput,
  attachmentsForContext,
  documentsForAttachments,
  type AttachmentHostKind,
} from '../lib/attachments';
import { useHostContext } from './HostNotes';
import { DocumentChips, type DocumentChipRow } from './DocumentChips';
import { DocumentPickerSheet } from './DocumentPickerSheet';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './attach.css';

/** A document this form has picked but not yet written — the attachment half of
 *  `NoteComposerState.drafts`, and it exists for the same reason: on a CREATE there is no
 *  host id yet to attach to, so the links ride the host's own save. */
export interface DocumentAttachState {
  /** Document ids staged in this form session, in the order they were picked. */
  staged: string[];
  /** Ids whose DOCUMENT is itself only queued (a fresh upload, ADR-0056), so their attach
   *  must be forced onto the outbox — see `AttachmentVerbs.attachDocument`'s `queue`. */
  queued: Set<string>;
  stage: (documentId: string, opts?: { queued?: boolean }) => void;
  unstage: (documentId: string) => void;
  /** Every link this form should write. The host's save calls it, exactly as it calls
   *  `NoteComposerState.pending()`. */
  pending: () => { documentId: string; queued: boolean }[];
  reset: () => void;
}

export function useDocumentAttach(): DocumentAttachState {
  const [staged, setStaged] = useState<string[]>([]);
  const [queued, setQueued] = useState<Set<string>>(() => new Set());

  return useMemo<DocumentAttachState>(
    () => ({
      staged,
      queued,
      stage: (documentId, opts) => {
        setStaged((list) => (list.includes(documentId) ? list : [...list, documentId]));
        if (opts?.queued) setQueued((set) => new Set(set).add(documentId));
      },
      unstage: (documentId) => setStaged((list) => list.filter((id) => id !== documentId)),
      pending: () => staged.map((documentId) => ({ documentId, queued: queued.has(documentId) })),
      reset: () => {
        setStaged([]);
        setQueued(new Set());
      },
    }),
    [staged, queued],
  );
}

/**
 * **Write a form's staged attachments, after its host and inside the same change group.**
 *
 * Ordering is the whole reason this is a helper rather than a loop at each call site: the
 * outbox is FIFO, so a link queued after its host still finds that host on the server —
 * and a link to a document that is ITSELF only queued needs `{ queue: true }`, or its POST
 * overtakes the upload's background flush and the server refuses a document it cannot see.
 * Both facts are already solved once (ADR-0173 §5); this is where they are applied.
 */
export async function writeStagedAttachments(
  state: DocumentAttachState,
  attach: AttachmentVerbs['attachDocument'],
  /** The same host object the form's notes are written with — `{ bookingId }` on a booked
   *  save, `{ eventId }` otherwise — so the two content types cannot end up on different
   *  rows of one context. */
  where: { eventId?: string; bookingId?: string },
): Promise<void> {
  for (const { documentId, queued } of state.pending()) {
    await attach({ documentId, ...where }, queued ? { queue: true } : undefined);
  }
}

/** The slot itself. `host` is absent on a CREATE — nothing is written yet, so every chip is
 *  staged and the form's save does the rest. */
export function DocumentAttachField({
  state,
  host,
}: {
  state: DocumentAttachState;
  host?: { kind: AttachmentHostKind; id: string };
}) {
  const { trip, documents, documentAttachments, attachmentVerbs } = useTrip();
  const pendingUploads = usePendingUploads(trip.id);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Queued uploads included, because the document you just uploaded from this very form is
  // exactly the one you are attaching, and it is not a `Document` until the flush lands.
  const visible = useMemo(
    () => withPendingUploads(documents, pendingUploads),
    [documents, pendingUploads],
  );

  // The host's WHOLE context (ADR-0172 §1, reused by §2) — a linked booking and its event
  // are one list, so a chip added on either row is on both. `undefined` while creating.
  const context = useHostContext(host?.kind ?? 'booking', host?.id ?? '');
  const attached = useMemo(
    () =>
      host
        ? documentsForAttachments(attachmentsForContext(documentAttachments, context), visible)
        : [],
    [host, documentAttachments, context, visible],
  );

  const stagedDocs = useMemo(() => {
    const attachedIds = new Set(attached.map((a) => a.document.id));
    return state.staged
      .filter((id) => !attachedIds.has(id))
      .map((id) => visible.find((d) => d.id === id))
      .filter((d): d is DocumentSummary => !!d);
  }, [state.staged, attached, visible]);

  const taken = useMemo(
    () => new Set([...attached.map((a) => a.document.id), ...stagedDocs.map((d) => d.id)]),
    [attached, stagedDocs],
  );
  const isEmpty = attached.length === 0 && stagedDocs.length === 0;

  // Committed links detach through the verb; a staged pick is unstaged, since it was never
  // written. One list, so the chip component needs to know about neither.
  const chipRows: DocumentChipRow[] = [
    ...attached.map(({ attachment, document }) => ({
      document,
      onRemove: () => void attachmentVerbs.detachDocument(attachment.id),
    })),
    ...stagedDocs.map((document) => ({
      document,
      onRemove: () => state.unstage(document.id),
    })),
  ];

  const onPick = (documentId: string) => {
    setPicking(false);
    // On an EDIT the link is written now, because the host already exists and there is
    // nothing to wait for. On a CREATE it is staged and rides the save.
    if (host)
      void attachmentVerbs.attachDocument({
        documentId,
        ...attachmentHostInput(host.kind, host.id),
      });
    else state.stage(documentId);
  };

  const onUploaded = (documentId: string) => {
    // Always staged-or-queued, never a plain attach: the document itself is outbox-first
    // (ADR-0056), so the link has to queue behind it whether or not we are online.
    if (host)
      void attachmentVerbs.attachDocument(
        { documentId, ...attachmentHostInput(host.kind, host.id) },
        { queue: true },
      );
    else state.stage(documentId, { queued: true });
  };

  const sheets = (
    <>
      {picking && (
        <DocumentPickerSheet
          documents={visible}
          taken={taken}
          onPick={onPick}
          // The upload entrance is reachable from here too, which is what keeps the empty
          // slot's ONE control from being a dead end on a trip with no documents yet.
          onUpload={() => {
            setPicking(false);
            setUploading(true);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {uploading && (
        <DocumentUploadSheet
          tripId={trip.id}
          onUploaded={onUploaded}
          onClose={() => setUploading(false)}
        />
      )}
    </>
  );

  // **Variant D**: nothing attached, so nothing but the one control. It is 44px and solid
  // now rather than 40px and dashed (ADR-0174 §5) — same one control, reading as an
  // invitation instead of as scaffolding.
  if (isEmpty) {
    return (
      <div className="doc-sec">
        <button type="button" className="doc-add-one" onClick={() => setPicking(true)}>
          <span className="doc-add-ic" aria-hidden="true">
            <Icon name="documents" />
          </span>
          <span className="doc-add-l">{t.docs.attach.attach}</span>
          <span className="doc-add-p" aria-hidden="true">
            <Icon name="plus" />
          </span>
        </button>
        {sheets}
      </div>
    );
  }

  return (
    <div className="doc-sec">
      <div className="doc-sec-h">
        <span className="t">
          <Icon name="documents" /> {t.docs.attach.title}
        </span>
      </div>
      {/* THE SAME CHIP THE READ SURFACES RENDER (ADR-0174 §2), extracted rather than kept as
          a private copy: the form's chip now opens the document too, since the point of
          attaching a boarding pass on the way is that you meant to look at it later. What
          the form keeps and a read surface does not is the detach. */}
      <DocumentChips rows={chipRows} />
      {/* The split into two entrances, which only exists once the slot holds something. */}
      <div className="doc-add">
        <button type="button" onClick={() => setPicking(true)}>
          <Icon name="plus" /> {t.docs.attach.pick}
        </button>
        <button type="button" onClick={() => setUploading(true)}>
          <Icon name="upload" /> {t.docs.attach.upload}
        </button>
      </div>
      {sheets}
    </div>
  );
}
