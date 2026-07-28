import type { Key, ReactNode } from 'react';
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
  /** Chrome state, applied as `data-chrome` (omitted when unset). `CHROME_RECLAIMED`
   *  is the only value: the header and nav go off screen and the body pays the
   *  safe-area insets they were paying (ADR-0132 §2/§3). Both slots stay MOUNTED. */
  chrome?: string;
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
  className,
  bodyClassName,
}: AppShellProps) {
  return (
    <div
      className={cx('app', className)}
      data-mode={mode}
      data-switching={switching}
      data-chrome={chrome}
    >
      {header}
      <main className={cx('body', bodyClassName)} key={bodyKey}>
        {children}
      </main>
      {nav}
      {overlay}
    </div>
  );
}
