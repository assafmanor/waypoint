import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { EVENTS } from '../fixtures';
import {
  clearSyncFailures,
  dismissSyncFailure,
  enqueueOutbox,
  flushAllOutbox,
  flushOutbox,
  getOutboxCount,
  getPendingChangeCount,
  getSyncFailures,
  getSyncStatus,
  initOutboxCount,
  outboxOpEntityId,
  outboxOpEntityIds,
  retrySyncFailure,
  withChangeGroup,
  type OutboxOp,
} from './outbox';

const bookingOp = (id: string): OutboxOp =>
  ({ verb: 'createBooking', input: { id, type: 'restaurant', title: 'מסעדה' } }) as OutboxOp;

// A timed booking: its `event` seed carries the linked event's id (ADR-0093).
const bookingWithEventOp = (id: string, eventId: string): OutboxOp =>
  ({
    verb: 'createBooking',
    input: { id, type: 'restaurant', title: 'מסעדה', event: { id: eventId, date: '2026-07-05' } },
  }) as OutboxOp;

const placeOp = (id: string): OutboxOp =>
  ({ verb: 'createPlace', input: { id, name: 'מקום' } }) as OutboxOp;

const reject400 = (code: string) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { code } }), { status: 400 })));

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

  it('records a non-allowlisted 4xx as a sync failure, drops the entry, and continues to the next', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        // ev-1's booking create (call 1) is rejected by a validation rule (400),
        // ev-2 (call 2) succeeds.
        if (call === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: { code: 'BOOKING_INVALID' } }), { status: 400 }),
          );
        }
        return Promise.resolve(new Response(canonicalBody(), { status: 200 }));
      }),
    );

    clearSyncFailures();
    await enqueueOutbox(TRIP_ID, {
      verb: 'createBooking',
      input: { id: 'bk-1', type: 'restaurant', title: 'מסעדה' },
    } as OutboxOp);
    await enqueueOutbox(TRIP_ID, statusOp('ev-2'));

    await expect(flushOutbox(TRIP_ID)).resolves.toBeUndefined();
    expect(call).toBe(2); // ev-2 still attempted — the failed create didn't block it
    expect(await db.outbox.count()).toBe(0); // both entries removed

    const failures = getSyncFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      tripId: TRIP_ID,
      verb: 'createBooking',
      code: 'BOOKING_INVALID',
    });
  });

  it('drops a MOVE_INTO_PAST 4xx quietly, recording no sync failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'MOVE_INTO_PAST' } }), { status: 409 }),
        ),
      ),
    );

    clearSyncFailures();
    await enqueueOutbox(TRIP_ID, {
      verb: 'move',
      eventId: 'ev-1',
      input: { minutes: 30 },
      confirm: false,
    } as OutboxOp);

    await expect(flushOutbox(TRIP_ID)).resolves.toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
    expect(getSyncFailures()).toHaveLength(0);
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

describe('per-entity sync status (U-04, ADR-0080)', () => {
  it('maps each op family to its target entity id', () => {
    expect(outboxOpEntityId(bookingOp('bk'))).toBe('bk');
    expect(outboxOpEntityId({ verb: 'delete', eventId: 'ev', confirm: false })).toBe('ev');
    expect(
      outboxOpEntityId({ verb: 'updateBooking', bookingId: 'bk2', input: {} } as OutboxOp),
    ).toBe('bk2');
    expect(
      outboxOpEntityId({ verb: 'createPlace', input: { id: 'pl', name: 'x' } } as OutboxOp),
    ).toBe('pl');
    // Trip-level ops have no row-level entity → '' (surfaced in the sheet by verb).
    expect(outboxOpEntityId({ verb: 'updateTrip', input: {} } as OutboxOp)).toBe('');
  });

  it('reports pending for an entity with a queued op, synced otherwise', async () => {
    expect(getSyncStatus('bk-none')).toEqual({ state: 'synced' });
    await enqueueOutbox(TRIP_ID, bookingOp('bk-pending'));
    expect(getSyncStatus('bk-pending')).toEqual({ state: 'pending' });
    expect(getSyncStatus('bk-none')).toEqual({ state: 'synced' });
  });

  it('outboxOpEntityIds includes a booking write’s linked-event side effect (ADR-0093)', () => {
    expect(outboxOpEntityIds(bookingWithEventOp('bk', 'ev')).sort()).toEqual(['bk', 'ev']);
    // No seed → just the primary; and an op with no side effects is unchanged.
    expect(outboxOpEntityIds(bookingOp('bk'))).toEqual(['bk']);
  });

  it('marks a booking-seeded event pending too, so it shows the badge (not just the booking)', async () => {
    await enqueueOutbox(TRIP_ID, bookingWithEventOp('bk-timed', 'ev-seeded'));
    expect(getSyncStatus('bk-timed')).toEqual({ state: 'pending' });
    expect(getSyncStatus('ev-seeded')).toEqual({ state: 'pending' });
  });

  it('a re-prime from IndexedDB keeps the seeded event in the pending index', async () => {
    await enqueueOutbox(TRIP_ID, bookingWithEventOp('bk-timed', 'ev-seeded'));
    await initOutboxCount();
    expect(getSyncStatus('ev-seeded')).toEqual({ state: 'pending' });
  });

  it('a failed booking write marks its linked event failed too', async () => {
    vi.stubGlobal('fetch', reject400('BOOKING_INVALID'));
    await enqueueOutbox(TRIP_ID, bookingWithEventOp('bk-fail', 'ev-fail'));
    await flushOutbox(TRIP_ID);
    expect(getSyncStatus('bk-fail')).toEqual({ state: 'failed', reason: 'BOOKING_INVALID' });
    expect(getSyncStatus('ev-fail')).toEqual({ state: 'failed', reason: 'BOOKING_INVALID' });
  });

  it('reports failed + reason after a non-allowlisted 4xx, keyed by entity id', async () => {
    vi.stubGlobal('fetch', reject400('BOOKING_INVALID'));
    await enqueueOutbox(TRIP_ID, bookingOp('bk-fail'));
    await flushOutbox(TRIP_ID);
    expect(getSyncStatus('bk-fail')).toEqual({ state: 'failed', reason: 'BOOKING_INVALID' });
  });

  it('failed outranks a still-pending op on the same entity', async () => {
    vi.stubGlobal('fetch', reject400('BOOKING_INVALID'));
    await enqueueOutbox(TRIP_ID, bookingOp('bk-x'));
    await flushOutbox(TRIP_ID); // records the failure, drops the entry
    vi.stubGlobal('navigator', { onLine: false }); // queue a follow-up offline
    await enqueueOutbox(TRIP_ID, bookingOp('bk-x'));
    expect(getSyncStatus('bk-x').state).toBe('failed');
  });

  it('retrySyncFailure re-enqueues the failed op and clears its failure record', async () => {
    vi.stubGlobal('fetch', reject400('BOOKING_INVALID'));
    await enqueueOutbox(TRIP_ID, bookingOp('bk-retry'));
    await flushOutbox(TRIP_ID);
    expect(await db.outbox.count()).toBe(0);
    const [failure] = getSyncFailures();
    expect(failure.entityId).toBe('bk-retry');

    // Retry offline so the re-enqueued op stays put (no immediate flush).
    vi.stubGlobal('navigator', { onLine: false });
    await retrySyncFailure(failure.id);
    expect(getSyncFailures()).toHaveLength(0);
    expect(await db.outbox.count()).toBe(1);
    expect(getSyncStatus('bk-retry')).toEqual({ state: 'pending' });
  });

  it('dismissSyncFailure drops only the named failure (no bulk auto-clear)', async () => {
    vi.stubGlobal('fetch', reject400('BOOKING_INVALID'));
    await enqueueOutbox(TRIP_ID, bookingOp('bk-a'));
    await enqueueOutbox(TRIP_ID, bookingOp('bk-b'));
    await flushOutbox(TRIP_ID);
    expect(getSyncFailures()).toHaveLength(2);

    dismissSyncFailure(getSyncFailures()[0].id);
    const rest = getSyncFailures();
    expect(rest).toHaveLength(1);
    expect(rest[0].entityId).toBe('bk-b');
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

  it('counts one user action as one change, grouping the ops it enqueues (ADR-0092)', async () => {
    // A one-booking flight enqueues its two route places + the booking under one
    // change group. The true op total is 3 (drives the flush), but the header
    // summary counts pending groups → "1 change".
    await withChangeGroup(async () => {
      await enqueueOutbox(TRIP_ID, placeOp('pl-from'));
      await enqueueOutbox(TRIP_ID, placeOp('pl-to'));
      await enqueueOutbox(TRIP_ID, bookingOp('bk-flight'));
    });
    expect(getOutboxCount()).toBe(3);
    expect(getPendingChangeCount()).toBe(1);

    // The grouping is persisted, so it survives a re-prime from IndexedDB.
    await initOutboxCount();
    expect(getOutboxCount()).toBe(3);
    expect(getPendingChangeCount()).toBe(1);
  });

  it('counts standalone enqueues (outside a group) as one change each', async () => {
    await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    await enqueueOutbox(TRIP_ID, statusOp('ev-2'));
    expect(getPendingChangeCount()).toBe(2);
  });

  it('drains a group from the change count only once all its ops flush', async () => {
    const placeBody = JSON.stringify({
      id: 'pl-1',
      tripId: TRIP_ID,
      name: 'מקום',
      createdAt: '',
      updatedAt: '',
      updatedBy: 'u',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(String(url).includes('/places') ? placeBody : canonicalBody(), {
            status: 200,
          }),
        ),
      ),
    );
    await withChangeGroup(async () => {
      await enqueueOutbox(TRIP_ID, placeOp('pl-1'));
      await enqueueOutbox(TRIP_ID, statusOp('ev-1'));
    });
    expect(getPendingChangeCount()).toBe(1); // two ops, one change
    expect(getOutboxCount()).toBe(2);
    await flushOutbox(TRIP_ID);
    expect(getPendingChangeCount()).toBe(0);
    expect(getOutboxCount()).toBe(0);
  });
});
