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
import { useId, useState } from 'react';
import type { CreateTaskInput, Task, User } from '@waypoint/shared';
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
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { Avatar } from './primitives/Avatar';
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
  title: string;
  body: string | null;
  dueAt: string | null;
  dueHasTime: boolean;
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
    ...(draft.assigneeUserId !== null && { assigneeUserId: draft.assigneeUserId }),
    important: draft.important,
  };
}

/** The one field that can be refused. */
type TaskField = 'title';

/** `ChoiceGrid` is single-select over strings, so "nobody" needs a value rather than an
 *  absence. It never collides with a user id. */
const NOBODY = 'nobody';

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
  const { trip, users, members, zoneEvidence } = useTrip();
  const titleId = useId();
  const bodyId = useId();
  const errors = useFormErrors<TaskField>();

  const [title, setTitle] = useState(task?.title ?? '');
  const [body, setBody] = useState(task?.body ?? '');
  const [important, setImportant] = useState(task?.important ?? false);
  const [assignee, setAssignee] = useState<string>(task?.assigneeUserId ?? NOBODY);

  // The deadline is held as the two things a person types — a calendar day and an optional
  // wall-clock — and becomes an instant only on save. Read back through the SAME resolver it
  // was written with, so an edit opens on the time it was typed at (ADR-0107 §2).
  const initialZone = task?.dueAt
    ? authoringZone({}, { date: todayInTz(trip.timezone, new Date(task.dueAt)) }, zoneEvidence)
    : trip.timezone;
  const [date, setDate] = useState(task?.dueAt ? todayInTz(initialZone, new Date(task.dueAt)) : '');
  const [time, setTime] = useState(
    task?.dueAt && task.dueHasTime ? isoToTimeInput(task.dueAt, initialZone) : '',
  );

  // Live, because both halves feed it: a date decides which itinerary segment the deadline
  // falls in, and a time decides it near a crossing.
  const zone = date ? authoringZone({}, { date, time }, zoneEvidence) : trip.timezone;

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      errors.report([{ field: 'title', message: t.tasks.sheet.needsTitle }]);
      return;
    }
    onSave({
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
      assigneeUserId: assignee === NOBODY ? null : assignee,
      important,
    });
  };

  // Nobody first, and pre-selected: unassigned is a real state rather than a missing value
  // (brief §6). The default is safe only because the word DESCRIBES the state instead of
  // claiming one — a presumed `של כולנו` could be false, a presumed `לא משויך` cannot. Only
  // trip members can be named, and the server refuses anyone else (`assertMemberInTrip`).
  //
  // **A PERSON where the glyph goes** (ADR-0189 §2). The row is `ChoiceGrid layout="pills"`
  // unchanged — scroll, snap, edge mask, `useCenterSelected` centring and radiogroup ARIA all
  // arrive from the primitive — and the only new thing in it is `Choice.lead`. Phase 1 spent
  // the app's FILTER grammar on this axis, and a filter narrows what you see where this
  // decides who owes the outcome. `Avatar` is the one renderer for a person (ADR-0133 §3), so
  // nothing here draws a circle.
  const assigneeOptions: Choice<string>[] = [
    {
      value: NOBODY,
      icon: '',
      // A person-shaped ABSENCE, not a differently-shaped chip beside the people: the same
      // circle with the group glyph, dashed while unchosen. A different shape would say
      // "this is a different kind of answer" about the same question's default one.
      lead: (
        <span className="tsk-who-any">
          <Icon name="members" />
        </span>
      ),
      label: t.tasks.sheet.nobody,
    },
    ...members
      .map((m) => users.find((u: User) => u.id === m.userId))
      .filter((u): u is User => u !== undefined)
      .map((u) => ({
        value: u.id,
        icon: '',
        lead: <Avatar person={u} size="sm" />,
        label: u.displayName,
      })),
  ];

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
          {date && time && <ZoneChip value={zone} />}
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
