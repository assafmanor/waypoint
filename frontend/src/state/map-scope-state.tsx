// The Map tab's **view state**, lifted just above the trip Shell so the surfaces
// that need to talk to the tab can, without any of it becoming a second source of
// truth. Two things live here, both deliberately unsynced and out of the URL:
//
//  1. **Map-local "all days" scope** (ADR-0110 §4). The app tracks exactly ONE
//     active date (the `?day=` param); "all days" is view state the Map owns. The
//     header `DayStrip` is the second consumer — it suppresses its filled selection
//     while all-days is on, and its tap leaves the scope through `useSelectDay`.
//  2. **A pending focus** (ADR-0121 §8). `מפה` on an `EventCard` or a
//     `BookingDetail` now routes to the Map tab focused on that place instead of
//     deep-linking to Google. The place id is handed over here and consumed once by
//     the Map, so a later visit to the tab doesn't re-focus a stale selection.
//  3. **Whether the query field is open** (ADR-0132 §1). The shell takes the header
//     and the tab bar off screen while it is, because on a resizing layout viewport
//     the split absorbs the entire keyboard — so this is the same shape as (1): one
//     fact the Map states about itself, with the shell as the second consumer. It is
//     the field being OPEN rather than a query being live, since the keyboard appears
//     on focus; `searching` stays the screen's own, for the list and the pins.
//  4. **A place errand** (ADR-0134 §1/§2). A form that needs a location sends one here
//     and lands on this tab; the tab assigns the chosen place and returns. It carries the
//     form's own DRAFT, because a form is a `Modal` with local state that no URL
//     addresses — leaving it for a tab would otherwise lose a half-typed event, which is
//     much worse than an extra tap. Both directions run on `useHandoff`, which is the
//     generalisation of (2)'s hand-over rather than a third copy of it (rule 8).
//  5. **Whether we have already offered to locate you** (ADR-0109 session-134). The
//     Map now asks on open rather than only on a chip tap, and "not now" has to mean
//     not-this-session — a card that reappears on every visit to the tab is the nag
//     the reason-first rule exists to avoid. Session-scoped, so a reload asks again;
//     it lives here rather than in the screen because the screen unmounts on every
//     tab change.
//
// None of it is a back layer: the sheet height and the scope chip are view state
// like each other, and back leaves the tab (ADR-0103's typed-layer model).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHandoff, type Handoff } from '../lib/handoff';
import { tabTarget } from './nav-state';
import { useTrip } from './trip-state';

/** Which place field of which entity an errand is for (ADR-0134 §2). **`field` is not
 *  optional**, and that is the point of the type: a transport booking has two place
 *  fields, so an errand that only named the booking could assign the right place to the
 *  wrong side of the journey. */
export interface PlaceErrandTarget {
  kind: 'event' | 'booking';
  /** Absent while the entity does not exist yet — a form being filled in for the first
   *  time is exactly the case the draft is for. */
  id?: string;
  field: 'placeId' | 'fromPlaceId' | 'toPlaceId';
}

export interface PlaceErrand {
  target: PlaceErrandTarget;
  /** Where to go back to, navigated with `{ replace: true }` so in-trip history stays
   *  flat (ADR-0090). */
  returnTo: string;
  /** What the banner says, in the reference's own words (ADR-0121 §8's vocabulary). The
   *  producer writes it: only the form knows whether this is `ארוחת ערב · רביעי` or
   *  `יציאה · רכבת לקיוטו`. */
  label: string;
  /** The form's own state, opaque here on purpose (ADR-0134 §2). This channel must not
   *  know the shape of an event form, or every form change would touch it. */
  draft?: unknown;
}

/** What comes back: the errand, plus the place that was chosen. The form host takes it
 *  and re-opens itself from the draft with the place assigned. */
export interface PlaceErrandResult {
  errand: PlaceErrand;
  placeId: string;
}

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
  /** Is the Map's query field open? (ADR-0132 §1 — the field being OPEN, not a query
   *  being live: the keyboard appears on focus, before a character exists.) The shell
   *  is the second consumer, exactly as `allDays` has the `DayStrip`. */
  queryOpen: boolean;
  setQueryOpen: (value: boolean) => void;
  /** A form asking the Map for one place (ADR-0134 §1). The Map reads `pending` to render
   *  its errand mode and `take()`s it when the choice is made or cancelled. */
  errand: Handoff<PlaceErrand>;
  /** …and the answer going back. The form's HOST reads this and re-opens the form. */
  errandResult: Handoff<PlaceErrandResult>;
}

const MapScopeContext = createContext<MapScope | null>(null);

export function MapScopeProvider({ children }: { children: ReactNode }) {
  const [allDays, setAllDays] = useState(false);
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null);
  const [locationOffered, setLocationOffered] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const errand = useHandoff<PlaceErrand>();
  const errandResult = useHandoff<PlaceErrandResult>();
  const value = useMemo<MapScope>(
    () => ({
      allDays,
      setAllDays,
      focusPlaceId,
      requestFocus: setFocusPlaceId,
      clearFocus: () => setFocusPlaceId(null),
      locationOffered,
      markLocationOffered: () => setLocationOffered(true),
      queryOpen,
      setQueryOpen,
      errand,
      errandResult,
    }),
    [allDays, focusPlaceId, locationOffered, queryOpen, errand, errandResult],
  );
  return <MapScopeContext.Provider value={value}>{children}</MapScopeContext.Provider>;
}

export function useMapScope(): MapScope {
  const ctx = useContext(MapScopeContext);
  if (!ctx) throw new Error('useMapScope must be used within a MapScopeProvider');
  return ctx;
}

/** "A day was chosen" — the header `DayStrip`'s tap, as an intent rather than a
 *  side effect of the date changing (ADR-0110 §4).
 *
 *  All-days is the alternative to picking a day, so picking one leaves it. The Map
 *  cannot infer that from `activeDate` alone: tapping the day you are already on
 *  writes the same date, the value never changes, and the scope stayed on — the
 *  strip's most obvious way out of `כל הימים` did nothing. So the choice is stated
 *  here, at the one place the strip's tap lands, rather than guessed at downstream.
 *
 *  Composed in this file for the same reason `useShowPlaceOnMap` is: it is one
 *  surface telling the Map tab something, and the Map's scope lives here. */
export function useSelectDay(): (date: string) => void {
  const { setAllDays } = useMapScope();
  const { setActiveDate } = useTrip();
  return useCallback(
    (date: string) => {
      setAllDays(false);
      setActiveDate(date);
    },
    [setAllDays, setActiveDate],
  );
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

/** **"Find me a place for this field"** — the errand, as one call (ADR-0134 §1). Composed
 *  here for the same reason `useShowPlaceOnMap` is: it is a surface telling the Map tab
 *  something, and the Map's scope lives here.
 *
 *  `returnTo` is captured at the START rather than passed in, because the caller is
 *  already standing on it — and capturing it here is what makes every caller's return
 *  identical instead of each one remembering to describe itself.
 *
 *  `null` outside the trip shell, where there is no Map tab to route to: the call site
 *  then drops the affordance, the same "absent, not broken" rule the map half itself
 *  follows (and the same reason `useShowPlaceOnMap` returns null there). */
export function useStartPlaceErrand(): ((errand: Omit<PlaceErrand, 'returnTo'>) => void) | null {
  const scope = useContext(MapScopeContext);
  const navigate = useNavigate();
  const hand = scope?.errand.hand;
  return useMemo(() => {
    if (!hand) return null;
    return (errand: Omit<PlaceErrand, 'returnTo'>) => {
      hand({ ...errand, returnTo: window.location.pathname + window.location.search });
      const day = new URLSearchParams(window.location.search).get('day');
      navigate(tabTarget('map') + (day ? `&day=${day}` : ''), { replace: true });
    };
  }, [hand, navigate]);
}

/** The other end: a form's HOST takes the answer and re-opens the form from the draft
 *  with the place assigned (ADR-0134 §2). Returns `null` when nothing is waiting, or
 *  when what is waiting is for a different kind of entity than this host owns — so two
 *  hosts can both watch the channel without either stealing the other's errand. */
export function useTakePlaceErrandResult(
  kind: PlaceErrandTarget['kind'],
): (() => PlaceErrandResult | null) | null {
  const scope = useContext(MapScopeContext);
  const result = scope?.errandResult;
  return useMemo(() => {
    if (!result) return null;
    return () => (result.pending?.errand.target.kind === kind ? result.take() : null);
  }, [result, kind]);
}
