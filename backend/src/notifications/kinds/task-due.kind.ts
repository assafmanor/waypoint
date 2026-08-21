// `task.due` — a deadline with an HOUR on it, at that hour (ADR-0198 §2).
//
// **`dueHasTime: false` never fires this.** "Thursday" is not a moment, and the schema keeps
// that distinction on purpose (`dueAt` alone cannot tell "Thursday" from "Thursday 00:00").
// A dated-no-time task is `task.digest`'s job — which is the pre-trip case, not an edge one.
import { dueZone, NOTIFICATION_KIND } from '@waypoint/shared';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
  type TripZones,
} from '../notification-kind';
import { taskDuePayload } from '../notify-copy';
import { notifiableTaskWhere, tripAudience, type TaskRow } from './trip-audience';

/** Three hours. A deadline is worth telling you about for the rest of the afternoon; a tick
 *  lost to a redeploy should not deliver it tomorrow morning (ADR-0197 §3). */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export const taskDueKind: NotificationKind = {
  id: NOTIFICATION_KIND.TASK_DUE,
  // A chore is not a flight. 03:00 for a task is what teaches people to swipe notifications
  // away, and the digest reports it at 08:00 regardless (ADR-0197 §5).
  timeCritical: false,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.TASKS,

  async due({ prisma, nowMs, zonesFor }: DueInput): Promise<DueSend[]> {
    // ONE indexed range scan across every trip — `(status, dueAt)`. The window is bounded at
    // both ends: `staleAfterMs` back so a missed tick still delivers, and `now` forward so a
    // deadline waits for its own minute rather than firing early.
    const tasks = (await prisma.task.findMany({
      where: {
        ...notifiableTaskWhere,
        dueHasTime: true,
        dueAt: { gte: new Date(nowMs - STALE_AFTER_MS), lte: new Date(nowMs) },
      },
      select: TASK_SELECT,
    })) as TaskRow[];
    if (tasks.length === 0) return [];

    const audience = await tripAudience(prisma, tasks, nowMs);
    const sends: DueSend[] = [];
    for (const task of tasks) {
      if (!audience.isLive(task.tripId)) continue;
      const recipients = audience.recipients(task);
      if (recipients.length === 0) continue;

      const dueAtMs = task.dueAt!.getTime();
      const payload = taskDuePayload({
        tripId: task.tripId,
        title: task.title,
        dueAtMs,
        zone: deadlineZone(task, await zonesFor(task.tripId)),
      });
      // **One send per recipient, each with its own ledger row**, so one person's quiet
      // hours or spent budget never suppresses another's. `aimedAtMs` is the deadline
      // itself, which is what makes a MOVED deadline a new `fireKey` and an edited title
      // the same one.
      for (const userId of recipients) {
        sends.push({
          userId,
          tripId: task.tripId,
          kind: NOTIFICATION_KIND.TASK_DUE,
          subjectId: task.id,
          aimedAtMs: dueAtMs,
          payload,
        });
      }
    }
    return sends;
  },
};

/** Exactly the columns `TaskRow` declares — so a field a kind starts reading has to be added
 *  here, where it is visible, rather than arriving free with a `select`-less query. */
export const TASK_SELECT = {
  id: true,
  tripId: true,
  title: true,
  dueAt: true,
  dueHasTime: true,
  displayTimezone: true,
  assigneeUserId: true,
  assignedAt: true,
  updatedBy: true,
} as const;

/** **The zone the deadline means** — `dueZone` from `@waypoint/shared` (ADR-0194): the pinned
 *  zone when there is one, else ADR-0107's resolver at the instant it falls due. The same
 *  function the row printing that deadline calls, which is the entire reason phase 2 moved it
 *  into the shared package: a send time and a printed time are one derivation, not two that
 *  agree today. Wrapped only because Prisma hands back a `Date` where the DTO carries a
 *  string. */
function deadlineZone(task: TaskRow, zones: TripZones): string {
  const dueAtMs = task.dueAt!.getTime();
  return dueZone(
    // `?? undefined`: the DTO types a missing pin as absent, Prisma as `null`.
    { dueAt: task.dueAt!.toISOString(), displayTimezone: task.displayTimezone ?? undefined },
    { nowMs: dueAtMs, crossings: zones.crossings, primaryZone: zones.primaryZone },
  );
}
