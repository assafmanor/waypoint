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
import { queueDocumentUpload } from '../lib/outbox';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
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
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>(DOCUMENT_TYPE.PASSPORT);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File) => {
    const problem = validateFile(f);
    setError(problem);
    if (!problem) setFile(f);
  };

  const clear = () => {
    setFile(null);
    setError(null);
  };

  // Optimistic (ADR-0056): validate, enqueue the file on the outbox with a
  // client-generated id (idempotent re-POST), close at once, and let the pending
  // row render from the outbox until the background flush turns it real.
  const submit = () => {
    if (!file) return setError(t.docs.upload.fileRequired);
    // Title required non-empty (createDocumentSchema); an unnamed doc falls back
    // to its type label (e.g. "דרכון"), never the raw filename.
    void queueDocumentUpload(
      tripId,
      { id: crypto.randomUUID(), type, title: title.trim() || t.docs.type[type] },
      file,
    );
    toast(ICONS.done, t.docs.upload.saved);
    onClose();
  };

  return (
    <Sheet ariaLabel={t.docs.upload.title} onClose={onClose}>
      <div
        className="booking-sheet"
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

        <Field label={t.docs.upload.fileLabel} error={error}>
          <FilePicker
            value={file}
            onPick={pick}
            onClear={clear}
            accept="image/*,application/pdf"
            capture
            hint={t.docs.upload.pickHint(MAX_MB)}
          />
        </Field>

        <FormActions
          primary={{ label: t.docs.upload.save, onClick: submit, disabled: !file }}
          secondary={{ label: t.docs.upload.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}
