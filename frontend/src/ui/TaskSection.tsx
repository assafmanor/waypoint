// **Where a host's tasks live** (tasks brief §F, ADR-0191 §5): a section of the surface the
// host already has — never a new screen and never a sixth surface, which is ADR-0152 §6's
// rule for notes applied unchanged to the entity beside them.
//
// **The rows are `ListRow`s, not `.note-item`s, and the drawing is what settled that.** A
// note has no completion control, so `.note-item` has no lead slot; dropping a 44px
// `.tsk-tick` into one renders an oversized circle floating beside the words. Using the tasks
// screen's own row instead brings the tick, the star, the deadline and the assignee already
// built. The cost — two sections on one surface are not the same row shape — is real and
// stated rather than smoothed over.
//
// **Settled tasks stay in the list**, struck, where the notes section has no equivalent
// state to show. This surface is where you see what was done about this booking, not only
// what is left; the tasks SCREEN is where the settled collapse lives.
import type { Task, User } from '@waypoint/shared';
import { taskDue, tickedStatus, type TaskClock } from '../lib/tasks';
import { isSettled } from '../lib/tasks';
import { ltrIsolate } from '../lib/bidi';
import { ListRow } from './domain';
import { Avatar } from './primitives/Avatar';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';
import './tasks.css';

export function TaskSection({
  tasks,
  users,
  clock,
  onAdd,
  onTick,
  onOpen,
}: {
  /** This host's tasks, already filtered and ordered (`tasksForHost`). */
  tasks: Task[];
  users: User[];
  clock: TaskClock;
  /** Absent when the surface has its own way in — a host FORM carries its composer instead,
   *  and two add paths on one screen is one too many (`NoteSection`'s own rule). */
  onAdd?: () => void;
  onTick: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  return (
    // `.note-sec` for the geometry — one section shape on a host surface, not two — and
    // `.tsk-sec` so a selector can still mean "the NOTES section". Sharing the root class
    // alone made `querySelector('.note-sec')` start finding this one, since tasks read above
    // notes; four shipped specs caught it.
    <div className="note-sec tsk-sec">
      <div className="note-sec-h">
        <span className="t">{t.tasks.section.title}</span>
        {onAdd && (
          <button type="button" className="add" onClick={onAdd}>
            <Icon name="plus" /> {t.tasks.section.add}
          </button>
        )}
      </div>
      <div className="note-sec-list tsk-sec-list">
        {tasks.length === 0 ? (
          <p className="note-item-m">{t.tasks.section.empty}</p>
        ) : (
          tasks.map((task) => {
            const assignee = task.assigneeUserId
              ? users.find((u) => u.id === task.assigneeUserId)
              : undefined;
            const due = taskDue(task, clock);
            return (
              <ListRow
                key={task.id}
                className={isSettled(task) ? 'tsk-settled' : undefined}
                lead={
                  <button
                    type="button"
                    className="tsk-tick"
                    aria-pressed={isSettled(task)}
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
                    {due && (
                      <span className={due.late ? 'tsk-due late' : 'tsk-due'}>
                        <Icon name="clock" /> {due.late ? t.tasks.due.late : t.tasks.due.by}{' '}
                        {/* The numeric run is its own LTR island (ADR-0118). */}
                        {due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day}
                      </span>
                    )}
                    <span className="tsk-sep">·</span>
                    {/* `.tsk-assignee`, never `.tsk-who` — that is the editor's density
                        wrapper and sharing it shipped a 38px circle into an 11.5px line. */}
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
          })
        )}
      </div>
    </div>
  );
}

/** The status a tick moves this task to, re-exported so a host surface does not import two
 *  modules to wire one control. */
export { tickedStatus };
