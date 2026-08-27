// App-wide tunables and non-copy literals. UI copy lives in i18n/; domain enum
// values live in @waypoint/shared. Keep magic numbers/strings out of logic.
import {
  BOOKING_TYPE,
  type BookingType,
  type DocumentType,
  type EventCategory,
} from '@waypoint/shared';
import type { NoteHostKind } from './lib/notes';
import type { SnapStop } from './lib/snap-sheet';
import type { IconName } from './ui/Icon';

/** The product's name, for the two screens that show it. Defined in `app-name.ts`, which
 *  `vite.config.ts` also reads for the <title> and the PWA manifest — see ADR-0170 for why
 *  the rename stops at what a person reads. */
export { APP_NAME } from './app-name';

export const MS_PER_DAY = 86_400_000;
/** One minute, for the derivations that are minute-grained on a screen whose clock ticks
 *  every second — a memo keyed on this rebuilds 60 times an hour instead of 3,600. */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60_000;

/**
 * **How long a landing stays under watch** (`lib/land-at-top.ts`, 2026-08-20).
 *
 * It replaces two frame budgets — 10 frames of waiting for a row that was not in the DOM yet
 * (2026-08-06: an arrival from another day widens the list and the row is a commit behind), and
 * 36 frames of waiting out that row's reveal (ADR-0168 §3). Both were bounds on ONE cause each,
 * and the report that retired them is the one neither could see: with the map still loading,
 * the scroller's extent kept growing for **over a second** after the screen mounted — the row
 * opening, the list widening, then the offline-map notice above the split taking 25px off the
 * scrollport a further second later. An aim before the last of those is short.
 *
 * **2.5s is that measurement plus headroom, not a feel call.** The last extent change landed at
 * ~1.8s on a 4×-throttled cold load, and a slower device is slower still; the corrections are
 * themselves eased scrolls, so a couple of them plus a late change is the span this has to
 * cover — at 700ms the reveal case alone still fails. It costs nothing in the ordinary case
 * (two rects a frame, on a screen that already re-renders on the clock), and a person touching
 * the list ends the watch immediately, so the window is never something the user can be
 * fighting.
 */
export const LANDING_WATCH_MS = 2500;

/**
 * **How long a landing waits for the thing it is aiming at to EXIST**, as opposed to how long
 * it keeps the landing true once it does (`LANDING_WATCH_MS` above).
 *
 * They were one number until 2026-08-21, and that conflated two different waits. The 2.5s
 * above is a measurement of a surface *settling*; waiting for one to *arrive* is a different
 * order of magnitude, because Plan mode's day view is a lazy chunk that `land-at-top.ts`
 * measured mounting **~5s in under 6× CPU throttling**. Sharing the budget meant a loaded
 * machine could spend all of it before the row existed and then close the watch, so the
 * landing never happened at all — an `e2e (preview)` failure that took three PRs to catch,
 * because every machine fast enough to have the chunk warm passes.
 *
 * 10s is that 5s measurement doubled. It is affordable in a way the settle window is not: a
 * frame of waiting costs one `querySelector` and no layout, and any touch, wheel or key ends
 * the watch on the spot — so nobody is ever waiting on this, and nothing is fighting it.
 */
export const LANDING_WAIT_MS = 10_000;

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

/** **The locale every date and number in this app is rendered in.** The UI is
 *  Hebrew-only, so the reader's convention is the Hebrew one (`09.08.2026`,
 *  day-first) whatever device the app is opened on — a phone whose region is the
 *  US does not make this a US app. The one name behind every `Intl` formatter
 *  (dates, times, money) and the `lang` on the native date/time inputs, so a
 *  second surface can't quietly render in a different convention (ADR-0176). */
export const APP_LOCALE = 'he-IL';

/** The device's IANA timezone — used only where no trip (and so no
 *  trip-local timezone) is loaded yet, e.g. the boot screen's clock. */
export const DEVICE_TIMEZONE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

/** The device's ISO-3166 region ("IL").
 *
 *  Deliberately NOT `APP_LOCALE`'s region, which is always IL by construction:
 *  this is the one place the app asks where the DEVICE is rather than what
 *  language it speaks, and it feeds exactly one thing — the currency a person
 *  is most likely to think in (ADR-0180 §1/§2), read through the same
 *  `COUNTRY_CURRENCY` table the trip's own currency comes from. A wrong answer
 *  costs a picker tap, which is why a guess is acceptable here and nowhere near
 *  a time.
 *
 *  **`maximize()` is the whole of this, and its absence was a shipped bug.** A
 *  phone set to Hebrew reports `navigator.language === 'he'` — a bare language
 *  with **no region** — so reading `.region` alone answered `undefined` for the
 *  app's entire current audience, and every one of them opened the app with no
 *  home currency at all. (The comment that used to sit here had the rule exactly
 *  backwards: `he` alone carries no region; `he-IL` does.) `maximize()` is
 *  CLDR's likely-subtags, which is precisely the question being asked — "the
 *  device says Hebrew, so where probably?" — and it answers `he → IL`,
 *  `en → US`, `ja → JP`. It only ever fills a blank: a locale that already
 *  names a region keeps it, so an `en-US` phone stays US. */
export const DEVICE_REGION: string | undefined = (() => {
  try {
    const locale = new Intl.Locale(navigator.language);
    return locale.region ?? locale.maximize().region ?? undefined;
  } catch {
    return undefined;
  }
})();
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24;

export const DAYS_PER_WEEK = 7;

/** **The wall-clock a date-only deadline resolves to** (tasks brief §5). "By Thursday" is
 *  discharged any time on Thursday, so the instant is the day's END — storing 00:00 would
 *  make a task due today read as overdue one minute past midnight. `Task.dueHasTime` is
 *  what records that this hour was never typed, so no surface prints it. */
export const DAY_DEADLINE_HHMM = '23:59';

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

/** How often an open tab asks the browser to re-check `sw.js` for a new build
 *  (ADR-0181). The browser only checks on navigation and roughly every 24h, and
 *  this app is a standalone PWA that is left open for days on a trip — without a
 *  poll, a tab opened before a deploy can run the old build for the rest of the
 *  trip. An hour is well under a day and costs one small conditional GET; the
 *  poll is skipped while offline, so a plane costs nothing. */
export const SW_UPDATE_CHECK_MS = 60 * 60 * 1000;

/** The three clocks the automatic build swap runs on (ADR-0185). A waiting build
 *  is **harmless** — the tab keeps a complete, self-consistent old build — so the
 *  only question these answer is when a reload costs the user nothing.
 *
 *  `IDLE_APPLY` is the foreground backstop: the phone is face-up on a table, not
 *  in a hand. Deliberately long, because the cheap moment (the tab going hidden)
 *  fires on every screen lock and app switch and gets there first almost always;
 *  a short one would buy nothing and would reload pages people are reading.
 *  `RECHECK` re-asks the safety question while an update waits — an overlay
 *  closes, a field blurs — and is a slow poll on purpose: this runs only while an
 *  update is pending, which ends in a reload. `NOTICE_AFTER` is when the banner
 *  gives up on staying quiet, so it can only appear after the automatic path has
 *  been blocked for twice as long as the idle rule waits. */
export const SW_UPDATE_IDLE_APPLY_MS = 5 * 60 * 1000;
export const SW_UPDATE_RECHECK_MS = 30 * 1000;
export const SW_UPDATE_NOTICE_AFTER_MS = 10 * 60 * 1000;

/** **The install offer's pressure budget** (ADR-0204 §5) — the "not invasive" half, as
 *  numbers rather than as an intention.
 *
 *  `BUDGET` is how many times the app may raise it UNPROMPTED, ever, per install. Two,
 *  because the two moments worth using say different things: you have just joined a trip,
 *  and the trip is about to start. After that the settings row is the only way in.
 *  Deliberately not one — the second ask is the one that lands, since installing is worth
 *  most when departure is near — and deliberately not three, which reads as pursuit. This
 *  is the one number here that is a judgement rather than a derivation.
 *
 *  `GAP_MS` keeps the two apart: a second ask a day after the first is the same ask.
 *
 *  `DEPARTURE_WINDOW_DAYS` is door B — near enough that offline, notifications and a full
 *  screen are about to matter, far enough to act on before leaving. */
export const INSTALL_ASK_BUDGET = 2;
export const INSTALL_ASK_GAP_MS = 7 * MS_PER_DAY;
export const INSTALL_DEPARTURE_WINDOW_DAYS = 3;

/** How long a self-healing reload suppresses the next one (`lib/lazy-chunk.ts`).
 *  A chunk that 404s because the build swapped underneath the page is cured by
 *  one reload; a chunk that 404s because it was never deployed is not, and
 *  reloading again would spin. Wide enough that a second stale import during the
 *  same swap is not read as a loop, short enough that an unrelated failure hours
 *  later still gets its own cure. */
export const CHUNK_RELOAD_COOLDOWN_MS = 60 * 1000;

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

/** **Bounds on a network read** — every request `lib/api.ts` makes (field reports #20/#22).
 *  An unbounded await is not an error anything can catch (`lib/deadline.ts`): `try`/`catch`
 *  sees nothing, `.catch()` never runs, `res.ok` is never reached. #20 was that on the
 *  document read; #22 is the same silence on the **boot** reads, where a phone with its
 *  radios on and no upstream left the app loading forever — the fallback to cached data
 *  only ever ran on a *rejection*.
 *
 *  Sized as *"this is dead"*, never *"this is slow"*: a bound that fires on a working read is
 *  a worse bug than the hang it replaces, so these are deliberately far above any healthy
 *  one. The body bound is `WS_WATCHDOG_TIMEOUT_MS`'s minute for the same reason it is — that
 *  is how long this app waits before calling silence a failure. */
export const API_TIMEOUT_MS = {
  /** To response HEADERS, not to the last byte — the bytes are `BODY`'s to wait for. */
  FETCH: 20_000,
  /** The bytes themselves, on whatever connection a phone abroad actually has. */
  BODY: 60_000,
} as const;

/** **Bounds on a LOCAL store read** — the caches that sit in FRONT of the network, and so
 *  wedge a read before it ever reaches it. Both are the offline path itself: what the app
 *  falls back TO when the network has nothing to say. */
export const LOCAL_READ_TIMEOUT_MS = {
  /** A Cache API handle: past a few seconds it is jammed, not busy (field-report #20). */
  HANDLE: 3_000,
  /** A whole trip out of IndexedDB — several tables, a few hundred small rows. An order of
   *  magnitude above a healthy read, and still the difference between the offline data
   *  arriving late and a boot that never ends. */
  SNAPSHOT: 10_000,
} as const;

/** **When the base map's wait stops being silent** (field reports #28/#35). The MapLibre canvas
 *  and our DOM markers can exist before any PMTiles ground paints, so the first-tile signal is
 *  guarded by the `withDeadline` heuristic in `lib/deadline.ts`.
 *
 *  **READ THE NAME CAREFULLY: this is no longer a verdict** (ADR-0121's 2026-08-13 amendment,
 *  owner's call). Until then, expiry meant "declare failure and tear the attempt down", and
 *  that is what forced the number UP — sessions 256/257 measured a successful Slow-3G paint at
 *  8.15s and set 20s so a working map could not be killed by its own bound. But the teardown
 *  was the defect: destroying an in-flight map at expiry meant **a load that needed 25s could
 *  never finish**, because every attempt was restarted from zero. Since the attempt now
 *  SURVIVES expiry, crossing this line only changes what the pane SAYS, and a late
 *  `onTilesLoaded` clears it.
 *
 *  That inverts the old asymmetry, so the number comes down hard. Session 256's successes:
 *  **~650ms** warm, **0.9–1.5s** cold, **~2.5s** Fast 3G, **8.15s** Slow 3G (bandwidth-bound,
 *  not CPU-bound — 4× CPU moved it ~500ms). Waiting 20s to say something we could say in
 *  single-digit seconds — and then saying the wrong thing — was the worst of both.
 *
 *  **8s, raised from 4s (owner's call, 2026-08-15):** at 4s the notice was firing on ordinary
 *  loads, and a "slower than usual" that shows up in the usual case is noise. 8s still sits
 *  above every measured success except the Slow-3G edge, which resolves itself anyway — the
 *  notice disappears when the tiles land.
 *
 *  **The cost of being wrong is now one line of muted text**, which is why this is a cheap
 *  number to move. A renderer/protocol construction failure still takes the hard `ErrorState`;
 *  only the first-tile wait routes through here. */
export const MAP_LOAD_TIMEOUT_MS = {
  TILES: 8_000,
} as const;

/** **How long before the map may reload the app again** (ADR-0121's 2026-08-15 amendment).
 *  A dead map is not cured by building another one — six sessions of rebuild loops proved
 *  that, and the owner's verdict was flat: _"Once it's dead, it's dead until you switch to
 *  another app"_. Whatever is broken outlives the map object, so only a new DOCUMENT
 *  clears it, which is also the owner's own workaround: _"restarting the app fixes it"_.
 *
 *  Longer than `CHUNK_RELOAD_COOLDOWN_MS` because the stakes differ: a stale chunk is a
 *  blank app that must come back at once, where a dead map is one broken pane on a screen
 *  whose list still works. Ten minutes is "this session has had its reload", so a device
 *  that loses its GPU repeatedly degrades to a visible error with a manual way out rather
 *  than reloading the app under someone every minute. */
export const MAP_RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

export const MAP_LOAD_PHASE = {
  TILES: 'map-tiles',
} as const;

/** Which await gave up, for `PhaseTimeoutError`. Named rather than inline strings because
 *  callers branch on them: the viewer tells a decode that TIMED OUT (a missing optimization)
 *  from one that FAILED (bytes the browser cannot render), and `isNetworkError` reads a
 *  network phase as "nobody answered" rather than "the server refused". */
export const API_PHASE = {
  FETCH: 'api-fetch',
  BODY: 'api-body',
  /** The boot's wait ON the shared refresh, never the refresh itself — see `auth-state.tsx`. */
  BOOT_REFRESH: 'auth-boot-refresh',
} as const;

export const LOCAL_READ_PHASE = {
  DOC_BLOB: 'doc-cache',
  SNAPSHOT: 'snapshot-cache',
} as const;

/** Decoding is CPU-local and fast; the failure it guards is a decode requested while the
 *  document is hidden (a locked phone mid-load), which never settles at all. */
export const DOC_DECODE_TIMEOUT_MS = 10_000;
export const DOC_DECODE_PHASE = 'doc-decode';

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

/** How many ranked ideas the pool strip keeps (ADR-0116 session-202 §5). This is
 *  what makes the strip's width independent of N: the mockup measured swipes-to-last
 *  going 2 · 10 · 24 at 5 · 18 · 40 ideas, against a constant 3 once capped. The tail
 *  is not hidden — it goes through to the Map's `אולי` facet, the same union by
 *  ADR-0119, and the group header states how many there are in total. */
export const SHELF_POOL_CAP = 5;

/** How many references a selected place's way-in block shows before the rest fold
 *  behind `עוד N` (ADR-0121 §8's 2026-08-05 amendment). Three is what a hub place
 *  needs to stay a card rather than a list: an airport carries a leg per flight plus
 *  a car-hire pick-up and return, and the block sat under the notes and above the
 *  primary action. A reference the clock has passed with nothing said about it is
 *  never folded — that one is a question, and a folded question is not asked. */
export const PLACE_REFS_CAP = 3;

/** The slot-fill sheet's two thresholds (ADR-0116 session-202 §4). The cap is what keeps
 *  the sheet a decision rather than a list — the mockup measured six rows visible
 *  without scrolling at the primary width — and the search only appears once the
 *  pool is big enough to need one, so a shelf of six never grows a control.
 *  Named for the sheet, which serves a gap and a replacement both (ADR-0161 §6). */
export const SLOT_FILL_CAP = 6;
export const SLOT_FILL_SEARCH_AT = 8;

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

/** **How many stops one journey may be authored with** (ADR-0159). A layover or two is a
 *  journey; four is an itinerary, and an itinerary is what the trip itself is for. The
 *  cap is here rather than open-ended because each stop costs a whole step in the form
 *  and a whole booking on save. */
export const MAX_ROUTE_STOPS = 3;

/** **From how many rail nodes a journey's filled nodes summarise** (ADR-0203 §9, corrected
 *  2026-08-24) — at or below this, everything stays open.
 *
 *  Four nodes is TWO stops, and the number is the fold rather than a taste: §9's own table
 *  measures a two-stop journey at 718.5px all-open against a 675px sheet (and 894px at three
 *  stops), while 0–1 stops fit on both a 390×844 and a 360×640 phone with nothing collapsed.
 *
 *  **It shipped at 3, which is one stop, and that was the bug.** A one-stop journey compacted
 *  to fix an overflow it did not have — reported as "the lines collapsing under your fingers
 *  could be a little confusing… maybe do it only when the form is very long". Compaction trades
 *  a control for the line it reads as, so it has to be paid for by height that is actually
 *  there; below the fold threshold it is all cost. */
export const SUMMARISE_FROM_NODES = 3;

/** **How many days forward a single moment may be resolved to** (ADR-0203 §2). A journey's
 *  later moments take the nearest forward instant, and this bounds the search.
 *
 *  It is not a limit on journeys — it is the line past which the input is a mistyped clock
 *  rather than a longer leg. Two days covers every real single leg (the longest scheduled
 *  flight is under 20 hours; a sleeper train or a ferry crosses one night, occasionally
 *  two), and a genuinely longer one is said with the day token's override, which this
 *  function takes as given. Raising it would not enable anything a human cannot already
 *  express; it would only make a typo resolve to something further away in silence. */
export const MAX_JOURNEY_DAY_SPAN = 2;

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

/** Circles the header's people stack draws in total, **you included** — past it
 *  the rest collapse into a "+N" bubble that takes the last slot, so the box
 *  never grows (ADR-0149 §4). Two values because the row is the app's tightest:
 *  at ≤`NARROW_MAX_PX` one circle is given back to the trip name.
 *
 *  It is a count of BOXES, not of co-members: the stack is one control leading
 *  with your own ring since the account avatar merged into it, and the roster
 *  sheet lists everyone, which is what keeps the cap a rendering detail rather
 *  than a truncation (ADR-0133 §9). */
export const PEOPLE_STACK_CAP = { WIDE: 4, NARROW: 3 } as const;

/** The trip name's size ramp in the header chip (ADR-0149 §1/§8). It starts at
 *  17px — the chip is orientation, not a screen title — and `useShrinkToFit` steps
 *  it down from there before the CSS ellipsis ever runs. The FLOOR is the point of
 *  naming this: the hook's default minimum (15px) sits above where this design
 *  needs to reach, so an 18-character name at 390 would clip at a size the loop
 *  refused to go below. */
export const TRIP_NAME_FIT = { maxPx: 17, minPx: 13 } as const;

/** The narrow-phone breakpoint the people stack and the mode control both read.
 *  Mirrored by the `@media (max-width: 370px)` rules in App.css — CSS cannot read
 *  a custom property in a media condition, so the number is stated in both and
 *  named here. */
export const NARROW_MAX_PX = 370;

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
  transit: '🚌',
  car: '🚗',
  activity: '🎟️',
  other: '📄',
} as const satisfies Record<BookingType, string>;

/** **Does `EventForm`'s `יש הזמנה` row open on?** (ADR-0136 §2, amended session 187.) A hotel
 *  you are putting on a day is near-certainly booked; everything else is genuinely either, so
 *  it opens off. This is inference doing the one thing it can do honestly — offering a starting
 *  position, never deciding the fact — and it stops moving the instant a human touches the
 *  row (`bookedTouched`).
 *
 *  **`transport` used to be the second `true`, and ADR-0156 is why it is not.** §2 argued from
 *  _"a hotel or a **flight**"_ and applied the answer to the whole category — defensible while
 *  the third transport pill was, in 0156's own words, lying. Now that `transit` is real, the
 *  category also covers the bus, the ferry, the car hire and the drive, which are mostly not
 *  booked; and the two errors do not cost the same. Wrongly off is one tap. Wrongly on hides
 *  the location field behind a route field, adds ~136px, and performs §3's ONE-WAY conversion
 *  on the next save.
 *
 *  A per-enum `Record` rather than a `cat === 'lodging'` at the call site: the compiler then
 *  flags a new `EventCategory` here instead of silently defaulting it off. It stays
 *  frontend-side because it is a **form default**, not cross-layer vocabulary — the server
 *  never asks this question (`packages/shared/CLAUDE.md`: promote only once a second layer
 *  needs the same values). Its sibling `CATEGORY_TO_BOOKING_TYPE` maps between two shared
 *  enums, which is why that one does live in `@waypoint/shared`. */
export const CATEGORY_DEFAULT_BOOKED = {
  lodging: true,
  transport: false,
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
 *  is also the derived default.
 *
 *  **The third pill is a real type now** (ADR-0156). It used to be `other`, which made the
 *  picker lie in a way nothing on screen admitted: `other` is not route-shaped, so a bus
 *  saved with a single `placeId`, `BookingSheet` never offered it a route field, and it
 *  could never be given one. The glyph had to be spelled `🚌` here rather than taken from
 *  `BOOKING_TYPE_ICON`, because that table said `📄` — a document among two vehicles. Both
 *  of those were the same symptom. `transit` carries `TRANSPORT_PROFILE`, so the glyph comes
 *  from the table like everyone else's and the pill means what it says.
 *
 *  **The fourth pill is a hire** (ADR-0162), and it is here rather than folded into the
 *  third because the question the pills answer is the SHAPE, not just the glyph: a hire is
 *  the one transport mode you drive yourself, so it has no return leg to buy and no
 *  connection to make. 0156 counted car hire under `נסיעה`; nobody looking for it found it
 *  there, which is what this row fixes. */
export const TRANSPORT_BOOKING_TYPES = [
  BOOKING_TYPE.FLIGHT,
  BOOKING_TYPE.TRAIN,
  BOOKING_TYPE.TRANSIT,
  BOOKING_TYPE.CAR,
] as const satisfies readonly BookingType[];

/** Glyph per document type, for the Index documents section badges. ADR-0052 §6's
 *  invariant is unmistakable badges from one source, and the 2026-08-13 set is where
 *  it bit twice.
 *
 *  First: `ticket` wants 🎫, which `visa` was wearing — so a visa takes the passport-
 *  control mark it can now hold without colliding with 📕.
 *
 *  Then `reservation` shipped as 🧾 beside `other`'s 📄 and the invariant failed on its own
 *  terms. Different codepoints, **one silhouette** — two white pages — which is invisible
 *  in this table and unmissable at the 36px a badge is actually read at. The pair was not
 *  even new: `icons.ts` offers both in its *services* group as two options for one idea. So
 *  🛎️, which no other table in the app uses, has no silhouette twin in this set, and covers
 *  all three things `הזמנה` means — a hotel, a table, an RSVP. 📄 stays with `other`: a blank
 *  page is the right mark for a document nobody classified. 📅 was the runner-up and is
 *  refused on sight, because `Icon.tsx` already retired it from two jobs. */
export const DOCUMENT_TYPE_ICON = {
  passport: '📕',
  visa: '🛂',
  license: '🪪',
  ticket: '🎫',
  reservation: '🛎️',
  insurance: '🛡️',
  health: '💉',
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

/** **What a long press IS, app-wide** — two consumers, one number. Originally the
 *  press-and-hold before a shelf card starts dragging (ADR-0116 §5, session-114), and
 *  since ADR-0147 §1 also the hold that drops a pin on the map canvas.
 *
 *  Long enough that a scroll flick never arms a drag, short enough that a
 *  deliberate hold doesn't feel stuck. Matched to Android's own long-press
 *  timeout (`ViewConfiguration.getLongPressTimeout()`, 500 ms) — the delay
 *  before the platform's long-press haptic fires on hold — so the gesture arms
 *  right where it already feels confirmed. `SLOP` is how far a
 *  finger may wander during the hold before we call it a scroll (or, on the canvas, a
 *  pan) and give up.
 *
 *  Shared rather than forked because the justification is the platform's, not the
 *  surface's: a finger is a finger. If the device pass finds the canvas wants its own —
 *  it competes with the renderer's pan, where the shelf competes with a scroll — that is when
 *  it splits, and not before. */
/** **When a note stops being something you read in the list** (ADR-0202 §9c's second round;
 *  owner: _"notes past a certain threshold shouldn't expand at all but open at full screen"_).
 *
 *  The expansion was measured on notes where lifting a two-line clamp adds a little — ADR-0153
 *  §4's +37px short and +89px long. It was never measured on a note that is a document: there,
 *  expanding produces a screen-height wall inside a list row, which loses your place, pushes
 *  every other row off, and leaves the verbs at the bottom of it.
 *
 *  Both numbers are ESTIMATES and named as such, because the alternative is measuring the
 *  rendered box before deciding what to do with a tap, which means rendering it first.
 *  `CHARS_PER_LINE` is `.note-body-line` at 360px and `--text-body` — the design width, so the
 *  estimate errs on the side of more lines on a wider phone, which is the safe direction.
 *  `MAX_LINES` is the point where the expansion takes about half the visible list (~8 lines of
 *  body on top of a ~99px row, against ~540px of list on a 640px screen).
 *
 *  Both want a device pass: they decide which of two containers a tap opens, and the boundary
 *  between them is invisible by construction. */
export const NOTE_ROW_CHARS_PER_LINE = 42;
export const NOTE_INLINE_MAX_LINES = 8;

export const DRAG_HOLD_MS = 500;
export const DRAG_HOLD_SLOP_PX = 8;
/** How far the drag clone sits ABOVE the finger (ADR-0161 §8), so the pointer lands just
 *  below its edge and the target being aimed at is never underneath it. The finger is on
 *  the clone by construction, which is why translucency alone does not answer the report:
 *  a 10.5px seam label still sits under the clone's own text.
 *
 *  Visual only — every hit-test reads the raw `clientX/clientY` — and deliberately small:
 *  `useDragGhost.lift` clones with the grab offset so the clone starts exactly where the
 *  original was, and a full displacement would trade this report for a jump on pick-up. */
export const DRAG_GHOST_LIFT_PX = 12;
/** How long the "swallow the click a completed drag fires" listener stays armed
 *  before disarming itself. Only a fallback: it normally disarms on that click. */
export const DRAG_CLICK_SWALLOW_MS = 400;
/** How long a drag must rest over a day pill before the strip switches to that day
 *  (ADR-0116 session-119) — the spring-loaded-folder idiom. Longer than the hold that
 *  starts the drag: a drag crosses several pills on its way anywhere, and every one it
 *  merely passes over must not open. */
export const DRAG_DAY_DWELL_MS = 700;
/** How near the day surface's inline edge a drag must be held for that rest to mean
 *  "the day beyond this edge" (ADR-0116 §2's 2026-08-22 amendment; owner: _"you could
 *  drag from the edge to a different day"_). The header pill was the only way to reach
 *  another day, and it asks a phone to carry a card up to a ~30px target.
 *
 *  Narrow on purpose, and it is the one number here that is not a preference: the band
 *  has to be somewhere the finger only goes deliberately, because everything else on the
 *  inline axis at that depth is the surface's own padding. Two of these leave ~286px of
 *  neutral middle on a 358px column. The dwell is `DRAG_DAY_DWELL_MS`, shared with the
 *  pill — one answer to "resting somewhere switches the day", wherever you rest. */
export const DRAG_DAY_EDGE_PX = 36;
/** **How far the page is lifted when the edge names a day** (ADR-0116 §2d) — the detent it
 *  stops at, before the dwell decides whether to finish the turn.
 *
 *  It has to clear `--swipe-page-gap` before any of the next day is visible at all (the pane
 *  parks a gutter outside the window), so this is "the gutter, plus a readable sliver": at 48
 *  the gutter is 24 and the sliver is 24. Lower than ~40 and the lift shows the gap and
 *  nothing behind it; much higher and the row under the finger has moved further than the
 *  gesture is worth.
 *
 *  A feel number, and the one this section is most likely to want moved — v1's mistake was
 *  spending the whole dwell travelling this far, which came out at 1.1px per frame and read
 *  as a static offset rather than a motion. It travels in `--t-base` now (~3.2px/frame),
 *  measured in `mockups/a-day-turns-under-a-held-card-v2.html` where it is a control. */
export const DRAG_DAY_LIFT_PX = 48;
/** **How long after a step the opposite band still reads as UNDOING it** rather than starting
 *  a new journey (§2d's repair; owner: _"hard to go back"_). Inside this window a reversal pays
 *  the shortened dwell below; outside it, going back costs what going forward costs.
 *
 *  A window rather than "for the rest of the drag" on purpose: five minutes into a long drag,
 *  a band brushed while aiming should not be a day change with half the warning. */
export const DRAG_DAY_REVERSE_MS = 2_000;
/** The dwell a reversal pays — **half**, and derived rather than typed so the two cannot drift
 *  apart. Undoing a step you can still see is a correction, and `design-language.md` says a
 *  correction is quicker than the thing it corrects; the lift and the turn are unchanged, so
 *  what shortens is only the hold. */
export const DRAG_DAY_REVERSE_DWELL_MS = DRAG_DAY_DWELL_MS / 2;

/** ── AN ANCHORED PANEL'S PLACEMENT (ADR-0144) ────────────────────────────────────────
 *  `IconPicker` opens below its trigger, which is right in a form that scrolls under a
 *  header — and wrong in the Map's place card, which is anchored to the BOTTOM of the
 *  canvas: the panel ran off the screen and the report was that it is cut off. So the
 *  side is **measured** rather than assumed, and the panel is capped to the room it has.
 *
 *  `GAP` is the 6px the CSS already puts between trigger and panel and must stay in step
 *  with it; `EDGE` is how close to the viewport's own edge a panel may come.
 *
 *  **There is deliberately no minimum height.** A floor was tried and it was the bug again:
 *  on a 360×640 Android with the keyboard up neither side has 180px, so a floor made the
 *  panel taller than the space and clipped its own title — which is the report, moved. The
 *  cap is what the side HAS, and a short panel scrolls its grid (a region that already
 *  scrolls) rather than being cut. */
export const ICON_PANEL_GAP_PX = 6;
export const ICON_PANEL_EDGE_PX = 8;

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
/** The band the pane reserves for attribution at the bottom-inline-start of the canvas, so
 *  anything floating there clears it by its own height — a named clearance, not a hand-tuned
 *  offset (ADR-0122 §7). It was Google's logo and terms link, which its ToS forbade obscuring
 *  (ADR-0106 §B); since ADR-0186 §2 the band holds `.map-attrib`, which we draw ourselves
 *  because MapLibre's own control ignores an RTL page — and OSM's ODbL attribution is no more
 *  optional than Google's was. */
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

/** **How long the card's stop track must be still before the selection follows it**
 *  (ADR-0182 §10). Selecting pans the live map, so it happens once the
 *  scroll has settled and never per frame. Long enough to sit out a snap's own tail,
 *  short enough that the map is not visibly late — a feel call the device pass owns. */
export const MAP_TRACK_SETTLE_MS = 120;

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

/** **Stepping a full surface one page with a swipe** (ADR-0200, `lib/useSwipePager.ts`).
 *  Six numbers, and the first three are the arbitration rather than the feel:
 *
 *  - `SLOP_PX` — **the travel below which nothing here is a swipe**, and it answers that
 *    question twice (§9). It is the MOUSE's claim gate, where there is no browser pan to
 *    lose and so no reason to decide early; and it is the floor a **flick** still has to
 *    clear, so a thumb rolling 8px off a tap cannot page the day however fast it rolled.
 *    The whole day surface is the target and it is nothing but controls (cards that expand,
 *    rows that hold-drag, ticks), so the floor `SNAP_DRAG_SLOP_PX` sets for a 51px region
 *    has to be much higher here: 4px would swallow a tap on every one of them.
 *    **On touch it is no longer the claim gate** — the axis is already forfeited at
 *    `DECIDE_PX`, so holding the follow back to 24px bought a dead zone and a lurch, not
 *    safety (§9, measured).
 *  - `AXIS_RATIO` — how much more horizontal than vertical the travel must be. The surface
 *    lives inside the body's vertical scroller, so the two gestures share a start point and
 *    only their direction separates them. Above the ratio it is a page step; below it the
 *    browser keeps the pan.
 *  - `DECIDE_PX` — how far the finger travels before that ratio is asked, and it is UNDER
 *    Chrome's own ~8px touch slop deliberately. The browser claims a touch for scrolling at
 *    its slop in whatever direction, so the axis has to be answered before then or the
 *    gesture is cancelled out from under us (measured — see `useSwipePager`'s `touchMove`).
 *    Low enough to beat the slop, high enough that a still finger's jitter decides nothing.
 *  - `COMMIT_SHARE` — the share of the surface's width that commits **a deliberate drag**,
 *    so the gesture asks the same effort of a 360px phone and a 640px desktop column. A
 *    flick commits under it: that is `SNAP_FLICK_PX_PER_MS`'s job, one flick threshold for
 *    the whole app (§9, and the owner reported the sheet's version of it first).
 *  - `EDGE_RESIST` / `EDGE_MAX_PX` — the rebuff. With nowhere to go the surface still
 *    follows the finger, at a fraction of it and no further than the cap: it strains,
 *    is arrested, and is pulled back to level on release. Same statement `BEAT.PINNED`
 *    makes about a row that cannot be dragged (ADR-0199 §2), made continuously by the
 *    gesture itself rather than played at it — which is why there is no beat here. */
export const SWIPE_PAGER = {
  SLOP_PX: 24,
  AXIS_RATIO: 1.4,
  DECIDE_PX: 6,
  COMMIT_SHARE: 0.22,
  EDGE_RESIST: 0.28,
  EDGE_MAX_PX: 40,
  /** **A frame of slack on any wait that has to outlast a transition** (ADR-0116 §2d's third
   *  repair). `setTimeout` is not the clock a transition runs on: it can fire a millisecond
   *  before the last frame of one, and giving the surface back one frame early cancels it. The
   *  wait is anchored to a `requestAnimationFrame` for the same reason — that IS the rendering
   *  clock — so this only has to cover the timer's own imprecision. */
  SETTLE_SLACK_MS: 16,
} as const;

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

/** **The one-finger zoom: a double-tap whose second finger stays down** (ADR-0145).
 *
 *  There is no flag for this. The Maps JS API's whole `MapOptions` surface carries no
 *  one-finger-zoom option, `gestureHandling="greedy"` is documented as pan-or-zoom with
 *  no gesture named beyond pinch and double-tap, and the owner confirmed on a device that
 *  nothing happens today — so the gesture is built rather than enabled, the way MapLibre
 *  and MapTiler build it. It is documented only for the Maps SDK for Android/iOS.
 *
 *  - `TAP_GAP_MS` / `TAP_SLOP_PX` — the double-tap window. Too wide and an unrelated
 *    second tap arms the gesture; too narrow and it never fires. Device-pass tunable.
 *  - `DRAG_SLOP_PX` — what separates "this is a drag" from "this is a double-tap". The
 *    same load-bearing threshold as `SNAP_DRAG_SLOP_PX` one layer along and for the same
 *    reason: a finger emits `pointermove` on a tap, so a gesture that commits on the
 *    first move cannot tell the two apart at all.
 *  - `PX_PER_LEVEL` / `MAX_SHARE` — **how far the finger travels for one zoom level, in
 *    ABSOLUTE px, capped so a short canvas stays usable.** This started life as a pure
 *    share of the pane's height and **that model was backwards** — see below, because the
 *    mistake is more instructive than the number.
 *  - `MIN` / `MAX` — the fallback range when the map states no `minZoom`/`maxZoom`, which
 *    is the case here on purpose (ADR-0128 §1 clamps `MAX_FIT` *after* the fit rather
 *    than as the map's own `maxZoom`, precisely so the pinch stays unbounded). The
 *    gesture is then bounded exactly as the pinch is.
 *
 *  **Why sensitivity is NOT a share of the canvas, though a pin's size is** (device pass,
 *  2026-07-30 — owner: _"the more space the map takes of the screen, the more the drag
 *  feels slow"_). The first cut reasoned by analogy from ADR-0123 and it is a **false
 *  analogy**, which is the part worth keeping:
 *
 *    • A pin's SIZE is a share of the canvas because a pin is a **visual** element
 *      competing for canvas area — a bigger canvas should carry a proportionally bigger
 *      pin.
 *    • A drag's SENSITIVITY belongs to the **finger**, and a finger does not scale with
 *      the canvas. A comfortable thumb stroke is the same distance whether the map is
 *      243px tall or 501px.
 *
 *  So the share made the map extreme demand 250px per level against `half`'s 122px —
 *  i.e. **the more map you gave it, the heavier it got**, which is exactly backwards from
 *  the intuition that a taller canvas has "more room to drag".
 *
 *  `PX_PER_LEVEL` (120) is therefore a **calibrated** number, not a derived one: it is
 *  `half`'s canvas on the owner's phone (~243px × 0.5 ≈ 122, rounded), the one stop that
 *  felt right. `MAX_SHARE` (0.5) is only a **safety cap for short canvases** — at
 *  360×640's 160px `half` pane (ADR-0126's measurement) a flat 120 would demand 75% of
 *  the canvas per level and be *worse* than before, so there the cap binds and holds
 *  today's behaviour. It binds below ~240px and nowhere above it.
 *
 *  **Down zooms IN** (owner's call on the mockup, 2026-07-30, and Google's Android page
 *  documents the same mapping — slide up zooms out, slide down zooms in). The design had
 *  reasoned its way to the opposite from this screen's own "up means more", since dragging
 *  up grows the sheet (ADR-0122 §4). Recorded because that argument is good enough to be
 *  made again. */
export const MAP_DRAG_ZOOM = {
  /** Raised 300 → 500 and 24 → 44 after the device pass reported the gesture sometimes
   *  not being recognised at all, leaving the renderer to pan instead. A double-tap that
   *  *keeps its finger down* is slower and sloppier than a double-click: the second press
   *  is deliberate, so it lands later and further away. **44 is ADR-0017's touch floor**,
   *  which makes it the principled number rather than a guessed one — two presses inside
   *  one touch target's width are, by the app's own definition of a finger, in the same
   *  place. Erring generous is right here: a false positive costs one unasked-for step
   *  zoom, where a false negative costs the whole gesture. */
  TAP_GAP_MS: 500,
  TAP_SLOP_PX: 44,
  DRAG_SLOP_PX: 6,
  PX_PER_LEVEL: 120,
  MAX_SHARE: 0.5,
  MIN: 2,
  MAX: 21,
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

/** **What the camera does about a settled set of search results** (ADR-0168 §1).
 *
 *  ADR-0131 §5 kept the query out of `cameraSignal` because a query is a STREAM where a
 *  chip is one discrete act, and that argument is unchanged — it just described the wrong
 *  event. A *keystroke* is the stream; a *settled Text Search response* is discrete, and
 *  it is already gated by the min-chars floor and the pause debounce, so there are far
 *  fewer of them than there are keystrokes.
 *
 *  - `SPREAD_CAP_DEG` — wider than this and the results are not "an area" any more, so
 *    fitting them all would trade a frame you cannot read for a frame you cannot read
 *    either. Past it the camera frames the TOP-ranked result among its own cluster
 *    instead, through `focusBoundsFor` (ADR-0129 §2). ~2° of latitude is roughly 220km:
 *    a city and its outskirts fit inside it, `דואומו` across four Italian cities does
 *    not. In degrees of latitude, the unit the bounds are built in, like `MAP_FOCUS`.
 *  - `FITS_AT_ZOOM_SHARE` — how much of the current view the extent may claim and still
 *    count as "it fits at the zoom you are on", i.e. pan rather than re-fit. Below 1 so
 *    the results land with air around them rather than exactly on the edges, where a pin
 *    under the controls row is indistinguishable from a pin off-screen.
 *
 *  Both are derived and both join the device-pass cluster: how much unasked-for movement
 *  reads as helpful rather than as a headache is a judgement only a phone settles, and
 *  the owner's own framing of this report was "careful not to pan too much". */
export const MAP_SEARCH_CAMERA = { SPREAD_CAP_DEG: 2, FITS_AT_ZOOM_SHARE: 0.8 } as const;

/** **The camera's own animation** (ADR-0129 §3). Written when smooth movement was not
 *  something the API could be asked for — Google animated `fitBounds` "depending on an
 *  internal heuristic" and `panTo` only for short moves — and kept for a reason that outlived
 *  that one: MapLibre eases perfectly well, and a second easer underneath ours would be two
 *  drivers on one map. So the move stays ours, `moveCamera` once per frame, and the adapter
 *  binds it to `jumpTo` rather than `easeTo` (`map-camera-adapter`).
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
 *  `COLOR` is PER THEME, and the reason is a small cautionary tale. It used to be
 *  one value mirroring `--soft-line`'s light entry, with a comment saying "keep
 *  the two in step" — and nothing could, because this is a TypeScript constant
 *  and the Maps JS API takes a colour value, not a CSS variable. So it sat out
 *  the entire dark-mode remap that re-mapped `--soft-line` beside it, and no CSS
 *  sweep could see it. On the night style's land (`#191E2C`) the shipped value
 *  measured **1.01:1** — invisible, which is exactly how it was reported.
 *
 *  It also no longer mirrors `--soft-line`, deliberately: that token is a
 *  hairline on a card, and this is a 2.5px dash over a map canvas. A graphic owes
 *  3:1 against what it crosses, and `--soft-line`'s alpha does not reach it —
 *  light measured **1.77** on the day land, so this was under the floor before
 *  dark mode existed. Both values below are the lowest alpha that clears 3:1,
 *  because ADR-0106 §C's quiet base is still the intent: 3.03 light, 3.5 dark. */
export const MAP_CONNECTOR = {
  COLOR: {
    light: 'rgba(22, 35, 61, 0.5)',
    dark: 'rgba(231, 234, 242, 0.42)',
  },
  WEIGHT: 2.5,
  /** **A real dash at last** (ADR-0186 §2). The Maps API had no `strokeDasharray`, so
   *  ADR-0121 §10 faked one as a repeating symbol along a fully transparent stroke —
   *  `DASH_SCALE`/`DASH_REPEAT`, both now deleted with the hack. MapLibre's `line-dasharray`
   *  is in LINE WIDTHS, not pixels: at `WEIGHT` 2.5 this is a ~5px dash and a ~5px gap, which
   *  is what the symbol version measured out to. */
  DASH: [2, 2],
  /** **The drawn route** — ADR-0206 §D1's "solid + amber", the treatment the dash above has
   *  been reserving. One leg at a time (§D8): five solid amber lines on a phone is the fight
   *  ADR-0121 §9 says the pins must win.
   *
   *  **It cannot be one value, and that is measured** (ADR-0206 §Z5 §M3). Solid `--amber`
   *  (`#e9a63c`) is **1.72:1** on the day ground (`earth #eee8dc`) — under the 3:1 a graphic
   *  owes what it crosses. So the pair is amber's paper variant on paper and amber itself on
   *  the night ground: `--amber-deep` **4.50:1** light, dark-theme `--amber` **7.01:1** on
   *  `earth #343027`. No new hue is minted (ADR-0158 §6). Hex rather than a CSS variable for
   *  the same reason `COLOR` above is, and it takes the same `scheme` the ground was painted
   *  from so the two cannot disagree after a theme flip.
   *
   *  Heavier than the dash and round-jointed because it is the opposite claim: this IS the
   *  path, drawn from the provider's own geometry, and a many-vertex line on mitre joins
   *  spikes at every turn. */
  ROUTE: {
    COLOR: {
      light: '#915e1e',
      dark: '#f0b254',
    },
    WEIGHT: 3.5,
  },
  /** **A DECLARED תחב״צ LEG DRAWS ITS OWN STRAIGHT SEGMENT** (ADR-0206 §AA4's 2026-08-27
   *  amendment, styled in §AL6 and drawn in `mockups/the-mode-set-and-transit-declared-v1.html` §4).
   *
   *  **Why it exists at all:** the map was drawing a ROAD ROUTE between a declared leg's two ends
   *  whenever the pair sat under the mode's ceiling — §Z5's own worked example, Senso-ji → Tokyo
   *  Station at 4.6 km, well inside walking's 15 km. A road polyline for a rail journey is a false
   *  claim about the PATH, which is the same failure as the false NUMBER the declaration silences.
   *  Drawing nothing is also wrong: a declared leg is a journey that happens.
   *
   *  **Three channels separate it from the un-routed dashed connector, and it needs all three**,
   *  because being mistaken for that fallback is its one real failure mode — "this is not a road
   *  journey" and "we could not route this" are different statements. The shape cannot help:
   *  `MapDayLeg.path` is documented as either the routed path or the straight segment, so the two
   *  are the same geometry by construction. So: the ROUTE's amber (time and commitment, the
   *  strongest channel — 4.50:1 light / 7.01:1 dark on the real ground against the connector's
   *  3.01/3.25), the ROUTE's weight, and a LONG dash against the connector's 5/5 stipple.
   *
   *  **`CAP: 'butt'`, deliberately unlike `ROUTE`'s round, and the measurement is why.** A round cap
   *  adds half the stroke at each end of EVERY dash — 3.5px at this weight — so a 4.2px gap becomes
   *  0.7px and the line reads nearly solid, i.e. it asserts the very path it exists to disclaim.
   *
   *  **The weight and the rhythm do NOT ride §D8's amber ration**: if they did, a declared leg that
   *  is not the asked-about one would fall straight back to reading as the fallback. The ration
   *  governs hue and opacity; the structure is the leg's own. */
  TRANSIT: {
    /** In LINE WIDTHS like every `line-dasharray` here: at `ROUTE.WEIGHT` 3.5 this is a 10.5px
     *  dash and a 4.2px gap. */
    DASH: [3, 1.2],
    CAP: 'butt',
  },
  /** **A leg not being asked about recedes** (ADR-0206 §AC2). Opacity and weight, never a second
   *  hue — the budget has none to spare (root rule 4). `NEAR_WEIGHT` is the departing leg of a
   *  selected stop: prominent without spending amber a second time. */
  DIM_OPACITY: 0.45,
  NEAR_WEIGHT: 3.5,
  /** **Where a leg's end mark sits, in SCREEN pixels** (ADR-0206 §AC3).
   *
   *  A plain gap here does nothing — that is measured, not assumed: the dash is 5px on and 5px
   *  off, so a collar under ~3× that reads as one more dash. What marks the end is `DOT` below;
   *  this is only how far back from the stop it sits, so the pin's own tip does not cover it.
   *
   *  **Pixels, which is why `DayConnector` re-trims on a zoom.** A constant in metres would be
   *  invisible at country zoom and enormous at street zoom — the collar has to hold its size on
   *  screen, and that makes the trimmed geometry a function of the camera. */
  COLLAR_PX: 9,
  /** **The most of one end SEGMENT the collar may eat.** The setback is cosmetic and the path is
   *  a claim, so the trim shortens the leg's final straight and is never allowed to reach the
   *  vertex behind it — a vertex is a turn the route actually makes. Without this the trim spent
   *  its pixels by deleting points, which is invisible at street zoom and a lie at trip zoom
   *  where ⁦9px⁩ is hundreds of metres: it erased a route's last turn, and on a leg shorter than
   *  two collars it erased the leg. A half rather than the whole so a very short leg still reads
   *  as a line rather than collapsing to a dot. */
  COLLAR_MAX_SEGMENT: 0.5,
  /** **How far the zoom must move before the collar is re-derived.** The trim is in screen
   *  pixels, so a zoom makes it wrong — but re-deriving on every `zoomend` mutates the style
   *  exactly as the app settles after a camera fit, which measurably starved the main thread
   *  (`place-know.spec.ts`: ⁦38s⁩ → ⁦1.1m⁩, with its stability assertions failing). Under half a
   *  level the setback is still visually a setback, so this is the threshold below which the
   *  redraw is simply not worth its cost. */
  COLLAR_REDRAW_ZOOM: 0.5,
  /** The mark itself: a filled dot, the one thing a dashed line cannot accidentally produce. */
  DOT: { RADIUS: 3, RADIUS_ROUTE: 3.4 },
  /** **The unrouted tail between a stop and where it meets the network** (ADR-0206 §AC5).
   *  Dotted rather than dashed (a 0-length dash with round caps IS a dot), thinner, and slightly
   *  faded: it is the one line on the canvas that is deliberately not a route.
   *
   *  `MIN_PX` is the gap below which there is nothing worth drawing — most stops snap within a
   *  metre, and a 2px tail is noise. Screen pixels for `COLLAR_PX`'s reason. */
  STUB: { WEIGHT: 2.5, DASH: [0.04, 2], OPACITY: 0.9, MIN_PX: 16 },
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

/** `--ease-arrive` as a literal, for the Web Animations API — which takes a value, not a
 *  CSS variable. Same pairing as `LIST_MOVE_EASING` beside the reveal's duration; keep
 *  the two in step with `tokens.css`. */
export const EASE_ARRIVE = 'cubic-bezier(0.22, 1.16, 0.36, 1)';

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

/** The trip handoff (`lib/trip-handoff.ts`, ADR-0140 §7). The flight's own duration is
 *  `--t-deliberate` off the ramp — these two are the parts the ramp cannot answer.
 *
 *  `STRAND_MS` bounds the WAIT, which is the one thing about this gesture nothing can
 *  predict: the glyph is picked up before the trip shell exists, and how long that takes
 *  is a boot fetch. `TILE_FADE` is the FRACTION of the flight the tile's fill takes to
 *  dissolve — early enough that the last stretch of the travel is already the bare glyph
 *  the pill will receive, late enough that the object visibly leaves the list as a tile. */
export const TRIP_HANDOFF = {
  STRAND_MS: 1200,
  TILE_FADE: 0.6,
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

/** **How long a place name may be on a day row that ALSO carries a booking code**
 *  (ADR-0159's build; extends ADR-0152 §6c's rule with the case it did not cover).
 *
 *  That rule drops the place name when the row carries a code AND a note mark,
 *  because the line is exactly full at 390px and `ש..` is noise rather than
 *  information. The uncovered case is a code and a LONG NAME with no mark at all:
 *  a flight's meta carries its destination's full official name
 *  (`נמל התעופה דובאי (DXB)`, `routeDisplay`), which beside `הזמנה #EK319`
 *  ellipsised down to a single letter — the exact stub that rule exists to prevent.
 *
 *  A character count and not a measurement, for the reason `ROUTE_INLINE_MAX_CHARS`
 *  above gives: the Trip card and the builder row have different room, and one
 *  threshold on the same input keeps them from disagreeing about the same flight. */
export const META_PLACE_MAX_CHARS = 13;

/* ── The top chrome's condense (ADR-0149 §7) ──────────────────────────────────
   Read by `lib/chrome-condense.ts`, which is where the reasoning lives. */

/** Scrolled past this, row 1 rides out. */
/** What a full condense gives back to the body: 160px of chrome becomes 108px. It
    is also the scroll distance the collapse is spread over — the chrome handing
    back exactly what the finger took is what makes it track rather than jump. */
export const CHROME_CONDENSE_FREES_PX = 52;
/** Below this much to scroll, the chrome never starts giving way: a page with barely
    more content than a screen would spend its whole scroll on the header. Judged on
    the EXPANDED height, since the live slack shrinks as it collapses.

    TWICE what the condense frees, plus a margin, and the factor is load-bearing: the
    chrome may not be more collapsed than the offset it was scrolled by, so a fully
    condensed chrome needs `CHROME_CONDENSE_FREES_PX` of scroll left UNDER it. One
    times over, the closed state would pull itself open the moment it arrived. */
export const CHROME_CONDENSE_MIN_SLACK_PX = CHROME_CONDENSE_FREES_PX * 2 + 12;
/** How far you must scroll UP before the chrome starts coming back. Collapsing
    follows the finger from the first pixel; expanding deliberately does not, or
    every small upward correction mid-read drags the header back down over what you
    are looking at. Asymmetric on purpose — the same asymmetry Facebook's bar has. */
export const CHROME_EXPAND_ARM_PX = 32;
/** Quiet time after the last scroll event that counts as "the gesture ended", at
    which point a part-collapsed chrome snaps to whichever end it is nearer. Long
    enough to outlast the gap between frames of a slow drag, short enough that the
    snap reads as part of letting go. */
export const CHROME_SNAP_IDLE_MS = 120;

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
/** **What KIND of thing a note's host chip points at** (ADR-0153 §4). An `Icon`, not an
 *  emoji, for the same reason `.link-cue` is one: it CLASSIFIES the row's subject, it is
 *  not the thing's own face — the badge beside it stays emoji, which is the category's own
 *  vocabulary (ADR-0038/0138). Exhaustive over the five hostable kinds, so a sixth host is
 *  a compile error here rather than a chip with no mark. */
export const NOTE_HOST_ICON = {
  event: 'clock',
  booking: 'ticket',
  place: 'pin',
  maybeItem: 'shelf',
  document: 'documents',
} as const satisfies Record<NoteHostKind, IconName>;

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
  /** Leaving is something you do to YOURSELF — the door. Removing a member is
   *  `removeMember`: one verb per subject, the split ADR-0138 keeps making. */
  leave: 'exit',
  removeMember: 'userMinus',
  close: 'close',
  clock: 'clock',
  /** A task's `important` flag (tasks brief §7) — shape and weight, never a hue, because
   *  rule 4 has no colour left to spend on priority. */
  star: 'star',
  /** Dismissing a task: it stopped mattering, which is not the same as doing it. Shares
   *  the glyph with a skipped event, which is the same idea one surface over. */
  skip: 'skip',
} as const satisfies Record<string, IconName>;

/** **How many tasks the Trip Home band shows before it stops** (ADR-0188 §6). Three, drawn
 *  and measured at 242px — one section's worth of space, not a second screen's. The rest
 *  arrive through the band's own overflow row, which is one more row in the same card rather
 *  than a second control. Still owed to the device pass, and two characters to change. */
export const TRIP_HOME_TASK_BAND_CAP = 3;

/** **How many tasks the LIFTED HERO shows on one stop** (ADR-0160 §U5, amended 2026-08-16 on
 *  the owner's call: _"it is limited to showing only one task. It should be 3"_). §U5 chose
 *  ONE on `פתק`'s rule — the hero shows one note and says how many it is not showing — and the
 *  amendment's point is that the rule was borrowed from the wrong neighbour: a note is prose
 *  you read, so a second one is a second thing to read, while a task is an OBLIGATION, and
 *  three of them on the stop you are standing at is the answer to "what do I still owe here".
 *  Deliberately the same number as the Trip Home band above, so the two task surfaces cap
 *  alike and neither has to be re-argued; the overflow line (`ועוד N`) is unchanged. */
export const HERO_TASK_CAP = 3;

/** **How far ahead the Home bands look** (owner, 2026-08-16: tasks should appear "up to 7
 *  days — good time — before they're due"). ADR-0188 §6 and brief §13 said *due today and
 *  overdue*, which is the right window for a band you read ON the day and the wrong one for
 *  anything you have to prepare for: a task due Friday is not actionable on Friday, it is
 *  actionable now. Overdue is always included regardless. */
export const TASK_BAND_LOOKAHEAD_DAYS = 7;

/** **How many rows Plan Home shows before folding** — the inline list AND the lifted hero
 *  (ADR-0193 §3/§4, amended 2026-08-16). Five, not `HERO_TASK_CAP`'s three: the trip hero's
 *  cap is per STOP — three is "what do I still owe here" — while this is the whole run-up to
 *  a departure, so it can afford a list. The remainder is always stated, never dropped.
 *
 *  ONE constant for both, because it is one question about one list. The inline list reached
 *  it late: it used to fold by a semantic near/far rule, which could leave zero rows visible
 *  and did — see `PlanHome`. */
export const PLAN_TASK_CAP = 5;
