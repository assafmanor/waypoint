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
          <span>{task.title}</span>
        </>
      }
      meta={
        <>
          {due && (
            <span className={due.late ? 'tsk-due late' : 'tsk-due'}>
              <Icon name="clock" /> {due.late ? t.tasks.due.late : t.tasks.due.by}{' '}
              {/* The numeric run is its own LTR island — `ltrIsolate`, never `dir="ltr"` on
                  a non-input (ADR-0118). */}
              {due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day}
            </span>
          )}
          <span className="tsk-sep">·</span>
          {/* `.tsk-assignee`, NOT `.tsk-who` — that name is the editor's density wrapper, and
              sharing it shipped a 38px circle into an 11.5px line once already. */}
          <span className="tsk-assignee">
            {assignee ? (
              <Avatar person={assignee} size="inherit" className="tsk-who-mini" />
            ) : (
              <span className="tsk-who-mini none" aria-hidden="true">
                <Icon name="members" />
              </span>
            )}
            {assignee ? assignee.displayName : t.tasks.sheet.nobody}
          </span>
        </>
      }
    />
  );
}
