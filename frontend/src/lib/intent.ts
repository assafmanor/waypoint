// sessionStorage (ADR-0024) — a stale intent shouldn't outlive the tab.
// Storage is a parameter, not read from `window` directly, so this is
// unit-testable without a DOM test environment (there isn't one in this repo).
import { AUTH_INTENT_STORAGE_KEY, JOIN_INTENT_STORAGE_KEY } from '../constants';

export function saveIntent(path: string, storage: Storage = sessionStorage): void {
  storage.setItem(AUTH_INTENT_STORAGE_KEY, path);
}

/** Reads and clears the saved intent — resuming it is a one-shot action. */
export function consumeIntent(storage: Storage = sessionStorage): string | null {
  const path = storage.getItem(AUTH_INTENT_STORAGE_KEY);
  if (path !== null) storage.removeItem(AUTH_INTENT_STORAGE_KEY);
  return path;
}

/** Marks that this login was triggered from a join preview, so the join
 *  auto-completes on resume (T-042). Separate from the generic deep-link
 *  intent, which AuthGate consumes before the join screen re-mounts. */
export function saveJoinIntent(token: string, storage: Storage = sessionStorage): void {
  storage.setItem(JOIN_INTENT_STORAGE_KEY, token);
}

/** Reads and clears the pending-join token — one-shot, like consumeIntent. */
export function consumeJoinIntent(storage: Storage = sessionStorage): string | null {
  const token = storage.getItem(JOIN_INTENT_STORAGE_KEY);
  if (token !== null) storage.removeItem(JOIN_INTENT_STORAGE_KEY);
  return token;
}
