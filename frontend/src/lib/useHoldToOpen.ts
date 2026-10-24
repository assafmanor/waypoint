// **Hold a thing to open the surface behind it** (ADR-0202's 2026-08-22 amendment; owner:
// _"I was thinking that maybe a long click on a note also opens the full screen, wdyt?"_).
//
// The report it answers is the one before it: the way in to a note's full screen lives in the
// open foot, so on a long note you tap to expand, scroll past the whole body, and only then
// reach the control. A hold skips all of it, from a collapsed row or an open one, on both
// surfaces a note opens on — and costs no pixels, which is the reason a fourth mark in the
// row's trailing slot was not the answer.
//
// **It is a shortcut, never the only way.** ADR-0157 §2 admitted a gesture-only menu on the
// Map pin and paid for it with a keyboard-reachable twin on the row; here the twin already
// exists — `RowOpenFoot`'s `תצוגה מלאה` — so the hold adds a fast path without becoming the
// path. Nothing here is discoverable on its own and it is not asked to be.
//
// **Why this is not `useHoldToDrag`.** That hook is hold-to-DRAG: it owns a ghost, a source
// box, a body class, a day-preview opt-out and three bug fixes' worth of drag-specific care
// (ADR-0116). What the two genuinely share is the two hard parts, and both are already
// extracted, so this reuses them rather than restating them:
//
//   • `useSelectionGuard` — because `user-select: none` does not stop a long press from
//     ASKING the platform to select; the `selectstart` cancel is what does.
//   • `armClickSwallow` — because a hold fires with the finger still down, so the tap that
//     lands on release would otherwise ALSO toggle the row. Armed on the release, which is the
//     half ADR-0148's amendment records as easy to get wrong.
//
// Generalising the drag hook to cover both was the alternative, and it is a substantial
// refactor of a shipped gesture rather than a small extraction (root `CLAUDE.md` rule 8) — so
// it is not done here, and it is worth doing if a third holdable thing appears.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DRAG_HOLD_MS, DRAG_HOLD_SLOP_PX } from '../constants';
import { armClickSwallow } from './click-swallow';
import { useSelectionGuard } from './useHoldToDrag';

/** Spread onto the element the finger presses. Empty when there is nothing to open, so a row
 *  that cannot be held pays for no listeners at all. */
export interface HoldToOpenProps {
  onPointerDown?: (event: ReactPointerEvent) => void;
  onPointerMove?: (event: ReactPointerEvent) => void;
  onPointerUp?: (event: ReactPointerEvent) => void;
  onPointerCancel?: (event: ReactPointerEvent) => void;
  onContextMenu?: (event: { preventDefault: () => void }) => void;
}

export function useHoldToOpen(onHold: (() => void) | undefined): HoldToOpenProps {
  const selection = useSelectionGuard();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  // Whether the hold actually fired — read on release to decide whether the click that
  // follows is the user's tap or the tail of this gesture.
  const fired = useRef(false);
  // Latest callback without re-creating the handlers on every render: a note row re-renders
  // on the clock (`useClock`), and fresh handlers each second would defeat any memo above it.
  const latest = useRef(onHold);
  latest.current = onHold;

  /** Where the finger is, with missing coordinates read as 0 rather than left undefined.
   *  Not defensive noise: `Math.abs(undefined - 10)` is **NaN**, and `NaN > slop` is `false`,
   *  so a pointer event that carries no coordinates silently disables the scroll guard
   *  altogether — the hold would then fire mid-scroll and there would be nothing to see in the
   *  code. Found because jsdom implements no `PointerEvent` and its synthetic events have no
   *  coordinates at all, which is the same shape of gap. */
  const at = (event: ReactPointerEvent) => ({ x: event.clientX ?? 0, y: event.clientY ?? 0 });

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  // A hold interrupted by an unmount must not leave the page unable to select text.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      selection.release();
    },
    [selection],
  );

  return useMemo(() => {
    if (!onHold) return {};
    return {
      onPointerDown: (event) => {
        // Primary pointer only: a right-click has its own meaning, and a second finger
        // arriving is a pinch rather than a longer press.
        //
        // Written as "not explicitly secondary" rather than "is primary", which is both more
        // robust and what makes it testable: jsdom implements no `PointerEvent`, so a
        // synthetic `pointerdown` carries neither `isPrimary` nor `button` — and a guard
        // demanding `isPrimary === true` refuses every event in the unit suite while passing
        // in a browser, which is the worst way round for a gesture to be wrong.
        if (event.isPrimary === false || (event.button ?? 0) !== 0) return;
        fired.current = false;
        origin.current = at(event);
        selection.suppress();
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = true;
          latest.current?.();
        }, DRAG_HOLD_MS);
      },
      // Movement before the timer means the finger was scrolling the list, not pressing a
      // row — the same bargain `useHoldToDrag` strikes, and the reason time arbitrates rather
      // than direction.
      onPointerMove: (event) => {
        const from = origin.current;
        if (!from || !timer.current) return;
        const now = at(event);
        if (
          Math.abs(now.x - from.x) > DRAG_HOLD_SLOP_PX ||
          Math.abs(now.y - from.y) > DRAG_HOLD_SLOP_PX
        ) {
          clear();
          selection.release();
        }
      },
      onPointerUp: () => {
        clear();
        selection.release();
        // The hold already opened the screen; the click now on its way is this gesture's
        // tail, and letting it through would toggle the row underneath as well.
        if (fired.current) armClickSwallow();
        fired.current = false;
      },
      onPointerCancel: () => {
        clear();
        selection.release();
        fired.current = false;
      },
      // Android's long press and a desktop right-click both raise a context menu over the
      // element we just opened a screen from. Refused while this is wired at all — the row
      // has no context menu of its own to lose.
      onContextMenu: (event) => event.preventDefault(),
    };
  }, [onHold, selection, clear]);
}
