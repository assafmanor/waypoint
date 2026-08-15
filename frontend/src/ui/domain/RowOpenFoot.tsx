// **The foot line under a row that opened in place** (ADR-0153 §4's 2026-08-02 amendment,
// generalised in ADR-0189). A row's tap lifts its clamp and puts one line underneath: where
// the thing belongs on the leading side, its one verb on the trailing side.
//
// It is a component rather than markup each host repeats because there are now TWO hosts —
// notes and tasks — and the shape is identical at both: a lead, a spacer, an edit. What
// differs is only what the lead SAYS (a note's host, with a way in; a task's assignee, with
// nowhere to go), so that is the prop. The alternative was a second `.tsk-open-foot` copied
// beside `.note-open-foot`, which is the parallel-copy pile ADRs 0078/0079/0094/0095 exist
// to undo — and the classes were renamed to neutral `.row-open-*` in the same change, since
// a task using a class called `note-open-foot` is that copy under a borrowed name.
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import './row-open.css';

export function RowOpenFoot({
  lead,
  editLabel,
  onEdit,
}: {
  /** The leading half: who or where. A host button, or a plain `<span className="row-open-lead
   *  plain">` when there is nowhere to go — "absent, not broken", the rule this app runs for
   *  every affordance with no destination. */
  lead: ReactNode;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div className="row-open-foot">
      {lead}
      <span className="row-open-sp" />
      <button type="button" className="row-open-act" onClick={onEdit}>
        <Icon name="edit" /> {editLabel}
      </button>
    </div>
  );
}
