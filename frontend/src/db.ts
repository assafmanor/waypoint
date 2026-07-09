import Dexie, { type Table } from 'dexie';
import type { Booking, TripDocument, TripEvent } from '@waypoint/shared';

// Offline cache scaffold (ADR: offline-first index/documents).
// Stores are filled out as sync lands — see docs/architecture/sync-and-offline.md.
export class WaypointDB extends Dexie {
  events!: Table<TripEvent, string>;
  bookings!: Table<Booking, string>;
  documents!: Table<TripDocument, string>;

  constructor() {
    super('waypoint');
    this.version(1).stores({
      events: 'id, tripId, dayId',
      bookings: 'id, tripId',
      documents: 'id, tripId',
    });
  }
}

export const db = new WaypointDB();
