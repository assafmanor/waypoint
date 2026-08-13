// **One reload, then stop** — the loop guard, extracted so a second caller can have it.
//
// It was `lazy-chunk.ts`'s private cooldown (ADR-0185): a stale chunk is cured by a fresh
// document and cannot be cured by a second one, so retrying past the first is a spin.
// The map's dead canvas is the same shape of problem and needs the same guarantee, so this
// is that mechanism extracted rather than copied beside it (root rule 8).
//
// `sessionStorage` is per-tab and dies with it, which is the right lifetime: "have I
// already tried this in this session". And if storage refuses (Safari private mode) we
// cannot tell a first attempt from a tenth, so we **do not reload at all** — an unguarded
// reload loop is far worse than a surface that stays broken and says so.
import { getNow } from './useClock';

/** Per-caller, so one mechanism's reload never counts against another's budget. */
export const RELOAD_GUARD_KEY = {
  /** A route chunk that 404'd after a deploy (ADR-0185). */
  chunk: 'waypoint:chunk-reload',
  /** A map canvas no rebuild can revive (ADR-0121's 2026-08-14 amendment). */
  map: 'waypoint:map-reload',
} as const;
export type ReloadGuardKey = (typeof RELOAD_GUARD_KEY)[keyof typeof RELOAD_GUARD_KEY];

/** **Is the user mid-sentence?** Half of "would a reload throw away something they typed
 *  or opened" — the other half is an open overlay, which only a component can ask
 *  (`useHasOverlay`). Moved here from `useAppUpdate.ts` when the map became a second
 *  caller: the map is not entitled to a laxer rule about destroying an open form than the
 *  build swap has.
 *
 *  The page being hidden is NOT an exemption — an app switched away from mid-form is the
 *  most likely way to be mid-form. */
export function isEditingField(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

export function reloadedRecently(key: ReloadGuardKey, withinMs: number): boolean {
  try {
    const stamp = Number(window.sessionStorage.getItem(key));
    if (!stamp) return false;
    return getNow() - stamp < withinMs;
  } catch {
    // No storage means no loop detection, so treat every attempt as a repeat.
    return true;
  }
}

export function stampReload(key: ReloadGuardKey): void {
  try {
    window.sessionStorage.setItem(key, String(getNow()));
  } catch {
    /* handled by reloadedRecently refusing to reload without storage */
  }
}

/** Reload the document once per cooldown. Returns whether it actually did, so a caller
 *  can fall back to saying something rather than silently doing nothing. */
export function reloadOnce(key: ReloadGuardKey, withinMs: number): boolean {
  if (reloadedRecently(key, withinMs)) return false;
  stampReload(key);
  window.location.reload();
  return true;
}
