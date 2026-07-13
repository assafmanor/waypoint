// Deep-link intent preservation across the login gate (ADR-0024): a route hit
// while unauthenticated (esp. /join/:token) is saved and resumed after sign-in.
// sessionStorage, not localStorage — a stale intent shouldn't outlive the tab.
// Storage is a parameter (not read from `window` directly) so this stays a
// plain unit-testable function without pulling a DOM test environment into
// the repo (there isn't one — see the other lib/*.test.ts files).
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
