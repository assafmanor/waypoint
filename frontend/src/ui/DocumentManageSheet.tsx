// Per-document manage sheet (ADR-0052 §2/§3, trimmed by the 2026-07-18 amendment):
// the "⋯" a document row carries offers exactly Edit · Delete. Edit is one sheet
// that renames and changes the type together; delete is guarded (an encrypted
// document is irreversible). Each action calls the backend PATCH/DELETE; the live
// list updates from the WS self-echo (ADR-0058), so no callback is needed.
import { useId, useState } from 'react';
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { RowManageSheet } from './domain';
import { Spinner } from './Spinner';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { deleteDocument, updateDocument } from '../lib/api';
import { useToast } from './Toast';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

const TYPE_OPTIONS = Object.values(DOCUMENT_TYPE).map((ty) => ({
  value: ty,
  icon: DOCUMENT_TYPE_ICON[ty],
  label: t.docs.type[ty],
}));

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
  const nameId = useId();
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

  if (mode === 'menu') {
    return (
      <RowManageSheet
        ariaLabel={t.docs.manage.actions}
        onClose={onClose}
        actions={[
          { label: t.docs.manage.edit, icon: '✏️', onSelect: () => setMode('edit') },
          {
            label: t.docs.manage.delete,
            icon: '🗑️',
            danger: true,
            onSelect: () => setMode('delete'),
          },
        ]}
      />
    );
  }

  return (
    <Sheet ariaLabel={t.docs.manage.actions} onClose={onClose}>
      <div className="doc-manage">
        {mode === 'edit' && (
          <div className="booking-sheet">
            <Field label={t.docs.manage.nameField} htmlFor={nameId}>
              <input
                id={nameId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t.docs.upload.typeLabel}>
              <ChoiceGrid
                options={TYPE_OPTIONS}
                value={type}
                onChange={setType}
                disabled={busy}
                ariaLabel={t.docs.upload.typeLabel}
              />
            </Field>
            <FormActions
              primary={{ label: t.docs.manage.save, onClick: save, busy }}
              secondary={{ label: t.docs.manage.cancel, onClick: () => setMode('menu') }}
            />
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
