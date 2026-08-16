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
import type { Task } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import {
  settledHostKeys,
  tasksForHost,
  taskHostInput,
  tickedStatus,
  type TaskClock,
} from '../lib/tasks';
import type { NoteHostKind } from '../lib/notes';
import { TaskSection } from './TaskSection';
import { TaskSheet, type TaskDraft } from './TaskSheet';

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

export function HostTasks({
  host,
  quiet,
}: {
  host: { kind: NoteHostKind; id: string; name: string };
  /** **A host FORM's copy of this section** (ADR-0191 §7, owner's call: the form is _"not
   *  necessarily the main add point"_). Same section and the same editor behind it — the way
   *  in is just stated quietly, because the surfaces you normally attach a task from are the
   *  reads (the expanded card, the detail sheet, the manage sheet), and a form's business is
   *  the entity's own fields. */
  quiet?: boolean;
}) {
  const { tasks, users, taskVerbs } = useTrip();
  const now = useClock();
  const clock = useTaskClock(now);
  const settledHosts = useSettledHosts();
  // null = closed; 'create' = a new task on this host; a Task = editing that one.
  const [sheet, setSheet] = useState<Task | 'create' | null>(null);

  const rows = useMemo(
    () => tasksForHost(tasks, host.kind, host.id, clock),
    [tasks, host.kind, host.id, clock],
  );

  const save = (draft: TaskDraft) => {
    const editing = sheet !== 'create' && sheet !== null ? sheet : null;
    setSheet(null);
    if (editing) void taskVerbs.updateTask(editing.id, draft);
    // The host rides the create, from the lookup rather than spelled here.
    else void taskVerbs.createTask({ ...draft, ...taskHostInput(host.kind, host.id) });
  };

  return (
    <>
      <TaskSection
        tasks={rows}
        users={users}
        clock={clock}
        hostSettled={settledHosts.has(`${host.kind}:${host.id}`)}
        quiet={quiet}
        onAdd={() => setSheet('create')}
        onTick={(task) => void taskVerbs.updateTask(task.id, { status: tickedStatus(task) })}
        onOpen={(task) => setSheet(task)}
      />
      {sheet && (
        <TaskSheet
          task={sheet === 'create' ? undefined : sheet}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
