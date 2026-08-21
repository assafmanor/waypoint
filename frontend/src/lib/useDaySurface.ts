// **What both day surfaces do about WHICH DAY they are showing** (ADR-0200 §6/§7) — one
// hook, called by `DayView` and `PlanDay`, because none of this is a posture. ADR-0159 §1
// lets the two differ about how a day is presented and forbids a difference about a fact,
// and `frontend/CLAUDE.md` records twice that a day-surface change made in `DayView` alone
// shipped broken in Plan. So the two screens call this and decide none of it.
//
// It owns two things, and they are one subject seen twice:
//
//   1. **A day opens at its top.** Owner, 2026-08-21: _"if you're at the end of the day,
//      swiping keeps you on the bottom. It should be on the top of the day"_ — and then,
//      unprompted, _"this should be true for the day strip as well. Not just for swipes"_,
//      which is the whole reason this lives here rather than in the gesture. A pixel offset
//      is a fact about the day you were reading; carrying it into a different day is
//      carrying an answer to a question nobody asked. Keyed on `activeDate`, so every
//      trigger gets it for free: the swipe, a header pill, the anchor's way back to today,
//      a deep link that lands on `?day=`.
//   2. **The swipe that changes it**, through `useSwipePager`, plus the two neighbour dates
//      the peek renders (§7). The neighbour is `null` at the trip's ends, which is what
//      makes the absent peek say "there is nothing that way" — the same argument ADR-0182
//      made for the Map track, and the reason the rebuff needs no label.
//
// **Declaration order is load-bearing, and it is why this is called EARLY in both screens.**
// `DayView`'s arrival landing (`landAtTop` on `?event=`) and its "land on now" both key on
// the same day change and both mean to win: an arrival was asked for by name, and today
// opens on the now-line by ADR-0027/0043. Effects run in declaration order, so the reset
// below runs first and those two land afterwards on top of it. Called late, it would erase
// them — which is the same trap `DayView`'s own `aimedAtCard` comment documents one layer in.
import { useEffect, useRef } from 'react';
import { addDays } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useDragState } from '../state/drag-state';
import { useSelectDay } from '../state/map-scope-state';
import { useIsDayPreview } from '../state/day-preview';
import { scrollerFor } from './scrollable';
import { useSwipePager, type SwipeStep } from './useSwipePager';

export interface DaySurface<T extends HTMLElement> {
  /** Attach to the day surface's root, together with the `day-swipe` class. */
  ref: React.RefObject<T | null>;
  /** A swipe is in flight — mount the peeks (§7). */
  live: boolean;
  /** The neighbouring days the peek renders, `null` where the trip ends (§7). */
  peek: { prev: string | null; next: string | null };
}

export function useDaySurface<T extends HTMLElement>(): DaySurface<T> {
  const { trip, activeDate } = useTrip();
  const selectDay = useSelectDay();
  // A hold-drag and a page step are both pointer gestures over the same rows. The drag owns
  // the pointer once it has it, and its ghost is `position: fixed` — so the pager stands
  // down entirely rather than racing it for the transform.
  const { dragging } = useDragState();
  // A peek is a day surface too (§7), and it must reach out of its pane for nothing at all —
  // including this. Its date never changes while it is mounted, so the reset below would not
  // fire today; the guard is here because "would not fire today" is not a property worth
  // relying on when the alternative is one condition.
  const preview = useIsDayPreview();

  const dayIn = (step: SwipeStep) => addDays(activeDate, step);
  // ISO dates compare lexically, which is why the range needs no parsing here.
  const within = (date: string) => date >= trip.startDate && date <= trip.endDate;
  const neighbour = (step: SwipeStep) => {
    const date = dayIn(step);
    return within(date) ? date : null;
  };

  const { ref, live } = useSwipePager<T>({
    enabled: !dragging && !preview,
    canStep: (step) => neighbour(step) != null,
    onStep: (step) => selectDay(dayIn(step)),
  });

  // **The day opens at its top.** Instant, never smooth: the page-turn has just supplied the
  // motion, and a second animation chasing it reads as the surface settling twice. The
  // scroller is walked rather than named — it is the shell's `.body`, which this layer has no
  // business knowing (ADR-0078), and `scrollerFor` is the ancestor walk that already exists.
  const first = useRef(true);
  useEffect(() => {
    // Not on the first render: arriving at a day surface from anywhere else has its own
    // landing (a tab change remounts the body, a deep link may name a card), and a reset
    // here would be a third opinion about it.
    if (preview) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    const scroller = scrollerFor(el, 'block');
    if (scroller) scroller.scrollTop = 0;
  }, [activeDate, ref, preview]);

  return { ref, live, peek: { prev: neighbour(-1), next: neighbour(1) } };
}
