import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { EVENTS } from '../fixtures';
import {
  enqueueOutbox,
  flushAllOutbox,
  flushOutbox,
  getOutboxCount,
  initOutboxCount,
  type OutboxOp,
} from './outbox';

// initOutboxCount() re-primes the in-memory count from IndexedDB — tests share
// that module-level counter, so each test starts from a known (0) state.

const TRIP_ID = EVENTS[0].tripId;
const canonicalBody = () => JSON.stringify(EVENTS[0]);

function statusOp(eventId: string): OutboxOp {
  return { verb: 'setStatus', eventId, status: 'done' };
}

beforeEach(async () => {
  await db.outbox.clear();
  await initOutboxCount();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.outbox.clear();
  await initOutboxCount();
});

describe('flushOutbox (FIFO)', () => {
  it('flushes queued mutations in the order they were enqueued', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        seen.push(String(url));
        return Promise.resolve(new Response(canonicalBody(), { status: 200 }));
      }),
    );

    await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-2'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-3'));

    await flushOutbox(TRIP_ID);

    expect(seen).toEqual([
      expect.stringContaining('ev-1'),
      expect.stringContaining('ev-2'),
      expect.stringContaining('ev-3'),
    ]);
    expect(await db.outbox.count()).toBe(0);
  });

  it('halts at the first hard error and leaves it (and everything after it) queued, in order', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        // ev-1 (call 1) succeeds, ev-2 (call 2) hard-fails, ev-3 is never attempted.
        if (call === 2) return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(new Response(canonicalBody(), { status: 200 }));
      }),
    );

    await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-2'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-3'));

    await expect(flushOutbox(TRIP_ID)).rejects.toThrow();
    expect(call).toBe(2); // ev-3 never attempted — no skipping ahead

    const remaining = await db.outbox.where('tripId').equals(TRIP_ID).sortBy('seq');
    expect(remaining.map((e) => (e.op as { eventId: string }).eventId)).toEqual(['ev-2', 'ev-3']);
  });

  it('a retried flush after the error clears resumes from the halted entry', async () => {
    let shouldFail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        shouldFail
          ? Promise.resolve(new Response(null, { status: 500 }))
          : Promise.resolve(new Response(canonicalBody(), { status: 200 })),
      ),
    );

    await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    await expect(flushOutbox(TRIP_ID)).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);

    shouldFail = false;
    await flushOutbox(TRIP_ID);
    expect(await db.outbox.count()).toBe(0);
  });

  it('drops a stale 4xx rejection (e.g. MOVE_INTO_PAST) instead of wedging the queue forever', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        // ev-1 (call 1) is now unrejectably stale (409), ev-2 (call 2) succeeds.
        if (call === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: { code: 'MOVE_INTO_PAST' } }), { status: 409 }),
          );
        }
        return Promise.resolve(new Response(canonicalBody(), { status: 200 }));
      }),
    );

    await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-2'));

    await expect(flushOutbox(TRIP_ID)).resolves.toBeUndefined();
    expect(call).toBe(2); // ev-2 still attempted — ev-1 didn't block the queue
    expect(await db.outbox.count()).toBe(0);
  });

  it('a duplicate create retry is idempotent — the backend returns 200 for an already-applied client id', async () => {
    // ADR-0018: client-generated ids make a re-POST of an already-created event
    // hit a unique-constraint that the backend treats as "already applied"
    // (200 with the existing entity), not an error — so flush just succeeds.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(canonicalBody(), { status: 200 })),
    );
    await enqueueOutbox(TRIP_ID, {
      verb: 'create',
      input: {
        id: EVENTS[0].id,
        date: EVENTS[0].date,
        title: EVENTS[0].title,
        kind: 'soft',
        source: 'manual',
      },
    });

    await expect(flushOutbox(TRIP_ID)).resolves.toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('flushAllOutbox (device-wide)', () => {
  it('flushes queues across multiple trips', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        seen.push(String(url));
        return Promise.resolve(new Response(canonicalBody(), { status: 200 }));
      }),
    );

    await enqueueOutbox('trip-a', statusOp('ev-a'));
    await enqueueOutbox('trip-b', statusOp('ev-b'));
    expect(getOutboxCount()).toBe(2);

    await flushAllOutbox();

    expect(seen).toEqual([expect.stringContaining('ev-a'), expect.stringContaining('ev-b')]);
    expect(await db.outbox.count()).toBe(0);
    expect(getOutboxCount()).toBe(0);
  });

  it("one trip's stuck queue does not block another trip's flush", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('ev-stuck')
          ? Promise.resolve(new Response(null, { status: 500 })) // trip-a halts
          : Promise.resolve(new Response(canonicalBody(), { status: 200 })),
      ),
    );

    await enqueueOutbox('trip-a', statusOp('ev-stuck'));
    await enqueueOutbox('trip-b', statusOp('ev-ok'));

    await expect(flushAllOutbox()).resolves.toBeUndefined();

    // trip-a's entry survives (5xx halt), trip-b's drained.
    const remaining = await db.outbox.toArray();
    expect(remaining.map((e) => e.tripId)).toEqual(['trip-a']);
  });
});

describe('outbox pending count', () => {
  it('tracks enqueue/flush and can be primed from IndexedDB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(canonicalBody(), { status: 200 }))),
    );
    await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-2'));
    expect(getOutboxCount()).toBe(2);

    await initOutboxCount();
    expect(getOutboxCount()).toBe(2);

    await flushOutbox(TRIP_ID);
    expect(getOutboxCount()).toBe(0);
  });
});
