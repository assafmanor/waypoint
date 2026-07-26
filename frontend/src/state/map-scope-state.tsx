// The Map tab's **view state**, lifted just above the trip Shell so the surfaces
// that need to talk to the tab can, without any of it becoming a second source of
// truth. Two things live here, both deliberately unsynced and out of the URL:
//
//  1. **Map-local "all days" scope** (ADR-0110 §4). The app tracks exactly ONE
//     active date (the `?day=` param); "all days" is view state the Map owns. The
//     header `DayStrip` is the second consumer — it suppresses its filled selection
//     while all-days is on.
//  2. **A pending focus** (ADR-0121 §8). `מפה` on an `EventCard` or a
//     `BookingDetail` now routes to the Map tab focused on that place instead of
//     deep-linking to Google. The place id is handed over here and consumed once by
//     the Map, so a later visit to the tab doesn't re-focus a stale selection.
//  3. **Whether we have already offered to locate you** (ADR-0109 session-134). The
//     Map now asks on open rather than only on a chip tap, and "not now" has to mean
//     not-this-session — a card that reappears on every visit to the tab is the nag
//     the reason-first rule exists to avoid. Session-scoped, so a reload asks again;
//     it lives here rather than in the screen because the screen unmounts on every
//     tab change.
//
// None of it is a back layer: the sheet height and the scope chip are view state
// like each other, and back leaves the tab (ADR-0103's typed-layer model).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { tabTarget } from './nav-state';

interface MapScope {
  allDays: boolean;
  setAllDays: (value: boolean) => void;
  /** A place the Map should select + focus the moment it renders, or `null`. */
  focusPlaceId: string | null;
  /** Ask the Map to focus this place on its next render (see `useShowPlaceOnMap`,
   *  which is what a call site actually wants — it navigates too). */
  requestFocus: (placeId: string) => void;
  /** Consumed by the Map once applied, so it fires exactly once. */
  clearFocus: () => void;
  /** Have we already offered to locate the user this session? */
  locationOffered: boolean;
  markLocationOffered: () => void;
}

const MapScopeContext = createContext<MapScope | null>(null);

export function MapScopeProvider({ children }: { children: ReactNode }) {
  const [allDays, setAllDays] = useState(false);
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null);
  const [locationOffered, setLocationOffered] = useState(false);
  const value = useMemo<MapScope>(
    () => ({
      allDays,
      setAllDays,
      focusPlaceId,
      requestFocus: setFocusPlaceId,
      clearFocus: () => setFocusPlaceId(null),
      locationOffered,
      markLocationOffered: () => setLocationOffered(true),
    }),
    [allDays, focusPlaceId, locationOffered],
  );
  return <MapScopeContext.Provider value={value}>{children}</MapScopeContext.Provider>;
}

export function useMapScope(): MapScope {
  const ctx = useContext(MapScopeContext);
  if (!ctx) throw new Error('useMapScope must be used within a MapScopeProvider');
  return ctx;
}

/** "Show this place on the map" — the in-app destination that replaced the Google
 *  place view (ADR-0121 §8). It hands the Map a focus and lands on the tab in one
 *  explicit `replace` navigation, through the shared `tabTarget` rather than a
 *  hand-built URL (ADR-0090: back is computed from state, so in-trip history stays
 *  flat). The current `?day=` rides along, which is why arriving from a Day view
 *  already lands on the right day; the Map widens to all-days by itself when the
 *  focused place is not in the day it lands on.
 *
 *  `null` outside the trip shell, where there is no Map tab to route to — the call
 *  site then drops the affordance, the same "absent, not broken" rule the map half
 *  itself follows. A leaf like `BookingDetail` must not THROW for want of a
 *  tab-navigation context it doesn't own. */
export function useShowPlaceOnMap(): ((placeId: string) => void) | null {
  const scope = useContext(MapScopeContext);
  const navigate = useNavigate();
  const requestFocus = scope?.requestFocus;
  return useMemo(() => {
    if (!requestFocus) return null;
    return (placeId: string) => {
      requestFocus(placeId);
      const day = new URLSearchParams(window.location.search).get('day');
      navigate(tabTarget('map') + (day ? `&day=${day}` : ''), { replace: true });
    };
  }, [requestFocus, navigate]);
}
