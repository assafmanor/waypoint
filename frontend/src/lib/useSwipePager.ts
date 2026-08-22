// **A horizontal swipe that steps a full surface one page along the inline axis**
// (ADR-0200), with the refusal at the ends carried by the gesture itself.
//
// **It reports `live` so the host can mount the neighbouring pages** (§7). That is the one
// piece of React state in the whole gesture — two renders, at the claim and at the arrival of
// the page it turned to — and everything between them is a CSS custom property, because a
// state update per `pointermove` would re-render the heaviest screen in the app sixty times a
// second.
//
// **Why this is a third pointer recogniser and not a reuse of either existing one.**
// `useHoldToDrag` is hold-gated and takes no capture, because a shelf card is a tap
// target inside a scrolling strip and its dragged element can unmount mid-gesture.
// `useSnapDrag` is the sheet's height model — its `onDrag`/`onRelease` speak px of
// sheet height and it reads one axis in one direction — and its own header records
// that it is "a PARTIAL convergence" with the hold, "and still not an extraction".
// Nothing in either answers "which way did the finger go, and is there a page that
// way": generalising the sheet's would mean rewriting the sheet's drag, which root
// rule 8 says to ask about rather than take on silently. So this is written as the
// SHARED one for its own question — axis-aware, direction-aware, page-shaped — and a
// second surface that pages is `useSwipePager({ canStep, onStep })` and a class.
//
// Three things it does inherit rather than invent (ADR-0182 §4 settled all three for
// this codebase's one other swipe):
//
//   1. **Capture on RECOGNITION, never on `pointerdown`.** Capture retargets the
//      following `click` to the capturing element, so capturing early would kill every
//      tap on the surface — and the surface is nothing but taps.
//   2. **`armClickSwallow` on the release.** A swipe that begins on an event card must
//      not also expand it. Armed by the release (the event before the click being
//      guarded), never by the decision.
//   3. **The listeners sit on the `window`.** A page step travels most of the screen's
//      width; two frames in, the pointer is over something else entirely.
//
// **And one it deliberately does not: there is no `touch-action` on the host.** `pan-y`
// would be the obvious way to keep the horizontal axis for ourselves, and it is the mistake
// ADR-0182's device pass found from the other side — `touch-action` INTERSECTS down the
// ancestor chain and no descendant can widen it back, so on a whole day surface it takes the
// horizontal scroll away from every strip inside it. Re-measured here rather than inherited
// as a rule: `pan-y` on the day root stopped the maybe shelf scrolling at all. The axis is
// claimed in JS instead, at the press (`scrollerWithin`) and at the first real move
// (`touchMove`), which is the one place that can tell a bare stretch of day from a strip that
// owns this axis.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SNAP_FLICK_PX_PER_MS, SWIPE_PAGER } from '../constants';
import { armClickSwallow } from './click-swallow';
import { motionDurationMs } from './motion';
import { scrollerWithin } from './scrollable';

/** `1` is the next page along the inline axis — the direction reading runs, so the
 *  page you reach by pushing the content back toward where a line starts. `-1` is the
 *  previous one. Expressed logically rather than as left/right because the app is RTL
 *  and mirrors (`[dir='ltr']`, tokens.css). */
export type SwipeStep = -1 | 1;

export interface SwipePagerOptions {
  /** Is there a page that way? Asked live during the gesture, because the answer is
   *  what decides between following the finger and refusing it. */
  canStep: (step: SwipeStep) => boolean;
  /** Committed. Called once, and **after the page has finished turning** rather than at the
   *  release: the exit animation carries the outgoing page fully off screen, which lands the
   *  neighbour's own pane exactly at rest — so the moment this fires, what replaces the pane
   *  is identical to what was already drawn there (§7). Calling it at the release instead put
   *  the new day under the finger mid-gesture, which is the opposite of continuous. */
  onStep: (step: SwipeStep) => void;
  /** Off while something else owns the pointer — a hold-drag in flight. Not a
   *  tidiness guard: the drag's ghost is `position: fixed` and this host would become
   *  its containing block the moment we set a transform on it. */
  enabled?: boolean;
  /**
   * **Which page is currently drawn** — and the pager's contract is that `onStep` changes it
   * (§8). The offset belongs to the page it was dragged from, so a finished turn cannot give
   * it back until the page it turned TO is the one on screen; this is what says when that
   * happened. Anything stable and comparable: the day surface passes `activeDate`.
   *
   * A host whose `onStep` leaves it unchanged leaves the surface a page off level until the
   * next touch, which re-bases it — recoverable, and the reason there is no timer here
   * second-guessing the contract.
   */
  pageKey: unknown;
}

/** The attribute the host's CSS keys the follow off (`screens.css`). Set only while a gesture
 *  is live.
 *
 *  **The transform it drives is on the host's inner PAGE, never on the host itself**, and that
 *  is what lets the peeks work: a transform makes its element the containing block for any
 *  `position: fixed` descendant, and the peeks are fixed panes that must stay pinned to the
 *  viewport however far the day is scrolled. Host holds the variable, page and panes both read
 *  it, nobody's positioning is captured. */
const SWIPING_ATTR = 'data-swiping';
/** Set for the settle only, and its VALUE says which settle it is: `turn` finishes the page
 *  turn (a full page of travel), `back` gives back the strain a refusal took. The CSS keys its
 *  duration off the same value the timer below reads, because one duration for both would
 *  remove the class mid-animation on the shorter one and the transform would snap. */
const SETTLING_ATTR = 'data-swipe-settling';
/** **The page is held at a detent** (ADR-0116 §2d) — set while a commanded lift is parked,
 *  and the state `screens.css` gives its own transition. Distinct from `SETTLING_ATTR` because
 *  a detent is not a settle: nothing is on its way anywhere until the dwell says so. */
const LIFT_ATTR = 'data-edge-lift';
const OFFSET_PROP = '--swipe-dx';
/** The host's own width in px, published for the panes: they sit one page plus a gutter away on
 *  the inline axis, and a percentage cannot say that — a fixed pane's percentages resolve
 *  against the VIEWPORT, which is wider than the page on any tablet or desktop (`.app` is a
 *  centred 430px column). Measured at the claim, which is also when the panes mount. */
const WIDTH_PROP = '--swipe-page-w';
/** The gutter between two pages, **owned by the stylesheet and read back here** so the commit
 *  travels exactly as far as the panes are offset. A literal in this file would be a second
 *  opinion about a spacing value, and the two would drift the first time either moved — the
 *  page would then stop a gutter short of level and the arriving day would sit visibly off. */
const GAP_PROP = '--swipe-page-gap';

export interface SwipePager<T extends HTMLElement> {
  /** Attach to the host — the box that is measured and that holds the offset variable. */
  ref: RefObject<T | null>;
  /**
   * **Hold the page at a detent, or let it go** (ADR-0116 §2d) — a page turn that has begun
   * without a finger. `hold(step, px)` parks the strip `px` toward `step` and leaves it there;
   * `hold(null)` gives it back.
   *
   * This exists because the drag's edge dwell needs the same three things a swipe needs — the
   * offset channel, the panes mounted, the measured width — and writing them a second time
   * beside this hook is what root rule 8 exists to stop. What the caller supplies is only
   * *when*: a finger, or a dwell.
   */
  hold: (step: SwipeStep | null, px?: number) => void;
  /**
   * **Finish the turn and commit it**, on the same path a released drag takes: the settle
   * attribute, a full page plus the gutter of travel, `onStep` at the end, and §8's owed reset
   * paid by the arriving page. A commanded turn is a turn.
   */
  turn: (step: SwipeStep) => void;
  /** A gesture is claimed and the surface has not been given back yet. The host mounts its
   *  neighbouring pages on this, and only on this: mounted always, they would triple the cost
   *  of the day surface for a gesture that has not happened.
   *
   *  It outlives the settle by design on a committed turn (§8): the pane that finished the
   *  turn is what is covering the screen, so it stays until the page it turned to is drawn. */
  live: boolean;
}

export function useSwipePager<T extends HTMLElement>({
  canStep,
  onStep,
  enabled = true,
  pageKey,
}: SwipePagerOptions): SwipePager<T> {
  const host = useRef<T | null>(null);
  const [live, setLive] = useState(false);
  // Latest-ref: a day surface re-renders on the clock, and the listeners below are bound
  // once — closing over a stale `canStep` is how the last day of a trip would step.
  const latest = useRef({ canStep, onStep, enabled });
  latest.current = { canStep, onStep, enabled };
  const settle = useRef(0);
  /** A turn has been committed and its offset is still owed a reset — held until the page it
   *  turned to is drawn (see the layout effect below). */
  const owed = useRef(false);
  /**
   * **A commanded turn is in flight** (ADR-0116 §2d's repair) — set for the `--t-base` between
   * `turn()` and the step it commits.
   *
   * It exists because the two commands share one channel and a re-issued LIFT was quietly
   * killing the turn: the edge dwell re-commands `hold(step)` on every move it sees — every
   * pointer jitter, and every frame the auto-scroll scrolls — and `hold` rewrote the offset and
   * cleared this timer. Measured: `dx 382px` / `settling=turn`, one 1px move, `dx 48px` and no
   * day change at all. That is the owner's _"doesn't always move to the next day"_, and the
   * _"stutter that looks like it tries to complete the swipe but out of place"_ was the page
   * snapping back from a turn it had already started.
   */
  const turning = useRef(false);

  /** The host's own geometry, measured on demand. A gesture measures it once at the press;
   *  a COMMAND has no press, so the same three numbers are read here. `direction` off the
   *  element rather than the document, for `useSwipePager`'s usual reason — the mirror is a
   *  CSS variant, so the element is the only thing that knows which way its inline axis runs. */
  const geometry = useCallback(() => {
    const el = host.current;
    if (!el) return null;
    const width = el.getBoundingClientRect().width || window.innerWidth;
    const gap = parseFloat(getComputedStyle(el).getPropertyValue(GAP_PROP)) || 0;
    const rtl = getComputedStyle(el).direction === 'rtl';
    /** Which way the page travels, in screen px, to reach `step`. */
    const dirFor = (step: SwipeStep) => (rtl ? step : -step);
    return { el, width, gap, turn: width + gap, dirFor };
  }, []);

  /** Give the surface back: no offset, no attributes, no panes. Hoisted out of the listener
   *  effect because a committed turn is undone by a RENDER rather than by the gesture that
   *  asked for it. */
  const clear = useCallback(() => {
    window.clearTimeout(settle.current);
    owed.current = false;
    turning.current = false;
    const el = host.current;
    if (el) {
      el.removeAttribute(SWIPING_ATTR);
      el.removeAttribute(SETTLING_ATTR);
      el.removeAttribute(LIFT_ATTR);
      el.style.removeProperty(OFFSET_PROP);
      el.style.removeProperty(WIDTH_PROP);
    }
    setLive(false);
  }, []);

  const hold = useCallback(
    (step: SwipeStep | null, px = 0) => {
      const g = geometry();
      if (!g) return;
      const { el } = g;
      if (step == null) {
        // **Letting go DOES cancel a turn in flight**, which is the one asymmetry here worth
        // stating: a re-lift below is jitter and must not touch it, but "there is no day being
        // aimed at any more" is the gesture withdrawing — the finger left the band, or let go
        // over a target. Committing anyway would move the day out from under a drop that had
        // already landed on the day before it.
        window.clearTimeout(settle.current);
        owed.current = false;
        turning.current = false;
        // Not `clear()`: the offset goes to zero and the surface unwinds under the destination
        // state's own transition (`screens.css`). Clearing the attributes here would take the
        // transform away mid-unwind and it would snap. The settle attribute goes too, because
        // an abandoned turn unwinds on the quick curve rather than on the turn's own.
        el.removeAttribute(LIFT_ATTR);
        el.removeAttribute(SETTLING_ATTR);
        el.style.setProperty(OFFSET_PROP, '0px');
        settle.current = window.setTimeout(clear, motionDurationMs('--t-quick'));
        return;
      }
      // The dwell has fired and the page is on its way; `--t-base` is not a window for a
      // change of mind, and re-parking it at the detent is what read as a stutter.
      if (turning.current) return;
      const dx = `${Math.round(g.dirFor(step) * px)}px`;
      // **Idempotent, because the caller is a stream.** A command channel that rewrites the
      // value it is already holding sixty times a second is a defect even where it is
      // harmless, and here it was not harmless: every write cleared the settle timer. The DOM
      // is asked rather than a second copy of this state kept, so a `clear()` in between (the
      // arriving page's own reset) correctly reads as "not held" and lifts again.
      if (el.hasAttribute(LIFT_ATTR) && el.style.getPropertyValue(OFFSET_PROP) === dx) return;
      window.clearTimeout(settle.current);
      owed.current = false;
      el.removeAttribute(SETTLING_ATTR);
      el.setAttribute(SWIPING_ATTR, '');
      el.setAttribute(LIFT_ATTR, '');
      el.style.setProperty(WIDTH_PROP, `${Math.round(g.width)}px`);
      el.style.setProperty(OFFSET_PROP, dx);
      setLive(true);
    },
    [clear, geometry],
  );

  const turn = useCallback(
    (step: SwipeStep) => {
      const g = geometry();
      if (!g) return;
      const { el } = g;
      // One turn per dwell: a second command while the page is already travelling would
      // restart the same journey from further along it.
      if (turning.current) return;
      window.clearTimeout(settle.current);
      turning.current = true;
      // The lift's attribute goes first: its transition is the detent's, and what follows is
      // the turn's — one channel, two states, never both at once.
      el.removeAttribute(LIFT_ATTR);
      el.setAttribute(SWIPING_ATTR, '');
      el.setAttribute(SETTLING_ATTR, 'turn');
      el.style.setProperty(WIDTH_PROP, `${Math.round(g.width)}px`);
      el.style.setProperty(OFFSET_PROP, `${Math.round(g.dirFor(step) * g.turn)}px`);
      setLive(true);
      settle.current = window.setTimeout(() => {
        turning.current = false;
        owed.current = true;
        latest.current.onStep(step);
      }, motionDurationMs('--t-base'));
    },
    [geometry],
  );

  /**
   * **The reset lands in the same paint as the page it turned to** (§8, owner: _"there's like a
   * stutter where you briefly see the last day"_).
   *
   * Dropping `data-swiping` drops the only rule that translates the page (`screens.css`), so
   * the page snaps to level the instant that attribute goes. Doing it beside `onStep` therefore
   * put the OLD day at level for however long React took to commit the new one — and the
   * commit cannot be hurried into that task: `BrowserRouter` (react-router 7) wraps its
   * location update in `startTransition`, which `flushSync` does not flush. Measured, not
   * reasoned: `flushSync(onStep)` left the probe in `e2e/day-swipe.spec.ts` just as red.
   *
   * So the wait is the mechanism rather than the workaround. A **layout** effect keyed on the
   * page: it runs inside the commit that carries the new day, before the browser has painted
   * anything, so there is no frame between the two states to shorten — and `setLive(false)`
   * from in here re-renders before that same paint, which retires the panes in it too.
   */
  useLayoutEffect(() => {
    if (owed.current) clear();
  }, [pageKey, clear]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // A gesture's `window` listeners outlive the element unless something takes them down:
    // this surface unmounts on a tab change, and a finger still on the glass would otherwise
    // keep driving a host that is no longer on screen.
    let abandon: (() => void) | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (!latest.current.enabled) return;
      // Primary finger / left button only: a second finger landing mid-gesture must not
      // restart it from a new origin, and a right-click is not a swipe.
      if (e.button !== 0 || !e.isPrimary) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      // A press inside a strip that scrolls horizontally is that strip's, not ours —
      // asked as "does it overflow right now", which is `scrollsOn`'s whole point: a
      // shelf of two ideas does not scroll, so a swipe across it is a page step.
      if (scrollerWithin(target, el, 'inline')) return;

      const startX = e.clientX;
      const startY = e.clientY;
      // The claim can now come from the TOUCH stream (see `claim`), which has no pointerId of
      // its own — so it is taken here, where the gesture starts.
      const pointerId = e.pointerId;
      // `direction` off the host rather than `document.dir`: the mirror is a CSS variant,
      // so the element is the only thing that knows which way its own inline axis runs.
      const rtl = getComputedStyle(el).direction === 'rtl';
      const width = el.getBoundingClientRect().width || window.innerWidth;
      const gap = parseFloat(getComputedStyle(el).getPropertyValue(GAP_PROP)) || 0;
      /** How far the page travels to finish a turn: a full page, plus the gutter, so the
       *  arriving pane lands exactly at level. */
      const turn = width + gap;
      const commitPx = width * SWIPE_PAGER.COMMIT_SHARE;
      /** Content dragged toward inline-START reveals the NEXT page: in RTL that is a
       *  finger moving right, in LTR one moving left. */
      const stepFor = (dx: number): SwipeStep => ((rtl ? dx > 0 : dx < 0) ? 1 : -1);

      let claimed = false;
      let done = false;
      /** Where the follow starts from, in travel px. **The page must not jump when it is
       *  claimed** (§9): whatever the finger had already spent getting the gesture recognised
       *  belongs to the recognition, not to the page, so the offset is measured from here and
       *  the surface leaves level at 0 and tracks 1:1. Measured before this existed: 20px of
       *  nothing, then a 24px jump on one frame, at the start of every swipe. */
      let origin = 0;
      // **The travel is the last position we SAW, never the release event's own.** A
      // `pointercancel` carries no meaningful coordinates at all, and a `pointerup` can
      // arrive at the origin when the platform has no point left to report it against —
      // measured here, where an e2e `touchEnd` that lifts every finger produced a
      // `pointerup` at x=0 and turned a rightward swipe into a large leftward one. Reading
      // the release for a distance the moves already told us is a coin flip on the platform.
      let lastX = startX;
      // Set once the axis has been decided in our favour (see `touchMove`). A mouse never
      // decides — there is no browser pan to lose — so the pointer path below stands alone.
      let ours = false;
      // **The last two moves, for the flick** (§9). The same sampling `useSnapDrag` does for
      // the sheet, against the same threshold: a flick is how the finger was moving when it
      // left, not how it averaged over a gesture that may have paused halfway.
      let prev = { x: startX, t: e.timeStamp };
      let last = prev;

      /** Which way the page travels, in screen px, to reach `step`. The mirror lives here and
       *  not in a `Math.sign` of the finger's travel, because a flick can commit a step the
       *  accumulated travel does not agree with. */
      const dirFor = (step: SwipeStep) => (rtl ? step : -step);

      /**
       * **Take the gesture, and start the follow from where we took it.**
       *
       * Called from `touchMove` the moment the axis is decided (touch), or from `move` at
       * `SLOP_PX` (mouse). Those are two different questions and the answer used to be one
       * number: on touch the browser's pan is already forfeited at `DECIDE_PX` — `touchMove`
       * has called `preventDefault` by then — so waiting for 24px protected nothing and cost
       * the user 18px of a surface that had stopped scrolling and had not started moving.
       */
      const claim = (atDx: number) => {
        claimed = true;
        origin = atDx;
        el.setPointerCapture?.(pointerId);
        window.clearTimeout(settle.current);
        // A second swipe inside the first one's few-ms wait owns the surface now, so the
        // owed reset is dropped rather than left to fire mid-drag and flatten it — and a
        // commanded turn it interrupts is dropped with it, for the same reason.
        owed.current = false;
        turning.current = false;
        el.removeAttribute(SETTLING_ATTR);
        el.setAttribute(SWIPING_ATTR, '');
        el.style.setProperty(WIDTH_PROP, `${Math.round(width)}px`);
        // The panes mount here, one render, while the finger is still accelerating.
        setLive(true);
      };

      const offsetFor = (dx: number) => {
        if (latest.current.canStep(stepFor(dx))) return dx;
        // THE REBUFF. No page that way, so the surface strains a little and no further.
        const strained = Math.min(Math.abs(dx) * SWIPE_PAGER.EDGE_RESIST, SWIPE_PAGER.EDGE_MAX_PX);
        return Math.sign(dx) * strained;
      };

      /** **Something else took the pointer while we held it.** The hold-drag arms on a press
       *  and fires on a TIMER, so `enabled` can go false with our listeners already bound —
       *  and this hook's own docblock promises the pager "stands down entirely rather than
       *  racing it for the transform". Read at the press only, that promise held only for
       *  gestures that had already moved 24px by then; found while matching arms on an
       *  unrelated flake, and it is the drag's own spec that would have paid for it (§9). */
      const stoodDown = () => {
        if (latest.current.enabled) return false;
        done = true;
        unbind();
        if (claimed) clear();
        return true;
      };

      const unbind = () => {
        abandon = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('touchmove', touchMove);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };

      /**
       * **The axis is decided HERE, at the browser's slop and not at ours** — and this
       * listener is the whole reason the gesture reaches the recogniser at all.
       *
       * Measured, not reasoned: a touch starting on a bare part of the surface got exactly
       * ONE `pointermove` (15px of it) and then a `pointercancel`. Chrome claims a touch for
       * scrolling at ~8px of travel, in whatever direction, wherever panning is allowed — so
       * a recogniser whose threshold is 24px never gets to 24px. (The day CARDS worked the
       * whole time, because they already declare a `touch-action` of their own for the
       * hold-drag; that is what made the failure look intermittent.)
       *
       * So the ONLY way to keep the horizontal axis is to say so before Chrome takes it:
       * either `touch-action: pan-y` in CSS or `preventDefault` here. It is here because
       * `touch-action` cannot ask the one question that matters. It INTERSECTS down the
       * ancestor chain and no descendant can widen it back (ADR-0182's device-pass scar,
       * re-measured on this surface: `pan-y` on the day root stopped the maybe shelf
       * scrolling at all), so as a declaration it cannot distinguish "a bare stretch of the
       * day" from "a strip that owns this axis". `scrollerWithin` distinguishes them exactly,
       * at the moment of the press — which is why the guard above is enough and there is no
       * `touch-action` on the host.
       *
       * `DECIDE_PX` is therefore under Chrome's slop on purpose: the first move that travels
       * far enough to mean anything is the only one we get to answer.
       */
      const touchMove = (ev: TouchEvent) => {
        if (done || stoodDown() || ev.touches.length !== 1) return;
        const touch = ev.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (!ours) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PAGER.DECIDE_PX) return;
          // Vertical enough to be the body's scroll: never prevent, and never look again.
          if (Math.abs(dx) <= Math.abs(dy) * SWIPE_PAGER.AXIS_RATIO) {
            done = true;
            unbind();
            return;
          }
          ours = true;
          // **Claimed here, at the same moment the pan is forfeited** (§9). One decision, one
          // place: the `preventDefault` below is what takes the axis, so this is where the
          // surface starts following. `origin` is this touch's own travel, so nothing jumps.
          if (!claimed) claim(dx);
        }
        // Cancelable is false once a scroll is already under way — preventing then is a
        // console warning and nothing else, so ask rather than assume.
        if (ev.cancelable) ev.preventDefault();
      };

      const move = (ev: PointerEvent) => {
        if (done || stoodDown()) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        lastX = ev.clientX;
        prev = last;
        last = { x: ev.clientX, t: ev.timeStamp };
        if (!claimed) {
          // The browser's pan wins the moment the travel reads vertical — stop listening
          // rather than sitting armed, or a long scroll ending with a sideways flick pages
          // the day out from under it.
          if (Math.abs(dy) >= SWIPE_PAGER.SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
            done = true;
            unbind();
            return;
          }
          // The MOUSE's gate, and on touch a gesture claimed by `touchMove` never reaches
          // it. `SLOP_PX` is right here for the reason it was always right: there is no pan
          // to lose, so nothing is spent by waiting until the travel means something.
          if (
            Math.abs(dx) < SWIPE_PAGER.SLOP_PX ||
            Math.abs(dx) <= Math.abs(dy) * SWIPE_PAGER.AXIS_RATIO
          ) {
            return;
          }
          claim(dx);
        }
        el.style.setProperty(OFFSET_PROP, `${Math.round(offsetFor(dx - origin))}px`);
      };

      const end = (ev: PointerEvent) => {
        unbind();
        if (!claimed || done) return;
        done = true;
        // **A `pointercancel` is the browser saying it took the gesture** — the pan won, or
        // the element went away under the finger. It is not a short release, so it commits
        // nothing; the surface just comes back to level. And it fires no `click`, so arming
        // the swallow for one would leave it to eat the user's next genuine tap (the scar
        // `armClickSwallow` itself documents).
        const released = ev.type === 'pointerup';
        if (released) armClickSwallow();
        // Measured from the claim, like the offset is: this is how far the PAGE moved, which
        // is what the user was aiming with.
        const dx = lastX - startX - origin;
        const step = stepFor(dx);
        /**
         * **A quick swipe is a swipe** (§9, owner: _"quick swipes don't always register"_).
         * Distance alone refuses a flick that travelled less than a fifth of the page, however
         * unmistakable it was — and `SNAP_FLICK_PX_PER_MS`'s own docblock reports the same
         * complaint from the sheet a release earlier, so the app already knows what a flick
         * is. One threshold, one sampling rule (the last two moves), two surfaces.
         *
         * Two guards, and each is a real gesture. It must be going the way the drag went, or a
         * flick BACK from a half-open page would step to the day behind you when what it plainly
         * means is "no" — position decides between the page you are on and the one you are
         * already moving toward, and the flick only picks between those two. And it must have
         * cleared `SLOP_PX`, or a thumb rolling a few px off a tap pages the day at speed.
         */
        const dt = Math.max(last.t - prev.t, 1);
        const velocity = (last.x - prev.x) / dt;
        const flick =
          Math.abs(velocity) >= SNAP_FLICK_PX_PER_MS &&
          Math.sign(velocity) === Math.sign(dx) &&
          Math.abs(dx) >= SWIPE_PAGER.SLOP_PX;
        const commit =
          released && (flick || Math.abs(dx) >= commitPx) && latest.current.canStep(step);
        // **Two different endings, two different distances, two different tokens.** A commit
        // finishes the turn — the page carries on a full page plus the gutter, which puts the
        // arriving pane exactly at rest — so it travels furthest and takes `--t-base`, the app's token
        // for a surface moving. A refusal only has to give back the strain it took, so it is
        // `--t-quick`. Both read the same token the CSS transition does, and both answer 0
        // under reduced motion, so no attribute can outlive an animation that did not play
        // (ADR-0140 §5).
        el.setAttribute(SETTLING_ATTR, commit ? 'turn' : 'back');
        // The direction of the STEP, not of the travel. They agree on a drag and can disagree
        // on nothing else now that a reversing flick refuses — but deriving the page's travel
        // from the step it commits is the statement that cannot go out of sync.
        el.style.setProperty(OFFSET_PROP, commit ? `${Math.round(dirFor(step) * turn)}px` : '0px');
        settle.current = window.setTimeout(
          () => {
            // **The date changes only now, with the arriving pane covering the screen.** So the
            // swap is a pane leaving and the host arriving at the same offset with the same day
            // drawn by the same components — nothing moves, which is why there is no cross-fade
            // and no keyframe anywhere in this feature.
            //
            // A commit does NOT clear here: the offset is owed back to whichever page is drawn
            // next, and the layout effect above pays it in that page's own paint (§8). A
            // refusal clears immediately, because nothing is arriving — there is no second
            // state to be caught between.
            if (!commit) {
              clear();
              return;
            }
            owed.current = true;
            latest.current.onStep(step);
          },
          motionDurationMs(commit ? '--t-base' : '--t-quick'),
        );
      };

      abandon = unbind;
      window.addEventListener('pointermove', move);
      // Non-passive, because its whole job is `preventDefault`.
      window.addEventListener('touchmove', touchMove, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };

    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      abandon?.();
      clear();
    };
  }, [clear]);

  return { ref: host, live, hold, turn };
}
