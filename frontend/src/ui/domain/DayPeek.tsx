// **The days you are swiping toward, drawn while you swipe** (ADR-0200 §7).
//
// A measured window over the body's visible strip, holding one pane per neighbour, each a REAL
// day surface for that date (`state/day-preview.tsx` supplies the date and the inert flag).
// The panes sit exactly one page away on the inline axis and ride the gesture's own offset, so
// the whole strip moves as one thing — which is the entire content of "continuous".
//
// **Why the real surface and not a summary.** What the page turn lands on has to BE the
// committed day, or the seam needs a cross-fade to hide the difference and a second row
// grammar that drifts the first time either changes. `frontend/CLAUDE.md` records a third copy
// of the day's rows as the mistake ADR-0159 §1 exists to prevent, so the peek renders the same
// component the host does and inherits every future change to it for free.
//
// **`position: fixed`, and it is the `SnapSheet` exception rather than a new overlay.**
// `frontend/CLAUDE.md` refuses hand-rolled floating layers because they break the one-back-
// action invariant, and the test it gives is whether the thing can be *dismissed*: a pane
// **of** a screen registers nothing, and this one cannot be dismissed, cannot be reached, and
// does not outlive the finger. `.wp-dragghost` is the existing precedent for a gesture-time
// fixed layer here. No `createPortal`, so the lint guard is not being routed around.
//
// Fixed rather than in flow because **the day it sits beside is a scroller at an arbitrary
// offset**: in flow the panes would be pinned to the top of a surface that may be 3000px tall
// and 800px scrolled, i.e. off screen exactly when they are needed.
//
// **Both neighbours mount, not just the one being pulled toward.** A finger can reverse
// mid-gesture and re-deciding which side exists would flicker; and at the trip's ends the
// absent one is doing real work — nothing arrives, which is the same thing ADR-0182 said about
// the Map track's missing peek, and the reason the rebuff needs no label.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { scrollerFor } from '../../lib/scrollable';
import { DayPreview } from '../../state/day-preview';

export interface DayPeeksProps {
  /** The previous day, or `null` at the start of the trip — where `null` is the affordance. */
  prev: string | null;
  /** The next day, or `null` at the end of it. */
  next: string | null;
  /** The day surface to render for each. The caller passes **its own screen**, so a peek is
   *  the same component as its host in the same mode, and one element descriptor serves both
   *  panes. */
  children: ReactNode;
}

export function DayPeeks({ prev, next, children }: DayPeeksProps) {
  const win = useRef<HTMLDivElement>(null);

  // **Measured, never assumed** — `frontend/CLAUDE.md` lists "a landing position written as a
  // constant" as a scar three times over. The window's inline box is the HOST's (the day
  // surface's own content column, already the page width at every breakpoint, so `.app`'s
  // max-widths are not copied here) and its block box is the SCROLLER's visible strip. Both
  // halves earn their keep: bounding it to the scroller is what stops a fixed pane painting
  // over the header and the tab bar, and bounding it to the column plus `overflow: clip` is
  // what stops a pane mid-flight sliding across the page background on a desktop viewport,
  // where `.app` is a centred column rather than the whole screen.
  //
  // `paddingTop` is read rather than hard-coded for the same reason the width is: `.body`'s
  // padding lives in `App.css` and is not this component's to know.
  //
  // `useLayoutEffect`, so the geometry is in place before the first paint of a window that
  // mounted mid-gesture. jsdom reports every rect as zero, which leaves it 0×0 — the honest
  // answer for a surface with no layout, and why the real geometry is asserted in
  // `e2e/day-swipe.spec.ts` rather than in a unit test.
  useLayoutEffect(() => {
    const el = win.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const scroller = scrollerFor(host, 'block');
    if (!scroller) return;
    const box = scroller.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    const inline = host.getBoundingClientRect();
    el.style.setProperty('--peek-top', `${Math.round(box.top + pad)}px`);
    el.style.setProperty('--peek-h', `${Math.round(scroller.clientHeight - pad)}px`);
    el.style.setProperty('--peek-x', `${Math.round(inline.left)}px`);
  });

  // `data-preview` on each pane's own host (set by the screens) is what keeps a selector
  // honest: a peek holds a whole day surface, so `.day-swipe`, `.day-page` and every row class
  // exists three times over while a gesture is live. Anything asking about the day you are ON
  // wants `.day-swipe:not([data-preview])` — a bare `.day-page` is whichever pane the DOM
  // happens to list first, which is how the double-shift below was nearly measured as correct.
  return (
    <div className="day-peeks" ref={win} aria-hidden="true">
      {/* `inert` takes each subtree out of hit-testing, focus and the a11y tree in one
          attribute — which matters more than it looks: a pane holds a whole day of buttons, and
          a screen reader announcing tomorrow's events over today's is the same defect as a tap
          landing on one. */}
      {prev && (
        <div className="day-peek" data-day="prev" inert>
          <DayPreview date={prev}>{children}</DayPreview>
        </div>
      )}
      {next && (
        <div className="day-peek" data-day="next" inert>
          <DayPreview date={next}>{children}</DayPreview>
        </div>
      )}
    </div>
  );
}
