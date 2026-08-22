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
import {
  DRAG_DAY_DWELL_MS,
  DRAG_DAY_EDGE_PX,
  DRAG_DAY_LIFT_PX,
  DRAG_DAY_REVERSE_DWELL_MS,
  DRAG_DAY_REVERSE_MS,
  DRAG_EDGE_SCROLL_RELEASE_PX,
} from '../constants';
import {
  edgeDepth,
  edgeDirection,
  edgeLatchAt,
  gateEdgeStep,
  type DragPoint,
  type EdgeDirection,
  type EdgeLatch,
} from './edge-autoscroll';
import { getNow } from './useClock';
import type { SwipeStep } from './useSwipePager';

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
  /** Which way the edge is pointing, or `null` — the step the dwell will command when it
   *  fires (§2d). Paired with `date`: one is the direction, the other is the day. */
  step: SwipeStep | null;
  /** How long the dwell should hold for the day currently named — the full
   *  `DRAG_DAY_DWELL_MS`, or `DRAG_DAY_REVERSE_DWELL_MS` when this edge is undoing the step
   *  it just made (§2d's repair). Feed it to `useSpringLoadedDay`; it is a property of the
   *  TARGET, which is why it is computed here rather than by the dwell. */
  dwell: number;
  /** The drag armed. Latches the band it was lifted in, so resting where you picked up is
   *  not a request to leave. */
  arm: (at: DragPoint) => void;
  /** Every move, and every frame the auto-scroll actually scrolled — the surface moving
   *  under a still finger changes nothing on this axis, but the caller feeds both from one
   *  place and a spurious call here is a no-op. */
  track: (point: DragPoint) => void;
  /** **The dwell has decided to turn**, and the caller says so at the moment it commands it
   *  (§2d's fifth repair). What this captures is not the step — the edge already knows that —
   *  but WHERE THE DRAG WAS when the decision was made, because the page takes `--t-base` to
   *  travel and a finger can go somewhere else while it does. Everything the arrival then
   *  decides is measured against the request rather than against wherever the hand ended up. */
  turning: () => void;
  /** Drop, cancel, unmount. */
  stop: () => void;
}

export function useEdgeDayStep(
  host: RefObject<HTMLElement | null>,
  neighbours: DayNeighbours,
  /** The commanded half of the page turn (`useDaySurface`). The edge decides WHEN; the pager
   *  owns the offset, the panes, the attributes and the settle — so the lift and the
   *  completion are the swipe's own mechanism rather than a second one (§2d). */
  hold: (step: SwipeStep | null, px?: number) => void,
): EdgeDayStep {
  const [date, setDate] = useState<string | null>(null);
  const [step, setStep] = useState<SwipeStep | null>(null);
  const latch = useRef<EdgeLatch>(null);
  const point = useRef<DragPoint | null>(null);
  /**
   * **The band this drag is currently inside, for hysteresis** (§2d's repair).
   *
   * The band had an entry threshold and no exit threshold, so a finger resting anywhere near
   * the boundary chattered: lift, unwind, lift, at whatever rate the pointer reported. Entering
   * still costs `DRAG_DAY_EDGE_PX`; leaving now costs that plus `DRAG_EDGE_SCROLL_RELEASE_PX`,
   * which is the same distance the latch already spends on this axis for the same question —
   * how much movement counts as intent. The opposite band is unaffected: it starts where it
   * always did, so reaching across is as easy as it was.
   */
  const inside = useRef<EdgeDirection>(null);
  /** The step this drag last completed, and when — the reversal window's whole input. */
  const turned = useRef<{ step: SwipeStep; at: number } | null>(null);
  /**
   * **The side this drag last turned FROM, for the rest of the drag** (§2d's seventh repair;
   * owner: _"moving the opposite direction shouldn't cancel the operation, undo, or do any other
   * animation… only after you're on the next day you should be able to go back"_).
   *
   * Their recording is the argument: step forward to the next day, move the hand to the other
   * edge, and the day walks back — a full page turn, ending where it started. The hand went the
   * other way; nothing about it asked to undo the step. The sixth repair latched a band the drag
   * DRIFTED into while the page travelled, and the hand in the recording crossed a frame LATER,
   * which read as a fresh request.
   *
   * So the side is kept, and the band opposite it is latched the first time the drag reaches it
   * inside the undo window. Going back is still possible — the second half of the owner's
   * sentence — it just has to be asked for, in the same words every other band here is asked in.
   */
  const turnedSide = useRef<EdgeDirection>(null);
  /** Whether the band opposite `turnedSide` has already been latched since that turn. Once it
   *  has, the ordinary latch is what decides — so this is a boolean rather than a second gate,
   *  and each turn arms it exactly once. */
  const gatedBack = useRef(false);
  /** The request a turn is travelling on: the step, and the band the drag was resting in when
   *  the dwell fired. Both are read at the COMMAND, not at the arrival. */
  const commanded = useRef<{ step: SwipeStep; side: EdgeDirection } | null>(null);
  /** What the edge is currently asking for, readable from an effect that must NOT re-run when
   *  it changes: the effect below fires on the day arriving, and the step is what it reads to
   *  know which way that day came from. */
  const asked = useRef<SwipeStep | null>(null);
  /**
   * **Has this stay in the band already turned a day?**
   *
   * The lift is worth spending once — it is what says _the page is cocked_ — and spending it
   * again after every turn is what the owner saw twice over (§2d's fourth repair). Kept at the
   * detent between days, it was a second animation on the heels of each day; given back on the
   * way out, it was _"this weird 'going back' animation, but stays on the same day"_. So after
   * the first turn the edge stays armed at **zero**: the surface is still claimed, the panes
   * stay mounted for the next turn, and there is nothing offset to owe back. Leaving the band
   * ends the stay, so coming back is a fresh lift.
   */
  const stepped = useRef(false);
  // Read through a ref, because a drag OUTLIVES the render it began in (ADR-0116 §2's
  // second "each a bug if missed"): the window listeners that call `track` hold the
  // handlers from the render at touch-down, when the neighbours were the lift day's.
  const live = useRef(neighbours);
  live.current = neighbours;
  /**
   * **The command, read through a ref so every callback here stays identity-stable.**
   *
   * Not a micro-optimisation — a correctness fix the unit suite caught. `stop` is wired as
   * `useEffect(() => stop, [stop])`, which means "unmount" only while `stop` never changes
   * identity; the moment it depended on a caller's callback, that cleanup ran on **every
   * render** and gave the lift back the instant it was taken. The app survived it by luck
   * (`useSwipePager`'s `hold` happens to be stable) and a harness passing an inline arrow did
   * not. A ref removes the luck.
   */
  const cmd = useRef(hold);
  cmd.current = hold;

  /**
   * **The lift, commanded** (§2d). v1 animated the incoming PANE by itself over the whole
   * dwell, and the owner rejected it on sight: 48px over 700ms is 1.1px per frame, which is a
   * static offset with a timer attached rather than a motion. So the strip is lifted instead —
   * briskly, to a detent, where it stops — which is the swipe's own channel and reads as a
   * page being picked up. Nothing here knows how it looks; `screens.css` owns that.
   */
  const lift = useCallback((next: SwipeStep | null) => {
    if (next == null) stepped.current = false;
    cmd.current(next, next == null || stepped.current ? 0 : DRAG_DAY_LIFT_PX);
    asked.current = next;
    setStep(next);
  }, []);

  /** **The step this drag just made is still on screen** — within `DRAG_DAY_REVERSE_MS` of
   *  landing. One window with two consequences: undoing inside it is half price (§2d's third
   *  repair), and inside it an undo has to be asked for (the seventh). */
  const undoWindow = useCallback(
    () => turned.current != null && getNow() - turned.current.at < DRAG_DAY_REVERSE_MS,
    [],
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
      lift(null);
      return null;
    };
    const x = at.clientX - box.left;
    // Entering, then — once inside — a wider band to leave. Asked as two questions of the same
    // function rather than one arithmetic of my own, so a short box still shrinks both.
    const entering = edgeDepth(x, box.width, DRAG_DAY_EDGE_PX);
    const leaving = edgeDepth(x, box.width, DRAG_DAY_EDGE_PX + DRAG_EDGE_SCROLL_RELEASE_PX);
    const depth =
      entering !== 0 ? entering : edgeDirection(leaving) === inside.current ? leaving : 0;
    // **Undoing a step is a request, not a direction of travel** (§2d's seventh repair; owner:
    // _"moving the opposite direction shouldn't cancel the operation, undo, or do any other
    // animation… only after you're on the next day you should be able to go back"_).
    //
    // The first time a drag reaches the band OPPOSITE the one that just turned — while the step
    // it made is still on screen — that band is latched, exactly as if the drag had been lifted
    // there. So being there does nothing, and leaving or pushing deeper is what means it, which
    // is the same sentence every other band in this app answers to. The band that did the
    // turning is untouched, so holding still keeps stepping (§2b), and once the window has
    // closed the far band is ordinary again — a retreat two seconds later was never the undo
    // this is about.
    const where = edgeDirection(depth);
    if (
      !gatedBack.current &&
      where != null &&
      turnedSide.current != null &&
      where !== turnedSide.current &&
      undoWindow()
    ) {
      gatedBack.current = true;
      latch.current = edgeLatchAt(depth, x);
    }
    // The same distance that says a drag has asked for the band it was lifted in. Its name
    // belongs to the scroll only because that is where the scar was found.
    const gated = gateEdgeStep(depth, x, latch.current, DRAG_EDGE_SCROLL_RELEASE_PX);
    latch.current = gated.latch;
    inside.current = edgeDirection(gated.step);
    if (gated.step === 0) return off();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const { prev, next } = live.current;
    const [low, high] = rtl ? [next, prev] : [prev, next];
    const date = gated.step < 0 ? low : high;
    // The STEP, not the side of the screen: the pager owns the mirror, so what it needs is
    // "the next page" or "the previous one".
    lift(date ? (date === next ? 1 : -1) : null);
    return date;
  }, [host, lift, undoWindow]);

  const track = useCallback(
    (next: DragPoint) => {
      point.current = next;
      // **A turn in flight is committed, and that includes what the edge THINKS** (§2d's
      // seventh repair, first half). The pager has refused offset commands mid-turn since the
      // second repair, but the edge kept resolving underneath it — so a hand crossing to the
      // far band during the `--t-base` travel NAMED the day behind, and the dwell armed on it
      // at half rest and fired ~110ms after the step landed. That is the reverse the owner
      // recorded, and it happens before `turnedSide` (the second half) exists to gate it.
      // The position is still recorded, so the arrival resolves against wherever the hand
      // actually ended up.
      if (commanded.current) return;
      setDate(resolve());
    },
    [resolve],
  );

  /** **Latch whatever band the pointer is in right now**, so it takes a request to act on it.
   *  Two moments need this and they are the same statement: the drag ARMED inside a band, or a
   *  page arrived under a drag that had wandered into one. */
  const latchHere = useCallback(() => {
    const el = host.current;
    const at = point.current;
    latch.current = null;
    if (!el || !at) return;
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return;
    const x = at.clientX - box.left;
    latch.current = edgeLatchAt(edgeDepth(x, box.width, DRAG_DAY_EDGE_PX), x);
  }, [host]);

  const arm = useCallback(
    (at: DragPoint) => {
      point.current = at;
      inside.current = null;
      turned.current = null;
      turnedSide.current = null;
      gatedBack.current = false;
      commanded.current = null;
      stepped.current = false;
      setDate(null);
      lift(null);
      latchHere();
    },
    [latchHere, lift],
  );

  const turning = useCallback(() => {
    commanded.current =
      asked.current == null ? null : { step: asked.current, side: inside.current };
  }, []);

  const stop = useCallback(() => {
    point.current = null;
    latch.current = null;
    inside.current = null;
    turned.current = null;
    turnedSide.current = null;
    gatedBack.current = false;
    commanded.current = null;
    stepped.current = false;
    setDate(null);
    lift(null);
  }, [lift]);

  // **Holding still at the edge has to keep stepping**, and that is the one thing the dwell
  // cannot give for free. `date` is computed from a pointer position, so once the day has
  // switched, a finger that does not move produces no `track` — and the target it named is
  // now the day you are standing on, which `useSpringLoadedDay` correctly refuses as "not a
  // switch". Recomputing when the NEIGHBOURS change is what turns one step into a queue of
  // them, 700ms apart, and it ends itself at the trip's edge where the neighbour is `null`.
  useEffect(() => {
    if (!point.current) return;
    // The neighbours moving along under a live drag IS the turn this edge commanded landing,
    // which is the only notice it gets.
    if (commanded.current) {
      const { step, side } = commanded.current;
      commanded.current = null;
      turned.current = { step, at: getNow() };
      // The side that did the turning, kept for the rest of the drag: everything else is now the
      // opposite band, and the opposite band has to be asked for.
      turnedSide.current = side;
      // The lift has been spent for this stay in the band; from here the edge arms at zero.
      stepped.current = true;
      // A band the drag DRIFTED into while the page travelled needs no special case any more:
      // it is the opposite band like any other, and `resolve` below latches it. The sixth
      // repair was this same statement made only at the arrival, which is exactly why it missed
      // the hand that crossed over a frame later.
      gatedBack.current = false;
    }
    setDate(resolve());
  }, [neighbours.prev, neighbours.next, resolve]);

  // A drag interrupted by an unmount (a mode switch, a tab change) must not leave a target
  // named for a gesture that no longer exists — and `stop` is identity-stable (see `cmd`), so
  // this really is an unmount cleanup rather than a per-render one.
  useEffect(() => stop, [stop]);

  /** Half a dwell while the step just made is still on screen and this one undoes it. Read at
   *  render because that is when the dwell arms — a stale clock here would only ever make a
   *  reversal cost MORE, never less. */
  const reversing = step != null && turned.current?.step === -step && undoWindow();

  return {
    date,
    step,
    dwell: reversing ? DRAG_DAY_REVERSE_DWELL_MS : DRAG_DAY_DWELL_MS,
    arm,
    track,
    turning,
    stop,
  };
}
