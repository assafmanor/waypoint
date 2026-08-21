// **Who hears about a task, and whether its trip is still live** — the part all three of
// phase A's kinds need, resolved once per tick in two queries (ADR-0198 §2).
//
// It exists because the alternative is each kind asking per task, which is the N+1 the
// sweep's own `spentToday` was rewritten to avoid. A kind hands over the rows its indexed
// query returned and gets back a lookup.
import { TASK_STATUS } from '@waypoint/shared';
import type { PrismaService } from '../../prisma/prisma.service';

/** The columns phase A reads off a task. Narrower than Prisma's row on purpose: a kind that
 *  needs a sixth field should say so here, where the queries can be checked against it. */
export interface TaskRow {
  id: string;
  tripId: string;
  title: string;
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
 * The `where` every phase-A kind starts from.
 *
 * **Open only.** A settled task is not an obligation, and `status` leads the sweep's index
 * precisely because most rows are settled — so this clause is what makes the range scan
 * cheap rather than merely correct.
 */
export const notifiableTaskWhere = { status: TASK_STATUS.OPEN } as const;

/** What a kind can ask after its query has run. */
export interface TaskAudience {
  /** Is this task's trip still one somebody could act on? A trip that has ENDED notifies
   *  nothing — but a trip that has not STARTED notifies fully, which is the owner's
   *  correction of 2026-08-20 and the reason this is `endDate`, not the access window. */
  isLive(tripId: string): boolean;
  /** The trip's zone, for a kind that needs the wall clock rather than an instant. */
  primaryZone(tripId: string): string;
  /** The assignee, or **the whole group** when the task is nobody's in particular — "one of
   *  us" is a promise the group made, so the group hears it (ADR-0198 §2). Always filtered
   *  to current members: membership is read at send time, so a removed member stops
   *  receiving with no cancellation step (ADR-0197 §2.4). */
  recipients(task: Pick<TaskRow, 'tripId' | 'assigneeUserId'>): string[];
  /** Every member of the trip, for the digest, which is per person rather than per task. */
  members(tripId: string): string[];
}

/**
 * Resolve the audience for a tick's worth of tasks.
 *
 * Two queries whatever the number of tasks: the trips they belong to, and those trips'
 * memberships. `todayIso` is the caller's day boundary, passed rather than read, so a spec
 * can place the tick anywhere.
 */
export async function taskAudience(
  prisma: PrismaService,
  tasks: Pick<TaskRow, 'tripId'>[],
  nowMs: number,
): Promise<TaskAudience> {
  const tripIds = [...new Set(tasks.map((t) => t.tripId))];
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
    recipients: (task) => {
      const members = byTrip.get(task.tripId) ?? [];
      if (!task.assigneeUserId) return members;
      // An assignee who has since been removed from the trip gets nothing, and the group
      // does not inherit their task's notification either — the send is addressed, and
      // there is nobody at that address.
      return members.includes(task.assigneeUserId) ? [task.assigneeUserId] : [];
    },
  };
}

function emptyAudience(): TaskAudience {
  return {
    isLive: () => false,
    primaryZone: () => 'UTC',
    members: () => [],
    recipients: () => [],
  };
}
