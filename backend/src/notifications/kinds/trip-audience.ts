// **Who hears about a thing, and whether its trip is still live** — resolved once per tick in
// two queries (ADR-0198 §2).
//
// It exists because the alternative is each kind asking per row, which is the N+1 the sweep's
// own `spentToday` was rewritten to avoid. A kind hands over whatever its indexed query
// returned and gets back a lookup.
//
// **Named for the TRIP, not the task, and that rename is the point** (root rule 8). Phase A
// wrote this as `task-audience`, and every line of it was already trip-scoped: the live
// window, the roster, the zone. Phase B's kinds are about EVENTS and need exactly the same
// three answers, so the choice was to generalise the one-off or write an `event-audience`
// beside it that could disagree about what "live" means. The only task-shaped thing left is
// `recipients`, and it is task-shaped only in that it takes an optional assignee — an event
// passes `null` and gets the whole group, which is what an event's audience always is.
import type { Prisma } from '@prisma/client';
import { resolveParentStatus, TASK_STATUS, type TaskStatus } from '@waypoint/shared';
import type { PrismaService } from '../../prisma/prisma.service';

/** The columns phase A's kinds read off a task. Narrower than Prisma's row on purpose: a kind
 *  that needs a sixth field should say so here, where the queries can be checked against it. */
export interface TaskRow {
  id: string;
  tripId: string;
  title: string;
  /** The row's OWN status, which for a checklist is not the status the app shows — see
   *  `notifiableTasks`. */
  status: TaskStatus;
  dueAt: Date | null;
  dueHasTime: boolean;
  displayTimezone: string | null;
  assigneeUserId: string | null;
  assignedAt: Date | null;
  /** The last person to touch the row. `task.assigned` reads it as "who assigned this",
   *  which is exact at the moment of assignment (both are written in one statement) and can
   *  drift if a third party edits inside the window — see that kind's own note. */
  updatedBy: string;
}

/**
 * The `where` every task kind starts from.
 *
 * **Open only.** A settled task is not an obligation, and `status` leads the sweep's index
 * precisely because most rows are settled — so this clause is what makes the range scan
 * cheap rather than merely correct.
 *
 * It is not the whole rule — see `notifiableTasks`, which is what a kind actually calls.
 */
export const notifiableTaskWhere = { status: TASK_STATUS.OPEN } as const;

/** Exactly the columns `TaskRow` declares — so a field a kind starts reading has to be added
 *  here, where it is visible, rather than arriving free with a `select`-less query. */
export const TASK_SELECT = {
  id: true,
  tripId: true,
  title: true,
  status: true,
  dueAt: true,
  dueHasTime: true,
  displayTimezone: true,
  assigneeUserId: true,
  assignedAt: true,
  updatedBy: true,
} as const;

/**
 * **Every task a kind should consider, and none it should not.**
 *
 * The query, the open-only clause and the checklist rule in one place, because two of the
 * three kinds got this by spreading a `where` and importing a `select` from a third — and a
 * kind that expressed either slightly differently would be wrong in a way only a phone
 * notices.
 *
 * ── THE CHECKLIST RULE, AND THE BUG IT IS ────────────────────────────────────────────────
 *
 * **A parent's status is derived from its steps and is never written** (ADR-0196 §2). Ticking
 * a checklist writes the STEPS; the parent's own row still says `open`, forever, by design —
 * nothing stored means nothing stale. Every screen resolves it on read.
 *
 * The sweep did not. `status = open` matched a checklist whose every step was ticked, so
 * `task.due` fired at its deadline and `task.digest` — whose overdue range is deliberately
 * unbounded — named it again every single morning after that. Reported from the phone as
 * *"sends notifications about tasks that were already completed"*, which is exactly what it
 * was doing.
 *
 * So the sweep resolves it too, through the same `resolveParentStatus` the screens call. One
 * extra indexed query per kind per tick, over ids the kind's own bounded window already
 * returned — and it runs at all only when that window returned something.
 */
export async function notifiableTasks(
  prisma: PrismaService,
  where: Prisma.TaskWhereInput,
): Promise<TaskRow[]> {
  const tasks = (await prisma.task.findMany({
    where: { ...notifiableTaskWhere, ...where },
    select: TASK_SELECT,
  })) as TaskRow[];
  if (tasks.length === 0) return tasks;

  const steps = await prisma.task.findMany({
    where: { parentTaskId: { in: tasks.map((task) => task.id) } },
    select: { parentTaskId: true, status: true },
  });
  if (steps.length === 0) return tasks;

  const byParent = new Map<string, { status: TaskStatus }[]>();
  for (const step of steps) {
    const list = byParent.get(step.parentTaskId!);
    if (list) list.push(step);
    else byParent.set(step.parentTaskId!, [step]);
  }
  // A row with no steps keeps its own status, which is every task in the app that is not a
  // checklist — including a STEP, whose own assignment is still worth announcing (ADR-0196
  // §8 gives a step an assignee).
  return tasks.filter(
    (task) => resolveParentStatus(task, byParent.get(task.id) ?? []) === TASK_STATUS.OPEN,
  );
}

/** What a kind can ask after its query has run. */
export interface TripAudience {
  /** Is this task's trip still one somebody could act on? A trip that has ENDED notifies
   *  nothing — but a trip that has not STARTED notifies fully, which is the owner's
   *  correction of 2026-08-20 and the reason this is `endDate`, not the access window. */
  isLive(tripId: string): boolean;
  /** The trip's zone, for a kind that needs the wall clock rather than an instant. */
  primaryZone(tripId: string): string;
  /** The assignee, or **the whole group** when nothing is assigned — "one of us" is a promise
   *  the group made, so the group hears it (ADR-0198 §2), and an EVENT is always the whole
   *  group's by construction. Always filtered to current members: membership is read at send
   *  time, so a removed member stops receiving with no cancellation step (ADR-0197 §2.4). */
  recipients(subject: { tripId: string; assigneeUserId: string | null }): string[];
  /** Every member of the trip, for the kinds that are per person rather than per row. */
  members(tripId: string): string[];
}

/**
 * Resolve the audience for a tick's worth of rows — tasks, events, anything trip-scoped.
 *
 * Two queries whatever the number of rows: the trips they belong to, and those trips'
 * memberships. `nowMs` is passed rather than read, so a spec can place the tick anywhere.
 */
export async function tripAudience(
  prisma: PrismaService,
  rows: { tripId: string }[],
  nowMs: number,
): Promise<TripAudience> {
  const tripIds = [...new Set(rows.map((r) => r.tripId))];
  if (tripIds.length === 0) return emptyAudience();

  const [trips, memberships] = await Promise.all([
    prisma.trip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, endDate: true, timezone: true },
    }),
    prisma.membership.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, userId: true },
    }),
  ]);

  const live = new Map<string, { live: boolean; zone: string }>();
  for (const trip of trips) {
    // `endDate` is a `@db.Date`, so it lands at midnight UTC of the last day. A trip is
    // still live for the whole of that day, hence the generous day's grace rather than a
    // comparison that would go dark at midnight UTC mid-trip.
    const endsAfterMs = trip.endDate.getTime() + 24 * 60 * 60 * 1000;
    live.set(trip.id, { live: endsAfterMs >= nowMs, zone: trip.timezone });
  }

  const byTrip = new Map<string, string[]>();
  for (const m of memberships) {
    const list = byTrip.get(m.tripId);
    if (list) list.push(m.userId);
    else byTrip.set(m.tripId, [m.userId]);
  }

  return {
    isLive: (tripId) => live.get(tripId)?.live === true,
    primaryZone: (tripId) => live.get(tripId)?.zone ?? 'UTC',
    members: (tripId) => byTrip.get(tripId) ?? [],
    recipients: (subject) => {
      const members = byTrip.get(subject.tripId) ?? [];
      if (!subject.assigneeUserId) return members;
      // An assignee who has since been removed from the trip gets nothing, and the group
      // does not inherit their task's notification either — the send is addressed, and
      // there is nobody at that address.
      return members.includes(subject.assigneeUserId) ? [subject.assigneeUserId] : [];
    },
  };
}

function emptyAudience(): TripAudience {
  return {
    isLive: () => false,
    primaryZone: () => 'UTC',
    members: () => [],
    recipients: () => [],
  };
}
