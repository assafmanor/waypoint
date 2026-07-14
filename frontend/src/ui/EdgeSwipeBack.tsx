// The PWA return gesture (ADR-0035 §5). A trailing-edge horizontal pull that
// triggers the one `goBack()`. RTL (ADR-0009) mirrors the platform convention:
// the activation edge is the *right* edge and the pull goes leftward (the back
// chevron flips to ›). We listen on window (no blocking overlay element, so no
// taps are swallowed) and only claim the gesture — preventing scroll and moving
// the page — once a horizontal drag *starts from the edge zone*, so it never
// fights the day-strip scroll or the Plan-builder's pointer-capture drag.
import { useEffect, useRef, useState } from 'react';
import { useAppBack } from '../state/nav-state';

/** Width of the trailing-edge band a pull must start in to count as "back". */
const EDGE_ZONE_PX = 24;
/** Horizontal travel before we claim the gesture (and rule out a vertical scroll). */
const CLAIM_PX = 12;
/** Commit at 40% of the viewport width… */
const COMMIT_RATIO = 0.4;
/** …or a fast flick, whichever comes first (px/ms). */
const COMMIT_VELOCITY = 0.55;
/** How far the page trails the finger — a peek, not a 1:1 drag. */
const PARALLAX = 0.22;

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  claimed: boolean;
  dead: boolean; // ruled out (started off-edge or went vertical)
};

export function EdgeSwipeBack() {
  const goBack = useAppBack();
  const [progress, setProgress] = useState(0);
  const dragRef = useRef<Drag | null>(null);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  useEffect(() => {
    const shift = () => document.getElementById('app-shift');
    // Signed "back" travel: pull is leftward in RTL, rightward in LTR.
    const backDist = (x: number, startX: number) => (rtl ? startX - x : x - startX);
    const inEdgeZone = (x: number) =>
      rtl ? x >= window.innerWidth - EDGE_ZONE_PX : x <= EDGE_ZONE_PX;

    const applyShift = (p: number) => {
      const el = shift();
      if (!el) return;
      const off = p * window.innerWidth * PARALLAX * (rtl ? -1 : 1);
      el.style.transition = 'none';
      el.style.transform = `translateX(${off}px)`;
    };
    const resetShift = () => {
      setProgress(0);
      const el = shift();
      if (!el) return;
      el.style.transition = 'transform 0.18s ease';
      el.style.transform = '';
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastT: e.timeStamp,
        claimed: false,
        dead: !inEdgeZone(e.clientX),
      };
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
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
      const p = Math.max(0, Math.min(1, dx / window.innerWidth));
      setProgress(p);
      applyShift(p);
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.dead || !d.claimed) {
        resetShift();
        return;
      }
      const dx = backDist(e.clientX, d.startX);
      const velocity = (e.clientX - d.lastX) / Math.max(1, e.timeStamp - d.lastT);
      const backVelocity = rtl ? -velocity : velocity;
      const commit = dx > window.innerWidth * COMMIT_RATIO || backVelocity > COMMIT_VELOCITY;
      resetShift();
      if (commit) goBack();
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
  }, [goBack, rtl]);

  return (
    <div
      className={`edge-back-hint ${rtl ? 'rtl' : 'ltr'}`}
      aria-hidden="true"
      style={{
        opacity: Math.min(1, progress * 2.5),
        transform: `translateY(-50%) translateX(${(rtl ? -1 : 1) * (1 - Math.min(1, progress * 1.4)) * 48}px)`,
      }}
    >
      <span className="edge-back-chev">{rtl ? '›' : '‹'}</span>
    </div>
  );
}
