import Dexie, { type Table } from 'dexie';
import type { Booking, DocumentSummary, Trip, TripEvent } from '@waypoint/shared';
import type { OutboxEntry } from './lib/outbox';
import type { SnapshotMeta } from './lib/cache';
import type { CachedRouteLeg } from './lib/travel';

// Offline read cache (sync-and-offline.md "Read"). events/bookings mirror the
// per-entity tables; snapshotMeta holds the rest of the snapshot (trip, members,
// users, maybeItems, places, notes, latestSeq) that has no dedicated table.
export class WaypointDB extends Dexie {
  events!: Table<TripEvent, string>;
  bookings!: Table<Booking, string>;
  // Summaries only — `fileRef` never reaches the client (ADR-0015/0034/0057);
  // blob bytes cache separately via the Cache API (ADR-0055).
  documents!: Table<DocumentSummary, string>;
  // T-013: offline write outbox, `seq` (auto-increment) is the FIFO order.
  // Entries may carry binary (a `uploadDocument` op's `File` — ADR-0056);
  // IndexedDB's structured clone persists `Blob`/`File` as-is, so no schema
  // change is needed beyond the existing `seq`/`tripId` indexes.
  outbox!: Table<OutboxEntry, number>;
  // T-058: last-known snapshot remainder, keyed by tripId.
  snapshotMeta!: Table<SnapshotMeta, string>;
  // The last-known GET /trips result, so the all-trips list and the boot
  // trip-resolution work offline (otherwise the fetch fails → empty list →
  // ZeroState / lost trip on reopen).
  tripList!: Table<Trip, string>;
  // Travel times between two coordinates (ADR-0205 §7). A table of its own rather
  // than `byte-cache` (that is for blobs) and outside `CACHE_CHANNELS` (a route is
  // not a syncable entity and has no writer on this device) — see `lib/travel.ts`.
  routeLegs!: Table<CachedRouteLeg, string>;

  constructor() {
    super('waypoint');
    this.version(1).stores({
      events: 'id, tripId, date',
      bookings: 'id, tripId',
      documents: 'id, tripId',
    });
    this.version(2).stores({
      outbox: '++seq, tripId',
    });
    this.version(3).stores({
      snapshotMeta: 'tripId',
    });
    this.version(4).stores({
      tripList: 'id',
    });
    // A version bump is a migration on every device that already has this database,
    // so this ADDS a table and renames nothing: the name and the stores above ARE
    // each user's local cache (ADR-0170), and re-spelling one wipes it.
    this.version(5).stores({
      routeLegs: 'key, cachedAt',
    });
  }
}

export const db = new WaypointDB();
