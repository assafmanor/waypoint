// Offline write outbox (T-013, sync-and-offline.md "Write offline"). Flush
// reuses lib/api.ts's REST functions directly — verbs.ts stays the only place
// that builds optimistic dispatch + undo.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  CreateEventInput,
  EventStatus,
  MoveEventInput,
  UpdateEventInput,
} from '@waypoint/shared';
import { db } from '../db';
import {
  consumeMaybeItem,
  createEvent,
  deleteEvent,
  moveEvent,
  setEventStatus,
  updateEvent,
} from './api';

export type OutboxOp =
  | { verb: 'create'; input: CreateEventInput }
  | { verb: 'update'; eventId: string; input: UpdateEventInput; confirm: boolean }
  | { verb: 'setStatus'; eventId: string; status: EventStatus }
  | { verb: 'move'; eventId: string; input: MoveEventInput; confirm: boolean }
  | { verb: 'delete'; eventId: string; confirm: boolean }
  | { verb: 'consumeMaybeItem'; maybeItemId: string };

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
  }
}

/** Flushes queued mutations for a trip in FIFO order. A hard error halts the
 *  flush and leaves the remaining queue (including the failed entry) in place
 *  — the caller retries the whole flush later rather than skipping ahead and
 *  breaking ordering. A duplicate re-POST of a `create` is idempotent (the
 *  backend treats the client-generated id's unique-constraint hit as already
 *  applied — ADR-0018) so it needs no special handling here. */
export async function flushOutbox(tripId: string): Promise<void> {
  const entries = await db.outbox.where('tripId').equals(tripId).sortBy('seq');
  for (const entry of entries) {
    await runOp(tripId, entry.op);
    await db.outbox.delete(entry.seq!);
    setPendingCount(pendingCount - 1);
  }
}

// ponytail: fire-and-forget priming; a rejection here (e.g. no IndexedDB) just
// leaves the count at 0 rather than crashing module load.
void initOutboxCount().catch(() => {});
