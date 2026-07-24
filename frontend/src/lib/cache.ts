// Offline read cache (T-058, sync-and-offline.md "Read"): mirrors the trip
// snapshot into Dexie on every successful fetch/change/resync so the app can
// render the last-known state with zero connectivity.
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  EVENT_STATUS,
  type Change,
  type EntityType,
  type MaybeItem,
  type Membership,
  type Place,
  type Trip,
  type TripSnapshot,
  type User,
} from '@waypoint/shared';
import { type Table } from 'dexie';
import { db } from '../db';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';
import { fetchTrips } from './api';
import { clearAllCachedDocuments } from './doc-cache';
import { initOutboxCount, OUTBOX_VERB, type OutboxOp } from './outbox';

/** The slice of TripSnapshot with no dedicated Dexie table of its own. */
export interface SnapshotMeta {
  tripId: string;
  trip: Trip;
  members: Membership[];
  users: User[];
  maybeItems: MaybeItem[];
  places: Place[];
  latestSeq: string;
}

/** Wholesale mirror on every snapshot fetch/resync — a trip is a few hundred
 *  small rows, so replace-all is simpler and cheap enough (ADR-0018). */
export async function cacheSnapshot(tripId: string, snapshot: TripSnapshot): Promise<void> {
  await db.transaction('rw', db.events, db.bookings, db.documents, db.snapshotMeta, async () => {
    await db.events.where('tripId').equals(tripId).delete();
    await db.events.bulkAdd(snapshot.events);
    await db.bookings.where('tripId').equals(tripId).delete();
    await db.bookings.bulkAdd(snapshot.bookings);
    // Documents ride the snapshot (ADR-0058), summaries only — `fileRef` never
    // reaches the client (ADR-0015/0034); blob bytes cache separately (ADR-0055).
    await db.documents.where('tripId').equals(tripId).delete();
    await db.documents.bulkAdd(snapshot.documents);
    await db.snapshotMeta.put({
      tripId,
      trip: snapshot.trip,
      members: snapshot.members,
      users: snapshot.users,
      maybeItems: snapshot.maybeItems,
      places: snapshot.places,
      latestSeq: snapshot.latestSeq,
    });
  });
}

/** Reconstructs a full TripSnapshot from cache, or null if this trip was
 *  never cached (the true first-ever-load-while-offline case). */
export async function readCachedSnapshot(tripId: string): Promise<TripSnapshot | null> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta) return null;
  const [events, bookings, documents] = await Promise.all([
    db.events.where('tripId').equals(tripId).toArray(),
    db.bookings.where('tripId').equals(tripId).toArray(),
    db.documents.where('tripId').equals(tripId).toArray(),
  ]);
  return {
    trip: meta.trip,
    members: meta.members,
    users: meta.users,
    events,
    bookings,
    documents,
    maybeItems: meta.maybeItems,
    places: meta.places,
    latestSeq: meta.latestSeq,
  };
}

/** The fields of a `Change` the appliers actually read (ADR-0094). A live WS echo
 *  passes a full `Change`; an offline optimistic write passes this subset. */
export type EntityChange = Pick<Change, 'entityType' | 'entityId' | 'action' | 'after'>;

function applyToRow<T extends { id: string }>(
  existing: T | undefined,
  change: EntityChange,
): T | undefined {
  if (change.action === CHANGE_ACTION.DELETE) return undefined;
  // A change may clear a field with `null` (ADR-0107's `displayTimezone`, a trip's
  // destination); entity types use `undefined` for absent, so a raw merge would
  // cache a `null` the schema rejects on the next cold load.
  const partial = coerceClearedFields<T>(change.after);
  if (!partial) return existing;
  return { ...(existing as T), ...partial, id: change.entityId } as T;
}

/** Where each entity type's cached rows live (ADR-0094) — an own Dexie table, a
 *  list on `snapshotMeta`, or the meta `trip` scalar. The mirror of the memory
 *  channels in trip-state: one entry per entity type, so `applyChangeToCache` is
 *  a table lookup and adding/moving an entity type is a single edit here. */
type CacheRow = { id: string; tripId?: string };
type CacheChannel =
  | { table: Table<CacheRow, string> }
  | { metaList: 'maybeItems' | 'places' | 'members' }
  | { metaTrip: true };

const CACHE_CHANNELS: Record<EntityType, CacheChannel> = {
  [ENTITY_TYPE.EVENT]: { table: db.events as unknown as Table<CacheRow, string> },
  [ENTITY_TYPE.BOOKING]: { table: db.bookings as unknown as Table<CacheRow, string> },
  // Documents ride the snapshot (ADR-0058), summary only — `fileRef` never
  // reaches the client (ADR-0015/0034); blob bytes cache separately (ADR-0055).
  [ENTITY_TYPE.DOCUMENT]: { table: db.documents as unknown as Table<CacheRow, string> },
  [ENTITY_TYPE.MAYBE_ITEM]: { metaList: 'maybeItems' },
  [ENTITY_TYPE.PLACE]: { metaList: 'places' },
  // Trip settings are data-plane (ADR-0039), so the roster + trip row stay
  // coherent too — else an offline reader shows a stale name/member on cold load.
  [ENTITY_TYPE.MEMBERSHIP]: { metaList: 'members' },
  [ENTITY_TYPE.TRIP]: { metaTrip: true },
};

/** Upsert/delete a change into one of `snapshotMeta`'s embedded lists. */
async function applyChangeToMetaList(
  tripId: string,
  listKey: 'maybeItems' | 'places' | 'members',
  change: EntityChange,
): Promise<void> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta) return;
  const list = meta[listKey] as CacheRow[];
  const existing = list.find((x) => x.id === change.entityId);
  const row = applyToRow<CacheRow>(existing, change);
  const next = row && { ...row, tripId };
  const updated = next
    ? existing
      ? list.map((x) => (x.id === next.id ? next : x))
      : [...list, next]
    : list.filter((x) => x.id !== change.entityId);
  await db.snapshotMeta.put({ ...meta, [listKey]: updated } as SnapshotMeta);
}

/** Keeps the Dexie cache coherent with every data-plane entity type in the
 *  snapshot so a change (a WS echo or an offline optimistic write) never silently
 *  falls out of the offline cache. Table-driven off `CACHE_CHANNELS`. */
export async function applyChangeToCache(tripId: string, change: EntityChange): Promise<void> {
  const channel = CACHE_CHANNELS[change.entityType];
  if (!channel) return;
  if ('table' in channel) {
    const existing = await channel.table.get(change.entityId);
    const next = applyToRow<CacheRow>(existing, change);
    if (next) await channel.table.put({ ...next, tripId });
    else await channel.table.delete(change.entityId);
    return;
  }
  if ('metaList' in channel) {
    await applyChangeToMetaList(tripId, channel.metaList, change);
    return;
  }
  // A trip delete wipes everything for this trip; drop the cache entirely.
  if (change.action === CHANGE_ACTION.DELETE) {
    await clearTripCache(tripId);
    return;
  }
  const partial = coerceTripPatch(change.after);
  if (!partial) return;
  const meta = await db.snapshotMeta.get(tripId);
  if (meta) await db.snapshotMeta.put({ ...meta, trip: { ...meta.trip, ...partial } });
  // The all-trips list shows a trip's name/dates/icon too — keep it coherent so a
  // rename doesn't snap back on the next cold load (matches the offline path).
  const listed = await db.tripList.get(tripId);
  if (listed) await db.tripList.put({ ...listed, ...partial });
}

/** A **clearable** field crosses the wire as `null` (a trip's destination,
 *  an event's `displayTimezone` — the "unset me" signal an absent key can't
 *  express), but local entities use `undefined` for absent. Coerce a patch so a
 *  cleared field overwrites as `undefined` — the key stays present, so the merge
 *  still removes the old value — rather than persisting a `null` the entity type
 *  doesn't allow. One helper for every entity with a clearable field: the trip
 *  cache/memory merges and the optimistic event update both route through it. */
export function coerceClearedFields<T>(patch: unknown): Partial<T> | undefined {
  if (patch == null) return undefined;
  return Object.fromEntries(
    Object.entries(patch as Record<string, unknown>).map(([k, v]) => [k, v ?? undefined]),
  ) as Partial<T>;
}

/** `coerceClearedFields` bound to `Trip` — the trip change/patch call sites. */
export const coerceTripPatch = (after: unknown): Partial<Trip> | undefined =>
  coerceClearedFields<Trip>(after);

/** Wipes every trace of the signed-in session's local data (sign-out / session
 *  loss, F-01): all Dexie tables, the per-device active-trip pointer, and the
 *  decrypted document blobs, then re-primes the (now empty) outbox badge. Each
 *  subsystem is isolated so one failure can't leave another's data behind. */
export async function wipeLocalData(): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [db.events, db.bookings, db.documents, db.snapshotMeta, db.tripList, db.outbox],
      async () => {
        await Promise.all([
          db.events.clear(),
          db.bookings.clear(),
          db.documents.clear(),
          db.snapshotMeta.clear(),
          db.tripList.clear(),
          db.outbox.clear(),
        ]);
      },
    );
  } catch {
    // best-effort: fall through to the other subsystems below.
  }
  try {
    localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    // ignore
  }
  await clearAllCachedDocuments();
  await initOutboxCount().catch(() => {});
}

/** Drops every cached row for a trip (used when the trip is deleted). */
export async function clearTripCache(tripId: string): Promise<void> {
  await db.transaction('rw', db.events, db.bookings, db.snapshotMeta, db.tripList, async () => {
    await db.events.where('tripId').equals(tripId).delete();
    await db.bookings.where('tripId').equals(tripId).delete();
    await db.snapshotMeta.delete(tripId);
    await db.tripList.delete(tripId);
  });
}

// --- Trip-list cache (offline all-trips + boot resolution) -------------------
// GET /trips has no snapshot to fall back on of its own, so a fetch failure used
// to collapse to an empty list — ZeroState on a cold reopen, an empty all-trips
// view, and "lost" trips after returning from settings. Mirror the last-known
// list so those surfaces read from cache when the network is gone.

/** Wholesale mirror of the last successful GET /trips. */
export async function cacheTripList(trips: Trip[]): Promise<void> {
  await db.transaction('rw', db.tripList, async () => {
    await db.tripList.clear();
    await db.tripList.bulkPut(trips);
  });
}

/** Last-known trip list, or [] if none was ever cached. */
export async function readCachedTripList(): Promise<Trip[]> {
  return db.tripList.toArray();
}

/** Fetch the trip list, mirroring it on success and falling back to the cached
 *  copy when the network is gone — the single loader RootSurface and AllTrips
 *  share so both stay coherent offline. `fromCache` lets a caller show an
 *  "offline, showing saved trips" cue. */
export async function loadTripList(): Promise<{ trips: Trip[]; fromCache: boolean }> {
  try {
    const trips = await fetchTrips();
    void cacheTripList(trips);
    return { trips, fromCache: false };
  } catch {
    return { trips: await readCachedTripList(), fromCache: true };
  }
}

// --- Optimistic write-through (offline writes → read cache) ------------------
// An offline write lands in the reducer (in-memory) and the outbox, but never
// touched the Dexie read cache — so a cold reopen while still offline rendered
// the pre-edit snapshot and the queued change appeared to vanish (events you
// added, a trip you renamed) until reconnect flushed the outbox. Applying the
// queued op to the cache at enqueue time keeps offline reads coherent with what
// the user just did. (Online writes don't need this: the server's own WS echo
// runs applyChangeToCache for them.)
export async function applyOutboxOpToCache(tripId: string, op: OutboxOp): Promise<void> {
  for (const change of await outboxOpToCacheChanges(tripId, op)) {
    await applyChangeToCache(tripId, change);
  }
}

/** Maps a queued outbox op to the cache Change(s) it implies (ADR-0094), so the
 *  offline mirror reuses the one registry-driven `applyChangeToCache` instead of
 *  re-implementing per-entity persistence. A booking's seeded linked event isn't
 *  here — the write verb emits it via `bookingLinkedEventChange` through the same
 *  applier. Async only for member ops, which resolve the membership id from the
 *  cached roster (the op carries `userId`; the cache keys by membership id, like
 *  the WS echo). `[]` for ops with no cached entity (a queued document upload
 *  renders as a pending row, ADR-0056, not a cached document). */
async function outboxOpToCacheChanges(tripId: string, op: OutboxOp): Promise<EntityChange[]> {
  const one = (c: EntityChange): EntityChange[] => [c];
  switch (op.verb) {
    case OUTBOX_VERB.CREATE:
      if (!op.input.id) return [];
      // A new event starts planned (the server default); the seed carries no status.
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: { ...op.input, status: EVENT_STATUS.PLANNED },
      });
    case OUTBOX_VERB.UPDATE:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.MOVE:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.MOVE,
        after: op.input,
      });
    case OUTBOX_VERB.SET_STATUS:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.STATUS,
        after: { status: op.status },
      });
    case OUTBOX_VERB.DELETE:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_MAYBE_ITEM:
      if (!op.input.id) return [];
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: { consumed: false, ...op.input },
      });
    case OUTBOX_VERB.CONSUME_MAYBE_ITEM:
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.maybeItemId,
        action: CHANGE_ACTION.UPDATE,
        after: { consumed: true },
      });
    case OUTBOX_VERB.DELETE_MAYBE_ITEM:
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.maybeItemId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_BOOKING: {
      if (!op.input.id) return [];
      const { event: _seed, ...fields } = op.input;
      return one({
        entityType: ENTITY_TYPE.BOOKING,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: fields,
      });
    }
    case OUTBOX_VERB.UPDATE_BOOKING: {
      const { event: _seed, ...fields } = op.input;
      return one({
        entityType: ENTITY_TYPE.BOOKING,
        entityId: op.bookingId,
        action: CHANGE_ACTION.UPDATE,
        after: fields,
      });
    }
    case OUTBOX_VERB.DELETE_BOOKING:
      return one({
        entityType: ENTITY_TYPE.BOOKING,
        entityId: op.bookingId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_PLACE:
      if (!op.input.id) return [];
      return one({
        entityType: ENTITY_TYPE.PLACE,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: op.input,
      });
    case OUTBOX_VERB.UPDATE_PLACE:
      return one({
        entityType: ENTITY_TYPE.PLACE,
        entityId: op.placeId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.UPDATE_TRIP:
      return one({
        entityType: ENTITY_TYPE.TRIP,
        entityId: tripId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.DELETE_TRIP:
      return one({ entityType: ENTITY_TYPE.TRIP, entityId: tripId, action: CHANGE_ACTION.DELETE });
    case OUTBOX_VERB.SET_MEMBER_ROLE:
    case OUTBOX_VERB.REMOVE_MEMBER: {
      // Resolve userId → membership id, so the offline mirror keys members the
      // same way the WS echo does (ADR-0094; consistent membership keying).
      const meta = await db.snapshotMeta.get(tripId);
      const member = meta?.members.find((m) => m.userId === op.userId);
      if (!member) return [];
      return op.verb === OUTBOX_VERB.REMOVE_MEMBER
        ? one({
            entityType: ENTITY_TYPE.MEMBERSHIP,
            entityId: member.id,
            action: CHANGE_ACTION.DELETE,
          })
        : one({
            entityType: ENTITY_TYPE.MEMBERSHIP,
            entityId: member.id,
            action: CHANGE_ACTION.UPDATE,
            after: { role: op.role },
          });
    }
    case OUTBOX_VERB.UPLOAD_DOCUMENT:
      return [];
  }
}
