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
  wipeLocalData,
} from './cache';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';
import { OUTBOX_VERB } from './outbox';

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

  // Registry channels beyond events (ADR-0094): own Dexie table (booking), a
  // snapshotMeta list (place, membership), the meta trip scalar.
  it('upserts + deletes a booking via its own Dexie table', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'booking',
      entityId: 'bk-new',
      action: 'create',
      after: { type: 'restaurant', title: 'מסעדה' },
    });
    expect((await db.bookings.get('bk-new'))?.title).toBe('מסעדה');
    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'booking',
      entityId: 'bk-new',
      action: 'delete',
      after: undefined,
    });
    expect(await db.bookings.get('bk-new')).toBeUndefined();
  });

  it('upserts a place into the snapshotMeta list', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'place',
      entityId: 'pl-new',
      action: 'create',
      after: { name: 'קיוטו' },
    });
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.places.find((p) => p.id === 'pl-new')?.name).toBe('קיוטו');
  });

  it('merges a trip-settings change onto the cached trip scalar', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'trip',
      entityId: TRIP_ID,
      action: 'update',
      after: { name: 'שם חדש' },
    });
    expect((await readCachedSnapshot(TRIP_ID))?.trip.name).toBe('שם חדש');
  });

  it('coerces a null destination field to undefined on the cached trip (ADR-0113)', async () => {
    await cacheSnapshot(
      TRIP_ID,
      snapshot({
        trip: { ...snapshot().trip, destinationGooglePlaceId: 'ChIJ_old', destinationLat: 35.68 },
      }),
    );
    // A "use as typed" edit clears the coordinates over the wire as null; the
    // cached trip must hold `undefined`, not a stray `null`.
    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityType: 'trip',
      entityId: TRIP_ID,
      action: 'update',
      after: { destination: 'Elsewhere', destinationGooglePlaceId: null, destinationLat: null },
    });
    const trip = (await readCachedSnapshot(TRIP_ID))?.trip;
    expect(trip?.destination).toBe('Elsewhere');
    expect(trip?.destinationGooglePlaceId).toBeUndefined();
    expect(trip?.destinationLat).toBeUndefined();
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
      verb: OUTBOX_VERB.CREATE,
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
      verb: OUTBOX_VERB.SET_STATUS,
      eventId: EVENTS[0].id,
      status: 'done',
    });
    expect((await db.events.get(EVENTS[0].id))?.status).toBe('done');
  });

  it('removes an offline-deleted event from the cache', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.DELETE,
      eventId: EVENTS[0].id,
      confirm: false,
    });
    expect(await db.events.get(EVENTS[0].id)).toBeUndefined();
  });

  it('applies an offline trip-settings edit to both the snapshot and the list', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await cacheTripList([trip({ id: TRIP_ID, name: 'Old name' })]);
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.UPDATE_TRIP,
      input: { name: 'New name' },
    });

    expect((await readCachedSnapshot(TRIP_ID))?.trip.name).toBe('New name');
    expect((await readCachedTripList()).find((t) => t.id === TRIP_ID)?.name).toBe('New name');
  });

  it('adds and removes an offline maybe-shelf idea in the cache', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    const before = (await readCachedSnapshot(TRIP_ID))!.maybeItems.length;

    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.CREATE_MAYBE_ITEM,
      input: { id: 'mb-offline', title: 'Offline idea', icon: '💡' },
    });
    let cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.maybeItems).toHaveLength(before + 1);
    expect(cached?.maybeItems.find((m) => m.id === 'mb-offline')?.title).toBe('Offline idea');

    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.DELETE_MAYBE_ITEM,
      maybeItemId: 'mb-offline',
    });
    cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.maybeItems).toHaveLength(before);
    expect(cached?.maybeItems.find((m) => m.id === 'mb-offline')).toBeUndefined();
  });

  it('mirrors an offline booking create/delete, stripping the event seed', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.CREATE_BOOKING,
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
      verb: OUTBOX_VERB.DELETE_BOOKING,
      bookingId: 'bk-offline',
      confirm: false,
      deleteEvents: false,
    });
    expect(await db.bookings.get('bk-offline')).toBeUndefined();
  });

  it('mirrors an offline place create into the cached snapshot', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.CREATE_PLACE,
      input: { id: 'pl-offline', name: 'Offline place' },
    });
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.places.find((p) => p.id === 'pl-offline')?.name).toBe('Offline place');
  });

  it('defaults a new offline event to planned (no status on the create input)', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.CREATE,
      input: { id: 'ev-plan', date: '2026-07-02', title: 'x', kind: 'soft', source: 'manual' },
    });
    expect((await db.events.get('ev-plan'))?.status).toBe('planned');
  });

  it('applies an offline member role change, keyed by membership id (userId resolved)', async () => {
    // The op carries userId; the cache (like the WS echo) keys memberships by id.
    const member = {
      id: 'mem-1',
      tripId: TRIP_ID,
      userId: 'u-noam',
      role: 'peer' as const,
      calendarSyncEnabled: false,
      joinedAt: '2026-07-01T00:00:00.000Z',
    };
    await cacheSnapshot(TRIP_ID, snapshot({ members: [member] }));
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.SET_MEMBER_ROLE,
      userId: 'u-noam',
      role: 'admin',
    });
    expect((await readCachedSnapshot(TRIP_ID))?.members.find((m) => m.id === 'mem-1')?.role).toBe(
      'admin',
    );
    await applyOutboxOpToCache(TRIP_ID, { verb: OUTBOX_VERB.REMOVE_MEMBER, userId: 'u-noam' });
    expect((await readCachedSnapshot(TRIP_ID))?.members).toHaveLength(0);
  });
});

describe('wipeLocalData (sign-out / session loss, F-01)', () => {
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

  it('clears every Dexie table, the active-trip pointer, and does not throw', async () => {
    // The node test env has no localStorage; back it with a plain Map.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });

    await cacheSnapshot(TRIP_ID, snapshot({ bookings: [], documents: [doc('d-1')] }));
    await cacheTripList([trip({ id: TRIP_ID })]);
    await db.outbox.add({
      tripId: TRIP_ID,
      op: { verb: OUTBOX_VERB.DELETE, eventId: EVENTS[0].id, confirm: false },
    });
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, TRIP_ID);

    // Sanity: the caches are actually populated before the wipe.
    expect(await db.events.count()).toBeGreaterThan(0);
    expect(await db.documents.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);

    await expect(wipeLocalData()).resolves.toBeUndefined();

    expect(await db.events.count()).toBe(0);
    expect(await db.bookings.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
    expect(await db.snapshotMeta.count()).toBe(0);
    expect(await db.tripList.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY)).toBeNull();
  });
});
