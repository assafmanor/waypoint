// **The Trip Home task band** (ADR-0188 §6, tasks brief §11/§13) — what you owe soon, on the
// screen you are already looking at. An unread note costs nothing; a missed task costs the
// thing it was guarding, which is why the Index tile is not enough.
//
// **Trip Home only.** Plan Home shows the same tasks, but inside its own converged
// "what is missing" list beside the readiness checks — which is what ADR-0188 §6 designed
// and what phase 2 under-built. The row itself is shared (`TaskBandRow`).
//
// **A band, not a list.** `.checklist` — the bare unscoped card Plan Home already uses —
// under an ordinary `.sec-title`. The only net-new CSS is the overflow row.
//
// **Manual tasks only**, and it is not a simplification: an automatic task's deadline is the
// DEPARTURE, so mid-trip every unmet check would sit here permanently overdue and in
// `--miss` for the rest of the trip. `tasksDueSoon` owns that.
//
// **Absent entirely when nothing is due** (ADR-0045's no-empty-shell rule) — this returns
// null rather than an empty card with a reassuring sentence in it.
import type { Task, User } from '@waypoint/shared';
import { TRIP_HOME_TASK_BAND_CAP } from '../constants';
import { taskBand, TASK_BAND, type TaskClock } from '../lib/tasks';
import { TaskBandRow } from './TaskBandRow';
import { NavArrow } from './NavArrow';
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
  /** Already filtered and ordered by `tasksDueSoon` — the host owns the derivation so this
   *  stays presentational, like every other `ui/`-shaped component. */
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
        {/* Only when something is actually late. A count of what is merely due soon restates
            the rows directly underneath it. */}
        {overdue > 0 && (
          <span className="sec-title-end">
            <span className="hint">{t.tasks.band.overdue(overdue)}</span>
          </span>
        )}
      </div>
      <div className="checklist">
        {shown.map((task) => (
          <TaskBandRow
            key={task.id}
            task={task}
            users={users}
            clock={clock}
            onTick={() => onTick(task)}
            onOpen={() => onOpen(task)}
          />
        ))}
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
