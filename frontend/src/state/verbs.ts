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
} from '@waypoint/shared';
import { useTrip, type Action, type RippleSuggestion } from './trip-state';
import { useToast } from '../ui/Toast';
import { useConfirmHardEdit } from '../ui/ConfirmDialog';
import {
  createEvent,
  deleteEvent,
  isHardEventConfirmError,
  isMoveCrossesDayError,
  isMoveIntoPastError,
  moveEvent,
  setEventStatus,
} from '../lib/api';
import { DELAY_STEP_MINUTES, DEFAULT_SCHEDULE_SLOT, ICONS } from '../constants';
import { t } from '../i18n/he';
import { ACTIVE_DATE, TRIP_TZ_OFFSET, activeUserId, maybeMeta } from '../fixtures';

type ShowToast = ReturnType<typeof useToast>;

type UndoDescriptor =
  | { kind: 'status'; id: string; previous: TripEvent['status'] }
  | { kind: 'move'; id: string; previous: { date: string; startsAt?: string }; isHard: boolean }
  | { kind: 'create'; id: string }
  | { kind: 'rippleApply'; items: { id: string; previous: { date: string; startsAt?: string } }[] };

export interface VerbDeps {
  tripId: string;
  dispatch: React.Dispatch<Action>;
  toast: ShowToast;
  lastAction: { current: UndoDescriptor | null };
  confirmHardEdit: (event: TripEvent) => Promise<boolean>;
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
    const canonical = await setEventStatus(deps.tripId, event.id, status);
    deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
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
  try {
    const { event: canonical, rippleSuggestion } = await moveEvent(
      deps.tripId,
      event.id,
      { startsAt: event.startsAt ? shiftForMove(event.startsAt, minutes) : undefined },
      isHard,
    );
    deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
    deps.dispatch({ type: 'SET_RIPPLE', ripple: rippleSuggestion ?? null });
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
  try {
    const canonical = await createEvent(deps.tripId, toCreateEventInput(event));
    deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
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
      const { event: canonical } = await moveEvent(deps.tripId, c.id, { startsAt: c.startsAt });
      deps.dispatch({ type: 'RECONCILE_EVENT', event: canonical });
    }
  } catch (err) {
    deps.dispatch({ type: 'UNDO' });
    writeErrorToast(deps.toast, err);
  }
}

async function reverseRest(tripId: string, desc: UndoDescriptor): Promise<void> {
  switch (desc.kind) {
    case 'status':
      await setEventStatus(tripId, desc.id, desc.previous);
      return;
    case 'move':
      await moveEvent(
        tripId,
        desc.id,
        { date: desc.previous.date, startsAt: desc.previous.startsAt },
        desc.isHard,
      );
      return;
    case 'create':
      await deleteEvent(tripId, desc.id);
      return;
    case 'rippleApply':
      await Promise.all(
        desc.items.map((i) =>
          moveEvent(tripId, i.id, { date: i.previous.date, startsAt: i.previous.startsAt }),
        ),
      );
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
  const { dispatch, trip, events, ripple } = useTrip();
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
      const now = new Date().toISOString();
      const event: TripEvent = {
        id: crypto.randomUUID(),
        tripId: trip.id,
        date: ACTIVE_DATE,
        title: m.title,
        icon: m.icon,
        kind: EVENT_KIND.SOFT,
        status: EVENT_STATUS.PLANNED,
        startsAt: `${ACTIVE_DATE}T${DEFAULT_SCHEDULE_SLOT.START}:00${TRIP_TZ_OFFSET}`,
        endsAt: `${ACTIVE_DATE}T${DEFAULT_SCHEDULE_SLOT.END}:00${TRIP_TZ_OFFSET}`,
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
    rippleApply: () => {
      if (!ripple) return;
      void applyRippleApply(deps, ripple, events);
      toast(ICONS.done, t.toast.rippleApplied, undo);
    },
    rippleDismiss: () => dispatch({ type: 'RIPPLE_DISMISS' }),
  };
}
