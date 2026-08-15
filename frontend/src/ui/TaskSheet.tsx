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
import type { Task, User } from '@waypoint/shared';
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
import { ToggleChip } from './primitives/ToggleChip';
import { useFormErrors } from './primitives/useFormErrors';
import { t } from '../i18n/he';
import './tasks.css';

/** What the sheet hands back — the intersection of what both write verbs take. `dueAt` is
 *  already an instant: the form owns the zone resolution, so nothing downstream has to. */
export interface TaskDraft {
  title: string;
  body?: string;
  dueAt?: string;
  dueHasTime: boolean;
  assigneeUserId?: string;
  important: boolean;
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
      body: body.trim() || undefined,
      // **A date-only deadline is the END of that day, not its start.** "By Thursday" is
      // discharged any time on Thursday, and storing 00:00 would make a task due today
      // overdue at one minute past midnight. `dueHasTime` is what records that the hour was
      // never typed, so nothing downstream mistakes the instant for one the user chose.
      dueAt: date ? zonedIso(date, time || DAY_DEADLINE_HHMM, zone) : undefined,
      dueHasTime: Boolean(date && time),
      assigneeUserId: assignee === NOBODY ? undefined : assignee,
      important,
    });
  };

  // Nobody first, and pre-selected: unassigned is a real state rather than a missing value
  // (brief §6). The default is safe only because the word DESCRIBES the state instead of
  // claiming one — a presumed `של כולנו` could be false, a presumed `לא משויך` cannot. Only
  // trip members can be named, and the server refuses anyone else (`assertMemberInTrip`).
  const assigneeOptions: Choice<string>[] = [
    { value: NOBODY, icon: '', label: t.tasks.sheet.nobody },
    ...members
      .map((m) => users.find((u: User) => u.id === m.userId))
      .filter((u): u is User => u !== undefined)
      .map((u) => ({ value: u.id, icon: '', label: u.displayName })),
  ];

  return (
    <Sheet title={task ? t.tasks.sheet.editTitle : t.tasks.sheet.createTitle} onClose={onClose}>
      <div className="task-sheet">
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
          <ChoiceGrid
            options={assigneeOptions}
            value={assignee}
            onChange={setAssignee}
            layout="pills"
            ariaLabel={t.tasks.sheet.assigneeLabel}
          />
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
            within its urgency band and never across it. */}
        <ToggleChip on={important} tone="cta" onClick={() => setImportant(!important)}>
          {t.tasks.sheet.importantLabel}
        </ToggleChip>

        <FormActions
          primary={{ label: t.tasks.sheet.save, onClick: save }}
          secondary={{ label: t.tasks.sheet.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}
