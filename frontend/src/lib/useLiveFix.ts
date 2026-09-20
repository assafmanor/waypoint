// **A POSITION FOR A LEG IN PROGRESS** (ADR-0207 §4 as amended, 2026-09-20).
//
// One hook, because there were already two copies of it: `Home.tsx` and `DayView.tsx` each held
// the same `useEffect` asking `useGeolocation` for a fix once on mount, with the same comment
// beside it about never prompting. Generalising that one-off rather than adding a third beside it
// is root `CLAUDE.md` rule 8 — and the refresh this file adds is the reason a third would have
// been written.
//
// **What it changes, and it is small:** the fix is asked for AGAIN while a live leg exists and
// the screen is visible. `useGeolocation` stays one-shot and this stays a caller of it — no
// `watchPosition`, which ADR-0207 rejected on battery and this does not revisit. A one-shot
// re-asked while there is a live question is what that ADR already believed it had.
//
// **It never prompts** (§3, unchanged): every ask is gated on `permission === 'granted'`, so
// somebody who has never used the Map is never shown a dialog by a surface they only opened.
import { useEffect } from 'react';
import { useGeolocation, type Geolocation } from './useGeolocation';
import { POSITION_REFRESH_MS } from './travel-position';

/**
 * @param live whether there is a journey worth knowing your position on. `false` costs nothing
 *   beyond the shipped mount-time ask: no timer, no listener, no request. A board with no leg
 *   between two stops has no question a fix could answer.
 */
export function useLiveFix(live: boolean): Geolocation {
  const geo = useGeolocation();
  // Keyed on the two values it reads and the stable `request`, never on `geo` itself: the hook
  // returns a fresh object every render and both callers re-render on the CLOCK, so an object dep
  // would re-run this once a second forever (`frontend/CLAUDE.md`'s rule for exactly these
  // screens). This is the shipped effect, moved.
  const { permission, status, request } = geo;
  useEffect(() => {
    if (permission === 'granted' && status === 'idle') request();
  }, [permission, status, request]);

  // **The refresh.** `status` is deliberately NOT a dependency: it cycles `granted → locating →
  // granted` on every ask, so listing it would tear down and rebuild the interval each time and
  // the cadence would drift into "as fast as a fix comes back".
  useEffect(() => {
    if (!live || permission !== 'granted') return;
    const ask = () => {
      if (document.visibilityState === 'visible') request();
    };
    // A screen that comes back after a tab switch or a pocket asks at once rather than waiting
    // out the rest of an interval it spent hidden — which is the state the traveller is most
    // likely to be in when they look.
    document.addEventListener('visibilitychange', ask);
    const timer = setInterval(ask, POSITION_REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', ask);
      clearInterval(timer);
    };
  }, [live, permission, request]);

  return geo;
}
