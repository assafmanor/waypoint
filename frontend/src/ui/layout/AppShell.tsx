import { useState, type Key, type ReactNode } from 'react';
import { useChromeOpenness } from '../../lib/chrome-condense';
import { cx } from './shared';

/** The body modifier a surface passes as `bodyClassName` to own its own layout
 *  instead of scrolling inside the body (ADR-0121 §5; styled in App.css). Named
 *  here rather than typed as a literal at each call site. */
export const BODY_FULLBLEED = 'is-fullbleed';

/** The `chrome` value a surface passes to take the header and the tab bar off screen
 *  — the layout layer's second surface-driven modifier (ADR-0132 §2; styled in
 *  App.css, which also moves the safe-area insets onto the body). Its one consumer
 *  is the Map tab's open query field: on a resizing layout viewport the split is the
 *  only flexible region, so the keyboard leaves 43px of canvas at 390×844 and a pane
 *  too short for Google's attribution at 360×640. Named here for the same reason
 *  `BODY_FULLBLEED` is: the shell is told what layout the surface wants, never what
 *  the surface is doing (which is the "search-mode flag" ADR-0101 refused). */
export const CHROME_RECLAIMED = 'reclaimed';

/** The `chrome` value a surface passes to open with **row 1 already lifted out** —
 *  the layout layer's third surface-driven modifier (ADR-0149 §7; styled in
 *  App.css). Chrome the body normally condenses by being scrolled, declared as a
 *  resting state instead.
 *
 *  Its one consumer is the rendered Map, and it is not a shortcut there: that
 *  body is `BODY_FULLBLEED`, so it **never scrolls**, which makes the scroll
 *  trigger structurally unavailable on the one surface whose scarce axis is
 *  height (ADR-0121 §5 / ADR-0126). Same rule as its two siblings — the shell is
 *  told what layout the surface wants, never what the surface is doing. */
export const CHROME_CONDENSED = 'condensed';

export type AppShellProps = {
  /** Top chrome region — the in-trip `<Header>` (a `<header className="header">`). */
  header?: ReactNode;
  /** Bottom chrome region — the tab bar (`<nav className="nav">`). */
  nav?: ReactNode;
  /** Overlays that must sit as a frame sibling (e.g. the account sheet), not
   *  inside the scrollable body — mirrors the pre-refactor `.app` structure. */
  overlay?: ReactNode;
  /** Scrollable body content. */
  children?: ReactNode;
  /** Keys the `<main>` so a tab change remounts it and re-runs the fade — the
   *  exact behaviour of the old `<main className="body" key={tab}>`. */
  bodyKey?: Key | null;
  /** Mode identity, applied as `data-mode` so the existing chrome CSS keys off it. */
  mode?: string;
  /** Mode-switch transition state, applied as `data-switching` (omitted when unset). */
  switching?: string;
  /** Chrome state a SURFACE declares, applied as `data-chrome` (omitted when unset).
   *  `CHROME_RECLAIMED` takes the header and nav off screen with the body paying the
   *  safe-area insets they were paying (ADR-0132 §2/§3); `CHROME_CONDENSED` opens
   *  with the header's identity row already lifted out (ADR-0149 §7). Both slots stay
   *  MOUNTED either way. Unset leaves the chrome to the body's own scroll, which
   *  condenses it below. */
  chrome?: string;
  /** Hold the chrome exactly as it is, neither condensing nor expanding. Its one
   *  caller is a drag in flight: the drag auto-scrolls the body at an edge band
   *  (ADR-0116), which would otherwise collapse the header mid-gesture and move
   *  every drop target 52px under the finger. Phrased as what the layout should
   *  DO, not as what the app is doing — same rule as the modifiers above. */
  holdChrome?: boolean;
  className?: string;
  /** Extra classes on `<main className="body">`. The one in use today is
   *  `is-fullbleed` (`overflow: hidden; padding: 0`), which lets a surface opt out
   *  of the scrolling body and own its own layout — the rendered map's split needs a
   *  fixed-height flex column to hang on, and the layout layer is where that belongs
   *  (ADR-0078, ADR-0121 §5). Any future full-bleed surface reuses it. */
  bodyClassName?: string;
};

// AppShell — the persistent frame (review §11 / U-10). It hosts three regions:
// the header slot, a scrollable `<main className="body">` it owns, and the nav
// slot; loading / error / content all render INSIDE this same chrome, so a
// body-only skeleton can swap without the header + nav ever unmounting (killing
// the trip-switch full-screen flash). Reproduces the prior `.app`/`.body`/nav
// structure and classes exactly — all shell styling still lives in App.css and
// keys off `.app[data-mode]` / `.app[data-switching]`.
export function AppShell({
  header,
  nav,
  overlay,
  children,
  bodyKey,
  mode,
  switching,
  chrome,
  holdChrome,
  className,
  bodyClassName,
}: AppShellProps) {
  // Scrolling the body gives the chrome away (ADR-0149 §7). It lives HERE, not in
  // the header, because the body is the thing being scrolled and this layer owns
  // it — the header would have to reach out of itself to find the element. A
  // surface's own declaration wins: `reclaimed` has no chrome left to condense,
  // and `condensed` is already the answer.
  const [bodyEl, setBodyEl] = useState<HTMLElement | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null);
  const { closed: rowClosed, expanded: rowExpanded } = useChromeOpenness(
    frameEl,
    bodyEl,
    holdChrome,
  );
  return (
    <div
      ref={setFrameEl}
      className={cx('app', className)}
      data-mode={mode}
      data-switching={switching}
      // `data-chrome` is the SURFACE'S DECLARATION and nothing else — it is what
      // carries the transition, because a declared change is the only one that
      // happens without a finger already moving the content.
      data-chrome={chrome}
      // The scroll path's endpoints ride their own attribute so they cannot borrow
      // that transition: `--chrome-open` already places the row continuously, and
      // these say only what `visibility` and the tab order need. Reusing
      // `data-chrome` here animated the way back up — the row lagged the finger by
      // a whole duration, reading 80px where the offset called for 91.
      data-chrome-row={
        chrome === undefined ? (rowExpanded ? 'open' : rowClosed ? 'closed' : undefined) : undefined
      }
    >
      {header}
      <main className={cx('body', bodyClassName)} key={bodyKey} ref={setBodyEl}>
        {children}
      </main>
      {nav}
      {overlay}
    </div>
  );
}
