// `task.assigned` — the catalogue's **one social send**, and it earns its place by being
// addressed: somebody put your name on something (ADR-0198 §2). ADR-0081's rejection was of
// ambient awareness, which this is not.
//
// ── WHY THIS KIND NEEDED A COLUMN ─────────────────────────────────────────────────────────
//
// Every other kind fires at an instant the app already stores — a deadline, a departure. This
// one fires on a **transition**, and no combination of `updatedAt` and `assigneeUserId` can
// tell "you were just assigned this" from "somebody fixed a typo". So `Task.assignedAt`
// records the fact and the send stays derived, which keeps ADR-0197 §3's principle instead of
// bending it. `TasksService.assignmentStamp` owns when it moves — including the part that
// matters here: it is **null when the actor assigned themselves**, so this kind needs no
// actor comparison at all.
//
// ── AND WHY ITS DEDUP IS DIFFERENT ────────────────────────────────────────────────────────
//
// `DEDUP.BY_SUBJECT`, because ADR-0198 asks for "dedup on the assignee, so passing a task
// back and forth does not multiply". With the default (the aimed-at minute) an A→B→A→B
// hand-off would send four times; keyed on the subject it sends once per person, ever. The
// ledger's own unique key already carries the recipient, so "once per (task, assignee)" needs
// nothing but a constant fire key.
import { NOTIFICATION_KIND, todayInTz } from '@waypoint/shared';
import {
  DEDUP,
  NOTIFY_PREF,
  type DueInput,
  type DueSend,
  type NotificationKind,
} from '../notification-kind';
import { clockLabel, taskAssignedPayload } from '../notify-copy';
import { notifiableTasks, tripAudience, type TaskRow } from './trip-audience';

/** Six hours. Longer than the deadline kinds because there is no moment being missed — being
 *  told in the evening that you were given something this morning is still useful. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export const taskAssignedKind: NotificationKind = {
  id: NOTIFICATION_KIND.TASK_ASSIGNED,
  timeCritical: false,
  staleAfterMs: STALE_AFTER_MS,
  dedup: DEDUP.BY_SUBJECT,
  pref: NOTIFY_PREF.TASKS,

  async due({ prisma, nowMs }: DueInput): Promise<DueSend[]> {
    // One indexed range scan on `(status, assignedAt)`. `assignedAt` is null for almost
    // every row that has ever existed — every task written before the column, and every
    // self-assignment — which is what makes this cheap.
    const tasks = await notifiableTasks(prisma, {
      assignedAt: { gte: new Date(nowMs - STALE_AFTER_MS), lte: new Date(nowMs) },
      assigneeUserId: { not: null },
    });
    if (tasks.length === 0) return [];

    const audience = await tripAudience(prisma, tasks, nowMs);
    const sends: DueSend[] = [];
    for (const task of tasks) {
      if (!audience.isLive(task.tripId)) continue;
      // `recipients` narrows to a current member, so an assignee removed from the trip
      // between the assignment and this tick hears nothing — and the group does not inherit
      // their notification, because this send is addressed and there is nobody at the
      // address.
      const recipients = audience.recipients(task);
      if (recipients.length === 0) continue;

      sends.push({
        userId: recipients[0],
        tripId: task.tripId,
        kind: NOTIFICATION_KIND.TASK_ASSIGNED,
        subjectId: task.id,
        aimedAtMs: task.assignedAt!.getTime(),
        payload: taskAssignedPayload({
          tripId: task.tripId,
          taskId: task.id,
          title: task.title,
          dueLabel: dueLabelFor(task, audience.primaryZone(task.tripId)),
        }),
      });
    }
    return sends;
  },
};

/**
 * **The assigner's NAME is deliberately not in this send** (owner, 2026-08-21).
 *
 * It used to be: the body ended `· דנה`, and a whole `namesFor` query resolved it for the
 * tick. Removed on the owner's call, and the trade is worth recording because ADR-0198
 * defended this kind against ADR-0081's rejection of ambient awareness on the grounds that
 * it is **addressed** — "someone put your name on something". The addressing survives in the
 * title (`משימה חדשה בשבילך`); what is gone is *who*, and with it a `User` query per tick.
 *
 * The name was never solid anyway, which is the other half of why it went cheaply.
 * `updatedBy` was the closest the schema holds: it and `assignedAt` are written in one
 * statement so they agree at the moment of assignment, but a third party editing inside the
 * six-hour window moves one and not the other. Restoring the name properly would mean an
 * `assignedBy` column beside `assignedAt` — a column for a courtesy, and the reason it was
 * never worth one.
 */
/** `18:00` when the deadline has an hour, the day otherwise, `null` when there is no
 *  deadline at all — an assigned task need not have one. The day form is deliberately short:
 *  a lock screen is not the place to spell out a date. */
function dueLabelFor(task: TaskRow, zone: string): string | null {
  if (!task.dueAt) return null;
  if (task.dueHasTime) return clockLabel(task.dueAt.getTime(), zone);
  return todayInTz(zone, task.dueAt).slice(5).split('-').reverse().join('.');
}
