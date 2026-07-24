// App-wide tunables and non-copy literals. UI copy lives in i18n/; domain enum
// values live in @waypoint/shared. Keep magic numbers/strings out of logic.
import type { BookingType, DocumentType, EventCategory } from '@waypoint/shared';

export const MS_PER_DAY = 86_400_000;

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
export const PLACE_SEARCH_MIN_CHARS = 2;

/** The waking window the day-progress bar spans, in trip-local hours. */
export const DAY_WINDOW = { START_HOUR: 7, END_HOUR: 23 } as const;

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

/** Fallback glyph for a booking row in the Index when it has no linked event to
 *  borrow an icon from (a linked event's user-picked icon always wins). */
export const BOOKING_TYPE_ICON = {
  flight: '✈️',
  hotel: '🏨',
  restaurant: '🍜',
  train: '🚄',
  activity: '🎟️',
  other: '📄',
} as const satisfies Record<BookingType, string>;

/** Glyph per document type, for the Index documents section badges. */
export const DOCUMENT_TYPE_ICON = {
  passport: '📕',
  insurance: '🛡️',
  visa: '🎫',
  other: '📄',
} as const satisfies Record<DocumentType, string>;

/** Icon for a manually added maybe-shelf idea (no icon picker yet). */
export const DEFAULT_MAYBE_ICON = '💡';

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

/** Per-row reveal stagger for the Index bookings filter (ADR-0098 §4 motion): a
 *  chip/search change reveals newly-matching rows with an incrementing
 *  transition-delay instead of an all-at-once flip, capped so a long list
 *  doesn't drag the reveal out. */
export const FILTER_STAGGER_MS = 24;
export const FILTER_STAGGER_MAX_MS = 220;

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

export const TABS = [
  { id: 'home', icon: '🏠' },
  { id: 'map', icon: '🗺️' },
  { id: 'index', icon: '📇' },
  { id: 'days', icon: '📅' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

/** UI iconography (emoji). Icons that are part of a sentence stay in the copy.
 *  Arrows and carets are deliberately absent: they render as SVGs (`ui/Icon`,
 *  `ui/NavArrow`) because the body font has no glyphs for them (design-language). */
export const ICONS = {
  navigate: '🧭',
  ticket: '🎫',
  search: '🔍',
  atm: '🏧',
  wifi: '📶',
  documents: '🛂',
  weather: '🌤️',
  fx: '💱',
  budget: '💰',
  lock: '🔒',
  warn: '⚠️',
  done: '✓',
  edit: '✏️',
  trash: '🗑️',
  restore: '↩️',
  swap: '🔄',
  delay: '⏱️',
  share: '💬',
  clipboard: '📋',
  schedule: '📅',
  toShelf: '📥',
  more: '⋯',
  add: '＋',
  sync: '🔄',
  offline: '📡',
  members: '👥',
} as const;
