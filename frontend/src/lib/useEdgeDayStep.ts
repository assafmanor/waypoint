// **Holding a drag at the day surface's inline edge steps to the day beyond it**
// (ADR-0116 §2's 2026-08-22 amendment; owner: _"you could drag from the edge to a different
// day"_).
//
// ADR-0116 §2 already decided that a drag can reach a day that is not on screen, and gave it
// one route: the header strip's pills, spring-loaded on a dwell. This is a second route to the
// same target, and it exists because the first one asks a phone to carry a card up to a ~30px
// pill at the top of the screen while the thing you are aiming at is a gap chip further down.
// The edge is where the finger already is.
//
// **Almost nothing here is new, which is the point.** The dwell is `DRAG_DAY_DWELL_MS`, the
// same one the pill uses — one answer to "resting somewhere switches the day", wherever you
// rest — and it is applied by the same `useSpringLoadedDay`, which this hook feeds rather than
// reimplements. The band arithmetic and the latch are `edge-autoscroll.ts`'s, shared rather
// than copied. What is left is the mapping from a side of the screen to a date, and one
// wrinkle about repeating (below).
//
// **The latch is not caution, it is a scar.** `gateEdgeStep` exists because a drag lifted
// inside the vertical band made the list take off under a finger that had not moved yet. The
// inline axis has the same shape: a row reaches the surface's full width, so a card lifted
// from its left or right end starts inside a band, and without the gate the days would begin
// flipping the moment the hold fired. The gate makes the drag ASK for the band first — by
// leaving it, or by pushing deeper into it than it was lifted at.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { DRAG_DAY_DWELL_MS, DRAG_DAY_EDGE_PX, DRAG_EDGE_SCROLL_RELEASE_PX } from '../constants';
import {
  edgeDepth,
  edgeLatchAt,
  gateEdgeStep,
  type DragPoint,
  type EdgeLatch,
} from './edge-autoscroll';

/** What `screens.css` keys the lean off — set to the NEIGHBOUR the edge names (`next`/`prev`),
 *  so the rule can pair it with the pane's own `data-day` and animate exactly one of them. */
const EDGE_LEAN_ATTR = 'data-edge-lean';

/** The neighbouring days, exactly as `useDaySurface` already derives them for the swipe's
 *  peek — `null` where the trip ends, which is what makes the edge do nothing there. Taking
 *  the pair rather than computing it again is what keeps the two ways of reaching tomorrow
 *  from ever disagreeing about which day that is. */
export interface DayNeighbours {
  prev: string | null;
  next: string | null;
}

export interface EdgeDayStep {
  /** The day the edge is currently pointing at, or `null`. Feed it to `useSpringLoadedDay`
   *  beside the day pill's own target: they are two ways of naming one thing. */
  date: string | null;
  /** **Mount the peeks on this** (§2c). The swipe's own `live` cannot serve here: the pager
   *  stands down for a drag by design, so during one there is nothing drawn to lean — which
   *  is why the shipped step was silent. The pane the CSS animates has to exist first. */
  leaning: boolean;
  /** The drag armed. Latches the band it was lifted in, so resting where you picked up is
   *  not a request to leave. */
  arm: (at: DragPoint) => void;
  /** Every move, and every frame the auto-scroll actually scrolled — the surface moving
   *  under a still finger changes nothing on this axis, but the caller feeds both from one
   *  place and a spurious call here is a no-op. */
  track: (point: DragPoint) => void;
  /** Drop, cancel, unmount. */
  stop: () => void;
}

export function useEdgeDayStep(
  host: RefObject<HTMLElement | null>,
  neighbours: DayNeighbours,
): EdgeDayStep {
  const [date, setDate] = useState<string | null>(null);
  const latch = useRef<EdgeLatch>(null);
  const point = useRef<DragPoint | null>(null);
  // Read through a ref, because a drag OUTLIVES the render it began in (ADR-0116 §2's
  // second "each a bug if missed"): the window listeners that call `track` hold the
  // handlers from the render at touch-down, when the neighbours were the lift day's.
  const live = useRef(neighbours);
  live.current = neighbours;

  /**
   * **Publish what the lean's CSS needs, and nothing more** (§2c) — the same division
   * `useSwipePager` keeps: the hook owns the attribute and the numbers, `screens.css` owns
   * the motion. `--swipe-page-w` is republished here because the pager only writes it when a
   * SWIPE claims, and a drag never claims one; `--swipe-dwell` carries `DRAG_DAY_DWELL_MS`
   * so the transition and the timer cannot disagree about when the day changes.
   */
  const paint = useCallback(
    (side: 'next' | 'prev' | null, width: number) => {
      const el = host.current;
      if (!el) return;
      if (side) {
        el.style.setProperty('--swipe-page-w', `${Math.round(width)}px`);
        el.style.setProperty('--swipe-dwell', `${DRAG_DAY_DWELL_MS}ms`);
        el.setAttribute(EDGE_LEAN_ATTR, side);
      } else {
        // The attribute goes and the pane unwinds on the destination state's own transition.
        // The two variables stay: removing them mid-unwind would take the pane's parked
        // distance away with them and it would snap rather than settle.
        el.removeAttribute(EDGE_LEAN_ATTR);
      }
    },
    [host],
  );

  /** Which day lies past the edge the pointer is in, if any.
   *
   *  The mirror is read off the element rather than the document, for the reason
   *  `useSwipePager` reads it there: the direction is a CSS variant, so the element is the
   *  only thing that knows which way its own inline axis runs. And it agrees with the peek's
   *  geometry by construction — in RTL the next day's pane sits to the LEFT (`--dir`,
   *  `screens.css`), so dragging a card left is dragging it toward tomorrow. */
  const resolve = useCallback((): string | null => {
    const el = host.current;
    const at = point.current;
    if (!el || !at) return null;
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return null;
    const off = () => {
      paint(null, 0);
      return null;
    };
    const x = at.clientX - box.left;
    const depth = edgeDepth(x, box.width, DRAG_DAY_EDGE_PX);
    // The same distance that says a drag has asked for the band it was lifted in. Its name
    // belongs to the scroll only because that is where the scar was found.
    const gated = gateEdgeStep(depth, x, latch.current, DRAG_EDGE_SCROLL_RELEASE_PX);
    latch.current = gated.latch;
    if (gated.step === 0) return off();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const { prev, next } = live.current;
    const [low, high] = rtl ? [next, prev] : [prev, next];
    const date = gated.step < 0 ? low : high;
    // The pane that leans is named by WHICH NEIGHBOUR it is, not by which side of the screen
    // it came from — `screens.css` pairs `[data-edge-lean]` with `[data-day]`, and the mirror
    // is already in `--dir`.
    paint(date ? (date === next ? 'next' : 'prev') : null, box.width);
    return date;
  }, [host, paint]);

  const track = useCallback(
    (next: DragPoint) => {
      point.current = next;
      setDate(resolve());
    },
    [resolve],
  );

  const arm = useCallback(
    (at: DragPoint) => {
      const el = host.current;
      point.current = at;
      latch.current = null;
      setDate(null);
      paint(null, 0);
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (box.width <= 0) return;
      const x = at.clientX - box.left;
      latch.current = edgeLatchAt(edgeDepth(x, box.width, DRAG_DAY_EDGE_PX), x);
    },
    [host, paint],
  );

  const stop = useCallback(() => {
    point.current = null;
    latch.current = null;
    setDate(null);
    const el = host.current;
    paint(null, 0);
    // The drag is over, so the pane is going away with it — the parked distance can go now.
    el?.style.removeProperty('--swipe-dwell');
  }, [host, paint]);

  // **Holding still at the edge has to keep stepping**, and that is the one thing the dwell
  // cannot give for free. `date` is computed from a pointer position, so once the day has
  // switched, a finger that does not move produces no `track` — and the target it named is
  // now the day you are standing on, which `useSpringLoadedDay` correctly refuses as "not a
  // switch". Recomputing when the NEIGHBOURS change is what turns one step into a queue of
  // them, 700ms apart, and it ends itself at the trip's edge where the neighbour is `null`.
  useEffect(() => {
    if (point.current) setDate(resolve());
  }, [neighbours.prev, neighbours.next, resolve]);

  // A drag interrupted by an unmount (a mode switch, a tab change) must not leave a target
  // named for a gesture that no longer exists.
  useEffect(() => stop, [stop]);

  // `leaning` is `date != null` and deliberately not a second piece of state: the pane that
  // leans is the pane that names a day, and two flags would be one flag and a way to disagree.
  return { date, leaning: date != null, arm, track, stop };
}
