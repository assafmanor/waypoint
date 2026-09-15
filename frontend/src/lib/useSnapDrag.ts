// The sheet's vertical drag (ADR-0121 §5, widened to a region by ADR-0122 §4).
//
// **Why this is not the shelf's drag mechanism.** ADR-0121 §5 asked the build to
// check whether `useHoldToDrag`'s pointer machinery extracts cleanly into a
// shared hook before writing a new one (CLAUDE.md rule 8). It does not, and the
// reason is written into that hook: the shelf's drag is HOLD-GATED, because a shelf
// card is simultaneously a tap target and a piece of a scrolling strip, so time has
// to arbitrate between scroll and drag; and it deliberately avoids pointer capture,
// because its dragged element can legitimately unmount mid-gesture (dwelling on the
// day strip switches the day under you, ADR-0116 session-119). Neither applies here:
// this region exists to be dragged (nothing to arbitrate, so no hold), it scrolls
// nothing, and it stays mounted for the whole gesture. ADR-0122 §4 re-read this and
// let entry 5 of ADR-0121's build log stand: the window listeners below are now a
// PARTIAL convergence with that hook, and still not an extraction.
//
// Three mechanisms that only matter once the target is a region rather than a bare
// 76×16px handle — all three are the decision, not tuning (ADR-0122 §4):
//
//   1. **A movement slop threshold.** A finger emits `pointermove` on a tap, so a
//      region that flips `moved` on the first move swallows the taps of every control
//      inside it — and the widened region now contains the view toggle and the sort
//      chip. Below `SNAP_DRAG_SLOP_PX` the gesture is a tap and the click passes
//      through; above it, it is a drag and the click that follows is suppressed.
//   2. **Pointer capture at DRAG START, never at `pointerdown`.** Capture is still
//      the reason this hook has it — it routes every move here even when the finger
//      leaves the region, so a fast drag over the map does not hand the pointer to
//      the greedy canvas. But with capture active the following `click` is
//      **retargeted to the capturing element**, so capturing early kills every tap
//      inside the region. Harmless while the target was a bare handle with nothing to
//      click; fatal now.
//   3. **The move listeners sit on the `window`.** The region is ~51px tall and the
//      gesture travels hundreds of px: two frames in, the pointer is outside it, and
//      `pointermove` then bubbles from whatever is under the finger instead.
//
// And a fourth, for a target that is ALSO a scroller (ADR-0122 §4's 2026-09-15
// amendment): **the gesture is claimed at the slop, and on touch the claim is a
// `preventDefault` on the `touchmove`**, which is what stops the browser starting the
// pan it would otherwise take at its own ~8px slop. `touch-action: none` cannot do this
// job — it is evaluated when the gesture starts, before the direction that decides it
// exists — and `useSwipePager` measured the `preventDefault` route for the day surface
// (ADR-0200 §9), so this is the same mechanism a second time rather than a new one.
//
// **When the list can still scroll that way, the gesture is the LIST'S — and the sheet
// takes over in the same gesture once the list runs out** (owner, 2026-09-15: _"first
// scrolling and then only after we're done scrolling it goes to mode switch"_). The
// browser owns that pan, so the hand-off cannot be a `preventDefault` (its `touchmove`s
// arrive non-cancelable once a scroll is under way). It is a second phase driven by the
// touch stream itself: the pointer is cancelled the moment the pan starts, but the
// `touchmove`s keep coming, and the one on which the caller reports the list at its end
// becomes the origin of a sheet drag that follows the rest of the finger's travel.
// `overscroll-behavior: none` on the scroller is what keeps the browser from painting
// its own bounce under that hand-off. A region with no scroll to compete with passes no
// `claim` and nothing here changes.
import { useCallback, useRef } from 'react';
import { SNAP_DRAG_SLOP_PX } from '../constants';

/** Whose a body press is, once the finger has moved far enough to say (ADR-0095: named,
 *  because a typo in a bare verdict string would be a silent stand-down). */
export const SNAP_CLAIM = { sheet: 'sheet', list: 'list', none: 'none' } as const;
export type SnapClaim = (typeof SNAP_CLAIM)[keyof typeof SNAP_CLAIM];

export interface SnapDragOptions {
  /** The sheet's height right now, in px — where this drag starts from. */
  heightPx: () => number;
  /** Live height during the drag. The caller renders it; nothing is committed. */
  onDrag: (px: number) => void;
  /**
   * Released: the caller snaps to a stop and drops the live height.
   *
   * `velocityPxPerMs` is signed in the sheet's own axis (positive grows it) and is
   * sampled from the **last two** moves, not the whole gesture — a flick is how the
   * finger was moving when it left, not how it averaged.
   */
  onRelease: (px: number, velocityPxPerMs: number) => void;
  /**
   * **Whose is this gesture?** — asked ONCE, at the first move past the slop, with the
   * finger's travel so far (`dy < 0` is a finger moving up, which grows the sheet).
   * `sheet`: ours now, and on touch the pan is taken from the browser. `list`: the
   * scroller's under the finger — nothing is captured or prevented, and the hook keeps
   * listening to the touch for `handoff`. `none`: nobody's; the hook stands down for the
   * rest of the gesture. Omitted, every gesture past the slop is the sheet's.
   */
  claim?: (travel: { dx: number; dy: number }) => SnapClaim;
  /**
   * While the list owns a touch, asked on every move with that move's own vertical step
   * (`< 0` is a finger moving up). `true` the moment the list can go no further that
   * way, and from there the sheet follows the rest of the finger's travel. Omitted, a
   * `list` verdict is final for the gesture.
   */
  handoff?: (stepDy: number) => boolean;
}

/** Props to spread on the drag REGION (the sheet's whole top row, not the grab
 *  line — 76×16px is under ADR-0017's touch floor). A region that never scrolls
 *  wants `touch-action: none` in CSS too, so a pan the browser might take on some
 *  ancestor is never in question; a region that DOES scroll leaves it off and lets
 *  `claim` decide, per gesture, whose the pan is. */
export interface SnapDragProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

/** Where a gesture is. `pending` is under the slop; `sheet` is ours through the pointer;
 *  `list` is the browser's pan, watched through the touch stream; `handoff` is ours again,
 *  through that same touch stream, because the pointer was cancelled when the pan began. */
type Phase = 'pending' | 'sheet' | 'list' | 'handoff' | 'done';

export function useSnapDrag({
  heightPx,
  onDrag,
  onRelease,
  claim,
  handoff,
}: SnapDragOptions): SnapDragProps {
  // Latest-ref, so a re-render mid-drag (this screen re-renders every second on
  // the clock) can't leave the listeners closed over a stale height or callback.
  const latest = useRef({ heightPx, onDrag, onRelease, claim, handoff });
  latest.current = { heightPx, onDrag, onRelease, claim, handoff };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the primary button/finger: a right-click or a second finger landing on
    // the region mid-drag must not restart the gesture from a new origin.
    if (e.button !== 0) return;
    const region = e.currentTarget as HTMLElement;
    // The press's own id, so capture names the real pointer whichever event decides —
    // a `touchmove` carries none, and a guessed one throws `NotFoundError`.
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startHeight = latest.current.heightPx();
    let phase: Phase = 'pending';
    // Two samples, so the release reads the finger's speed as it left rather than
    // the gesture's average. Seeded with the press, which makes a single-move
    // gesture measurable instead of a division by zero.
    let last = { y: e.clientY, t: e.timeStamp };
    let prev = last;
    const sample = (y: number, t: number) => {
      prev = last;
      last = { y, t };
    };
    const velocity = () => (prev.y - last.y) / Math.max(last.t - prev.t, 1);

    // Dragging UP grows the sheet: it is anchored at the bottom, so the height is
    // the distance from the finger to that edge.
    const heightAt = (clientY: number) => startHeight - (clientY - startY);

    // The hand-off's own origin and direction. The height is measured from where the list
    // ran out, not from the press, and it never crosses the height the sheet had then:
    // a finger that reverses is scrolling the list again, and the browser is already
    // doing that — a sheet moving the other way under it would be two motions for one.
    let handoffY = 0;
    let handoffDir = 0;
    let lastTouchY = startY;
    const handoffHeightAt = (clientY: number) => {
      const h = startHeight - (clientY - handoffY);
      return handoffDir < 0 ? Math.max(startHeight, h) : Math.min(startHeight, h);
    };

    const unbind = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
    };
    const finish = () => {
      phase = 'done';
      unbind();
    };

    /** The one decision, taken by whichever event crosses the slop first — the
     *  `pointermove` (a mouse only ever has that one) or the `touchmove` that a finger's
     *  move also dispatches. Idempotent, so the second arrival changes nothing. */
    const decide = (clientX: number, clientY: number) => {
      if (phase !== 'pending') return;
      // Below the slop this is still a tap, and whatever is under the finger keeps it.
      if (Math.abs(clientY - startY) < SNAP_DRAG_SLOP_PX) return;
      const verdict =
        latest.current.claim?.({ dx: clientX - startX, dy: clientY - startY }) ?? SNAP_CLAIM.sheet;
      if (verdict === SNAP_CLAIM.none) {
        finish();
        return;
      }
      if (verdict === SNAP_CLAIM.list) {
        phase = 'list';
        return;
      }
      region.setPointerCapture?.(pointerId);
      phase = 'sheet';
    };

    const move = (ev: PointerEvent) => {
      decide(ev.clientX, ev.clientY);
      if (phase !== 'sheet') return;
      sample(ev.clientY, ev.timeStamp);
      latest.current.onDrag(heightAt(ev.clientY));
    };
    /** **The touch half.** In `sheet` every `touchmove` is prevented, so the browser never
     *  starts the pan — and only then: the spec makes a prevented FIRST `touchmove` forfeit
     *  the whole touch's scrolling, so preventing a move still under the slop would take the
     *  list's scroll away from a gesture `claim` was about to hand it. In `list` the moves
     *  are the browser's and are only READ, for the step that finds the list at its end;
     *  in `handoff` they are the drag. `cancelable` is false once a scroll is under way,
     *  and preventing then is a console warning and nothing else. */
    const touchMove = (ev: TouchEvent) => {
      if (phase === 'done' || ev.touches.length !== 1) return;
      const touch = ev.touches[0];
      decide(touch.clientX, touch.clientY);
      const step = touch.clientY - lastTouchY;
      lastTouchY = touch.clientY;
      if (phase === 'sheet') {
        if (ev.cancelable) ev.preventDefault();
        return;
      }
      if (phase === 'list') {
        if (step === 0 || !latest.current.handoff?.(step)) return;
        phase = 'handoff';
        handoffY = touch.clientY;
        handoffDir = Math.sign(step);
        // Re-seeded here: the speed that matters is the finger's from the hand-off on.
        last = { y: touch.clientY, t: ev.timeStamp };
        prev = last;
        return;
      }
      if (phase === 'handoff') {
        sample(touch.clientY, ev.timeStamp);
        latest.current.onDrag(handoffHeightAt(touch.clientY));
      }
    };
    const touchEnd = (ev: TouchEvent) => {
      if (phase === 'done') return;
      const y = ev.changedTouches?.[0]?.clientY ?? lastTouchY;
      const was = phase;
      finish();
      // A pan the browser ran ends in no `click`, so there is nothing to swallow here.
      if (was !== 'handoff') return;
      const h = handoffHeightAt(y);
      // A hand-off the finger walked back to where it began is no drag at all: the speed it
      // lifted with belongs to the list it was scrolling again, and must not flick a sheet
      // that never left its stop.
      latest.current.onRelease(h, h === startHeight ? 0 : velocity());
    };
    const end = (ev: PointerEvent) => {
      // The browser cancels the pointer the moment it starts the pan, and the touch
      // stream carries the rest of a `list` gesture — so a cancel there is not an end. A
      // `pointerup` there is: a mouse has no touch stream, and a finger that lifted before
      // the browser ever panned has nothing to hand off.
      if ((phase === 'list' || phase === 'handoff') && ev.type === 'pointercancel') return;
      const was = phase;
      finish();
      // A press that never passed the slop is a tap, not a drag — releasing must not
      // snap the sheet to whichever stop happens to be nearest its current height.
      if (was !== 'sheet') return;
      // A real drag ends in a `click` retargeted to the capturing element. The region
      // holds controls, so that click has to be swallowed rather than treated as a tap
      // on one of them. Only on a release: a cancelled gesture dispatches no click, and
      // a listener left armed for one would swallow the next genuine tap.
      if (ev.type === 'pointerup') {
        region.addEventListener('click', swallow, { capture: true, once: true });
      }
      latest.current.onRelease(heightAt(ev.clientY), velocity());
    };

    window.addEventListener('pointermove', move);
    // Non-passive, because its whole job in `sheet` is `preventDefault`.
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);
  }, []);

  return { onPointerDown };
}

const swallow = (e: Event) => e.stopPropagation();
