// App-wide tunables and non-copy literals. UI copy lives in i18n/; domain enum
// values live in @waypoint/shared. Keep magic numbers/strings out of logic.

export const MS_PER_DAY = 86_400_000;

/** How far a "delay" verb pushes an event. */
export const DELAY_STEP_MINUTES = 30;

/** Toast auto-dismiss. */
export const TOAST_DURATION_MS = 3600;

/** Live-clock tick. */
export const CLOCK_TICK_MS = 1000;

/** The waking window the day-progress bar spans, in trip-local hours. */
export const DAY_WINDOW = { START_HOUR: 7, END_HOUR: 23 } as const;

/** ponytail: fixed demo slot a scheduled maybe-item lands on (matches the mockup);
 *  a real scheduler opens a time picker. Trip-local wall time. */
export const DEFAULT_SCHEDULE_SLOT = { START: '17:30', END: '18:30' } as const;

/** Characters used to build the trip's initial from a display name. */
export const AVATAR_INITIAL_LENGTH = 1;

/** Icon for a manually created event when the form doesn't collect one (T-047). */
export const DEFAULT_EVENT_ICON = '📌';

/** Prefix shown before confirmation codes (e.g. #4471). */
export const CODE_PREFIX = '#';

export const DOT_SEPARATOR = '•';

/** Active-trip override — per-device, not synced (ADR-0021). */
export const ACTIVE_TRIP_STORAGE_KEY = 'wp_active_trip_id';

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
  schedule: '📅',
  add: '＋',
  sync: '🔄',
  offline: '📡',
} as const;
