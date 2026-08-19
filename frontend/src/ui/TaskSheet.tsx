// The task editor (tasks brief §5, ADR-0188) — create and edit in one sheet, `NoteSheet`'s
// shape, because they differ only in what the fields open with. On the `Modal`-based
// `Sheet`, so back / Escape / backdrop all resolve through the one stack (ADR-0090/0103).
//
// **Its one refusal**: a task with no title, because "a task with no title is nothing"
// (brief §5). It IS a field's refusal, unlike `NoteSheet`'s form-level one — there is
// exactly one box that can cure it, so `useFormErrors` marks that box (ADR-0150).
//
// **THE DEADLINE IS `DateField` + `TimeField`, NOT a third `WhenField` variant** (owner's
// call, 2026-08-15). `WhenField` cannot express a date-only value at all — `DayProps` is
// `date + start + end` and `SpanProps` is two datetime endpoints — and it carries zones,
// windows, durations and per-leg refusal marks a task shares none of. What ADR-0177 already
// prescribes is exactly this shape: a date inside a sentence is
// `<DateField className="vt vt-date">`, and an hour beside it is a `ValueToken`, which is
// what `TimeField` already is.
//
// **The zone is DERIVED and stated, never pinned** (brief §10). The typed wall-clock becomes
// an instant through the one shared `authoringZone` — never `trip.timezone`, which is the
// mistake that renders an event at a different time than it was typed at — and the chip is
// read-only, because `Task` has no `displayTimezone` column and §10 says nothing is stored
// per task. There is a zone to state and nothing to correct.
import { useId, useMemo, useState } from 'react';
import { TASK_STATUS, type CreateTaskInput, type Task } from '@waypoint/shared';
import { ltrIsolate } from '../lib/bidi';
import { SubtaskList, type SubtaskDraft } from './SubtaskList';

/** The id prefix a staged step carries before its parent exists. Never collides with a real
 *  id, and the index after it is how the list addresses a draft it cannot address by id. */
const STAGED_STEP = 'staged-step:';
import { authoringZone } from '../lib/places';
import { useTrip } from '../state/trip-state';
import { isoToTimeInput, todayInTz, zonedIso } from '../lib/time';
import { DAY_DEADLINE_HHMM } from '../constants';
import { Sheet } from './Sheet';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { DateField } from './primitives/DateField';
import { TimeField } from './primitives/TimeField';
import { ZoneChip } from './primitives/ZoneChip';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { assigneeFromChoice, choiceFromAssignee, useAssigneeOptions } from './assignee-options';
import { ToggleChip } from './primitives/ToggleChip';
import { Icon } from './Icon';
import { useFormErrors } from './primitives/useFormErrors';
import { t } from '../i18n/he';
import './tasks.css';

/** What the sheet hands back. `dueAt` is already an instant: the form owns the zone
 *  resolution, so nothing downstream has to.
 *
 *  **A CLEARED FIELD IS `null`, NEVER ABSENT** (owner, 2026-08-16: _"removing the task
 *  description and saving doesn't actually persist it"_). `updateTaskSchema` is sparse —
 *  absent means untouched, `null` means cleared — precisely so the tick can send `{ status }`
 *  without erasing the task's words. The editor is the caller on the other side of that
 *  contract and never held up its end: it sent `body.trim() || undefined`, which the patch
 *  correctly read as "left alone". The same silence emptied a deadline and an assignee.
 *
 *  So the draft states every field it owns, and a create — which has nothing to clear —
 *  drops the nulls through `createTaskInput`. */
export interface TaskDraft {
  /** **Steps typed on a CREATE, held until the parent exists** (ADR-0196 §12). A create has no
   *  id to hang `parentTaskId` on, which is a reason to STAGE rather than a reason to have no
   *  way in — the fourth consumer of a pattern the app already runs three times
   *  (`useNoteComposer().pending()`, `DocumentAttachField`'s staged picks, `useTaskStaging`).
   *
   *  Their ordering rule carries over verbatim and is what makes it correct: the steps' writes
   *  go out AFTER the parent's, because the outbox is FIFO and a step queued first would reach
   *  a server that cannot see its parent. `writeSubtasks` below is that write.
   *
   *  Absent on an EDIT, where the parent already has an id and each step writes as it is
   *  typed — the same immediacy the tick has. */
  subtasks?: SubtaskDraft[];
  title: string;
  body: string | null;
  dueAt: string | null;
  dueHasTime: boolean;
  /** The pinned authoring zone, or `null` to un-pin back to derived. Typed `| null` for the
   *  reason the three fields above are: this is the shape the sparse PATCH needs, and a
   *  `string | undefined` here is what let an emptied field silently mean "untouched". */
  displayTimezone: string | null;
  assigneeUserId: string | null;
  important: boolean;
}

/** The draft as a CREATE. `createTaskSchema` takes no nulls and needs none — there is no
 *  stored value to clear on a task that does not exist yet — so an emptied field is simply
 *  not sent. */
export function createTaskInput(draft: TaskDraft): CreateTaskInput {
  return {
    title: draft.title,
    ...(draft.body !== null && { body: draft.body }),
    ...(draft.dueAt !== null && { dueAt: draft.dueAt }),
    dueHasTime: draft.dueHasTime,
    ...(draft.displayTimezone !== null && { displayTimezone: draft.displayTimezone }),
    ...(draft.assigneeUserId !== null && { assigneeUserId: draft.assigneeUserId }),
    important: draft.important,
  };
}

/** **The staged steps, written onto the task that was just created** (ADR-0196 §12).
 *
 *  Mirrors `writeStagedTasks`, and rides its ordering rule for the same reason: this runs
 *  AFTER the parent's own create resolves, because the outbox is FIFO and a step queued first
 *  would reach a server that cannot see its parent. Sequential rather than `Promise.all` for
 *  the same reason — the steps' own order is the order they were typed in, and a checklist is
 *  authored, not ranked.
 *
 *  A no-op on an edit, where `subtasks` is absent because each step wrote as it was typed. */
export async function writeSubtasks(
  createTask: (input: CreateTaskInput) => Promise<unknown>,
  parentTaskId: string,
  drafts: SubtaskDraft[] | undefined,
): Promise<void> {
  for (const draft of drafts ?? []) await createTask({ ...draft, parentTaskId });
}

/** The one field that can be refused. */
type TaskField = 'title';

export function TaskSheet({
  task,
  onSave,
  onClose,
}: {
  /** The task being edited, or undefined to create one. */
  task?: Task;
  onSave: (draft: TaskDraft) => void;
  onClose: () => void;
}) {
  const { trip, users, subtasks, taskVerbs, zoneEvidence } = useTrip();
  const titleId = useId();
  const bodyId = useId();
  const errors = useFormErrors<TaskField>();

  const [title, setTitle] = useState(task?.title ?? '');
  const [body, setBody] = useState(task?.body ?? '');
  const [important, setImportant] = useState(task?.important ?? false);
  const [assignee, setAssignee] = useState<string>(choiceFromAssignee(task?.assigneeUserId));
  /** **The checklist field** (ADR-0196 §12), fourth in the form — after `מי אחראי` and before
   *  `פרטים`. Not first: most tasks have no steps, and a variable-height field between the
   *  title and the two fields every task DOES use would push them below the fold on a phone.
   *  Before `פרטים` rather than after, because both answer "what does closing this involve" —
   *  one structured and one prose, and the structured one should be the one you reach for.
   *
   *  On an EDIT the steps are trip state and write immediately. On a CREATE there is no id to
   *  hang them on, so they are held here and ride the draft out. */
  const [staged, setStaged] = useState<SubtaskDraft[]>([]);
  /** Revealed by `＋ תת משימה`, exactly as `＋ פתק` reveals the notes box (ADR-0192 §2) — an
   *  always-open composer would put a box on every task editor for a field most tasks leave
   *  empty. Open by itself once there are steps, where the list IS the invitation. */
  const [composing, setComposing] = useState(false);

  // The deadline is held as the two things a person types — a calendar day and an optional
  // wall-clock — and becomes an instant only on save. Read back through the SAME resolver it
  // was written with, so an edit opens on the time it was typed at (ADR-0107 §2).
  // **A pinned zone wins over the derivation, on the way in as on the way out** — otherwise
  // an edit re-derives and re-renders the deadline at a wall-clock the author never typed,
  // which is the whole reason the pin is stored (ADR-0193's 2026-08-17 amendment).
  const [override, setOverride] = useState<string | null>(task?.displayTimezone ?? null);
  const initialZone =
    task?.displayTimezone ??
    (task?.dueAt
      ? authoringZone({}, { date: todayInTz(trip.timezone, new Date(task.dueAt)) }, zoneEvidence)
      : trip.timezone);
  const [date, setDate] = useState(task?.dueAt ? todayInTz(initialZone, new Date(task.dueAt)) : '');
  const [time, setTime] = useState(
    task?.dueAt && task.dueHasTime ? isoToTimeInput(task.dueAt, initialZone) : '',
  );

  // Live, because both halves feed it: a date decides which itinerary segment the deadline
  // falls in, and a time decides it near a crossing.
  const zone = override ?? (date ? authoringZone({}, { date, time }, zoneEvidence) : trip.timezone);

  /** What the picker offers first: the zones this trip actually touches, most relevant
   *  first — never the raw IANA set alone.
   *
   *  Built from `zoneEvidence`, which the sheet already holds, and NOT from a `places` prop
   *  the way `EventForm` does. That is not a shortcut: an event has a place of its own, so
   *  its form reads the place list to offer the zone that place implies; a task has none, so
   *  the only zones worth surfacing are the trip's own — its primary and the ones its
   *  itinerary crosses. Reaching for `places` here added a dependency this component does
   *  not need and broke two suites whose `useTrip` mock had no reason to provide one. */
  const suggestedZones = useMemo(() => {
    const zones = [zone, zoneEvidence.primaryZone ?? trip.timezone, trip.timezone];
    for (const p of zoneEvidence.places ?? []) if (p.timezone) zones.push(p.timezone);
    return [...new Set(zones.filter(Boolean))];
  }, [zone, trip.timezone, zoneEvidence]);

  /** **The steps this field shows.** On an edit they are trip state; on a create they are the
   *  staged drafts, given local ids so the list can key and address them — the same trick
   *  `HostTasks` uses for a task staged on a host create. */
  const steps: Task[] = task
    ? (subtasks.get(task.id) ?? [])
    : staged.map(
        (draft, index) =>
          ({
            ...draft,
            id: `${STAGED_STEP}${index}`,
            tripId: trip.id,
            important: false,
            dueHasTime: false,
            status: TASK_STATUS.OPEN,
            createdBy: '',
            createdAt: '',
            updatedAt: '',
            updatedBy: '',
          }) as Task,
      );
  const stepsDone = steps.filter((step) => step.status !== TASK_STATUS.OPEN).length;
  const stagedIndex = (step: Task) => Number(step.id.slice(STAGED_STEP.length));

  const addStep = (draft: SubtaskDraft) => {
    if (task) void taskVerbs.createTask({ ...draft, parentTaskId: task.id });
    else setStaged((current) => [...current, draft]);
  };
  const renameStep = (step: Task, draft: SubtaskDraft) => {
    if (task) void taskVerbs.updateTask(step.id, draft);
    else setStaged((current) => current.map((d, i) => (i === stagedIndex(step) ? draft : d)));
  };
  const removeStep = (step: Task) => {
    if (task) void taskVerbs.deleteTask(step.id);
    else setStaged((current) => current.filter((_, i) => i !== stagedIndex(step)));
  };

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      errors.report([{ field: 'title', message: t.tasks.sheet.needsTitle }]);
      return;
    }
    onSave({
      // Absent on an edit: those steps are already written. On a create this is what the host
      // writes after the parent, inside the same change group.
      subtasks: task ? undefined : staged,
      title: trimmed,
      // `null`, not `undefined`, and that is the whole of the fix above: an emptied box is a
      // decision to clear, and the sparse patch cannot tell it from an untouched field.
      body: body.trim() || null,
      // **A date-only deadline is the END of that day, not its start.** "By Thursday" is
      // discharged any time on Thursday, and storing 00:00 would make a task due today
      // overdue at one minute past midnight. `dueHasTime` is what records that the hour was
      // never typed, so nothing downstream mistakes the instant for one the user chose.
      dueAt: date ? zonedIso(date, time || DAY_DEADLINE_HHMM, zone) : null,
      dueHasTime: Boolean(date && time),
      // `null` un-pins back to derived — the same sparse-patch grammar `body` and `dueAt`
      // use two lines up, and the reason `updateTaskSchema` types this `nullish`. Sent only
      // when there IS a deadline: a zone pinned to nothing is a value nothing can read.
      displayTimezone: date ? override : null,
      assigneeUserId: assigneeFromChoice(assignee) ?? null,
      important,
    });
  };

  // Nobody first, and pre-selected: unassigned is a real state rather than a missing value
  // (brief §6). The default is safe only because the word DESCRIBES the state instead of
  // claiming one — a presumed `של כולנו` could be false, a presumed `לא משויך` cannot. Only
  // trip members can be named, and the server refuses anyone else (`assertMemberInTrip`).
  //
  // **The list itself moved to `ui/assignee-options.tsx`** when a sub-task's composer became
  // its second host (ADR-0196 §11): the same options, the same person-where-the-glyph-goes
  // rendering (ADR-0189 §2), built once. `Avatar` is still the one renderer for a person
  // (ADR-0133 §3), so nothing draws a circle here or there.
  const assigneeOptions = useAssigneeOptions();

  return (
    <Sheet title={task ? t.tasks.sheet.editTitle : t.tasks.sheet.createTitle} onClose={onClose}>
      {/* **`modal-form` is what makes this sheet reachable** (owner, 2026-08-16: the editor is
          "cut off from the top"). `Sheet` bottom-anchors its card and caps NOTHING, so a form
          taller than the viewport grows past the top edge with no scroll to get back — and a
          phone keyboard is exactly what makes the viewport short enough. Measured at 401px of
          viewport: the card rendered 545px tall starting at −144, `max-height: none`, nothing
          scrollable, and the title input at −62.

          `.modal-form` is the shipped answer to precisely this (`form-actions.css`: "the
          scroll container the sticky action bar pins to") and `EventForm` has used it since
          U-01. This is a second consumer, not a new mechanism. */}
      <div className="task-sheet modal-form">
        <Field label={t.tasks.sheet.titleLabel} htmlFor={titleId} {...errors.field('title')}>
          <input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.tasks.sheet.titlePlaceholder}
          />
        </Field>

        {/* An undated task is legitimate (brief §5), so the resting state of this row is
            empty and inviting rather than pre-filled with today. The time token only exists
            once a day does — an hour with no day is not a deadline. */}
        <Field label={t.tasks.sheet.dueLabel}>
          <div className="tsk-when">
            <DateField
              className="vt vt-date"
              format="named"
              value={date}
              onChange={setDate}
              placeholder={t.tasks.sheet.addDate}
            />
            {date && (
              <TimeField
                value={time}
                onChange={setTime}
                label={t.tasks.sheet.timeLabel}
                placeholder={t.tasks.sheet.addTime}
                onClear={() => setTime('')}
              />
            )}
            {date && (
              <button
                type="button"
                className="tsk-when-clear"
                onClick={() => {
                  setDate('');
                  setTime('');
                }}
              >
                {t.tasks.sheet.clearDue}
              </button>
            )}
          </div>
          {/* Stated, not correctable — see the header. Only once a time is typed: a
              date-only deadline has no wall-clock a zone could move. */}
          {date && time && (
            <ZoneChip
              value={zone}
              // Selectable now (owner, 2026-08-17: the same way as the event and booking
              // forms). `EventForm` withholds `onChange` once a PLACE decides the zone,
              // because correcting it there is the honest edit — a task has no place, so
              // there is nothing that could out-rank the pin and the chip is always
              // offered.
              onChange={setOverride}
              pinned={override != null}
              suggested={suggestedZones}
            />
          )}
        </Field>

        <Field label={t.tasks.sheet.assigneeLabel}>
          {/* The density wrapper is how a NEW host meets the 44px floor without moving the
              three shipped surfaces that share `.choice-pill` — `choice-grid.css` records
              that deferral in place, and `.category-pills` is the same pattern. */}
          <div className="tsk-who">
            <ChoiceGrid
              options={assigneeOptions}
              value={assignee}
              onChange={setAssignee}
              layout="pills"
              ariaLabel={t.tasks.sheet.assigneeLabel}
            />
          </div>
        </Field>

        {/* **THE CHECKLIST, FOURTH** (ADR-0196 §12). Its empty state is a control that
            reveals rather than a box standing open — this form's own idiom, where `עד מתי`
            rests as `הוספת תאריך`. */}
        <Field
          label={
            steps.length
              ? `${t.tasks.sheet.subtasksLabel} · ${ltrIsolate(`${stepsDone}/${steps.length}`)}`
              : t.tasks.sheet.subtasksLabel
          }
        >
          {steps.length > 0 || composing ? (
            <SubtaskList
              steps={steps}
              users={users}
              open={composing}
              variant="form"
              onAdd={addStep}
              onRename={renameStep}
              // A staged step cannot be ticked: it does not exist yet, and completing
              // something unsaved is a state with nowhere to live (`HostTasks`' own rule).
              onTick={task ? (step) => void taskVerbs.tickTask(step) : undefined}
              onRemove={removeStep}
            />
          ) : (
            <button type="button" className="vt" onClick={() => setComposing(true)}>
              ＋ {t.tasks.subtasks.add}
            </button>
          )}
        </Field>

        <Field label={t.tasks.sheet.bodyLabel} htmlFor={bodyId}>
          <textarea
            id={bodyId}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.tasks.sheet.bodyPlaceholder}
          />
        </Field>

        {/* One flag, not a three-tier enum, and it spends no colour — rule 4 has none left
            (brief §7). The prominence it buys is in the SORT, where `important` lifts a task
            within its urgency band and never across it.

            **`EventForm`'s `יש הזמנה` row verbatim** (ADR-0136 §1, and ADR-0189 §1): the
            `.field` wrapper, `tone="cta"`, and `size="touch"` — whose stated job in
            `toggle-chip.css` is the ADR-0017 floor "for a chip that is its surface's primary
            control rather than one of a strip". Phase 1 shipped this chip with none of the
            three and it measured 29px. The report said "ugly"; the defect under it was a
            touch target, and the repair was to use the idiom the app already had.

            NO `field-label`: the button says `חשוב`, and a label above it saying the same
            word is that word twice for 20px. */}
        <div className="field">
          <ToggleChip
            on={important}
            tone="cta"
            size="touch"
            className="tsk-flag"
            onClick={() => setImportant(!important)}
          >
            <Icon name="star" />
            {t.tasks.sheet.importantLabel}
          </ToggleChip>
        </div>

        <FormActions
          primary={{ label: t.tasks.sheet.save, onClick: save }}
          secondary={{ label: t.tasks.sheet.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}
