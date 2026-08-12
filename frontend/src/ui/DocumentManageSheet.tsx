// Per-document manage sheet (ADR-0052 §2/§3, trimmed by the 2026-07-18 amendment):
// the "⋯" a document row carries offers exactly Edit · Delete. Edit is one sheet
// that renames and changes the type together; delete is guarded (an encrypted
// document is irreversible). Each action calls the backend PATCH/DELETE; the live
// list updates from the WS self-echo (ADR-0058), so no callback is needed.
import { useId, useState } from 'react';
import { type DocumentSummary, type DocumentType } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { DocumentTypeGrid } from './DocumentTypeGrid';
import { RowManageSheet } from './domain';
import { HostNotes, useHostNoteCount } from './HostNotes';
import { Icon } from './Icon';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { deleteDocument, updateDocument } from '../lib/api';
import { useToast } from './Toast';
import { CONTROL_ICON } from '../constants';
import { t } from '../i18n/he';

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
  const noteCount = useHostNoteCount('document', doc.id);
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
      toast(CONTROL_ICON.warn, t.docs.manage.failed);
    }
  };

  const save = () =>
    run(async () => {
      await updateDocument(tripId, doc.id, { title: title.trim() || doc.title, type });
      toast(CONTROL_ICON.done, t.docs.manage.saved);
      onClose();
    });

  const remove = () =>
    run(async () => {
      await deleteDocument(tripId, doc.id);
      toast(CONTROL_ICON.done, t.docs.manage.deleted);
      onClose();
    });

  if (mode === 'menu') {
    return (
      <RowManageSheet
        title={doc.title}
        // Naming the type matters most here: deleting an encrypted document is
        // irreversible, and the sheet used to say nothing at all about what it
        // was about to destroy (ADR-0138 §3).
        subject={t.docs.type[doc.type]}
        onClose={onClose}
        actions={[
          { label: t.docs.manage.edit, icon: CONTROL_ICON.edit, onSelect: () => setMode('edit') },
          {
            label: t.docs.manage.delete,
            icon: CONTROL_ICON.trash,
            danger: true,
            onSelect: () => setMode('delete'),
          },
        ]}
      >
        {/* **This sheet is the document's note surface** (ADR-0153 §8). A document's other
            surface is the viewer, whose body is a pinch-zoom image in a card that clips —
            so the notes would compete with the bytes you opened it to read, and the room
            for the section is here, where the document is already described in words. */}
        <HostNotes host={{ kind: 'document', id: doc.id, name: doc.title }} />
      </RowManageSheet>
    );
  }

  // The delete guard rides the ONE confirm dialog (ADR-0079), which is where the cascade's
  // sentence lives too — this was the last hand-rolled `.sheet-title`/`.sheet-body`/`.bs-actions`
  // prompt of the family that ADR folded, and adding the note line to it would have been a
  // second copy of the line rather than a second consumer of the slot. What the fold costs
  // is the in-button spinner; the guard against a double press moved into the handler, and
  // every other delete confirm in the app already closes without one.
  if (mode === 'delete') {
    return (
      <ConfirmDialog
        tone="danger"
        icon={<Icon name="trash" />}
        title={t.docs.manage.deleteTitle}
        body={t.docs.manage.deleteBody}
        consequence={
          noteCount > 0 ? (
            <>
              <Icon name="clipboard" /> {t.notes.hostDelete(noteCount)}
            </>
          ) : undefined
        }
        confirmLabel={t.docs.manage.deleteConfirm}
        cancelLabel={t.docs.manage.cancel}
        onConfirm={() => {
          if (!busy) void remove();
        }}
        onCancel={() => setMode('menu')}
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
              <DocumentTypeGrid value={type} onChange={setType} disabled={busy} />
            </Field>
            <FormActions
              primary={{ label: t.docs.manage.save, onClick: save, busy }}
              secondary={{ label: t.docs.manage.cancel, onClick: () => setMode('menu') }}
            />
          </div>
        )}
      </div>
    </Sheet>
  );
}
