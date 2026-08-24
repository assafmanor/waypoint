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
//  6. **The shelf's tail** (ADR-0116 session-202 §5). The pool strip is capped, and
//     everything past the cap comes through to this tab's `אולי` facet — the same
//     union by ADR-0119. Another `useHandoff`, for (4)'s reason: it is an intent in
//     flight, so it is consumed once and a later visit is not still filtered by it.
//
// None of it is a back layer: the sheet height and the scope chip are view state
// like each other, and back leaves the tab (ADR-0103's typed-layer model).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlaceSearchKind } from '@waypoint/shared';
import { useHandoff, type Handoff } from '../lib/handoff';
import { dayCarriedFrom, tabOfParams, tabTarget } from './nav-state';
import type { TabId } from '../constants';
import { useTrip } from './trip-state';

export type PlaceErrandField =
  | 'placeId'
  | 'fromPlaceId'
  | 'toPlaceId'
  | 'stopPlaceIds'
  /** The way home's own stops (ADR-0203 §6). A field of its own rather than an extra flag on
   *  `stopPlaceIds`, for the same reason the draft keeps a second list: the two can be
   *  different lengths, so an index into one is not an index into the other. */
  | 'returnStopPlaceIds';

/** Which place field of which entity an errand is for (ADR-0134 §2). **`field` is not
 *  optional**, and that is the point of the type: a transport booking has two place
 *  fields, so an errand that only named the booking could assign the right place to the
 *  wrong side of the journey. */
export interface PlaceErrandFormTarget {
  kind: 'event' | 'booking';
  /** Absent while the entity does not exist yet — a form being filled in for the first
   *  time is exactly the case the draft is for. */
  id?: string;
  field: PlaceErrandField;
  /** **Which one, when the field is a list** (ADR-0159): a journey's stops are a
   *  `stopPlaceIds` array, so naming the field is no longer enough to say where the
   *  answer goes. Absent for every scalar field, which is all of them but one.
   *
   *  The channel still knows nothing about the shape of a form — it knows a field is
   *  either a value or a list, which is a property of the ERRAND and not of the draft. */
  index?: number;
}

/** The fourth target, and the one that never travels (ADR-0134 §9): a **place row** on the
 *  Map that has no location yet, being given one. It carries no `field` — there is no form
 *  and nothing to assign, the row IS the thing being answered — and its `id` is required,
 *  because unlike a form it always already exists.
 *
 *  It is a `PlaceErrandTarget` rather than a mechanism of its own so that the tab's errand
 *  MODE is one thing: the banner, the `בחירה` verb replacing `＋ אולי`, the withdrawn
 *  `נווט`, the dot tier, the back layer and the field opening on arrival are all written
 *  once and read `pendingErrand`. What differs is only who can answer it (§9's note below)
 *  and that it never leaves the tab. */
export interface PlaceErrandRowTarget {
  kind: 'place';
  id: string;
}

export type PlaceErrandTarget = PlaceErrandFormTarget | PlaceErrandRowTarget;

export interface PlaceErrand {
  target: PlaceErrandTarget;
  /** Where to go back to, navigated with `{ replace: true }` so in-trip history stays
   *  flat (ADR-0090). **Absent means the errand never left**, which is the Map's own
   *  `＋ מיקום` (§9): it starts on the destination, so it has nowhere to return to and
   *  neither exit navigates. One field answers "does this go anywhere", so no exit needs
   *  to ask what kind of errand it is holding. */
  returnTo?: string;
  /** What the banner says, in the reference's own words (ADR-0121 §8's vocabulary). The
   *  producer writes it: only the form knows whether this is `ארוחת ערב · רביעי` or
   *  `יציאה · רכבת לקיוטו`. */
  label: string;
  /** The form's own state, opaque here on purpose (ADR-0134 §2). This channel must not
   *  know the shape of an event form, or every form change would touch it. */
  draft?: unknown;
  /** **What kind of place would answer this errand** (field report #6), when the form knows.
   *  A flight's leg wants an airport, so the tab's search asks Google for airports and stops
   *  offering the terminal, the car park and the hotel next door.
   *
   *  On the ERRAND rather than in the draft, because it is the tab that has to act on it and
   *  the draft is deliberately opaque here (ADR-0134 §2). Absent = the whole corpus, which is
   *  every other errand. */
  kind?: PlaceSearchKind;
}

/** Put the chosen place where the errand said it goes — the one write, in one place,
 *  rather than at each form host (ADR-0134 §2). A field with an `index` is a LIST, so
 *  the element is replaced and the rest of the draft is untouched; anything else is a
 *  plain assignment, which is every field but a journey's stops. */
function assignErrandPlace<D>(draft: D, target: PlaceErrandFormTarget, placeId: string): D {
  if (target.index == null) return { ...draft, [target.field]: placeId };
  const current = (draft as Record<string, unknown>)[target.field];
  const list = Array.isArray(current) ? [...(current as unknown[])] : [];
  list[target.index] = placeId;
  return { ...draft, [target.field]: list };
}

/** What comes back: the errand, plus the place that was chosen. The form host takes it
 *  and re-opens itself from the draft with the place assigned.
 *
 *  **`placeId` is `null` on a cancel**, and that is not a degenerate case — it is the other
 *  half of §2 (owner, session 168: _"canceling a place pin doesn't return to the event
 *  form"_). A form that went to the map with a half-typed event has to come back whichever
 *  way the errand ends; `ביטול` losing what you typed is the same loss the draft exists to
 *  prevent, just through the other exit. So the form re-opens either way, with the place
 *  assigned or with nothing touched. */
export interface PlaceErrandResult {
  errand: PlaceErrand;
  placeId: string | null;
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
  /** **A surface on the Map tab wants the app chrome off** (ADR-0132 §2/§3): the header
   *  and the tab bar come off screen and the safe-area insets move to the body. The shell
   *  is the second consumer, exactly as `allDays` has the `DayStrip`.
   *
   *  **Named for the WANT, not the cause**, which is what ADR-0132 §2 actually asked for —
   *  _"the shell is told the surface wants the chrome back, not what the surface is
   *  doing"_ — and what its first name (`queryOpen`) contradicted. Two surfaces need it now
   *  and both pop a keyboard on a viewport the platform may resize: the query field
   *  (ADR-0132 §1 — the field being OPEN, not a query being live) and the make/rename form
   *  (ADR-0148). A third would be a third writer to this one boolean, not a second `||` in
   *  `App.tsx`.
   *
   *  **One writer, deliberately.** The Map screen derives it from both of its own states and
   *  pushes the result, so two surfaces can never race to set it false while the other is
   *  still open. */
  chromeReclaimed: boolean;
  setChromeReclaimed: (value: boolean) => void;
  /** **The shelf's tail, arriving** (ADR-0116 session-202 §5). The capped pool strip
   *  hands the rest of the ideas here and lands on the tab; the Map `take()`s it and
   *  turns on the `אולי` facet, which ADR-0119 already made the same union. A handoff
   *  rather than a fourth bespoke flag, for the reason `lib/handoff.ts` exists: it is
   *  an intent in flight, consumed once, so a later visit to the tab does not re-apply
   *  a filter nobody asked for this time. */
  maybesFacet: Handoff<true>;
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
  const [chromeReclaimed, setChromeReclaimed] = useState(false);
  const maybesFacet = useHandoff<true>();
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
      chromeReclaimed,
      setChromeReclaimed,
      maybesFacet,
      errand,
      errandResult,
    }),
    [allDays, focusPlaceId, locationOffered, chromeReclaimed, maybesFacet, errand, errandResult],
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

/** **The navigation half of every way in to the Map**, as one function. The three
 *  way-ins below each hand the Map some scope of their own and then land on the tab,
 *  and that landing was written out three times — `tabTarget('map')` with `&day=`
 *  appended by hand. Which is precisely how the tab bar's own move came to lose the
 *  day (field report #39): the rule lived in the copies rather than in `tabTarget`,
 *  so the one caller that did not copy it silently resolved the day back to today.
 *  One function now, over the day-aware `tabTarget` (rule 8).
 *
 *  One explicit `replace` (ADR-0090: back is computed from state, so in-trip history
 *  stays flat), and the day is read at CALL time off the live URL — the callback
 *  stays identity-stable for its memoized consumers while still navigating from the
 *  day you are actually on. */
function useGoToMapTab(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const day = dayCarriedFrom(new URLSearchParams(window.location.search));
    navigate(tabTarget('map', day), { replace: true });
  }, [navigate]);
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
  const goToMapTab = useGoToMapTab();
  const requestFocus = scope?.requestFocus;
  return useMemo(() => {
    if (!requestFocus) return null;
    return (placeId: string) => {
      requestFocus(placeId);
      goToMapTab();
    };
  }, [requestFocus, goToMapTab]);
}

/** **"The rest of my ideas are over there"** — the shelf's tail, as one call
 *  (ADR-0116 session-202 §5). The pool strip keeps the day's working set and hands
 *  everything past the cap to the Map's `אולי` facet, which is the same union by
 *  ADR-0119 and already carries day scope, type chips, search, distance sort and
 *  `＋ שיבוץ ליום`. This is what makes the strip's width independent of N.
 *
 *  The `?day=` rides along exactly as `useShowPlaceOnMap`'s does, so the tail arrives
 *  scoped to the day you were building — landing on all-days would answer a wider
 *  question than the one that was asked.
 *
 *  `null` outside the trip shell, where there is no Map tab to route to: the strip
 *  then renders no way-through rather than a broken one, the same "absent, not
 *  broken" rule the rest of this file follows.
 *
 *  **Still owed: a device pass** (ADR-0017). Whether this reads as "the rest are over
 *  there" or as being thrown off the surface you were building is a phone judgement,
 *  and ADR-0135's round trip (you slot from the map and never come back) is what the
 *  bet rests on. */
export function useShowMaybesOnMap(): (() => void) | null {
  const scope = useContext(MapScopeContext);
  const goToMapTab = useGoToMapTab();
  const hand = scope?.maybesFacet.hand;
  return useMemo(() => {
    if (!hand) return null;
    return () => {
      hand(true);
      goToMapTab();
    };
  }, [hand, goToMapTab]);
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
  const goToMapTab = useGoToMapTab();
  const hand = scope?.errand.hand;
  return useMemo(() => {
    if (!hand) return null;
    return (errand: Omit<PlaceErrand, 'returnTo'>) => {
      hand({ ...errand, returnTo: window.location.pathname + window.location.search });
      goToMapTab();
    };
  }, [hand, goToMapTab]);
}

/** Which tab a path addresses — the query-string form of it is `tabOfParams`, shared
 *  with the nav layer that answers the same question about the URL you are on. */
const tabOfPath = (path: string): TabId =>
  tabOfParams(new URLSearchParams(path.split('?')[1] ?? ''));

/** The other end: a form's HOST takes the answer and re-opens the form from the draft
 *  with the place assigned (ADR-0134 §2). Returns `null` when nothing is waiting, or when
 *  what is waiting is not for this host — so several hosts can watch one channel without
 *  stealing each other's errand.
 *
 *  **Two filters, and the second one is the fix for the bug that survived four attempts**
 *  (owner, session 174; found by driving the round trip in a real browser, after four
 *  jsdom-tested fixes each shipped and none of them worked):
 *
 *   • the entity KIND, so the event form and the booking sheet never cross; and
 *   • **`hostTab` — the tab this host lives on**, matched against the tab the errand is
 *     RETURNING to. The Map hosts a booking sheet itself (a row's way-in opens one), and it
 *     is still mounted when it hands the answer over: `hand()` and `navigate()` land in one
 *     React batch, so the Map's own host effect re-runs, takes the result meant for the
 *     Index, applies it to state nobody will see, and is then unmounted by the navigation.
 *     From outside that looked exactly like the channel never delivering — the destination
 *     mounted, and no form opened.
 *
 *  `hostTab` is passed in rather than read from the URL, and that is the whole point: at the
 *  instant the thief's effect runs, `window.location` is ALREADY the destination, so any
 *  filter derived from it matches the thief too. The host's own tab is a static fact about
 *  the component, so it cannot race the navigation that is stealing from it.
 *
 *  Comparing the TAB rather than the whole path is deliberate: the return path may carry
 *  params the destination strips on arrival (the Index clears `?focus=` once it has acted),
 *  so an exact match would fail for the very screen the fix is for. */
export function useTakePlaceErrandResult(
  kind: PlaceErrandFormTarget['kind'],
  hostTab: TabId,
): (() => PlaceErrandResult | null) | null {
  const scope = useContext(MapScopeContext);
  const result = scope?.errandResult;
  return useMemo(() => {
    if (!result) return null;
    return () => {
      const pending = result.pending;
      if (pending?.errand.target.kind !== kind) return null;
      // No `returnTo` means the errand never left the Map (§9), so no host is waiting for
      // it — the same "not for this host" answer as a tab mismatch, one branch earlier.
      if (!pending.errand.returnTo) return null;
      if (tabOfPath(pending.errand.returnTo) !== hostTab) return null;
      return result.take();
    };
  }, [result, kind, hostTab]);
}

/** What a host gets back: the form's own draft (typed here, opaque in the channel — the
 *  host is the only end that knows the shape, which is the whole reason the channel does
 *  not), plus the place that was chosen and the field it belongs in. */
export interface ReturnedPlaceErrand<D> {
  /** The form's own state, **with the chosen place already in the named field** — or exactly
   *  as it left on a cancel. The merge lives here rather than at each host because all five
   *  wrote the same expression, and one of them writing it slightly differently is how a
   *  transport booking gets the right place on the wrong side of the journey. */
  draft: D | null;
  /** The place that was chosen, or `null` if the errand was cancelled. Already applied to
   *  `draft`; exposed because a host may want to know which way it ended. */
  placeId: string | null;
  target: PlaceErrandFormTarget;
}

/** **A form host, on the way back** (ADR-0134 §2). Calls `apply` **exactly once**, with
 *  the returning result for this entity kind, so the host can re-open its form from the
 *  draft with the chosen place already in the named field.
 *
 *  One hook rather than a copy per host: `DayView` and `PlanDay` both host the event form,
 *  `IndexBookingsView` and two others host the booking sheet, and five copies of
 *  "take it and re-open" is exactly the parallel copy rule 8 exists to prevent.
 *
 *  **A CALLBACK, NOT A RETURN VALUE, AND THAT IS THE WHOLE FIX** (owner, session 166 —
 *  _"the form got duplicated over and over so saving the event had the form below, and the
 *  event was duplicated many times"_). It shipped reporting the payload as STATE, which
 *  every host then applied from an effect that also depended on `events`/`bookings` — it
 *  has to, since it looks the entity up by id. So the payload stayed readable for the rest
 *  of the host's life while its own dependency changed on every write: re-open the form,
 *  save, the entity list changes, the effect fires again on the SAME payload, the form
 *  re-opens on top of itself, and each save writes another copy.
 *
 *  A once-only channel is not enough on its own to make a once-only EFFECT — `take()`
 *  cleared the handoff correctly and the bug was downstream of it. So the "once" lives
 *  here, where there is one copy of it: `apply` is read through a latest-ref, so the effect
 *  depends on nothing but the channel and a host may close over whatever it likes.
 *
 *  `hostTab` is the tab this host lives on — see `useTakePlaceErrandResult` for why it is
 *  declared rather than read from the URL. Every host is reachable under exactly one tab
 *  (mode picks between the two that share `home` and `days`), so it identifies the host. */
export function usePlaceErrandReturn<D>(
  kind: PlaceErrandFormTarget['kind'],
  hostTab: TabId,
  apply: (returned: ReturnedPlaceErrand<D>) => void,
): void {
  const take = useTakePlaceErrandResult(kind, hostTab);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const result = take?.();
    if (!result) return;
    // Unreachable — `take` already filtered on a FORM kind — but it is what narrows the
    // union for the merge below, and it states the invariant §9 rests on: a place-row
    // errand never uses this channel, because it never leaves the tab it is answered on.
    if (result.errand.target.kind === 'place') return;
    const target = result.errand.target;
    const draft = (result.errand.draft as D | undefined) ?? null;
    applyRef.current({
      // Assigned here, once, rather than at five call sites (see `ReturnedPlaceErrand`).
      // A cancel carries no place, so the draft comes back untouched — which is what makes
      // `ביטול` re-open the form instead of losing it.
      draft: draft && result.placeId ? assignErrandPlace(draft, target, result.placeId) : draft,
      placeId: result.placeId,
      target,
    });
  }, [take]);
}
