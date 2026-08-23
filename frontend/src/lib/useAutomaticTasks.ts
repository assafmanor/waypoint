// **One place that assembles readiness from trip state**, because phase 2 gives it a second
// reader. `PlanHome` had the eight-field `computeReadiness({...})` call inline; the tasks
// screen needs the same derivation, and two screens assembling one input from two copies is
// how the two day surfaces drifted for a release (`frontend/CLAUDE.md`). So the assembly
// moved here and both hosts call this.
//
// `readiness` comes back too, not just the rows: `PlanHome` still draws the percentage bar
// off the same computation, and returning it is cheaper than making that screen call
// `computeReadiness` a second time with the same arguments.
import { useMemo } from 'react';
import type { Task, UpdateTaskInput } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { computeReadiness, destinationRefOf, type Readiness } from '@waypoint/shared';
import { automaticTasks, isUnwritten, type AutomaticTask } from './automatic-tasks';

export interface AutomaticTasks {
  readiness: Readiness;
  automatic: AutomaticTask[];
  /** **Apply a verb to a task that may not exist yet.** An untouched readiness check has no
   *  row, and brief §4 says the row is minted by the verb — dismissing, assigning or
   *  flagging — not by opening the menu that offers it. So the same handler serves both:
   *  patch a real row, or create one carrying the verb's effect. Both screens' `⋯` sheets go
   *  through here rather than each writing the create branch a second time. */
  applyVerb: (task: Task, patch: UpdateTaskInput) => void;
}

export function useAutomaticTasks(): AutomaticTasks {
  const { trip, events, bookings, places, documents, users, tasks, taskVerbs } = useTrip();

  const readiness = useMemo(
    () =>
      computeReadiness({
        startDate: trip.startDate,
        endDate: trip.endDate,
        destination: destinationRefOf(trip),
        events,
        bookings,
        places,
        documents,
        travelerIds: users.map((u) => u.id),
      }),
    [trip, events, bookings, places, documents, users],
  );

  const automatic = useMemo(
    () =>
      automaticTasks(readiness.checks, tasks, {
        emptyDates: readiness.emptyDates,
        tripStartDate: trip.startDate,
        travelerCount: users.length,
      }),
    [readiness, tasks, trip.startDate, users.length],
  );

  const applyVerb = (task: Task, patch: UpdateTaskInput) => {
    if (!isUnwritten(task)) {
      void taskVerbs.updateTask(task.id, patch);
      return;
    }
    void taskVerbs.createTask({
      title: task.title,
      derivedKey: task.derivedKey,
      dueHasTime: false,
      important: patch.important ?? false,
      // `status` is on the create input for exactly this: dismissing a check that had no row
      // is one press, and it must not be a create followed by a patch.
      status: patch.status ?? undefined,
    });
  };

  return { readiness, automatic, applyVerb };
}
