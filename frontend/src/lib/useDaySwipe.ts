// **The day surfaces step day to day with a swipe** (ADR-0200) — one hook, called by
// both of them, because the two must not diverge about a FACT (ADR-0159 §1, and
// `frontend/CLAUDE.md`'s "changing a day-surface derivation in `DayView` only" has cost
// a release twice). Which day is next is a fact about the trip's range, not a posture,
// so the wiring lives here and neither screen decides any of it.
//
// The gesture itself is `useSwipePager`; this is the day half of it and nothing more:
// the neighbour exists or it does not, and selecting it goes through the same
// `useSelectDay` the header's pills go through, so a swipe and a tap on a pill are the
// same action with two triggers (root `CLAUDE.md`: one back action, one day action).
//
// **The host owes it the `day-swipe` class** (`screens.css`) — that is the follow, the
// settle and the hit area that reaches the empty room under a short day. The ref alone
// gives a gesture with nothing to show for it.
import { addDays } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useDragState } from '../state/drag-state';
import { useSelectDay } from '../state/map-scope-state';
import { useSwipePager, type SwipeStep } from './useSwipePager';

/** Attach to the day surface's root, together with the `day-swipe` class. */
export function useDaySwipe<T extends HTMLElement>() {
  const { trip, activeDate } = useTrip();
  const selectDay = useSelectDay();
  // A hold-drag and a page step are both pointer gestures over the same rows. The drag
  // owns the pointer once it has it, and its ghost is `position: fixed` — so the pager
  // stands down entirely rather than racing it for the transform.
  const { dragging } = useDragState();

  const dayAfter = (step: SwipeStep) => addDays(activeDate, step);
  return useSwipePager<T>({
    enabled: !dragging,
    // ISO dates compare lexically, which is why the range needs no parsing here.
    canStep: (step) => {
      const next = dayAfter(step);
      return next >= trip.startDate && next <= trip.endDate;
    },
    onStep: (step) => selectDay(dayAfter(step)),
  });
}
