// Data layer for the read API (T-034). Writes stay local-only until T-014.
import { tripSnapshotSchema, type TripSnapshot } from '@waypoint/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const snapshotUrl = (tripId: string) => `${API_BASE_URL}/trips/${tripId}/snapshot`;

export async function fetchSnapshot(tripId: string): Promise<TripSnapshot> {
  const res = await fetch(snapshotUrl(tripId));
  if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
  return tripSnapshotSchema.parse(await res.json());
}
