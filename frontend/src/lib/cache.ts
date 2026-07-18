// Offline read cache (T-058, sync-and-offline.md "Read"): mirrors the trip
// snapshot into Dexie on every successful fetch/change/resync so the app can
// render the last-known state with zero connectivity.
import {
  EVENT_STATUS,
  type Booking,
  type Change,
  type DocumentSummary,
  type MaybeItem,
  type Membership,
  type Place,
  type Trip,
  type TripEvent,
  type TripSnapshot,
  type User,
} from '@waypoint/shared';
import { db } from '../db';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';
import { fetchTrips } from './api';
import { clearAllCachedDocuments } from './doc-cache';
import { initOutboxCount, type OutboxOp } from './outbox';

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

function applyToRow<T extends { id: string }>(
  existing: T | undefined,
  change: Change,
): T | undefined {
  if (change.action === 'delete') return undefined;
  const partial = change.after as Partial<T> | undefined;
  if (!partial) return existing;
  return { ...(existing as T), ...partial, id: change.entityId } as T;
}

/** Keeps the Dexie cache coherent with every data-plane entity type in the
 *  snapshot (events, bookings, maybeItems, places) — not just events — so a
 *  remote change never silently falls out of the offline cache. */
export async function applyChangeToCache(tripId: string, change: Change): Promise<void> {
  switch (change.entityType) {
    case 'event': {
      const existing = await db.events.get(change.entityId);
      const next = applyToRow<TripEvent>(existing, change);
      if (next) await db.events.put({ ...next, tripId });
      else await db.events.delete(change.entityId);
      return;
    }
    case 'booking': {
      const existing = await db.bookings.get(change.entityId);
      const next = applyToRow<Booking>(existing, change);
      if (next) await db.bookings.put({ ...next, tripId });
      else await db.bookings.delete(change.entityId);
      return;
    }
    // Documents ride the snapshot (ADR-0058); keep the mirror coherent on every
    // remote change like the other lists. Summary only — `fileRef` never reaches
    // the client (ADR-0015/0034); blob bytes cache separately (ADR-0055).
    case 'document': {
      const existing = await db.documents.get(change.entityId);
      const next = applyToRow<DocumentSummary>(existing, change);
      if (next) await db.documents.put({ ...next, tripId });
      else await db.documents.delete(change.entityId);
      return;
    }
    case 'maybeItem': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      const existing = meta.maybeItems.find((m) => m.id === change.entityId);
      const next = applyToRow<MaybeItem>(existing, change);
      const maybeItems = next
        ? existing
          ? meta.maybeItems.map((m) => (m.id === next.id ? next : m))
          : [...meta.maybeItems, next]
        : meta.maybeItems.filter((m) => m.id !== change.entityId);
      await db.snapshotMeta.put({ ...meta, maybeItems });
      return;
    }
    case 'place': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      const existing = meta.places.find((p) => p.id === change.entityId);
      const next = applyToRow<Place>(existing, change);
      const places = next
        ? existing
          ? meta.places.map((p) => (p.id === next.id ? next : p))
          : [...meta.places, next]
        : meta.places.filter((p) => p.id !== change.entityId);
      await db.snapshotMeta.put({ ...meta, places });
      return;
    }
    // Trip settings are data-plane now (ADR-0039), so keep the cached snapshot's
    // trip row and roster coherent too — otherwise an offline reader would show a
    // renamed trip or removed member snapping back on the next cold load.
    case 'trip': {
      // A trip delete wipes everything for this trip; drop the cache entirely.
      if (change.action === 'delete') {
        await clearTripCache(tripId);
        return;
      }
      const meta = await db.snapshotMeta.get(tripId);
      const partial = change.after as Partial<Trip> | undefined;
      if (!meta || !partial) return;
      await db.snapshotMeta.put({ ...meta, trip: { ...meta.trip, ...partial } });
      return;
    }
    case 'membership': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      const existing = meta.members.find((m) => m.id === change.entityId);
      const next = applyToRow<Membership>(existing, change);
      const members = next
        ? existing
          ? meta.members.map((m) => (m.id === next.id ? next : m))
          : [...meta.members, next]
        : meta.members.filter((m) => m.id !== change.entityId);
      await db.snapshotMeta.put({ ...meta, members });
      return;
    }
    default:
      return;
  }
}

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
  switch (op.verb) {
    case 'create': {
      // Verbs always client-generate the id (ADR-0018); guard the optional type.
      if (!op.input.id) return;
      const existing = await db.events.get(op.input.id);
      await db.events.put({
        status: EVENT_STATUS.PLANNED,
        ...existing,
        ...op.input,
        tripId,
      } as TripEvent);
      return;
    }
    case 'update':
    case 'move': {
      const existing = await db.events.get(op.eventId);
      if (existing) await db.events.put({ ...existing, ...op.input });
      return;
    }
    case 'setStatus': {
      const existing = await db.events.get(op.eventId);
      if (existing) await db.events.put({ ...existing, status: op.status });
      return;
    }
    case 'delete': {
      await db.events.delete(op.eventId);
      return;
    }
    case 'consumeMaybeItem': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      await db.snapshotMeta.put({
        ...meta,
        maybeItems: meta.maybeItems.map((m) =>
          m.id === op.maybeItemId ? { ...m, consumed: true } : m,
        ),
      });
      return;
    }
    case 'createMaybeItem': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta || !op.input.id) return;
      const id = op.input.id;
      const existing = meta.maybeItems.find((m) => m.id === id);
      const item = { consumed: false, ...existing, ...op.input, id, tripId } as MaybeItem;
      const maybeItems = existing
        ? meta.maybeItems.map((m) => (m.id === id ? item : m))
        : [...meta.maybeItems, item];
      await db.snapshotMeta.put({ ...meta, maybeItems });
      return;
    }
    case 'deleteMaybeItem': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      await db.snapshotMeta.put({
        ...meta,
        maybeItems: meta.maybeItems.filter((m) => m.id !== op.maybeItemId),
      });
      return;
    }
    case 'updateTrip': {
      const meta = await db.snapshotMeta.get(tripId);
      if (meta) await db.snapshotMeta.put({ ...meta, trip: { ...meta.trip, ...op.input } });
      // Keep the all-trips list coherent too (name/dates/icon show there).
      const listed = await db.tripList.get(tripId);
      if (listed) await db.tripList.put({ ...listed, ...op.input });
      return;
    }
    case 'setMemberRole': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      await db.snapshotMeta.put({
        ...meta,
        members: meta.members.map((m) => (m.userId === op.userId ? { ...m, role: op.role } : m)),
      });
      return;
    }
    case 'removeMember': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      await db.snapshotMeta.put({
        ...meta,
        members: meta.members.filter((m) => m.userId !== op.userId),
      });
      return;
    }
    case 'deleteTrip': {
      await clearTripCache(tripId);
      return;
    }
    // Index writes (ADR-0047/0048). ponytail: the booking row / place is mirrored,
    // but a seeded linked event's offline coherence is deferred to the booking-form
    // checkpoint — online, the WS echo mirrors the event either way.
    case 'createBooking': {
      if (!op.input.id) return;
      const { event: _seed, ...fields } = op.input;
      const existing = await db.bookings.get(op.input.id);
      await db.bookings.put({ ...existing, ...fields, tripId, id: op.input.id } as Booking);
      return;
    }
    case 'updateBooking': {
      const existing = await db.bookings.get(op.bookingId);
      if (existing) {
        const { event: _seed, ...fields } = op.input;
        await db.bookings.put({ ...existing, ...fields });
      }
      return;
    }
    case 'deleteBooking': {
      await db.bookings.delete(op.bookingId);
      return;
    }
    case 'createPlace': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta || !op.input.id) return;
      const id = op.input.id;
      const existing = meta.places.find((p) => p.id === id);
      const place = { ...existing, ...op.input, id, tripId } as Place;
      const places = existing
        ? meta.places.map((p) => (p.id === id ? place : p))
        : [...meta.places, place];
      await db.snapshotMeta.put({ ...meta, places });
      return;
    }
    case 'updatePlace': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      await db.snapshotMeta.put({
        ...meta,
        places: meta.places.map((p) => (p.id === op.placeId ? { ...p, ...op.input } : p)),
      });
      return;
    }
  }
}
