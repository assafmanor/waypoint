// Offline write outbox (T-013, sync-and-offline.md "Write offline"). Flush
// reuses lib/api.ts's REST functions directly — verbs.ts stays the only place
// that builds optimistic dispatch + undo.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  CreateEventInput,
  EventStatus,
  MembershipRole,
  MoveEventInput,
  UpdateEventInput,
  UpdateTripInput,
} from '@waypoint/shared';
import { db } from '../db';
import {
  ApiError,
  consumeMaybeItem,
  createEvent,
  deleteEvent,
  deleteTrip,
  moveEvent,
  removeMember,
  setEventStatus,
  setMemberRole,
  updateEvent,
  updateTrip,
} from './api';

export type OutboxOp =
  | { verb: 'create'; input: CreateEventInput }
  | { verb: 'update'; eventId: string; input: UpdateEventInput; confirm: boolean }
  | { verb: 'setStatus'; eventId: string; status: EventStatus }
  | { verb: 'move'; eventId: string; input: MoveEventInput; confirm: boolean }
  | { verb: 'delete'; eventId: string; confirm: boolean }
  | { verb: 'consumeMaybeItem'; maybeItemId: string }
  // Trip-settings mutations (ADR-0039) — offline-capable like the timeline.
  | { verb: 'updateTrip'; input: UpdateTripInput }
  | { verb: 'setMemberRole'; userId: string; role: MembershipRole }
  | { verb: 'removeMember'; userId: string }
  | { verb: 'deleteTrip' };

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
  setPendingCount(pendingCount + 1);
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
export async function flushOutbox(tripId: string): Promise<void> {
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
