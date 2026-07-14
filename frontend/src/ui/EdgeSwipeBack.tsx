// The PWA return gesture (ADR-0035 §5). A trailing-edge horizontal pull that
// triggers the one back action. RTL (ADR-0009) mirrors the platform convention:
// the activation edge is the *right* edge and the pull goes leftward. We listen
// on window (no blocking overlay element, so no taps are swallowed) and only
// claim the gesture — preventing scroll and moving the page — once a horizontal
// drag *starts from the edge zone*, so it never fights the day-strip scroll or
// the Plan-builder's pointer-capture drag. Over an open sheet the pull may start
// anywhere (there's nothing to scroll under it), so back-to-dismiss feels
// natural. On a committed structural back the screen slides fully off before the
// content swaps; overlay-dismiss / confirm-to-exit spring back instead.
import { useEffect } from 'react';
import { useHasOverlay, useReturnControls } from '../state/nav-state';

/** Width of the trailing-edge band a pull must start in to count as "back". */
const EDGE_ZONE_PX = 24;
/** Horizontal travel before we claim the gesture (and rule out a vertical scroll). */
const CLAIM_PX = 12;
/** Commit at 40% of the viewport width… */
const COMMIT_RATIO = 0.4;
/** …or a fast flick, whichever comes first (px/ms). */
const COMMIT_VELOCITY = 0.55;
/** Point past which the drag meets resistance (rubber-band), as a width fraction. */
const RESIST_AT = 0.5;
/** Slide / spring animation duration. */
const SLIDE_MS = 260;

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  claimed: boolean;
  dead: boolean; // ruled out (started off-edge with no overlay, or went vertical)
};

export function EdgeSwipeBack() {
  const { classify, run } = useReturnControls();
  const hasOverlay = useHasOverlay();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  useEffect(() => {
    const shift = () => document.getElementById('app-shift');
    // Signed "back" travel: pull is leftward in RTL, rightward in LTR.
    const backDist = (x: number, startX: number) => (rtl ? startX - x : x - startX);
    const inEdgeZone = (x: number) =>
      rtl ? x >= window.innerWidth - EDGE_ZONE_PX : x <= EDGE_ZONE_PX;
    const dir = rtl ? -1 : 1; // which way the screen travels

    let drag: Drag | null = null;

    // Move the page (via #app-shift) with the pull; a trailing shadow reads as
    // the current screen lifting over what's behind it.
    const paint = (offset: number, animate = false) => {
      const el = shift();
      if (!el) return;
      el.style.transition = animate
        ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
        : 'none';
      el.style.transform = offset ? `translateX(${dir * offset}px)` : '';
      el.style.boxShadow = offset ? '0 0 28px rgba(0, 0, 0, 0.3)' : '';
    };
    const clearInline = () => {
      const el = shift();
      if (!el) return;
      el.style.transition = 'none';
      el.style.transform = '';
      el.style.boxShadow = '';
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastT: e.timeStamp,
        claimed: false,
        // Over an open sheet the pull may start anywhere; otherwise it must
        // start in the trailing-edge zone so it doesn't hijack content gestures.
        dead: !inEdgeZone(e.clientX) && !hasOverlay(),
      };
    };

    const onMove = (e: PointerEvent) => {
      const d = drag;
      if (!d || d.dead || e.pointerId !== d.pointerId) return;
      const dx = backDist(e.clientX, d.startX);
      const dy = Math.abs(e.clientY - d.startY);
      if (!d.claimed) {
        if (dy > CLAIM_PX && dy > dx) {
          d.dead = true; // vertical intent → yield to scroll
          return;
        }
        if (dx > CLAIM_PX && dx >= dy) d.claimed = true;
        else return;
      }
      // Claimed: it's ours — stop the page from scrolling under the pull.
      if (e.cancelable) e.preventDefault();
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
      // ~1:1 finger tracking with rubber-band resistance past the halfway mark.
      const w = window.innerWidth;
      const raw = Math.max(0, dx);
      const knee = w * RESIST_AT;
      const offset = raw <= knee ? raw : knee + (raw - knee) * 0.5;
      paint(Math.min(offset, w));
    };

    const onUp = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.dead || !d.claimed) {
        paint(0, true);
        return;
      }
      const dx = backDist(e.clientX, d.startX);
      const velocity = (e.clientX - d.lastX) / Math.max(1, e.timeStamp - d.lastT);
      const backVelocity = rtl ? -velocity : velocity;
      const commit = dx > window.innerWidth * COMMIT_RATIO || backVelocity > COMMIT_VELOCITY;
      if (!commit) {
        paint(0, true); // below threshold → spring back
        return;
      }
      const c = classify();
      if (c.kind === 'structural' || c.kind === 'exit') {
        // Real navigation: finish the screen off, then swap content and reset in
        // the same frame so the incoming screen appears at rest (it fades via
        // .body's own animation).
        paint(window.innerWidth, true);
        window.setTimeout(() => {
          run(c);
          requestAnimationFrame(clearInline);
        }, SLIDE_MS);
      } else {
        // Overlay dismiss / confirm-to-exit / no-op: the underlying screen stays
        // put — spring it back and let the sheet (or toast) handle itself.
        run(c);
        paint(0, true);
      }
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [classify, run, hasOverlay, rtl]);

  return null;
}
