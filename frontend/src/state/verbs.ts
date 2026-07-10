// Quick verbs: dispatch the optimistic change + confirm with an undoable toast.
// Centralised so the screens stay declarative. T-014 swaps the dispatch bodies
// for REST calls; the verb surface the screens call stays the same.
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip } from './trip-state';
import { useToast } from '../ui/Toast';
import { DELAY_STEP_MINUTES, DEFAULT_SCHEDULE_SLOT, ICONS } from '../constants';
import { t } from '../i18n/he';
import { ACTIVE_DATE, TRIP_TZ_OFFSET, activeUserId, maybeMeta } from '../fixtures';

export function useVerbs() {
  const { dispatch, trip } = useTrip();
  const toast = useToast();
  const undo = () => dispatch({ type: 'UNDO' });

  return {
    done: (e: TripEvent) => {
      dispatch({ type: 'SET_STATUS', id: e.id, status: EVENT_STATUS.DONE });
      toast(ICONS.done, t.toast.markedDone, undo);
    },
    skip: (e: TripEvent) => {
      dispatch({ type: 'SET_STATUS', id: e.id, status: EVENT_STATUS.SKIPPED });
      toast(ICONS.trash, t.toast.removed, undo);
    },
    restore: (e: TripEvent) => {
      dispatch({ type: 'SET_STATUS', id: e.id, status: EVENT_STATUS.PLANNED });
      toast(ICONS.restore, t.toast.restored, undo);
    },
    swap: (e: TripEvent) => {
      dispatch({ type: 'SET_STATUS', id: e.id, status: EVENT_STATUS.SKIPPED });
      toast(ICONS.swap, t.toast.swapPrompt, undo);
    },
    delay: (e: TripEvent) => {
      dispatch({ type: 'DELAY', id: e.id, minutes: DELAY_STEP_MINUTES });
      if (e.kind === EVENT_KIND.HARD) toast(ICONS.warn, t.toast.hardDelayed, undo);
      else toast(ICONS.delay, t.toast.softDelayed(DELAY_STEP_MINUTES), undo);
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
      dispatch({ type: 'SCHEDULE', event, maybeId: m.id });
      toast(ICONS.schedule, t.toast.scheduled(m.title, DEFAULT_SCHEDULE_SLOT.START), undo);
    },
    rippleApply: () => {
      dispatch({ type: 'RIPPLE_APPLY' });
      toast(ICONS.done, t.toast.rippleApplied, undo);
    },
    rippleDismiss: () => dispatch({ type: 'RIPPLE_DISMISS' }),
  };
}
