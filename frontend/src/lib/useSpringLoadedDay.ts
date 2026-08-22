// Resting a drag on another day's pill switches to that day (ADR-0116 session-119) —
// the spring-loaded-folder idiom, so a card or a row can be carried to a day that
// isn't on screen without being put down first.
//
// Gated on a DWELL, which is the whole substance of it: a drag crosses several pills
// on its way anywhere, and opening every day it merely passes over would be unusable.
//
// Driven by which pill the drag's hit-test found, NOT by the pill's own
// `pointerenter`. A touch pointer is implicitly captured by the element the touch
// started on, so enter/leave never fire on anything the finger travels over — the
// pills would simply never light up. `elementFromPoint` is the only thing that knows.
import { useEffect, useRef } from 'react';
import { DRAG_DAY_DWELL_MS } from '../constants';
import { useIsDayPreview } from '../state/day-preview';

/**
 * @param overDate  the day pill under the pointer, or null
 * @param activeDate the day already on screen — resting on it is not a switch
 * @param onSwitch  called once, after the dwell
 */
export function useSpringLoadedDay(
  overDate: string | null,
  activeDate: string,
  onSwitch: (date: string) => void,
): void {
  // Read through a ref so the effect's deps are the two dates and nothing else: this
  // screen re-renders every second on the clock, and a callback identity in the deps
  // would restart the dwell on every tick.
  const cb = useRef(onSwitch);
  cb.current = onSwitch;
  // A pane is a day surface too, and switching the day is the loudest possible way to reach
  // out of one (ADR-0116 §2c). Its `activeDate` differs from the drag's target by definition,
  // so without this every mounted peek arms a dwell of its own against the shared
  // `overDate` — three timers for one gesture, latent until §2c mounted the panes mid-drag.
  const preview = useIsDayPreview();

  useEffect(() => {
    if (preview) return;
    if (!overDate || overDate === activeDate) return;
    const id = setTimeout(() => cb.current(overDate), DRAG_DAY_DWELL_MS);
    // Moving off the pill (or ending the drag) changes `overDate`, and the cleanup is
    // what makes "merely passed over" a no-op.
    return () => clearTimeout(id);
  }, [overDate, activeDate, preview]);
}
