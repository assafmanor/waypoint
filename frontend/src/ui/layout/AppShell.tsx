import type { Key, ReactNode } from 'react';
import { cx } from './shared';

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
  className?: string;
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
  className,
}: AppShellProps) {
  return (
    <div className={cx('app', className)} data-mode={mode} data-switching={switching}>
      {header}
      <main className="body" key={bodyKey}>
        {children}
      </main>
      {nav}
      {overlay}
    </div>
  );
}
