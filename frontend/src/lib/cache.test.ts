import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Change, DocumentSummary, Trip, TripSnapshot } from '@waypoint/shared';
import { db } from '../db';
import { EVENTS, MAYBE_ITEMS } from '../fixtures';
import {
  applyChangeToCache,
  applyOutboxOpToCache,
  cacheSnapshot,
  cacheTripList,
  loadTripList,
  readCachedSnapshot,
  readCachedTripList,
} from './cache';

const TRIP_ID = EVENTS[0].tripId;

function snapshot(overrides: Partial<TripSnapshot> = {}): TripSnapshot {
  return {
    trip: {
      id: TRIP_ID,
      name: 'Japan 2026',
      destination: 'Japan',
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      timezone: 'Asia/Tokyo',
      createdBy: 'u-assaf',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'u-assaf',
    },
    members: [],
    users: [],
    events: EVENTS,
    bookings: [],
    documents: [],
    maybeItems: MAYBE_ITEMS,
    places: [],
    latestSeq: '10',
    ...overrides,
  };
}

function trip(overrides: Partial<Trip> = {}): Trip {
  return { ...snapshot().trip, ...overrides };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.events.clear();
  await db.bookings.clear();
  await db.documents.clear();
  await db.snapshotMeta.clear();
  await db.tripList.clear();
});

describe('cacheSnapshot / readCachedSnapshot', () => {
  it('returns null when nothing was ever cached for this trip', async () => {
    expect(await readCachedSnapshot(TRIP_ID)).toBeNull();
  });

  it('mirrors a snapshot and reads it back whole', async () => {
    const s = snapshot();
    await cacheSnapshot(TRIP_ID, s);

    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.latestSeq).toBe('10');
    expect(cached?.events.map((e) => e.id).sort()).toEqual(EVENTS.map((e) => e.id).sort());
    expect(cached?.maybeItems).toEqual(MAYBE_ITEMS);
  });

  it('a later snapshot replaces the earlier one wholesale (stale rows drop)', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    const trimmed = EVENTS.slice(1);
    await cacheSnapshot(TRIP_ID, snapshot({ events: trimmed, latestSeq: '11' }));

    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.events.map((e) => e.id).sort()).toEqual(trimmed.map((e) => e.id).sort());
    expect(cached?.latestSeq).toBe('11');
  });
});

describe('applyChangeToCache', () => {
  const baseChange: Change = {
    id: 'ch-1',
    seq: '11',
    tripId: TRIP_ID,
    actorUserId: 'u-someone-else',
    entityType: 'event',
    entityId: EVENTS[0].id,
    action: 'status',
    after: { status: 'done' },
    createdAt: '2026-07-11T00:00:00.000Z',
  };

  it('updates a cached event in place', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyChangeToCache(TRIP_ID, baseChange);

    const updated = await db.events.get(EVENTS[0].id);
    expect(updated?.status).toBe('done');
  });

  it('removes an event from the cache on a remote delete', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyChangeToCache(TRIP_ID, { ...baseChange, action: 'delete', after: undefined });

    expect(await db.events.get(EVENTS[0].id)).toBeUndefined();
  });

  it('keeps a cached maybeItem coherent (no dedicated Dexie table, lives in snapshotMeta)', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    const maybeId = MAYBE_ITEMS[0].id;

    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'maybeItem',
      entityId: maybeId,
      action: 'update',
      after: { consumed: true },
    });

    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.maybeItems.find((m) => m.id === maybeId)?.consumed).toBe(true);
    // Untouched items survive the update.
    expect(cached?.maybeItems).toHaveLength(MAYBE_ITEMS.length);
  });

  it('mirrors a remote document create into db.documents, then removes it on delete (ADR-0058)', async () => {
    const rows = () => db.documents.where('tripId').equals(TRIP_ID).toArray();

    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'document',
      entityId: 'doc-1',
      action: 'create',
      after: { type: 'passport', title: 'Passport', mimeType: 'application/pdf', sizeBytes: 12 },
    });
    const afterCreate = await rows();
    expect(afterCreate.map((d) => d.id)).toEqual(['doc-1']);
    expect(afterCreate[0]).toMatchObject({ title: 'Passport', tripId: TRIP_ID });

    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'document',
      entityId: 'doc-1',
      action: 'delete',
      after: undefined,
    });
    expect(await rows()).toEqual([]);
  });

  it('is a no-op when nothing was ever cached for this trip', async () => {
    await expect(
      applyChangeToCache(TRIP_ID, { ...baseChange, entityType: 'maybeItem' }),
    ).resolves.toBeUndefined();
    expect(await readCachedSnapshot(TRIP_ID)).toBeNull();
  });
});

describe('cacheSnapshot mirrors documents (ADR-0058)', () => {
  const doc = (id: string): DocumentSummary => ({
    id,
    tripId: TRIP_ID,
    type: 'passport',
    title: id,
    mimeType: 'application/pdf',
    sizeBytes: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    updatedBy: 'u-assaf',
  });

  it('caches the snapshot documents and reads them back; a later snapshot replaces them', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ documents: [doc('a'), doc('b')] }));
    const first = await readCachedSnapshot(TRIP_ID);
    expect(first?.documents.map((d) => d.id).sort()).toEqual(['a', 'b']);

    await cacheSnapshot(TRIP_ID, snapshot({ documents: [doc('b')] }));
    const second = await readCachedSnapshot(TRIP_ID);
    expect(second?.documents.map((d) => d.id)).toEqual(['b']);
  });
});

describe('trip-list cache', () => {
  it('mirrors and reads back the trip list', async () => {
    const trips = [trip({ id: 't-1', name: 'A' }), trip({ id: 't-2', name: 'B' })];
    await cacheTripList(trips);
    const cached = await readCachedTripList();
    expect(cached.map((t) => t.id).sort()).toEqual(['t-1', 't-2']);
  });

  it('replaces the list wholesale (stale trips drop)', async () => {
    await cacheTripList([trip({ id: 't-1' }), trip({ id: 't-2' })]);
    await cacheTripList([trip({ id: 't-2' })]);
    expect((await readCachedTripList()).map((t) => t.id)).toEqual(['t-2']);
  });
});

describe('loadTripList (offline-aware)', () => {
  it('fetches and caches the list when online', async () => {
    const trips = [trip({ id: 't-1' })];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(trips), { status: 200 }))),
    );
    const { trips: got, fromCache } = await loadTripList();
    expect(fromCache).toBe(false);
    expect(got.map((t) => t.id)).toEqual(['t-1']);
    // The successful fetch is mirrored for the next offline load.
    expect((await readCachedTripList()).map((t) => t.id)).toEqual(['t-1']);
  });

  it('falls back to the cached list when the fetch fails (offline)', async () => {
    await cacheTripList([trip({ id: 't-cached' })]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const { trips: got, fromCache } = await loadTripList();
    expect(fromCache).toBe(true);
    expect(got.map((t) => t.id)).toEqual(['t-cached']);
  });
});

describe('applyOutboxOpToCache (offline write-through)', () => {
  it('adds an offline-created event to the read cache', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    const newId = 'ev-offline-1';
    await applyOutboxOpToCache(TRIP_ID, {
      verb: 'create',
      input: {
        id: newId,
        date: '2026-07-02',
        title: 'Offline idea',
        kind: 'soft',
        source: 'manual',
      },
    });
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.events.find((e) => e.id === newId)?.title).toBe('Offline idea');
  });

  it('applies a status change to a cached event', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: 'setStatus',
      eventId: EVENTS[0].id,
      status: 'done',
    });
    expect((await db.events.get(EVENTS[0].id))?.status).toBe('done');
  });

  it('removes an offline-deleted event from the cache', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, { verb: 'delete', eventId: EVENTS[0].id, confirm: false });
    expect(await db.events.get(EVENTS[0].id)).toBeUndefined();
  });

  it('applies an offline trip-settings edit to both the snapshot and the list', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await cacheTripList([trip({ id: TRIP_ID, name: 'Old name' })]);
    await applyOutboxOpToCache(TRIP_ID, { verb: 'updateTrip', input: { name: 'New name' } });

    expect((await readCachedSnapshot(TRIP_ID))?.trip.name).toBe('New name');
    expect((await readCachedTripList()).find((t) => t.id === TRIP_ID)?.name).toBe('New name');
  });

  it('adds and removes an offline maybe-shelf idea in the cache', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    const before = (await readCachedSnapshot(TRIP_ID))!.maybeItems.length;

    await applyOutboxOpToCache(TRIP_ID, {
      verb: 'createMaybeItem',
      input: { id: 'mb-offline', title: 'Offline idea', icon: '💡' },
    });
    let cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.maybeItems).toHaveLength(before + 1);
    expect(cached?.maybeItems.find((m) => m.id === 'mb-offline')?.title).toBe('Offline idea');

    await applyOutboxOpToCache(TRIP_ID, { verb: 'deleteMaybeItem', maybeItemId: 'mb-offline' });
    cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.maybeItems).toHaveLength(before);
    expect(cached?.maybeItems.find((m) => m.id === 'mb-offline')).toBeUndefined();
  });

  it('mirrors an offline booking create/delete, stripping the event seed', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: 'createBooking',
      input: {
        id: 'bk-offline',
        type: 'hotel',
        title: 'Offline hotel',
        event: { date: '2026-07-03' },
      },
    });
    const row = await db.bookings.get('bk-offline');
    expect(row?.title).toBe('Offline hotel');
    expect((row as Record<string, unknown>).event).toBeUndefined();

    await applyOutboxOpToCache(TRIP_ID, {
      verb: 'deleteBooking',
      bookingId: 'bk-offline',
      confirm: false,
      deleteEvents: false,
    });
    expect(await db.bookings.get('bk-offline')).toBeUndefined();
  });

  it('mirrors an offline place create into the cached snapshot', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: 'createPlace',
      input: { id: 'pl-offline', name: 'Offline place' },
    });
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.places.find((p) => p.id === 'pl-offline')?.name).toBe('Offline place');
  });
});
