// Offline read cache (T-058, sync-and-offline.md "Read"): mirrors the trip
// snapshot into Dexie on every successful fetch/change/resync so the app can
// render the last-known state with zero connectivity.
import {
  EVENT_STATUS,
  type Booking,
  type Change,
  type MaybeItem,
  type Membership,
  type Trip,
  type TripEvent,
  type TripNote,
  type TripSnapshot,
  type User,
} from '@waypoint/shared';
import { db } from '../db';
import { fetchTrips } from './api';
import type { OutboxOp } from './outbox';

/** The slice of TripSnapshot with no dedicated Dexie table of its own. */
export interface SnapshotMeta {
  tripId: string;
  trip: Trip;
  members: Membership[];
  users: User[];
  maybeItems: MaybeItem[];
  notes: TripNote[];
  latestSeq: string;
}

/** Wholesale mirror on every snapshot fetch/resync — a trip is a few hundred
 *  small rows, so replace-all is simpler and cheap enough (ADR-0018). */
export async function cacheSnapshot(tripId: string, snapshot: TripSnapshot): Promise<void> {
  await db.transaction('rw', db.events, db.bookings, db.snapshotMeta, async () => {
    await db.events.where('tripId').equals(tripId).delete();
    await db.events.bulkAdd(snapshot.events);
    await db.bookings.where('tripId').equals(tripId).delete();
    await db.bookings.bulkAdd(snapshot.bookings);
    await db.snapshotMeta.put({
      tripId,
      trip: snapshot.trip,
      members: snapshot.members,
      users: snapshot.users,
      maybeItems: snapshot.maybeItems,
      notes: snapshot.notes,
      latestSeq: snapshot.latestSeq,
    });
  });
}

/** Reconstructs a full TripSnapshot from cache, or null if this trip was
 *  never cached (the true first-ever-load-while-offline case). */
export async function readCachedSnapshot(tripId: string): Promise<TripSnapshot | null> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta) return null;
  const [events, bookings] = await Promise.all([
    db.events.where('tripId').equals(tripId).toArray(),
    db.bookings.where('tripId').equals(tripId).toArray(),
  ]);
  return {
    trip: meta.trip,
    members: meta.members,
    users: meta.users,
    events,
    bookings,
    maybeItems: meta.maybeItems,
    notes: meta.notes,
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
 *  snapshot (events, bookings, maybeItems, notes) — not just events — so a
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
    case 'note': {
      const meta = await db.snapshotMeta.get(tripId);
      if (!meta) return;
      const existing = meta.notes.find((n) => n.id === change.entityId);
      const next = applyToRow<TripNote>(existing, change);
      const notes = next
        ? existing
          ? meta.notes.map((n) => (n.id === next.id ? next : n))
          : [...meta.notes, next]
        : meta.notes.filter((n) => n.id !== change.entityId);
      await db.snapshotMeta.put({ ...meta, notes });
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
  }
}
