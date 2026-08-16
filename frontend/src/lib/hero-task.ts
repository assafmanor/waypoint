// **One task, made view-ready for a lifted hero** (ADR-0160 §U, ADR-0193 §4).
//
// Extracted from `screens/Home.tsx`, where it was a private closure, the moment the
// lifted PLAN hero became a second host for the same row. Two hosts formatting one row
// from two copies is the pile root rule 8 exists to stop — and the specific thing that
// would have drifted is the part that matters most: `taskDue` resolves a deadline in the
// task's OWN zone (ADR-0107), so a second hand-rolled formatter is how one task starts
// reading `מחר 09:00` on one surface and `היום 23:00` on another.
//
// A pure formatter, not a component: it takes the clock and the roster and returns data.
// Both heroes stay presentational, which is what `HeroLift`'s own header promises.
import type { Task, User } from '@waypoint/shared';
import { taskDue, type TaskClock } from './tasks';
import { ltrIsolate } from './bidi';
import { t } from '../i18n/he';
import type { HeroLiftTask } from '../ui/domain/HeroLift';

export function toHeroTask(task: Task, clock: TaskClock, users: User[]): HeroLiftTask {
  const due = taskDue(task, clock);
  const assignee = task.assigneeUserId
    ? users.find((u) => u.id === task.assigneeUserId)
    : undefined;
  return {
    title: task.title,
    important: task.important,
    due: due && {
      // The numeric run is its own LTR island; the Hebrew around it must not be dragged
      // with it (ADR-0118) — `TaskSection`'s own split, reused rather than rebuilt.
      text: `${due.late ? t.tasks.due.late : t.tasks.due.by} ${
        due.time ? ltrIsolate(`${due.day} ${due.time}`) : due.day
      }`,
      late: due.late,
    },
    assignee: assignee && {
      person: assignee,
      name: `${t.tasks.sheet.assigneeLabel}: ${assignee.displayName}`,
    },
  };
}
