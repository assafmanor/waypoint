import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Change, TripSnapshot } from '@waypoint/shared';
import { db } from '../db';
import { EVENTS, MAYBE_ITEMS } from '../fixtures';
import { applyChangeToCache, cacheSnapshot, readCachedSnapshot } from './cache';

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
    maybeItems: MAYBE_ITEMS,
    notes: [],
    latestSeq: '10',
    ...overrides,
  };
}

afterEach(async () => {
  await db.events.clear();
  await db.bookings.clear();
  await db.snapshotMeta.clear();
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

  it('is a no-op when nothing was ever cached for this trip', async () => {
    await expect(
      applyChangeToCache(TRIP_ID, { ...baseChange, entityType: 'maybeItem' }),
    ).resolves.toBeUndefined();
    expect(await readCachedSnapshot(TRIP_ID)).toBeNull();
  });
});
