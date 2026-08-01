// Document upload (ADR-0015/0034/0052/0056/0086). A type selector, a name, and a
// file — uploaded as a group document (a per-owner picker is deferred). Validates
// size/type on pick so an oversized/wrong file fails instantly, then — rather than
// blocking on the network — closes the sheet immediately and hands the upload to
// the offline outbox (ADR-0056): the file flushes in the background and works
// offline like every other write. The pick control is the shared FilePicker and
// the type grid the shared ChoiceGrid (ADR-0086); the header icon tracks the type.
import { useId, useState } from 'react';
import { DOCUMENT_TYPE, MAX_DOCUMENT_SIZE_BYTES, type DocumentType } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { FilePicker } from './primitives/FilePicker';
import { useFormErrors } from './primitives/useFormErrors';
import { NoteComposer, useNoteComposer } from './NoteComposer';
import { useTrip } from '../state/trip-state';
import { queueDocumentUpload, withChangeGroup } from '../lib/outbox';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, CONTROL_ICON } from '../constants';
import { t } from '../i18n/he';

const MAX_MB = Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024));

const TYPE_OPTIONS = Object.values(DOCUMENT_TYPE).map((ty) => ({
  value: ty,
  icon: DOCUMENT_TYPE_ICON[ty],
  label: t.docs.type[ty],
}));

/** Client-side gate mirroring the server's cap + accept filter, so the common
 *  failures surface before the round-trip. Returns an error string or null. */
function validateFile(f: File): string | null {
  if (f.size > MAX_DOCUMENT_SIZE_BYTES) return t.docs.upload.tooLarge(MAX_MB);
  if (f.type && !f.type.startsWith('image/') && f.type !== 'application/pdf') {
    return t.docs.upload.wrongType;
  }
  return null;
}

export function DocumentUploadSheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const toast = useToast();
  const nameId = useId();
  const noteId = useId();
  const { noteVerbs } = useTrip();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>(DOCUMENT_TYPE.PASSPORT);
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
    const id = crypto.randomUUID();
    // One user action → one change group (ADR-0092), and the notes queue AFTER the upload:
    // the outbox is FIFO, so offline a note still finds its host on the server. The id is
    // client-generated, so it is known before either write leaves (ADR-0152 §6b).
    void withChangeGroup(async () => {
      await queueDocumentUpload(
        tripId,
        { id, type, title: title.trim() || t.docs.type[type] },
        file,
      );
      for (const body of composer.pending()) {
        // `queue` because the upload above is queued, not sent: see `NoteVerbs.createNote`.
        await noteVerbs.createNote({ body, documentId: id }, { queue: true });
      }
    });
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
            {DOCUMENT_TYPE_ICON[type]}
          </span>
          <div className="du-head-text">
            <span className="du-head-title">{t.docs.upload.title}</span>
            <span className="du-head-sub">{t.docs.upload.subtitle}</span>
          </div>
        </div>

        <Field label={t.docs.upload.typeLabel}>
          <ChoiceGrid
            options={TYPE_OPTIONS}
            value={type}
            onChange={setType}
            ariaLabel={t.docs.upload.typeLabel}
          />
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
        <Field label={t.notes.composer.label} htmlFor={noteId} hint={t.notes.composer.hintPlain}>
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
