// Offline read cache (T-058, sync-and-offline.md "Read"): mirrors the trip
// snapshot into Dexie on every successful fetch/change/resync so the app can
// render the last-known state with zero connectivity.
import type {
  Booking,
  Change,
  MaybeItem,
  Membership,
  Trip,
  TripEvent,
  TripNote,
  TripSnapshot,
  User,
} from '@waypoint/shared';
import { db } from '../db';

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
    default:
      return;
  }
}
