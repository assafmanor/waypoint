// **The Trip Home band** (ADR-0188 §6, tasks brief §11/§13) — what you owe today, on the
// screen you are already looking at. An unread note costs nothing; a missed task costs the
// thing it was guarding, which is the whole reason this exists rather than the Index tile
// being enough.
//
// **A band, not a list.** `.checklist` — the bare unscoped card Plan Home already uses —
// holding the same `ListRow` the tasks screen renders, under an ordinary `.sec-title`. The
// only net-new CSS in the whole feature's Home work is the overflow row.
//
// **Manual tasks only**, and it is not a simplification: an automatic task's deadline is the
// DEPARTURE, so mid-trip every unmet check would sit here permanently overdue and in
// `--miss` for the rest of the trip. `tasksDueNow` is where that lives.
//
// **Absent entirely when nothing is due** (ADR-0045's no-empty-shell rule) — the host
// renders nothing at all rather than an empty card with a reassuring sentence in it.
import type { Task, User } from '@waypoint/shared';
import { TRIP_HOME_TASK_BAND_CAP } from '../constants';
import { taskBand, taskDue, tickedStatus, TASK_BAND, type TaskClock } from '../lib/tasks';
import { ltrIsolate } from '../lib/bidi';
import { ListRow } from './domain';
import { Avatar } from './primitives/Avatar';
import { NavArrow } from './NavArrow';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './tasks.css';

export function TripHomeTaskBand({
  due,
  users,
  clock,
  onTick,
  onOpen,
  onSeeAll,
}: {
  /** Already filtered and ordered by `tasksDueNow` — the host owns the derivation so this
   *  stays presentational, like every other `ui/domain`-shaped component. */
  due: Task[];
  users: User[];
  clock: TaskClock;
  onTick: (task: Task) => void;
  onOpen: (task: Task) => void;
  onSeeAll: () => void;
}) {
  if (due.length === 0) return null;

  const overdue = due.filter((task) => taskBand(task, clock) === TASK_BAND.OVERDUE).length;
  const shown = due.slice(0, TRIP_HOME_TASK_BAND_CAP);
  const rest = due.length - shown.length;

  return (
    <>
      <div className="sec-title">
        {t.tasks.band.title}
        {/* Only when something is actually late. A count of what is merely due today
            restates the rows directly underneath it. */}
        {overdue > 0 && (
          <span className="sec-title-end">
            <span className="hint">{t.tasks.band.overdue(overdue)}</span>
          </span>
        )}
      </div>
      <div className="checklist">
        {shown.map((task) => {
          const assignee = task.assigneeUserId
            ? users.find((u) => u.id === task.assigneeUserId)
            : undefined;
          const dueLabel = taskDue(task, clock);
          return (
            <ListRow
              key={task.id}
              lead={
                <button
                  type="button"
                  className="tsk-tick"
                  aria-pressed={false}
                  aria-label={t.tasks.tick(task.title)}
                  onClick={() => onTick(task)}
                >
                  <Icon name="check" />
                </button>
              }
              onOpen={() => onOpen(task)}
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
                  {dueLabel && (
                    <span className={dueLabel.late ? 'tsk-due late' : 'tsk-due'}>
                      <Icon name="clock" /> {dueLabel.late ? t.tasks.due.late : t.tasks.due.by}{' '}
                      {/* The numeric run is its own LTR island — `ltrIsolate`, never
                          `dir="ltr"` on a non-input (ADR-0118). */}
                      {dueLabel.time
                        ? ltrIsolate(`${dueLabel.day} ${dueLabel.time}`)
                        : dueLabel.day}
                    </span>
                  )}
                  <span className="tsk-sep">·</span>
                  {/* `.tsk-assignee`, NOT `.tsk-who` — that name is the editor's density
                      wrapper, and sharing it is what shipped a 38px circle into an 11.5px
                      line once already. */}
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
        })}
        {/* One more row in the same card, not a second control beside it. */}
        {rest > 0 && (
          <button type="button" className="tsk-more" onClick={onSeeAll}>
            {t.tasks.band.more(rest)}
            <NavArrow variant="forward" />
          </button>
        )}
      </div>
    </>
  );
}
