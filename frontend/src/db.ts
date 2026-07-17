import Dexie, { type Table } from 'dexie';
import type { Booking, Trip, TripDocument, TripEvent } from '@waypoint/shared';
import type { OutboxEntry } from './lib/outbox';
import type { SnapshotMeta } from './lib/cache';

// Offline read cache (sync-and-offline.md "Read"). events/bookings mirror the
// per-entity tables; snapshotMeta holds the rest of the snapshot (trip,
// members, maybeItems, notes, latestSeq) that has no dedicated table.
export class WaypointDB extends Dexie {
  events!: Table<TripEvent, string>;
  bookings!: Table<Booking, string>;
  documents!: Table<TripDocument, string>;
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
  }
}

export const db = new WaypointDB();
