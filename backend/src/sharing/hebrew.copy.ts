import {
  ROUTE_ARROW,
  bindPrefix,
  tripRangeShape,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  type BookingType,
  type LegTravelMode,
  type ShareDaypart,
} from '@waypoint/shared';

/** The app's own product locale. It is `frontend/src/constants.ts`'s `APP_LOCALE` by value
 *  and not by import — the backend cannot reach across the workspace (TS2835), which is the
 *  same constraint this whole file exists under. */
const HE_LOCALE = 'he-IL';

/** UTC, always: these are calendar dates, not instants to localise. */
const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(HE_LOCALE, { ...opts, timeZone: 'UTC' });

/** The same en dash `frontend/src/lib/time.ts` puts in a range, and not an em dash — root
 *  `CLAUDE.md` forbids those in UI copy. */
const EN_DASH = '–';

/**
 * **The backend's Hebrew, all of it, and why it is here rather than in
 * `frontend/src/i18n/he.ts`.**
 *
 * ADR-0009 puts product copy in the frontend and this repo keeps it there — but some product
 * output is rendered by a Node process that cannot import a React app's i18n module, and it
 * has to be in Hebrew for the same people the screen is. There are **two** such renderers
 * now: the itinerary PDF (ADR-0213), and the link-preview meta tags a chat's crawler reads
 * before anyone opens the app at all (ADR-0220 — the crawler runs no JS, so the shell has to
 * be answered with its `og:*` already in it). That is the constraint, not a preference.
 *
 * The file was `itinerary-pdf.copy.ts` until the second consumer arrived. **The name moved
 * rather than the words** because the invariant below is what makes the duplication safe,
 * and a second Hebrew file in the backend would have quietly ended it.
 *
 * **It is deliberately not guarded by a cross-package test.** The obvious one — import
 * `frontend/src/i18n/he.ts` here and assert the daypart words match — makes the backend's
 * own `tsc` build reach across the workspace, which it refuses (TS2835) and should: a
 * server that cannot compile without the React app is a worse problem than two copies of
 * six words. What keeps this honest instead is that it is the ONLY Hebrew in the backend
 * and it is all in this one file, so renaming a daypart on screen means changing exactly
 * one other place, named here.
 *
 * Everything that is *data* — day titles, event titles, place names, counts — arrives in the
 * projection and is not repeated here.
 */
/**
 * **An elapsed span, in the app's own words** (owner, 2026-08-31: _"Time spans always read as
 * minutes, even when long. For example the layover is 260 minutes instead of 4 hours 20"_).
 *
 * The same ladder and the same five strings as `t.eventForm.dur*`, which `lib/duration.ts`
 * reads on the screen: minutes below an hour, `H:MM שע׳` above it, with words for the exact
 * one- and two-hour rungs. It is a second copy for the reason this whole file is one — the
 * backend cannot import a React app's i18n — and it is named in that file's comment so the
 * pair cannot be reworded apart.
 */
export function pdfSpan(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}:${String(m).padStart(2, '0')} שע׳`;
  if (h) return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return `${m} דק׳`;
}

export const PDF_COPY = {
  /** **A journey's header names where it ENDS** (ADR-0213 ninth amendment §1) — the legs
   *  beneath it already spell the route out, and repeating it above them put the same two
   *  airports on the card three times.
   *
   *  `bindPrefix` from `@waypoint/shared`, the same call the screen makes: `לקפלאוויק` binds
   *  and `ל-Keflavík` takes the maqaf, and it looks past the bidi controls the caller has
   *  already wrapped the value in. One decision, not one per renderer. */
  journeyTo: (place: string) => `טיסה ${bindPrefix('ל', place)}`,
  /** How many flights the block holds, so the header says what it contains. */
  journeyLegs: (count: number) => (count === 2 ? 'שתי טיסות' : `${count} טיסות`),
  brand: 'Travelive',
  eyebrow: 'מסלול משותף',
  scheduleTitle: 'הלו״ז',
  scheduleHint: 'חלקי יום · שעות · מקומות · נסיעות',
  summaryTitle: 'המסע במבט אחד',
  summaryHint: 'אירועים לפי חלקי היום, בלי שעות',
  // Split rather than a `page(n, total)` function: the two numbers are Chromium's, written
  // into `<span class="pageNumber">` / `<span class="totalPages">` by the paginator, so the
  // words around them have to be able to sit either side of a placeholder.
  pagePrefix: 'עמוד ',
  pageOf: 'מתוך ',
  updatedAt: 'עודכן',
  /** Names the strip beside the QR, which used to carry a second copy of the trip's title
   *  and so read as an unexplained list (owner, 2026-08-30). */
  routeLabel: 'המסלול',
  days: (count: number) => `${count} ${count === 1 ? 'יום' : 'ימים'}`,
  events: (count: number) => `${count} ${count === 1 ? 'אירוע' : 'אירועים'}`,
  stops: (count: number) => `${count} ${count === 1 ? 'אזור' : 'אזורים'}`,
  /** **The two counts somebody planning against this page uses.** `אזורים` was
   *  `routeStopCount` — pins, which on a ring road equals the number of stops. */
  nights: (count: number) => `${count} ${count === 1 ? 'לילה' : 'לילות'}`,
  bookings: (count: number) => `${count} ${count === 1 ? 'הזמנה' : 'הזמנות'}`,
  /** What the trip IS, under its name — replacing the first-place → last-place line that
   *  named two transit airports on any trip you fly to. */
  // **The prefix binds to a Hebrew word and takes a hyphen only before a foreign one**
  // (owner, 2026-08-31: _"No need to connect ב to Iceland with a dash. It could be
  // באיסלנד"_). The comment that used to sit here argued for an unconditional hyphen and was
  // half right: `ב-Iceland` IS the convention before Latin, and `ב-איסלנד` is simply wrong
  // before Hebrew. `bindPrefix` decides per value.
  what: (days: number, destination: string) => `${days} ימים ${bindPrefix('ב', destination)}`,
  /**
   * **How the trip moves**, in the owner's own words (2026-08-30). Two trips with the same
   * destination and length read completely differently depending on this, and the page was
   * saying nothing about it.
   *
   * `הקפה` is mine rather than theirs: they named מתגלגל and כוכב, and a rolling trip that
   * closes its circle is common enough — and different enough in feel from a one-way
   * traverse — to be worth its own word. Correct it if it is wrong.
   */
  tripShape: {
    base: 'טיול כוכב',
    loop: 'הקפה',
    line: 'טיול מתגלגל',
    // Nothing true to say: no nights are recorded, so the shape is unknown rather than any
    // of the three. The renderer prints no clause at all.
    unknown: '',
  },
  bases: (count: number) => `${count} ${count === 1 ? 'בסיס' : 'בסיסים'}`,
  /** Where you sleep, as the day's frame rather than a row in its afternoon. */
  stay: (place: string) => `לנים ${bindPrefix('ב', place)}`,
  /** The wait between two legs of one journey, named by the place you wait IN. */
  layover: (place: string, span: string) => `המתנה ${bindPrefix('ב', place)} · ${span}`,
  /**
   * **A floor and a ceiling, in the app's own two words** (ADR-0213's 2026-08-31 amendment
   * §1). `מ-` and `עד` are `t.day.fromTime`/`untilTime`, which the app has printed for
   * ADR-0171's two flexible meanings since they were written. This file keeps its own copy
   * for the reason the header gives — paper is a separate renderer — and the WORDING is
   * identical on purpose: two words for one meaning is how two surfaces start disagreeing.
   *
   * Measured at the print face (`a-shared-time-is-printed-as-a-range-v1.html` §2): `מ-10:00`
   * is ⁦34.75px⁩ of ink and `עד 11:00` is ⁦38.38px⁩, against `09:20–14:05`'s ⁦55px⁩ — so both fit
   * the shipped ⁦56px⁩ column and it does not move.
   */
  timeFrom: (clock: string) => `מ-${clock}`,
  timeUntil: (clock: string) => `עד ${clock}`,
  /** The stay's two moments on the day header (§2). The nouns are the app's
   *  (`t.transition.checkIn`/`checkOut`), so paper and screen name them the same. */
  checkIn: (when: string) => `צ׳ק-אין ${when}`,
  /** **No place** (2026-08-31) — the day card above names it, and naming it twice put a past
   *  place under tonight's and inside the amber clock run. */
  checkOut: (when: string) => `צ׳ק-אאוט ${when}`,
  /** Four words for the four op kinds, printed inline because paper has no fold. */
  ops: { code: 'קוד', note: 'פתק', task: 'משימה', file: 'קובץ' },
  appendix: {
    // Only what is attached to nothing is left here, so it gets a name that says so.
    title: 'לקראת הנסיעה',
    travelers: 'נוסעים',
  },
  dayparts: {
    [SHARE_DAYPART.MORNING]: 'בוקר',
    [SHARE_DAYPART.NOON]: 'צהריים',
    [SHARE_DAYPART.AFTERNOON]: 'אחר הצהריים',
    [SHARE_DAYPART.EVENING]: 'ערב',
    [SHARE_DAYPART.NIGHT]: 'לילה',
    [SHARE_DAYPART.FLEXIBLE]: 'גמיש',
  } satisfies Record<ShareDaypart, string>,
  weekdays: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  /** **The activity, never the vehicle** — the same rule and the same four words as
   *  `he.ts`'s `travelMode`, which this file's header explains it must carry a copy of. A
   *  leg printed as two bare numbers said nothing about whether it was a walk or a drive. */
  travelMode: {
    walking: 'הליכה',
    cycling: 'רכיבה',
    driving: 'נסיעה',
    transit: 'תחב״צ',
  } satisfies Record<LegTravelMode, string>,
  minutes: 'דק׳',
  /** The signed clock jump across a leg — the same fact the app's zone pill carries. */
  zoneShift: (signed: string) => `שעון ${signed}`,
  km: 'ק״מ',
  /**
   * **The words a derived day headline is made of** (ADR-0213's 2026-08-30 amendment).
   * The projection ships a kind and its values; this is where a `flightOut` becomes a
   * sentence. Every value arrives already escaped and bidi-isolated by the caller — these
   * functions add the Hebrew around it and nothing else.
   */
  dayTitle: {
    [SHARE_DAY_KIND.FLIGHT_OUT]: (to: string) => `טסים ל${to}`,
    // No place: home is the absence of the trip, not somewhere this derivation knows.
    [SHARE_DAY_KIND.FLIGHT_HOME]: 'טסים הביתה',
    [SHARE_DAY_KIND.FLIGHT]: (to: string) => `טיסה ל${to}`,
    [SHARE_DAY_KIND.ROUTE]: (from: string, to: string) => `${from}${ROUTE_ARROW}${to}`,
    /** **A day named by what its stops ARE** (Wikidata `P31`). Four waterfalls in one day
     *  is a day of waterfalls, and that is a better name than any two of their names.
     *  `REGION` needs no entry: its value is a place name and prints as itself. */
    [SHARE_DAY_KIND.KIND]: (noun: string) => `יום ${noun}`,
  },
  /** The owner's own phrasing for the day's second line: _"night at…, Sleeping at…"_. */
  daySummary: {
    [SHARE_DAY_SUMMARY_KIND.STAY]: (place: string) => `לינה ב${place}`,
  },
  /** **The same eight words the app already uses** (`he.ts`'s `index.bookingType`), for
   *  the same reason this file carries the daypart words: the print renderer cannot import
   *  the React app's i18n. Reword one and reword the other — they are named in each
   *  other's comments so the pair cannot be missed. */
  bookingType: {
    flight: 'טיסה',
    hotel: 'לינה',
    restaurant: 'מסעדה',
    train: 'רכבת',
    transit: 'נסיעה',
    car: 'השכרת רכב',
    activity: 'פעילות',
    other: 'אחר',
  } satisfies Record<BookingType, string>,
} as const;

/** The same marks the reader uses, for the same sections. */
export const PDF_DAYPART_MARK = {
  [SHARE_DAYPART.MORNING]: '🌅',
  [SHARE_DAYPART.NOON]: '☀️',
  [SHARE_DAYPART.AFTERNOON]: '🌤️',
  [SHARE_DAYPART.EVENING]: '🌇',
  [SHARE_DAYPART.NIGHT]: '🌙',
  [SHARE_DAYPART.FLEXIBLE]: '◌',
} satisfies Record<ShareDaypart, string>;

// ── The link preview's Hebrew (ADR-0220) ───────────────────────────────────────────────

/**
 * **A trip's date range, in Hebrew prose, on the server** — `11–22 בספטמבר`,
 * `27 בספטמבר – 3 באוקטובר`.
 *
 * Three things about this are deliberate.
 *
 * **The four cases are not decided here.** `tripRangeShape` in `@waypoint/shared` owns them
 * and `frontend/src/lib/time.ts`'s `proseTripRange` reads the same discriminant, so the
 * invite ticket and the preview that advertised it cannot disagree about one trip. What is
 * local is only which words go around the numbers.
 *
 * **The month names come from `Intl`, not from a table in this file** — and that is a
 * departure from how the rest of this module works, on purpose. A hand-typed `HE_MONTHS`
 * would be twelve strings that can only ever *approximate* what the screen prints, because
 * the screen gets its months from ICU; reading the same ICU data is the only way the two
 * renderers are identical by construction rather than by review. The words this file exists
 * to hold are the ones ICU cannot supply.
 *
 * `hebrew.copy.spec.ts` asserts all four shapes, which also fails loudly on a runtime built
 * with small-ICU (where `he-IL` would silently fall back to English month names). Node ships
 * full ICU by default and the runtime image is `node:22-slim`, so this is a guard rather
 * than a live concern.
 *
 * Calendar dates, so read in UTC like every other date in the projection.
 */
export function heTripRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const day = fmt({ day: 'numeric' });
  const dayMonth = fmt({ day: 'numeric', month: 'long' });

  switch (tripRangeShape(startDate, endDate)) {
    case 'same-day':
      return dayMonth.format(start);
    case 'same-month':
      return `${day.format(start)}${EN_DASH}${dayMonth.format(end)}`;
    case 'same-year':
    case 'cross-year':
      return `${dayMonth.format(start)} ${EN_DASH} ${dayMonth.format(end)}`;
  }
}

/**
 * **Every string a link preview can say**, in the three cases that get shared (ADR-0220 §5).
 *
 * The forks behind each one are in
 * `planning/2026-09-05-the-app-is-seen-before-it-is-opened.md`; two of them changed after the
 * mockup was rendered rather than read, and both changes are visible here:
 *
 * - `invite.title` is `הוזמנת ל…`, **not** `הוזמנת לטיול …`, which stuttered into
 *   `הוזמנת לטיול טיול הבוגרים של כיתה יב3 ליוון` on a real trip name and could not on the
 *   clean one. The bare `ל` is also what the app already says (`הצטרפתם ל${tripName}`).
 * - The covers carry `מרכז שליטה לטיול`, `APP_TITLE`'s own tagline, because the first draft
 *   printed `home.title`'s sentence on the image one line above the title itself.
 *
 * **No `·` and no em dash anywhere** (owner, 2026-09-05) — the app's separator is fine on a
 * screen and reads as debris in a chat preview, so these lines use commas and full stops.
 * The en dash inside a date range is `heTripRange`'s and is the app's existing convention.
 *
 * Every value a caller interpolates is trip content and is escaped by the renderer, never
 * here — see `spa-shell.service.ts`.
 */
export const SHARE_META_COPY = {
  siteName: 'Travelive',
  home: {
    title: 'Travelive - כל הטיול שלכם במסך אחד',
    description: 'מה עכשיו, מה הבא בתור, ואיפה כל ההזמנות, בזמן שאתם שם.',
  },
  invite: {
    title: (tripName: string) => `הוזמנת ל${tripName}`,
    /** `travellers` is `memberCount`, and it is last because it is the first thing a
     *  two-line clamp drops — the destination and the dates are what a person needs. */
    description: (destination: string, dates: string, travellers: number) =>
      `${destination}, ${dates}. ${travellers} נוסעים כבר בפנים.`,
  },
  live: {
    title: (tripName: string) => `${tripName} - הלו״ז החי`,
    description: (destination: string, dates: string) =>
      `${destination}, ${dates}. לינק שמתעדכן עם הטיול.`,
  },
} as const;
