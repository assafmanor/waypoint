// **A task's checklist, and the one place it is authored** (ADR-0196 §10/§11/§12).
//
// Two hosts render this: the tasks screen's open region (the fast path) and `TaskSheet`'s
// checklist field (the complete one, and the only one reachable from every surface). One
// component rather than two, for the reason `TaskBandRow` exists — two hosts drawing one row
// from two copies is the pile root rule 8 exists to stop.
//
// **THERE IS NO MODE TO DECIDE.** A task becomes a parent when it gets its first step and
// stops being one when the last is deleted; both are `subtasks.get(id)?.length`, so nothing is
// stored and a "checklist" with no steps cannot exist. That is why the way in is offered on a
// task with none — otherwise nothing could ever get its first.
//
// **The composer is `useNoteComposer`'s shape at a second host, and the reuse has an argument
// rather than a resemblance.** ADR-0191 §7 refused a title-only composer for a TASK because a
// task's deadline is what puts it on a Home band and makes it overdue, so a title-only box
// "systematically produces the weak kind" — while notes have no equivalent weak kind, because
// a note IS its body. A sub-task has no deadline BY REFUSAL (§8), so a step genuinely is its
// title: the property that made the composer right for a note holds here and the property that
// made it wrong for a task does not.
//
// **Enter commits**, which is deliberately the opposite of ADR-0152 §6b's rule that Enter
// writes a newline in a note — and it is the same reasoning both times. A note is prose, so
// the key that ends a line inside one cannot end the note; a step is one line and has no
// inside. The box stays open and focused afterwards, because a checklist is written in a
// burst: five steps are five keystrokes-and-Enter, not five round trips through a sheet.
//
// **The composer row is also a step's whole editor.** A step has two fields, so it gets no
// sheet of its own — opening `TaskSheet` on one would show a deadline, an `important` flag and
// a host that are all refused, which is ADR-0188 §5's "a disabled control promises an enabling
// that will never come". Tapping a step's words returns it to the box in its own place
// (`NoteComposer`'s `reopen(index)`, for its own stated reason: a typo costs an edit rather
// than a delete and a retype), with the assignee chip and the ✕ beside it. Three controls in
// one row is what keeps the READ row unchanged and `.note-item` a two-column grid — so the
// notes section sharing that grid pays nothing.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { TASK_SUBTASK_CAP, type Task, type User } from '@waypoint/shared';
import { isSettled } from '../lib/tasks';
import { prefersReducedMotion } from '../lib/motion';
import { Avatar } from './primitives/Avatar';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { Sheet } from './Sheet';
import { TaskTick } from './TaskTick';
import { Icon } from './Icon';
import { assigneeFromChoice, choiceFromAssignee, useAssigneeOptions } from './assignee-options';
import { t } from '../i18n/he';
import './notes.css';
import './tasks.css';

/** What a step's row needs written. `assigneeUserId` is the only optional field a step
 *  carries (ADR-0196 §8) — everything else is the parent's. */
export interface SubtaskDraft {
  title: string;
  assigneeUserId?: string;
}

export function SubtaskList({
  steps,
  users,
  open,
  variant = 'row',
  onAdd,
  onRename,
  onTick,
  onRemove,
}: {
  /** This parent's steps, in creation order. A checklist is authored, not ranked. */
  steps: Task[];
  users: User[];
  /** Whether the composer is showing. The host owns it, because the control that reveals it
   *  lives in the host's own foot (the open row) or field (the editor) — one way in per
   *  surface, never a `＋` in the header and another six pixels below it. */
  open: boolean;
  /** `form` drops the card inset: inside the editor the field is already inset, so the steps
   *  align to the field rather than to a card. */
  variant?: 'row' | 'form';
  onAdd: (draft: SubtaskDraft) => void;
  onRename: (task: Task, draft: SubtaskDraft) => void;
  /** Absent while a step cannot be ticked — a staged step on a CREATE does not exist yet,
   *  and completing something unsaved is a state with nowhere to live (`HostTasks`' rule). */
  onTick?: (task: Task) => void;
  onRemove: (task: Task) => void;
}) {
  /** `null` = the composer is adding; a task id = that step is being edited, in its own place
   *  in the list. One at a time, exactly as the notes screen holds its open row. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [who, setWho] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [full, setFull] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);

  const editing = steps.find((s) => s.id === editingId);
  // A step that was being edited and has since been removed by a peer leaves the composer
  // holding words with nowhere to go — derived rather than repaired by an effect (ADR-0101).
  const mode = editingId && !editing ? 'add' : editingId ? 'edit' : 'add';

  // Focus when the box is REVEALED, never when it is merely present — the distinction
  // `NoteComposer` records, and the reason `autoFocus` is not used.
  //
  // **A mount counts as a reveal only when there are no steps yet**, and the two halves of
  // that have each been a bug.
  //
  // Starting at `open` was the first: a task with no steps renders no list at all until
  // `＋ תת משימה` is pressed, so that mount IS the reveal, and treating it as "merely present"
  // left the caret nowhere on the way in to a FIRST step. The e2e spec caught it, because
  // jsdom has no focus to lose.
  //
  // Starting at `false` unconditionally would be the second, now that the editor keeps the
  // composer open by itself once a task HAS steps (ADR-0196 §12): there the box is showing
  // because the field is a list, not because anyone asked for it, so focusing it would open
  // the keyboard on every edit of a task with a checklist — `IconPicker`'s `autoFocus` landing
  // somewhere new, which `frontend/CLAUDE.md` records as its own anti-pattern.
  //
  // With no steps, `open` can only mean a press. With steps, it may not. That is the rule, and
  // it needs nothing from the host.
  const wasOpen = useRef(open && steps.length > 0);
  useEffect(() => {
    if (open && !wasOpen.current) inputRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // **AFTER LAYOUT, NOT IN THE HANDLER** (ADR-0196 §13). Committing a step changes the box the
  // composer sits in, so a scroll issued from the keypress measures the old one and lands
  // short. Keyed on the step count so it runs exactly when the list grew, and before paint,
  // so the composer is never seen under the sheet's sticky action bar for a frame.
  //
  // `block: 'nearest'` is a no-op while the composer is already fully visible, which is what
  // stops every Enter from yanking a form that did not move. And the input is cleared rather
  // than re-focused, so focus never leaves it and the browser issues no caret scroll of its
  // own: one movement, not two.
  const count = steps.length;
  const grew = useRef(count);
  useLayoutEffect(() => {
    if (count > grew.current) {
      // `?.` on the METHOD as well as the ref — jsdom has no layout engine and so no
      // `scrollIntoView`, which is the same guard `useFormErrors` records in place.
      composeRef.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
    grew.current = count;
  }, [count]);

  const reset = () => {
    setDraft('');
    setWho(undefined);
    setEditingId(null);
  };

  const commit = () => {
    const title = draft.trim();
    if (!title) return;
    if (mode === 'edit' && editing) onRename(editing, { title, assigneeUserId: who });
    else if (steps.length >= TASK_SUBTASK_CAP) return setFull(true);
    else onAdd({ title, assigneeUserId: who });
    reset();
    inputRef.current?.focus();
  };

  /** Tapping a step's words returns it to the composer, in its own place. */
  const edit = (task: Task) => {
    setEditingId(task.id);
    setDraft(task.title);
    setWho(task.assigneeUserId);
    setFull(false);
    // The box is already mounted, so the reveal effect above will not fire for this.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /** **The two controls beside the box must not make the box commit** (owner, 2026-08-19:
   *  _"removing a sub task doesn't always work, if there's text … assigning a sub task ui
   *  doesn't work most of the time … instead of opening the options it just opens another sub
   *  task"_). Both reports are one bug, and the second sentence names it exactly.
   *
   *  The box commits on blur, and a tap on `✕` or on the assignee chip blurs it FIRST. So the
   *  pending words were committed before the press landed: on the chip that wrote a whole new
   *  step (hence "it just opens another sub task"), and on `✕` the commit ran `reset()`, which
   *  returns the row to a read row — unmounting the `✕` mid-gesture, so the click reached
   *  nothing and the step stayed. With an empty box neither happens, which is the "doesn't
   *  ALWAYS work".
   *
   *  Three guards, because one mechanism does not cover the three ways focus leaves:
   *
   *  - `keepsFocus` on both controls. Preventing the pointer's default stops the focus moving
   *    at all, so there is no blur to guard — and it is the only one of the three that works
   *    on iOS, where a tapped `<button>` never takes focus and `relatedTarget` is therefore
   *    `null`. This app is phone-primary (ADR-0017), so that is the case that matters.
   *  - `relatedTarget` inside the composer, which covers a keyboard Tab from the box to `✕`:
   *    no pointer event fires there, and committing would unmount the control being tabbed to.
   *  - `picking`, because the picker is a `Modal` that takes focus when it opens. Without it
   *    the box blurs into the overlay a frame after the chip's press and commits anyway. */
  const keepsFocus = (e: ReactPointerEvent) => e.preventDefault();

  const whoPerson = who ? users.find((u) => u.id === who) : undefined;
  // Computed here rather than as a ternary inside `className`, so the class-name sweep
  // (`tasks-section-paint.contract.test.ts`) reads two class runs and not the word it is
  // comparing against. A `className` that also holds a comparison is a `className` a parser
  // has to guess at.
  const kidsClass = variant === 'form' ? 'tsk-kids tsk-kids-form' : 'tsk-kids';

  const composer = (
    <div className="note-item tsk-row tsk-kid-compose" ref={composeRef}>
      {/* **The lead says which row this is.** `＋` on the ADD row, because that is what it
          does; a step being EDITED keeps its own tick — it is still a step, it can still be
          ticked while you fix the typo, and a `＋` there would claim the row is new. */}
      <span className="note-item-lead" aria-hidden={mode === 'add' ? 'true' : undefined}>
        {mode === 'edit' && editing ? (
          <TaskTick
            done={isSettled(editing)}
            title={editing.title}
            density="section"
            onTick={() => onTick?.(editing)}
          />
        ) : (
          <Icon name="plus" />
        )}
      </span>
      <span className="note-item-main">
        <div className="field">
          <div className="tsk-kid-row">
            <input
              ref={inputRef}
              className="tsk-kid-in"
              value={draft}
              placeholder={steps.length ? t.tasks.subtasks.another : t.tasks.subtasks.first}
              aria-label={t.tasks.subtasks.add}
              onChange={(e) => {
                setDraft(e.target.value);
                setFull(false);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // The editor is a form: without this, Enter submits the sheet instead of
                // committing the step.
                e.preventDefault();
                commit();
              }}
              // Leaving the box with words in it commits them rather than dropping them —
              // `useNoteComposer().pending()`'s promise, which is what makes `＋` optional
              // there and Enter optional here. **Unless the focus is going to this row's own
              // controls**, which is `keepsFocus` above.
              onBlur={(e) => {
                if (picking) return;
                if (composeRef.current?.contains(e.relatedTarget)) return;
                commit();
              }}
            />
            <button
              type="button"
              className="tsk-kid-who"
              aria-label={t.tasks.subtasks.assign}
              onPointerDown={keepsFocus}
              onClick={() => setPicking(true)}
            >
              {/* Resolved rather than assumed: an assignee whose account has left the trip
                  has no person to draw, and the absence renders as the absence. */}
              {whoPerson ? (
                <Avatar person={whoPerson} size="inherit" />
              ) : (
                <span className="tsk-who-any">
                  <Icon name="members" />
                </span>
              )}
            </button>
            {mode === 'edit' && editing && (
              <button
                type="button"
                className="tsk-kid-x"
                aria-label={t.tasks.subtasks.remove}
                onPointerDown={keepsFocus}
                onClick={() => {
                  onRemove(editing);
                  reset();
                }}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        </div>
      </span>
    </div>
  );

  return (
    <>
      <div className={kidsClass}>
        {steps.map((step) =>
          step.id === editingId && mode === 'edit' ? (
            <div key={step.id}>{composer}</div>
          ) : (
            <div
              className={'note-item tsk-row' + (isSettled(step) ? ' tsk-settled' : '')}
              key={step.id}
            >
              <span className="note-item-lead">
                <TaskTick
                  done={isSettled(step)}
                  title={step.title}
                  density="section"
                  onTick={() => onTick?.(step)}
                />
              </span>
              <span className="note-item-main">
                <button type="button" className="note-item-b" onClick={() => edit(step)}>
                  <span className="tsk-title-txt">{step.title}</span>
                  {/* The face alone, at the end of the title row — the screen's rule, so a
                      step reads the same way wherever it is rendered. Absent when nobody owns
                      it: the slot says that by being empty. */}
                  <StepAssignee users={users} assigneeUserId={step.assigneeUserId} />
                </button>
              </span>
            </div>
          ),
        )}
        {open && mode === 'add' && composer}
      </div>
      {/* Refused at the cap with a sentence rather than silently truncated — and the server
          refuses the twenty-first too, because a client-only cap is one the outbox replays
          past. */}
      {full && (
        <p className="note-item-m tsk-kids-full">{t.tasks.subtasks.full(TASK_SUBTASK_CAP)}</p>
      )}
      {picking && (
        <AssigneePicker
          value={choiceFromAssignee(who)}
          onPick={(value) => {
            setWho(assigneeFromChoice(value));
            setPicking(false);
            inputRef.current?.focus();
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

/** The face at the end of a step's title row — the screen's own rule, so a step reads the same
 *  way wherever it is rendered. Absent when nobody owns it: the slot says that by being empty,
 *  which is what let the word `לא משויך` go on a row (ADR-0191 §8).
 *
 *  `Avatar`'s non-interactive form is `aria-hidden`, so the name rides a visually-hidden span
 *  or the row would say nothing at all about who owes it. */
function StepAssignee({
  users,
  assigneeUserId,
}: {
  users: User[];
  assigneeUserId: string | undefined;
}) {
  const person = assigneeUserId ? users.find((u) => u.id === assigneeUserId) : undefined;
  if (!person) return null;
  return (
    <>
      <Avatar person={person} size="inherit" className="tsk-who-row" />
      <span className="visually-hidden">
        {t.tasks.sheet.assigneeLabel}: {person.displayName}
      </span>
    </>
  );
}

/** **Who owes this step**, in the sheet the app already has, over the option list the editor
 *  already builds (`useAssigneeOptions`). Not a bespoke popover: every overlay in this app is
 *  `Modal` (lint-blocked otherwise), and the one-back-action invariant is why. */
function AssigneePicker({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const options = useAssigneeOptions();
  return (
    <Sheet title={t.tasks.subtasks.assign} onClose={onClose}>
      <div className="tsk-who">
        <ChoiceGrid
          options={options}
          value={value}
          onChange={onPick}
          layout="pills"
          ariaLabel={t.tasks.subtasks.assign}
        />
      </div>
    </Sheet>
  );
}
