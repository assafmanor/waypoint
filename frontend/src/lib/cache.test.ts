import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Booking,
  Change,
  DocumentSummary,
  Note,
  Place,
  Trip,
  TripEvent,
  TripSnapshot,
} from '@waypoint/shared';
import { BOOKING_TYPE, CHANGE_ACTION, ENTITY_TYPE } from '@waypoint/shared';
import { db } from '../db';
import { EVENTS, MAYBE_ITEMS } from '../fixtures';
import {
  applyChangeToCache,
  applyOutboxOpToCache,
  cacheEnrichment,
  cacheSnapshot,
  cacheTripList,
  loadTripList,
  readCachedSnapshot,
  readCachedTripList,
  wipeLocalData,
} from './cache';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';
import { OUTBOX_VERB } from './outbox';
import { setSimulatedNow } from './useClock';

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
    notes: [],
    enrichments: {},
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

  it('coerces a cleared event field to undefined too, not only the trip (ADR-0107)', async () => {
    await cacheSnapshot(
      TRIP_ID,
      snapshot({ events: [{ ...EVENTS[0], displayTimezone: 'Asia/Jerusalem' }] }),
    );
    // The zone chip's reset crosses the wire as null; a cached `null` would fail
    // the entity schema on the next cold load, so it must land as undefined.
    await applyChangeToCache(TRIP_ID, {
      ...baseChange,
      entityId: EVENTS[0].id,
      action: 'update',
      after: { displayTimezone: null },
    });
    const cached = (await readCachedSnapshot(TRIP_ID))?.events[0];
    expect(cached?.displayTimezone).toBeUndefined();
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

// Notes ride `snapshotMeta` (no table of their own), so this covers both halves the
// ADR-0152 §2 rule needs: the ordinary channel, and the host cascade that has no Change.
describe('notes in the offline cache (ADR-0152)', () => {
  const note = (id: string, over: Partial<Note> = {}): Note => ({
    id,
    tripId: TRIP_ID,
    body: `note ${id}`,
    source: 'member',
    createdBy: 'u-assaf',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    updatedBy: 'u-assaf',
    ...over,
  });

  it('round-trips notes through the snapshot cache', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ notes: [note('n1'), note('n2')] }));
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.notes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('reads a trip cached BEFORE notes shipped as having none, not undefined', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    const meta = await db.snapshotMeta.get(TRIP_ID);
    // Simulate the pre-upgrade row, which simply has no `notes` key at all.
    delete (meta as unknown as Record<string, unknown>).notes;
    await db.snapshotMeta.put(meta!);
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.notes).toEqual([]);
  });

  it('mirrors an offline-written note so a cold reopen still shows it', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.CREATE_NOTE,
      input: { id: 'n-offline', body: 'נכתב במטוס' },
    });
    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.notes.find((n) => n.id === 'n-offline')).toMatchObject({
      body: 'נכתב במטוס',
      // The seed carries no `source`; the optimistic row states it, or the row would
      // fail `noteSchema` on the next cold load.
      source: 'member',
    });
  });

  // The other half of the same rule, and the owner's `לפני NaN שנים` report: the SERVER
  // stamps the timestamps, so a queued note cached without them came back from a cold load
  // with `createdAt: undefined` — unparseable, unsortable, and rendered through the elapsed
  // ladder.
  it('stamps an offline-written note, so a cold reopen can date and sort it', async () => {
    setSimulatedNow(Date.parse('2026-07-20T09:00:00.000Z'));
    await cacheSnapshot(TRIP_ID, snapshot({ notes: [note('n1')] }));
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.CREATE_NOTE,
      input: { id: 'n-offline', body: 'נכתב במטוס' },
    });

    const cached = await readCachedSnapshot(TRIP_ID);
    const written = cached!.notes.find((n) => n.id === 'n-offline')!;
    expect(written.createdAt).toBe('2026-07-20T09:00:00.000Z');
    expect(written.updatedAt).toBe('2026-07-20T09:00:00.000Z');
    expect(Number.isFinite(Date.parse(written.createdAt))).toBe(true);
    setSimulatedNow(null);
  });

  it('mirrors an offline edit and an offline delete', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ notes: [note('n1')] }));
    await applyOutboxOpToCache(TRIP_ID, {
      verb: OUTBOX_VERB.UPDATE_NOTE,
      noteId: 'n1',
      input: { body: 'תוקן' },
    });
    expect((await readCachedSnapshot(TRIP_ID))?.notes[0]?.body).toBe('תוקן');

    await applyOutboxOpToCache(TRIP_ID, { verb: OUTBOX_VERB.DELETE_NOTE, noteId: 'n1' });
    expect((await readCachedSnapshot(TRIP_ID))?.notes).toEqual([]);
  });

  // The trap: Postgres cascades the rows away and writes NO Change for them, so without
  // this the cache keeps serving notes whose host is gone until the next full snapshot.
  it('drops a deleted host’s notes from the cache, though no note Change was sent', async () => {
    await cacheSnapshot(
      TRIP_ID,
      snapshot({
        notes: [note('n1', { eventId: 'e1' }), note('n2', { eventId: 'e2' }), note('n3')],
      }),
    );

    await applyChangeToCache(TRIP_ID, {
      entityType: ENTITY_TYPE.EVENT,
      entityId: 'e1',
      action: CHANGE_ACTION.DELETE,
    });

    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.notes.map((n) => n.id)).toEqual(['n2', 'n3']);
  });
});

// ── ADR-0157: THE PLACE CASCADE IN THE CACHE ─────────────────────────────────────────────
// The same trap as the note cascade above, over four more FKs and three stores: `SetNull`
// writes no `Change` either, so without this the cache keeps serving an event pinned to a
// place that no longer exists — and offline there is no echo coming to correct it.
describe('a deleted place in the offline cache (ADR-0157)', () => {
  const placeRow = (id: string): Place => ({
    id,
    tripId: TRIP_ID,
    name: id,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    updatedBy: 'u-assaf',
  });
  const eventRow = (id: string, placeId?: string): TripEvent => ({
    ...EVENTS[0],
    id,
    placeId,
  });
  const bookingRow = (id: string, over: Partial<Booking>): Booking =>
    ({
      id,
      tripId: TRIP_ID,
      type: BOOKING_TYPE.TRAIN,
      title: id,
      source: 'manual',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      updatedBy: 'u-assaf',
      ...over,
    }) as Booking;

  const seedTrip = () =>
    cacheSnapshot(
      TRIP_ID,
      snapshot({
        places: [placeRow('pl-1'), placeRow('pl-2')],
        events: [eventRow('e1', 'pl-1'), eventRow('e2', 'pl-2')],
        bookings: [bookingRow('bk-1', { fromPlaceId: 'pl-1', toPlaceId: 'pl-2' })],
        maybeItems: [{ ...MAYBE_ITEMS[0], placeId: 'pl-1' }],
      }),
    );

  const deletePlace = () =>
    applyChangeToCache(TRIP_ID, {
      entityType: ENTITY_TYPE.PLACE,
      entityId: 'pl-1',
      action: CHANGE_ACTION.DELETE,
    });

  it('clears every cached FK that pointed at it, across all three stores', async () => {
    await seedTrip();
    await deletePlace();

    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.places.map((p) => p.id)).toEqual(['pl-2']);
    expect(cached?.events.find((e) => e.id === 'e1')?.placeId).toBeUndefined();
    expect(cached?.bookings[0]?.fromPlaceId).toBeUndefined();
    expect(cached?.maybeItems[0]?.placeId).toBeUndefined();
    // …and nothing that pointed elsewhere was touched.
    expect(cached?.events.find((e) => e.id === 'e2')?.placeId).toBe('pl-2');
    expect(cached?.bookings[0]?.toPlaceId).toBe('pl-2');
  });

  // The offline half, which is the one that matters most: with no network there is no echo
  // coming, so the queued op IS the only thing that will ever tell the cache.
  it('mirrors an offline delete, cascade included', async () => {
    await seedTrip();
    await applyOutboxOpToCache(TRIP_ID, { verb: OUTBOX_VERB.DELETE_PLACE, placeId: 'pl-1' });

    const cached = await readCachedSnapshot(TRIP_ID);
    expect(cached?.places.map((p) => p.id)).toEqual(['pl-2']);
    expect(cached?.events.find((e) => e.id === 'e1')?.placeId).toBeUndefined();
  });

  it('takes the place’s own notes with it, on the rule the fifth host shares', async () => {
    await cacheSnapshot(
      TRIP_ID,
      snapshot({
        places: [placeRow('pl-1')],
        notes: [
          {
            id: 'n1',
            tripId: TRIP_ID,
            placeId: 'pl-1',
            body: 'note',
            source: 'member',
            createdBy: 'u-assaf',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
            updatedBy: 'u-assaf',
          } as Note,
        ],
      }),
    );
    await deletePlace();
    expect((await readCachedSnapshot(TRIP_ID))?.notes).toEqual([]);
  });
});

describe('enrichment in the offline cache (ADR-0166 §6)', () => {
  const FIELDS = {
    summary: {
      en: {
        value: 'Sensō-ji is an ancient Buddhist temple in Asakusa, Tokyo, Japan.',
        lang: 'en',
        source: 'wikipedia' as const,
        license: 'CC BY-SA 4.0',
        attribution: 'https://en.wikipedia.org/wiki/Sens%C5%8D-ji',
        fetchedAt: '2026-08-05T10:00:00.000Z',
        confidence: 1,
        method: 'settled_id' as const,
        ref: 'Q615183',
      },
    },
  };

  it('rides the snapshot into the cache and back out, keyed by placeId', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ enrichments: { 'pl-1': FIELDS } }));
    // Offline reads work unchanged (§6.3) — the whole point of it riding the snapshot.
    expect((await readCachedSnapshot(TRIP_ID))?.enrichments['pl-1']).toEqual(FIELDS);
  });

  it('upserts one place without disturbing the others', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ enrichments: { 'pl-1': FIELDS } }));
    await cacheEnrichment(TRIP_ID, 'pl-2', FIELDS);

    const cached = (await readCachedSnapshot(TRIP_ID))?.enrichments;
    expect(Object.keys(cached ?? {}).sort()).toEqual(['pl-1', 'pl-2']);
  });

  it('replaces a place’s enrichment wholesale — the server is the only writer', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ enrichments: { 'pl-1': FIELDS } }));
    const refreshed = { hours: { ...FIELDS.summary.en, value: 'Mo-Su 06:00-17:00' } };
    await cacheEnrichment(TRIP_ID, 'pl-1', refreshed);

    // Last write wins with nothing to reconcile: no client ever authored either version.
    expect((await readCachedSnapshot(TRIP_ID))?.enrichments['pl-1']).toEqual(refreshed);
  });

  it('is a no-op for a trip that was never cached', async () => {
    await expect(cacheEnrichment('trip-never-seen', 'pl-1', FIELDS)).resolves.toBeUndefined();
  });

  it('reads as empty for a trip cached before enrichment shipped', async () => {
    await cacheSnapshot(TRIP_ID, snapshot());
    // Simulate the pre-upgrade row: the key simply is not there.
    const meta = await db.snapshotMeta.get(TRIP_ID);
    const { enrichments: _dropped, ...withoutEnrichments } = meta!;
    await db.snapshotMeta.put(withoutEnrichments as typeof meta & object);

    // `undefined` must not reach a consumer's lookup on the first render after the upgrade.
    expect((await readCachedSnapshot(TRIP_ID))?.enrichments).toEqual({});
  });

  it('goes with the rest of the trip on wipe', async () => {
    await cacheSnapshot(TRIP_ID, snapshot({ enrichments: { 'pl-1': FIELDS } }));
    await wipeLocalData();
    expect(await readCachedSnapshot(TRIP_ID)).toBeNull();
  });
});
