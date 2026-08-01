// The `⋯` a note row carries (ADR-0138 — the row menu is one surface). Edit, the way back
// to the host when there is one, and a guarded delete.
//
// Deleting is Tier 2 by ADR-0025's blast-radius framework but **ungated** (ADR-0153 §9): an
// inline confirm, not a Plan-mode escape. Deleting a note destroys a sentence, not a plan,
// and ADR-0011's hard-commitment guard does not reach it. The confirm says what is NOT
// harmed — the host outlives its notes — because a confirm that stays silent about that
// invites the reader to assume the worst.
import { useState } from 'react';
import type { Note } from '@waypoint/shared';
import { noteTitleText, type NoteHostRef } from '../lib/notes';
import { RowManageSheet } from './domain';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { CONTROL_ICON, NOTE_HOST_ICON } from '../constants';
import { t } from '../i18n/he';

export function NoteManageSheet({
  note,
  host,
  onEdit,
  onDelete,
  onOpenHost,
  onClose,
}: {
  note: Note;
  host?: NoteHostRef;
  onEdit: () => void;
  onDelete: () => void;
  /** The other side of the host chip's link. Absent for a general note, and absent for a
   *  host this build cannot yet navigate to — the action simply does not render. */
  onOpenHost?: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <ConfirmDialog
        tone="danger"
        title={t.notes.manage.deleteTitle}
        body={t.notes.manage.deleteBody(host?.name)}
        confirmLabel={t.notes.manage.confirmDelete}
        cancelLabel={t.notes.manage.cancel}
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <RowManageSheet
      title={noteTitleText(note)}
      // The sheet always names its subject (ADR-0138 §3): a note's own words are short
      // enough to be its title, so the subject line carries what it is ABOUT.
      subject={host ? host.name : t.notes.one}
      onClose={onClose}
      actions={[
        { label: t.notes.manage.edit, icon: CONTROL_ICON.edit, onSelect: onEdit },
        ...(host && onOpenHost
          ? [
              {
                label: t.notes.manage.openHost,
                icon: NOTE_HOST_ICON[host.kind],
                onSelect: onOpenHost,
              },
            ]
          : []),
        {
          label: t.notes.manage.delete,
          icon: CONTROL_ICON.trash,
          danger: true,
          onSelect: () => setConfirming(true),
        },
      ]}
    />
  );
}
