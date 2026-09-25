// A number that changes should be seen to change (ADR-0143).
//
// Shared from the start rather than written into the join screen, because it is the
// first consumer of a whole class of beats the motion brief mapped: the invite
// countdown, day and member counts, Home's glance figures. A second surface that wants
// one is a one-line call, not a second copy of this loop (rule 8).
//
// Deliberately NOT a generic tween: it counts in INTEGER steps to a whole number, so
// what runs up is the value itself rather than a float being rounded for display.
import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './motion';
import { COUNT_UP } from '../constants';

/** Count from 0 up to `target` once, when `armed` becomes true.
 *
 *  Returns `target` immediately — never a partial value — when the user prefers
 *  reduced motion, when the target is not a positive finite number, or before it is
 *  armed. A count-up that starts at 0 and is interrupted would otherwise report a
 *  number the trip does not have. */
export function useCountUp(target: number, armed = true): number {
  const [value, setValue] = useState(target);

  // Runs once per target: the deps alone keep an unrelated re-render (the invite link
  // resolving, the CTA switching label) from restarting it. No "already played" ref on
  // top — it survived the cleanup that cleared the interval, so StrictMode's second run
  // and any N → 0 → N target returned early and stuck at 0 (F5).
  useEffect(() => {
    if (!armed) return;
    if (!Number.isFinite(target) || target <= 0 || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let step = 0;
    setValue(0);
    const id = setInterval(() => {
      step += 1;
      // Ends exactly on `target` rather than on a rounded fraction of it.
      setValue(step >= COUNT_UP.STEPS ? target : Math.round((target * step) / COUNT_UP.STEPS));
      if (step >= COUNT_UP.STEPS) clearInterval(id);
    }, COUNT_UP.STEP_MS);
    return () => clearInterval(id);
  }, [target, armed]);

  return value;
}
