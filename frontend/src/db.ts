import Dexie, { type Table } from 'dexie';
import type { Booking, TripDocument, TripEvent } from '@waypoint/shared';
import type { OutboxEntry } from './lib/outbox';

// Offline cache scaffold (ADR: offline-first index/documents).
// Stores are filled out as sync lands — see docs/architecture/sync-and-offline.md.
export class WaypointDB extends Dexie {
  events!: Table<TripEvent, string>;
  bookings!: Table<Booking, string>;
  documents!: Table<TripDocument, string>;
  // T-013: offline write outbox, `seq` (auto-increment) is the FIFO order.
  outbox!: Table<OutboxEntry, number>;

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
  }
}

export const db = new WaypointDB();
