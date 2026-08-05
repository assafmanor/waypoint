// **Touch input for the specs that need what happens BETWEEN touchstart and touchend.**
//
// `page.touchscreen` can only tap, so a drag, a hold or a pinch has to go through CDP's
// `Input.dispatchTouchEvent` — which also produces the TRUSTED events a real finger does, and
// that matters beyond fidelity: an untrusted `PointerEvent` dispatched from `page.evaluate` has
// no active pointer behind it, so a handler calling `setPointerCapture` throws on it and the
// gesture never starts.
//
// Extracted from `shelf-drag.spec.ts`, whose local helper was single-point, when the viewer's
// pinch needed two (root CLAUDE.md rule 8: generalize the existing one-off rather than adding a
// second beside it). That file keeps its one-finger wrapper — this is the shape underneath it.
import type { CDPSession } from '@playwright/test';

export interface TouchPoint {
  x: number;
  y: number;
}

/** The points mean different things per type and the caller owns the distinction: for
 *  `touchStart`/`touchMove` they are the fingers that are DOWN, and for `touchEnd` the fingers
 *  being LIFTED — so an empty list ends the whole gesture, and naming one of two ends only that
 *  one. (The viewer's pinch cares: it goes home on the first finger up, not the last.) */
export async function dispatchTouch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: TouchPoint[] = [],
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(({ x, y }) => ({ x, y })),
  });
}
