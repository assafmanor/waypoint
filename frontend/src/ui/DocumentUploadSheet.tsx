// Document upload (ADR-0015/0034/0052/0056). A type selector + file + title,
// uploaded as a group document (a per-owner picker is deferred). Reuses the
// booking sheet's form chrome. Validates size/type on pick so an oversized/wrong
// file fails instantly, then — rather than blocking on the network — closes the
// sheet immediately and hands the upload to the offline outbox (ADR-0056): the
// file flushes in the background and works offline like every other write.
import { useState } from 'react';
import { DOCUMENT_TYPE, MAX_DOCUMENT_SIZE_BYTES, type DocumentType } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { queueDocumentUpload } from '../lib/outbox';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

const DOC_TYPES = Object.values(DOCUMENT_TYPE);
const MAX_MB = Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024));
const stripExt = (name: string) => name.replace(/\.[^./\\]+$/, '');

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
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>(DOCUMENT_TYPE.PASSPORT);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | null) => {
    const problem = f ? validateFile(f) : null;
    setError(problem);
    setFile(problem ? null : f);
    if (f && !problem && !title.trim()) setTitle(stripExt(f.name));
  };

  // Optimistic (ADR-0056): validate, enqueue the file on the outbox with a
  // client-generated id (idempotent re-POST), close at once, and let the pending
  // row render from the outbox until the background flush turns it real.
  const submit = () => {
    if (!file) return setError(t.docs.upload.fileRequired);
    void queueDocumentUpload(
      tripId,
      { id: crypto.randomUUID(), type, title: title.trim() || file.name },
      file,
    );
    toast(ICONS.done, t.docs.upload.saved);
    onClose();
  };

  return (
    <Sheet ariaLabel={t.docs.upload.title} onClose={onClose}>
      <div className="booking-sheet doc-upload">
        <div className="bs-typesel">
          {DOC_TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              className={'bs-typecard' + (ty === type ? ' on' : '')}
              onClick={() => setType(ty)}
            >
              <span className="bs-typecard-ic" aria-hidden="true">
                {DOCUMENT_TYPE_ICON[ty]}
              </span>
              <span className="bs-typecard-lbl">{t.docs.type[ty]}</span>
            </button>
          ))}
        </div>

        <label className="bs-field">
          {t.docs.upload.fileLabel}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>

        <label className="bs-field">
          {t.docs.upload.titleLabel}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.docs.upload.titlePlaceholder}
          />
        </label>

        {error && <p className="bs-error">{error}</p>}

        <div className="bs-actions">
          <button type="button" className="bs-save" onClick={submit} disabled={!file || !!error}>
            {t.docs.upload.save}
          </button>
          <button type="button" className="bs-cancel" onClick={onClose}>
            {t.docs.upload.cancel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
