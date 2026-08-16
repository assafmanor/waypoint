// Offline read cache (T-058, sync-and-offline.md "Read"): mirrors the trip
// snapshot into Dexie on every successful fetch/change/resync so the app can
// render the last-known state with zero connectivity.
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  EVENT_STATUS,
  NOTE_SOURCE,
  TASK_STATUS,
  type Change,
  type DeliveredEnrichmentFields,
  type DocumentAttachment,
  type EntityType,
  type MaybeItem,
  type Membership,
  type Note,
  type Place,
  type Task,
  type Trip,
  type FxRates,
  type TripEnrichments,
  type TripSnapshot,
  type User,
} from '@waypoint/shared';
import { type Table } from 'dexie';
import { db } from '../db';
import { ACTIVE_TRIP_STORAGE_KEY, LOCAL_READ_PHASE, LOCAL_READ_TIMEOUT_MS } from '../constants';
import { fetchTrips } from './api';
import { bestEffort } from './deadline';
import { clearAllCachedDocuments } from './doc-cache';
import { clearAllMapArchives, removeTripMapArchives } from './map-archive-cache';
import { initOutboxCount, OUTBOX_VERB, type OutboxOp } from './outbox';
import { getNow } from './useClock';
import { dropNotesForHostChange } from './notes';
import { dropTasksForHostChange } from './tasks';
import { dropAttachmentsForHostChange } from './attachments';
import { clearPlaceRefsForChange, deletedPlaceId } from './place-refs';

/** The slice of TripSnapshot with no dedicated Dexie table of its own. */
export interface SnapshotMeta {
  tripId: string;
  trip: Trip;
  members: Membership[];
  users: User[];
  maybeItems: MaybeItem[];
  places: Place[];
  notes: Note[];
  /** Tasks ride `snapshotMeta` for the same reason notes do — see `CACHE_CHANNELS`. */
  tasks: Task[];
  /** The document↔host links (ADR-0173). Rides `snapshotMeta` for the same reason notes do:
   *  a trip's worth is a few dozen tiny rows, and a Dexie table of its own would cost a
   *  schema version bump plus edits to `wipeLocalData` and three transaction lists. */
  documentAttachments: DocumentAttachment[];
  /** Enrichment for the trip's places, keyed by `placeId` (ADR-0166 §6). Rides `snapshotMeta`
   *  for the same reason notes do: a trip's worth is a few dozen small entries, and a
   *  dedicated Dexie table would cost a schema version bump plus edits to `wipeLocalData` and
   *  three transaction lists. Offline reads then work unchanged, and the images they point at
   *  are same-origin and immutable, so the service worker already caches those. */
  enrichments: TripEnrichments;
  /** The world's exchange rates (ADR-0180 §7), riding `snapshotMeta` for the same reason
   *  enrichment does — one small object, and a Dexie table of its own would cost a schema
   *  version bump for it.
   *
   *  **This is what makes the rate card work offline at all.** The feed is the one part of
   *  this feature that cannot run without a network, and the app is offline-first for reads
   *  (root rule 5): mirroring the set here means a plane, a tunnel or a foreign SIM shows
   *  the last published rate with its own date on it, rather than nothing. `null` is the
   *  cold state — never fetched — and every surface treats it as a state to render. */
  fxRates: FxRates | null;
  latestSeq: string;
}

/** Wholesale mirror on every snapshot fetch/resync — a trip is a few hundred
 *  small rows, so replace-all is simpler and cheap enough (ADR-0018). */
export async function cacheSnapshot(tripId: string, snapshot: TripSnapshot): Promise<void> {
  await db.transaction('rw', db.events, db.bookings, db.documents, db.snapshotMeta, async () => {
    await db.events.where('tripId').equals(tripId).delete();
    await db.events.bulkAdd(snapshot.events);
    await db.bookings.where('tripId').equals(tripId).delete();
    await db.bookings.bulkAdd(snapshot.bookings);
    // Documents ride the snapshot (ADR-0058), summaries only — `fileRef` never
    // reaches the client (ADR-0015/0034); blob bytes cache separately (ADR-0055).
    await db.documents.where('tripId').equals(tripId).delete();
    await db.documents.bulkAdd(snapshot.documents);
    await db.snapshotMeta.put({
      tripId,
      trip: snapshot.trip,
      members: snapshot.members,
      users: snapshot.users,
      maybeItems: snapshot.maybeItems,
      places: snapshot.places,
      notes: snapshot.notes,
      tasks: snapshot.tasks,
      documentAttachments: snapshot.documentAttachments,
      enrichments: snapshot.enrichments,
      fxRates: snapshot.fxRates,
      latestSeq: snapshot.latestSeq,
    });
  });
}

/**
 * Mirror one place's enrichment into the cache (ADR-0166 §6).
 *
 * **Not a `CACHE_CHANNELS` entry, and it cannot be one.** That registry is keyed by
 * `ENTITY_TYPE` and driven by a `Change`; enrichment is deliberately outside the change log
 * — no `tripId`, no entity type, no `seq`, no action — so joining it would have meant
 * inventing a fake `Change` and a fake entity type, which is exactly the fiction §6 refuses.
 * What the registry rule is actually protecting against is per-type branching in the apply
 * path, and there is none here: enrichment has **one** declared home (`snapshotMeta`) and one
 * writer, on each side of the mirror.
 *
 * Idempotent and last-write-wins by nature: the server is the only author, so there is
 * nothing to reconcile.
 */
export async function cacheEnrichment(
  tripId: string,
  placeId: string,
  fields: DeliveredEnrichmentFields,
): Promise<void> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta) return;
  await db.snapshotMeta.put({
    ...meta,
    enrichments: { ...(meta.enrichments ?? {}), [placeId]: fields },
  });
}

/** Reconstructs a full TripSnapshot from cache, or null if this trip was
 *  never cached (the true first-ever-load-while-offline case).
 *
 *  **Bounded** (field-report #22), because this read IS the offline fallback: it runs when
 *  the network already had nothing to say, so an IndexedDB handle that goes quiet here is
 *  the boot's last chance to end. Silence answers null — the same as never cached — which
 *  the boot already renders as a retryable error rather than a spinner. */
export function readCachedSnapshot(tripId: string): Promise<TripSnapshot | null> {
  return bestEffort(
    LOCAL_READ_PHASE.SNAPSHOT,
    LOCAL_READ_TIMEOUT_MS.SNAPSHOT,
    () => reconstructSnapshot(tripId),
    null,
  );
}

async function reconstructSnapshot(tripId: string): Promise<TripSnapshot | null> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta) return null;
  const [events, bookings, documents] = await Promise.all([
    db.events.where('tripId').equals(tripId).toArray(),
    db.bookings.where('tripId').equals(tripId).toArray(),
    db.documents.where('tripId').equals(tripId).toArray(),
  ]);
  return {
    trip: meta.trip,
    members: meta.members,
    users: meta.users,
    events,
    bookings,
    documents,
    maybeItems: meta.maybeItems,
    places: meta.places,
    // A trip cached before notes shipped has no list; treat it as empty rather than
    // letting `undefined` reach a `.map()` on the first render after the upgrade.
    notes: meta.notes ?? [],
    // Same fallback, same reason: a trip cached before tasks shipped has no list.
    tasks: meta.tasks ?? [],
    // Same fallback, same reason: a trip cached before attachments shipped has no list.
    documentAttachments: meta.documentAttachments ?? [],
    // Same fallback, same reason: a trip cached before enrichment shipped has no map.
    enrichments: meta.enrichments ?? {},
    // Same fallback, same reason: a trip cached before rates shipped has no set, and
    // `null` is already this field's designed cold state rather than a special case.
    fxRates: meta.fxRates ?? null,
    latestSeq: meta.latestSeq,
  };
}

/** The fields of a `Change` the appliers actually read (ADR-0094). A live WS echo
 *  passes a full `Change`; an offline optimistic write passes this subset. */
export type EntityChange = Pick<Change, 'entityType' | 'entityId' | 'action' | 'after'>;

function applyToRow<T extends { id: string }>(
  existing: T | undefined,
  change: EntityChange,
): T | undefined {
  if (change.action === CHANGE_ACTION.DELETE) return undefined;
  // A change may clear a field with `null` (ADR-0107's `displayTimezone`, a trip's
  // destination); entity types use `undefined` for absent, so a raw merge would
  // cache a `null` the schema rejects on the next cold load.
  const partial = coerceClearedFields<T>(change.after);
  if (!partial) return existing;
  return { ...(existing as T), ...partial, id: change.entityId } as T;
}

/** Where each entity type's cached rows live (ADR-0094) — an own Dexie table, a
 *  list on `snapshotMeta`, or the meta `trip` scalar. The mirror of the memory
 *  channels in trip-state: one entry per entity type, so `applyChangeToCache` is
 *  a table lookup and adding/moving an entity type is a single edit here. */
type CacheRow = { id: string; tripId?: string };
type CacheChannel =
  | { table: Table<CacheRow, string> }
  | { metaList: 'maybeItems' | 'places' | 'members' | 'notes' | 'tasks' | 'documentAttachments' }
  | { metaTrip: true };

const CACHE_CHANNELS: Record<EntityType, CacheChannel> = {
  [ENTITY_TYPE.EVENT]: { table: db.events as unknown as Table<CacheRow, string> },
  [ENTITY_TYPE.BOOKING]: { table: db.bookings as unknown as Table<CacheRow, string> },
  // Documents ride the snapshot (ADR-0058), summary only — `fileRef` never
  // reaches the client (ADR-0015/0034); blob bytes cache separately (ADR-0055).
  [ENTITY_TYPE.DOCUMENT]: { table: db.documents as unknown as Table<CacheRow, string> },
  [ENTITY_TYPE.MAYBE_ITEM]: { metaList: 'maybeItems' },
  // Notes ride `snapshotMeta` rather than a table of their own (ADR-0152's reuse audit):
  // a trip's notes are a few hundred small rows, and a dedicated Dexie table would cost a
  // schema version bump plus edits to `wipeLocalData` and three transaction lists.
  [ENTITY_TYPE.NOTE]: { metaList: 'notes' },
  // Tasks ride it for the same reason notes do, and the count is smaller still — a trip's
  // worth is a few dozen rows.
  [ENTITY_TYPE.TASK]: { metaList: 'tasks' },
  // Attachments ride `snapshotMeta` for the same reason notes do (ADR-0173's reuse audit).
  [ENTITY_TYPE.DOCUMENT_ATTACHMENT]: { metaList: 'documentAttachments' },
  [ENTITY_TYPE.PLACE]: { metaList: 'places' },
  // Trip settings are data-plane (ADR-0039), so the roster + trip row stay
  // coherent too — else an offline reader shows a stale name/member on cold load.
  [ENTITY_TYPE.MEMBERSHIP]: { metaList: 'members' },
  [ENTITY_TYPE.TRIP]: { metaTrip: true },
};

/** Upsert/delete a change into one of `snapshotMeta`'s embedded lists. */
async function applyChangeToMetaList(
  tripId: string,
  listKey: 'maybeItems' | 'places' | 'members' | 'notes' | 'tasks' | 'documentAttachments',
  change: EntityChange,
): Promise<void> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta) return;
  const list = meta[listKey] as CacheRow[];
  const existing = list.find((x) => x.id === change.entityId);
  const row = applyToRow<CacheRow>(existing, change);
  const next = row && { ...row, tripId };
  const updated = next
    ? existing
      ? list.map((x) => (x.id === next.id ? next : x))
      : [...list, next]
    : list.filter((x) => x.id !== change.entityId);
  await db.snapshotMeta.put({ ...meta, [listKey]: updated } as SnapshotMeta);
}

/** The cached half of the host-cascade rule (`lib/notes.ts`'s `dropNotesForHostChange`,
 *  ADR-0152 §2). One `snapshotMeta` write, and only when a host delete actually drops
 *  something — the shared derivation returns the same array otherwise, so this reads the
 *  cache and writes nothing on every other change. */
async function dropCachedNotesForHost(tripId: string, change: EntityChange): Promise<void> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta?.notes?.length) return;
  const next = dropNotesForHostChange(meta.notes, change);
  if (next !== meta.notes) await db.snapshotMeta.put({ ...meta, notes: next });
}

/** The same rule for tasks (ADR-0191). A separate function rather than a branch inside the
 *  one above, because the two write different `snapshotMeta` fields — the shared half is
 *  `dropHostedForHostChange`, which both derivations call. */
async function dropCachedTasksForHost(tripId: string, change: EntityChange): Promise<void> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta?.tasks?.length) return;
  const next = dropTasksForHostChange(meta.tasks, change);
  if (next !== meta.tasks) await db.snapshotMeta.put({ ...meta, tasks: next });
}

/** The attachment cascade's cache half (`lib/attachments.ts`'s `dropAttachmentsForHostChange`,
 *  ADR-0173 §7) — the same shape as the note cascade above, and the same "only write when
 *  something actually went" discipline, since the shared derivation returns the identical
 *  array otherwise. */
async function dropCachedAttachmentsForHost(tripId: string, change: EntityChange): Promise<void> {
  const meta = await db.snapshotMeta.get(tripId);
  if (!meta?.documentAttachments?.length) return;
  const next = dropAttachmentsForHostChange(meta.documentAttachments, change);
  if (next !== meta.documentAttachments)
    await db.snapshotMeta.put({ ...meta, documentAttachments: next });
}

/** The place cascade's cache half (`lib/place-refs.ts`'s `clearPlaceRefsForChange`,
 *  ADR-0157 §3) — the same shape as the note cascade above, over the three stores that hold
 *  a place FK. Two tables and one meta list, each written only when the delete actually
 *  cleared something, so a change that is not a place delete costs three reads and no write.
 *  A `deletedPlaceId` test up front keeps even those off the common path. */
async function clearCachedPlaceRefs(tripId: string, change: EntityChange): Promise<void> {
  if (!deletedPlaceId(change)) return;
  const scoped = <T extends CacheRow>(table: Table<T, string>) =>
    table.where('tripId').equals(tripId).toArray();
  const [events, bookings] = await Promise.all([scoped(db.events), scoped(db.bookings)]);
  const nextEvents = clearPlaceRefsForChange(events, ENTITY_TYPE.EVENT, change);
  const nextBookings = clearPlaceRefsForChange(bookings, ENTITY_TYPE.BOOKING, change);
  if (nextEvents !== events) await db.events.bulkPut(nextEvents);
  if (nextBookings !== bookings) await db.bookings.bulkPut(nextBookings);

  const meta = await db.snapshotMeta.get(tripId);
  if (!meta?.maybeItems?.length) return;
  const maybeItems = clearPlaceRefsForChange(meta.maybeItems, ENTITY_TYPE.MAYBE_ITEM, change);
  if (maybeItems !== meta.maybeItems) await db.snapshotMeta.put({ ...meta, maybeItems });
}

/** Keeps the Dexie cache coherent with every data-plane entity type in the
 *  snapshot so a change (a WS echo or an offline optimistic write) never silently
 *  falls out of the offline cache. Table-driven off `CACHE_CHANNELS`. */
export async function applyChangeToCache(tripId: string, change: EntityChange): Promise<void> {
  // The host cascade's cache half (ADR-0152 §2) — BEFORE the channel dispatch, because a
  // host's delete is routed to the host's own channel and would otherwise leave its notes
  // in the cache with nothing to remove them: the database cascade writes no `Change` rows
  // of its own. A no-op for every change that is not a host delete.
  await dropCachedNotesForHost(tripId, change);
  await dropCachedTasksForHost(tripId, change);
  // The third member of the same family (ADR-0173 §7), here for exactly the reason above: a
  // deleted booking's or document's links belong to neither of their channels, and the
  // database cascade that removes them writes no `Change` of its own.
  await dropCachedAttachmentsForHost(tripId, change);
  // Its twin for the place FKs (ADR-0157 §3), here for the same reason and in the same
  // position: a deleted place's change is routed to the place channel, and the events,
  // bookings and ideas it leaves pointing at nothing belong to none of them.
  await clearCachedPlaceRefs(tripId, change);
  const channel = CACHE_CHANNELS[change.entityType];
  if (!channel) return;
  if ('table' in channel) {
    const existing = await channel.table.get(change.entityId);
    const next = applyToRow<CacheRow>(existing, change);
    if (next) await channel.table.put({ ...next, tripId });
    else await channel.table.delete(change.entityId);
    return;
  }
  if ('metaList' in channel) {
    await applyChangeToMetaList(tripId, channel.metaList, change);
    return;
  }
  // A trip delete wipes everything for this trip; drop the cache entirely.
  if (change.action === CHANGE_ACTION.DELETE) {
    await clearTripCache(tripId);
    return;
  }
  const partial = coerceTripPatch(change.after);
  if (!partial) return;
  const meta = await db.snapshotMeta.get(tripId);
  if (meta) await db.snapshotMeta.put({ ...meta, trip: { ...meta.trip, ...partial } });
  // The all-trips list shows a trip's name/dates/icon too — keep it coherent so a
  // rename doesn't snap back on the next cold load (matches the offline path).
  const listed = await db.tripList.get(tripId);
  if (listed) await db.tripList.put({ ...listed, ...partial });
}

/** A **clearable** field crosses the wire as `null` (a trip's destination,
 *  an event's `displayTimezone` — the "unset me" signal an absent key can't
 *  express), but local entities use `undefined` for absent. Coerce a patch so a
 *  cleared field overwrites as `undefined` — the key stays present, so the merge
 *  still removes the old value — rather than persisting a `null` the entity type
 *  doesn't allow. One helper for every entity with a clearable field: the trip
 *  cache/memory merges and the optimistic event update both route through it. */
export function coerceClearedFields<T>(patch: unknown): Partial<T> | undefined {
  if (patch == null) return undefined;
  return Object.fromEntries(
    Object.entries(patch as Record<string, unknown>).map(([k, v]) => [k, v ?? undefined]),
  ) as Partial<T>;
}

/** `coerceClearedFields` bound to `Trip` — the trip change/patch call sites. */
export const coerceTripPatch = (after: unknown): Partial<Trip> | undefined =>
  coerceClearedFields<Trip>(after);

/** Wipes every trace of the signed-in session's local data (sign-out / session
 *  loss, F-01): all Dexie tables, the per-device active-trip pointer, and the
 *  decrypted document blobs, then re-primes the (now empty) outbox badge. Each
 *  subsystem is isolated so one failure can't leave another's data behind. */
export async function wipeLocalData(): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [db.events, db.bookings, db.documents, db.snapshotMeta, db.tripList, db.outbox],
      async () => {
        await Promise.all([
          db.events.clear(),
          db.bookings.clear(),
          db.documents.clear(),
          db.snapshotMeta.clear(),
          db.tripList.clear(),
          db.outbox.clear(),
        ]);
      },
    );
  } catch {
    // best-effort: fall through to the other subsystems below.
  }
  try {
    localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch {
    // ignore
  }
  await clearAllCachedDocuments();
  await clearAllMapArchives().catch(() => {});
  await initOutboxCount().catch(() => {});
}

/** Drops every cached row for a trip (used when the trip is deleted). */
export async function clearTripCache(tripId: string): Promise<void> {
  await db.transaction('rw', db.events, db.bookings, db.snapshotMeta, db.tripList, async () => {
    await db.events.where('tripId').equals(tripId).delete();
    await db.bookings.where('tripId').equals(tripId).delete();
    await db.snapshotMeta.delete(tripId);
    await db.tripList.delete(tripId);
  });
  await removeTripMapArchives(tripId).catch(() => {});
}

// --- Trip-list cache (offline all-trips + boot resolution) -------------------
// GET /trips has no snapshot to fall back on of its own, so a fetch failure used
// to collapse to an empty list — ZeroState on a cold reopen, an empty all-trips
// view, and "lost" trips after returning from settings. Mirror the last-known
// list so those surfaces read from cache when the network is gone.

/** Wholesale mirror of the last successful GET /trips. */
export async function cacheTripList(trips: Trip[]): Promise<void> {
  await db.transaction('rw', db.tripList, async () => {
    await db.tripList.clear();
    await db.tripList.bulkPut(trips);
  });
}

/** Last-known trip list, or [] if none was ever cached. */
export async function readCachedTripList(): Promise<Trip[]> {
  return db.tripList.toArray();
}

/** Fetch the trip list, mirroring it on success and falling back to the cached
 *  copy when the network is gone — the single loader RootSurface and AllTrips
 *  share so both stay coherent offline. `fromCache` lets a caller show an
 *  "offline, showing saved trips" cue. */
export async function loadTripList(): Promise<{ trips: Trip[]; fromCache: boolean }> {
  try {
    const trips = await fetchTrips();
    void cacheTripList(trips);
    return { trips, fromCache: false };
  } catch {
    return { trips: await readCachedTripList(), fromCache: true };
  }
}

// --- Optimistic write-through (offline writes → read cache) ------------------
// An offline write lands in the reducer (in-memory) and the outbox, but never
// touched the Dexie read cache — so a cold reopen while still offline rendered
// the pre-edit snapshot and the queued change appeared to vanish (events you
// added, a trip you renamed) until reconnect flushed the outbox. Applying the
// queued op to the cache at enqueue time keeps offline reads coherent with what
// the user just did. (Online writes don't need this: the server's own WS echo
// runs applyChangeToCache for them.)
export async function applyOutboxOpToCache(tripId: string, op: OutboxOp): Promise<void> {
  for (const change of await outboxOpToCacheChanges(tripId, op)) {
    await applyChangeToCache(tripId, change);
  }
}

/** Maps a queued outbox op to the cache Change(s) it implies (ADR-0094), so the
 *  offline mirror reuses the one registry-driven `applyChangeToCache` instead of
 *  re-implementing per-entity persistence. A booking's seeded linked event isn't
 *  here — the write verb emits it via `bookingLinkedEventChange` through the same
 *  applier. Async only for member ops, which resolve the membership id from the
 *  cached roster (the op carries `userId`; the cache keys by membership id, like
 *  the WS echo). `[]` for ops with no cached entity (a queued document upload
 *  renders as a pending row, ADR-0056, not a cached document). */
async function outboxOpToCacheChanges(tripId: string, op: OutboxOp): Promise<EntityChange[]> {
  const one = (c: EntityChange): EntityChange[] => [c];
  switch (op.verb) {
    case OUTBOX_VERB.CREATE:
      if (!op.input.id) return [];
      // A new event starts planned (the server default); the seed carries no status.
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: { ...op.input, status: EVENT_STATUS.PLANNED },
      });
    case OUTBOX_VERB.UPDATE:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.MOVE:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.MOVE,
        after: op.input,
      });
    case OUTBOX_VERB.SET_STATUS:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.STATUS,
        after: { status: op.status },
      });
    case OUTBOX_VERB.DELETE:
      return one({
        entityType: ENTITY_TYPE.EVENT,
        entityId: op.eventId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_MAYBE_ITEM:
      if (!op.input.id) return [];
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: { consumed: false, ...op.input },
      });
    case OUTBOX_VERB.CONSUME_MAYBE_ITEM:
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.maybeItemId,
        action: CHANGE_ACTION.UPDATE,
        after: { consumed: true },
      });
    case OUTBOX_VERB.RESTORE_MAYBE_ITEM:
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.maybeItemId,
        action: CHANGE_ACTION.UPDATE,
        after: { consumed: false },
      });
    case OUTBOX_VERB.UPDATE_MAYBE_ITEM:
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.maybeItemId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.DELETE_MAYBE_ITEM:
      return one({
        entityType: ENTITY_TYPE.MAYBE_ITEM,
        entityId: op.maybeItemId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_BOOKING: {
      if (!op.input.id) return [];
      const { event: _seed, ...fields } = op.input;
      return one({
        entityType: ENTITY_TYPE.BOOKING,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: fields,
      });
    }
    case OUTBOX_VERB.UPDATE_BOOKING: {
      const { event: _seed, ...fields } = op.input;
      return one({
        entityType: ENTITY_TYPE.BOOKING,
        entityId: op.bookingId,
        action: CHANGE_ACTION.UPDATE,
        after: fields,
      });
    }
    case OUTBOX_VERB.DELETE_BOOKING:
      return one({
        entityType: ENTITY_TYPE.BOOKING,
        entityId: op.bookingId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_PLACE:
      if (!op.input.id) return [];
      return one({
        entityType: ENTITY_TYPE.PLACE,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: op.input,
      });
    case OUTBOX_VERB.UPDATE_PLACE:
      return one({
        entityType: ENTITY_TYPE.PLACE,
        entityId: op.placeId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.DELETE_PLACE:
      // The cascade rides this one change, in the cache exactly as in memory: the notes
      // through `dropCachedNotesForHost` and the four place FKs through
      // `clearCachedPlaceRefs` (ADR-0157 §3), both inside `applyChangeToCache`.
      return one({
        entityType: ENTITY_TYPE.PLACE,
        entityId: op.placeId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_NOTE: {
      if (!op.input.id) return [];
      // `source` is the server's default and the seed does not carry it, so the optimistic
      // row states it — otherwise a note read back from the cache before its flush would
      // fail `noteSchema` on the next cold load.
      //
      // **And so are the timestamps, for the same reason and one worse one.** The server
      // stamps them, so a queued note cached without them came back from a cold load with
      // `createdAt: undefined` — which `Date.parse` reads as `NaN` and the elapsed ladder
      // used to render as `לפני NaN שנים`. The ladder guards itself now; this is the other
      // half, because a row with no creation time is also unsortable (`sortNotes`). Same
      // clock as the in-memory optimistic row (`trip-state`'s `createNote`), so the two
      // views of one queued note agree on when it was written.
      const stamp = new Date(getNow()).toISOString();
      return one({
        entityType: ENTITY_TYPE.NOTE,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: { ...op.input, source: NOTE_SOURCE.MEMBER, createdAt: stamp, updatedAt: stamp },
      });
    }
    case OUTBOX_VERB.UPDATE_NOTE:
      return one({
        entityType: ENTITY_TYPE.NOTE,
        entityId: op.noteId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.DELETE_NOTE:
      return one({
        entityType: ENTITY_TYPE.NOTE,
        entityId: op.noteId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.CREATE_TASK: {
      if (!op.input.id) return [];
      // The same four server defaults a queued note has to state for itself, for the same
      // reason: a task read back from the cache before its flush must still satisfy
      // `taskSchema` on a cold load, and one with no `createdAt` is unsortable. `status`
      // and the two booleans are column defaults; the stamps come off the same clock the
      // in-memory optimistic row uses, so the two views of one queued task agree.
      const stamp = new Date(getNow()).toISOString();
      return one({
        entityType: ENTITY_TYPE.TASK,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: {
          dueHasTime: false,
          important: false,
          ...op.input,
          status: TASK_STATUS.OPEN,
          createdAt: stamp,
          updatedAt: stamp,
        },
      });
    }
    case OUTBOX_VERB.UPDATE_TASK:
      return one({
        entityType: ENTITY_TYPE.TASK,
        entityId: op.taskId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.DELETE_TASK:
      return one({
        entityType: ENTITY_TYPE.TASK,
        entityId: op.taskId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.UPDATE_TRIP:
      return one({
        entityType: ENTITY_TYPE.TRIP,
        entityId: tripId,
        action: CHANGE_ACTION.UPDATE,
        after: op.input,
      });
    case OUTBOX_VERB.DELETE_TRIP:
      return one({ entityType: ENTITY_TYPE.TRIP, entityId: tripId, action: CHANGE_ACTION.DELETE });
    case OUTBOX_VERB.SET_MEMBER_ROLE:
    case OUTBOX_VERB.REMOVE_MEMBER: {
      // Resolve userId → membership id, so the offline mirror keys members the
      // same way the WS echo does (ADR-0094; consistent membership keying).
      const meta = await db.snapshotMeta.get(tripId);
      const member = meta?.members.find((m) => m.userId === op.userId);
      if (!member) return [];
      return op.verb === OUTBOX_VERB.REMOVE_MEMBER
        ? one({
            entityType: ENTITY_TYPE.MEMBERSHIP,
            entityId: member.id,
            action: CHANGE_ACTION.DELETE,
          })
        : one({
            entityType: ENTITY_TYPE.MEMBERSHIP,
            entityId: member.id,
            action: CHANGE_ACTION.UPDATE,
            after: { role: op.role },
          });
    }
    case OUTBOX_VERB.CREATE_DOCUMENT_ATTACHMENT: {
      if (!op.input.id) return [];
      // `createdAt` is the server's, so the queued row states it — otherwise a link read
      // back from the cache before its flush would fail `documentAttachmentSchema` on the
      // next cold load, and `attachmentsForHost`'s order would have nothing to sort on.
      // Same clock as the in-memory optimistic row, so the two agree.
      return one({
        entityType: ENTITY_TYPE.DOCUMENT_ATTACHMENT,
        entityId: op.input.id,
        action: CHANGE_ACTION.CREATE,
        after: { ...op.input, createdAt: new Date(getNow()).toISOString() },
      });
    }
    case OUTBOX_VERB.DELETE_DOCUMENT_ATTACHMENT:
      return one({
        entityType: ENTITY_TYPE.DOCUMENT_ATTACHMENT,
        entityId: op.attachmentId,
        action: CHANGE_ACTION.DELETE,
      });
    case OUTBOX_VERB.UPLOAD_DOCUMENT:
      return [];
  }
}
