// Per-document manage sheet (ADR-0052 §2/§3, trimmed by the 2026-07-18 amendment):
// the "⋯" a document row carries offers exactly Edit · Delete. Edit is one sheet
// that renames and changes the type together; delete is guarded (an encrypted
// document is irreversible). Each action calls the backend PATCH/DELETE; the live
// list updates from the WS self-echo (ADR-0058), so no callback is needed.
import { useState } from 'react';
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';
import { deleteDocument, updateDocument } from '../lib/api';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

const DOC_TYPES = Object.values(DOCUMENT_TYPE);

type Mode = 'menu' | 'edit' | 'delete';

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
  const [type, setType] = useState<DocumentType>(doc.type);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setBusy(false);
      toast(ICONS.warn, t.docs.manage.failed);
    }
  };

  const save = () =>
    run(async () => {
      await updateDocument(tripId, doc.id, { title: title.trim() || doc.title, type });
      toast(ICONS.done, t.docs.manage.saved);
      onClose();
    });

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
            <button type="button" className="row-action" onClick={() => setMode('edit')}>
              <span className="row-action-ic" aria-hidden="true">
                ✏️
              </span>
              {t.docs.manage.edit}
            </button>
            <button type="button" className="row-action danger" onClick={() => setMode('delete')}>
              <span className="row-action-ic" aria-hidden="true">
                🗑️
              </span>
              {t.docs.manage.delete}
            </button>
          </div>
        )}

        {mode === 'edit' && (
          <div className="booking-sheet doc-upload">
            <label className="bs-field">
              {t.docs.manage.nameField}
              <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <div className="bs-typesel">
              {DOC_TYPES.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  className={'bs-typecard' + (ty === type ? ' on' : '')}
                  onClick={() => setType(ty)}
                  disabled={busy}
                >
                  <span className="bs-typecard-ic" aria-hidden="true">
                    {DOCUMENT_TYPE_ICON[ty]}
                  </span>
                  <span className="bs-typecard-lbl">{t.docs.type[ty]}</span>
                </button>
              ))}
            </div>
            <div className="bs-actions">
              <button type="button" className="bs-save" onClick={save} disabled={busy}>
                {busy ? <Spinner /> : t.docs.manage.save}
              </button>
              <button type="button" className="bs-cancel" onClick={() => setMode('menu')}>
                {t.docs.manage.cancel}
              </button>
            </div>
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
