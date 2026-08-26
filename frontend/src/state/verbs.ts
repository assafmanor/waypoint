// Quick verbs: optimistic dispatch + REST write, reconciled or rolled back
// (sync-and-offline.md "Optimistic updates + undo"). The `apply*`/`reverseRest`
// functions take their dependencies as plain arguments so they're testable
// without rendering a component; `useVerbs()` just wires them to context.
import { useRef } from 'react';
import {
  ENTITY_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type CreateBookingInput,
  type CreateEventInput,
  type DocumentAttachment,
  type EventCategory,
  type Note,
  type NoteHostKey,
  NOTE_HOST_KEYS,
  type MaybeItem,
  type Place,
  type TripEvent,
  type UpdateEventInput,
} from '@waypoint/shared';
import {
  useTrip,
  TRIP_ACTION,
  type Action,
  type IndexVerbs,
  type RippleSuggestion,
} from './trip-state';
import { useToast } from '../ui/Toast';
import { useConfirmHardEdit, type ConfirmHardEditAction } from '../ui/ConfirmDialog';
import {
  consumeMaybeItem,
  createEvent,
  createMaybeItem,
  deleteEvent,
  deleteMaybeItem,
  isHardEventConfirmError,
  isMoveCrossesDayError,
  isMoveIntoPastError,
  type MoveEventResult,
  moveEvent,
  restoreMaybeItem,
  setEventStatus,
  updateEvent,
  updateMaybeItem,
} from '../lib/api';
import {
  enqueueOutbox,
  isNetworkError,
  isOffline,
  OUTBOX_VERB,
  type OutboxOp,
} from '../lib/outbox';
import { generateId } from '../lib/id';
import { clearOnWay, markOnWay } from '../lib/on-way';
import { getNow } from '../lib/useClock';
import { eventDisplayZones } from '../lib/places';
import { ideaCategory, ideaGlyph } from '../lib/shelf';
import { soleIdeaFor, type PlaceLink } from '../lib/place-refs';
import { attachmentsForHost } from '../lib/attachments';
import { coerceClearedFields } from '../lib/cache';
import { isoToTimeInput, zonedIso } from '../lib/time';
import { planSwap } from '../lib/reorder';
import {
  DEFAULT_MAYBE_ICON,
  DELAY_STEP_MINUTES,
  DEFAULT_SCHEDULE_SLOT,
  CONTROL_ICON,
} from '../constants';
import { t } from '../i18n/he';
import { useAuth } from './auth-state';

type ShowToast = ReturnType<typeof useToast>;

/** Everything optional about a new shelf idea: the day-view jot passes an icon,
 *  Plan-mode place research passes the picked place (ADR-0115 §3). */
export interface AddMaybeOptions {
  icon?: string;
  category?: EventCategory;
  placeId?: string;
  /** The day we're thinking of, pencilled in (ADR-0116 §1) — not a schedule. */
  targetDate?: string;
}

type UndoDescriptor =
  | { kind: 'status'; id: string; previous: TripEvent['status'] }
  | { kind: 'move'; id: string; previous: { date: string; startsAt?: string }; isHard: boolean }
  /** An event this action created. `maybeId` is the shelf idea it CONSUMED, when the create
   *  was a schedule (ADR-0027 §2) — reversing has to put that idea back on the shelf
   *  server-side, not only in the reducer's snapshot, or the next resync re-consumes it. */
  | { kind: 'create'; id: string; maybeId?: string }
  | { kind: 'rippleApply'; items: { id: string; previous: { date: string; startsAt?: string } }[] }
  | { kind: 'update'; id: string; previous: UpdateEventInput; isHard: boolean }
  /** `notes` is the host's notes as they were AT THE DELETE, and this descriptor is the only
   *  place they still exist: the FKs cascade in Postgres and ADR-0152 §2's applier rule drops
   *  them from memory and from Dexie, so nothing can be read back at undo time.
   *
   *  `attachments` is the same fact for the document LINKS (ADR-0173 §7): captured here for
   *  the same reason and put back the same way. The documents themselves were never at risk
   *  — that is the whole point of the link row — so what the undo restores is the pointers. */
  | { kind: 'delete'; event: TripEvent; notes: Note[]; attachments: DocumentAttachment[] }
  | { kind: 'reorder'; items: { id: string; previous: UpdateEventInput; isHard: boolean }[] }
  | { kind: 'addMaybe'; id: string }
  | { kind: 'removeMaybe'; item: MaybeItem; notes: Note[] }
  /** **A deleted place, and the two things the database took with it** (ADR-0157 §4).
   *  `links` are the rows whose FK Postgres nulled and `notes` the ones it cascaded away;
   *  neither writes a `Change` row, so after the delete this descriptor is the only record
   *  that either existed. Reversing re-creates the place under its own id, hands the links
   *  back and writes the notes home — in that order, since both reference it. */
  | {
      kind: 'deletePlace';
      place: Place;
      links: PlaceLink[];
      notes: Note[];
      /** **The shelf idea the place took with it** (ADR-0157 §9), with its own cascaded
       *  notes. Deleted rather than unlinked, so it is not in `links`: the undo re-creates
       *  it under its own id and pointed back at the place, which is why the place has to
       *  come back first. */
      idea: { item: MaybeItem; notes: Note[] } | null;
    }
  | { kind: 'maybeDay'; item: MaybeItem }
  | { kind: 'park'; event: TripEvent; maybeId: string }
  /** **`החלף`** (ADR-0161 §6), which is a park and a schedule to the app and one decision to
   *  the user — so it gets one descriptor, like `book` below, and reversing it reverses both
   *  halves. The two fields are exactly the `park` and `create` descriptors those halves
   *  would each have written, and the reversal runs the same two reversals in the order that
   *  keeps every note alive. */
  | {
      kind: 'replace';
      park: { event: TripEvent; maybeId: string };
      created: { id: string; maybeId: string };
    }
  /** A booked save (ADR-0136), which is ONE action to the user and up to three writes
   *  underneath — so it gets one descriptor, and undoing it undoes all of them.
   *
   *  `event` is `null` when the server derived the linked event from a seed (a create):
   *  reversing means deleting the booking WITH its events. When it carries the converted
   *  event's previous place/category, reversing means deleting the booking and keeping the
   *  event — the server clears its `bookingId` for us — then handing those two fields back,
   *  which nothing else can restore because ADR-0048 took them off on the way in.
   *  `maybeId` is the idea the save consumed (ADR-0135 §5), if any. */
  | {
      kind: 'book';
      bookingId: string;
      event: { id: string; previous: UpdateEventInput } | null;
      maybeId: string | null;
    };

export interface VerbDeps {
  tripId: string;
  dispatch: React.Dispatch<Action>;
  toast: ShowToast;
  lastAction: { current: UndoDescriptor | null };
  confirmHardEdit: (
    event: TripEvent,
    action?: ConfirmHardEditAction,
    opts?: { notes?: number },
  ) => Promise<boolean>;
  /** The booking half of a two-entity write (ADR-0136 §3). Bookings live in trip-state's
   *  own state rather than the reducer, so both the write and its compensating delete go
   *  through the verbs that already own them — never a second optimistic path beside them
   *  (root rule 8). Only the booked save and its undo touch this. */
  bookings: Pick<IndexVerbs, 'createBooking' | 'deleteBooking' | 'updateBooking'>;
  /** The place half of the same arrangement (ADR-0157). Places live in trip-state too, and
   *  its `deletePlace` owns the local cascade as well as the write — so the verb here adds
   *  the undo and the words, and never a second optimistic path beside it (root rule 8). */
  places: Pick<IndexVerbs, 'createPlace' | 'deletePlace'>;
  /** **The notes a conversion has to carry with it** (ADR-0152 §5's 2026-08-01 amendment).
   *  Same shape and same reason as `bookings` above: notes live in trip-state, and moving
   *  one goes through the verb that already owns that write rather than a second optimistic
   *  path beside it. `list` is read to find what a host is carrying; `rehost` moves one;
   *  `recreate` writes a destroyed one back, which is what an undone host delete owes. */
  notes: {
    list: Note[];
    rehost: (note: Note, host: NoteHostPatch) => Promise<void>;
    recreate: (note: Note) => Promise<void>;
  };
  /** **The document links an undone delete owes back** (ADR-0173 §7). Same arrangement as
   *  `notes` above and for the same reason: attachments live in trip-state, so re-creating
   *  one goes through the verb that already owns that write. `list` is read at the delete
   *  (afterwards there is nowhere left to read it from); `recreate` writes one back under
   *  its original id, which keeps the re-attach idempotent on an outbox retry. */
  attachments: {
    list: DocumentAttachment[];
    recreate: (attachment: DocumentAttachment) => Promise<void>;
  };
}

/** Which FK a moved note lands on — one set, the rest explicitly `null` so the old host is
 *  cleared in the same write. Deliberately not `Partial<Record<…>>`: a conversion that
 *  forgot to clear the previous host would leave a note claiming two, which the schema
 *  refuses at the door. */
export type NoteHostPatch = Record<NoteHostKey, string | null>;

/** Every host FK nulled, then the one the note is moving to. */
export const noteHostPatch = (kind: NoteHostKey, id: string): NoteHostPatch =>
  ({ ...Object.fromEntries(NOTE_HOST_KEYS.map((k) => [k, null])), [kind]: id }) as NoteHostPatch;

/**
 * **Move every note a conversion is about to strand** (ADR-0152 §5's amendment).
 *
 * Three shipped conversions consume one entity into another: an idea scheduled into an
 * event, an event parked back onto the shelf, an idea booked. Before this, all three left
 * the notes behind — and parking was the worst of them, because it DELETES the event, so
 * the FK cascade destroyed them outright rather than merely hiding them.
 *
 * Awaited, and that is what keeps it correct offline: the outbox is FIFO, so the move has
 * to be queued AFTER the new host exists and BEFORE the old one is deleted.
 */
export async function carryNotes(
  deps: VerbDeps,
  from: { kind: NoteHostKey; id: string },
  to: { kind: NoteHostKey; id: string },
): Promise<void> {
  for (const note of notesHostedBy(deps.notes.list, from.kind, from.id)) {
    await deps.notes.rehost(note, noteHostPatch(to.kind, to.id));
  }
}

/** What this host is carrying, by FK. `lib/notes.ts`'s `notesForHost` answers the same
 *  question for a render, keyed by the host's KIND; the verbs already hold the FK, so this
 *  is the one-line version rather than a kind→key round trip at three call sites. */
export const notesHostedBy = (notes: Note[], kind: NoteHostKey, id: string): Note[] =>
  notes.filter((note) => note[kind] === id);

/**
 * **Put back the notes a host's delete destroyed** (ADR-0152 §5's 2026-08-02 amendment).
 *
 * A conversion has somewhere to move notes to; a delete does not, so `carryNotes` cannot
 * cover this and the rows really are gone — the FK cascade removes them from Postgres and
 * §2's applier rule removes them from every list the client holds. An undo that re-creates
 * only the host therefore restores less than it took, silently, on the one gesture this app
 * uses for every destructive write.
 *
 * So the undo writes them back, **with their original ids**: the create is then idempotent on
 * an outbox retry (the service treats a duplicate id as already-applied), and anything that
 * had a hold on a note id still resolves. It goes through `noteVerbs.createNote` — an
 * ordinary queued op through the ADR-0094 registry — because a cascade writes no `Change`
 * rows, so there is no echo to ride and no synthetic change to invent (ADR-0093 is for
 * entities the SERVER materializes).
 *
 * Called AFTER the host is re-created and awaited in order, for the same reason every other
 * note write in this file is: the outbox is FIFO, and a note whose host is not there yet is
 * refused at the door.
 */
export async function restoreNotes(deps: VerbDeps, notes: Note[]): Promise<void> {
  for (const note of notes) await deps.notes.recreate(note);
}

/** **Put back the document links a host's delete destroyed** (ADR-0173 §7) — `restoreNotes`'
 *  twin, for the reason its own header gives: a cascade writes no `Change` rows, so there is
 *  no echo to ride, and an undo that re-created only the host would silently restore less
 *  than it took. Re-created under their ORIGINAL ids, so an outbox retry is already-applied
 *  rather than a second link, and called AFTER the host exists, since the outbox is FIFO and
 *  a link whose host is not there yet is refused at the door.
 *
 *  Note what is NOT owed: the documents. Even a delete-both takes only the links — which is
 *  why the delete confirms say nothing about documents (§3). */
export async function restoreAttachments(
  deps: VerbDeps,
  attachments: DocumentAttachment[],
): Promise<void> {
  for (const attachment of attachments) await deps.attachments.recreate(attachment);
}

// A real HTTP error still rejects normally — only network failure/offline queues.
async function restOrQueue<T>(
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

function writeErrorToast(toast: ShowToast, err: unknown): void {
  const message = isHardEventConfirmError(err)
    ? t.toast.hardConfirmRequired
    : isMoveIntoPastError(err)
      ? t.toast.moveIntoPast
      : isMoveCrossesDayError(err)
        ? t.toast.moveCrossesDay
        : t.toast.writeFailed;
  toast(CONTROL_ICON.warn, message);
}

function toCreateEventInput(event: TripEvent): CreateEventInput {
  const {
    id,
    date,
    endDate,
    title,
    icon,
    category,
    kind,
    startsAt,
    endsAt,
    placeId,
    displayTimezone,
    bookingId,
    sortOrder,
    source,
  } = event;
  return {
    id,
    date,
    endDate,
    title,
    icon,
    category,
    kind,
    startsAt,
    endsAt,
    placeId,
    displayTimezone,
    bookingId,
    sortOrder,
    source,
  };
}

/** Two adjacent builder events swap slots (the Plan-mode reorder): if both are
 *  reorder logic (which soft event holds which slot) lives in lib/reorder.ts. */
const slotOf = (e: TripEvent): UpdateEventInput => ({
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  sortOrder: e.sortOrder,
});

export async function applySetStatus(
  deps: VerbDeps,
  event: TripEvent,
  status: TripEvent['status'],
): Promise<void> {
  deps.dispatch({ type: TRIP_ACTION.SET_STATUS, id: event.id, status });
  deps.lastAction.current = { kind: 'status', id: event.id, previous: event.status };
  try {
    const canonical = await restOrQueue(
      deps.tripId,
      { verb: OUTBOX_VERB.SET_STATUS, eventId: event.id, status },
      () => setEventStatus(deps.tripId, event.id, status),
    );
    if (canonical) deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyDelay(deps: VerbDeps, event: TripEvent, minutes: number): Promise<void> {
  const previous = { date: event.date, startsAt: event.startsAt };
  const isHard = event.kind === EVENT_KIND.HARD;
  deps.dispatch({ type: TRIP_ACTION.DELAY, id: event.id, minutes });
  deps.lastAction.current = { kind: 'move', id: event.id, previous, isHard };
  const input = { startsAt: event.startsAt ? shiftForMove(event.startsAt, minutes) : undefined };
  try {
    const result = await restOrQueue<MoveEventResult>(
      deps.tripId,
      { verb: OUTBOX_VERB.MOVE, eventId: event.id, input, confirm: isHard },
      () => moveEvent(deps.tripId, event.id, input, isHard),
    );
    if (result) {
      deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: result.event });
      deps.dispatch({ type: TRIP_ACTION.SET_RIPPLE, ripple: result.rippleSuggestion ?? null });
    }
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

// Local mirror of trip-state's shift, kept private — verbs.ts needs the target
// `startsAt` to send over the wire before the optimistic dispatch settles.
function shiftForMove(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

// Hard-event guard (ADR-0011): a hard event's delay only applies after the
// user confirms in the dialog; cancel is a true no-op (nothing dispatched,
// no REST call). Soft events skip the gate entirely. This is the single
// choke point both DayView's row and any future trigger (T-049) call through.
export async function applyGuardedDelay(
  deps: VerbDeps,
  event: TripEvent,
  minutes: number,
): Promise<boolean> {
  if (event.kind === EVENT_KIND.HARD) {
    const confirmed = await deps.confirmHardEdit(event);
    if (!confirmed) return false;
  }
  await applyDelay(deps, event, minutes);
  return true;
}

export interface ScheduleFields {
  date: string;
  title: string;
  kind: TripEvent['kind'];
  startsAt?: string;
  endsAt?: string;
  icon?: string;
  category?: EventCategory;
  placeId?: string;
  /** A zone the user pinned on the form (ADR-0107 §6) — carried onto the created
   *  event so a scheduled idea keeps the zone it was authored in. */
  displayTimezone?: string;
}

// Build the TripEvent a schedule verb dispatches. With `fields` (the builder's
// EventForm picker) the user chose the day/time/kind; without them it's the
// Trip-mode one-tap quick-schedule onto `activeDate` at the default slot — whose
// wall-clock instants must be resolved in the trip's own timezone (F-02), never
// a fixed fixture offset. Pure so the derivation is testable without the hook.
export function buildScheduleEvent(
  trip: { id: string; timezone: string },
  activeDate: string,
  m: MaybeItem,
  now: string,
  userId: string,
  fields?: ScheduleFields,
): TripEvent {
  return {
    id: generateId(),
    tripId: trip.id,
    date: fields?.date ?? activeDate,
    title: fields?.title ?? m.title,
    icon: fields?.icon ?? m.icon,
    category: fields?.category ?? m.category,
    kind: fields?.kind ?? EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    startsAt: fields
      ? fields.startsAt
      : zonedIso(activeDate, DEFAULT_SCHEDULE_SLOT.START, trip.timezone),
    endsAt: fields ? fields.endsAt : zonedIso(activeDate, DEFAULT_SCHEDULE_SLOT.END, trip.timezone),
    // A place picked in the schedule form wins over the idea's carried-over one.
    placeId: fields?.placeId ?? m.placeId,
    displayTimezone: fields?.displayTimezone,
    sortOrder: 99,
    source: EVENT_SOURCE.MAYBE_SHELF,
    createdAt: now,
    updatedAt: now,
    updatedBy: userId,
  };
}

/** Consume an idea with no event of our own to hang it on (ADR-0135 §5). The booked path
 *  needs this: a booking derives its linked event server-side, so it lands on the day and
 *  duplicates the shelf entry exactly as scheduling does — but `applySchedule`'s consume is
 *  the tail of an event create, so it cannot serve. Same outbox verb, same undo coverage. */
export async function applyConsumeMaybeItem(deps: VerbDeps, maybeId: string): Promise<void> {
  deps.dispatch({ type: TRIP_ACTION.CONSUME_MAYBE_ITEM, maybeId });
  await restOrQueue(
    deps.tripId,
    { verb: OUTBOX_VERB.CONSUME_MAYBE_ITEM, maybeItemId: maybeId },
    () => consumeMaybeItem(deps.tripId, maybeId),
  );
}

/** **A save that says the event is also booked** (ADR-0136 §1/§3). One action to the user;
 *  underneath, up to three shipped writes and exactly one undo.
 *
 *  • A **new** event → `createBooking` WITH its `event` seed. The server produces the linked
 *    pair, so this is a single write and the event never exists unbooked.
 *  • An **existing unlinked** event → `createBooking` WITHOUT a seed (the event is already
 *    there; a seed would make a second one), then the event's own `bookingId` patch. The
 *    server nulls its `placeId` itself (ADR-0048), so there is no field-migration code here.
 *  • Either, from the shelf → plus the idea's consume.
 *
 *  If the link fails, the booking is deleted rather than left for nothing to point at — the
 *  half-applied conversion ADR-0136's Consequences names.
 *
 *  **Resolves to the BOOKING**, or `null` when nothing stuck. Not a boolean, because on the
 *  new-event path the linked event is the SERVER's (from the seed, ADR-0093) — so the
 *  booking is the only id a caller can hold, and a form writing notes on the way needs one
 *  to put them on (ADR-0152 §6b). */
export async function applyBookEvent(
  deps: VerbDeps,
  input: CreateBookingInput,
  opts: { event?: TripEvent | null; maybeId?: string | null } = {},
): Promise<Booking | null> {
  const { event = null, maybeId = null } = opts;
  let booking;
  try {
    // `silent`: this is one action, so it gets one toast, and the caller owns it.
    booking = await deps.bookings.createBooking(input, { silent: true });
  } catch {
    return null; // the verb rolled back and toasted already
  }
  if (!booking) return null;

  let previous: { id: string; previous: UpdateEventInput } | null = null;
  if (event) {
    previous = { id: event.id, previous: { placeId: event.placeId, category: event.category } };
    const linked = await applyUpdateEvent(deps, event, { bookingId: booking.id });
    if (!linked) {
      // The event is already back to what it was; take the orphan with it.
      await deps.bookings.deleteBooking(booking.id, { deleteEvents: false }).catch(() => {});
      // And clear the descriptor `applyUpdateEvent` left behind on its way out. Nothing
      // stuck, so there is nothing to undo — offering to reverse a write that never applied
      // is worse than offering nothing.
      deps.lastAction.current = null;
      return null;
    }
  }
  if (maybeId) {
    // The linked event on this path is the SERVER's (from the seed, ADR-0093), so the
    // booking is the host the client can name — the same rule the form's own composer
    // follows when `יש הזמנה` is on.
    await carryNotes(
      deps,
      { kind: 'maybeItemId', id: maybeId },
      { kind: 'bookingId', id: booking.id },
    );
    await applyConsumeMaybeItem(deps, maybeId);
  }

  // Set LAST, so it survives the descriptors `applyUpdateEvent`/the consume wrote: undoing a
  // booked save is one action, not the last of three.
  deps.lastAction.current = { kind: 'book', bookingId: booking.id, event: previous, maybeId };
  return booking;
}

/** **The writes a schedule performs**, with no dispatch and no descriptor of its own — so
 *  `החלף` can run them after a park inside ONE action (ADR-0161 §6) instead of copying the
 *  sequence, including the two ordering rules its comments below are about. */
async function scheduleWrites(deps: VerbDeps, event: TripEvent, maybeId: string): Promise<void> {
  const input = toCreateEventInput(event);
  const canonical = await restOrQueue(deps.tripId, { verb: OUTBOX_VERB.CREATE, input }, () =>
    createEvent(deps.tripId, input),
  );
  if (canonical) deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
  // What the group wrote about the idea is about the thing, not about the shelf it was
  // sitting on — so it follows the idea onto the day. After the create, because the event
  // has to exist before a note can point at it (offline: FIFO).
  await carryNotes(deps, { kind: 'maybeItemId', id: maybeId }, { kind: 'eventId', id: event.id });
  // Persists the consumed flag server-side (T-058) so a resync after an
  // offline reconnect doesn't revert this maybe-item back to unscheduled.
  // Separate call rather than a combined backend "schedule" endpoint because
  // the event is built here (icon, default slot, carried-over placeId) —
  // if that derivation ever moves server-side, drop this call and the
  // consume() service method (backend/src/maybe-items/maybe-items.service.ts)
  // together in favor of one endpoint.
  await restOrQueue(
    deps.tripId,
    { verb: OUTBOX_VERB.CONSUME_MAYBE_ITEM, maybeItemId: maybeId },
    () => consumeMaybeItem(deps.tripId, maybeId),
  );
}

export async function applySchedule(
  deps: VerbDeps,
  event: TripEvent,
  maybeId: string,
): Promise<void> {
  deps.dispatch({ type: TRIP_ACTION.SCHEDULE, event, maybeId });
  deps.lastAction.current = { kind: 'create', id: event.id, maybeId };
  try {
    await scheduleWrites(deps, event, maybeId);
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyCreateEvent(deps: VerbDeps, event: TripEvent): Promise<void> {
  deps.dispatch({ type: TRIP_ACTION.CREATE_EVENT, event });
  deps.lastAction.current = { kind: 'create', id: event.id };
  const input = toCreateEventInput(event);
  try {
    const canonical = await restOrQueue(deps.tripId, { verb: OUTBOX_VERB.CREATE, input }, () =>
      createEvent(deps.tripId, input),
    );
    if (canonical) deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

function previousOf(event: TripEvent, patch: UpdateEventInput): UpdateEventInput {
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) previous[key] = event[key as keyof TripEvent];
  return previous as UpdateEventInput;
}

/** Resolves `false` when the write failed and the optimistic patch was rolled back — which
 *  a composite caller has to know, because its OTHER write is then orphaned (ADR-0136 §3).
 *  It also stops `verbs.update` toasting success straight after an error toast. */
export async function applyUpdateEvent(
  deps: VerbDeps,
  event: TripEvent,
  patch: UpdateEventInput,
): Promise<boolean> {
  const previous = previousOf(event, patch);
  const isHard = event.kind === EVENT_KIND.HARD;
  // A patch may clear a field with `null` (`displayTimezone`, ADR-0107 §6); local
  // state uses `undefined` for absent, so coerce before the optimistic merge.
  deps.dispatch({
    type: TRIP_ACTION.UPDATE_EVENT,
    id: event.id,
    patch: coerceClearedFields<TripEvent>(patch) ?? {},
  });
  deps.lastAction.current = { kind: 'update', id: event.id, previous, isHard };
  try {
    const canonical = await restOrQueue(
      deps.tripId,
      { verb: OUTBOX_VERB.UPDATE, eventId: event.id, input: patch, confirm: isHard },
      () => updateEvent(deps.tripId, event.id, patch, isHard),
    );
    if (canonical) deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
    return true;
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
    return false;
  }
}

// Hard-event guard (ADR-0011), same choke point as applyGuardedDelay: edit/delete
// of a hard event needs explicit confirmation; cancel is a true no-op.
export async function applyGuardedUpdate(
  deps: VerbDeps,
  event: TripEvent,
  patch: UpdateEventInput,
): Promise<boolean> {
  if (event.kind === EVENT_KIND.HARD) {
    const confirmed = await deps.confirmHardEdit(event, 'edit');
    if (!confirmed) return false;
  }
  return applyUpdateEvent(deps, event, patch);
  return true;
}

export async function applyDeleteEvent(deps: VerbDeps, event: TripEvent): Promise<void> {
  const isHard = event.kind === EVENT_KIND.HARD;
  // Read BEFORE the write: after it there is nowhere left to read them from (`restoreNotes`).
  const notes = notesHostedBy(deps.notes.list, 'eventId', event.id);
  // The links, read for the same reason and at the same moment (ADR-0173 §7).
  const attachments = attachmentsForHost(deps.attachments.list, ENTITY_TYPE.EVENT, event.id);
  deps.dispatch({ type: TRIP_ACTION.DELETE_EVENT, id: event.id });
  deps.lastAction.current = { kind: 'delete', event, notes, attachments };
  try {
    await restOrQueue(
      deps.tripId,
      { verb: OUTBOX_VERB.DELETE, eventId: event.id, confirm: isHard },
      () => deleteEvent(deps.tripId, event.id, isHard),
    );
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyGuardedDelete(deps: VerbDeps, event: TripEvent): Promise<boolean> {
  if (event.kind === EVENT_KIND.HARD) {
    // The gate is the one moment this delete can say what else it takes (ADR-0152 §2). A soft
    // event needs no such line: it has no gate, and its undo puts the notes back.
    const confirmed = await deps.confirmHardEdit(event, 'delete', {
      notes: notesHostedBy(deps.notes.list, 'eventId', event.id).length,
    });
    if (!confirmed) return false;
  }
  await applyDeleteEvent(deps, event);
  return true;
}

// **The one atomic multi-event write**: N slot patches, one undo. One REORDER dispatch
// (a single undo snapshot) + one persisted update per patched event. Only soft events are
// ever in `patches` (hard events are pinned anchors, ADR-0011), so there is no hard-edit
// gate here. `affected` is the day's events, used to record each event's prior slot for
// undo.
//
// Named for what it does rather than for its first caller (ADR-0161 §7): it was
// `applyReorder` when a reorder was the only thing that patched several events at once,
// and it is the path every multi-row move now takes — a position swap today, and whatever
// else needs "these events, these starts, one undo" next.
export async function applyEventPatches(
  deps: VerbDeps,
  patches: { id: string; patch: UpdateEventInput }[],
  affected: TripEvent[],
): Promise<void> {
  if (patches.length === 0) return;
  const byId = new Map(affected.map((e) => [e.id, e]));
  deps.dispatch({
    type: TRIP_ACTION.REORDER,
    patches: patches.map((p) => ({
      id: p.id,
      patch: coerceClearedFields<TripEvent>(p.patch) ?? {},
    })),
  });
  deps.lastAction.current = {
    kind: 'reorder',
    items: patches.map((p) => ({ id: p.id, previous: slotOf(byId.get(p.id)!), isHard: false })),
  };
  try {
    const results = await Promise.all(
      patches.map((p) =>
        restOrQueue(
          deps.tripId,
          { verb: OUTBOX_VERB.UPDATE, eventId: p.id, input: p.patch, confirm: false },
          () => updateEvent(deps.tripId, p.id, p.patch, false),
        ),
      ),
    );
    for (const canonical of results) {
      if (canonical) deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: canonical });
    }
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

// Add/remove ideas are Plan-mode Tier-3 building actions. Shared state, so they
// route through the write outbox and work offline (ADR-0042). The client-generated
// id means the optimistic item already matches the server row, so success needs
// no reconcile; a failure rolls back the optimistic state.
export async function applyAddMaybe(deps: VerbDeps, item: MaybeItem): Promise<void> {
  deps.dispatch({ type: TRIP_ACTION.ADD_MAYBE, item });
  deps.lastAction.current = { kind: 'addMaybe', id: item.id };
  const input = {
    id: item.id,
    title: item.title,
    icon: item.icon,
    category: item.category,
    // A researched idea carries the place it was picked from (ADR-0115 §3) — the
    // same field `applyPark` already sends on this op.
    placeId: item.placeId,
    targetDate: item.targetDate,
  };
  try {
    await restOrQueue(deps.tripId, { verb: OUTBOX_VERB.CREATE_MAYBE_ITEM, input }, () =>
      createMaybeItem(deps.tripId, input),
    );
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

// Re-aim an idea at a day, or back to "someday" (ADR-0116 §1). A pencil mark, so
// nothing about the idea's lifecycle changes — `consumed` is untouched and it
// stays parked. Offline-capable like every other shelf action (ADR-0042).
export async function applySetMaybeDay(
  deps: VerbDeps,
  item: MaybeItem,
  targetDate: string | null,
): Promise<void> {
  deps.dispatch({
    type: TRIP_ACTION.UPDATE_MAYBE,
    id: item.id,
    patch: { targetDate: targetDate ?? undefined },
  });
  deps.lastAction.current = { kind: 'maybeDay', item };
  const input = { targetDate };
  try {
    await restOrQueue(
      deps.tripId,
      { verb: OUTBOX_VERB.UPDATE_MAYBE_ITEM, maybeItemId: item.id, input },
      () => updateMaybeItem(deps.tripId, item.id, input),
    );
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyRemoveMaybe(deps: VerbDeps, item: MaybeItem): Promise<void> {
  const notes = notesHostedBy(deps.notes.list, 'maybeItemId', item.id);
  deps.dispatch({ type: TRIP_ACTION.REMOVE_MAYBE, id: item.id });
  deps.lastAction.current = { kind: 'removeMaybe', item, notes };
  try {
    await restOrQueue(
      deps.tripId,
      { verb: OUTBOX_VERB.DELETE_MAYBE_ITEM, maybeItemId: item.id },
      () => deleteMaybeItem(deps.tripId, item.id),
    );
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

/**
 * **Delete a place** (ADR-0157). The write, the local cascade and the rollback all live in
 * `indexVerbs.deletePlace` — what belongs here is the descriptor, because this is the layer
 * that owns undo and because the links it returns are the only surviving record of what the
 * database nulled.
 *
 * The notes are read BEFORE the call for the same reason a host's delete does
 * (`restoreNotes`): a moment later they are gone from every list the client holds.
 *
 * Resolves `false` when the write failed, so the caller shows no confirmation toast for
 * something that did not happen — trip-state has already rolled the screen back and said so.
 */
export async function applyDeletePlace(
  deps: VerbDeps,
  place: Place,
  /** The place's SOLE live shelf idea, when it has exactly one (`soleIdeaFor`) — resolved by
   *  the caller, which is also what the confirm's wording is derived from, so the sentence
   *  and the write cannot disagree about whether the idea is going. */
  idea: MaybeItem | null = null,
): Promise<boolean> {
  const notes = notesHostedBy(deps.notes.list, 'placeId', place.id);
  const ideaNotes = idea ? notesHostedBy(deps.notes.list, 'maybeItemId', idea.id) : [];
  try {
    const links = await deps.places.deletePlace(place.id, { ideaId: idea?.id });
    deps.lastAction.current = {
      kind: 'deletePlace',
      place,
      links,
      notes,
      idea: idea ? { item: idea, notes: ideaNotes } : null,
    };
    return true;
  } catch {
    // Deliberately no toast and no rollback: `deletePlace` owns both, and a second
    // `writeFailed` beside its own would be the only double-reported failure in the app.
    return false;
  }
}

// Park an event onto the shelf: turn it into a maybe idea (title/icon/place) and
// remove it from the day — so any event can become a reschedulable idea, not
// just ones that started on the shelf. Offline-capable (Tier-3 build action), one undo.
/** **The writes a park performs**, extracted for the same reason as `scheduleWrites`: `החלף`
 *  parks the event it displaces, and this is where the note ordering that makes parking safe
 *  is written down. */
async function parkWrites(deps: VerbDeps, event: TripEvent, item: MaybeItem): Promise<void> {
  const input = {
    id: item.id,
    title: item.title,
    icon: item.icon,
    category: item.category,
    placeId: item.placeId,
    targetDate: item.targetDate,
  };
  await restOrQueue(deps.tripId, { verb: OUTBOX_VERB.CREATE_MAYBE_ITEM, input }, () =>
    createMaybeItem(deps.tripId, input),
  );
  // **BETWEEN the two writes, and that is the whole point.** Parking deletes the event,
  // and the note FKs are `onDelete: Cascade` — so notes still pointing at it when the
  // delete lands are destroyed in the database, not merely stranded. Moved after the idea
  // exists and before the event goes.
  await carryNotes(deps, { kind: 'eventId', id: event.id }, { kind: 'maybeItemId', id: item.id });
  await restOrQueue(
    deps.tripId,
    { verb: OUTBOX_VERB.DELETE, eventId: event.id, confirm: false },
    () => deleteEvent(deps.tripId, event.id),
  );
}

export async function applyPark(deps: VerbDeps, event: TripEvent, item: MaybeItem): Promise<void> {
  deps.dispatch({ type: TRIP_ACTION.PARK_EVENT, eventId: event.id, item });
  deps.lastAction.current = { kind: 'park', event, maybeId: item.id };
  try {
    await parkWrites(deps, event, item);
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

/**
 * **`החלף`: one decision, one write, one undo** (ADR-0161 §6).
 *
 * `החלף` used to `skip` the event and post a toast telling you to go and find a replacement
 * yourself — so the verb emptied the slot and then left, which is the whole of the owner's
 * report that it is _"confusing and hard to understand how to use"_. It now takes the
 * decision on the slot: the displaced event goes to the shelf as an idea (`park`, not `skip` —
 * the thing you displaced is the thing you are most likely to re-slot, ADR-0027), and the
 * replacement takes its **exact** start and end.
 *
 * The two halves are `parkWrites` and `scheduleWrites`, in that order — the slot is never
 * empty to the user because there is one dispatch, and it is never empty on the server for
 * longer than the round trip. One reducer action so the undo snapshot spans both, and one
 * descriptor so reversing puts the day back exactly as it was.
 */
export async function applyReplace(
  deps: VerbDeps,
  displaced: TripEvent,
  parked: MaybeItem,
  event: TripEvent,
  maybeId: string,
): Promise<void> {
  deps.dispatch({
    type: TRIP_ACTION.REPLACE_EVENT,
    displacedId: displaced.id,
    parked,
    event,
    maybeId,
  });
  deps.lastAction.current = {
    kind: 'replace',
    park: { event: displaced, maybeId: parked.id },
    created: { id: event.id, maybeId },
  };
  try {
    await parkWrites(deps, displaced, parked);
    await scheduleWrites(deps, event, maybeId);
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyRippleApply(
  deps: VerbDeps,
  ripple: RippleSuggestion,
  events: TripEvent[],
): Promise<void> {
  const items = ripple.candidates.map((c) => {
    const before = events.find((e) => e.id === c.id);
    return { id: c.id, previous: { date: before?.date ?? '', startsAt: before?.startsAt } };
  });
  deps.dispatch({ type: TRIP_ACTION.RIPPLE_APPLY });
  deps.lastAction.current = { kind: 'rippleApply', items };
  try {
    for (const c of ripple.candidates) {
      const input = { startsAt: c.startsAt };
      const result = await restOrQueue<MoveEventResult>(
        deps.tripId,
        { verb: OUTBOX_VERB.MOVE, eventId: c.id, input, confirm: false },
        () => moveEvent(deps.tripId, c.id, input),
      );
      if (result) deps.dispatch({ type: TRIP_ACTION.RECONCILE_EVENT, event: result.event });
    }
  } catch (err) {
    deps.dispatch({ type: TRIP_ACTION.UNDO });
    writeErrorToast(deps.toast, err);
  }
}

/** Put a consumed idea back on the shelf, server-side — the compensating write BOTH undo paths
 *  owe (a plain schedule and a booked save that consumed one). Queued when offline like every
 *  other write, so an undo made on a plane still lands. */
/** **Undoing a create**, extracted so `replace` can reverse its schedule half with the same
 *  three writes and the same order rather than a copy of them. */
async function reverseCreate(deps: VerbDeps, id: string, maybeId?: string): Promise<void> {
  // The notes ride BACK first, for the same reason parking moves them before its delete:
  // this delete cascades, so a note still pointing at the event would be destroyed by
  // the undo of the very action that gave it that host.
  if (maybeId) {
    await carryNotes(deps, { kind: 'eventId', id }, { kind: 'maybeItemId', id: maybeId });
  }
  await restOrQueue(deps.tripId, { verb: OUTBOX_VERB.DELETE, eventId: id, confirm: false }, () =>
    deleteEvent(deps.tripId, id),
  );
  // A scheduled idea goes back on the shelf. The reducer's snapshot has already done this
  // locally; before `restore` existed there was nothing to tell the server, so the next
  // resync re-consumed the idea and it vanished a second time.
  if (maybeId) await restoreConsumed(deps, maybeId);
}

/** **Undoing a park**: drop the idea and put the event back. ORDER, and it is not the obvious
 *  one — the event is re-created FIRST, because the notes parking moved onto the idea have to
 *  reach it before the idea is deleted and its own cascade takes them. */
async function reversePark(deps: VerbDeps, event: TripEvent, maybeId: string): Promise<void> {
  const input = toCreateEventInput(event);
  await restOrQueue(deps.tripId, { verb: OUTBOX_VERB.CREATE, input }, () =>
    createEvent(deps.tripId, input),
  );
  await carryNotes(deps, { kind: 'maybeItemId', id: maybeId }, { kind: 'eventId', id: event.id });
  await restOrQueue(
    deps.tripId,
    { verb: OUTBOX_VERB.DELETE_MAYBE_ITEM, maybeItemId: maybeId },
    () => deleteMaybeItem(deps.tripId, maybeId),
  );
}

async function restoreConsumed(deps: VerbDeps, maybeId: string): Promise<void> {
  await restOrQueue(
    deps.tripId,
    { verb: OUTBOX_VERB.RESTORE_MAYBE_ITEM, maybeItemId: maybeId },
    () => restoreMaybeItem(deps.tripId, maybeId),
  );
}

async function reverseRest(deps: VerbDeps, desc: UndoDescriptor): Promise<void> {
  const { tripId } = deps;
  switch (desc.kind) {
    case 'status':
      await restOrQueue(
        tripId,
        { verb: OUTBOX_VERB.SET_STATUS, eventId: desc.id, status: desc.previous },
        () => setEventStatus(tripId, desc.id, desc.previous),
      );
      return;
    case 'move': {
      const input = { date: desc.previous.date, startsAt: desc.previous.startsAt };
      await restOrQueue(
        tripId,
        { verb: OUTBOX_VERB.MOVE, eventId: desc.id, input, confirm: desc.isHard },
        () => moveEvent(tripId, desc.id, input, desc.isHard),
      );
      return;
    }
    case 'create':
      await reverseCreate(deps, desc.id, desc.maybeId);
      return;
    case 'rippleApply':
      await Promise.all(
        desc.items.map((i) => {
          const input = { date: i.previous.date, startsAt: i.previous.startsAt };
          return restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.MOVE, eventId: i.id, input, confirm: false },
            () => moveEvent(tripId, i.id, input),
          );
        }),
      );
      return;
    case 'update':
      await restOrQueue(
        tripId,
        { verb: OUTBOX_VERB.UPDATE, eventId: desc.id, input: desc.previous, confirm: desc.isHard },
        () => updateEvent(tripId, desc.id, desc.previous, desc.isHard),
      );
      return;
    case 'delete': {
      const input = toCreateEventInput(desc.event);
      await restOrQueue(tripId, { verb: OUTBOX_VERB.CREATE, input }, () =>
        createEvent(tripId, input),
      );
      // The event comes back with the same id, so its notes and its document links can point
      // at it again — but only if they are written after it exists.
      await restoreNotes(deps, desc.notes);
      await restoreAttachments(deps, desc.attachments);
      return;
    }
    case 'reorder':
      await Promise.all(
        desc.items.map((i) =>
          restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.UPDATE, eventId: i.id, input: i.previous, confirm: i.isHard },
            () => updateEvent(tripId, i.id, i.previous, i.isHard),
          ),
        ),
      );
      return;
    case 'addMaybe':
      await restOrQueue(tripId, { verb: OUTBOX_VERB.DELETE_MAYBE_ITEM, maybeItemId: desc.id }, () =>
        deleteMaybeItem(tripId, desc.id),
      );
      return;
    case 'maybeDay':
      await updateMaybeItem(tripId, desc.item.id, {
        targetDate: desc.item.targetDate ?? null,
      });
      return;
    case 'removeMaybe': {
      const input = {
        id: desc.item.id,
        title: desc.item.title,
        icon: desc.item.icon,
        category: desc.item.category,
      };
      await restOrQueue(tripId, { verb: OUTBOX_VERB.CREATE_MAYBE_ITEM, input }, () =>
        createMaybeItem(tripId, input),
      );
      await restoreNotes(deps, desc.notes);
      return;
    }
    case 'deletePlace': {
      // ORDER IS THE WHOLE OF THIS CASE (ADR-0157 §4). The place comes back first, under its
      // own id, because the links and the notes both FK-reference it — offline the outbox is
      // FIFO, so "first" here means enqueued first, and awaiting in sequence is what
      // guarantees it. `createPlace` restores the row in memory as well, which the reducer's
      // snapshot cannot: places are not in it.
      const { place } = desc;
      await deps.places.createPlace({
        id: place.id,
        name: place.name,
        googlePlaceId: place.googlePlaceId,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        icon: place.icon,
        // Google's numbers, restorable only because `createPlaceSchema` accepts them —
        // nothing else could hand them back without paying for a second Details call.
        rating: place.rating,
        userRatingsTotal: place.userRatingsTotal,
      });
      // The idea that went with it, before the other links and before the notes: it is a row
      // again rather than a reference, and its own notes hang off it (ADR-0157 §9).
      if (desc.idea) {
        const input = {
          id: desc.idea.item.id,
          title: desc.idea.item.title,
          icon: desc.idea.item.icon,
          category: desc.idea.item.category,
          placeId: place.id,
          targetDate: desc.idea.item.targetDate,
        };
        await restOrQueue(tripId, { verb: OUTBOX_VERB.CREATE_MAYBE_ITEM, input }, () =>
          createMaybeItem(tripId, input),
        );
        await restoreNotes(deps, desc.idea.notes);
      }
      // The FKs Postgres nulled. Events and ideas are already re-linked ON SCREEN by the
      // reducer's snapshot, so these are the server's copy only; a booking is not in that
      // snapshot, so its write goes through the verb that owns its optimistic state too.
      for (const link of desc.links) {
        const fields = Object.fromEntries(link.fields.map((field) => [field, place.id]));
        if (link.owner === ENTITY_TYPE.BOOKING) {
          await deps.bookings.updateBooking(link.id, fields);
        } else if (link.owner === ENTITY_TYPE.MAYBE_ITEM) {
          await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.UPDATE_MAYBE_ITEM, maybeItemId: link.id, input: fields },
            () => updateMaybeItem(tripId, link.id, fields),
          );
        } else {
          // `confirm: true` for the same reason every other undo passes it: re-attaching a
          // place to a hard event is reversing our own delete, not a new edit to guard.
          await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.UPDATE, eventId: link.id, input: fields, confirm: true },
            () => updateEvent(tripId, link.id, fields, true),
          );
        }
      }
      await restoreNotes(deps, desc.notes);
      return;
    }
    case 'park':
      await reversePark(deps, desc.event, desc.maybeId);
      return;
    case 'replace':
      // Both halves, in the reverse of the order that made them (ADR-0161 §6). The schedule
      // goes first for the same reason its own undo carries notes before deleting: the
      // replacement's delete cascades, and its notes have to reach the idea it came from
      // while that idea still exists. Only then is the displaced event put back, which is
      // what re-creates the host the parked idea's notes belong to.
      await reverseCreate(deps, desc.created.id, desc.created.maybeId);
      await reversePark(deps, desc.park.event, desc.park.maybeId);
      return;
    case 'book': {
      // ONE undo for the whole booked save (ADR-0136 §3). Order matters twice over.
      //
      // The booking goes first: deleting it is what clears the event's `bookingId`
      // server-side (ADR-0047 §3's unlink), and until that is gone a patch restoring the
      // place would be nulled straight back out by ADR-0048's invariant.
      //
      // `deleteEvents` is the difference between the two shapes. On a create the linked
      // event only ever existed because of the booking, so it goes too. On a conversion the
      // event predates the booking and must survive — with its place and category handed
      // back, which nothing else can do: the conversion moved them onto the booking.
      // The booking's own notes ride back to the idea BEFORE it is deleted — a booked save
      // from the shelf moved them onto the booking, and this delete cascades.
      if (desc.maybeId) {
        await carryNotes(
          deps,
          { kind: 'bookingId', id: desc.bookingId },
          { kind: 'maybeItemId', id: desc.maybeId },
        );
      }
      await deps.bookings.deleteBooking(desc.bookingId, {
        deleteEvents: desc.event == null,
        confirm: true,
      });
      if (desc.event) {
        await restOrQueue(
          tripId,
          {
            verb: OUTBOX_VERB.UPDATE,
            eventId: desc.event.id,
            input: desc.event.previous,
            confirm: true,
          },
          () => updateEvent(tripId, desc.event!.id, desc.event!.previous, true),
        );
      }
      // And the idea it consumed goes back on the shelf, server-side as well as locally —
      // through the same helper the schedule undo uses, so the two cannot drift.
      if (desc.maybeId) await restoreConsumed(deps, desc.maybeId);
      return;
    }
  }
}

export async function applyUndo(deps: VerbDeps): Promise<void> {
  const desc = deps.lastAction.current;
  deps.dispatch({ type: TRIP_ACTION.UNDO });
  deps.lastAction.current = null;
  if (!desc) return;
  try {
    await reverseRest(deps, desc);
  } catch (err) {
    // ponytail: local state is already reverted; a failed undo-sync just gets a
    // toast rather than a second rollback attempt (edge case at this trip's scale).
    writeErrorToast(deps.toast, err);
  }
}

export function useVerbs() {
  const {
    dispatch,
    trip,
    events,
    maybeItems,
    places,
    ripple,
    activeDate,
    setActiveDate,
    zoneEvidence,
    indexVerbs,
    notes,
    noteVerbs,
    documentAttachments,
    attachmentVerbs,
  } = useTrip();
  const { me } = useAuth();
  const toast = useToast();
  const confirmHardEdit = useConfirmHardEdit();
  const lastAction = useRef<UndoDescriptor | null>(null);
  const deps: VerbDeps = {
    tripId: trip.id,
    dispatch,
    toast,
    lastAction,
    confirmHardEdit,
    bookings: indexVerbs,
    places: indexVerbs,
    // A conversion carries the old host's notes to the new one (`carryNotes`). The list is
    // read live rather than captured, so a note written while a sheet is open still moves.
    notes: {
      list: notes,
      rehost: (note, host) =>
        noteVerbs.updateNote(note.id, {
          // **The note's own content travels with it**, because this payload is
          // whole-content for everything but the host: a move that sent only the FKs would
          // clear the very words it is trying to preserve.
          title: note.title,
          body: note.body,
          url: note.url,
          category: note.category,
          ...host,
        }),
      // The row as it was, back under its own id and its own host — the FK it already
      // carries, since the host an undo re-creates keeps the id it had.
      recreate: (note) =>
        noteVerbs
          .createNote({
            id: note.id,
            title: note.title,
            body: note.body,
            url: note.url,
            category: note.category,
            ...Object.fromEntries(NOTE_HOST_KEYS.map((key) => [key, note[key]])),
          })
          .then(() => {}),
    },
    // Read live rather than captured, for `notes`' reason: a document attached while a sheet
    // is open still travels with the undo.
    attachments: {
      list: documentAttachments,
      // Its own id and its own host — the FK it already carries, since the host an undo
      // re-creates keeps the id it had.
      recreate: (attachment) =>
        attachmentVerbs
          .attachDocument({
            id: attachment.id,
            documentId: attachment.documentId,
            eventId: attachment.eventId,
            bookingId: attachment.bookingId,
          })
          .then(() => {}),
    },
  };
  // Attribution for our own optimistic writes: the signed-in user, not a fixture.
  // The server stamps the canonical author on reconcile; this is what a
  // non-reconciled entity (a client-id maybe-item, an offline write) shows until then.
  const authorId = me?.user.id ?? trip.updatedBy;
  const undo = () => void applyUndo(deps);

  /** **The idea as it READS, for the two verbs that turn one into an event** (2026-08-20).
   *  `buildScheduleEvent` copies the idea's glyph and category onto the event, and an idea
   *  added from the map carries neither: the pills are on the PLACE (ADR-0165), so a `food`
   *  place became a `💡`, uncategorised event on the day. Resolved here, once, so the event
   *  inherits exactly what the shelf tile was showing (`ideaGlyph`/`ideaCategory`) — and
   *  `buildScheduleEvent` stays the pure builder it is, with `fields` (the form's answer)
   *  still outranking both. */
  const asScheduled = (m: MaybeItem): MaybeItem => ({
    ...m,
    icon: ideaGlyph(m, places),
    category: ideaCategory(m, places),
  });

  /** **The idea an event becomes when it leaves the day.** Two verbs make one now — `park`
   *  and `החלף` (ADR-0161 §6) — and a parked event is the same thing either way, so the
   *  shape is here rather than twice at the call sites. `targetDate` overrides the day it
   *  lands on: `null` is "someday", which is what dropping a row on the shelf's pool group
   *  means (ADR-0116 session-118); `undefined` keeps the event's own day. */
  const parkedIdea = (event: TripEvent, targetDate: string | null | undefined): MaybeItem => {
    const now = new Date(getNow()).toISOString();
    return {
      id: generateId(),
      tripId: trip.id,
      title: event.title,
      icon: event.icon,
      // Parking is "not in this slot", not "not this day" (ADR-0116 §4): the category comes
      // along (it used to be dropped, so a parked restaurant lost its pin hue) and the date
      // survives as the idea's pencilled-in day.
      category: event.category,
      placeId: event.placeId,
      targetDate: targetDate === undefined ? event.date : (targetDate ?? undefined),
      createdBy: authorId,
      consumed: false,
      createdAt: now,
      updatedAt: now,
      updatedBy: authorId,
    };
  };

  return {
    done: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.DONE);
      toast(CONTROL_ICON.done, t.toast.markedDone, undo);
    },
    skip: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.SKIPPED);
      toast(CONTROL_ICON.trash, t.toast.removed, undo);
    },
    restore: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.PLANNED);
      toast(CONTROL_ICON.restore, t.toast.restored, undo);
    },
    // `swap` used to live here and it did not swap: it SKIPPED the event and posted a toast
    // telling you to find a replacement yourself, which is the report ADR-0161 §6 answers.
    // `replace` below is the verb it was describing.
    delay: (e: TripEvent) => {
      void applyGuardedDelay(deps, e, DELAY_STEP_MINUTES).then((applied) => {
        if (!applied) return;
        if (e.kind === EVENT_KIND.HARD) toast(CONTROL_ICON.warn, t.toast.hardDelayed, undo);
        else toast(CONTROL_ICON.delay, t.toast.softDelayed(DELAY_STEP_MINUTES), undo);
      });
    },
    earlier: (e: TripEvent) => {
      void applyDelay(deps, e, -DELAY_STEP_MINUTES);
      toast(CONTROL_ICON.delay, t.toast.softEarlier(DELAY_STEP_MINUTES), undo);
    },
    // `moveBy` lived here — an arbitrary minute delta, for the `הזז` overlap-resolve's two
    // hand-built options (ADR-0041). It is gone with them: a position is named, not offset,
    // so the resolve sheet writes through `update` with the slot the picker handed back —
    // the same write a drop on that position performs (ADR-0161 §4). `delay`/`earlier` above
    // keep their fixed step, which is a nudge rather than a move to somewhere.
    // **`בדרך` writes now** (ADR-0206 §Z5 §M4, built by M6b). It was a toast claiming
    // `שותף לקבוצה` and no write at all, which made it the one verb in the app whose
    // confirmation was false. §V1.4's late mark is its first consumer with a reason to be
    // state: the mark says the leave-by has passed, and the only honest way to withdraw it is
    // for a person to say they are moving — a settle mark is not a sensor, and own-device
    // position wants its own ADR before this surface reads it.
    //
    // **A DEVICE mark, and the toast now says so.** The group-visible answer is a stored field
    // plus a migration plus a cache mirror (backlogged); this is the whole of what the mark
    // needs and it claims nothing the app does not do.
    //
    // **And it is reversible** (ADR-0207 §7), which it was not: the first build wrote a mark with
    // no way back, reported by the owner. The undo is this verb's own rather than `applyUndo` —
    // that one reverses the last OUTBOX write, and a device mark never enters the outbox.
    onWay: (e: TripEvent) => {
      markOnWay(trip.id, e.id);
      toast(CONTROL_ICON.navigate, t.toast.onWayMarked, () => clearOnWay(trip.id, e.id));
    },
    // Place a shelf idea onto a day. With `fields` (from the builder's
    // EventForm picker) the user chose the day/time/kind; without them it's the
    // Trip-mode one-tap quick-schedule onto today at a default slot (Tier-1).
    schedule: (m: MaybeItem, fields?: ScheduleFields) => {
      const now = new Date(getNow()).toISOString();
      const event = buildScheduleEvent(trip, activeDate, asScheduled(m), now, authorId, fields);
      // Resolves to the event it built — the same reason `create` returns its promise: a
      // caller writing notes on the way has to queue them BEHIND their host (ADR-0152 §6b).
      const done = applySchedule(deps, event, m.id).then(() => event);
      // The toast says the time back in the event's OWN zone (ADR-0107) — on a
      // multi-zone trip the trip primary would confirm an hour nobody typed.
      const timeLabel = event.startsAt
        ? isoToTimeInput(event.startsAt, eventDisplayZones(event, zoneEvidence).start)
        : null;
      toast(
        CONTROL_ICON.schedule,
        timeLabel ? t.toast.scheduled(event.title, timeLabel) : t.toast.scheduledDay(event.title),
        undo,
      );
      return done;
    },
    // An idea can arrive from the day-view jot (title only) or from Plan-mode
    // place research (a picked place, ADR-0115 §3) — hence the options bag rather
    // than a third and fourth positional optional.
    addMaybe: (title: string, opts: AddMaybeOptions = {}) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const now = new Date(getNow()).toISOString();
      const item: MaybeItem = {
        id: generateId(),
        tripId: trip.id,
        title: trimmed,
        icon: opts.icon ?? DEFAULT_MAYBE_ICON,
        category: opts.category,
        placeId: opts.placeId,
        targetDate: opts.targetDate,
        createdBy: authorId,
        consumed: false,
        createdAt: now,
        updatedAt: now,
        updatedBy: authorId,
      };
      void applyAddMaybe(deps, item);
      toast(CONTROL_ICON.add, t.toast.maybeAdded, undo);
    },
    removeMaybe: (m: MaybeItem) => {
      void applyRemoveMaybe(deps, m);
      toast(CONTROL_ICON.trash, t.toast.maybeRemoved, undo);
    },
    /**
     * **Agreeing with a `fits-a-day` proposal** (ADR-0151's 2026-08-04 amendment): pencil the
     * idea in for the day the suggestion named, **and go to that day**.
     *
     * The second half is the whole verb, and without it the feature punishes agreement. The
     * day it names is by definition one you are NOT on, and `shelfGroups` puts an idea in
     * `לְיום הזה` only for the day on screen — so accepting a proposal for day 4 from day 1
     * left it in the pool, where `near-the-day` demotes an idea aimed elsewhere below every
     * dateless one (`TIER.AIMED_ELSEWHERE`), possibly out of `SHELF_POOL_CAP` altogether, with
     * its reason flipped from the spatial fact that justified the suggestion to `aimed-at-day`.
     *
     * The tier is right and stays — ADR-0116 §2's partition, and a thing pencilled for Thursday
     * should not compete while you plan Monday. The defect was the COMBINATION, so the fix is
     * at the seam: you tapped `סמנו ליום 4`, and day 4 is where the idea now lives.
     *
     * One verb rather than two calls at each host, because "sets the day" and "goes to it" must
     * not drift apart between Trip mode and Plan mode.
     */
    acceptDay: (m: MaybeItem, targetDate: string) => {
      void applySetMaybeDay(deps, m, targetDate);
      toast(CONTROL_ICON.done, t.toast.maybeAimedAtDay, undo);
      setActiveDate(targetDate);
    },
    // Drag an idea between the shelf's two groups (ADR-0116 §2): onto this day
    // pencils it in, back to the pool clears it. Not a schedule — no time, no slot.
    setMaybeDay: (m: MaybeItem, targetDate: string | null) => {
      if ((m.targetDate ?? null) === targetDate) return;
      void applySetMaybeDay(deps, m, targetDate);
      toast(
        CONTROL_ICON.schedule,
        targetDate ? t.toast.maybeAimedAtDay : t.toast.maybeBackToPool,
        undo,
      );
    },
    // Move an event onto the shelf as a maybe idea (any event, not just ones
    // that started there). Soft events only — hard events are commitments.
    // `targetDate` overrides the day the idea lands on: `null` is "someday", which is
    // what dropping a row on the shelf's pool group means (ADR-0116 session-118).
    // Omitted keeps the default below.
    park: (event: TripEvent, opts: { targetDate?: string | null } = {}) => {
      void applyPark(deps, event, parkedIdea(event, opts.targetDate));
      toast(CONTROL_ICON.toShelf, t.toast.movedToShelf, undo);
    },
    /** **`החלף`, taken on the slot** (ADR-0161 §6): the displaced event goes to the shelf and
     *  `m` takes its exact start and end. One toast and one undo for both, because it is one
     *  decision — see `applyReplace`. */
    replace: (displaced: TripEvent, m: MaybeItem) => {
      const now = new Date(getNow()).toISOString();
      const event = buildScheduleEvent(trip, displaced.date, asScheduled(m), now, authorId, {
        date: displaced.date,
        title: m.title,
        // Soft, always: what a replacement inherits is the SLOT, not the commitment. A hard
        // event is never displaced in the first place (ADR-0011 — `החלף` is not offered on
        // one), so this only ever replaces something soft with something soft.
        kind: EVENT_KIND.SOFT,
        // The slot, not a slot of its own: same start, same length. Nothing else on the day
        // moves, which is what makes this a replacement rather than an insertion (§1's rule,
        // applied to the one verb that puts one thing where another was).
        startsAt: displaced.startsAt,
        endsAt: displaced.endsAt,
      });
      void applyReplace(deps, displaced, parkedIdea(displaced, undefined), event, m.id);
      toast(CONTROL_ICON.swap, t.toast.replaced(m.title), undo);
    },
    /** Resolves when the event's own write has been sent or queued — which is what lets a
     *  caller queue something BEHIND it. The form writing notes on the way (ADR-0152 §6b)
     *  is the one caller that needs it: offline the outbox is FIFO, so a note enqueued
     *  before its host's op would flush first and the server would refuse a host it cannot
     *  see. Every other call site ignores the promise, exactly as before. */
    create: (event: TripEvent) => {
      const done = applyCreateEvent(deps, event);
      toast(CONTROL_ICON.done, t.toast.eventCreated, undo);
      return done;
    },
    /** The event is ALSO booked (ADR-0136). One toast for one action, whichever of the three
     *  shapes it took — and the undo behind it reverses all of their writes together. */
    book: (
      input: CreateBookingInput,
      opts: { event?: TripEvent | null; maybeId?: string | null } = {},
    ) =>
      applyBookEvent(deps, input, opts).then((booking) => {
        if (booking) toast(CONTROL_ICON.done, t.toast.eventBooked, undo);
        return booking;
      }),
    update: (event: TripEvent, patch: UpdateEventInput) => {
      void applyGuardedUpdate(deps, event, patch).then((applied) => {
        if (applied) toast(CONTROL_ICON.done, t.toast.eventUpdated, undo);
      });
    },
    remove: (event: TripEvent) => {
      void applyGuardedDelete(deps, event).then((applied) => {
        if (applied) toast(CONTROL_ICON.trash, t.toast.eventDeleted, undo);
      });
    },
    /** Remove a place (ADR-0157). The confirm that names what this costs is the caller's —
     *  it is the surface that knows how many rows point here — and by the time we are called
     *  the user has answered it. */
    removePlace: (place: Place) => {
      // `soleIdeaFor` is ADR-0135 §5's rule read from the other end: exactly one live idea on
      // a place IS that place's intention, so it goes with it — and two or more are two
      // intentions, so none of them do. The screen resolves the same helper for the confirm's
      // wording, which is what keeps the sentence and the write in agreement.
      void applyDeletePlace(deps, place, soleIdeaFor(place.id, maybeItems)).then((applied) => {
        if (applied) toast(CONTROL_ICON.trash, t.toast.placeDeleted, undo);
      });
    },
    // Plan-mode builder: two soft events **trade positions**, each keeping its own
    // length (ADR-0161 §1/§2). Hard events are pinned and never in the patch set.
    swapPositions: (dayEvents: TripEvent[], aId: string, bId: string) => {
      const patches = planSwap(dayEvents, aId, bId);
      if (patches.length === 0) return;
      void applyEventPatches(deps, patches, dayEvents);
      toast(CONTROL_ICON.swap, t.toast.swappedPositions, undo);
    },
    rippleApply: () => {
      if (!ripple) return;
      void applyRippleApply(deps, ripple, events);
      toast(CONTROL_ICON.done, t.toast.rippleApplied, undo);
    },
    rippleDismiss: () => dispatch({ type: TRIP_ACTION.RIPPLE_DISMISS }),
  };
}
