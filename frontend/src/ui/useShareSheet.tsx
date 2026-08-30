import { useCallback, useState, type ReactNode } from 'react';
import { ShareItinerarySheet } from './ShareItinerarySheet';

/**
 * **One share sheet, opened from two places** (ADR-0213).
 *
 * The trip header and every All Trips card are the feature's two visible entries, and they
 * live in different subtrees of the app shell. This is the shared owner: the state and the
 * rendering exist once, and each entry point mounts the same thing rather than growing its
 * own copy of "which trip, is it open, close it" — the parallel-copies failure ADR-0096 and
 * rule 8 are about.
 *
 * Deliberately a hook returning a node rather than a context provider: nothing above either
 * entry needs to know a share is open, and a provider would put trip-sharing state in the
 * root of an app whose root has no business holding it.
 */
export function useShareSheet(): {
  open: (trip: { id: string; name: string }) => void;
  sheet: ReactNode;
} {
  const [sharing, setSharing] = useState<{ id: string; name: string } | undefined>();
  const open = useCallback((trip: { id: string; name: string }) => setSharing(trip), []);
  return {
    open,
    sheet: sharing ? (
      <ShareItinerarySheet
        tripId={sharing.id}
        tripName={sharing.name}
        onClose={() => setSharing(undefined)}
      />
    ) : null,
  };
}
