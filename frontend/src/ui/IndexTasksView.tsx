// The Index's dedicated tasks screen (tasks brief §13, ADR-0188) — local view state inside
// Index.tsx like the bookings, documents and notes screens, not a route (ADR-0098 §5),
// registering as the topmost overlay so one back returns to the landing.
//
// **The screen is FLAT and ordered by URGENCY, with no grouping** (§13). ADR-0153 §2 settled
// the identical question for notes and its argument transfers whole: grouping by host
// rebuilds, worse, what every host row already does. Order is
// `overdue → due today → due later → undated`, and `important` lifts WITHIN its band and
// never across it — an important task due next week must not outrank an overdue one.
//
// **Settled tasks collapse**, deliberately the opposite of ADR-0153 §3's "no past-collapse"
// for notes, and the inversion is the feature's definition: a done task IS finished, where a
// note on a past event is not. The collapse is the facet axis' third chip rather than a
// second control beside it — `ChoiceGrid` carries its own count, so `הושלמו · 3` is already
// the count-in-label toggle ADR-0061 established, and building both would be two ways to
// see one set of rows.
import { useMemo, useState } from 'react';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { useClock } from '../lib/useClock';
import { useBackLayer, type BackResult } from '../state/nav-state';
import { countVisible, revealRows } from '../lib/filter-reveal';
import { ltrIsolate } from '../lib/bidi';
import {
  countTasksByFacet,
  isSettled,
  sortTasks,
  TASK_FACET,
  taskDue,
  taskMatchesFacet,
  tickedStatus,
  type TaskClock,
  type TaskFacet,
} from '../lib/tasks';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { TaskSheet, type TaskDraft } from './TaskSheet';
import { TaskManageSheet } from './TaskManageSheet';
import { IndexBackRow } from './IndexBackRow';
import { Icon } from './Icon';
import { ListRow, RowOpenFoot } from './domain';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { RevealList } from './primitives/RevealList';
import { EmptyState } from './feedback';
import { t } from '../i18n/he';
import './tasks.css';

export function IndexTasksView({ onClose }: { onClose: () => void }) {
  const { trip, tasks, users, zoneCrossings, taskVerbs } = useTrip();
  const { me } = useAuth();
  const now = useClock();

  const [facet, setFacet] = useState<TaskFacet>(TASK_FACET.ALL);
  // null = closed; 'create' = a new task; a Task = editing that one.
  const [sheet, setSheet] = useState<Task | 'create' | null>(null);
  const [manage, setManage] = useState<Task | null>(null);
  // The id of the row opened IN PLACE, or null. One at a time, exactly as the notes screen
  // holds it (ADR-0153 §4): a second open row would make the list a set of panels.
  const [openId, setOpenId] = useState<string | null>(null);

  const meId = me?.user.id ?? '';
  const clock: TaskClock = useMemo(
    () => ({ nowMs: now.getTime(), crossings: zoneCrossings, primaryZone: trip.timezone }),
    [now, zoneCrossings, trip.timezone],
  );

  const ordered = useMemo(() => sortTasks(tasks, clock), [tasks, clock]);
  const counts = useMemo(() => countTasksByFacet(ordered, meId), [ordered, meId]);

  // A chip whose last task was settled (or unassigned out from under a still-selected
  // filter) falls back to "all" rather than filtering against an empty set — derived, not a
  // reset effect (ADR-0101).
  const activeFacet: TaskFacet =
    facet !== TASK_FACET.ALL && counts[facet] === 0 ? TASK_FACET.ALL : facet;

  // Back peels the facet first (ADR-0102): a filtered screen is not ready to leave, it is
  // ready to show everything again. `remainsActive` keeps the screen registered so the NEXT
  // back peels here again rather than leaking past it (ADR-0103).
  const backOrResetFacet = (): BackResult => {
    if (activeFacet !== TASK_FACET.ALL) {
      setFacet(TASK_FACET.ALL);
      return { remainsActive: true };
    }
    onClose();
    return { remainsActive: false };
  };
  useBackLayer(backOrResetFacet);

  // Through `revealRows`, never a bare `.filter()` — a row is hidden in place so the list
  // animates instead of jumping, which is the one-off that cost the Map two releases
  // (ADR-0120). Hence `countVisible`, not `.length`.
  const visible = revealRows(ordered, (task) => taskMatchesFacet(task, activeFacet, meId)).rows;
  const matchCount = countVisible(visible);

  const facetOptions: Choice<TaskFacet>[] = [
    { value: TASK_FACET.ALL, icon: '', label: t.tasks.filter.all, count: counts[TASK_FACET.ALL] },
    ...(counts[TASK_FACET.MINE] > 0
      ? [
          {
            value: TASK_FACET.MINE,
            icon: '',
            label: t.tasks.filter.mine,
            count: counts[TASK_FACET.MINE],
          },
        ]
      : []),
    ...(counts[TASK_FACET.SETTLED] > 0
      ? [
          {
            value: TASK_FACET.SETTLED,
            icon: '',
            label: t.tasks.filter.settled,
            count: counts[TASK_FACET.SETTLED],
          },
        ]
      : []),
  ];

  const saveTask = (draft: TaskDraft) => {
    const editing = sheet !== 'create' && sheet !== null ? sheet : null;
    setSheet(null);
    if (editing) void taskVerbs.updateTask(editing.id, draft);
    // A task written HERE is always general — there is no host picker in phase 1, exactly
    // as ADR-0153 §5 settled it for notes.
    else void taskVerbs.createTask(draft);
  };

  const assigneeName = (task: Task) =>
    task.assigneeUserId ? users.find((u) => u.id === task.assigneeUserId)?.displayName : undefined;

  const renderTask = (task: Task) => (
    <TaskLi
      task={task}
      due={taskDue(task, clock)}
      assignee={assigneeName(task)}
      onTick={() => void taskVerbs.updateTask(task.id, { status: tickedStatus(task) })}
      open={openId === task.id}
      onToggle={() => setOpenId((current) => (current === task.id ? null : task.id))}
      onEdit={() => setSheet(task)}
      onManage={() => setManage(task)}
    />
  );
  const taskKey = (task: Task) => task.id;

  return (
    <div className="idx-screen">
      <IndexBackRow
        title={t.tasks.title}
        onBack={backOrResetFacet}
        end={
          <span className="idx-head-count" dir="auto">
            {t.tasks.head.count(counts[TASK_FACET.ALL])}
          </span>
        }
      />

      {tasks.length === 0 ? (
        // "Nothing yet" teaches what belongs here and offers the action; "nothing matches"
        // below offers none, because the right control is already on screen — the chip.
        <EmptyState
          icon={<Icon name="check" />}
          title={t.tasks.empty.title}
          body={t.tasks.empty.body}
          action={{ label: t.tasks.empty.action, onClick: () => setSheet('create') }}
        />
      ) : (
        <>
          <div className="filter-row">
            <ChoiceGrid
              options={facetOptions}
              value={activeFacet}
              onChange={setFacet}
              layout="pills"
              compact
              ariaLabel={t.tasks.filter.label}
            />
          </div>

          <button type="button" className="addbtn" onClick={() => setSheet('create')}>
            <Icon name="plus" /> {t.tasks.add}
          </button>

          {matchCount > 0 ? (
            <RevealList
              className="listcard"
              rows={visible}
              getKey={taskKey}
              renderRow={renderTask}
            />
          ) : (
            <EmptyState icon={<Icon name="check" />} title={t.tasks.filter.noResults} />
          )}
        </>
      )}

      {sheet && (
        <TaskSheet
          task={sheet === 'create' ? undefined : sheet}
          onSave={saveTask}
          onClose={() => setSheet(null)}
        />
      )}

      {manage && (
        <TaskManageSheet
          task={manage}
          assigneeName={assigneeName(manage)}
          onEdit={() => {
            const task = manage;
            setManage(null);
            setSheet(task);
          }}
          onToggleImportant={() => {
            const task = manage;
            setManage(null);
            void taskVerbs.updateTask(task.id, { important: !task.important });
          }}
          onDismiss={() => {
            const task = manage;
            setManage(null);
            void taskVerbs.updateTask(task.id, { status: TASK_STATUS.DISMISSED });
          }}
          onReopen={() => {
            const task = manage;
            setManage(null);
            void taskVerbs.updateTask(task.id, { status: TASK_STATUS.OPEN });
          }}
          onDelete={() => {
            const task = manage;
            setManage(null);
            void taskVerbs.deleteTask(task.id);
          }}
          onClose={() => setManage(null)}
        />
      )}
    </div>
  );
}

/** One task row (ADR-0188 §3). Four facts: the lead is the tick, the title line is the
 *  task's own words with a star when `important`, the meta is the deadline then the
 *  assignee, and the trailing slot is the reserved sync column and the kebab.
 *
 *  **The tick is a SIBLING of the row's trigger, at the leading edge** (§1) — `ListRow`'s
 *  `lead` slot, which exists for exactly this. Not nested: Chrome destroys the DOM at a
 *  nested `<button>`. Not trailing: two 44px targets adjacent is a mis-tap the row cannot
 *  recover from, and filing the primary verb beside the leftovers menu inverts the division
 *  this repo already writes down.
 *
 *  **The row's tap OPENS IT WHERE IT IS** (ADR-0189 §3), which is ADR-0153 §4's shipped
 *  idiom rather than a surface of its own — no sheet, no scrim, and the list stays where it
 *  was. Phase 1 pointed this tap at the editor, and the consequence was that `body` had no
 *  reader anywhere in the app: the editor wrote it and nothing rendered it. Editing is still
 *  one press away, from the foot and from the `⋯`.
 *
 *  Every row opens, whether or not it has a body — an open task with no details still shows
 *  who owes it and the verb, which is the same answer the notes screen gives on a host's
 *  section. The `⋯` mark on the meta line is the separate claim that there is more to READ. */
function TaskLi({
  task,
  due,
  assignee,
  onTick,
  open,
  onToggle,
  onEdit,
  onManage,
}: {
  task: Task;
  due: ReturnType<typeof taskDue>;
  assignee?: string;
  onTick: () => void;
  /** Expanded: the body is printed under the row and the foot is under that. */
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onManage: () => void;
}) {
  const unsynced = useUnsynced(task.id);
  const settled = isSettled(task);

  const meta = (
    <>
      {due && (
        <span className={due.late ? 'tsk-due late' : 'tsk-due'}>
          <Icon name="clock" /> {due.late ? t.tasks.due.late : t.tasks.due.by}{' '}
          {/* The numeric run is its own LTR island inside RTL copy — `ltrIsolate`, never
              `dir="ltr"` on a non-input (ADR-0118). The Hebrew word beside it is exactly
              what makes the isolate necessary: `dir="auto"` would resolve the whole element
              from that strong character and flip the clock. */}
          {due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day}
        </span>
      )}
      {due && assignee ? <span className="tsk-sep">·</span> : null}
      {assignee}
      {/* "There is more", not a preview of it — one glyph at the end of the meta line, and
          it costs the row 0px. Absent while the row is open, because the words it points at
          are printed directly underneath by then. */}
      {task.body && !open ? (
        <>
          {due || assignee ? <span className="tsk-sep">·</span> : null}
          <span className="tsk-more-mark" aria-hidden="true">
            <Icon name="more" />
          </span>
        </>
      ) : null}
    </>
  );

  const hasMeta = Boolean(due || assignee || task.body);

  return (
    <>
      <ListRow
        className={
          [settled ? 'tsk-settled' : '', open ? 'is-open' : ''].filter(Boolean).join(' ') ||
          undefined
        }
        lead={
          <button
            type="button"
            className="tsk-tick"
            aria-pressed={task.status === TASK_STATUS.DONE}
            aria-label={t.tasks.tick(task.title)}
            onClick={onTick}
          >
            <Icon name="check" />
          </button>
        }
        onOpen={onToggle}
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
        meta={hasMeta ? meta : undefined}
        sync={<EntitySyncBadge id={task.id} />}
        unsynced={unsynced}
        onManage={onManage}
        manageLabel={t.tasks.manage.actions}
      />
      {/* The row's SIBLING, not a prop on it — `ListRow` is shared with bookings, documents
          and members, and none of them has anything to expand. The list card holds them
          together, exactly as the open note joins it there. */}
      {open && (
        <>
          {/* `dir="auto"` because the app did not write these words (ADR-0118). Without it the
              block inherits the page's RTL, and a body opening with a Latin or numeric run —
              an address, a confirmation code, an opening hour — lays out right-to-left and
              comes apart. Measured in the running app before it was added: the first glyph of
              `2-14-5 Kabukicho, Shinjuku` painted at x=404 in a box spanning 53–449, and at
              x=67 with it. This element holds the value and nothing else, which is exactly
              the boundary the attribute belongs on. */}
          {task.body && (
            <div className="tsk-open-body" dir="auto">
              {task.body}
            </div>
          )}
          <RowOpenFoot
            lead={<span className="row-open-lead plain">{assignee ?? t.tasks.sheet.nobody}</span>}
            editLabel={t.tasks.manage.edit}
            onEdit={onEdit}
          />
        </>
      )}
    </>
  );
}
