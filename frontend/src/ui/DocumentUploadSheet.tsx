// Document upload (ADR-0015/0034). A type selector + file + title, uploaded as a
// group document (a per-owner picker is deferred). Reuses the booking sheet's
// form chrome for consistency.
import { useState } from 'react';
import { DOCUMENT_TYPE, type DocumentType, type TripDocument } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { uploadDocument } from '../lib/api';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

const DOC_TYPES = Object.values(DOCUMENT_TYPE);
const stripExt = (name: string) => name.replace(/\.[^./\\]+$/, '');

export function DocumentUploadSheet({
  tripId,
  onClose,
  onUploaded,
}: {
  tripId: string;
  onClose: () => void;
  onUploaded: (doc: TripDocument) => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>(DOCUMENT_TYPE.PASSPORT);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | null) => {
    setFile(f);
    setError(null);
    if (f && !title.trim()) setTitle(stripExt(f.name));
  };

  const submit = async () => {
    if (!file) return setError(t.docs.upload.fileRequired);
    setSaving(true);
    try {
      const doc = await uploadDocument(tripId, { type, title: title.trim() || file.name }, file);
      onUploaded(doc);
      toast(ICONS.done, t.docs.upload.saved);
      onClose();
    } catch {
      setSaving(false);
      toast(ICONS.warn, t.docs.upload.failed);
    }
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
          <button type="button" className="bs-save" onClick={submit} disabled={saving}>
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
