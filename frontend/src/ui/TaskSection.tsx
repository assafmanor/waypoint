// **Where a host's tasks live** (tasks brief §F, ADR-0191 §5): a section of the surface the
// host already has — never a new screen and never a sixth surface, which is ADR-0152 §6's
// rule for notes applied unchanged to the entity beside it.
//
// **The row is `.note-item`, the same one the notes section beside it uses** (§5 reversed,
// 2026-08-16, owner: _"notes and tasks look totally different and have a different
// allignment"_). The original §5 gave this a `ListRow` and wrote the cost down; measured in
// the running app that cost was the task's text starting 40px past the note's, a different
// title weight, and a different meta grammar. Only the LEAD differs now — a note's is a rule,
// a task's is a tick — which is what makes the two texts start at the same x.
//
// **Settled tasks stay in the list**, struck, and so does a task whose HOST is settled
// (ADR-0191 §6): both are the same statement, so they get the same style rather than a second
// vocabulary. This surface is where you see what was done about this booking; the tasks SCREEN
// is where the settled collapse lives.
import type { Task, User } from '@waypoint/shared';
import { taskDue, tickedStatus, type TaskClock } from '../lib/tasks';
import { isSettled } from '../lib/tasks';
import { ltrIsolate } from '../lib/bidi';
import { Avatar } from './primitives/Avatar';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';
import './tasks.css';

export function TaskSection({
  tasks,
  users,
  clock,
  hostSettled,
  quiet,
  onAdd,
  onTick,
  onOpen,
}: {
  /** This host's tasks, already filtered and ordered (`tasksForHost`). */
  tasks: Task[];
  users: User[];
  clock: TaskClock;
  /** **Whether the HOST itself is done or skipped** (ADR-0191 §6). Its tasks then read as
   *  settled here and stop counting everywhere else — the mark, the Home bands and the Index
   *  tile — because a closed host has no open obligations. Nothing is written: this is a
   *  reading of the host, so un-settling the host brings its tasks back. */
  hostSettled?: boolean;
  /** **On a host FORM** (ADR-0191 §7): the same section, stated quietly. The header drops to
   *  the form's own field-label weight and the `＋` loses its `--cta` ink, because a form is
   *  not where you normally attach a task — it is there for the one that occurs to you while
   *  you are typing the event. */
  quiet?: boolean;
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
    // notes; four shipped specs caught it, and the Map card's positional grid did not, which
    // is why its two sections painted over each other until 2026-08-16.
    <div className={'note-sec tsk-sec' + (quiet ? ' tsk-sec-quiet' : '')}>
      <div className="note-sec-h">
        {/* The glyph the mark uses, for the same reason the notes header carries the
            clipboard: a section header names its noun. Its absence here was one of the four
            differences the alignment report was actually made of. */}
        <span className="t">
          <Icon name="checkbox" /> {t.tasks.section.title}
        </span>
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
            const settled = isSettled(task);
            return (
              <div
                key={task.id}
                className={
                  'note-item tsk-row' +
                  (settled ? ' tsk-settled' : '') +
                  (hostSettled && !settled ? ' tsk-hostdone' : '')
                }
              >
                <span className="note-item-lead">
                  <button
                    type="button"
                    className="tsk-tick-sec"
                    aria-pressed={settled}
                    aria-label={t.tasks.tick(task.title)}
                    onClick={() => onTick(task)}
                  >
                    <Icon name="check" />
                  </button>
                </span>
                <span className="note-item-main">
                  <button type="button" className="note-item-b" onClick={() => onOpen(task)}>
                    {task.important && (
                      <span className="tsk-star" aria-hidden="true">
                        <Icon name="star" />
                      </span>
                    )}
                    {task.title}
                  </button>
                  {/* **THE SECTION SAYS ONLY WHAT THERE IS TO SAY** (owner, 2026-08-16:
                      _"tasks should be more minimal"_, from the Map place card). The SCREEN
                      always reports an owner-state, including `לא משויך`, because that is a
                      list you scan for what to do next and "nobody yet" is an answer there
                      (ADR-0190 §6). A host's section is not that list: it is two or three
                      rows beside a note section, and an undated unassigned task rendering a
                      whole line that reads `לא משויך` is a line that says nothing.

                      So the meta is absent entirely when there is neither a deadline nor an
                      assignee — which is also what makes the row the same height as the note
                      beside it in the common case. */}
                  {(due || assignee) && (
                    <span className="note-item-m">
                      {due && (
                        <span className={due.late ? 'tsk-due late' : 'tsk-due'}>
                          <Icon name="clock" /> {due.late ? t.tasks.due.late : t.tasks.due.by}{' '}
                          {/* The numeric run is its own LTR island (ADR-0118). */}
                          {due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day}
                        </span>
                      )}
                      {/* Emitted only BETWEEN two things: unconditional, an undated task's
                          meta line opened with an orphan `·`. */}
                      {due && assignee && <span className="tsk-sep"> · </span>}
                      {/* `.tsk-assignee`, never `.tsk-who` — that is the editor's density
                          wrapper and sharing it shipped a 38px circle into an 11.5px line. */}
                      {assignee && (
                        <span className="tsk-assignee">
                          <Avatar person={assignee} size="inherit" className="tsk-who-mini" />
                          {assignee.displayName}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </div>
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
