// **What each place is CALLED on a glanceable surface** (ADR-0166 §18, field report #23):
// a nickname, else the city an airport serves. Keyed by place id, and read by the small title
// components that draw a route — `EventTitle`, `BookingTitle`, `TransitionRow`.
//
// **A channel of its own rather than a field of `useTrip()`, and the reason is the readers.**
// The derivation lives in `trip-state` (it is the only holder of both `places` and
// `enrichments`) and the screens read it from there like everything else. But the components
// that actually draw a route take all their data as props and are rendered **bare** in their
// own tests — twenty-two spec files replace `state/trip-state` wholesale with a `vi.mock`, and
// a leaf reaching into that module would break every one of them the day it starts needing a
// label. Here, an unprovided context answers with no labels, which is precisely the
// name-stripping behaviour those components had before this existed.
//
// So: one derivation, two ways in. `TripProvider` publishes it; a leaf subscribes.
import { createContext, useContext, type ReactNode } from 'react';
import type { PlaceLabels } from '../lib/place-label';

/** One frozen instance, so a leaf outside a provider doesn't get a fresh object every render
 *  and re-run every memo hanging off it. */
const NO_LABELS: PlaceLabels = Object.freeze({});

const PlaceLabelsContext = createContext<PlaceLabels>(NO_LABELS);

export function PlaceLabelsProvider({
  labels,
  children,
}: {
  labels: PlaceLabels;
  children: ReactNode;
}) {
  return <PlaceLabelsContext.Provider value={labels}>{children}</PlaceLabelsContext.Provider>;
}

/** The labels in force. **Absent, not broken** outside a trip — the same rule
 *  `useShowPlaceOnMap` follows for the Map tab: no labels means the caller falls through to
 *  `shortPlaceLabel`, which is what every one of these surfaces did before. */
export function usePlaceLabels(): PlaceLabels {
  return useContext(PlaceLabelsContext);
}
