// sessionStorage (ADR-0024) — a stale intent shouldn't outlive the tab.
// Storage is a parameter, not read from `window` directly, so this is
// unit-testable without a DOM test environment (there isn't one in this repo).
import { AUTH_INTENT_STORAGE_KEY } from '../constants';

export function saveIntent(path: string, storage: Storage = sessionStorage): void {
  storage.setItem(AUTH_INTENT_STORAGE_KEY, path);
}

/** Reads and clears the saved intent — resuming it is a one-shot action. */
export function consumeIntent(storage: Storage = sessionStorage): string | null {
  const path = storage.getItem(AUTH_INTENT_STORAGE_KEY);
  if (path !== null) storage.removeItem(AUTH_INTENT_STORAGE_KEY);
  return path;
}

/** Non-destructive read, for render-time checks that must stay pure
 *  (consuming happens later, in the effect that actually navigates). */
export function hasIntent(storage: Storage = sessionStorage): boolean {
  return storage.getItem(AUTH_INTENT_STORAGE_KEY) !== null;
}

/* The pending-JOIN intent (T-042) lived here: a token saved before leaving for Google so
 * the join could auto-complete on resume. It is gone, with its storage key, because
 * ADR-0143 §8 removed the auto-join — the return now lands on the invitation and the tap
 * that joins happens while you are looking at it. Deleted rather than left unused, so
 * nothing reaches for a helper whose behaviour was deliberately retired. */
