// Offline write outbox (T-013, sync-and-offline.md "Write offline"). Flush
// reuses lib/api.ts's REST functions directly — verbs.ts stays the only place
// that builds optimistic dispatch + undo.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
  MOVE_CROSSES_DAY,
  MOVE_INTO_PAST,
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
  /** The change group this op belongs to (ADR-0092): ops from one user action
   *  share an id so the header counts them as one change. Optional — legacy
   *  entries and standalone enqueues fall back to counting per-op. */
  groupId?: string;
}

/** The entity id a queued op targets, for the id-keyed per-entity sync-status
 *  lookup (U-04, ADR-0080). Create-family ops carry the client-generated id in
 *  `input.id`; the rest name their target directly. Trip-level ops
 *  (updateTrip/deleteTrip) have no row-level entity, so they map to '' — they
 *  still surface in the review sheet by verb, never by a per-row badge. */
export function outboxOpEntityId(op: OutboxOp): string {
  switch (op.verb) {
    case 'create':
    case 'createMaybeItem':
    case 'createBooking':
    case 'createPlace':
    case 'uploadDocument':
      return op.input.id ?? '';
    case 'update':
    case 'setStatus':
    case 'move':
    case 'delete':
      return op.eventId;
    case 'consumeMaybeItem':
    case 'deleteMaybeItem':
      return op.maybeItemId;
    case 'updateBooking':
    case 'deleteBooking':
      return op.bookingId;
    case 'updatePlace':
      return op.placeId;
    case 'setMemberRole':
    case 'removeMember':
      return op.userId;
    case 'updateTrip':
    case 'deleteTrip':
      return '';
  }
}

/** Entities a queued op *derives* beyond its primary row — entities the server
 *  materializes from the op that have no op (and no id-keyed pending entry) of
 *  their own. Today: a timed booking write also creates/updates its linked event
 *  (ADR-0093), whose id rides `input.event.id`. Declared in one place so every
 *  side effect flows into the id list below automatically; a future op with side
 *  effects adds a case here and needs no change at the call sites. */
function outboxOpSideEffectIds(op: OutboxOp): string[] {
  switch (op.verb) {
    case 'createBooking':
    case 'updateBooking':
      return op.input.event?.id ? [op.input.event.id] : [];
    default:
      return [];
  }
}

/** Every entity id a queued op touches: the primary (`outboxOpEntityId`) plus all
 *  side effects. The per-entity sync status (`useSyncStatus`) keys off this, so a
 *  derived entity — e.g. an event added offline from a booking seed — shows the
 *  pending/failed marker while its write is queued, instead of looking synced. */
export function outboxOpEntityIds(op: OutboxOp): string[] {
  return [outboxOpEntityId(op), ...outboxOpSideEffectIds(op)].filter(Boolean);
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

// --- Change groups (ADR-0092). One user action can enqueue several ops — saving
// a booking authors the two places backing its route plus the booking itself —
// but that's ONE change to the user. The header "N changes waiting to sync"
// summary counts pending *groups*, not raw ops, so a one-booking flight reads as
// "1 change" not "3". `pendingCount` still tracks every op (it drives the FIFO
// flush + ordering); grouping is a display concern layered on top, robust to
// which entities are user-visible (places becoming first-class doesn't change
// the count — a place authored for a booking still belongs to that booking's
// group). Ops enqueued outside any `withChangeGroup` scope get their own unique
// group, so a standalone edit is one change. ---
const pendingGroups = new Map<string, number>();

function bumpGroup(groupId: string, delta: number): void {
  const next = (pendingGroups.get(groupId) ?? 0) + delta;
  if (next <= 0) pendingGroups.delete(groupId);
  else pendingGroups.set(groupId, next);
}

// The group ops enqueued during the current user action join. Module-level, set
// by `withChangeGroup` and restored on exit; user actions are sequential (one
// modal save at a time), so there's no interleaving to guard against.
let activeGroupId: string | undefined;

/** Run a user action so every write it enqueues counts as ONE change (ADR-0092).
 *  Wrap the action at its boundary (e.g. BookingSheet.save, which enqueues a
 *  booking plus the places backing its route). Outside a group, each enqueue is
 *  its own change. Nestable — the previous group is restored on exit. */
export async function withChangeGroup<T>(run: () => Promise<T>): Promise<T> {
  const previous = activeGroupId;
  activeGroupId = crypto.randomUUID();
  try {
    return await run();
  } finally {
    activeGroupId = previous;
  }
}

/** The group a persisted entry belongs to. Legacy entries (queued before ADR-0092,
 *  no `groupId`) fall back to a per-op key so each still counts as one change. */
function entryGroupId(entry: OutboxEntry): string {
  return entry.groupId ?? `seq:${entry.seq}`;
}

// Per-entity pending index (U-04, ADR-0080): how many queued ops target each
// entity id. Kept in memory alongside `pendingCount` so `useSyncStatus` has a
// synchronous snapshot for `useSyncExternalStore` without an async IndexedDB
// read on every render. Maintained incrementally by enqueue/flush, rebuilt by
// `initOutboxCount` from the persisted queue.
const pendingByEntity = new Map<string, number>();

function bumpPending(entityId: string, delta: number): void {
  if (!entityId) return;
  const next = (pendingByEntity.get(entityId) ?? 0) + delta;
  if (next <= 0) pendingByEntity.delete(entityId);
  else pendingByEntity.set(entityId, next);
}

/** Adjust the pending index for every entity an op touches (primary + side
 *  effects), so enqueue/flush/prime all stay in sync through one path. */
function bumpPendingForOp(op: OutboxOp, delta: number): void {
  for (const id of outboxOpEntityIds(op)) bumpPending(id, delta);
}

/** Primes the in-memory count from IndexedDB so a queue left over from a
 *  previous session (closed while offline) shows up without a first mutation.
 *  Sync failures are in-memory only (not persisted), so a fresh prime resets
 *  them too — nothing has failed to sync yet this session. */
export async function initOutboxCount(): Promise<void> {
  const entries = await db.outbox.toArray();
  pendingByEntity.clear();
  pendingGroups.clear();
  for (const entry of entries) {
    bumpPendingForOp(entry.op, 1);
    bumpGroup(entryGroupId(entry), 1);
  }
  setPendingCount(entries.length);
  clearSyncFailures();
}

// --- Failed-sync store (F-03): a queued write that hard-fails on flush with a
// non-allowlisted 4xx is invisible data loss if dropped silently. Record it in a
// persistent (session-lived) store — modeled on `pendingCount` — so the header
// can surface "N changes couldn't be saved" and the mounted trip can reconcile
// the phantom optimistic entity. ---
export interface SyncFailure {
  /** Stable key for per-item retry/dismiss in the review sheet (ADR-0080). */
  id: number;
  tripId: string;
  /** The entity the rejected write targeted — powers the id-keyed `failed`
   *  lookup so the same booking/document shows `failed` on its own row. */
  entityId: string;
  verb: OutboxOp['verb'];
  code?: string;
  /** The original op, kept so "retry" can re-enqueue the exact write (U-04
   *  dead-letter). Held in memory only, like the rest of the failure store. */
  op: OutboxOp;
}

const failureListeners = new Set<Listener>();
let syncFailures: SyncFailure[] = [];
let nextFailureId = 1;

function emitSyncFailures(): void {
  failureListeners.forEach((l) => l());
}

function recordSyncFailure(failure: Omit<SyncFailure, 'id'>): void {
  syncFailures = [...syncFailures, { id: nextFailureId++, ...failure }];
  emitSyncFailures();
}

/** Discard a single failure (user dismissed it from the review sheet). */
export function dismissSyncFailure(id: number): void {
  const next = syncFailures.filter((f) => f.id !== id);
  if (next.length === syncFailures.length) return;
  syncFailures = next;
  emitSyncFailures();
}

/** Re-enqueue a rejected write for another attempt (U-04 dead-letter retry) and
 *  drop its failure record; kicks a background flush right away when online, or
 *  leaves it queued for the next reconnect when offline. */
export async function retrySyncFailure(id: number): Promise<void> {
  const failure = syncFailures.find((f) => f.id === id);
  if (!failure) return;
  await enqueueOutbox(failure.tripId, failure.op);
  dismissSyncFailure(id);
  if (!isOffline()) void flushOutbox(failure.tripId);
}

export function subscribeSyncFailures(listener: Listener): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

export function getSyncFailures(): SyncFailure[] {
  return syncFailures;
}

/** Dismiss the recorded sync failures (user tapped the badge). */
export function clearSyncFailures(): void {
  if (syncFailures.length === 0) return;
  syncFailures = [];
  emitSyncFailures();
}

export function useSyncFailures(): SyncFailure[] {
  return useSyncExternalStore(subscribeSyncFailures, getSyncFailures);
}

// --- Per-entity sync status (U-04, ADR-0080): one derived model per entity from
// the outbox pending index + the failed store, id-keyed. `failed` outranks
// `pending` — a rejected write the user must act on beats a later queued edit to
// the same entity. ---
export type SyncState = 'synced' | 'pending' | 'failed';

export interface SyncStatus {
  state: SyncState;
  /** The server rejection code, when `state === 'failed'`. */
  reason?: string;
}

export function getSyncStatus(entityId: string): SyncStatus {
  // Match on every entity the failed op touched (primary + side effects), so a
  // rejected booking write marks its linked event failed too, not just the booking.
  const failure = syncFailures.find((f) => outboxOpEntityIds(f.op).includes(entityId));
  if (failure) return { state: 'failed', reason: failure.code };
  if ((pendingByEntity.get(entityId) ?? 0) > 0) return { state: 'pending' };
  return { state: 'synced' };
}

// A primitive snapshot key so `useSyncExternalStore` compares by value (a fresh
// object each render would loop). The hook re-inflates it to a `SyncStatus`.
function syncStatusKey(entityId: string): string {
  const status = getSyncStatus(entityId);
  return status.state === 'failed' ? `failed:${status.reason ?? ''}` : status.state;
}

function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  failureListeners.add(listener);
  return () => {
    listeners.delete(listener);
    failureListeners.delete(listener);
  };
}

/** Reactive per-entity sync status (U-04). Recomputes when the outbox or the
 *  failed store changes; reads local state only, so it works offline. */
export function useSyncStatus(entityId: string): SyncStatus {
  const key = useSyncExternalStore(subscribeSyncStatus, () => syncStatusKey(entityId));
  return useMemo(() => {
    if (key.startsWith('failed')) {
      const reason = key.slice('failed:'.length);
      return { state: 'failed', reason: reason || undefined };
    }
    return { state: key as SyncState };
  }, [key]);
}

// Known-unfixable rejections that are safe to drop quietly: a time-move that was
// valid when queued offline but has since gone stale. Retrying only makes it more
// stale, and the user already saw the optimistic move — no failure to surface.
const QUIET_DROP_CODES = new Set<string>([MOVE_INTO_PAST, MOVE_CROSSES_DAY]);

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

/** The count for the header "N changes waiting to sync" summary: pending change
 *  *groups* (ADR-0092), so one user action (a booking + the places backing its
 *  route) reads as one change. Distinct from `getOutboxCount`, the true op total
 *  that drives the flush machinery. */
export function getPendingChangeCount(): number {
  return pendingGroups.size;
}

export function usePendingChangeCount(): number {
  return useSyncExternalStore(subscribeOutboxCount, getPendingChangeCount);
}

export async function enqueueOutbox(tripId: string, op: OutboxOp): Promise<void> {
  // Join the active user action's change group, or stand alone as its own change.
  const groupId = activeGroupId ?? crypto.randomUUID();
  await db.outbox.add({ tripId, op, groupId });
  // Mirror the queued change into the read cache so a reopen while still offline
  // shows it (best-effort — a cache failure must not block queueing the write).
  try {
    await applyOutboxOpToCache(tripId, op);
  } catch {
    // ignore — the outbox entry is the source of truth; the cache is a mirror.
  }
  bumpPendingForOp(op, 1);
  bumpGroup(groupId, 1);
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
 *  A 4xx rejection can never succeed on retry, and halting on it would wedge the
 *  whole queue forever behind an unfixable entry — so it's always dropped and the
 *  flush continues. But dropping is only *silent* for a known-stale time-move
 *  (MOVE_INTO_PAST / MOVE_CROSSES_DAY): every other 4xx (a rejected create/update,
 *  a permission loss) is real, invisible data loss, so it's recorded as a sync
 *  failure the header surfaces and the trip reconciles (F-03; sync-and-offline.md
 *  "Conflicts on flush ... anything surprising is undoable"). */
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
        if (!err.code || !QUIET_DROP_CODES.has(err.code)) {
          recordSyncFailure({
            tripId,
            entityId: outboxOpEntityId(entry.op),
            verb: entry.op.verb,
            code: err.code,
            op: entry.op,
          });
        }
        await db.outbox.delete(entry.seq!);
        bumpPendingForOp(entry.op, -1);
        bumpGroup(entryGroupId(entry), -1);
        setPendingCount(pendingCount - 1);
        continue;
      }
      throw err;
    }
    await db.outbox.delete(entry.seq!);
    bumpPendingForOp(entry.op, -1);
    bumpGroup(entryGroupId(entry), -1);
    setPendingCount(pendingCount - 1);
  }
}

// ponytail: fire-and-forget priming; a rejection here (e.g. no IndexedDB) just
// leaves the count at 0 rather than crashing module load.
void initOutboxCount().catch(() => {});
