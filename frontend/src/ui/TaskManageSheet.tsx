// The `⋯` a task row carries (ADR-0138 — the row menu is one surface). Edit, assign, flag,
// dismiss, and a guarded delete.
//
// **Dismiss is here rather than on the row**, and that is what makes the completion control
// one verb instead of `SettleControl`'s symmetric pair (ADR-0188 §1): a task is discharged,
// not adjudicated. `done` is the point and `dismissed` is a rare escape, so it files with
// the other low-frequency verbs.
//
// Deleting is Tier 2 by ADR-0025's blast-radius framework but **ungated** (brief §9): an
// inline confirm, not a Plan-mode escape. It destroys a sentence, not a plan.
import { useState } from 'react';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { RowManageSheet } from './domain';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { CONTROL_ICON } from '../constants';
import { t } from '../i18n/he';

export function TaskManageSheet({
  task,
  assigneeName,
  derivedAction,
  onEdit,
  onToggleImportant,
  onDismiss,
  onReopen,
  onDelete,
  onClose,
}: {
  task: Task;
  /** The delegate's display name, or undefined for the group's task. */
  assigneeName?: string;
  /** An automatic task's own verb — the SAME one the row's tap fires (ADR-0188 §5). A tap
   *  that does something non-obvious needs a named twin, and that is what a menu is for, so
   *  this is the sheet's FIRST action rather than a footnote under the others. */
  derivedAction?: { label: string; onSelect: () => void };
  onEdit: () => void;
  onToggleImportant: () => void;
  onDismiss: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const settled = task.status !== TASK_STATUS.OPEN;
  // **An automatic task refuses edit and delete, and the refusal is an ABSENCE** (ADR-0188
  // §5). The question is asked here, so it is answered here — not marked on the row, which
  // could say "this is different" but never "you may not delete this". No disabled item and
  // no grey: a disabled control promises an enabling that will never come (ADR-0150 §8).
  // The subject slot states the reason once, above the verbs that remain — an absence with a
  // reason over it is a behaviour, an absence with none is a bug.
  const derived = task.derivedKey !== undefined;

  if (confirming) {
    return (
      <ConfirmDialog
        tone="danger"
        title={t.tasks.manage.deleteTitle}
        body={t.tasks.manage.deleteBody}
        confirmLabel={t.tasks.manage.confirmDelete}
        cancelLabel={t.tasks.manage.cancel}
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <RowManageSheet
      title={task.title}
      // The sheet always names its subject (ADR-0138 §3). A task's own words are its title,
      // so the subject line carries who owes it — the fact the menu's verbs act on.
      subject={derived ? t.tasks.subject.derived : (assigneeName ?? t.tasks.subject.group)}
      onClose={onClose}
      actions={[
        ...(derived
          ? derivedAction
            ? [
                {
                  label: derivedAction.label,
                  icon: CONTROL_ICON.edit,
                  onSelect: derivedAction.onSelect,
                },
              ]
            : []
          : [{ label: t.tasks.manage.edit, icon: CONTROL_ICON.edit, onSelect: onEdit }]),
        {
          label: task.important ? t.tasks.manage.unflag : t.tasks.manage.flag,
          icon: CONTROL_ICON.star,
          onSelect: onToggleImportant,
        },
        // A settled task offers the way back rather than the way out — dismissing something
        // already done is not a state anyone is trying to reach.
        settled
          ? { label: t.tasks.manage.reopen, icon: CONTROL_ICON.restore, onSelect: onReopen }
          : { label: t.tasks.manage.dismiss, icon: CONTROL_ICON.skip, onSelect: onDismiss },
        // An automatic task has no destructive verb, so it has no danger group either —
        // deleting the row would only make the derivation write a fresh one.
        ...(derived
          ? []
          : [
              {
                label: t.tasks.manage.delete,
                icon: CONTROL_ICON.trash,
                danger: true,
                onSelect: () => setConfirming(true),
              },
            ]),
      ]}
    />
  );
}
