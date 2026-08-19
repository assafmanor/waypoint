// **A host's tasks, section and editor together** (tasks brief §F, ADR-0191 §5) —
// `HostNotes`' shape for the entity beside it, and connected the same way so a host surface
// mounts one component and passes one fact.
//
// **The host is passed as a fact, never picked** (ADR-0153 §5, which tasks inherit through
// ADR-0189's editor having no host picker either). Which FK the task is written to comes from
// `TASK_HOST_FIELD` through `taskHostInput`, so a sixth hostable entity is a line in
// `@waypoint/shared` and nothing here.
//
// **Every host already has a home for this**, which is what made phase 4 cheap: notes put a
// section on each of the five surfaces, and tasks go to the same one — the expanded event
// card, `BookingSheet`/`DetailSheet`, the Map place card, `DocumentManageSheet`,
// `MaybeManageSheet`. No host grows a new surface.
import { useMemo, useState } from 'react';
import { TASK_STATUS, type CreateTaskInput, type Task, type TaskHostKey } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { settledHostKeys, tasksForHost, taskHostInput, type TaskClock } from '../lib/tasks';
import type { NoteHostKind } from '../lib/notes';
import { TaskSection } from './TaskSection';
import { TaskSheet, createTaskInput, writeSubtasks, type TaskDraft } from './TaskSheet';

/** **Which hosts are closed** (ADR-0191 §6), built once from trip state so no screen assembles
 *  it itself — the same reason `useTaskClock` exists below. Memoized on the events array,
 *  because the mark, both Home bands and the Index tile all ask for it every render. */
export function useSettledHosts(): Set<string> {
  const { events } = useTrip();
  return useMemo(() => settledHostKeys(events), [events]);
}

/** **How many OPEN tasks this one host carries**, from trip state — for the surfaces that
 *  ask about a single host rather than a listful (a delete confirm owes the reader the count
 *  the cascade is about to take). A list screen keeps `openTaskCountsByHost`, which answers
 *  the same question for a whole screen in one pass. */
export function useHostTaskCount(kind: NoteHostKind, id: string | undefined): number {
  const { tasks } = useTrip();
  const now = useClock();
  const clock = useTaskClock(now);
  return useMemo(
    () => (id ? tasksForHost(tasks, kind, id, clock).filter((x) => !x.settledAt).length : 0),
    [tasks, kind, id, clock],
  );
}

/** The clock every task derivation takes, assembled once (`frontend/CLAUDE.md`'s rule that a
 *  derivation is handed `now` rather than reading it). */
function useTaskClock(now: Date): TaskClock {
  const { trip, zoneCrossings } = useTrip();
  return useMemo(
    () => ({ nowMs: now.getTime(), crossings: zoneCrossings, primaryZone: trip.timezone }),
    [now, zoneCrossings, trip.timezone],
  );
}

/** **Tasks typed on a CREATE form, held until the host exists** (ADR-0191 §7).
 *
 *  A create has no id, so there is no FK to write a task to — which is a reason to STAGE, not
 *  a reason to have no way in. Notes and documents both already answer it this way
 *  (`useNoteComposer().pending()`, `DocumentAttachField`'s staged picks), so this is the third
 *  consumer of an established pattern rather than a new mechanism, and the ordering rule that
 *  makes it correct is theirs too: the write goes out AFTER the host's own, inside the same
 *  change group, because the outbox is FIFO and a task queued first would reach a server that
 *  cannot see its host. */
export function useTaskStaging() {
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  return {
    drafts,
    add: (draft: TaskDraft) => setDrafts((current) => [...current, draft]),
    replace: (index: number, draft: TaskDraft) =>
      setDrafts((current) => current.map((d, i) => (i === index ? draft : d))),
    /** What the host form writes once its entity exists. */
    pending: () => drafts,
  };
}
export type TaskStaging = ReturnType<typeof useTaskStaging>;

/** The staged tasks, written onto the host the form just created. Mirrors
 *  `writeStagedAttachments`, and is called from inside the host's own change group. */
export async function writeStagedTasks(
  staging: TaskStaging,
  createTask: (input: CreateTaskInput) => Promise<unknown>,
  where: Partial<Record<TaskHostKey, string>>,
): Promise<void> {
  // Two levels of staging in one save, and the order is the same rule twice: the host first,
  // then each task, then that task's own steps (ADR-0196 §12). `createTask` resolves to the
  // canonical row, which is where a step's `parentTaskId` comes from.
  for (const draft of staging.pending()) {
    const created = (await createTask({
      ...createTaskInput(draft),
      ...where,
    })) as { id: string } | undefined;
    if (created?.id) await writeSubtasks(createTask, created.id, draft.subtasks);
  }
}

/** The staged draft a `number` sheet refers to, back as a `Task` the editor can read. */
const stagedTaskFor = (index: number | 'create', rows: Task[]): Task | undefined =>
  typeof index === 'number' ? rows[index] : undefined;

export function HostTasks({
  host,
  quiet,
  staging,
}: {
  /** `id` is absent on a CREATE, where there is nothing to hang an FK on yet — the section
   *  then reads and writes `staging` instead of trip state. */
  host: { kind: NoteHostKind; id?: string; name: string };
  /** **A host FORM's copy of this section** (ADR-0191 §7, owner's call: the form is _"not
   *  necessarily the main add point"_). Same section and the same editor behind it — the way
   *  in is just stated quietly, because the surfaces you normally attach a task from are the
   *  reads (the expanded card, the detail sheet, the manage sheet), and a form's business is
   *  the entity's own fields. */
  quiet?: boolean;
  /** Required when `host.id` is absent; ignored when it is not. */
  staging?: TaskStaging;
}) {
  const { tasks, subtasks, users, taskVerbs } = useTrip();
  const now = useClock();
  const clock = useTaskClock(now);
  const settledHosts = useSettledHosts();
  // null = closed; 'create' = a new task on this host; a Task = editing that one; a number =
  // editing the Nth STAGED draft, which has no id to be identified by yet.
  const [sheet, setSheet] = useState<Task | 'create' | number | null>(null);

  const hostId = host.id;
  const saved = useMemo(
    () => (hostId ? tasksForHost(tasks, host.kind, hostId, clock) : []),
    [tasks, host.kind, hostId, clock],
  );

  // A staged draft is rendered as a task so the section looks the same before and after the
  // host exists. `id: ''` marks it unwritten, which is the convention `draftOverlay` already
  // uses for a readiness check with no row.
  const rows = useMemo(
    () =>
      hostId
        ? saved
        : (staging?.drafts ?? []).map((draft, i): Task => ({
            id: `staged:${i}`,
            tripId: '',
            title: draft.title,
            // A draft says `null` for what it cleared and an entity says absent, so every
            // clearable field is coerced here. `body` was simply missing before, which is why
            // re-opening a staged task's editor lost the words typed into it.
            body: draft.body ?? undefined,
            dueAt: draft.dueAt ?? undefined,
            dueHasTime: draft.dueHasTime,
            important: draft.important,
            assigneeUserId: draft.assigneeUserId ?? undefined,
            status: TASK_STATUS.OPEN,
            createdBy: '',
            createdAt: '',
            updatedAt: '',
            updatedBy: '',
          })),
    [hostId, saved, staging?.drafts],
  );

  const save = (draft: TaskDraft) => {
    const editing = typeof sheet === 'object' && sheet !== null ? sheet : null;
    const stagedIndex = typeof sheet === 'number' ? sheet : null;
    setSheet(null);
    if (editing) void taskVerbs.updateTask(editing.id, draft);
    else if (stagedIndex != null) staging?.replace(stagedIndex, draft);
    // No host id yet: hold it until the form's save has one (`writeStagedTasks`).
    else if (!hostId) staging?.add(draft);
    // The host rides the create, from the lookup rather than spelled here.
    else
      void taskVerbs
        .createTask({ ...createTaskInput(draft), ...taskHostInput(host.kind, hostId) })
        .then(
          (created) => created && writeSubtasks(taskVerbs.createTask, created.id, draft.subtasks),
        );
  };

  return (
    <>
      <TaskSection
        tasks={rows}
        users={users}
        subtasks={subtasks}
        clock={clock}
        hostSettled={hostId ? settledHosts.has(`${host.kind}:${hostId}`) : false}
        quiet={quiet}
        onAdd={() => setSheet('create')}
        // A staged task has nothing to tick: it does not exist yet, and completing something
        // you have not saved is a state with nowhere to live.
        onTick={(task) => (hostId ? void taskVerbs.tickTask(task) : undefined)}
        onOpen={(task) => setSheet(hostId ? task : Number(task.id.split(':')[1]))}
      />
      {sheet !== null && (
        <TaskSheet
          task={typeof sheet === 'object' ? sheet : stagedTaskFor(sheet, rows)}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
