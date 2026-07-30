// App-wide tunables and non-copy literals. UI copy lives in i18n/; domain enum
// values live in @waypoint/shared. Keep magic numbers/strings out of logic.
import type { BookingType, DocumentType, EventCategory } from '@waypoint/shared';
import type { SnapStop } from './lib/snap-sheet';
import type { IconName } from './ui/Icon';

export const MS_PER_DAY = 86_400_000;

/** Where the API lives. Empty in production, where the app is served same-origin, so
 *  every consumer must treat it as a prefix rather than a base to `new URL()` against.
 *
 *  It lives here rather than in `lib/api.ts` (which re-exports it) because
 *  `ui/primitives/Avatar` needs it to resolve an uploaded avatar's path, and a
 *  presentational primitive must not drag the api module — and through it Dexie — into
 *  its import graph just to read one config string.
 *
 *  `import.meta.env` is optional-chained because this module is **not only loaded by
 *  Vite**: `e2e/shelf-drag.spec.ts` imports two drag constants from here, so Playwright
 *  loads the file in plain Node, where `import.meta.env` does not exist and a bare
 *  `.VITE_API_BASE_URL` is a TypeError that fails the whole suite at collection. That
 *  cost a red `e2e` on the PR that moved this constant in — `lib/api.ts` had never been
 *  in the harness's import graph. Any `import.meta.env` read in `constants.ts` needs the
 *  same guard. */
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? '';

/** Filename on the avatar multipart part. A re-encoded canvas `Blob` has no name, and
 *  multer needs one to treat the part as a file at all — the server never reads it
 *  (the type comes from sniffing the bytes), so it only has to be present. */
export const AVATAR_UPLOAD_FILENAME = 'avatar.jpg';

/** The device's resolved locale (e.g. "he-IL", "en-US"). Native date inputs
 *  (`<input type="date">`) are formatted by the browser's UI language, not the
 *  document `lang="he"` — so an Israeli device on an English browser would show
 *  a date as mm/dd/yyyy. Pinning the input's `lang` to the device locale renders
 *  it in the device's own convention (mirrors TimePicker's `lang` on native
 *  time inputs). */
export const DEVICE_LOCALE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : 'he';

/** The device's IANA timezone — used only where no trip (and so no
 *  trip-local timezone) is loaded yet, e.g. the boot screen's clock. */
export const DEVICE_TIMEZONE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;

export const DAYS_PER_WEEK = 7;

/** Average Gregorian month/year — good enough for rounding far-out countdowns
 *  and the upper rungs of the duration ladder (ADR-0114), where a ±1-day error
 *  is invisible anyway. */
export const DAYS_PER_MONTH = 365.25 / 12;
export const DAYS_PER_YEAR = 365.25;

/** Day countdowns switch to rounded month counts past this many months —
 *  up close the exact day count is the useful number, far out it's noise
 *  ("בעוד 94 יום"). */
export const COUNTDOWN_MONTHS_THRESHOLD = 2;

/** How far a "delay" verb pushes an event. */
export const DELAY_STEP_MINUTES = 30;

/** Toast auto-dismiss. */
export const TOAST_DURATION_MS = 3600;

/** Live-clock tick. */
export const CLOCK_TICK_MS = 1000;

/** Realtime socket liveness (F-04, sync-and-offline.md "Realtime channel"). The
 *  client pings on `WS_HEARTBEAT_INTERVAL_MS`; a watchdog forces a reconnect if
 *  no frame (a `pong` or any message) lands within `WS_WATCHDOG_TIMEOUT_MS`, so a
 *  silently dropped socket (proxy/idle timeout, server restart) is caught while
 *  foregrounded and online, not only on the next `online`/visibility event.
 *  Reconnect uses bounded exponential backoff from base → cap, with jitter. */
export const WS_HEARTBEAT_INTERVAL_MS = 25_000;
export const WS_WATCHDOG_TIMEOUT_MS = 60_000;
export const WS_RECONNECT_BASE_MS = 1_000;
export const WS_RECONNECT_CAP_MS = 30_000;

/** Retry cadence for a non-empty write outbox (U-04): while anything is queued,
 *  re-attempt the flush on this interval so the "N changes waiting" summary can't
 *  wedge on when no connectivity transition arrives to trigger a drain. */
export const OUTBOX_RETRY_MS = 15_000;

/** Places picker autocomplete debounce (ADR-0108 §1 / ADR-0110 §1). Pause-gated,
 *  NOT per-keystroke — a **cost** control, not just UX polish: session tokens make
 *  in-session autocomplete free only when the session ends in a pick, so a
 *  type-and-abandon session bills per request. A trailing debounce collapses a word
 *  into ~one or two billable calls; the min-chars floor stops a one-letter query
 *  from firing at all. */
export const PLACE_SEARCH_DEBOUNCE_MS = 350;
/** Raised 2 → 3 by ADR-0131 §8b, and it is a **cost** decision rather than a tweak.
 *  The Map tab's Google half lost its arm (§8a), so past this floor a search spends —
 *  and two characters of Hebrew match a large fraction of a city, which makes a 2-char
 *  query a paid request that *cannot* return a useful answer while firing on the way to
 *  every query after it. Shared by `usePlaceSearch` (the Map tab + the in-form picker)
 *  and `useDestinationSearch`: the same Autocomplete relay in all three, so one number
 *  and deliberately no per-surface fork. */
export const PLACE_SEARCH_MIN_CHARS = 3;

/** Which corpus (and therefore which Google SKU) a search shell spends on — the one
 *  parameter that differs between the two halves of `usePlaceSearch` (ADR-0132 §7).
 *  `autocomplete` predictions carry no coordinates and are rows only; `text` results
 *  carry them and can be pins, at the price of having no session to bill against. */
export const PLACE_CORPUS = { autocomplete: 'autocomplete', text: 'text' } as const;
export type PlaceCorpus = (typeof PLACE_CORPUS)[keyof typeof PLACE_CORPUS];

/** The waking window the day-progress bar spans, in trip-local hours. */
export const DAY_WINDOW = { START_HOUR: 7, END_HOUR: 23 } as const;

/** Mean Earth radius, for the near-me haversine (lib/distance.ts). */
export const EARTH_RADIUS_M = 6_371_000;

/** Where a near-me distance chip changes precision (ADR-0109 §7): sub-kilometre
 *  distances round to a walkable 10 m, then read as one decimal of a kilometre,
 *  then as whole kilometres once the decimal stops meaning anything. */
export const DISTANCE_STEP = {
  NEAR_ROUND_M: 10,
  KM_FROM_M: 1000,
  WHOLE_KM_FROM: 10,
} as const;

/** Near-me location fix (lib/useGeolocation.ts): a one-shot read, so it may take a
 *  moment on a cold GPS, and a fix from the last minute is still where you are. */
export const GEOLOCATION_OPTIONS = {
  timeout: 10_000,
  maximumAge: 60_000,
} as const;

/** Home's quick-access grid at its full approved width (ADR-0045): four tiles —
 *  next code, WiFi, navigate-to-next, documents. Derived tiles drop out when they
 *  have no source, and the grid reflows to the visible count. */
export const QUICK_TILE_MAX_COLS = 4;

/** How far from "now" an event still evidences which zone you are standing in
 *  (ADR-0107 session-100). A booking an hour ago or an hour ahead places you; one
 *  five days out says nothing about the current clock. Half a day either way keeps
 *  a normal trip day covered end to end without a quiet night borrowing tomorrow's
 *  flight's destination. */
export const LIVE_ZONE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Noon — the safe wall-clock instant to sample a date at when only the calendar
 *  day matters and never the time: the day's **ambient zone** (ADR-0107, so a
 *  crossing near either boundary can't decide which zone frames the whole day)
 *  and the day's weekday label. Mid-day is far from every DST/midnight edge. */
export const DAY_NOON = '12:00';

/** Overnight events (ADR-0037): a regular event may end in the small hours of
 *  the next day, but stays filed under its start night. An end at/before the
 *  start is read as next-day only when it lands at/before END_HOUR (07:00) and
 *  the start is afternoon/evening (≥ MIN_START_HOUR, noon) — so a genuine
 *  end-before-start typo (05:00→04:00) is still rejected, not stretched to 23h.
 *  Transportation (red-eyes past 07:00) is a separate category, out of scope. */
export const OVERNIGHT = { END_HOUR: 7, MIN_START_HOUR: 12 } as const;

/** ponytail: fixed demo slot a scheduled maybe-item lands on (matches the mockup);
 *  a real scheduler opens a time picker. Trip-local wall time. */
export const DEFAULT_SCHEDULE_SLOT = { START: '17:30', END: '18:30' } as const;

/** Characters used to build the trip's initial from a display name. */
export const AVATAR_INITIAL_LENGTH = 1;

/** Header member-cluster avatars shown before collapsing the rest into a
 *  "+N" overflow bubble (app-shell.md §6, mockups/trip-dashboard-v2.html). */
export const MEMBER_AVATAR_CAP = 2;

/** Icon for a manually created event when the form doesn't collect one (T-047). */
export const DEFAULT_EVENT_ICON = '📌';

/** Fallback glyph for a booking row when it has no linked event to borrow an icon
 *  from — and now also when the event's glyph is only a placeholder. "A linked
 *  event's user-picked icon always wins" was the stated rule and stayed right; the
 *  reading of it was what slipped, because a DEFAULT was counted as a pick. Every
 *  reader of this map goes through `chosenIcon`. */
export const BOOKING_TYPE_ICON = {
  flight: '✈️',
  hotel: '🏨',
  restaurant: '🍜',
  train: '🚄',
  activity: '🎟️',
  other: '📄',
} as const satisfies Record<BookingType, string>;

/** **Does `EventForm`'s `יש הזמנה` row open on?** (ADR-0136 §2.) A hotel or a flight you
 *  are putting on a day is near-certainly booked; everything else is genuinely either, so it
 *  opens off. This is inference doing the one thing it can do honestly — offering a starting
 *  position, never deciding the fact — and it stops moving the instant a human touches the
 *  row (`bookedTouched`).
 *
 *  A per-enum `Record` rather than a `cat === 'lodging' || cat === 'transport'` at the call
 *  site: the compiler then flags a new `EventCategory` here instead of silently defaulting it
 *  off. It stays frontend-side because it is a **form default**, not cross-layer vocabulary —
 *  the server never asks this question (`packages/shared/CLAUDE.md`: promote only once a
 *  second layer needs the same values). Its sibling `CATEGORY_TO_BOOKING_TYPE` maps between
 *  two shared enums, which is why that one does live in `@waypoint/shared`. */
export const CATEGORY_DEFAULT_BOOKED = {
  lodging: true,
  transport: true,
  food: false,
  sightseeing: false,
  nature: false,
  activity: false,
  shopping: false,
  services: false,
  other: false,
} as const satisfies Record<EventCategory, boolean>;

/** **The one question the category cannot answer** (ADR-0136 §2, owner's call session 185).
 *  `EventCategory` has a single `transport`, while `BookingType` has `flight`, `train` and
 *  `other` — and `BOOKING_TYPE_TO_CATEGORY` maps both transport types back to that one
 *  category, so the forward guess has to collapse them. It collapsed to `flight`, which meant
 *  every train booked from `EventForm` arrived as a flight for someone to fix later.
 *
 *  So `transport` — and only `transport` — asks. Ordered as shown, flight first, because it
 *  is also the derived default. `other` covers the bus/car/ferry/cable-car half of the
 *  transport icon group; its glyph is `🚌` rather than `BOOKING_TYPE_ICON.other`'s `📄`,
 *  because all three pills answer "which transport" and a document among two vehicles reads
 *  as a different kind of answer. Note `other` is not a span type, so `bookingDefaultKind`
 *  makes it **soft** while flight and train are hard — deliberately not special-cased, since
 *  commitment has one source (ADR-0136 §4). */
export const TRANSPORT_BOOKING_TYPES = [
  { value: 'flight', icon: '✈️' },
  { value: 'train', icon: '🚄' },
  { value: 'other', icon: '🚌' },
] as const satisfies readonly { value: BookingType; icon: string }[];

/** Glyph per document type, for the Index documents section badges. */
export const DOCUMENT_TYPE_ICON = {
  passport: '📕',
  insurance: '🛡️',
  visa: '🎫',
  other: '📄',
} as const satisfies Record<DocumentType, string>;

/** Icon for a manually added maybe-shelf idea (no icon picker yet). */
export const DEFAULT_MAYBE_ICON = '💡';

/** Glyph for a PLACE with no category — the Map's pins and list rows, and the
 *  research results, which have no category until they are added. Distinct from
 *  `DEFAULT_EVENT_ICON`: a place with nothing known about it is still somewhere on
 *  a map (📍), where an uncategorised event is a note pinned to a day (📌).
 *
 *  Deliberately NOT in `PLACEHOLDER_ICONS` below: this one is derived at render
 *  from `category == null` and never stored, so there is no stored pick for
 *  `chosenIcon` to second-guess. */
export const DEFAULT_PLACE_ICON = '📍';

/** Glyph for an AMBIENT STAY drawn without its own icon — the multi-night backdrop
 *  on Home's stay strip and both day surfaces (ADR-0054). Three call sites held this
 *  literal; same reason `DEFAULT_PLACE_ICON` above has a name.
 *
 *  Not `BOOKING_TYPE_ICON.hotel`, though the glyph is the same today: an ambient span
 *  need not come from a hotel booking at all, and reaching into that map would be the
 *  content-enum-as-decoration mistake the empty documents card made. */
export const DEFAULT_STAY_ICON = '🏨';

/** The glyphs the app hands out when nobody has chosen one. Named as a SET, and
 *  read only through `chosenIcon` below. */
const PLACEHOLDER_ICONS: ReadonlySet<string> = new Set([DEFAULT_EVENT_ICON, DEFAULT_MAYBE_ICON]);

/** A stored glyph, but only if it actually says something — `undefined` for the
 *  placeholders above, so the `??` chain behind it keeps running.
 *
 *  **Why this exists.** Four surfaces read `event.icon ?? <something more specific>`
 *  (a booking's type glyph, a category's glyph). The rule they encode is right and
 *  `constants.ts` used to state it as "a linked event's **user-picked** icon always
 *  wins" — but a DEFAULT is not a pick, so `📌` outranked a glyph that genuinely
 *  says what the thing is, and a flight row drew a generic pin instead of ✈️.
 *
 *  The reachable path is an event created with no category (the form leaves `📌`
 *  in place) that is later given one: `EventForm` only re-derives the glyph while
 *  the icon is untouched, and **editing an existing event counts as touched**, so
 *  the pin sticks and then shadows the category from that point on.
 *
 *  Deliberately a value test, not a flag. An `iconIsDefault` column would have to
 *  be maintained by every writer and would go stale the moment someone genuinely
 *  picks the pin; asking "is this glyph a placeholder" needs no migration and is
 *  right for rows written before today. The cost is honest and small: a user who
 *  deliberately picks `📌`/`💡` is treated as having picked nothing, and gets the
 *  more specific glyph instead. */
export const chosenIcon = (icon?: string): string | undefined =>
  icon && !PLACEHOLDER_ICONS.has(icon) ? icon : undefined;

/** Drag edge auto-scroll (ADR-0116 §5 amendment): how deep the edge band is, and
 *  the fastest one frame may scroll while the pointer is pinned against it. The
 *  band is generous because a thumb holding a card covers a lot of screen. */
export const DRAG_EDGE_SCROLL_ZONE_PX = 84;
export const DRAG_EDGE_SCROLL_MAX_PX = 14;
/** How far a drag lifted INSIDE a band must push toward that edge before the band
 *  starts scrolling (the other release is leaving the band). Above the hold's own
 *  slop, so the wobble of a thumb settling on a card never reads as a push, and well
 *  under the band's depth, so aiming at the edge you started near stays one small
 *  movement rather than a detour. */
export const DRAG_EDGE_SCROLL_RELEASE_PX = 16;
/** How much vertical overflow an ancestor needs before a drag treats it as THE
 *  scroller. A horizontally-scrolling strip reports `overflow-y: auto` (CSS makes
 *  the other axis `auto` when one is not `visible`) and is often a pixel or two
 *  taller than its box, so without a floor the drag scrolls the strip, not the page. */
export const DRAG_SCROLLER_MIN_OVERFLOW_PX = 24;

/** Press-and-hold before a shelf card starts dragging (ADR-0116 §5, session-114):
 *  long enough that a scroll flick never arms a drag, short enough that a
 *  deliberate hold doesn't feel stuck. Matched to Android's own long-press
 *  timeout (`ViewConfiguration.getLongPressTimeout()`, 500 ms) — the delay
 *  before the platform's long-press haptic fires on hold — so the drag arms
 *  right where the gesture already feels confirmed. `SLOP` is how far a
 *  finger may wander during the hold before we call it a scroll and give up
 *  the drag. */
export const DRAG_HOLD_MS = 500;
export const DRAG_HOLD_SLOP_PX = 8;
/** How long the "swallow the click a completed drag fires" listener stays armed
 *  before disarming itself. Only a fallback: it normally disarms on that click. */
export const DRAG_CLICK_SWALLOW_MS = 400;
/** How long a drag must rest over a day pill before the strip switches to that day
 *  (ADR-0116 session-119) — the spring-loaded-folder idiom. Longer than the hold that
 *  starts the drag: a drag crosses several pills on its way anywhere, and every one it
 *  merely passes over must not open. */
export const DRAG_DAY_DWELL_MS = 700;

/** The 5-hue Map pin/badge palette (ADR-0109 §3 / ADR-0110 §2). The `--cat-*`
 *  tokens carry the actual colours (styles/tokens.css); this is the hue key. */
export type PinHue = 'food' | 'lodging' | 'transit' | 'leisure' | 'services';

/** The 9 `EventCategory` values fold onto the 5 pin hues (ADR-0110 §2). A `Record`
 *  (not a switch) so the compiler flags a missing case if `EventCategory` grows;
 *  an uncategorised place (all references `category = null`) falls back to
 *  `leisure` at the call site. */
export const CATEGORY_PIN_HUE = {
  transport: 'transit',
  food: 'food',
  lodging: 'lodging',
  sightseeing: 'leisure',
  nature: 'leisure',
  activity: 'leisure',
  shopping: 'leisure',
  services: 'services',
  other: 'leisure',
} as const satisfies Record<EventCategory, PinHue>;

/** The floating controls row over the canvas (ADR-0122 §1), in px. It is written
 *  into CSS as `--map-controls-h` by the screen AND read by `MAP_FIT_PADDING` below,
 *  which is the point of naming it: the row's layout and the band the camera keeps
 *  clear of pins cannot drift apart if they are the same number. */
export const MAP_CONTROLS_H = 46;
/** The sheet's own top region — the handle, `קרוב עכשיו`, the view toggle — reserved
 *  from one constant that also writes the CSS `min-height` (ADR-0122 §3), so a taller
 *  top can never clip. It is also the `map` stop's whole height. */
export const MAP_SHEET_STRIP_H = 52;
/** Google draws its logo and terms link at the bottom-inline-start of the map div and
 *  the ToS forbids obscuring them (ADR-0106 §B), so anything floating at the pane's
 *  bottom clears them by their own height — a named clearance, not a hand-tuned
 *  offset (ADR-0122 §7). */
export const MAP_ATTRIBUTION_H = 22;
/** The gap the pane's floating furniture leaves below the controls row. Paired with
 *  the `8px` in `map.css` / `map-pane.css`, which is the same offset the re-centre
 *  control has always used. */
export const MAP_FLOAT_GAP = 8;

/** The list sheet's three snap heights (ADR-0121 §5, reshaped by ADR-0122 §3) — one
 *  axis, dragged by the sheet's whole top region and shortcut by the `רשימה / מפה`
 *  toggle, so the two controls cannot disagree.
 *
 *  `map` replaces the list-sliver `peek`: the sheet's own top row and NOTHING of the
 *  list. `peek` spent 116px to show 65px of viewport — 0.8 of a row, at the stop
 *  whose entire point is the canvas — so it showed neither the handle-plus-a-row it
 *  promised nor the map it was in the way of (ADR-0122 §7). Fixed px, because fixed
 *  chrome is the same size on every screen; `half` a fraction, because a proportion
 *  should not be; and `full` an **inset**, because the sheet must stop below the
 *  floating controls row or the list you are reading cannot be filtered (§1).
 *
 *  Constants, never measured at runtime: `screens/Map.tsx` re-renders every second,
 *  and `--sheet-h` must not depend on a layout read (ADR-0121 §5). */
export const MAP_SHEET_VIEW = { map: 'map', half: 'half', full: 'full' } as const;
export type MapSheetView = (typeof MAP_SHEET_VIEW)[keyof typeof MAP_SHEET_VIEW];

/** The controls row has ONE disclosure with two occupants (ADR-0131 §1): the facet
 *  strip, and the query field that replaced the full-screen search overlay on this tab.
 *  Both cover the row in place behind the same pinned `✕` (ADR-0122 §2's shape).
 *
 *  One three-valued state rather than two booleans, because two booleans have a fourth
 *  state — both open — that must not exist, and a bare string discriminant is the typo
 *  that becomes a silent no-op (ADR-0095). `null` is "nothing open", so the type is
 *  `MapRowDisclosure | null` at the call site. */
export const MAP_ROW_DISCLOSURE = { facets: 'facets', query: 'query' } as const;
export type MapRowDisclosure = (typeof MAP_ROW_DISCLOSURE)[keyof typeof MAP_ROW_DISCLOSURE];
/** Ordered low → high, which is also the toggle's two extremes plus the default. */
export const MAP_SHEET_ORDER = [
  MAP_SHEET_VIEW.map,
  MAP_SHEET_VIEW.half,
  MAP_SHEET_VIEW.full,
] as const;
export const MAP_SHEET_STOPS = {
  map: { px: MAP_SHEET_STRIP_H },
  half: { fraction: 0.56 },
  full: { inset: MAP_CONTROLS_H },
} as const satisfies Record<MapSheetView, SnapStop>;

/** How far a finger must travel before the sheet's top region reads a press as a
 *  DRAG rather than as a tap (ADR-0122 §4). Load-bearing, not polish: the region is
 *  390×51 and contains real controls, and a finger emits `pointermove` on a tap — so
 *  without a floor the region swallows every tap inside it. */
export const SNAP_DRAG_SLOP_PX = 4;
/** Released at or above this speed (px/ms, sampled from the last two moves) the sheet
 *  commits to the next stop in the direction of travel instead of snapping to the
 *  nearest one (ADR-0122 §4) — which is most of what "the drag is unpleasant" meant:
 *  a real flick that travels little used to spring back to where it started.
 *
 *  A threshold in px/ms is roughly device-independent on paper and a finger is not a
 *  mouse, so it belongs to Phase 3's device pass along with `MAP_ZOOM`. */
export const SNAP_FLICK_PX_PER_MS = 0.5;

/** Camera zoom bounds (ADR-0121 §7, re-tuned and reorganised by ADR-0127).
 *
 *  **`PLACE` is one number answering one question — "how close is close enough to
 *  read a place in context" — and that is the point of it.** Three paths ask it: a
 *  lone pin centring (`fitBounds` on a zero-area extent snaps to building level, so
 *  it never runs), a selection zooming in, and locate. They used to answer it
 *  separately or not at all, so the tab landed at a different zoom depending on how
 *  you got there. It replaces `SINGLE_PIN`, which named only the first path.
 *
 *  `MAX_FIT` stays a **separate** number, one step tighter, and is not folded in: it
 *  caps a *fit*, which has real extent behind it, where `PLACE` is the zoom to use
 *  when there is no extent to read. A tight cluster earning one step closer than a
 *  guess is the distinction, not an inconsistency.
 *
 *  `STEP_IN_MAX` is where locate's repeat-tap ladder stops (#20). The step itself is
 *  stateless — one level in from wherever the map actually is — so a pinch between
 *  taps cannot desynchronise it and no tap count lives anywhere (ADR-0122 §9).
 *
 *  `WORLD` is only the pre-fit default: a map must be constructed with some camera,
 *  and the first fit replaces it.
 *
 *  **The three numbers are derived defaults and the device pass owns them**, exactly
 *  as ADR-0122 handed the snap stops over: each zoom step halves the span, "close
 *  enough to read" is a legibility judgement, and the reported defect was that 15 and
 *  16 both landed too close — so both moved one step out and the relationship between
 *  them was preserved rather than re-invented. They join `MAP_PIN` and
 *  `MAP_REFIT_FILL_SHARE` in the same cluster. */
export const MAP_ZOOM = {
  PLACE: 14,
  MAX_FIT: 15,
  STEP_IN_MAX: 17,
  /** Below this zoom every pin degrades to a **dot** (ADR-0121 §6, built in ADR-0128).
   *  Keyed on ZOOM, never on the canvas, and that distinction is the whole reason
   *  ADR-0123 left it alone: a pin's SIZE must not change under a pinch, but its TIER
   *  legitimately can. A ~30km span on a phone is the last view where a teardrop with
   *  a glyph and a numeral is claiming precision it has; wider than that it covers a
   *  town and the numeral is noise. Derived, and in the device-pass cluster. */
  DOT_BELOW: 11,
  WORLD: 2,
} as const;

/** **How much ground to show around a place you were sent to look at** (ADR-0129 §2).
 *  A fixed zoom cannot tell a dense district from an empty valley, so the span is
 *  derived from the distance to the nearest other pins and clamped both ways. In degrees
 *  of latitude, which is the unit the bounds are built in; ~0.01° is roughly 1.1km.
 *
 *  - `NEIGHBOURS` — how many of the nearest pins count as "what is around here". The
 *    tenth-nearest says nothing about that and only drags the frame out.
 *  - `NEIGHBOUR_HEADROOM` — how much further than the neighbours to show, so they sit
 *    inside the frame with air around them rather than on its edge.
 *  - `MIN_SPAN_DEG` — the floor. Coincident pins would otherwise fit a zero-area box and
 *    snap to building level, which is ADR-0121 §7's degenerate case.
 *  - `MAX_SPAN_DEG` — the ceiling. Without it one distant neighbour frames a region and
 *    the place you came to see is a speck. It still binds when EVERY neighbour is far:
 *    nothing close is not the same as nothing, and an isolated place keeps the wider frame
 *    rather than zooming in on empty ground (owner, session 169).
 *  - `CLUSTER_FACTOR` — how much further than the NEAREST neighbour another may be and
 *    still count as part of its cluster. Without it the third-nearest sets the span even
 *    when the nearest is right next door, so a place with something close framed as if it
 *    had nothing (owner, session 169: _"zoom more when the selected is very close to other
 *    results"_).
 *  - `DEFAULT_SPAN_DEG` — a place with no neighbours at all. The old fixed behaviour,
 *    now only the fallback rather than the rule.
 *
 *  All of them are derived defaults in the device-pass cluster: "close enough to read a
 *  place in context" is a legibility judgement (ADR-0127 §1's posture, unchanged). */
export const MAP_FOCUS = {
  NEIGHBOURS: 3,
  NEIGHBOUR_HEADROOM: 1.6,
  MIN_SPAN_DEG: 0.0025,
  CLUSTER_FACTOR: 3,
  MAX_SPAN_DEG: 0.03,
  DEFAULT_SPAN_DEG: 0.01,
} as const;

/** **The camera's own animation** (ADR-0129 §3). Google animates `fitBounds` "depending
 *  on an internal heuristic" and `panTo` only when the move is shorter than the
 *  viewport, so smooth movement is not something the API can be asked for — it is
 *  something we drive, with `moveCamera` (documented as instant) once per frame.
 *
 *  `DURATION_MS` is one duration for every camera move, so a day change, a chip and an
 *  arrival all read as the same object moving. Under `prefers-reduced-motion` the whole
 *  thing collapses to a single `moveCamera`, which is the "it still moves, only the
 *  easing goes" rule the sheet and the pins already follow (ADR-0098 §4). */
export const MAP_CAMERA_EASE = { DURATION_MS: 480 } as const;

/** What the place card reserves at the bottom of the canvas while it is up (ADR-0122
 *  §7, deferred there and built in ADR-0128 §2) — the attribution it must clear, the
 *  float gap, and the card's own body.
 *
 *  `CARD_BODY_H` is the one new number: a selected `.place` row plus the way-in block
 *  selection reveals. It is a constant rather than a measurement because this screen
 *  re-renders every second and `--sheet-h` must never depend on a layout read (ADR-0121
 *  §5) — so it is stated, sized generously enough to cover a two-reference row, and left
 *  to the device pass like the rest of the cluster. */
export const MAP_CARD_BODY_H = 130;
export const MAP_CARD_RESERVE_H = MAP_ATTRIBUTION_H + MAP_FLOAT_GAP + MAP_CARD_BODY_H;

/**
 * **The pin's size is a rule, not a number** (ADR-0123): a pin is a share of the
 * **canvas it sits on**, floored and capped. The canvas is what the sheet's stop
 * actually changes — 545px of map at the `map` stop against ~260px at `half` on the
 * baseline phone — so a single fixed size is either tiny on one or overbearing on the
 * other, which is what a 34px teardrop on a full-height pane looked like.
 *
 * `lib/map-pins.ts` evaluates this twice from the same numbers — once as a CSS
 * `clamp()` the browser resolves against the pane's own height (`pinSizeCss`), once in
 * TS for the band the camera keeps clear of pins (`pinClearanceFor`) — so the pin that
 * is drawn and the room reserved for it cannot disagree. Same arrangement, same
 * reason, as `MAP_CONTROLS_H` (ADR-0122 §1).
 *
 * - `MIN_H` — the shipped teardrop. The floor because it is the size the design pass
 *   approved, and because a 13px category glyph and a finger both stop working below it.
 * - `MAX_H` — where a marker stops reading as a *point* and starts reading as a label,
 *   and where coincident pins start colliding for no gain.
 * - `CANVAS_SHARE` — the share of the canvas's **height** a pin takes between the two.
 *   Height, because that is the axis the stop moves.
 * - `TAG_RISE` — how far the amber `עכשיו` / `התחנה הבאה` tag climbs above the pin's own
 *   box, as a fraction of the pin's height. Named because it is exactly the difference
 *   between "a pin is this tall" and "the camera must keep this much clear".
 * - `DOT_SCALE` — what the dot tier keeps of the pin (ADR-0128 §1). A ratio for the same
 *   reason `ASIDE_SCALE` is one: the rung has to stay a rung as the canvas grows the
 *   others, and the dot is the bottom of the same ladder rather than a second object.
 * - `ASIDE_SCALE` — a subordinate tier stays subordinate **by ratio**, so it is the same
 *   teardrop at 72% on every canvas rather than a fixed 25px that goes on getting
 *   relatively smaller as the rest grow (ADR-0121 §6's ladder, held). Was `GHOST_SCALE`
 *   until ADR-0130 §3 gave it a second wearer — the dayless shelf maybe — so the name
 *   describes the rung rather than the one tier that used to occupy it.
 *
 * **Calibrated on a phone (2026-07-27, session 143), and that is why these numbers are
 * what they are.** The first pass set `CANVAS_SHARE` to 0.08 and `MAX_H` to 46 against
 * ADR-0122's measured 390×844 baseline. On the owner's actual device the usable viewport
 * is shorter — the map-stop canvas measures **~501px**, not 545 — so the pins grew by
 * 18% where the arithmetic promised 28%, sat mid-ramp, and never came near the cap
 * (46px needs a 575px canvas). Measured from the reported screenshots: the lodging pin's
 * badge went 67 → 79 device px, a ratio of 1.18. Owner's call: 0.11 and 56.
 *
 * **One consequence, stated rather than discovered later:** the growth band is now
 * `MIN_H/SHARE` to `MAX_H/SHARE` = **309px to 509px** of canvas, so a phone at the map
 * extreme is at or near the **cap**, and `MAX_H` — not the share — is what sets the size
 * there. That is intended (the share's job on a phone is to keep `half` at the floor and
 * get the map extreme to the cap) but it means **`MAX_H` is the number to move** if the
 * map extreme ever wants re-tuning again, and the share is the number that protects
 * `half`. `half` has real margin: a 44%-of-body canvas is ~243px on that phone, and the
 * floor holds anywhere under 309px, so even 0.14 would leave the shared-screen stop
 * exactly as it shipped.
 *
 * Still unsettled, and named because a second recalibration should not have to
 * rediscover it: past roughly 56px a teardrop's tip gets vaguer about which building it
 * marks, and coincident pins overlap sooner — so a **dense all-days day** is the case to
 * look at before raising `MAX_H` further, not another single-day screenshot.
 *
 * Session 190 looked at that day for the TAG rather than for the pin, and it is worth
 * knowing which half is now answered: a trip's worth of bracketed edges collides on a
 * phone, which is one of the two reasons ADR-0142 makes the neutral phase tag day-scoped.
 * The `MAX_H` question above is untouched — that was measured at 40px pins, not at the cap.
 */
export const MAP_PIN = {
  MIN_H: 34,
  MAX_H: 56,
  CANVAS_SHARE: 0.11,
  TAG_RISE: 0.56,
  DOT_SCALE: 0.4,
  ASIDE_SCALE: 0.72,
  /** How far the pin's ink reaches SIDEWAYS from its anchor, as a fraction of its height —
   *  the camera's left/right inset (session 144). Measured in Chromium, not derived on
   *  paper: 0.59 to the outer edge of the number badge (half the 0.82 box plus the badge's
   *  0.18 overhang) plus its 0.045 ring, which no bounding box reports.
   *
   *  The tag is deliberately NOT in here, and reserving it would put the horizontal inset
   *  past 40% of a 390px viewport, where `fitPaddingFor` drops the padding wholesale and
   *  the fit loses its framing — the trade ADR-0121 §7 already made explicitly ("losing a
   *  pin's tag beats losing the framing"). Every pin has a badge; only some carry a tag.
   *
   *  **The number this note used to give was measured on copy the app no longer shows**
   *  (session 191, remeasured in Chromium for ADR-0142): 1.10x was `התחנה הבאה`, where the
   *  shipped `היעד הבא` reaches **0.88x** per side. Restated because the tag's content is
   *  no longer only those two words — a transition word now takes the slot — and the point
   *  of the note is that the widest tag stays outside the inset. The widest of the new
   *  words, `צ׳ק-אאוט`, is **0.90x**: 102% of today's, i.e. the same width in practice, so
   *  nothing here moves. Ratios hold at every pin size, the tag's font-size being a
   *  fraction of `--pin-u` like everything else. */
  SIDE_REACH: 0.64,
} as const;

/** The three sides of a fit's inset that carry nothing but breathing room. The top is
 *  derived instead, because it carries the controls row and a pin — see
 *  `mapFitPadding` in `lib/map-camera.ts`. */
export const MAP_FIT_INSET = 28;
/** How much of the current view a **contained** pin set must fill before the camera
 *  leaves it alone (ADR-0121 §7, amended 2026-07-27). Below this share on BOTH axes
 *  the set is *dwarfed* — visible, but not framed — and the camera re-fits instead of
 *  declining to move. It is `||` across the axes on purpose: a row of stops down one
 *  street fills the width and not the height, and that is framed, not dwarfed.
 *
 *  Lives here beside `MAP_ZOOM` rather than in `map-camera.ts` because it is the same
 *  kind of judgement as the zoom ladder, and Phase 3's device pass will want to tune
 *  the cluster in one place. It **needs** that pass: "too small to read" is a
 *  legibility call, and a desktop viewport is the wrong place to make it. */
export const MAP_REFIT_FILL_SHARE = 0.4;

/** The day connector (ADR-0121 §10): dashed, so it says "this is the order" rather
 *  than claiming to be the route, and NEUTRAL, because it belongs to the quiet base
 *  and not the loud figure (ADR-0106 §C) — which leaves solid + amber unspent for a
 *  real Routes polyline later.
 *
 *  `COLOR` duplicates `--soft-line`'s light-theme value, the same concession
 *  `LIST_MOVE_EASING` makes for the Web Animations API: the Maps JS API takes a
 *  colour value, not a CSS variable. Keep the two in step. The Maps API has no
 *  dash array either, so a dash is a repeating symbol along a transparent stroke. */
export const MAP_CONNECTOR = {
  COLOR: 'rgba(22, 35, 61, 0.28)',
  WEIGHT: 2.5,
  DASH_SCALE: 3,
  DASH_REPEAT: '13px',
} as const;

/** Per-row reveal stagger for **every** filtered/searched list (ADR-0120,
 *  generalizing ADR-0098 §4 motion): a chip/search change reveals newly-matching
 *  rows with an incrementing transition-delay instead of an all-at-once flip,
 *  capped so a long list doesn't drag the reveal out. Read only by
 *  `lib/filter-reveal.ts` — call sites take the delay from there. */
export const FILTER_STAGGER_MS = 24;
export const FILTER_STAGGER_MAX_MS = 220;

/** How a row slides to its new place when the list re-orders (`lib/useFlipRows.ts`,
 *  ADR-0120 session-130). Mirrors the CSS `--t-base`/`--ease-standard` the reveal
 *  itself uses, so a move and a collapse in the same change read as one motion —
 *  the Web Animations API needs them as values, not as CSS vars. */
export const LIST_MOVE_MS = 240;
export const LIST_MOVE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** The invite pass's choreography (ADR-0143) — the stamp and the tear.
 *
 *  Same distinction as `TRIP_BIRTH`: these are SEQUENCE, not ramp values. `STAMP_MS`
 *  is how long the stamp is left to read before the pass tears, and `TEAR_MS` how long
 *  the tear plays before the handoff — so the whole thing between a successful join and
 *  landing in the trip is their sum. Short on purpose: this is the beat between
 *  deciding and arriving, not a set piece of its own. */
export const JOIN_PASS = {
  STAMP_MS: 420,
  TEAR_MS: 420,
} as const;

/** A value that changes should be seen to change (`lib/useCountUp.ts`, ADR-0143).
 *  Steps rather than a duration, because what runs up is an integer count. */
export const COUNT_UP = {
  STEPS: 14,
  STEP_MS: 26,
} as const;

/** Trip birth's choreography (ADR-0142) — the offsets at which each beat STARTS,
 *  measured from the moment the server confirms the trip.
 *
 *  These are not ramp values and must not be read from `tokens.css`: each beat's own
 *  duration comes from the ramp (`--t-deliberate` for the card and the chrome,
 *  `--t-cinematic` for the board), while the numbers below are the *sequence* — when
 *  one beat starts relative to another. Sequence is what makes the moment read as
 *  grand; length alone just makes it slow.
 *
 *  They deliberately OVERLAP: the chrome starts warming before the card has finished
 *  travelling, so the screen reads as one event resolving rather than four things
 *  taking turns. `TOTAL_MS` is when the whole thing is settled — used only to disarm
 *  the skip affordance, never to gate the outcome. */
export const TRIP_BIRTH = {
  /** The card travels and commits at 0 — it is the subject, so nothing precedes it. */
  CHROME_MS: 300,
  BOARD_MS: 650,
  CONTENT_MS: 1150,
  TOTAL_MS: 1450,
  /** Per-flap delay for the board's first row settling into place. Three flaps, so
   *  the row is done well inside the board's own power-on. */
  FLAP_STEP_MS: 90,
} as const;

/** Placeholder row icon on the all-trips list (ADR-0033) — `destination` is
 *  free text, no structured country to derive a real flag from. */
export const DEFAULT_TRIP_ICON = '🧳';

/** Prefix shown before confirmation codes (e.g. #4471). */
export const CODE_PREFIX = '#';

/** The app's peer-info separator (design-language.md §Typography): the small
 *  middle dot, e.g. "עכשיו · במקביל". Not the bullet — that heavier glyph is
 *  the boot loader's decorative dot (BootScreen's own constant), never a
 *  separator. */
export const DOT_SEPARATOR = '·';

/** Longest combined origin+destination label (in characters, after
 *  `shortPlaceLabel`) that still reads as one inline route on a day row; past it
 *  the row goes destination-primary (ADR-0059 §3 amendment).
 *
 *  Deliberately a **character count, not a measured width**: the Trip card and
 *  the Plan builder row have different amounts of room (the builder also carries
 *  a drag grip, ▲/▼, and the ⋯ button), so a per-row measurement made the two
 *  modes disagree about the same flight. A shared threshold takes the same input
 *  on both surfaces, so they cannot diverge. Tuned for the NARROWER of the two
 *  (the builder row), so a route that stays inline fits in both. */
export const ROUTE_INLINE_MAX_CHARS = 26;

/** Active-trip override — per-device, not synced (ADR-0021). */
export const ACTIVE_TRIP_STORAGE_KEY = 'wp_active_trip_id';

/** Cached identity (the last successful GET /me), so a cold reload with no
 *  connectivity can render as signed-in instead of bouncing to /login — the
 *  access token stays in-memory only (ADR-0020); this is identity, not a
 *  credential. Cleared on real sign-out / auth loss. */
export const ME_STORAGE_KEY = 'wp_me';

/** Deep-link path saved across the login gate, resumed after sign-in (ADR-0024). */
export const AUTH_INTENT_STORAGE_KEY = 'wp_auth_intent';

/** Invite token whose join should auto-complete after the login round-trip
 *  (T-042): tapping "Continue with Google" on the preview *is* the confirm,
 *  so the join finishes on resume without a redundant second tap (ADR-0024). */
export const JOIN_INTENT_STORAGE_KEY = 'wp_join_intent';

/** The mid-stay strip the user last dismissed, as "<tripId>:<eventId>:<date>"
 *  (ADR-0064 §A). Self-expiring: it suppresses the strip only while that exact
 *  stay+day is showing, so the next night or the next hotel re-surfaces it.
 *  Only one strip shows at a time, so a single stored value suffices.
 *  Per-device, not synced (ADR-0021). */
export const STAY_STRIP_DISMISS_STORAGE_KEY = 'wp_stay_strip_dismissed';

/** The bottom nav. Its glyphs crossed from emoji to `Icon` in ADR-0138 §4 on the
 *  owner's call — navigation is the case design-language names first when it says
 *  controls are icons, and the tab bar is the app's most-seen surface, so the one
 *  place a platform's emoji font showed through loudest was here. */
export const TABS = [
  { id: 'home', icon: 'home' },
  { id: 'map', icon: 'map' },
  { id: 'index', icon: 'cards' },
  { id: 'days', icon: 'calendar' },
] as const satisfies readonly { id: string; icon: IconName }[];

export type TabId = (typeof TABS)[number]['id'];

/* ── Iconography, split in two (ADR-0138 §2) ──────────────────────────────────
   These used to be ONE `ICONS` object holding both kinds, which is why
   design-language's "emoji are content, icons are UI" drifted for so long: a
   call site importing `ICONS.edit` and a call site importing `ICONS.weather`
   looked identical, so nothing told you that one of them was breaking the rule.
   The split is the fix — the type now tells you. `CONTROL_ICON` values are
   `IconName`s and can only be rendered through `<Icon>`; `GLYPH` values are
   strings and are content. If you are adding an entry and cannot say which
   object it belongs in, the question to ask is whether the user AIMS at it. */

/** Content glyphs — a thing being described, not a control being offered. These
 *  stay emoji deliberately (design-language): they carry the app's warmth, and a
 *  category badge is data, not chrome.
 *
 *  **It is down to one entry, and that is the finding** (ADR-0138's follow-up).
 *  The first pass filed the Index/Home tile markers here as "category badges",
 *  which was wrong for a reason the code then made visible: each sits on a TILE
 *  you tap. Home's quick-action row ended up with three of these beside one SVG
 *  compass, and the Index's two tiles disagreed with the nav tab that leads to
 *  them. A marker on a control is a control. `atm`/`weather`/`fx` went with them
 *  unrendered — they had no call site at all, so they were a plan, not content.
 *
 *  What is left is the honest case: a **unit on a data run** inside a sentence
 *  (`5 👥` on a trip card), which design-language's "icons that are part of a
 *  sentence stay in the copy" covers exactly. The app's other content emoji do
 *  not live here — they are the per-entity badges (`BOOKING_TYPE_ICON`,
 *  `DOCUMENT_TYPE_ICON`, `CATEGORY_DEFAULT_ICON`), trip identity, and the warmth
 *  in `i18n/`. */
export const GLYPH = {
  members: '👥',
  /** The `/join` boarding-pass card (ADR-0024). These four are the app's one
   *  deliberately playful surface and they stay emoji — a celebration, a wave and
   *  a stand-in face are warmth, and the ✈️ is part of a ticket ILLUSTRATION, not a
   *  mark on a control. They are named here rather than typed into the JSX so the
   *  lint guard needs no exemption for that file: a glyph in the markup is
   *  decoration by construction, and content comes from this vocabulary. */
  celebrate: '🎉',
  boardingPass: '✈️',
  /** The preview API returns a member COUNT and no names, so the avatars stand in
   *  for people the page is not allowed to show. */
  anonAvatar: '🙂',
  wave: '👋',
} as const;

/** Control icons — every one of these is drawn by `<Icon name={…} />`. The value
 *  IS the `IconName`, so a call site cannot accidentally render it as text. */
export const CONTROL_ICON = {
  navigate: 'navigate',
  nearMe: 'pin',
  search: 'search',
  lock: 'lock',
  warn: 'warn',
  done: 'check',
  edit: 'edit',
  trash: 'trash',
  restore: 'undo',
  /** Two events exchanging slots. Distinct from `sync` although both shipped as
   *  🔄 — one emoji for two meanings is the drift this split ends. */
  swap: 'swap',
  delay: 'clock',
  share: 'share',
  link: 'link',
  clipboard: 'clipboard',
  schedule: 'calendar',
  toShelf: 'shelf',
  more: 'more',
  add: 'plus',
  sync: 'sync',
  offline: 'offline',
  upload: 'upload',
  promote: 'crown',
  leave: 'exit',
  close: 'close',
  clock: 'clock',
} as const satisfies Record<string, IconName>;
