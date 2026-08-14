import type { Trip } from '@waypoint/shared';
import { apiFetch } from './api';
import { createByteCache, type ByteCacheMeta } from './byte-cache';
import { getNow } from './useClock';

export const MAP_ARCHIVE_BUDGET_BYTES = 512 * 1024 * 1024;
export const ENDED_TRIP_ARCHIVE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const cache = createByteCache<MapArchiveMeta>('waypoint-map-archives-v1');

export interface MapArchiveMeta extends ByteCacheMeta {
  kind: 'world' | 'extract';
  tripId?: string;
  downloadedAt: number;
}

export type MapArchiveDownloadResult =
  | { status: 'stored'; sizeBytes: number }
  | { status: 'preparing'; retryAfterSeconds: number }
  | { status: 'no-space'; sizeBytes: number };

function retryAfterSeconds(response: Response): number {
  const value = response.headers.get('Retry-After');
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  if (value) {
    const delay = Date.parse(value) - getNow();
    if (Number.isFinite(delay) && delay > 0) return Math.ceil(delay / 1000);
  }
  return 5;
}

function responseSize(response: Response): number {
  const size = Number(response.headers.get('Content-Length'));
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('Map archive response has no usable Content-Length');
  }
  return size;
}

function isPinned(entry: MapArchiveMeta, currentTripId?: string): boolean {
  return entry.kind === 'world' || entry.tripId === currentTripId;
}

async function hasStorageHeadroom(sizeBytes: number): Promise<boolean> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage) return true;
  try {
    await storage.persist?.();
    const estimate = await storage.estimate?.();
    if (estimate?.quota == null || estimate.usage == null) return true;
    return estimate.quota - estimate.usage >= sizeBytes;
  } catch {
    return true;
  }
}

export async function downloadMapArchive(opts: {
  url: string;
  kind: MapArchiveMeta['kind'];
  tripId?: string;
  currentTripId?: string;
  now?: number;
  budgetBytes?: number;
}): Promise<MapArchiveDownloadResult> {
  const response = await apiFetch(opts.url);
  if (response.status === 503) {
    return { status: 'preparing', retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) throw new Error(`Map archive download failed (${response.status})`);

  const sizeBytes = responseSize(response);
  if (!(await hasStorageHeadroom(sizeBytes))) return { status: 'no-space', sizeBytes };
  const room = await cache.makeRoom({
    budgetBytes: opts.budgetBytes ?? MAP_ARCHIVE_BUDGET_BYTES,
    incomingBytes: sizeBytes,
    replacingKey: opts.url,
    pinned: (entry) => isPinned(entry, opts.currentTripId),
  });
  if (!room) return { status: 'no-space', sizeBytes };

  const now = opts.now ?? getNow();
  await cache.put(opts.url, response, {
    key: opts.url,
    sizeBytes,
    lastUsedAt: now,
    downloadedAt: now,
    kind: opts.kind,
    tripId: opts.tripId,
  });
  return { status: 'stored', sizeBytes };
}

export function readLocalMapArchive(url: string, now?: number) {
  return cache.read(url, now);
}

export function listMapArchives(): Promise<MapArchiveMeta[]> {
  return cache.entries();
}

export function removeMapArchive(url: string): Promise<void> {
  return cache.remove(url);
}

export async function removeTripMapArchives(tripId: string): Promise<void> {
  const entries = await cache.entries();
  await Promise.all(
    entries.filter((entry) => entry.tripId === tripId).map((entry) => cache.remove(entry.key)),
  );
}

export function clearAllMapArchives(): Promise<void> {
  return cache.clear();
}

export async function retainMapArchives(opts: {
  trips: Trip[];
  currentTripId?: string;
  now?: number;
  budgetBytes?: number;
}): Promise<void> {
  const now = opts.now ?? getNow();
  const trips = new Map(opts.trips.map((trip) => [trip.id, trip]));
  const entries = await cache.entries();

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.kind !== 'extract' || entry.tripId === opts.currentTripId) return;
      const trip = entry.tripId ? trips.get(entry.tripId) : undefined;
      const endedAt = trip?.endDate ? Date.parse(`${trip.endDate}T23:59:59.999Z`) : Number.NaN;
      if (!trip || (Number.isFinite(endedAt) && endedAt + ENDED_TRIP_ARCHIVE_GRACE_MS < now)) {
        await cache.remove(entry.key);
      }
    }),
  );

  await cache.makeRoom({
    budgetBytes: opts.budgetBytes ?? MAP_ARCHIVE_BUDGET_BYTES,
    incomingBytes: 0,
    pinned: (entry) => isPinned(entry, opts.currentTripId),
  });
}

export async function seedMapArchiveForTests(
  url: string,
  sizeBytes: number,
  opts: { kind: MapArchiveMeta['kind']; tripId?: string; now?: number },
): Promise<void> {
  const now = opts.now ?? getNow();
  await cache.put(url, new Response(new Uint8Array(sizeBytes)), {
    key: url,
    sizeBytes,
    lastUsedAt: now,
    downloadedAt: now,
    kind: opts.kind,
    tripId: opts.tripId,
  });
}
