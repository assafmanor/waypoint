// Document upload (ADR-0015/0034/0052/0056/0086). A type selector, a name, and a
// file — uploaded as a group document (a per-owner picker is deferred). Validates
// size/type on pick so an oversized/wrong file fails instantly, then — rather than
// blocking on the network — closes the sheet immediately and hands the upload to
// the offline outbox (ADR-0056): the file flushes in the background and works
// offline like every other write. The pick control is the shared FilePicker and
// the type row `DocumentTypePills` (ADR-0086); the header icon tracks the type, and
// shows `other`'s until one is chosen — the form opens on nothing.
import { useId, useState } from 'react';
import { DOCUMENT_TYPE, MAX_DOCUMENT_SIZE_BYTES, type DocumentType } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { DocumentTypePills } from './DocumentTypePills';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { FilePicker } from './primitives/FilePicker';
import { useFormErrors } from './primitives/useFormErrors';
import { NoteComposer, useNoteComposer } from './NoteComposer';
import { useTrip } from '../state/trip-state';
import { generateId } from '../lib/id';
import { queueDocumentUpload, withChangeGroup } from '../lib/outbox';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, CONTROL_ICON } from '../constants';
import { t } from '../i18n/he';

const MAX_MB = Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024));

/** Client-side gate mirroring the server's cap + accept filter, so the common
 *  failures surface before the round-trip. Returns an error string or null. */
function validateFile(f: File): string | null {
  if (f.size > MAX_DOCUMENT_SIZE_BYTES) return t.docs.upload.tooLarge(MAX_MB);
  if (f.type && !f.type.startsWith('image/') && f.type !== 'application/pdf') {
    return t.docs.upload.wrongType;
  }
  return null;
}

export function DocumentUploadSheet({
  tripId,
  onClose,
  onUploaded,
}: {
  tripId: string;
  onClose: () => void;
  /** **The id this sheet just minted**, for a caller that has to do something with the
   *  document it does not yet have (ADR-0173 §5's upload entrance). The upload is
   *  outbox-first, so the new row is not in `documents` until the flush lands — but the id
   *  is client-generated and therefore known now, which is the whole reason attach-on-upload
   *  works offline. Absent everywhere else, so the Index's uploader is unchanged. */
  onUploaded?: (documentId: string) => void;
}) {
  const toast = useToast();
  const nameId = useId();
  const noteId = useId();
  const { noteVerbs } = useTrip();
  const [file, setFile] = useState<File | null>(null);
  // **Nothing is selected until it is chosen** (owner, 2026-08-13). The form used to open
  // on `passport`, which most uploads are not, so the quick path filed them as one.
  // `ChoiceGrid` has taken an optional value since ADR-0109 §11. Unanswered is not a
  // refusal: an upload with no type picked is `other`, the value that already means this.
  const [type, setType] = useState<DocumentType>();
  const headType = type ?? DOCUMENT_TYPE.OTHER;
  const [title, setTitle] = useState('');
  const composer = useNoteComposer();
  // One refusal shape for the whole app (ADR-0150): the file field is marked,
  // nudged and scrolled to, rather than quietly captioned.
  const errors = useFormErrors<'file'>();

  const refuse = (message: string) => errors.report([{ field: 'file', message }]);

  const pick = (f: File) => {
    const problem = validateFile(f);
    if (problem) refuse(problem);
    else {
      errors.clear();
      setFile(f);
    }
  };

  const clear = () => {
    setFile(null);
    errors.clear();
  };

  // Optimistic (ADR-0056): validate, enqueue the file on the outbox with a
  // client-generated id (idempotent re-POST), close at once, and let the pending
  // row render from the outbox until the background flush turns it real.
  const submit = () => {
    if (!file) return void refuse(t.docs.upload.fileRequired);
    // Title required non-empty (createDocumentSchema); an unnamed doc falls back
    // to its type label (e.g. "דרכון"), never the raw filename.
    const id = generateId();
    // One user action → one change group (ADR-0092), and the notes queue AFTER the upload:
    // the outbox is FIFO, so offline a note still finds its host on the server. The id is
    // client-generated, so it is known before either write leaves (ADR-0152 §6b).
    void withChangeGroup(async () => {
      await queueDocumentUpload(
        tripId,
        { id, type: headType, title: title.trim() || t.docs.type[headType] },
        file,
      );
      for (const body of composer.pending()) {
        // `queue` because the upload above is queued, not sent: see `NoteVerbs.createNote`.
        await noteVerbs.createNote({ body, documentId: id }, { queue: true });
      }
    });
    onUploaded?.(id);
    toast(CONTROL_ICON.done, t.docs.upload.saved);
    onClose();
  };

  return (
    <Sheet ariaLabel={t.docs.upload.title} onClose={onClose}>
      <div
        className="booking-sheet"
        {...errors.formProps}
        onFocusCapture={(e) => {
          if (e.target instanceof HTMLElement)
            e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}
      >
        <div className="titlerow du-head">
          <span className="bs-icon" aria-hidden="true">
            {DOCUMENT_TYPE_ICON[headType]}
          </span>
          <div className="du-head-text">
            <span className="du-head-title">{t.docs.upload.title}</span>
            <span className="du-head-sub">{t.docs.upload.subtitle}</span>
          </div>
        </div>

        <Field label={t.docs.upload.typeLabel}>
          <DocumentTypePills value={type} onChange={setType} />
        </Field>

        <Field label={t.docs.upload.titleLabel} htmlFor={nameId}>
          <input
            id={nameId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.docs.upload.titlePlaceholder}
          />
        </Field>

        <Field label={t.docs.upload.fileLabel} {...errors.field('file')}>
          <FilePicker
            value={file}
            onPick={pick}
            onClear={clear}
            accept="image/*,application/pdf"
            capture="environment"
            hint={t.docs.upload.pickHint(MAX_MB)}
          />
        </Field>

        {/* **The note is written on the way** (ADR-0152 §6b) — one box, and a blank one
            writes nothing, so a document that needs no note costs no press. */}
        <Field label={t.notes.composer.label} htmlFor={noteId}>
          <NoteComposer state={composer} id={noteId} />
        </Field>

        {/* Pressable with no file: `fileRequired` was unreachable copy behind a disabled
            button, which is the shape ADR-0150 §8 retires. */}
        <FormActions
          primary={{ label: t.docs.upload.save, onClick: submit }}
          secondary={{ label: t.docs.upload.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}
