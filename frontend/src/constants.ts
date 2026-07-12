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
} as const;
