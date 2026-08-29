// **One manual task, as the Home bands draw it** (ADR-0188 §6). Extracted from
// `TripHomeTaskBand` when Plan Home became a second host: its converged list interleaves
// these with `AutomaticTaskRow`, and two hosts drawing one row from two copies is the pile
// root rule 8 exists to stop.
//
// It is the same `ListRow` the tasks screen renders, minus the screen's own affordances —
// no open-in-place, no sync column, no kebab. A band is a window onto the list, so the verbs
// that need room live where the list does.
import type { Task, User } from '@waypoint/shared';
import { isSettled, taskDue, type SubtaskProgress, type TaskDueClock } from '../lib/tasks';
import { ltrIsolate } from '../lib/bidi';
import { ListRow } from './domain';
import { Avatar } from './primitives/Avatar';
import { Icon } from './Icon';
import { TaskTick } from './TaskTick';
import { t } from '../i18n/he';
import './tasks.css';

export function TaskBandRow({
  task,
  users,
  clock,
  progress,
  onTick,
  onOpen,
}: {
  task: Task;
  users: User[];
  clock: TaskDueClock;
  /** **A checklist reads here as the same two elements it reads as everywhere** (ADR-0196
   *  §6): the arc in the lead and `2/5` beside the deadline. This band is where the design is
   *  actually tested — there is no room for five rows, so the two elements are all there is,
   *  and the row's height does not move. */
  progress?: SubtaskProgress;
  onTick: () => void;
  onOpen: () => void;
}) {
  const assignee = task.assigneeUserId
    ? users.find((u) => u.id === task.assigneeUserId)
    : undefined;
  const due = taskDue(task, clock);
  // **The row says whether it is done** (owner, 2026-08-17: on Plan Home's `הושלמו` drawer a
  // completed manual task drew an EMPTY circle beside the checks' green ticks). It was
  // `aria-pressed={false}` and no `tsk-settled`, which held only because the band that
  // extracted this row shows open tasks exclusively — Plan Home hands it settled ones too.
  // `AutomaticTaskRow` and `IndexTasksView` both already draw it this way.
  const settled = isSettled(task);

  return (
    <ListRow
      className={settled ? 'tsk-settled' : undefined}
      lead={<TaskTick done={settled} title={task.title} onTick={onTick} progress={progress} />}
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
        (due || (progress?.total ?? 0) > 0) && (
          <span className="tsk-meta-when">
            {due && (
              <span className={due.late ? 'tsk-due late' : 'tsk-due'}>
                <Icon name="clock" /> {due.late ? t.tasks.due.late : t.tasks.due.by}{' '}
                {/* The numeric run is its own LTR island — `ltrIsolate`, never `dir="ltr"` on
                    a non-input (ADR-0118). */}
                {due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day}
              </span>
            )}
            {progress && progress.total > 0 && (
              <span className="tsk-count">{ltrIsolate(`${progress.done}/${progress.total}`)}</span>
            )}
          </span>
        )
      }
    />
  );
}
