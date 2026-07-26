// The app's one filter/search reveal derivation (ADR-0120, generalizing
// ADR-0098 §4 off the Index bookings screen): a row that stops matching is not
// dropped from the list, it is marked hidden and collapses in place; a row that
// starts matching carries a small per-row transition delay, so a chip tap or a
// keystroke reveals matches with a gentle stagger instead of an all-at-once
// flip.
//
// Domain-agnostic on purpose — the predicate stays with the caller, so every
// filterable/searchable surface (Index bookings, the Map's places, whatever
// filters next) reuses this one derivation and its `ui/primitives/RevealList`
// renderer rather than growing a second stagger of its own.
import { FILTER_STAGGER_MAX_MS, FILTER_STAGGER_MS } from '../constants';

export interface Revealed<T> {
  item: T;
  visible: boolean;
  /** Reveal transition-delay (ms) for a visible row — 0 for a hidden one. */
  delayMs: number;
}

/** The stagger delay for the n-th **visible** row, capped so a long list's last
 *  row doesn't wait out the whole reveal. */
export function revealDelayMs(visibleIndex: number): number {
  return Math.min(visibleIndex * FILTER_STAGGER_MS, FILTER_STAGGER_MAX_MS);
}

/** Mark each item visible/hidden against `matches`, staggering the visible ones.
 *  `startIndex` lets a caller chain two lists (e.g. upcoming → past) into one
 *  continuous stagger; the returned `nextIndex` is that chained call's
 *  `startIndex`. */
export function revealRows<T>(
  items: T[],
  matches: (item: T) => boolean,
  startIndex = 0,
): { rows: Revealed<T>[]; nextIndex: number } {
  let i = startIndex;
  const rows = items.map((item) => {
    const visible = matches(item);
    const delayMs = visible ? revealDelayMs(i) : 0;
    if (visible) i++;
    return { item, visible, delayMs };
  });
  return { rows, nextIndex: i };
}

/** How many rows the list will actually show — what an empty state keys off,
 *  since a filtered-out row stays mounted. */
export function countVisible<T>(rows: Revealed<T>[]): number {
  return rows.reduce((n, r) => n + (r.visible ? 1 : 0), 0);
}

/** The visible rows only — for the derivations that describe what's on screen
 *  (group headers, "is this the first row of its block"), which a hidden row
 *  must never take part in. */
export function visibleItems<T>(rows: Revealed<T>[]): T[] {
  return rows.filter((r) => r.visible).map((r) => r.item);
}
