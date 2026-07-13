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
  deleteEvent,
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
import { DELAY_STEP_MINUTES, DEFAULT_SCHEDULE_SLOT, ICONS } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, activeUserId, maybeMeta } from '../fixtures';

type ShowToast = ReturnType<typeof useToast>;

type UndoDescriptor =
  | { kind: 'status'; id: string; previous: TripEvent['status'] }
  | { kind: 'move'; id: string; previous: { date: string; startsAt?: string }; isHard: boolean }
  | { kind: 'create'; id: string }
  | { kind: 'rippleApply'; items: { id: string; previous: { date: string; startsAt?: string } }[] }
  | { kind: 'update'; id: string; previous: UpdateEventInput; isHard: boolean }
  | { kind: 'delete'; event: TripEvent };

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
    onWay: (_e: TripEvent) => toast(ICONS.share, t.toast.onWayShared),
    navigate: (_e: TripEvent) => toast(ICONS.navigate, t.toast.openingNav),
    schedule: (m: MaybeItem) => {
      const now = new Date(getNow()).toISOString();
      const event: TripEvent = {
        id: crypto.randomUUID(),
        tripId: trip.id,
        date: activeDate,
        title: m.title,
        icon: m.icon,
        kind: EVENT_KIND.SOFT,
        status: EVENT_STATUS.PLANNED,
        startsAt: `${activeDate}T${DEFAULT_SCHEDULE_SLOT.START}:00${TRIP_TZ_OFFSET}`,
        endsAt: `${activeDate}T${DEFAULT_SCHEDULE_SLOT.END}:00${TRIP_TZ_OFFSET}`,
        location: maybeMeta(m.id),
        sortOrder: 99,
        source: EVENT_SOURCE.MAYBE_SHELF,
        createdAt: now,
        updatedAt: now,
        updatedBy: activeUserId,
      };
      void applySchedule(deps, event, m.id);
      toast(ICONS.schedule, t.toast.scheduled(m.title, DEFAULT_SCHEDULE_SLOT.START), undo);
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
    rippleApply: () => {
      if (!ripple) return;
      void applyRippleApply(deps, ripple, events);
      toast(ICONS.done, t.toast.rippleApplied, undo);
    },
    rippleDismiss: () => dispatch({ type: 'RIPPLE_DISMISS' }),
  };
}
