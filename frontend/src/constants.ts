// App-wide tunables and non-copy literals. UI copy lives in i18n/; domain enum
// values live in @waypoint/shared. Keep magic numbers/strings out of logic.
import type { BookingType, DocumentType } from '@waypoint/shared';

export const MS_PER_DAY = 86_400_000;

/** The device's resolved locale (e.g. "he-IL", "en-US"). Native date inputs
 *  (`<input type="date">`) are formatted by the browser's UI language, not the
 *  document `lang="he"` — so an Israeli device on an English browser would show
 *  a date as mm/dd/yyyy. Pinning the input's `lang` to the device locale renders
 *  it in the device's own convention (mirrors TimePicker's `lang` on native
 *  time inputs). */
export const DEVICE_LOCALE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : 'he';
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;

/** Average Gregorian month — good enough for rounding far-out countdowns,
 *  where a ±1-day error is invisible anyway. */
export const DAYS_PER_MONTH = 365.25 / 12;

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

/** The waking window the day-progress bar spans, in trip-local hours. */
export const DAY_WINDOW = { START_HOUR: 7, END_HOUR: 23 } as const;

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

/** Placeholder row icon on the all-trips list (ADR-0033) — `destination` is
 *  free text, no structured country to derive a real flag from. */
export const DEFAULT_TRIP_ICON = '🧳';

/** Prefix shown before confirmation codes (e.g. #4471). */
export const CODE_PREFIX = '#';

export const DOT_SEPARATOR = '•';

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

export const TABS = [
  { id: 'home', icon: '🏠' },
  { id: 'map', icon: '🗺️' },
  { id: 'index', icon: '📇' },
  { id: 'days', icon: '📅' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

/** UI iconography (emoji). Icons that are part of a sentence stay in the copy. */
export const ICONS = {
  navigate: '🧭',
  ticket: '🎫',
  atm: '🏧',
  wifi: '📶',
  documents: '🛂',
  weather: '🌤️',
  fx: '💱',
  fxUp: '▲',
  fxDown: '▼',
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
