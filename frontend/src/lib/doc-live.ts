// Live remote document changes (ADR-0057). Documents are section-owned and not in
// the trip snapshot (ADR-0049), so they don't flow through trip-state's reactive
// lists. This thin per-trip emitter lets the WS handler (trip-state) fan a remote
// `document` Change to the mounted DocumentsSection, so a peer's upload / rename /
// delete appears live. Mirrors the outbox's module-listener pattern.
import { useEffect } from 'react';
import type { Change } from '@waypoint/shared';

type Listener = (change: Change) => void;
const listeners = new Map<string, Set<Listener>>();

/** Fan a remote document change to every subscriber of its trip. */
export function emitDocChange(tripId: string, change: Change): void {
  listeners.get(tripId)?.forEach((l) => l(change));
}

export function subscribeDocChanges(tripId: string, listener: Listener): () => void {
  let set = listeners.get(tripId);
  if (!set) {
    set = new Set();
    listeners.set(tripId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(tripId);
  };
}

/** Subscribe the mounted DocumentsSection to its trip's remote document changes.
 *  Pass a stable `handler` (useCallback) so the subscription isn't torn down and
 *  rebuilt on every render. */
export function useDocChanges(tripId: string, handler: Listener): void {
  useEffect(() => subscribeDocChanges(tripId, handler), [tripId, handler]);
}
