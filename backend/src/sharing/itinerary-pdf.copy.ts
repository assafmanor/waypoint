import {
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  type BookingType,
  type LegTravelMode,
  type ShareDaypart,
} from '@waypoint/shared';

/**
 * **The PDF's Hebrew, and why it is here rather than in `frontend/src/i18n/he.ts`.**
 *
 * ADR-0009 puts product copy in the frontend and this repo keeps it there — but the PDF is
 * rendered on the server, by a Node process that cannot import a React app's i18n module,
 * and the paper has to be in Hebrew for the same people the screen is. So the print
 * renderer is a second locale consumer. That is the constraint, not a preference.
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
export const PDF_COPY = {
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
  // `ב-` and not a bare `ב`: the destination arrives isolated and may be Latin, where
  // `ב Iceland` reads as a stray particle. The hyphen is the Hebrew convention for exactly
  // this, and it is what the stay line already uses.
  what: (days: number, destination: string) => `${days} ימים ב-${destination}`,
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
  stay: (place: string) => `לנים ב-${place}`,
  /** The wait between two legs of one journey, named by the place you wait IN. */
  layover: (place: string, minutes: number) => `המתנה ב${place} · ${minutes} דקות`,
  /** Four words for the four op kinds, printed inline because paper has no fold. */
  ops: { code: 'קוד', note: 'פתק', task: 'משימה', file: 'קובץ' },
  appendix: {
    // Only what is attached to nothing is left here, so it gets a name that says so.
    title: 'לקראת הנסיעה',

    notesAndTasks: 'פתקים ומשימות',
    travelers: 'נוסעים',
    documents: 'מסמכים שנבחרו',
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
