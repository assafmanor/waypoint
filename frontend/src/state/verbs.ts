// Quick verbs: optimistic dispatch + REST write, reconciled or rolled back
// (sync-and-offline.md "Optimistic updates + undo"). The `apply*`/`reverseRest`
// functions take their dependencies as plain arguments so they're testable
// without rendering a component; `useVerbs()` just wires them to context.
import { useRef } from 'react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type CreateEventInput,
  type EventCategory,
  type MaybeItem,
  type TripEvent,
  type UpdateEventInput,
} from '@waypoint/shared';
import { useTrip, type Action, type RippleSuggestion } from './trip-state';
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
  setEventStatus,
  updateEvent,
} from '../lib/api';
import { enqueueOutbox, isNetworkError, isOffline, type OutboxOp } from '../lib/outbox';
import { getNow } from '../lib/useClock';
import { isoToTimeInput } from '../lib/time';
import { planReorder } from '../lib/reorder';
import { DEFAULT_MAYBE_ICON, DELAY_STEP_MINUTES, DEFAULT_SCHEDULE_SLOT, ICONS } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, activeUserId, maybeMeta } from '../fixtures';

type ShowToast = ReturnType<typeof useToast>;

type UndoDescriptor =
  | { kind: 'status'; id: string; previous: TripEvent['status'] }
  | { kind: 'move'; id: string; previous: { date: string; startsAt?: string }; isHard: boolean }
  | { kind: 'create'; id: string }
  | { kind: 'rippleApply'; items: { id: string; previous: { date: string; startsAt?: string } }[] }
  | { kind: 'update'; id: string; previous: UpdateEventInput; isHard: boolean }
  | { kind: 'delete'; event: TripEvent }
  | { kind: 'reorder'; items: { id: string; previous: UpdateEventInput; isHard: boolean }[] }
  | { kind: 'addMaybe'; id: string }
  | { kind: 'removeMaybe'; item: MaybeItem }
  | { kind: 'park'; event: TripEvent; maybeId: string };

export interface VerbDeps {
  tripId: string;
  dispatch: React.Dispatch<Action>;
  toast: ShowToast;
  lastAction: { current: UndoDescriptor | null };
  confirmHardEdit: (event: TripEvent, action?: ConfirmHardEditAction) => Promise<boolean>;
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
  toast(ICONS.warn, message);
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
    location,
    placeId,
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
    location,
    placeId,
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
  deps.dispatch({ type: 'SET_STATUS', id: event.id, status });
  deps.lastAction.current = { kind: 'status', id: event.id, previous: event.status };
  try {
    const canonical = await restOrQueue(
      deps.tripId,
      { verb: 'setStatus', eventId: event.id, status },
      () => setEventStatus(deps.tripId, event.id, status),
    );
    if (canonical) deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyDelay(deps: VerbDeps, event: TripEvent, minutes: number): Promise<void> {
  const previous = { date: event.date, startsAt: event.startsAt };
  const isHard = event.kind === EVENT_KIND.HARD;
  deps.dispatch({ type: 'DELAY', id: event.id, minutes });
  deps.lastAction.current = { kind: 'move', id: event.id, previous, isHard };
  const input = { startsAt: event.startsAt ? shiftForMove(event.startsAt, minutes) : undefined };
  try {
    const result = await restOrQueue<MoveEventResult>(
      deps.tripId,
      { verb: 'move', eventId: event.id, input, confirm: isHard },
      () => moveEvent(deps.tripId, event.id, input, isHard),
    );
    if (result) {
      deps.dispatch({ type: 'RECONCILE_EVENT', event: result.event });
      deps.dispatch({ type: 'SET_RIPPLE', ripple: result.rippleSuggestion ?? null });
    }
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
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

export async function applySchedule(
  deps: VerbDeps,
  event: TripEvent,
  maybeId: string,
): Promise<void> {
  deps.dispatch({ type: 'SCHEDULE', event, maybeId });
  deps.lastAction.current = { kind: 'create', id: event.id };
  const input = toCreateEventInput(event);
  try {
    const canonical = await restOrQueue(deps.tripId, { verb: 'create', input }, () =>
      createEvent(deps.tripId, input),
    );
    if (canonical) deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
    // Persists the consumed flag server-side (T-058) so a resync after an
    // offline reconnect doesn't revert this maybe-item back to unscheduled.
    // Separate call rather than a combined backend "schedule" endpoint because
    // the event is built here (icon, default slot, maybeMeta() location) —
    // if that derivation ever moves server-side, drop this call and the
    // consume() service method (backend/src/maybe-items/maybe-items.service.ts)
    // together in favor of one endpoint.
    await restOrQueue(deps.tripId, { verb: 'consumeMaybeItem', maybeItemId: maybeId }, () =>
      consumeMaybeItem(deps.tripId, maybeId),
    );
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyCreateEvent(deps: VerbDeps, event: TripEvent): Promise<void> {
  deps.dispatch({ type: 'CREATE_EVENT', event });
  deps.lastAction.current = { kind: 'create', id: event.id };
  const input = toCreateEventInput(event);
  try {
    const canonical = await restOrQueue(deps.tripId, { verb: 'create', input }, () =>
      createEvent(deps.tripId, input),
    );
    if (canonical) deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

function previousOf(event: TripEvent, patch: UpdateEventInput): UpdateEventInput {
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) previous[key] = event[key as keyof TripEvent];
  return previous as UpdateEventInput;
}

export async function applyUpdateEvent(
  deps: VerbDeps,
  event: TripEvent,
  patch: UpdateEventInput,
): Promise<void> {
  const previous = previousOf(event, patch);
  const isHard = event.kind === EVENT_KIND.HARD;
  deps.dispatch({ type: 'UPDATE_EVENT', id: event.id, patch });
  deps.lastAction.current = { kind: 'update', id: event.id, previous, isHard };
  try {
    const canonical = await restOrQueue(
      deps.tripId,
      { verb: 'update', eventId: event.id, input: patch, confirm: isHard },
      () => updateEvent(deps.tripId, event.id, patch, isHard),
    );
    if (canonical) deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
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
  await applyUpdateEvent(deps, event, patch);
  return true;
}

export async function applyDeleteEvent(deps: VerbDeps, event: TripEvent): Promise<void> {
  const isHard = event.kind === EVENT_KIND.HARD;
  deps.dispatch({ type: 'DELETE_EVENT', id: event.id });
  deps.lastAction.current = { kind: 'delete', event };
  try {
    await restOrQueue(deps.tripId, { verb: 'delete', eventId: event.id, confirm: isHard }, () =>
      deleteEvent(deps.tripId, event.id, isHard),
    );
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyGuardedDelete(deps: VerbDeps, event: TripEvent): Promise<boolean> {
  if (event.kind === EVENT_KIND.HARD) {
    const confirmed = await deps.confirmHardEdit(event, 'delete');
    if (!confirmed) return false;
  }
  await applyDeleteEvent(deps, event);
  return true;
}

// Reorder soft events on a day: reassign their time slots (patches computed by
// lib/reorder.ts's planReorder). One REORDER dispatch (single undo snapshot) +
// one persisted update per moved event. Only soft events are ever in `patches`
// (hard events are pinned anchors, ADR-0011), so there's no hard-edit gate here.
// `affected` is the day's events, used to record each moved event's prior slot
// for undo.
export async function applyReorder(
  deps: VerbDeps,
  patches: { id: string; patch: UpdateEventInput }[],
  affected: TripEvent[],
): Promise<void> {
  if (patches.length === 0) return;
  const byId = new Map(affected.map((e) => [e.id, e]));
  deps.dispatch({ type: 'REORDER', patches });
  deps.lastAction.current = {
    kind: 'reorder',
    items: patches.map((p) => ({ id: p.id, previous: slotOf(byId.get(p.id)!), isHard: false })),
  };
  try {
    const results = await Promise.all(
      patches.map((p) =>
        restOrQueue(
          deps.tripId,
          { verb: 'update', eventId: p.id, input: p.patch, confirm: false },
          () => updateEvent(deps.tripId, p.id, p.patch, false),
        ),
      ),
    );
    for (const canonical of results) {
      if (canonical) deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
    }
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

// Add/remove ideas are Plan-mode Tier-3 building actions — called online, not
// queued through the write outbox (that only carries the day-editing verbs).
// The client-generated id means the optimistic item already matches the server
// row, so success needs no reconcile; a failure rolls back the optimistic state.
export async function applyAddMaybe(deps: VerbDeps, item: MaybeItem): Promise<void> {
  deps.dispatch({ type: 'ADD_MAYBE', item });
  deps.lastAction.current = { kind: 'addMaybe', id: item.id };
  try {
    await createMaybeItem(deps.tripId, {
      id: item.id,
      title: item.title,
      icon: item.icon,
      category: item.category,
    });
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

export async function applyRemoveMaybe(deps: VerbDeps, item: MaybeItem): Promise<void> {
  deps.dispatch({ type: 'REMOVE_MAYBE', id: item.id });
  deps.lastAction.current = { kind: 'removeMaybe', item };
  try {
    await deleteMaybeItem(deps.tripId, item.id);
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

// Park an event onto the shelf: turn it into a maybe idea (title/icon/place) and
// remove it from the day — so any event can become a reschedulable idea, not
// just ones that started on the shelf. Online (a Tier-3 build action), one undo.
export async function applyPark(deps: VerbDeps, event: TripEvent, item: MaybeItem): Promise<void> {
  deps.dispatch({ type: 'PARK_EVENT', eventId: event.id, item });
  deps.lastAction.current = { kind: 'park', event, maybeId: item.id };
  try {
    await createMaybeItem(deps.tripId, {
      id: item.id,
      title: item.title,
      icon: item.icon,
      category: item.category,
      placeId: item.placeId,
    });
    await deleteEvent(deps.tripId, event.id);
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
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
  deps.dispatch({ type: 'RIPPLE_APPLY' });
  deps.lastAction.current = { kind: 'rippleApply', items };
  try {
    for (const c of ripple.candidates) {
      const input = { startsAt: c.startsAt };
      const result = await restOrQueue<MoveEventResult>(
        deps.tripId,
        { verb: 'move', eventId: c.id, input, confirm: false },
        () => moveEvent(deps.tripId, c.id, input),
      );
      if (result) deps.dispatch({ type: 'RECONCILE_EVENT', event: result.event });
    }
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

async function reverseRest(tripId: string, desc: UndoDescriptor): Promise<void> {
  switch (desc.kind) {
    case 'status':
      await restOrQueue(
        tripId,
        { verb: 'setStatus', eventId: desc.id, status: desc.previous },
        () => setEventStatus(tripId, desc.id, desc.previous),
      );
      return;
    case 'move': {
      const input = { date: desc.previous.date, startsAt: desc.previous.startsAt };
      await restOrQueue(
        tripId,
        { verb: 'move', eventId: desc.id, input, confirm: desc.isHard },
        () => moveEvent(tripId, desc.id, input, desc.isHard),
      );
      return;
    }
    case 'create':
      await restOrQueue(tripId, { verb: 'delete', eventId: desc.id, confirm: false }, () =>
        deleteEvent(tripId, desc.id),
      );
      return;
    case 'rippleApply':
      await Promise.all(
        desc.items.map((i) => {
          const input = { date: i.previous.date, startsAt: i.previous.startsAt };
          return restOrQueue(tripId, { verb: 'move', eventId: i.id, input, confirm: false }, () =>
            moveEvent(tripId, i.id, input),
          );
        }),
      );
      return;
    case 'update':
      await restOrQueue(
        tripId,
        { verb: 'update', eventId: desc.id, input: desc.previous, confirm: desc.isHard },
        () => updateEvent(tripId, desc.id, desc.previous, desc.isHard),
      );
      return;
    case 'delete': {
      const input = toCreateEventInput(desc.event);
      await restOrQueue(tripId, { verb: 'create', input }, () => createEvent(tripId, input));
      return;
    }
    case 'reorder':
      await Promise.all(
        desc.items.map((i) =>
          restOrQueue(
            tripId,
            { verb: 'update', eventId: i.id, input: i.previous, confirm: i.isHard },
            () => updateEvent(tripId, i.id, i.previous, i.isHard),
          ),
        ),
      );
      return;
    case 'addMaybe':
      await deleteMaybeItem(tripId, desc.id);
      return;
    case 'removeMaybe':
      await createMaybeItem(tripId, {
        id: desc.item.id,
        title: desc.item.title,
        icon: desc.item.icon,
        category: desc.item.category,
      });
      return;
    case 'park': {
      // Un-park: drop the idea and put the event back.
      await deleteMaybeItem(tripId, desc.maybeId);
      const input = toCreateEventInput(desc.event);
      await restOrQueue(tripId, { verb: 'create', input }, () => createEvent(tripId, input));
    }
  }
}

export async function applyUndo(deps: VerbDeps): Promise<void> {
  const desc = deps.lastAction.current;
  deps.dispatch({ type: 'UNDO' });
  deps.lastAction.current = null;
  if (!desc) return;
  try {
    await reverseRest(deps.tripId, desc);
  } catch (err) {
    // ponytail: local state is already reverted; a failed undo-sync just gets a
    // toast rather than a second rollback attempt (edge case at this trip's scale).
    writeErrorToast(deps.toast, err);
  }
}

export function useVerbs() {
  const { dispatch, trip, events, ripple, activeDate } = useTrip();
  const toast = useToast();
  const confirmHardEdit = useConfirmHardEdit();
  const lastAction = useRef<UndoDescriptor | null>(null);
  const deps: VerbDeps = { tripId: trip.id, dispatch, toast, lastAction, confirmHardEdit };
  const undo = () => void applyUndo(deps);

  return {
    done: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.DONE);
      toast(ICONS.done, t.toast.markedDone, undo);
    },
    skip: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.SKIPPED);
      toast(ICONS.trash, t.toast.removed, undo);
    },
    restore: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.PLANNED);
      toast(ICONS.restore, t.toast.restored, undo);
    },
    swap: (e: TripEvent) => {
      void applySetStatus(deps, e, EVENT_STATUS.SKIPPED);
      toast(ICONS.swap, t.toast.swapPrompt, undo);
    },
    delay: (e: TripEvent) => {
      void applyGuardedDelay(deps, e, DELAY_STEP_MINUTES).then((applied) => {
        if (!applied) return;
        if (e.kind === EVENT_KIND.HARD) toast(ICONS.warn, t.toast.hardDelayed, undo);
        else toast(ICONS.delay, t.toast.softDelayed(DELAY_STEP_MINUTES), undo);
      });
    },
    earlier: (e: TripEvent) => {
      void applyDelay(deps, e, -DELAY_STEP_MINUTES);
      toast(ICONS.delay, t.toast.softEarlier(DELAY_STEP_MINUTES), undo);
    },
    // Move a soft event by an arbitrary delta — the "הזז" overlap-resolve
    // (ADR-0041), a manual ripple: shift to a clean slot, duration preserved, and
    // any new downstream overlap flows through the same ripple suggestion.
    moveBy: (e: TripEvent, minutes: number) => {
      if (minutes === 0) return;
      void applyDelay(deps, e, minutes);
      toast(ICONS.delay, t.toast.eventMoved, undo);
    },
    onWay: (_e: TripEvent) => toast(ICONS.share, t.toast.onWayShared),
    navigate: (_e: TripEvent) => toast(ICONS.navigate, t.toast.openingNav),
    // Place a shelf idea onto a day. With `fields` (from the builder's
    // EventForm picker) the user chose the day/time/kind; without them it's the
    // Trip-mode one-tap quick-schedule onto today at a default slot (Tier-1).
    schedule: (
      m: MaybeItem,
      fields?: {
        date: string;
        title: string;
        kind: TripEvent['kind'];
        startsAt?: string;
        endsAt?: string;
        location?: string;
        icon?: string;
        category?: EventCategory;
      },
    ) => {
      const now = new Date(getNow()).toISOString();
      const event: TripEvent = {
        id: crypto.randomUUID(),
        tripId: trip.id,
        date: fields?.date ?? activeDate,
        title: fields?.title ?? m.title,
        icon: fields?.icon ?? m.icon,
        category: fields?.category ?? m.category,
        kind: fields?.kind ?? EVENT_KIND.SOFT,
        status: EVENT_STATUS.PLANNED,
        startsAt: fields
          ? fields.startsAt
          : `${activeDate}T${DEFAULT_SCHEDULE_SLOT.START}:00${TRIP_TZ_OFFSET}`,
        endsAt: fields
          ? fields.endsAt
          : `${activeDate}T${DEFAULT_SCHEDULE_SLOT.END}:00${TRIP_TZ_OFFSET}`,
        location: fields?.location ?? maybeMeta(m.id),
        placeId: m.placeId,
        sortOrder: 99,
        source: EVENT_SOURCE.MAYBE_SHELF,
        createdAt: now,
        updatedAt: now,
        updatedBy: activeUserId,
      };
      void applySchedule(deps, event, m.id);
      const timeLabel = event.startsAt ? isoToTimeInput(event.startsAt, trip.timezone) : null;
      toast(
        ICONS.schedule,
        timeLabel ? t.toast.scheduled(event.title, timeLabel) : t.toast.scheduledDay(event.title),
        undo,
      );
    },
    addMaybe: (title: string, icon?: string, category?: EventCategory) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const now = new Date(getNow()).toISOString();
      const item: MaybeItem = {
        id: crypto.randomUUID(),
        tripId: trip.id,
        title: trimmed,
        icon: icon ?? DEFAULT_MAYBE_ICON,
        category,
        createdBy: activeUserId,
        consumed: false,
        createdAt: now,
        updatedAt: now,
        updatedBy: activeUserId,
      };
      void applyAddMaybe(deps, item);
      toast(ICONS.add, t.toast.maybeAdded, undo);
    },
    removeMaybe: (m: MaybeItem) => {
      void applyRemoveMaybe(deps, m);
      toast(ICONS.trash, t.toast.maybeRemoved, undo);
    },
    // Move an event onto the shelf as a maybe idea (any event, not just ones
    // that started there). Soft events only — hard events are commitments.
    park: (event: TripEvent) => {
      const now = new Date(getNow()).toISOString();
      const item: MaybeItem = {
        id: crypto.randomUUID(),
        tripId: trip.id,
        title: event.title,
        icon: event.icon,
        placeId: event.placeId,
        createdBy: activeUserId,
        consumed: false,
        createdAt: now,
        updatedAt: now,
        updatedBy: activeUserId,
      };
      void applyPark(deps, event, item);
      toast(ICONS.toShelf, t.toast.movedToShelf, undo);
    },
    create: (event: TripEvent) => {
      void applyCreateEvent(deps, event);
      toast(ICONS.done, t.toast.eventCreated, undo);
    },
    update: (event: TripEvent, patch: UpdateEventInput) => {
      void applyGuardedUpdate(deps, event, patch).then((applied) => {
        if (applied) toast(ICONS.done, t.toast.eventUpdated, undo);
      });
    },
    remove: (event: TripEvent) => {
      void applyGuardedDelete(deps, event).then((applied) => {
        if (applied) toast(ICONS.trash, t.toast.eventDeleted, undo);
      });
    },
    // Plan-mode builder: move soft event `movedId` to occupy `targetId`'s slot
    // (drag drop target, or the ▲/▼ soft neighbour). Hard events are pinned.
    reorder: (dayEvents: TripEvent[], movedId: string, targetId: string) => {
      const patches = planReorder(dayEvents, movedId, targetId);
      if (patches.length === 0) return;
      void applyReorder(deps, patches, dayEvents);
      toast(ICONS.swap, t.toast.reordered, undo);
    },
    rippleApply: () => {
      if (!ripple) return;
      void applyRippleApply(deps, ripple, events);
      toast(ICONS.done, t.toast.rippleApplied, undo);
    },
    rippleDismiss: () => dispatch({ type: 'RIPPLE_DISMISS' }),
  };
}
