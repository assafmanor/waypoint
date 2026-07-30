// **How much of the layout viewport the on-screen keyboard is covering** — which is 0 on every
// platform that RESIZES the viewport for it, and the keyboard's height on the one that does not.
//
// ADR-0132 §2 established that there are two platform models and that assuming one is a defect:
// **Android resizes the layout viewport**, so the shell compresses into what is left and every
// layout number already tells the truth; **iOS leaves the viewport alone and the keyboard overlays
// it**. The Map's search field survived that difference by accident — it sits at the TOP of the
// split, so an overlay at the bottom covers the results and not the field. The make/rename card is
// anchored to the split's BOTTOM, so on iOS it lays out with a full canvas of room and is drawn
// entirely underneath the keyboard: `room` healthy, nothing visible (ADR-0148 §4). That is the same
// shape as ADR-0132 §4's iOS attribution failure, and it is the harder of the two to notice
// because no measurement of ours is wrong.
//
// **The difference between the two models IS the number this returns**, which is why one hook
// covers both rather than a per-platform branch: `visualViewport.height` is what the user can see
// and `innerHeight` is what was laid out, so their gap is the overlap — and on a viewport that
// resized, the two moved together and the gap is zero. Nothing here asks which platform it is.
import { useEffect, useState } from 'react';

/** Below this, the gap is a URL bar collapsing or a rounding artefact rather than a keyboard.
 *  Named because a bare `> 0` made the value flicker between 0 and 1 on ordinary scrolls. */
export const KEYBOARD_INSET_FLOOR_PX = 80;

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // Absent in jsdom, and absent on old browsers — where 0 is the correct answer anyway,
    // because a platform we cannot ask is one we treat as having resized (the safe reading:
    // the card then clears only the sheet, which is what shipped).
    const vv = window.visualViewport;
    if (!vv) return;
    const read = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(gap > KEYBOARD_INSET_FLOOR_PX ? Math.round(gap) : 0);
    };
    read();
    vv.addEventListener('resize', read);
    // `scroll` too: iOS scrolls the visual viewport to keep a focused field visible, which
    // moves `offsetTop` without changing the height — and that shift is the other half of how
    // much of the layout viewport is currently unreachable.
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, []);

  return inset;
}
