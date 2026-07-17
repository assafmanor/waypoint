// Per-document manage sheet (ADR-0052 §2/§3): rename, change type, replace the
// file, or delete — the "⋯" a document row now carries. Each action calls the
// backend PATCH/DELETE; the live list updates from the WS self-echo (ADR-0058), so
// no callback is needed. Deleting an encrypted document is irreversible, so it
// takes a confirm step.
import { useRef, useState } from 'react';
import {
  DOCUMENT_TYPE,
  MAX_DOCUMENT_SIZE_BYTES,
  type DocumentSummary,
  type DocumentType,
} from '@waypoint/shared';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';
import { deleteDocument, updateDocument } from '../lib/api';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

const DOC_TYPES = Object.values(DOCUMENT_TYPE);
const MAX_MB = Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024));

type Mode = 'menu' | 'rename' | 'type' | 'delete';

export function DocumentManageSheet({
  tripId,
  doc,
  onClose,
}: {
  tripId: string;
  doc: DocumentSummary;
  onClose: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('menu');
  const [title, setTitle] = useState(doc.title);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setBusy(false);
      toast(ICONS.warn, t.docs.manage.failed);
    }
  };

  const rename = () =>
    run(async () => {
      await updateDocument(tripId, doc.id, { title: title.trim() || doc.title });
      toast(ICONS.done, t.docs.manage.renamed);
      onClose();
    });

  const changeType = (type: DocumentType) =>
    run(async () => {
      await updateDocument(tripId, doc.id, { type });
      toast(ICONS.done, t.docs.manage.typeChanged);
      onClose();
    });

  const replace = (file: File) => {
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      toast(ICONS.warn, t.docs.upload.tooLarge(MAX_MB));
      return;
    }
    run(async () => {
      await updateDocument(tripId, doc.id, {}, file);
      toast(ICONS.done, t.docs.manage.replaced);
      onClose();
    });
  };

  const remove = () =>
    run(async () => {
      await deleteDocument(tripId, doc.id);
      toast(ICONS.done, t.docs.manage.deleted);
      onClose();
    });

  return (
    <Sheet ariaLabel={t.docs.manage.actions} onClose={onClose}>
      <div className="doc-manage">
        {mode === 'menu' && (
          <div className="row-actions">
            <button type="button" className="row-action" onClick={() => setMode('rename')}>
              <span className="row-action-ic" aria-hidden="true">
                ✏️
              </span>
              {t.docs.manage.rename}
            </button>
            <button type="button" className="row-action" onClick={() => setMode('type')}>
              <span className="row-action-ic" aria-hidden="true">
                🏷️
              </span>
              {t.docs.manage.changeType}
            </button>
            <button type="button" className="row-action" onClick={() => fileInput.current?.click()}>
              <span className="row-action-ic" aria-hidden="true">
                🔄
              </span>
              {t.docs.manage.replace}
            </button>
            <button type="button" className="row-action danger" onClick={() => setMode('delete')}>
              <span className="row-action-ic" aria-hidden="true">
                🗑️
              </span>
              {t.docs.manage.delete}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) replace(f);
              }}
            />
          </div>
        )}

        {mode === 'rename' && (
          <div className="booking-sheet">
            <label className="bs-field">
              {t.docs.manage.renameTitle}
              <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <div className="bs-actions">
              <button type="button" className="bs-save" onClick={rename} disabled={busy}>
                {busy ? <Spinner /> : t.docs.manage.rename}
              </button>
              <button type="button" className="bs-cancel" onClick={() => setMode('menu')}>
                {t.docs.manage.cancel}
              </button>
            </div>
          </div>
        )}

        {mode === 'type' && (
          <div className="booking-sheet doc-upload">
            <div className="bs-typesel">
              {DOC_TYPES.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  className={'bs-typecard' + (ty === doc.type ? ' on' : '')}
                  onClick={() => changeType(ty)}
                  disabled={busy}
                >
                  <span className="bs-typecard-ic" aria-hidden="true">
                    {DOCUMENT_TYPE_ICON[ty]}
                  </span>
                  <span className="bs-typecard-lbl">{t.docs.type[ty]}</span>
                </button>
              ))}
            </div>
            <button type="button" className="bs-cancel" onClick={() => setMode('menu')}>
              {t.docs.manage.cancel}
            </button>
          </div>
        )}

        {mode === 'delete' && (
          <div className="booking-sheet">
            <div className="sheet-title">{t.docs.manage.deleteTitle}</div>
            <p className="sheet-body">{t.docs.manage.deleteBody}</p>
            <div className="bs-actions">
              <button
                type="button"
                className="bs-save bs-danger-ok"
                onClick={remove}
                disabled={busy}
              >
                {busy ? <Spinner /> : t.docs.manage.deleteConfirm}
              </button>
              <button type="button" className="bs-cancel" onClick={() => setMode('menu')}>
                {t.docs.manage.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
