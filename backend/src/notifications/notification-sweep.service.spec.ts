import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KIND, type PushPayload } from '@waypoint/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationDispatcher } from './notification-dispatcher';
import { DEDUP, type DueSend, type NotificationKind } from './notification-kind';

// **The registry is mocked so this spec can register kinds.** Production ships it empty
// (phase 3's whole point), and a spec that could only observe the empty case would be
// asserting that nothing happens — which is true and useless. Mutating the array through the
// mock lets one file cover both the no-kinds short circuit and every policy branch.
// `vi.hoisted`, because `vi.mock`'s factory is hoisted above every top-level `const` — a
// plain `const kinds = []` referenced in the factory throws "Cannot access 'kinds' before
// initialization", which is what the first version of this file did.
const hoisted = vi.hoisted(() => ({ kinds: [] as unknown[] }));
const kinds = hoisted.kinds as NotificationKind[];
vi.mock('./notification-registry', () => ({ NOTIFICATION_KINDS: hoisted.kinds }));

// A static import, not `await import`: vitest hoists `vi.mock` above the imports so the mock
// is in place either way, and this backend emits CommonJS, where top-level `await` is a type
// error (TS1309). The dynamic form ran fine under vitest and failed `pnpm typecheck` — which
// is the sort of divergence the second typecheck pass exists to catch.
import { NotificationSweepService } from './notification-sweep.service';

const HOUR = 60 * 60 * 1000;
const utc = (iso: string) => Date.parse(iso);
/** 12:00 in Tel Aviv — comfortably outside quiet hours, so a test that is not about quiet
 *  hours never has to think about them. */
const NOON = utc('2026-08-21T09:00:00Z');

const PAYLOAD: PushPayload = {
  kind: NOTIFICATION_KIND.TEST,
  title: 't',
  body: 'b',
  url: '/',
};

function send(over: Partial<DueSend> = {}): DueSend {
  return {
    userId: 'u1',
    tripId: 'trip-1',
    kind: 'task.due',
    subjectId: 'task-1',
    aimedAtMs: NOON,
    payload: PAYLOAD,
    ...over,
  } as DueSend;
}

function kind(
  over: Partial<NotificationKind> & { due: NotificationKind['due'] },
): NotificationKind {
  return {
    id: NOTIFICATION_KIND.TEST,
    timeCritical: false,
    staleAfterMs: 3 * HOUR,
    dedup: DEDUP.BY_INSTANT,
    // `null` by default, so a test that is not about the preference does not have to seed a
    // user row to get a send through.
    pref: null,
    ...over,
  };
}

/** A Prisma stand-in over the calls the sweep makes. `ledger` is the stored rows, so a
 *  test can seed "already sent" and a unique violation is modelled rather than mocked. */
function fakePrisma(
  options: {
    trips?: { id: string; timezone: string }[];
    ledger?: { userId: string; kind: string; subjectId: string; fireKey: string; sentAt: Date }[];
    /** Recipients' category switches. Absent means "no row", which the sweep must read as
     *  opted OUT — the only way to be absent is to have been deleted mid-tick. */
    users?: { id: string; notifyTasks: boolean }[];
  } = {},
) {
  const trips = options.trips ?? [{ id: 'trip-1', timezone: 'Asia/Jerusalem' }];
  const ledger = options.ledger ?? [];
  const users = options.users ?? [{ id: 'u1', notifyTasks: true }];
  const calls: string[] = [];
  const prisma = {
    user: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) => {
        calls.push('prefs');
        return Promise.resolve(users.filter((u) => where.id.in.includes(u.id)));
      },
    },
    trip: {
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        calls.push(`zones:${where.id}`);
        const trip = trips.find((t) => t.id === where.id) ?? trips[0];
        return Promise.resolve({ timezone: trip.timezone });
      },
    },
    event: { findMany: () => Promise.resolve([]) },
    booking: { findMany: () => Promise.resolve([]) },
    place: { findMany: () => Promise.resolve([]) },
    notificationSend: {
      groupBy: ({ where }: { where: { userId: { in: string[] }; sentAt: { gte: Date } } }) => {
        calls.push('groupBy');
        // Mirrors the real grouped query: rows for these users inside the rolling window,
        // counted per (userId, kind). One call per tick, which is the point of it.
        const since = where.sentAt.gte.getTime();
        const buckets = new Map<string, number>();
        for (const row of ledger) {
          if (!where.userId.in.includes(row.userId)) continue;
          if (row.sentAt.getTime() < since) continue;
          const key = `${row.userId}\u0000${row.kind}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        return Promise.resolve(
          [...buckets].map(([key, count]) => {
            const [userId, kind] = key.split('\u0000');
            return { userId, kind, _count: { _all: count } };
          }),
        );
      },
      deleteMany: ({ where }: { where: { kind: { in: string[] }; sentAt: { lt: Date } } }) => {
        calls.push('deleteMany');
        // Mirrors the real clause pair: BOTH must match, so a prune that dropped the `kind`
        // filter would delete a by-subject row here and fail the test that forbids it.
        const kept = ledger.filter(
          (row) =>
            !(where.kind.in.includes(row.kind) && row.sentAt.getTime() < where.sentAt.lt.getTime()),
        );
        const count = ledger.length - kept.length;
        ledger.splice(0, ledger.length, ...kept);
        return Promise.resolve({ count });
      },
      create: ({
        data,
      }: {
        data: { userId: string; kind: string; subjectId: string; fireKey: string };
      }) => {
        calls.push('create');
        const clash = ledger.some(
          (r) =>
            r.userId === data.userId &&
            r.kind === data.kind &&
            r.subjectId === data.subjectId &&
            r.fireKey === data.fireKey,
        );
        // The real unique index rejects; that rejection IS the exactly-once mechanism, so the
        // fake has to model it rather than silently accept a duplicate.
        if (clash) return Promise.reject(new Error('Unique constraint failed'));
        ledger.push({ ...data, sentAt: new Date() });
        return Promise.resolve(data);
      },
    },
  } as unknown as PrismaService;
  return { prisma, ledger, calls };
}

class RecordingDispatcher implements NotificationDispatcher {
  readonly batches: DueSend[][] = [];
  dispatch(due: readonly DueSend[]): Promise<void> {
    this.batches.push([...due]);
    return Promise.resolve();
  }
}

function makeSweep(prisma: PrismaService) {
  const dispatcher = new RecordingDispatcher();
  return { sweep: new NotificationSweepService(prisma, dispatcher), dispatcher };
}

beforeEach(() => {
  kinds.length = 0;
});

describe('the no-kinds short circuit — what phase 3 actually ships', () => {
  it('does nothing, and touches no table', async () => {
    const { prisma, calls } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    expect(report).toEqual({
      candidates: 0,
      claimed: 0,
      droppedStale: 0,
      deferredQuiet: 0,
      droppedCapped: 0,
      droppedPref: 0,
      alreadySent: 0,
    });
    // The assertion that makes phase 3 free rather than merely quiet: not one query.
    expect(calls).toEqual([]);
    expect(dispatcher.batches).toEqual([]);
  });
});

describe('a due candidate', () => {
  it('is claimed in the ledger and dispatched', async () => {
    kinds.push(kind({ due: () => Promise.resolve([send()]) }));
    const { prisma, ledger } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    expect(report.claimed).toBe(1);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].fireKey).toBe('2026-08-21T09:00');
    expect(dispatcher.batches).toHaveLength(1);
    expect(dispatcher.batches[0]).toHaveLength(1);
  });

  it('dispatches ONCE with the whole tick’s batch, not per candidate', async () => {
    // The dispatcher is the seam a queue replaces (ADR-0197 §3.1), so it must see the unit a
    // QueueDispatcher would enqueue.
    kinds.push(
      kind({ due: () => Promise.resolve([send({ subjectId: 'a' }), send({ subjectId: 'b' })]) }),
      kind({ due: () => Promise.resolve([send({ subjectId: 'c' })]) }),
    );
    const { prisma } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);

    await sweep.sweep(NOON);

    expect(dispatcher.batches).toHaveLength(1);
    expect(dispatcher.batches[0].map((s) => s.subjectId)).toEqual(['a', 'b', 'c']);
  });

  it('claims everything BEFORE dispatching any of it', async () => {
    // So a crash mid-dispatch loses deliveries rather than double-sending them. Asserted as
    // the ORDER of the two side effects, which is the only way to see it.
    const order: string[] = [];
    kinds.push(
      kind({ due: () => Promise.resolve([send({ subjectId: 'a' }), send({ subjectId: 'b' })]) }),
    );
    const prisma = {
      user: { findMany: () => Promise.resolve([{ id: 'u1', notifyTasks: true }]) },
      trip: { findUniqueOrThrow: () => Promise.resolve({ timezone: 'Asia/Jerusalem' }) },
      event: { findMany: () => Promise.resolve([]) },
      booking: { findMany: () => Promise.resolve([]) },
      place: { findMany: () => Promise.resolve([]) },
      notificationSend: {
        groupBy: () => Promise.resolve([]),
        create: () => {
          order.push('claim');
          return Promise.resolve({});
        },
      },
    } as unknown as PrismaService;
    const dispatcher: NotificationDispatcher = {
      dispatch: () => {
        order.push('dispatch');
        return Promise.resolve();
      },
    };

    await new NotificationSweepService(prisma, dispatcher).sweep(NOON);

    expect(order).toEqual(['claim', 'claim', 'dispatch']);
  });
});

describe('the category preference (ADR-0198 §6)', () => {
  it('drops a send whose recipient has that switch off', async () => {
    kinds.push(kind({ pref: 'notifyTasks', due: () => Promise.resolve([send()]) }));
    const { prisma, ledger } = fakePrisma({ users: [{ id: 'u1', notifyTasks: false }] });
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    expect(report.droppedPref).toBe(1);
    expect(report.claimed).toBe(0);
    // Nothing is written either, so switching the preference back on re-arms the send rather
    // than leaving a ledger row that swallows it.
    expect(ledger).toHaveLength(0);
    expect(dispatcher.batches).toEqual([]);
  });

  it('lets it through when the switch is on', async () => {
    kinds.push(kind({ pref: 'notifyTasks', due: () => Promise.resolve([send()]) }));
    const { prisma } = fakePrisma({ users: [{ id: 'u1', notifyTasks: true }] });
    const { sweep } = makeSweep(prisma);

    expect((await sweep.sweep(NOON)).claimed).toBe(1);
  });

  it('treats a MISSING user row as opted out, never as opted in', async () => {
    // The only way to be absent is to have been deleted between a kind's query and this
    // one, and the failure direction there must be silence.
    kinds.push(kind({ pref: 'notifyTasks', due: () => Promise.resolve([send()]) }));
    const { prisma } = fakePrisma({ users: [] });
    const { sweep } = makeSweep(prisma);

    expect((await sweep.sweep(NOON)).droppedPref).toBe(1);
  });

  it('never asks about a kind that declares no preference', async () => {
    // `pref: null` is a kind nobody can decline, and it must not need a user row to fire.
    kinds.push(kind({ pref: null, due: () => Promise.resolve([send()]) }));
    const { prisma } = fakePrisma({ users: [] });
    const { sweep } = makeSweep(prisma);

    expect((await sweep.sweep(NOON)).claimed).toBe(1);
  });
});

describe('dedup BY_SUBJECT (ADR-0198’s "does not multiply")', () => {
  it('writes ONE ledger row per (recipient, subject) however the instant moves', async () => {
    // Two ticks, two different aimed-at instants, one send. With the default dedup this
    // would be two — which is the A→B→A→B hand-off multiplying.
    kinds.push(
      kind({
        dedup: DEDUP.BY_SUBJECT,
        staleAfterMs: 24 * HOUR,
        due: () => Promise.resolve([send({ aimedAtMs: NOON })]),
      }),
    );
    const { prisma, ledger } = fakePrisma();
    const { sweep } = makeSweep(prisma);

    expect((await sweep.sweep(NOON)).claimed).toBe(1);
    kinds.length = 0;
    kinds.push(
      kind({
        dedup: DEDUP.BY_SUBJECT,
        staleAfterMs: 24 * HOUR,
        due: () => Promise.resolve([send({ aimedAtMs: NOON + HOUR })]),
      }),
    );
    const second = await sweep.sweep(NOON + HOUR);

    expect(second.alreadySent).toBe(1);
    expect(ledger).toHaveLength(1);
  });

  it('still separates two subjects, and two recipients', async () => {
    kinds.push(
      kind({
        dedup: DEDUP.BY_SUBJECT,
        due: () =>
          Promise.resolve([
            send({ subjectId: 'a' }),
            send({ subjectId: 'b' }),
            send({ subjectId: 'a', userId: 'u2' }),
          ]),
      }),
    );
    const { prisma, ledger } = fakePrisma({
      users: [
        { id: 'u1', notifyTasks: true },
        { id: 'u2', notifyTasks: true },
      ],
    });
    const { sweep } = makeSweep(prisma);

    expect((await sweep.sweep(NOON)).claimed).toBe(3);
    expect(ledger).toHaveLength(3);
  });
});

/**
 * **What an edit actually SENDS** — the other half of ADR-0197 §3's claim.
 *
 * The kinds' own spec proves an edited row is re-read. These prove the ledger draws the right
 * line through the result: a moved deadline is a different obligation and re-arms, an edited
 * title is the same one and does not. Both fall out of `fireKey` being derived from the
 * aimed-at instant, so no edit path has to know.
 */
describe('the ledger’s retention, and the rows it must never touch', () => {
  const DAY = 24 * HOUR;

  it('forgets dedup-by-INSTANT rows past retention', async () => {
    kinds.push(
      kind({ id: NOTIFICATION_KIND.TEST, dedup: DEDUP.BY_INSTANT, due: () => Promise.resolve([]) }),
    );
    const old = {
      userId: 'u1',
      kind: NOTIFICATION_KIND.TEST,
      subjectId: 's',
      fireKey: 'k',
      sentAt: new Date(NOON - 40 * DAY),
    };
    const { prisma, ledger } = fakePrisma({ ledger: [old] });
    const { sweep } = makeSweep(prisma);

    expect(await sweep.pruneLedger(NOON)).toBe(1);
    expect(ledger).toHaveLength(0);
  });

  it('keeps one still inside it', async () => {
    kinds.push(
      kind({ id: NOTIFICATION_KIND.TEST, dedup: DEDUP.BY_INSTANT, due: () => Promise.resolve([]) }),
    );
    const recent = {
      userId: 'u1',
      kind: NOTIFICATION_KIND.TEST,
      subjectId: 's',
      fireKey: 'k',
      sentAt: new Date(NOON - 2 * DAY),
    };
    const { prisma, ledger } = fakePrisma({ ledger: [recent] });
    const { sweep } = makeSweep(prisma);

    expect(await sweep.pruneLedger(NOON)).toBe(0);
    expect(ledger).toHaveLength(1);
  });

  it('NEVER forgets a dedup-by-SUBJECT row, however old', async () => {
    // This is the load-bearing one. Such a row is the permanent answer to "has this person
    // already been told about this task" — prune it and every assignment announcement in the
    // app fires again. Getting the split the other way round is a bug that would look like a
    // feature working.
    kinds.push(
      kind({ id: NOTIFICATION_KIND.TEST, dedup: DEDUP.BY_SUBJECT, due: () => Promise.resolve([]) }),
    );
    const ancient = {
      userId: 'u1',
      kind: NOTIFICATION_KIND.TEST,
      subjectId: 's',
      fireKey: 'once',
      sentAt: new Date(NOON - 400 * DAY),
    };
    const { prisma, ledger } = fakePrisma({ ledger: [ancient] });
    const { sweep } = makeSweep(prisma);

    expect(await sweep.pruneLedger(NOON)).toBe(0);
    expect(ledger).toHaveLength(1);
  });

  it('touches nothing at all with no kinds registered', async () => {
    const { prisma, ledger } = fakePrisma({
      ledger: [
        {
          userId: 'u1',
          kind: 'gone.kind',
          subjectId: 's',
          fireKey: 'k',
          sentAt: new Date(NOON - 400 * DAY),
        },
      ],
    });
    const { sweep } = makeSweep(prisma);
    expect(await sweep.pruneLedger(NOON)).toBe(0);
    // A row whose kind is no longer registered is left alone rather than guessed about.
    expect(ledger).toHaveLength(1);
  });
});

describe('an edit re-arms or it does not, and the ledger decides which', () => {
  const HALF_HOUR = HOUR / 2;

  it('RE-ARMS a deadline that moved, because that is a different instant', async () => {
    kinds.push(kind({ staleAfterMs: 6 * HOUR, due: () => Promise.resolve([send()]) }));
    const { prisma, ledger } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);
    expect((await sweep.sweep(NOON)).claimed).toBe(1);

    // The same task, its deadline moved two hours on.
    kinds.length = 0;
    kinds.push(
      kind({
        staleAfterMs: 6 * HOUR,
        due: () => Promise.resolve([send({ aimedAtMs: NOON + 2 * HOUR })]),
      }),
    );
    const second = await sweep.sweep(NOON + 2 * HOUR);

    expect(second.claimed).toBe(1);
    expect(second.alreadySent).toBe(0);
    expect(ledger).toHaveLength(2);
    expect(dispatcher.batches).toHaveLength(2);
  });

  it('does NOT re-send when only the words changed', async () => {
    // An edited title, a new assignee's name, a corrected zone pin: none of them move the
    // aimed-at instant, so none of them can re-send.
    kinds.push(kind({ staleAfterMs: 6 * HOUR, due: () => Promise.resolve([send()]) }));
    const { prisma, ledger } = fakePrisma();
    const { sweep } = makeSweep(prisma);
    await sweep.sweep(NOON);

    kinds.length = 0;
    kinds.push(
      kind({
        staleAfterMs: 6 * HOUR,
        due: () =>
          Promise.resolve([send({ payload: { ...PAYLOAD, title: 'a different title entirely' } })]),
      }),
    );
    const second = await sweep.sweep(NOON + HALF_HOUR);

    expect(second.alreadySent).toBe(1);
    expect(second.claimed).toBe(0);
    expect(ledger).toHaveLength(1);
  });

  it('does not re-send for a move inside the same MINUTE', async () => {
    // The bucket is the tick's interval; finer than that is a distinction a 60-second sweep
    // cannot make and a person would not notice.
    kinds.push(kind({ due: () => Promise.resolve([send({ aimedAtMs: NOON })]) }));
    const { prisma } = fakePrisma();
    const { sweep } = makeSweep(prisma);
    await sweep.sweep(NOON);

    kinds.length = 0;
    kinds.push(kind({ due: () => Promise.resolve([send({ aimedAtMs: NOON + 30_000 })]) }));
    expect((await sweep.sweep(NOON + 30_000)).alreadySent).toBe(1);
  });

  it('re-arms per RECIPIENT, so a re-assigned task reaches its new owner', async () => {
    // The old assignee heard about it and is not told twice; the new one has their own row.
    kinds.push(kind({ due: () => Promise.resolve([send({ userId: 'u1' })]) }));
    const { prisma, ledger } = fakePrisma({
      users: [
        { id: 'u1', notifyTasks: true },
        { id: 'u2', notifyTasks: true },
      ],
    });
    const { sweep } = makeSweep(prisma);
    await sweep.sweep(NOON);

    kinds.length = 0;
    kinds.push(kind({ due: () => Promise.resolve([send({ userId: 'u2' })]) }));
    expect((await sweep.sweep(NOON)).claimed).toBe(1);
    expect(ledger.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
  });
});

describe('the exactly-once mechanism', () => {
  it('does not re-send what the ledger already holds', async () => {
    kinds.push(kind({ due: () => Promise.resolve([send()]) }));
    const { prisma, ledger } = fakePrisma({
      ledger: [
        {
          userId: 'u1',
          kind: 'task.due',
          subjectId: 'task-1',
          fireKey: '2026-08-21T09:00',
          sentAt: new Date(NOON - HOUR),
        },
      ],
    });
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    expect(report.alreadySent).toBe(1);
    expect(report.claimed).toBe(0);
    expect(ledger).toHaveLength(1);
    expect(dispatcher.batches).toEqual([]);
  });

  it('re-arms when the deadline MOVED, because the key is the aimed-at instant', async () => {
    // The property the dedup design rests on: 09:00 was sent, 11:00 is a different send.
    kinds.push(
      kind({ due: () => Promise.resolve([send({ aimedAtMs: utc('2026-08-21T11:00:00Z') })]) }),
    );
    const { prisma } = fakePrisma({
      ledger: [
        {
          userId: 'u1',
          kind: 'task.due',
          subjectId: 'task-1',
          fireKey: '2026-08-21T09:00',
          sentAt: new Date(NOON - HOUR),
        },
      ],
    });
    const { sweep } = makeSweep(prisma);

    const report = await sweep.sweep(utc('2026-08-21T11:00:00Z'));

    expect(report.claimed).toBe(1);
    expect(report.alreadySent).toBe(0);
  });
});

describe('the policies', () => {
  it('DROPS a candidate whose tick was missed — no burst after a redeploy', async () => {
    kinds.push(
      kind({
        staleAfterMs: HOUR,
        due: () => Promise.resolve([send({ aimedAtMs: NOON - 4 * HOUR })]),
      }),
    );
    const { prisma, ledger } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    expect(report.droppedStale).toBe(1);
    expect(ledger).toEqual([]);
    expect(dispatcher.batches).toEqual([]);
  });

  it('DEFERS inside quiet hours, writing nothing at all', async () => {
    // 00:00 UTC = 03:00 Tel Aviv. Nothing is stored, so the next tick after 07:00 re-derives
    // it with the same fireKey and it arrives exactly once.
    const night = utc('2026-08-21T00:00:00Z');
    kinds.push(kind({ due: () => Promise.resolve([send({ aimedAtMs: night })]) }));
    const { prisma, ledger } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(night);

    expect(report.deferredQuiet).toBe(1);
    expect(ledger).toEqual([]);
    expect(dispatcher.batches).toEqual([]);
  });

  it('lets a timeCritical send through quiet hours — the 05:30 flight', async () => {
    const night = utc('2026-08-21T01:00:00Z');
    kinds.push(
      kind({ timeCritical: true, due: () => Promise.resolve([send({ aimedAtMs: night })]) }),
    );
    const { prisma } = fakePrisma();
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(night);

    expect(report.claimed).toBe(1);
    expect(dispatcher.batches[0]).toHaveLength(1);
  });

  it('DROPS a nudge once its daily budget is spent', async () => {
    kinds.push(kind({ due: () => Promise.resolve([send({ kind: 'readiness.nudge' as never })]) }));
    const { prisma } = fakePrisma({
      ledger: [
        {
          userId: 'u1',
          kind: 'readiness.nudge',
          subjectId: 'other',
          fireKey: 'x',
          sentAt: new Date(NOON - HOUR),
        },
      ],
    });
    const { sweep, dispatcher } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    // The nudge cap is 1 and one was already sent within the window.
    expect(report.droppedCapped).toBe(1);
    expect(dispatcher.batches).toEqual([]);
  });

  it('does not charge a timeCritical send against the cap', async () => {
    kinds.push(
      kind({
        timeCritical: true,
        due: () => Promise.resolve([send({ kind: 'event.hard.soon' as never })]),
      }),
    );
    const { prisma } = fakePrisma({
      ledger: Array.from({ length: 20 }, (_, i) => ({
        userId: 'u1',
        kind: 'event.hard.soon',
        subjectId: `s${i}`,
        fireKey: `k${i}`,
        sentAt: new Date(NOON - HOUR),
      })),
    });
    const { sweep } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    expect(report.droppedCapped).toBe(0);
    expect(report.claimed).toBe(1);
  });
});

describe('the inverted loop', () => {
  it('resolves zones ONLY for trips a kind returned, and once each', async () => {
    // The whole saving. The per-trip version loaded three tables for every live trip every
    // minute; this loads them for the trips that actually have something due, once per tick
    // however many candidates share them.
    kinds.push(
      kind({
        due: () =>
          Promise.resolve([
            send({ tripId: 'trip-1', subjectId: 'a' }),
            send({ tripId: 'trip-1', subjectId: 'b' }),
            send({ tripId: 'trip-2', subjectId: 'c' }),
          ]),
      }),
    );
    const { prisma, calls } = fakePrisma({
      trips: [
        { id: 'trip-1', timezone: 'Asia/Jerusalem' },
        { id: 'trip-2', timezone: 'Asia/Jerusalem' },
        // A third live trip with nothing due. It must never be touched.
        { id: 'trip-3', timezone: 'Asia/Jerusalem' },
      ],
    });
    const { sweep } = makeSweep(prisma);

    await sweep.sweep(NOON);

    const zoneLoads = calls.filter((c) => c.startsWith('zones:'));
    expect(zoneLoads).toEqual(['zones:trip-1', 'zones:trip-2']);
    expect(zoneLoads).not.toContain('zones:trip-3');
  });

  it('counts the daily caps in ONE grouped query, not one per candidate', async () => {
    // The N+1 that got worse exactly when the cap mattered most: the busiest recipient
    // generated the most counts.
    kinds.push(
      kind({
        due: () =>
          Promise.resolve([
            send({ subjectId: 'a' }),
            send({ subjectId: 'b' }),
            send({ subjectId: 'c' }),
            send({ userId: 'u2', subjectId: 'd' }),
          ]),
      }),
    );
    const { prisma, calls } = fakePrisma();
    const { sweep } = makeSweep(prisma);

    await sweep.sweep(NOON);

    expect(calls.filter((c) => c === 'groupBy')).toHaveLength(1);
  });

  it('does not let one tick spend the same allowance twice', async () => {
    // The grouped count is a snapshot from before any claim, so the sweep also decrements
    // in memory — otherwise four nudges in one tick would all see "0 spent" and all go.
    kinds.push(
      kind({
        due: () =>
          Promise.resolve([
            send({ kind: 'readiness.nudge' as never, subjectId: 'a' }),
            send({ kind: 'readiness.nudge' as never, subjectId: 'b' }),
          ]),
      }),
    );
    const { prisma } = fakePrisma();
    const { sweep } = makeSweep(prisma);

    const report = await sweep.sweep(NOON);

    // The nudge cap is 1: the first is claimed, the second is capped.
    expect(report.claimed).toBe(1);
    expect(report.droppedCapped).toBe(1);
  });
});
