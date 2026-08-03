// **The promotion, actually promoting** (ADR-0160 §5/§7) — the FLIP that carries the
// collapsed board's box up into the lifted hero, and sets it back down again.
//
// The defect this fixes was reported on a phone in one sentence: _"now it became a
// simple overlay rendering the hero twice instead of lifting up"_. Two things caused
// it, and only one of them is motion — the collapsed board stayed on screen (fixed in
// `board.css`'s `.is-lifted`), and the lifted card faded in at the centre with nothing
// connecting it to what was tapped. A fade between two boards IS the overlay grammar
// §1 rejects; the object has to travel.
//
// **Why the box and not a scale.** §5 measured it: the board is already near-full-width
// (358 → 374px, ×1.045), so a transform-FLIP has almost no scale in it to spend — and
// what it does spend it spends on the text, which then resamples and blurs for the whole
// tween. The lift's visible budget is HEIGHT (×2.01) and elevation. So `width`/`height`
// animate as real layout (crisp text at both ends, the scroller reflowing honestly), and
// `transform` is left free for the one thing it is right for: the 9° swing.
//
// **Why `position: fixed` for the duration, and why that is not a re-declared box.**
// The card is centred by the overlay's flex, and a flex-positioned box cannot animate
// from an arbitrary measured rect. The naive fix — declare the settled box in CSS so JS
// can animate to it — puts the same geometry in two places. This does the opposite: it
// MEASURES what the CSS resolved to (the "Last" pass), then leaves the flow only for as
// long as the flight lasts. CSS stays the single owner of where the hero settles; JS
// only ever reads it.
//
// That two-pass measure is not optional, and the reason is a property nobody should have
// to rediscover: **`height` does not interpolate to `auto`.** Measured in Chromium —
// `290px → auto` reports 290 then 432 with nothing in between, while `290px → 584px`
// passes through 420.7. The hero is content-sized (§8), so its settled height *is*
// `auto`, and an entrance that snaps the one channel carrying the whole budget is not
// the designed character.
//
// **Why the Web Animations API rather than a CSS transition.** `useFlipRows` already
// chose it for this exact reason and the reason holds double here: it leaves no inline
// styles behind for React to diff against. A transition would need the target box
// written as inline style and then *released* back to `auto` on a timer — a state that
// exists only during an animation, outliving it if the timer is wrong, which is
// ADR-0140 §5's whole subject. Here the only such state is one `position` property, and
// it is cleared in the same synchronous block that cancels the animation.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { measuredBox, motionDurationMs, readMotionToken, type Box } from './motion';

/** §5's chosen character, ההטיה: the hero straightens up toward the viewer from 9° back
 *  and 46px away. It is on the ENTRANCE only — §7 is explicit that the exit is not the
 *  entrance reversed, and a rotation on the way down would be exactly that. */
const SWING = 'perspective(900px) rotateX(9deg) translateZ(-46px)';

function frame(box: Box, transform: string): Keyframe {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    transform,
  };
}

/**
 * Put back everything a flight borrows, and **the reason this is a named function called
 * from three places** rather than a tail of `fly`.
 *
 * A flight leaves the hero `position: fixed`. Measuring an element in that state answers
 * its STATIC position — where it would sit with its parent collapsed around it, since it
 * no longer takes part in the layout that centres it. So a second measurement taken while
 * the first flight's styles are still on reads a box ~148px out and flies there.
 *
 * That is not hypothetical and it is not only a StrictMode artifact, though StrictMode is
 * what surfaced it: React double-invokes effects in dev, the first run left the styles on,
 * and the second measured 422 instead of 273.5 and animated to the wrong place. Any remount
 * does the same. Measured in a browser and invisible to jsdom, where no rect has a value at
 * all — which is why the entrance effect now cleans up after itself.
 */
function release(subject: HTMLElement, running: { current: Animation | null }): void {
  running.current?.cancel();
  running.current = null;
  subject.style.position = '';
  subject.style.margin = '';
}

/**
 * Fly `subject` between two measured boxes.
 *
 * `running` carries the animation across calls so a close landing mid-entrance
 * supersedes it instead of racing it: the old animation's `finished` rejects on
 * `cancel()`, and even if it resolved, the identity check keeps a superseded flight from
 * stripping the styles the live one is using.
 */
function fly(
  subject: HTMLElement,
  running: { current: Animation | null },
  from: Box,
  to: Box,
  ms: number,
  easeToken: string,
  swing: boolean,
): void {
  running.current?.cancel();
  // The card is centred by `margin` + `calc()` width in the variant's CSS; under
  // `position: fixed` with an explicit box, that margin would offset every frame of it.
  subject.style.position = 'fixed';
  subject.style.margin = '0';
  const animation = subject.animate(
    [frame(from, swing ? SWING : 'none'), frame(to, 'none')],
    // `fill: 'both'` so the last frame holds until the styles come off in the same tick
    // below. With `fill: 'none'` the box would snap back to its static-position box for
    // the one frame between the animation ending and the cleanup running.
    { duration: ms, easing: readMotionToken(easeToken) || undefined, fill: 'both' },
  );
  running.current = animation;
  animation.finished
    .then(() => {
      // Cancel and reset together: dropping the fill first would paint one frame of the
      // static box, and clearing `position` first would paint one frame of the filled box
      // in flow. Neither happens if nothing yields in between.
      if (running.current === animation) release(subject, running);
    })
    .catch(() => {
      // Superseded or cancelled. Whatever replaced this flight owns the cleanup.
    });
}

/**
 * The lifted hero's flight, both halves.
 *
 * @param subject the element that IS the hero — the board inside the modal card, not the
 *   card. The card is a transparent shell in this variant; flying it would leave the
 *   content-sized board overflowing a box animating independently of it.
 * @param origin the collapsed board that was pressed. It must still be in the DOM and
 *   still hold its box (`visibility`, never `display`) — the exit measures it, and a
 *   `display: none` origin would answer `null` and drop the landing.
 * @param closing the primitive's own exit state, so the descent runs on the same
 *   `--t-quick` window `useExitTransition` is already waiting out. Both read the same
 *   token, so they cannot disagree about when the hero is gone.
 *
 * **Nothing animates and that is a correct outcome**, in three cases the lifted state
 * must be right as a static state for: reduced motion, an unreadable `tokens.css`, and
 * an unmeasurable box (every jsdom test, by construction).
 */
export function useLiftFlight({
  subject,
  origin,
  closing,
}: {
  subject: RefObject<HTMLElement | null>;
  origin: HTMLElement | null;
  closing: boolean;
}): void {
  const running = useRef<Animation | null>(null);

  // Entrance, in a LAYOUT effect: this is the "Last" measurement, and it has to read the
  // settled box after the browser has laid the hero out but before it paints it — a
  // passive effect would let one frame of the hero at its destination through first,
  // which is the flight starting from wherever it had got to.
  useLayoutEffect(() => {
    const el = subject.current;
    const from = measuredBox(origin);
    const to = measuredBox(el);
    const ms = motionDurationMs('--t-base');
    if (!el || !from || !to || ms === 0) return;
    fly(el, running, from, to, ms, '--ease-arrive', true);
    // The cleanup is not housekeeping — it is what makes the measurement above correct on a
    // second run. See `release`.
    return () => release(el, running);
    // Deps are deliberately empty: this is the ENTRANCE, so it belongs to the mount and
    // nothing else. `origin` is the element that was pressed and cannot change while the
    // hero is up, and re-running on any later render would re-fly a hero that has landed.
  }, []);

  // The descent. `--ease-exit` accelerates into its end, which is already the curve of
  // something being set down (§7), so the path is right and what remains is the contact —
  // the landing beat, which belongs to the board that comes back and is played there.
  useLayoutEffect(() => {
    if (!closing) return;
    const el = subject.current;
    // Measured from where the hero IS, not from where it settled: a close during the
    // entrance should descend from the middle of the flight, not jump to the top of it.
    const from = measuredBox(el);
    const to = measuredBox(origin);
    const ms = motionDurationMs('--t-quick');
    if (!el || !from || !to || ms === 0) return;
    fly(el, running, from, to, ms, '--ease-exit', false);
    return () => release(el, running);
  }, [closing, origin, subject]);
}
