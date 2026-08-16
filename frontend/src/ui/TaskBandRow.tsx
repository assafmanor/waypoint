// **One manual task, as the Home bands draw it** (ADR-0188 §6). Extracted from
// `TripHomeTaskBand` when Plan Home became a second host: its converged list interleaves
// these with `AutomaticTaskRow`, and two hosts drawing one row from two copies is the pile
// root rule 8 exists to stop.
//
// It is the same `ListRow` the tasks screen renders, minus the screen's own affordances —
// no open-in-place, no sync column, no kebab. A band is a window onto the list, so the verbs
// that need room live where the list does.
import type { Task, User } from '@waypoint/shared';
import { taskDue, type TaskClock } from '../lib/tasks';
import { ltrIsolate } from '../lib/bidi';
import { ListRow } from './domain';
import { Avatar } from './primitives/Avatar';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './tasks.css';

export function TaskBandRow({
  task,
  users,
  clock,
  onTick,
  onOpen,
}: {
  task: Task;
  users: User[];
  clock: TaskClock;
  onTick: () => void;
  onOpen: () => void;
}) {
  const assignee = task.assigneeUserId
    ? users.find((u) => u.id === task.assigneeUserId)
    : undefined;
  const due = taskDue(task, clock);

  return (
    <ListRow
      lead={
        <button
          type="button"
          className="tsk-tick"
          aria-pressed={false}
          aria-label={t.tasks.tick(task.title)}
          onClick={onTick}
        >
          <Icon name="check" />
        </button>
      }
      onOpen={onOpen}
      openLabel={task.title}
      title={
        <>
          {task.important && (
            <span className="tsk-star" aria-hidden="true">
              <Icon name="star" />
            </span>
          )}
          <span className="tsk-title-txt">{task.title}</span>
          {/* **WHO OWES IT, ON THE TITLE ROW AND AS THE FACE ALONE** — ADR-0190 §6's
              amendment reaching the band row, which it never did (owner, 2026-08-16: the
              assignee here _"should look like it is in the task screen"_).

              This row had kept the PRE-amendment shape: an avatar plus a name in the meta
              line, behind a `·`. Two costs, and the second is what was reported — the meta
              line carried the deadline AND a name, so on Plan Home it wrapped and the
              assignee landed on a THIRD line, making one task 22px taller than the same task
              one tab over. Same task, two shapes, on two surfaces that share a component.

              Nothing here is invented: it is `IndexTasksView`'s title row verbatim, down to
              `.tsk-who-row`'s `margin-inline-start: auto` — which is why the class is scoped
              to `.wp-listrow-title` rather than to that screen, and why this needed no new
              CSS at all.

              **The name goes, and the empty slot is the statement** (§6's own reasoning): in
              a fixed slot at the end of the title row, absence is unambiguous — there is a
              place for a face and no face in it — so `לא משויך` stops being needed to
              distinguish "nobody" from "a name that did not fit". */}
          {assignee && (
            <>
              {/* `Avatar`'s non-interactive form is `aria-hidden`, so without this the row
                  would say nothing at all about who owes it. */}
              <Avatar person={assignee} size="inherit" className="tsk-who-row" />
              <span className="visually-hidden">
                {t.tasks.sheet.assigneeLabel}: {assignee.displayName}
              </span>
            </>
          )}
        </>
      }
      meta={
        due && (
          <span className={due.late ? 'tsk-due late' : 'tsk-due'}>
            <Icon name="clock" /> {due.late ? t.tasks.due.late : t.tasks.due.by}{' '}
            {/* The numeric run is its own LTR island — `ltrIsolate`, never `dir="ltr"` on
                a non-input (ADR-0118). */}
            {due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day}
          </span>
        )
      }
    />
  );
}
