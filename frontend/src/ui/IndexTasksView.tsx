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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TASK_STATUS, type Task, type User } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { useClock } from '../lib/useClock';
import {
  useBackLayer,
  DAYS_TAB,
  FOCUS_PARAM,
  HOME_FOCUS,
  HOME_TAB,
  TAB_PARAM,
  type BackResult,
} from '../state/nav-state';
import { useAutomaticTasks } from '../lib/useAutomaticTasks';
import {
  AUTOMATIC_TASK_ACTION,
  draftOverlay,
  isManual,
  tickedAutomaticStatus,
  type AutomaticTask,
} from '../lib/automatic-tasks';
import { AutomaticTaskRow } from './AutomaticTaskRow';
import { Avatar } from './primitives/Avatar';
import { countVisible, revealRows } from '../lib/filter-reveal';
import { ltrIsolate } from '../lib/bidi';
import {
  countTasksByFacet,
  isSettled,
  orderTaskRows,
  subtaskProgress,
  TASK_FACET,
  taskDue,
  taskRowKey,
  taskRowMatchesFacet,
  type TaskDueClock,
  type TaskFacet,
  type TaskRow,
} from '../lib/tasks';
import { SubtaskList, type SubtaskDraft } from './SubtaskList';
// The host chip and its icon table are the NOTES screen's, reused whole (ADR-0191 §8):
// `noteHost` reads only the five FKs both entities carry, so it was widened to `HostedRow`
// rather than copied — the same extraction `isHostedBy` already took in phase 4.
import { noteHost, type NoteHostRef } from '../lib/notes';
import { NOTE_HOST_ICON } from '../constants';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { TaskSheet, createTaskInput, writeSubtasks, type TaskDraft } from './TaskSheet';
import { TaskManageSheet } from './TaskManageSheet';
import { IndexBackRow } from './IndexBackRow';
import { Icon } from './Icon';
import { TaskTick } from './TaskTick';
import { ListRow, RowOpenFoot } from './domain';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { RevealList } from './primitives/RevealList';
import { EmptyState } from './feedback';
import { t } from '../i18n/he';
import './tasks.css';

/** A stable empty array, so a task with no steps hands `TaskLi` the SAME reference every
 *  render — a fresh `[]` would make the memoized row diff on every clock tick. */
const EMPTY_STEPS: Task[] = [];

export function IndexTasksView({
  onClose,
  onOpenDocuments,
  initialTaskId,
}: {
  onClose: () => void;
  /** The passport check's verb. Its destination is this screen's own sibling rather than
   *  Home, so the Index hands the way in rather than the tasks screen navigating (ADR-0190
   *  §3). */
  onOpenDocuments: () => void;
  /** **A task named from outside the app** — `?task=` (ADR-0197 §6), which today means a
   *  notification. Opens that task's sheet on arrival, the same way `initialBookingId` does
   *  on the bookings screen. */
  initialTaskId?: string;
}) {
  const { trip, tasks, subtasks, users, zoneCrossings, taskVerbs, setActiveDate, noteHosts } =
    useTrip();
  const { me } = useAuth();
  const now = useClock();
  const navigate = useNavigate();

  const [facet, setFacet] = useState<TaskFacet>(TASK_FACET.ALL);
  // null = closed; 'create' = a new task; a Task = editing that one.
  const [sheet, setSheet] = useState<Task | 'create' | null>(null);

  // **Opened once, when the named task is actually in hand.** `tasks` arrives empty on a cold
  // load (the snapshot is still in flight), so a one-shot keyed on the id alone would spend
  // itself against an empty list and never open anything — which is precisely what a
  // notification tap on a cold start is. Keyed on both, and latched, so it opens on the render
  // the task appears and never re-opens after the sheet is closed.
  const openedArrival = useRef<string | null>(null);
  useEffect(() => {
    if (!initialTaskId || openedArrival.current === initialTaskId) return;
    const arriving = tasks.find((task) => task.id === initialTaskId);
    if (!arriving) return;
    openedArrival.current = initialTaskId;
    setSheet(arriving);
  }, [initialTaskId, tasks]);
  const [manage, setManage] = useState<Task | null>(null);
  // The id of the row opened IN PLACE, or null. One at a time, exactly as the notes screen
  // holds it (ADR-0153 §4): a second open row would make the list a set of panels.
  const [openId, setOpenId] = useState<string | null>(null);

  const meId = me?.user.id ?? '';
  const clock: TaskDueClock = useMemo(
    () => ({ nowMs: now.getTime(), crossings: zoneCrossings, primaryZone: trip.timezone, trip }),
    [now, zoneCrossings, trip],
  );

  const manualTasks = useMemo(() => tasks.filter(isManual), [tasks]);
  const { readiness, automatic, applyVerb } = useAutomaticTasks();
  const firstEmptyDate = readiness.emptyDates[0];

  // **ONE list, and ALL the checks go into it** (ADR-0190 §2, and §1 as amended by the owner
  // on 2026-08-16). Order: urgent manual tasks, then the readiness checks, then the rest in
  // urgency order. Every check is handed over, live or settled — the facet predicate is what
  // decides which are shown, exactly as it does for a settled manual task, because a
  // satisfied check now belongs behind `הושלמו` rather than nowhere.
  const rows = useMemo(
    () => orderTaskRows(manualTasks, automatic, clock),
    [manualTasks, automatic, clock],
  );

  // Counted off the SAME rows the list is built from, so a chip cannot promise a number the
  // list does not deliver.
  // **The child index reaches the facet, and only the facet** (ADR-0196's audit). `שלי` has to
  // match a parent whose STEP is mine, or the one filter whose job is "what do I owe" hides
  // work from the person filtering. Every other derivation on this screen reads the roots and
  // is correct about children without being told they exist.
  const counts = useMemo(() => countTasksByFacet(rows, meId, subtasks), [rows, meId, subtasks]);

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
  const visible = revealRows(rows, (row) =>
    taskRowMatchesFacet(row, activeFacet, meId, subtasks),
  ).rows;
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
    // The draft goes to the PATCH as it stands: its nulls are what clear a field the editor
    // was opened on and emptied.
    if (editing) void taskVerbs.updateTask(editing.id, draft);
    // A task written HERE is always general — there is no host picker in phase 1, exactly
    // as ADR-0153 §5 settled it for notes.
    // A create writes the parent first and its staged steps after — the outbox is FIFO, so a
    // step queued first would reach a server that cannot see its parent (ADR-0196 §12).
    else
      void taskVerbs
        .createTask(createTaskInput(draft))
        .then(
          (created) => created && writeSubtasks(taskVerbs.createTask, created.id, draft.subtasks),
        );
  };

  const assigneeName = (task: Task) =>
    task.assigneeUserId ? users.find((u) => u.id === task.assigneeUserId)?.displayName : undefined;
  const assigneeOf = (task: Task) =>
    task.assigneeUserId ? users.find((u) => u.id === task.assigneeUserId) : undefined;

  /** **Where each check's verb goes, and three of five do not go to Home** (ADR-0190 §3).
   *  The rule is "navigate to where the thing lives": a seeded booking form lives on Plan
   *  Home and needs the deep-link, but an empty day is the day tab, a passport is this
   *  screen's own sibling, and an invite is trip settings. */
  const runAction = (auto: AutomaticTask) => {
    switch (auto.action) {
      case AUTOMATIC_TASK_ACTION.ADD_FLIGHT:
      case AUTOMATIC_TASK_ACTION.ADD_LODGING:
        navigate(
          `/?${TAB_PARAM}=${HOME_TAB}&${FOCUS_PARAM}=${
            auto.action === AUTOMATIC_TASK_ACTION.ADD_FLIGHT
              ? HOME_FOCUS.ADD_FLIGHT
              : HOME_FOCUS.ADD_LODGING
          }`,
          { replace: true },
        );
        return;
      case AUTOMATIC_TASK_ACTION.BUILD_DAY:
        if (firstEmptyDate) setActiveDate(firstEmptyDate);
        navigate(`/?${TAB_PARAM}=${DAYS_TAB}`, { replace: true });
        return;
      case AUTOMATIC_TASK_ACTION.UPLOAD_DOCS:
        onOpenDocuments();
        return;
      case AUTOMATIC_TASK_ACTION.INVITE:
        navigate(`/trip/${trip.id}/settings`, { replace: true });
        return;
    }
  };

  /** **The tick, and it is the act that mints the overlay row** when there is not one yet
   *  (brief §4: the row is written the moment a person says something about the check). The
   *  same `applyVerb` the `⋯`'s own verbs go through, so create-or-patch is decided once. */
  const tickAutomatic = (auto: AutomaticTask) =>
    applyVerb(auto.task ?? draftOverlay(auto, trip.id), {
      status: tickedAutomaticStatus(auto),
    });

  /** A check with no row yet is handed a Task-shaped value that has never been written —
   *  opening a MENU must not write anything (brief §4: the row is minted by the verb). */
  const manageAutomatic = (auto: AutomaticTask) =>
    setManage(auto.task ?? draftOverlay(auto, trip.id));

  /** **A step is created, renamed and removed through the same three verbs a task is** — one
   *  table, so one write path (ADR-0196 §1). The parent rides the create from here rather than
   *  being spelled at the composer, which is what keeps `SubtaskList` presentational. */
  const addStep = (parent: Task, draft: SubtaskDraft) =>
    void taskVerbs.createTask({ ...draft, parentTaskId: parent.id });

  const renderRow = (row: TaskRow) =>
    row.kind === 'auto' ? (
      <AutomaticTaskRow
        auto={row.auto}
        onTick={() => tickAutomatic(row.auto)}
        onAct={() => runAction(row.auto)}
        onManage={() => manageAutomatic(row.auto)}
      />
    ) : (
      <TaskLi
        task={row.task}
        host={noteHost(row.task, noteHosts)}
        due={taskDue(row.task, clock)}
        assignee={assigneeOf(row.task)}
        steps={subtasks.get(row.task.id) ?? EMPTY_STEPS}
        users={users}
        onTick={() => void taskVerbs.tickTask(row.task)}
        onAddStep={(draft) => addStep(row.task, draft)}
        onRenameStep={(step, draft) => void taskVerbs.updateTask(step.id, draft)}
        onTickStep={(step) => void taskVerbs.tickTask(step)}
        onRemoveStep={(step) => void taskVerbs.deleteTask(step.id)}
        open={openId === row.task.id}
        onToggle={() => setOpenId((current) => (current === row.task.id ? null : row.task.id))}
        onEdit={() => setSheet(row.task)}
        onManage={() => setManage(row.task)}
      />
    );

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

      {rows.length === 0 ? (
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
              getKey={taskRowKey}
              renderRow={renderRow}
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
          // The automatic sheet's FIRST action is the verb the row's tap fires (ADR-0188
          // §5) — a tap that does something non-obvious needs a named twin.
          derivedAction={(() => {
            const auto = automatic.find((a) => a.key === manage.derivedKey);
            return auto
              ? {
                  label: auto.title,
                  onSelect: () => {
                    setManage(null);
                    runAction(auto);
                  },
                }
              : undefined;
          })()}
          onEdit={() => {
            const task = manage;
            setManage(null);
            setSheet(task);
          }}
          onToggleImportant={() => {
            const task = manage;
            setManage(null);
            applyVerb(task, { important: !task.important });
          }}
          onDismiss={() => {
            const task = manage;
            setManage(null);
            applyVerb(task, { status: TASK_STATUS.DISMISSED });
          }}
          onReopen={() => {
            const task = manage;
            setManage(null);
            applyVerb(task, { status: TASK_STATUS.OPEN });
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
 *  Every row opens, whether or not it has a body — an open task with no details still offers
 *  the verb, which is the same answer the notes screen gives on a host's section. The `⋯` mark
 *  on the meta line is the separate claim that there is more to READ. */
function TaskLi({
  task,
  host,
  due,
  assignee,
  steps,
  users,
  onTick,
  onAddStep,
  onRenameStep,
  onTickStep,
  onRemoveStep,
  open,
  onToggle,
  onEdit,
  onManage,
}: {
  task: Task;
  /** **What this task is linked to** (ADR-0191 §8) — absent when it is a general task, which
   *  is the whole signal, exactly as it is on the notes screen. */
  host?: NoteHostRef;
  due: ReturnType<typeof taskDue>;
  /** The person, not their name — the row renders `Avatar` (ADR-0190 §6). */
  assignee?: User;
  /** This task's steps, in creation order (ADR-0196). Empty is the common case and is what
   *  makes the row an ordinary one: `total: 0` is not a parent, so nothing here needs a
   *  second test for "is this a checklist". */
  steps: Task[];
  users: User[];
  onTick: () => void;
  onAddStep: (draft: SubtaskDraft) => void;
  onRenameStep: (step: Task, draft: SubtaskDraft) => void;
  onTickStep: (step: Task) => void;
  onRemoveStep: (step: Task) => void;
  /** Expanded: the body is printed under the row and the foot is under that. */
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onManage: () => void;
}) {
  const unsynced = useUnsynced(task.id);
  const settled = isSettled(task);
  const progress = subtaskProgress(steps);
  // The composer is revealed by the foot's `＋`, exactly as `＋ פתק` reveals the notes box
  // (ADR-0192 §2) — and it opens by itself on a task that already has steps, because there
  // the invitation is the list rather than a control.
  const [composing, setComposing] = useState(false);

  // **TWO LINES: the deadline owns the first, the chip the second** (ADR-0191 §8, the owner's
  // proposal). Moving the assignee to the title row removed the longest of three elements and
  // did NOT retire the split — measured at 360 with the name gone, one line still truncates
  // the chip to 24px of the 80px it needs. `tasks.css` is where the split is drawn
  // (`.wp-listrow-meta > .tsk-due { display: block }`); the `.tsk-meta-about` group is what
  // lets the chip be the one element allowed to shrink.
  const metaAbout = (
    <span className="tsk-meta-about">
      {/* **WHAT THIS TASK IS LINKED TO** (owner: "linked tasks don't show their host, and I
          think that it must have some indication of what it's linked to"). `.note-host` is
          the notes screen's own chip, reused rather than redrawn — the notes row has carried
          it since ADR-0153 §4 and this screen never picked it up.

          **A task row has no badge**, because ADR-0188 §1 gives a row with a `lead` no icon
          slot: the tick IS its leading element. So where a note says its host twice — the
          category glyph on the badge AND this chip — a task says it once, and this is the
          only place it can be said. */}
      {host && (
        <span className="note-host">
          <Icon name={NOTE_HOST_ICON[host.kind]} />
          <span className="note-host-n">{host.name}</span>
        </span>
      )}
      {/* "There is more", not a preview of it — one glyph at the end of the line, and it
          costs the row 0px. Absent while the row is open, because the words it points at are
          printed directly underneath by then. */}
      {task.body && !open ? (
        <span className="tsk-more-mark" aria-hidden="true">
          <Icon name="more" />
        </span>
      ) : null}
    </span>
  );

  /** **The count shares line one with the deadline** rather than opening a third line, so an
   *  undated parent keeps ONE line — which is what `.tsk-due`'s own `display: block` was
   *  bought for (ADR-0191 §8). Neutral: a quantity is not a status and not a deadline, so it
   *  spends nothing from the colour budget. */
  const when = (due || progress.total > 0) && (
    <span className="tsk-meta-when">
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
      {progress.total > 0 && (
        <span className="tsk-count">{ltrIsolate(`${progress.done}/${progress.total}`)}</span>
      )}
    </span>
  );

  const meta = (
    <>
      {when}
      {metaAbout}
    </>
  );

  // **Not "always" any more.** It was, because the owner-state was reported here and every
  // task has one — that moved to the title row, so a task with no deadline, no host and no
  // body now genuinely has nothing to say on a second line, and says nothing. A checklist's
  // count joins the list of things that can bring the line back.
  const hasMeta = Boolean(due || host || progress.total > 0 || (task.body && !open));

  return (
    <>
      <ListRow
        className={
          [settled ? 'tsk-settled' : '', open ? 'is-open' : ''].filter(Boolean).join(' ') ||
          undefined
        }
        lead={
          // **A parent's lead is a READ** (ADR-0196 §3): same box, same circle, same ✓, with
          // the ring filled to the fraction and no press — a task holding a checklist has no
          // completion of its own to offer, it closes when its last step does. `progress`
          // with `total: 0` is every ordinary task and renders the control unchanged.
          <TaskTick
            done={task.status === TASK_STATUS.DONE}
            title={task.title}
            onTick={onTick}
            progress={progress}
          />
        }
        onOpen={() => {
          if (open) setComposing(false);
          onToggle();
        }}
        openLabel={task.title}
        title={
          <>
            {task.important && (
              <span className="tsk-star" aria-hidden="true">
                <Icon name="star" />
              </span>
            )}
            <span className="tsk-title-txt">{task.title}</span>
            {/* **WHO OWES IT, on the TITLE row and as the face alone** (ADR-0190 §6 amended
                2026-08-16 — owner, against Microsoft To Do: _"I actually prefer the way they
                handled showing the assignee (title row, only avatar)"_).

                §6 put a name in the meta line and argued that an unassigned task must SAY so,
                because saying nothing was indistinguishable from "assigned to someone whose
                name did not fit". **That premise expired here**: in a fixed slot at the end of
                the title row, absence is unambiguous — there is a place for a face and no face
                in it. What the name was buying is bought by the slot instead.

                And it pays for itself twice: the meta line loses its longest element, so the
                deadline and the host chip fit one line again. */}
            {assignee && (
              <>
                {/* The face is `aria-hidden` (`Avatar`’s non-interactive form), so the name
                    it replaced would have left the row silent. Said here instead, where a
                    reader gets it and the line does not grow. */}
                <Avatar person={assignee} size="inherit" className="tsk-who-row" />
                <span className="visually-hidden">
                  {t.tasks.sheet.assigneeLabel}: {assignee.displayName}
                </span>
              </>
            )}
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
          {/* **THE CHECKLIST** (ADR-0196 §5/§10), between the words and the verbs — the steps
              are what the task is made of, so they read after it says what it is and before
              the row offers to edit it. Rendered whenever there is something to show or the
              composer has been revealed; a task with neither is an ordinary open row. */}
          {(steps.length > 0 || composing) && (
            <SubtaskList
              steps={steps}
              users={users}
              open={composing}
              onAdd={onAddStep}
              onRename={onRenameStep}
              onTick={onTickStep}
              onRemove={onRemoveStep}
            />
          )}
          {/* **NO LEAD** (owner, 2026-08-16: _"no need to show the assignee name in the
              expanded task, we already have the assignee avatar"_). ADR-0189 §4 gave the foot
              the assignee because that was the row's only statement of it — the face was still
              a name in the meta line then. Once the face moved to the title row it became the
              same fact twice, three lines apart, and the second copy is the one to drop: the
              face is on screen while the row is open, and an unassigned task's empty slot is
              already unambiguous (ADR-0191 §8). What is left is the verb, where it always was.
              **Plus the way in to a checklist**, which is offered on every open row including
              one with no steps — otherwise nothing could get its first (§10). It hides once
              the composer is showing: one control, not two six pixels apart. */}
          <RowOpenFoot
            addLabel={composing ? undefined : t.tasks.subtasks.add}
            onAdd={composing ? undefined : () => setComposing(true)}
            editLabel={t.tasks.manage.edit}
            onEdit={onEdit}
          />
        </>
      )}
    </>
  );
}
