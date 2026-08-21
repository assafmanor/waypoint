import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KIND, type PushPayload } from '@waypoint/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationDispatcher } from './notification-dispatcher';
import type { DueSend, NotificationKind } from './notification-kind';

// **The registry is mocked so this spec can register kinds.** Production ships it empty
// (phase 3's whole point), and a spec that could only observe the empty case would be
// asserting that nothing happens — which is true and useless. Mutating the array through the
// mock lets one file cover both the no-kinds short circuit and every policy branch.
// `vi.hoisted`, because `vi.mock`'s factory is hoisted above every top-level `const` — a
// plain `const kinds = []` referenced in the factory throws "Cannot access 'kinds' before
// initialization", which is what the first version of this file did.
const hoisted = vi.hoisted(() => ({ kinds: [] as unknown[] }));
const kinds = hoisted.kinds as NotificationKind[];
vi.mock('./notification-kind', () => ({ NOTIFICATION_KINDS: hoisted.kinds }));

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
  return { id: NOTIFICATION_KIND.TEST, timeCritical: false, staleAfterMs: 3 * HOUR, ...over };
}

/** A Prisma stand-in over the five calls the sweep makes. `ledger` is the stored rows, so a
 *  test can seed "already sent" and a unique violation is modelled rather than mocked. */
function fakePrisma(
  options: {
    trips?: { id: string; timezone: string }[];
    ledger?: { userId: string; kind: string; subjectId: string; fireKey: string; sentAt: Date }[];
  } = {},
) {
  const trips = options.trips ?? [{ id: 'trip-1', timezone: 'Asia/Jerusalem' }];
  const ledger = options.ledger ?? [];
  const calls: string[] = [];
  const prisma = {
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
