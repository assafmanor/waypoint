// Offline write outbox (T-013, sync-and-offline.md "Write offline"). Flush
// reuses lib/api.ts's REST functions directly — verbs.ts stays the only place
// that builds optimistic dispatch + undo.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  CreateBookingInput,
  CreateDocumentInput,
  CreateEventInput,
  CreateMaybeItemInput,
  CreatePlaceInput,
  DocumentType,
  EventStatus,
  MembershipRole,
  MoveEventInput,
  UpdateBookingInput,
  UpdateEventInput,
  UpdatePlaceInput,
  UpdateTripInput,
} from '@waypoint/shared';
import { db } from '../db';
import {
  ApiError,
  consumeMaybeItem,
  createBooking,
  createEvent,
  createMaybeItem,
  createPlace,
  deleteBooking,
  deleteEvent,
  deleteMaybeItem,
  deleteTrip,
  moveEvent,
  removeMember,
  setEventStatus,
  setMemberRole,
  updateBooking,
  updateEvent,
  updatePlace,
  updateTrip,
  uploadDocument,
} from './api';
import { applyOutboxOpToCache } from './cache';

export type OutboxOp =
  | { verb: 'create'; input: CreateEventInput }
  | { verb: 'update'; eventId: string; input: UpdateEventInput; confirm: boolean }
  | { verb: 'setStatus'; eventId: string; status: EventStatus }
  | { verb: 'move'; eventId: string; input: MoveEventInput; confirm: boolean }
  | { verb: 'delete'; eventId: string; confirm: boolean }
  | { verb: 'consumeMaybeItem'; maybeItemId: string }
  // Maybe-shelf build actions (Plan-mode Tier 3) — offline-capable (ADR-0042).
  | { verb: 'createMaybeItem'; input: CreateMaybeItemInput }
  | { verb: 'deleteMaybeItem'; maybeItemId: string }
  // Trip-settings mutations (ADR-0039) — offline-capable like the timeline.
  | { verb: 'updateTrip'; input: UpdateTripInput }
  | { verb: 'setMemberRole'; userId: string; role: MembershipRole }
  | { verb: 'removeMember'; userId: string }
  | { verb: 'deleteTrip' }
  // Index writes (ADR-0047/0048) — bookings + places, offline-capable.
  | { verb: 'createBooking'; input: CreateBookingInput }
  | { verb: 'updateBooking'; bookingId: string; input: UpdateBookingInput }
  | { verb: 'deleteBooking'; bookingId: string; confirm: boolean; deleteEvents: boolean }
  | { verb: 'createPlace'; input: CreatePlaceInput }
  | { verb: 'updatePlace'; placeId: string; input: UpdatePlaceInput }
  // Document upload (ADR-0056) — the first outbox op to carry binary: the file
  // rides as a `File` (a `Blob`, which Dexie persists) so the sheet can close
  // instantly and the upload flushes in the background / on reconnect.
  | { verb: 'uploadDocument'; input: CreateDocumentInput; file: File };

export interface OutboxEntry {
  seq?: number;
  tripId: string;
  op: OutboxOp;
}

/** A `fetch` network failure (offline, DNS, dropped connection) vs. a real HTTP
 *  error response — only the former should be queued instead of surfaced. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Live `online`/`offline` status for UI (an obvious "you're offline" badge,
 *  distinct from the outbox count — you can be offline with nothing queued yet). */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(isOffline);
  useEffect(() => {
    const update = () => setOffline(isOffline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return offline;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let pendingCount = 0;

function setPendingCount(n: number): void {
  pendingCount = n;
  listeners.forEach((l) => l());
}

/** Primes the in-memory count from IndexedDB so a queue left over from a
 *  previous session (closed while offline) shows up without a first mutation. */
export async function initOutboxCount(): Promise<void> {
  setPendingCount(await db.outbox.count());
}

export function subscribeOutboxCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutboxCount(): number {
  return pendingCount;
}

export function useOutboxCount(): number {
  return useSyncExternalStore(subscribeOutboxCount, getOutboxCount);
}

export async function enqueueOutbox(tripId: string, op: OutboxOp): Promise<void> {
  await db.outbox.add({ tripId, op });
  // Mirror the queued change into the read cache so a reopen while still offline
  // shows it (best-effort — a cache failure must not block queueing the write).
  try {
    await applyOutboxOpToCache(tripId, op);
  } catch {
    // ignore — the outbox entry is the source of truth; the cache is a mirror.
  }
  setPendingCount(pendingCount + 1);
}

/** A queued-but-not-yet-flushed document upload, surfaced to `DocumentsSection`
 *  so it can render an optimistic "uploading" row (ADR-0056). Client-only —
 *  pending state never becomes a shared entity. */
export interface PendingUpload {
  seq: number;
  tripId: string;
  id: string;
  type: DocumentType;
  title: string;
  mimeType: string;
  sizeBytes: number;
}

/** The queued uploads for a trip, in FIFO order — read straight from the outbox
 *  so they survive a reopen while still offline. */
export async function readPendingUploads(tripId: string): Promise<PendingUpload[]> {
  const entries = await db.outbox.where('tripId').equals(tripId).sortBy('seq');
  const uploads: PendingUpload[] = [];
  for (const entry of entries) {
    if (entry.op.verb !== 'uploadDocument') continue;
    const { input, file } = entry.op;
    uploads.push({
      seq: entry.seq!,
      tripId: entry.tripId,
      id: input.id ?? String(entry.seq),
      type: input.type,
      title: input.title,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  }
  return uploads;
}

/** Live pending uploads for a trip: re-reads whenever the outbox changes (an
 *  enqueue adds one; a successful flush or a 4xx-drop removes it). */
export function usePendingUploads(tripId: string): PendingUpload[] {
  const count = useOutboxCount();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  useEffect(() => {
    let cancelled = false;
    void readPendingUploads(tripId).then((u) => {
      if (!cancelled) setUploads(u);
    });
    return () => {
      cancelled = true;
    };
    // `count` re-runs the read on every outbox change (see the doc comment).
  }, [tripId, count]);
  return uploads;
}

/** Queue a document upload (ADR-0056): the sheet closes instantly, the file rides
 *  the outbox, and — when online — we kick a background flush right away rather
 *  than waiting for the next reconnect. Offline, it sits queued until reconnect
 *  like any other write, flushed device-wide by `flushAllOutbox`. */
export async function queueDocumentUpload(
  tripId: string,
  input: CreateDocumentInput,
  file: File,
): Promise<void> {
  await enqueueOutbox(tripId, { verb: 'uploadDocument', input, file });
  if (!isOffline()) void flushOutbox(tripId);
}

/** Run a write, or queue it for later if we're offline / the fetch fails at the
 *  network layer (a real HTTP error still rejects). Returns the server result,
 *  or `undefined` when the op was queued (sync-and-offline.md "Write offline").
 *  Shared by the event verbs (verbs.ts) and the trip-settings verbs. */
export async function restOrQueue<T>(
  tripId: string,
  op: OutboxOp,
  call: () => Promise<T>,
): Promise<T | undefined> {
  if (isOffline()) {
    await enqueueOutbox(tripId, op);
    return undefined;
  }
  try {
    return await call();
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOutbox(tripId, op);
      return undefined;
    }
    throw err;
  }
}

async function runOp(tripId: string, op: OutboxOp): Promise<void> {
  switch (op.verb) {
    case 'create':
      await createEvent(tripId, op.input);
      return;
    case 'update':
      await updateEvent(tripId, op.eventId, op.input, op.confirm);
      return;
    case 'setStatus':
      await setEventStatus(tripId, op.eventId, op.status);
      return;
    case 'move':
      await moveEvent(tripId, op.eventId, op.input, op.confirm);
      return;
    case 'delete':
      await deleteEvent(tripId, op.eventId, op.confirm);
      return;
    case 'consumeMaybeItem':
      await consumeMaybeItem(tripId, op.maybeItemId);
      return;
    case 'createMaybeItem':
      await createMaybeItem(tripId, op.input);
      return;
    case 'deleteMaybeItem':
      await deleteMaybeItem(tripId, op.maybeItemId);
      return;
    case 'updateTrip':
      await updateTrip(tripId, op.input);
      return;
    case 'setMemberRole':
      await setMemberRole(tripId, op.userId, op.role);
      return;
    case 'removeMember':
      await removeMember(tripId, op.userId);
      return;
    case 'deleteTrip':
      await deleteTrip(tripId);
      return;
    case 'createBooking':
      await createBooking(tripId, op.input);
      return;
    case 'updateBooking':
      await updateBooking(tripId, op.bookingId, op.input);
      return;
    case 'deleteBooking':
      await deleteBooking(tripId, op.bookingId, {
        confirm: op.confirm,
        deleteEvents: op.deleteEvents,
      });
      return;
    case 'createPlace':
      await createPlace(tripId, op.input);
      return;
    case 'updatePlace':
      await updatePlace(tripId, op.placeId, op.input);
      return;
    case 'uploadDocument':
      // The client-generated id makes this re-POST idempotent (ADR-0056): a retry
      // after the first attempt already landed is treated as already-applied
      // server-side rather than creating a second document / blob.
      await uploadDocument(tripId, op.input, op.file);
      return;
  }
}

/** Flushes queued mutations for a trip in FIFO order. A transient/server error
 *  (network failure, 5xx) halts the flush and leaves the remaining queue
 *  (including the failed entry) in place — the caller retries the whole flush
 *  later rather than skipping ahead and breaking ordering. A duplicate re-POST
 *  of a `create` is idempotent (the backend treats the client-generated id's
 *  unique-constraint hit as already applied — ADR-0018) so it needs no special
 *  handling here.
 *
 *  A 4xx rejection (e.g. MOVE_INTO_PAST — the target time was valid when
 *  queued offline but has since passed) can never succeed on retry: waiting
 *  longer only makes it more stale. Halting on it would wedge the whole queue
 *  forever behind an unfixable entry, so it's dropped instead and the flush
 *  continues (sync-and-offline.md "Conflicts on flush ... anything surprising
 *  is undoable"). */
// Coalesce concurrent flushes of the same trip: the global reconnect flush and
// a mounted trip's own reconnect handler can both fire on `online`, and running
// two FIFO drains over the same queue would double-POST. Same tripId → same
// in-flight promise.
const inFlightFlush = new Map<string, Promise<void>>();

export function flushOutbox(tripId: string): Promise<void> {
  const existing = inFlightFlush.get(tripId);
  if (existing) return existing;
  const p = doFlushOutbox(tripId).finally(() => inFlightFlush.delete(tripId));
  inFlightFlush.set(tripId, p);
  return p;
}

/** Flush every trip's queue (device-wide), not just the mounted one — so a write
 *  queued offline syncs the moment connectivity returns, even from the all-trips
 *  list or zero-state where no trip realtime effect is mounted (ADR-0042). One
 *  trip's stuck queue (halted on a hard error) doesn't block the others. */
export async function flushAllOutbox(): Promise<void> {
  const all = await db.outbox.toArray();
  const tripIds = [...new Set(all.map((e) => e.tripId))];
  await Promise.all(tripIds.map((id) => flushOutbox(id).catch(() => {})));
}

async function doFlushOutbox(tripId: string): Promise<void> {
  const entries = await db.outbox.where('tripId').equals(tripId).sortBy('seq');
  for (const entry of entries) {
    try {
      await runOp(tripId, entry.op);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        await db.outbox.delete(entry.seq!);
        setPendingCount(pendingCount - 1);
        continue;
      }
      throw err;
    }
    await db.outbox.delete(entry.seq!);
    setPendingCount(pendingCount - 1);
  }
}

// ponytail: fire-and-forget priming; a rejection here (e.g. no IndexedDB) just
// leaves the count at 0 rather than crashing module load.
void initOutboxCount().catch(() => {});
