import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { DEDUP, NOTIFY_PREF, type DueInput, type TripZones } from '../notification-kind';
import { taskAssignedKind } from './task-assigned.kind';
import { DIGEST_HOUR, taskDigestKind } from './task-digest.kind';
import { taskDueKind } from './task-due.kind';

const HOUR = 60 * 60 * 1000;
const utc = (iso: string) => Date.parse(iso);

/** A task row as Prisma hands it back. Open, unassigned, dated-with-time by default — the
 *  shape that fires, so each test states only its own deviation. */
function row(over: Partial<TaskLike> = {}): TaskLike {
  return {
    id: 'task-1',
    tripId: 'trip-1',
    title: 'צילום דרכונים',
    status: 'open',
    dueAt: new Date(utc('2026-08-21T15:00:00Z')),
    dueHasTime: true,
    displayTimezone: null,
    assigneeUserId: null,
    assignedAt: null,
    parentTaskId: null,
    updatedBy: 'u-dana',
    ...over,
  };
}

/** A step of `parent`. Carries no deadline, which is what the schema refuses it (ADR-0196 §8)
 *  and therefore what keeps a step out of the deadline kinds' own windows. */
function step(id: string, parentTaskId: string, status: string): TaskLike {
  return row({ id, parentTaskId, status, dueAt: null, dueHasTime: false, title: `שלב ${id}` });
}

interface TaskLike {
  id: string;
  tripId: string;
  title: string;
  status: string;
  dueAt: Date | null;
  dueHasTime: boolean;
  displayTimezone: string | null;
  assigneeUserId: string | null;
  assignedAt: Date | null;
  parentTaskId: string | null;
  updatedBy: string;
}

/**
 * A Prisma stand-in that **honours the clauses the kinds actually send**.
 *
 * That is the whole design of this fake, and it is a lesson paid for twice already in this
 * epic: a fake looser than Prisma lets a query pass with its `status` filter deleted, and a
 * fake stricter than Prisma accuses correct code. So `status`, `dueHasTime`, the `dueAt` /
 * `assignedAt` range bounds and `not: null` are all applied here, and nothing else is.
 */
function fakePrisma(options: {
  tasks?: TaskLike[];
  trips?: { id: string; endDate: Date; timezone: string }[];
  members?: { tripId: string; userId: string }[];
  users?: { id: string; displayName: string }[];
}) {
  const tasks = options.tasks ?? [];
  const trips = options.trips ?? [
    { id: 'trip-1', endDate: new Date(utc('2026-08-30T00:00:00Z')), timezone: 'Asia/Jerusalem' },
  ];
  const members = options.members ?? [
    { tripId: 'trip-1', userId: 'u-assaf' },
    { tripId: 'trip-1', userId: 'u-noam' },
  ];
  const users = options.users ?? [{ id: 'u-dana', displayName: 'דנה' }];
  const queries: string[] = [];

  const inRange = (value: Date | null, range?: { gte?: Date; lte?: Date; not?: null }) => {
    if (!range) return true;
    if (range.not === null && value === null) return false;
    if (value === null) return range.gte === undefined && range.lte === undefined;
    if (range.gte && value.getTime() < range.gte.getTime()) return false;
    if (range.lte && value.getTime() > range.lte.getTime()) return false;
    return true;
  };

  const prisma = {
    task: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        queries.push('task.findMany');
        return Promise.resolve(
          tasks.filter((task) => {
            if (where.status !== undefined && task.status !== where.status) return false;
            if (where.dueHasTime !== undefined && task.dueHasTime !== where.dueHasTime) {
              return false;
            }
            if (!inRange(task.dueAt, where.dueAt as never)) return false;
            if (!inRange(task.assignedAt, where.assignedAt as never)) return false;
            if (where.assigneeUserId !== undefined && task.assigneeUserId === null) return false;
            if (where.parentTaskId !== undefined) {
              const ids = (where.parentTaskId as { in: string[] }).in;
              if (task.parentTaskId === null || !ids.includes(task.parentTaskId)) return false;
            }
            return true;
          }),
        );
      },
    },
    trip: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) => {
        queries.push('trip.findMany');
        return Promise.resolve(trips.filter((t) => where.id.in.includes(t.id)));
      },
    },
    membership: {
      findMany: ({ where }: { where: { tripId: { in: string[] } } }) => {
        queries.push('membership.findMany');
        return Promise.resolve(members.filter((m) => where.tripId.in.includes(m.tripId)));
      },
    },
    user: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) => {
        queries.push('user.findMany');
        return Promise.resolve(users.filter((u) => where.id.in.includes(u.id)));
      },
    },
  } as unknown as PrismaService;
  return { prisma, queries };
}

/** Zone facts as the sweep supplies them: no crossings, so the trip's own zone answers. */
const zonesFor =
  (zone = 'Asia/Jerusalem') =>
  (): Promise<TripZones> =>
    Promise.resolve({ crossings: [], primaryZone: zone, bookings: [], places: [] });

const input = (prisma: PrismaService, nowMs: number, zone?: string): DueInput => ({
  prisma,
  nowMs,
  zonesFor: zonesFor(zone),
});

describe('the phase-A kinds declare their policy', () => {
  it.each([
    ['task.due', taskDueKind],
    ['task.digest', taskDigestKind],
    ['task.assigned', taskAssignedKind],
  ])('%s is declinable through notifyTasks and never breaks quiet hours', (_label, kind) => {
    // The whole point of declaring these per kind: a task reminder that could fire at 03:00
    // is the one that gets notifications switched off for good (ADR-0197 §5), and a category
    // nobody can decline is a category nobody asked for (ADR-0198 §6).
    expect(kind.pref).toBe(NOTIFY_PREF.TASKS);
    expect(kind.timeCritical).toBe(false);
  });

  it('dedups task.assigned by SUBJECT and the deadline kinds by instant', () => {
    // ADR-0198: "dedup on the assignee, so passing a task back and forth does not multiply".
    expect(taskAssignedKind.dedup).toBe(DEDUP.BY_SUBJECT);
    expect(taskDueKind.dedup).toBe(DEDUP.BY_INSTANT);
    expect(taskDigestKind.dedup).toBe(DEDUP.BY_INSTANT);
  });
});

describe('task.due', () => {
  // 15:00 UTC = 18:00 in Tel Aviv, comfortably outside quiet hours.
  const now = utc('2026-08-21T15:00:00Z');

  it('fires at the deadline, to the whole group when it is nobody’s', async () => {
    const { prisma } = fakePrisma({ tasks: [row()] });
    const sends = await taskDueKind.due(input(prisma, now));
    // "One of us" is a promise the group made, so the group hears it (ADR-0198 §2).
    expect(sends.map((s) => s.userId).sort()).toEqual(['u-assaf', 'u-noam']);
    expect(sends[0].kind).toBe(NOTIFICATION_KIND.TASK_DUE);
    expect(sends[0].subjectId).toBe('task-1');
  });

  it('aims at the DEADLINE, not at the tick', async () => {
    // This is what makes a moved deadline a new `fireKey` and an edited title the same one.
    const dueAt = new Date(utc('2026-08-21T14:30:00Z'));
    const { prisma } = fakePrisma({ tasks: [row({ dueAt })] });
    const sends = await taskDueKind.due(input(prisma, now));
    expect(sends[0].aimedAtMs).toBe(dueAt.getTime());
  });

  it('goes to the assignee ALONE when there is one', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ assigneeUserId: 'u-noam' })] });
    const sends = await taskDueKind.due(input(prisma, now));
    expect(sends.map((s) => s.userId)).toEqual(['u-noam']);
  });

  it('sends nothing when the assignee is no longer in the trip', async () => {
    // And the group does NOT inherit it: the send is addressed, and there is nobody at the
    // address (ADR-0197 §2.4 — membership is read at send time).
    const { prisma } = fakePrisma({ tasks: [row({ assigneeUserId: 'u-gone' })] });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });

  it('never fires for a dated-NO-TIME task', async () => {
    // "Thursday" is not a moment. This is the digest's job, and it is the pre-trip case
    // rather than an edge one (ADR-0198 §2).
    const { prisma } = fakePrisma({ tasks: [row({ dueHasTime: false })] });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });

  it('never fires for a settled task', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ status: 'done' })] });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });

  it('waits for a deadline in the future, and drops one past its window', async () => {
    const future = fakePrisma({ tasks: [row({ dueAt: new Date(now + HOUR) })] });
    expect(await taskDueKind.due(input(future.prisma, now))).toEqual([]);
    const ancient = fakePrisma({ tasks: [row({ dueAt: new Date(now - 4 * HOUR) })] });
    expect(await taskDueKind.due(input(ancient.prisma, now))).toEqual([]);
  });

  it('says nothing about a trip that has ENDED, and everything about one that has not begun', async () => {
    // The owner's correction of 2026-08-20: pre-trip is where task deadlines actually live.
    const ended = fakePrisma({
      tasks: [row()],
      trips: [{ id: 'trip-1', endDate: new Date(utc('2026-08-01T00:00:00Z')), timezone: 'UTC' }],
    });
    expect(await taskDueKind.due(input(ended.prisma, now))).toEqual([]);

    const notYet = fakePrisma({
      tasks: [row()],
      trips: [{ id: 'trip-1', endDate: new Date(utc('2027-01-01T00:00:00Z')), timezone: 'UTC' }],
    });
    expect(await taskDueKind.due(input(notYet.prisma, now))).toHaveLength(2);
  });

  it('prints the hour in the zone the deadline MEANS, honouring a pin', async () => {
    // ADR-0194: a pinned zone wins over the resolver, so a wall clock somebody typed is the
    // wall clock that gets read out.
    const { prisma } = fakePrisma({ tasks: [row({ displayTimezone: 'Asia/Tokyo' })] });
    const sends = await taskDueKind.due(input(prisma, now));
    // 15:00 UTC is 18:00 in Tel Aviv and 00:00 in Tokyo.
    expect(sends[0].payload.body).toContain('00:00');
  });
});

describe('task.digest', () => {
  /** 05:00 UTC = 08:00 in Tel Aviv — the digest's hour. */
  const at8 = utc('2026-08-21T05:00:00Z');
  const dueToday = new Date(utc('2026-08-21T09:00:00Z'));

  it('fires only at its local hour', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ dueAt: dueToday, dueHasTime: false })] });
    expect(await taskDigestKind.due(input(prisma, at8))).toHaveLength(2);
    const later = fakePrisma({ tasks: [row({ dueAt: dueToday, dueHasTime: false })] });
    expect(await taskDigestKind.due(input(later.prisma, at8 + 2 * HOUR))).toEqual([]);
  });

  it('aims at 08:00 itself, so every minute of the hour is ONE ledger claim', async () => {
    // The defect the phase-B measurement found: the hour gate passes for sixty ticks, and
    // phase A reported `nowMs`, so each of them minted a new `fireKey` and only the 1/day cap
    // stopped sixty digests. Nine ticks spread across the hour, one aimed-at instant.
    const aims = new Set<number>();
    for (const offset of [0, 1, 7, 13, 29, 30, 44, 58, 59]) {
      const { prisma } = fakePrisma({ tasks: [row({ dueAt: dueToday, dueHasTime: false })] });
      const sends = await taskDigestKind.due(input(prisma, at8 + offset * 60_000));
      expect(sends).toHaveLength(2);
      for (const send of sends) aims.add(send.aimedAtMs);
    }
    expect([...aims]).toEqual([at8]);
  });

  it('reads that hour in the traveller’s zone, not the server’s', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ dueAt: dueToday, dueHasTime: false })] });
    // 05:00 UTC is 08:00 in Tel Aviv and 14:00 in Tokyo.
    expect(await taskDigestKind.due(input(prisma, at8, 'Asia/Tokyo'))).toEqual([]);
    expect(DIGEST_HOUR).toBe(8);
  });

  it('counts a dated-no-time task, which is the whole reason it exists', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ dueAt: dueToday, dueHasTime: false })] });
    const sends = await taskDigestKind.due(input(prisma, at8));
    expect(sends[0].payload.body).toContain('צילום דרכונים');
  });

  it('counts overdue as part of today rather than nagging separately', async () => {
    // ADR-0198 rejects the overdue nag by name; the digest is what reports it instead.
    const { prisma } = fakePrisma({
      tasks: [row({ dueAt: new Date(utc('2026-08-10T09:00:00Z')), dueHasTime: false })],
    });
    const sends = await taskDigestKind.due(input(prisma, at8));
    expect(sends).toHaveLength(2);
    expect(sends[0].payload.title).toContain('אחד');
  });

  it('names today AND tomorrow, which is what closes the pre-trip gap', async () => {
    const { prisma } = fakePrisma({
      tasks: [
        row({ id: 'a', dueAt: dueToday, dueHasTime: false }),
        row({
          id: 'b',
          title: 'ביטוח נסיעות',
          dueAt: new Date(utc('2026-08-22T09:00:00Z')),
          dueHasTime: false,
        }),
      ],
    });
    const sends = await taskDigestKind.due(input(prisma, at8));
    expect(sends[0].payload.body).toContain('למחר');
    // Two things, so the count in the title is 2 and not 1.
    expect(sends[0].payload.title).toContain('2');
  });

  it('does NOT fire on tomorrow alone', async () => {
    // Tomorrow is an addition to a message already going out, never a reason to send one.
    const { prisma } = fakePrisma({
      tasks: [row({ dueAt: new Date(utc('2026-08-22T09:00:00Z')), dueHasTime: false })],
    });
    expect(await taskDigestKind.due(input(prisma, at8))).toEqual([]);
  });

  it('is per PERSON: an assigned task is only in its assignee’s digest', async () => {
    const { prisma } = fakePrisma({
      tasks: [row({ dueAt: dueToday, dueHasTime: false, assigneeUserId: 'u-noam' })],
    });
    const sends = await taskDigestKind.due(input(prisma, at8));
    expect(sends.map((s) => s.userId)).toEqual(['u-noam']);
  });

  it('is keyed on the trip, so one morning is one digest however many ticks fall inside it', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ dueAt: dueToday, dueHasTime: false })] });
    const sends = await taskDigestKind.due(input(prisma, at8));
    expect(sends[0].subjectId).toBe('trip-1');
  });
});

describe('task.assigned', () => {
  const now = utc('2026-08-21T15:00:00Z');

  it('fires for a fresh assignment, to the assignee', async () => {
    const { prisma } = fakePrisma({
      tasks: [row({ assigneeUserId: 'u-noam', assignedAt: new Date(now - HOUR) })],
    });
    const sends = await taskAssignedKind.due(input(prisma, now));
    expect(sends.map((s) => s.userId)).toEqual(['u-noam']);
    expect(sends[0].kind).toBe(NOTIFICATION_KIND.TASK_ASSIGNED);
  });

  it('names NOBODY, and still no gendered verb', async () => {
    // Two decisions in one assertion. ADR-0198 §7's table read `דנה הטילה עליך משימה` — a
    // feminine inflection guessed from a name, about a real person, from a field the app does
    // not have; the copy is verb-free instead. And the owner dropped the assigner's name
    // entirely (2026-08-21), so the send names no person at all — the title's `בשבילך` is
    // what keeps it addressed rather than ambient.
    const { prisma } = fakePrisma({
      tasks: [row({ assigneeUserId: 'u-noam', assignedAt: new Date(now - HOUR) })],
    });
    const [send] = await taskAssignedKind.due(input(prisma, now));
    expect(send.payload.body).not.toContain('דנה');
    expect(send.payload.title).toBe('משימה חדשה בשבילך');
    expect(send.payload.title + send.payload.body).not.toMatch(/הטיל/);
  });

  it('opens the task it is about, not the list it sits in', async () => {
    const { prisma } = fakePrisma({
      tasks: [row({ assigneeUserId: 'u-noam', assignedAt: new Date(now - HOUR) })],
    });
    const [send] = await taskAssignedKind.due(input(prisma, now));
    expect(send.payload.url).toContain('task=task-1');
    expect(send.payload.url).toContain('trip=');
  });

  it('says nothing when nobody was assigned', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ assignedAt: new Date(now - HOUR) })] });
    expect(await taskAssignedKind.due(input(prisma, now))).toEqual([]);
  });

  it('says nothing for a task that was never assigned by anyone else', async () => {
    // `assignedAt` is null for a self-assignment and for every task written before the
    // column — and that null is the whole "the actor is not the assignee" rule, applied
    // where the actor was actually known.
    const { prisma } = fakePrisma({ tasks: [row({ assigneeUserId: 'u-noam' })] });
    expect(await taskAssignedKind.due(input(prisma, now))).toEqual([]);
  });

  it('drops an assignment older than its window', async () => {
    const { prisma } = fakePrisma({
      tasks: [row({ assigneeUserId: 'u-noam', assignedAt: new Date(now - 7 * HOUR) })],
    });
    expect(await taskAssignedKind.due(input(prisma, now))).toEqual([]);
  });

  it('carries the deadline when there is one and nothing when there is not', async () => {
    const timed = fakePrisma({
      tasks: [row({ assigneeUserId: 'u-noam', assignedAt: new Date(now - HOUR) })],
    });
    const [withTime] = await taskAssignedKind.due(input(timed.prisma, now));
    expect(withTime.payload.body).toContain('18:00');

    const undated = fakePrisma({
      tasks: [
        row({
          assigneeUserId: 'u-noam',
          assignedAt: new Date(now - HOUR),
          dueAt: null,
          dueHasTime: false,
        }),
      ],
    });
    const [withoutTime] = await taskAssignedKind.due(input(undated.prisma, now));
    expect(withoutTime.payload.body).not.toContain('עד');
  });
});

/**
 * **A CHECKLIST IS FINISHED WHEN ITS STEPS ARE, AND THE PARENT'S ROW NEVER SAYS SO.**
 *
 * The bug this suite exists for, reported from the phone on 2026-09-03: *"sends notifications
 * about tasks that were already completed"*. Ticking a checklist writes the STEPS
 * (`trip-state`'s `tickTask`); the parent's own `status` stays `open` forever, on purpose
 * (ADR-0196 §2 — nothing stored means nothing stale). Every screen resolves it on read, and
 * the sweep did not — so a checklist ticked off in June was still named by the 08:00 digest in
 * September, whose overdue range is deliberately unbounded.
 *
 * The `status: open` case above is what everyone tests and it was never the failure. These are.
 */
describe('a checklist whose steps are all ticked', () => {
  const now = utc('2026-08-21T15:00:00Z');
  const morning = utc('2026-08-21T05:00:00Z'); // 08:00 in Tel Aviv.
  const parent = () => row({ id: 'p-1', title: 'לקחת דברים מדנה לטיול' });

  it.each([
    ['both done', ['done', 'done']],
    ['done and dismissed — settled is settled', ['done', 'dismissed']],
  ])('is silent at its deadline (%s)', async (_label, statuses) => {
    const { prisma } = fakePrisma({
      tasks: [parent(), ...statuses.map((st, i) => step(`s-${i}`, 'p-1', st))],
    });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });

  it('is gone from the morning digest, which is where it nagged every day', async () => {
    const { prisma } = fakePrisma({
      tasks: [parent(), step('s-1', 'p-1', 'done'), step('s-2', 'p-1', 'done')],
    });
    // Nothing today and nothing overdue means no digest at all, so the send list is empty
    // rather than a digest with one fewer line.
    expect(await taskDigestKind.due(input(prisma, morning))).toEqual([]);
  });

  it('still fires while ONE step is open — this is a filter, not a mute', async () => {
    const { prisma } = fakePrisma({
      tasks: [parent(), step('s-1', 'p-1', 'done'), step('s-2', 'p-1', 'open')],
    });
    const sends = await taskDueKind.due(input(prisma, now));
    expect(sends.map((send) => send.subjectId)).toEqual(['p-1', 'p-1']);
  });

  it('leaves a plain task alone: no steps means the row\u2019s own status answers', async () => {
    const { prisma } = fakePrisma({ tasks: [row()] });
    expect((await taskDueKind.due(input(prisma, now))).length).toBe(2);
  });

  it('does not let one trip\u2019s finished checklist silence another task', async () => {
    const { prisma } = fakePrisma({
      tasks: [parent(), step('s-1', 'p-1', 'done'), row({ id: 'plain-1' })],
    });
    const sends = await taskDueKind.due(input(prisma, now));
    expect([...new Set(sends.map((send) => send.subjectId))]).toEqual(['plain-1']);
  });

  // A step is a task row too, and its own assignment is worth announcing (ADR-0196 §8 gives a
  // step an assignee). It has no children, so the derivation hands back its own status —
  // which is the case a filter written as "drop anything with a parent" would have broken.
  it('does not swallow a STEP\u2019s own assignment', async () => {
    const assignedAt = new Date(utc('2026-08-21T14:00:00Z'));
    const { prisma } = fakePrisma({
      tasks: [parent(), { ...step('s-1', 'p-1', 'open'), assigneeUserId: 'u-noam', assignedAt }],
    });
    const sends = await taskAssignedKind.due(input(prisma, now));
    expect(sends.map((send) => send.subjectId)).toEqual(['s-1']);
  });
});

/**
 * **Resilience to edits** — the property ADR-0197 §3 claims and the reason it refused a queue.
 *
 * A delayed job per notification would have to be cancelled and re-armed by every edit path:
 * an LWW patch, a move, a ripple, a delete, a settle, a parent's cascade — and the cascades
 * write no `Change` rows at all (the ADR-0152 §2 / ADR-0157 §3 hole). Deriving instead means
 * **no edit path knows notifications exist**, and these tests are what makes that a fact
 * rather than a claim: each one edits a row and asks the kind again, with nothing in between.
 */
describe('an edit needs no notification code to know about it', () => {
  const now = utc('2026-08-21T15:00:00Z');

  it('follows a deadline that MOVED before it fired', async () => {
    // Out of the window: nothing, at the old instant or any other.
    const moved = new Date(utc('2026-08-21T21:00:00Z'));
    const later = fakePrisma({ tasks: [row({ dueAt: moved })] });
    expect(await taskDueKind.due(input(later.prisma, now))).toEqual([]);

    // And at its new instant it fires, aimed there and not at where it used to be.
    const then = fakePrisma({ tasks: [row({ dueAt: moved })] });
    const sends = await taskDueKind.due(input(then.prisma, moved.getTime()));
    expect(sends[0].aimedAtMs).toBe(moved.getTime());
  });

  it('drops a task the moment it is SETTLED', async () => {
    // `status: open` is the first clause of every phase-A query, so a tick right after a tick
    // is the whole mechanism — no cancellation, no cleanup.
    for (const status of ['done', 'dismissed']) {
      const { prisma } = fakePrisma({ tasks: [row({ status })] });
      expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
      const digest = fakePrisma({ tasks: [row({ status, dueHasTime: false })] });
      expect(await taskDigestKind.due(input(digest.prisma, utc('2026-08-21T05:00:00Z')))).toEqual(
        [],
      );
      const assigned = fakePrisma({
        tasks: [row({ status, assigneeUserId: 'u-noam', assignedAt: new Date(now - HOUR) })],
      });
      expect(await taskAssignedKind.due(input(assigned.prisma, now))).toEqual([]);
    }
  });

  it('says nothing about a task that no longer exists', async () => {
    // Including one destroyed by a CASCADE — a deleted parent takes its steps in one
    // statement and writes no `Change` rows for them. The sweep reads entities, never the
    // change log, so the hole that costs the client an applier costs this nothing.
    const { prisma } = fakePrisma({ tasks: [] });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });

  it('re-points at a new assignee, and stops pointing at the old one', async () => {
    const before = fakePrisma({ tasks: [row({ assigneeUserId: 'u-assaf' })] });
    expect((await taskDueKind.due(input(before.prisma, now))).map((s) => s.userId)).toEqual([
      'u-assaf',
    ]);

    const after = fakePrisma({ tasks: [row({ assigneeUserId: 'u-noam' })] });
    expect((await taskDueKind.due(input(after.prisma, now))).map((s) => s.userId)).toEqual([
      'u-noam',
    ]);
  });

  it('hands a task back to the GROUP when its assignee is cleared', async () => {
    const { prisma } = fakePrisma({ tasks: [row({ assigneeUserId: null })] });
    expect((await taskDueKind.due(input(prisma, now))).map((s) => s.userId).sort()).toEqual([
      'u-assaf',
      'u-noam',
    ]);
  });

  it('retracts a pending assignment announcement when the assignee is cleared', async () => {
    // `assignmentStamp` nulls `assignedAt` on un-assign, so a send that has not gone out
    // simply stops being due — which is the retraction, with nothing to cancel.
    const { prisma } = fakePrisma({
      tasks: [row({ assigneeUserId: null, assignedAt: null })],
    });
    expect(await taskAssignedKind.due(input(prisma, now))).toEqual([]);
  });

  it('re-reads the deadline’s PINNED zone, so a corrected pin corrects the printed hour', async () => {
    // The pin changes what the body says, never when it fires: `dueAt` is the instant and the
    // pin is only how it is read (ADR-0194).
    const jerusalem = fakePrisma({ tasks: [row({ displayTimezone: 'Asia/Jerusalem' })] });
    const a = await taskDueKind.due(input(jerusalem.prisma, now));
    const tokyo = fakePrisma({ tasks: [row({ displayTimezone: 'Asia/Tokyo' })] });
    const b = await taskDueKind.due(input(tokyo.prisma, now));

    expect(a[0].payload.body).toContain('18:00');
    expect(b[0].payload.body).toContain('00:00');
    // Same instant either way — so the ledger key is unchanged and a re-pin cannot re-send.
    expect(a[0].aimedAtMs).toBe(b[0].aimedAtMs);
  });

  it('never fires an edit an offline device replayed too late', async () => {
    // The outbox can land an edit hours after it was made (ADR-0042). `staleAfterMs` is what
    // makes that safe: a deadline replayed further into the past than the window is simply
    // never selected, rather than arriving as a burst.
    const { prisma } = fakePrisma({ tasks: [row({ dueAt: new Date(now - 5 * HOUR) })] });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });

  it('stops when the trip’s dates move so that it has ENDED', async () => {
    // ADR-0040's archive is DERIVED from the live window rather than stored, so shortening a
    // trip's `endDate` archives it and this check is the same one.
    const { prisma } = fakePrisma({
      tasks: [row()],
      trips: [
        {
          id: 'trip-1',
          endDate: new Date(utc('2026-08-19T00:00:00Z')),
          timezone: 'Asia/Jerusalem',
        },
      ],
    });
    expect(await taskDueKind.due(input(prisma, now))).toEqual([]);
  });
});
