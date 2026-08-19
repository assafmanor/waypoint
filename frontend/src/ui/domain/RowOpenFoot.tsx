// **The foot line under a row that opened in place** (ADR-0153 §4's 2026-08-02 amendment,
// generalised in ADR-0189). A row's tap lifts its clamp and puts one line underneath: where
// the thing belongs on the leading side, its one verb on the trailing side.
//
// It is a component rather than markup each host repeats because there are now TWO hosts —
// notes and tasks — and the shape is identical at both: a lead, a spacer, an edit. What
// differs is only what the lead SAYS — a note's host, with a way in; **nothing at all for a
// task**, whose assignee is a face on the title row — so that is the prop. The alternative
// was a second `.tsk-open-foot` copied
// beside `.note-open-foot`, which is the parallel-copy pile ADRs 0078/0079/0094/0095 exist
// to undo — and the classes were renamed to neutral `.row-open-*` in the same change, since
// a task using a class called `note-open-foot` is that copy under a borrowed name.
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import './row-open.css';

export function RowOpenFoot({
  lead,
  addLabel,
  onAdd,
  editLabel,
  onEdit,
}: {
  /** The leading half: who or where. A host button, or a plain `<span className="row-open-lead
   *  plain">` when there is nowhere to go — "absent, not broken", the rule this app runs for
   *  every affordance with no destination.
   *
   *  **Optional, because a row can have nothing to add down here** (owner, 2026-08-16): a
   *  task's assignee is a face at the end of its title row, and saying the name again three
   *  lines under it is the same fact twice. The spacer keeps the verb at the trailing edge
   *  either way. */
  lead?: ReactNode;
  /** **A second verb on the leading side** (ADR-0196 §10) — `＋ תת משימה` on the tasks screen,
   *  and it is offered on every open row including one with no steps yet. If it appeared only
   *  on tasks that already had a checklist, nothing could ever get its first step.
   *
   *  Leading rather than beside the edit, because the spacer's job is to keep the row's own
   *  verb at the trailing edge: a second control there would put the primary verb in a strip
   *  rather than at the end of the line. */
  addLabel?: string;
  onAdd?: () => void;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div className="row-open-foot">
      {lead}
      {onAdd && addLabel && (
        <button type="button" className="row-open-act" onClick={onAdd}>
          <Icon name="plus" /> {addLabel}
        </button>
      )}
      <span className="row-open-sp" />
      <button type="button" className="row-open-act" onClick={onEdit}>
        <Icon name="edit" /> {editLabel}
      </button>
    </div>
  );
}
