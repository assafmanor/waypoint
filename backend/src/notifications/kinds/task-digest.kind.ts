// `task.digest` — the 08:00 roll-up, and **the mechanism that makes a dated-no-time deadline
// reachable at all** (ADR-0198 §2).
//
// That is why this kind matters more than it looks. `task.due` needs an hour, and most of
// what a person writes weeks out is a day with no hour — so without the digest the owner's
// "we don't want to miss any upcoming" would be false for the pre-trip run-up, which is
// exactly where task deadlines live. **It names today and tomorrow**, in that order, and
// that one addition is what closes the gap without a second send.
//
// ── THE ONE KIND WHOSE TRIGGER IS A WALL CLOCK ────────────────────────────────────────────
//
// The others fire at a stored instant. This one fires at 08:00 *somewhere*, which means the
// question "is it 08:00 for this trip" can only be asked once a zone is resolved — and zone
// resolution is the per-trip cost the inverted loop exists to avoid paying for nothing
// (`notification-kind.ts`'s header).
//
// It stays inverted anyway, by asking the questions in this order: **which trips have an open
// dated task at all** (one indexed scan, and most rows in that table are settled), then
// zones for only those trips, then which of them are at 08:00. So the cost scales with trips
// that have something to report, never with trips.
import { currentZone, NOTIFICATION_KIND, todayInTz } from '@waypoint/shared';
import { hourInZone, hourStartInZone } from '../send-policy';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
} from '../notification-kind';
import { taskDigestPayload } from '../notify-copy';
import { notifiableTaskWhere, tripAudience, type TaskRow } from './trip-audience';
import { TASK_SELECT } from './task-due.kind';

/** The local hour the digest is aimed at. A fixed hour rather than a preference, for the same
 *  reason quiet hours are constants (ADR-0198 §6). */
export const DIGEST_HOUR = 8;

/** Two hours. Late enough that a tick lost to a redeploy still arrives inside the morning,
 *  short enough that it can never land in the afternoon claiming to be the morning's list. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export const taskDigestKind: NotificationKind = {
  id: NOTIFICATION_KIND.TASK_DIGEST,
  // It IS a fixed local hour, so it never needs to break the quiet window — 08:00 is outside
  // it by construction.
  timeCritical: false,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_INSTANT,
  pref: NOTIFY_PREF.TASKS,

  async due({ prisma, nowMs, zonesFor }: DueInput): Promise<DueSend[]> {
    // Everything open and dated no later than the end of tomorrow, anywhere. Overdue rows
    // are deliberately unbounded on the low side: a deadline you blew past three weeks ago
    // and never settled is still the thing you can still miss (ADR-0164), and `status = open`
    // is what keeps the scan small — a settled task leaves the range for good.
    const horizon = new Date(nowMs + 2 * 24 * 60 * 60 * 1000);
    const tasks = (await prisma.task.findMany({
      where: { ...notifiableTaskWhere, dueAt: { not: null, lte: horizon } },
      select: TASK_SELECT,
    })) as TaskRow[];
    if (tasks.length === 0) return [];

    const audience = await tripAudience(prisma, tasks, nowMs);
    const byTrip = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      if (!audience.isLive(task.tripId)) continue;
      const list = byTrip.get(task.tripId);
      if (list) list.push(task);
      else byTrip.set(task.tripId, [task]);
    }

    const sends: DueSend[] = [];
    for (const [tripId, tripTasks] of byTrip) {
      const zones = await zonesFor(tripId);
      // The reader's zone: where the group is standing NOW, not where the trip is going —
      // which before the first crossing is home, and that is the pre-trip case (ADR-0197 §5).
      const zone = currentZone(nowMs, zones.crossings, zones.primaryZone);
      if (hourInZone(nowMs, zone) !== DIGEST_HOUR) continue;
      const hourStart = hourStartInZone(nowMs, zone);

      const today = todayInTz(zone, new Date(nowMs));
      const tomorrow = todayInTz(zone, new Date(nowMs + 24 * 60 * 60 * 1000));

      // **Per member, not per task.** Each person's digest counts what is theirs: their own
      // assigned tasks plus everything nobody claimed. So two members of one trip can get
      // two different digests, and somebody with nothing gets none.
      for (const userId of audience.members(tripId)) {
        const mine = tripTasks.filter(
          (task) => task.assigneeUserId === null || task.assigneeUserId === userId,
        );
        const dueToday = mine.filter((task) => onOrBefore(task, zone, today));
        // Nothing today and nothing overdue means no digest — tomorrow alone is not a reason
        // to speak (ADR-0198 §2), it is an addition to a message already going out.
        if (dueToday.length === 0) continue;
        const dueTomorrow = mine.filter((task) => dayIn(task, zone) === tomorrow).length;

        sends.push({
          userId,
          tripId,
          kind: NOTIFICATION_KIND.TASK_DIGEST,
          subjectId: tripId,
          // **The aimed-at instant is 08:00 itself, not the tick that noticed it.** The
          // check above passes for all sixty minutes of the hour, so `nowMs` here — which is
          // what phase A shipped — gave every tick its own `fireKey`: measured against the
          // seed, 60 distinct ledger claims per person per morning, 59 of them refused by the
          // 1/day cap rather than by the ledger. Keying on the hour is what actually makes
          // this one bucket per morning per trip (ADR-0197 §10).
          aimedAtMs: hourStart,
          payload: taskDigestPayload({
            tripId,
            titles: dueToday.map((task) => task.title),
            tomorrowCount: dueTomorrow,
          }),
        });
      }
    }
    return sends;
  },
};

/** The calendar day a deadline lands on, read in the reader's zone. */
function dayIn(task: TaskRow, zone: string): string {
  return todayInTz(zone, new Date(task.dueAt!.getTime()));
}

/** Today's, or any day before it — which is what makes "overdue" part of today's list rather
 *  than a separate nag (ADR-0198 §2 rejects the overdue nag by name). ISO day keys compare
 *  lexicographically, which is the whole reason `todayInTz` returns `YYYY-MM-DD`. */
function onOrBefore(task: TaskRow, zone: string, today: string): boolean {
  return dayIn(task, zone) <= today;
}
