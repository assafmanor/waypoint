// Curated icon set + category derivation — the single source of truth for the
// icon picker and its semantics (ADR-0038). Both ends import this: the frontend
// renders `ICON_SET` in the picker; both ends map a chosen glyph or a booking
// type to a canonical `EventCategory`.
//
// The glyph list is a bounded curated set (like the type/colour/radius ramps),
// NOT the full OS emoji keyboard. Adding/removing a glyph here is a code change,
// not a migration (icon is a free string); the `EventCategory` enum is what a
// migration touches. UI copy (group labels) lives in the frontend i18n, keyed
// by `IconGroup.id` — never here (this package is shapes + data, ADR-0009).

import { BOOKING_TYPE_TO_CATEGORY, EVENT_CATEGORY, PLACE_SEARCH_KIND } from './constants';
import type {
  Booking,
  BookingType,
  EventCategory,
  EventKind,
  PlaceSearchKind,
  TripEvent,
} from './entities';
import { matchesAnyTerm } from './search-terms';

/** A browse-group in the picker. `category` is the canonical semantic value
 *  persisted when a glyph from this group is chosen — the UI groups (10) are
 *  finer than the stored categories (9): `drink`→food, `general`→other. */
export interface IconGroup {
  /** stable key; the frontend i18n maps it to a Hebrew label. */
  id: string;
  category: EventCategory;
  icons: readonly string[];
}

export const ICON_SET: readonly IconGroup[] = [
  {
    id: 'transport',
    category: 'transport',
    icons: ['✈️', '🚆', '🚄', '🚈', '🚌', '🚗', '🚕', '🚉', '🛵', '🚲', '⛴️', '🚢', '🚡', '🛺'],
  },
  {
    id: 'food',
    category: 'food',
    icons: ['🍜', '🍱', '🍣', '🍽️', '🍕', '🍔', '🥘', '🥗', '🍝', '🌮', '🍢', '🥟', '🧆', '🍦'],
  },
  {
    id: 'drink',
    category: 'food',
    icons: ['☕', '🍵', '🧋', '🍺', '🍷', '🍸', '🍹', '🥂', '🧉', '🥤'],
  },
  {
    id: 'lodging',
    category: 'lodging',
    icons: ['🏨', '🏠', '🏡', '🏕️', '⛺', '🛏️', '🏩', '🏯', '♨️', '🔑'],
  },
  {
    id: 'sights',
    category: 'sightseeing',
    icons: ['⛩️', '🏛️', '🗼', '🗽', '🏰', '🕌', '⛪', '🕍', '🖼️', '🎭', '🎨', '🎪', '🎋'],
  },
  {
    id: 'nature',
    category: 'nature',
    icons: ['⛰️', '🌋', '🏔️', '🏖️', '🏝️', '🏞️', '🌊', '🌸', '🌲', '🍁', '🌅', '🐳', '🦌'],
  },
  {
    id: 'activity',
    category: 'activity',
    icons: ['🎫', '🎢', '🎡', '🎠', '🎿', '🏂', '🏄', '🚵', '🥾', '🧗', '🎣', '🛶', '🏊', '🎮'],
  },
  {
    id: 'shopping',
    category: 'shopping',
    icons: ['🛍️', '🛒', '🏬', '🏪', '🎁', '💐', '🕯️', '🧴'],
  },
  {
    id: 'practical',
    category: 'services',
    icons: ['🎟️', '💊', '🏥', '🏧', '🏦', '📮', '📶', '🔌', '🧳', '🧾', '📄', '🆘', '🅿️'],
  },
  {
    id: 'general',
    category: 'other',
    icons: ['📌', '📍', '⭐', '❤️', '✅', '❓', '🔖', '💡', '🎉', '🎂'],
  },
];

/** Trip icons are a SEPARATE, flat set (ADR-0038 §5): a trip has no category,
 *  and its glyph expresses the trip's *character* (destination / kind / vibe),
 *  not a timeline item's type — so the event ICON_SET's groups don't apply.
 *  No tabs/filter (it's a once-per-trip recognition pick, not a lookup); the
 *  archetype clusters are rendered flat with subtle spacing between them, never
 *  labelled category groups. Order: general · travel mode · landscape · city &
 *  landmark · activity · occasion · season. `🧳` is the default (first). */
export const TRIP_ICON_CLUSTERS: readonly (readonly string[])[] = [
  ['🧳', '🎒', '✈️', '🗺️', '🌍', '🌏'],
  ['🚗', '🚐', '🚂', '🚢', '⛵', '🏍️'],
  ['🏖️', '🏝️', '🌴', '🏔️', '🏜️', '🌋', '🏞️', '🌲', '🏕️'],
  ['🏙️', '🗼', '🗽', '🏛️', '⛩️', '🕌', '🏰', '🎡'],
  ['🎿', '🏄', '🥾', '🤿', '🐘'],
  ['🍷', '🎶', '🎉', '💍', '🎓'],
  ['🌸', '☀️', '🍁', '❄️'],
];

/** Flattened view for any consumer that just needs the membership list. */
export const TRIP_ICON_SET: readonly string[] = TRIP_ICON_CLUSTERS.flat();

/** Search terms (Hebrew + English) per vibe glyph, so the trip picker's search
 *  matches style icons too — not only country flags. */
export const TRIP_VIBE_TERMS: Record<string, readonly string[]> = {
  '🧳': ['מזוודה', 'כללי', 'luggage', 'trip'],
  '🎒': ['תרמיל', 'טיולים', 'backpack', 'backpacking'],
  '✈️': ['טיסה', 'מטוס', 'flight', 'abroad', 'חול'],
  '🗺️': ['מפה', 'מסלול', 'map', 'roadtrip'],
  '🌍': ['עולם', 'אירופה', 'world', 'europe', 'africa'],
  '🌏': ['עולם', 'אסיה', 'world', 'asia'],
  '🚗': ['רכב', 'מכונית', 'roadtrip', 'car', 'drive'],
  '🚐': ['ואן', 'קרוואן', 'van', 'campervan'],
  '🚂': ['רכבת', 'train', 'rail'],
  '🚢': ['ספינה', 'שייט', 'קרוז', 'cruise', 'ship', 'boat'],
  '⛵': ['מפרשית', 'שייט', 'sail', 'yacht'],
  '🏍️': ['אופנוע', 'motorcycle', 'moto'],
  '🏖️': ['חוף', 'ים', 'beach', 'sea'],
  '🏝️': ['אי', 'טרופי', 'island', 'tropical'],
  '🌴': ['דקל', 'טרופי', 'palm', 'tropics'],
  '🏔️': ['הר', 'הרים', 'אלפים', 'mountain', 'alps', 'snow'],
  '🏜️': ['מדבר', 'desert'],
  '🌋': ['הר געש', 'געש', 'volcano', 'geothermal'],
  '🏞️': ['טבע', 'פארק', 'nature', 'park', 'national park'],
  '🌲': ['יער', 'forest', 'woods'],
  '🏕️': ['קמפינג', 'מחנה', 'camping', 'campsite'],
  '🏙️': ['עיר', 'city', 'urban'],
  '🗼': ['מגדל', 'תצפית', 'tower'],
  '🗽': ['פסל החירות', 'ניו יורק', 'liberty', 'new york', 'nyc'],
  '🏛️': ['היסטוריה', 'מוזיאון', 'תרבות', 'history', 'museum', 'culture'],
  '⛩️': ['מקדש', 'יפן', 'temple', 'shrine', 'japan'],
  '🕌': ['מסגד', 'mosque'],
  '🏰': ['טירה', 'ארמון', 'castle', 'palace'],
  '🎡': ['יריד', 'לונה פארק', 'fair', 'theme park'],
  '🎿': ['סקי', 'ski', 'snow'],
  '🏄': ['גלישה', 'surf', 'surfing'],
  '🥾': ['טיול רגלי', 'הליכה', 'מסלול', 'hike', 'trek', 'hiking'],
  '🤿': ['צלילה', 'שנרקל', 'dive', 'diving', 'snorkel'],
  '🐘': ['ספארי', 'חיות', 'safari', 'wildlife'],
  '🍷': ['יין', 'אוכל', 'קולינרי', 'wine', 'food', 'culinary'],
  '🎶': ['מוזיקה', 'פסטיבל', 'הופעה', 'music', 'festival', 'concert'],
  '🎉': ['חגיגה', 'מסיבה', 'party', 'celebration'],
  '💍': ['ירח דבש', 'חתונה', 'honeymoon', 'wedding'],
  '🎓': ['גמר', 'סיום', 'graduation'],
  '🌸': ['אביב', 'פריחה', 'סאקורה', 'spring', 'blossom'],
  '☀️': ['קיץ', 'שמש', 'summer', 'sun'],
  '🍁': ['סתיו', 'autumn', 'fall'],
  '❄️': ['חורף', 'שלג', 'winter', 'snow'],
};

/** Vibe glyphs whose terms match a search query (empty query → none; the picker
 *  shows the spaced clusters instead). */
export const searchVibeIcons = (query: string): readonly string[] => {
  if (!query.trim()) return [];
  return TRIP_ICON_SET.filter((g) => matchesAnyTerm(query, TRIP_VIBE_TERMS[g] ?? []));
};

/** Default glyph per canonical category (the picker's suggestion + the badge a
 *  category-only item renders). Kept in step with `ICON_SET`'s first useful
 *  glyph for each category. */
export const CATEGORY_DEFAULT_ICON: Record<EventCategory, string> = {
  transport: '✈️',
  food: '🍽️',
  lodging: '🏨',
  sightseeing: '⛩️',
  nature: '⛰️',
  activity: '🎫',
  shopping: '🛍️',
  services: '💊',
  other: '📌',
};

/** Booking type → canonical category (ADR-0038 Tier-B auto-suggest). A booked
 *  event derives its category from the linked `Booking.type`.
 *
 *  **The table lives in `constants.ts`, and used to live in both.** A private
 *  `BOOKING_TYPE_CATEGORY` sat here with identical contents and exactly one reader —
 *  this function — so every new booking type had to be answered twice with nothing but
 *  the `Record<BookingType, …>` on each to notice (ADR-0095's shape, ADR-0162 collapsed
 *  it). One table, and its inverse `CATEGORY_TO_BOOKING_TYPE` is beside it there. */
export const categoryForBookingType = (type: BookingType): EventCategory =>
  BOOKING_TYPE_TO_CATEGORY[type];

export const iconForCategory = (category: EventCategory): string => CATEGORY_DEFAULT_ICON[category];

/** Reverse lookup: the canonical category a chosen glyph belongs to (the picker
 *  records this alongside the glyph). `undefined` for a glyph not in the set. */
export const categoryForIcon = (icon: string): EventCategory | undefined =>
  ICON_SET.find((g) => g.icons.includes(icon))?.category;

/** Per-category time-behaviour profile (ADR-0063). A small closed lookup beside
 *  the icon registry that every time-aware surface reads, so "bracketed" and
 *  "ambient" stop being scattered per-type `endDate`/type checks. Orthogonal to
 *  hard/soft (ADR-0011, the commitment axis) and to category (the semantic axis);
 *  this is the time-presentation axis. Nothing is stored — behaviours derive from
 *  this profile plus the event's own timing (ADR-0018). */
export interface CategoryTimeProfile {
  /** The ends matter, the middle is passive: show start & end, not the span
   *  between. Applies regardless of duration (a same-day flight collapses to a
   *  point when start ≈ end). */
  bracketed: boolean;
  /** When the event crosses days: rendered as a backdrop across every covered
   *  day, off the counted schedule (ADR-0054). */
  ambientWhenMultiDay: boolean;
  /** i18n keys for the two ends, resolved in `i18n/he.ts`. Only meaningful when
   *  `bracketed`. */
  transitions?: {
    startKey: string;
    endKey: string;
  };
  /** **What the MIDDLE of a bracketed span is, while the clock is inside it**
   *  (session 215). `bracketed` says the ends matter and the middle is passive; this
   *  says what that passive middle *means*, which is not the same for every mode and
   *  was being answered by a hard-coded `בטיסה` and a hard-coded plane on the board:
   *
   *   - `journey` — a leg between two places. It earns the progress rail, a
   *     travelling mark and a countdown to arrival (a flight, a train, a bus, a ferry).
   *   - `held` — a resource you are holding. No rail and no travelling mark: its end is
   *     a **deadline**, not an arrival (a car hire, a same-day stay).
   *
   *  Absent → the middle does not surface on the hero at all.
   *
   *  Two keys rather than one because the board already says two different words: the
   *  live badge (`בטיסה`) and the slot label (`כרגע · בדרך`). Same rule as
   *  `transitions` — a mode states whatever it disagrees with, and every time-aware
   *  surface picks it up with no per-screen branching. */
  /**
   * **How far ahead a hard event of this category is notified** (ADR-0198 §3), in minutes.
   * `0` means this category is not notified ahead of time at all.
   *
   * One field on the table every time-aware surface already reads, rather than a second
   * lookup beside it (root rule 8) — so a tenth category, or a per-MODE override through
   * `ICON_TIME_PROFILE` the way a flight already overrides its transition words, is a
   * one-line addition and not a table that can disagree with this one.
   */
  notifyLeadMinutes: number;
  midSpan?: {
    kind: 'journey' | 'held';
    /** The live badge while you are inside it (`בטיסה` / `בדרך` / `הרכב אצלנו`). */
    liveKey: string;
    /** The now-slot label (`כרגע · בדרך`). */
    labelKey: string;
  };
  /** How this category's *duration* reads when shown in a preview (ADR-0063
   *  extension): transport in **hours** (a flight is hours, even overnight),
   *  lodging in **nights**, everything else **auto** — hours when it stays on one
   *  calendar day, days when it spans days. Derived display only; the frontend
   *  formatter turns it into words. */
  durationUnit: DurationUnit;
  /** **How long one of these usually takes**, in minutes (ADR-0161 §5). The default
   *  length offered when something is placed at a position and has no length of its own —
   *  a shelf idea being scheduled, a new event started in a gap. Replaces a flat 60 for
   *  everything, which made every meal an hour and every hike an hour.
   *
   *  Coarse on purpose: it is an opening offer that the user adjusts, not an estimate. A
   *  block is still clamped to the room the position actually has (`lib/gaps.ts`), so this
   *  never makes an event longer than the gap it went into.
   *
   *  `transport` and `lodging` carry the ordinary value and mean nothing by it: both are
   *  bracketed, so their length comes from their two ends rather than from a default. */
  typicalMinutes: number;
}

/** The unit a category's duration is expressed in (ADR-0063 extension). */
export type DurationUnit = 'hours' | 'nights' | 'auto';

/** The default default: an hour, which is what everything used to get. */
const TYPICAL_MINUTES_DEFAULT = 60;

const ORDINARY_PROFILE: CategoryTimeProfile = {
  bracketed: false,
  ambientWhenMultiDay: false,
  durationUnit: 'auto',
  typicalMinutes: TYPICAL_MINUTES_DEFAULT,
  // **The default is silence.** `sightseeing`, `nature`, `shopping` and `other` are rarely
  // hard, and when they are the day surfaces carry them — so an uncategorised event
  // (ADR-0038) inherits "no advance notification" rather than a guess (ADR-0198 §3).
  notifyLeadMinutes: 0,
};

export const CATEGORY_TIME_PROFILE: Record<EventCategory, CategoryTimeProfile> = {
  // Generic transport wording (departure/arrival) is correct for every mode that
  // CARRIES you — a train, a bus or a ferry all leave and arrive. A mode that disagrees
  // refines it per-glyph via `ICON_TIME_PROFILE`: aviation's take-off/landing, and a
  // hire's pick-up/return (ADR-0162, which is also why a car is no longer in that list).
  // Nothing hard-codes flight words for the category.
  transport: {
    bracketed: true,
    ambientWhenMultiDay: true,
    // Two hours. An airport is the one place where that is not paranoid (ADR-0198 §3).
    notifyLeadMinutes: 120,
    transitions: { startKey: 'departure', endKey: 'arrival' },
    // Every mode that CARRIES you is a journey, and the generic word for its middle is
    // the generic one — `בטיסה` belongs to ✈️ below, not to the category, which is why a
    // train read it for a release.
    midSpan: { kind: 'journey', liveKey: 'transitLive', labelKey: 'transitLabel' },
    durationUnit: 'hours',
    typicalMinutes: TYPICAL_MINUTES_DEFAULT,
  },
  lodging: {
    bracketed: true,
    ambientWhenMultiDay: true,
    // A check-in you are late for is a phone call, not a lost ticket.
    notifyLeadMinutes: 60,
    transitions: { startKey: 'checkIn', endKey: 'checkOut' },
    // A multi-day stay is ambient and never reaches this (its middle is the stay strip,
    // ADR-0059 §2). A SAME-DAY one does, and it is a held span rather than a journey:
    // its end is a check-out you have to make, not somewhere you arrive.
    midSpan: { kind: 'held', liveKey: 'stayLive', labelKey: 'stayLabel' },
    durationUnit: 'nights',
    typicalMinutes: TYPICAL_MINUTES_DEFAULT,
  },
  // The categories that actually differ. Values are the owner's to re-tune and carry no
  // reasoning beyond "a meal is not a hike": a sit-down meal runs to an hour and a half, a
  // museum or a hike to two or three hours, an errand to an hour.
  // `notifyLeadMinutes` where it is not the ordinary silence (ADR-0198 §3): a reservation
  // half an hour out, a booked slot with a person waiting an hour out.
  food: { ...ORDINARY_PROFILE, typicalMinutes: 90, notifyLeadMinutes: 30 },
  sightseeing: { ...ORDINARY_PROFILE, typicalMinutes: 120 },
  nature: { ...ORDINARY_PROFILE, typicalMinutes: 180 },
  activity: { ...ORDINARY_PROFILE, typicalMinutes: 120, notifyLeadMinutes: 60 },
  shopping: { ...ORDINARY_PROFILE, typicalMinutes: 90 },
  // No longer the shared `ORDINARY_PROFILE` object: `services` is a booked slot somebody is
  // waiting at, so it differs from `other` in exactly one field now.
  services: { ...ORDINARY_PROFILE, notifyLeadMinutes: 60 },
  other: ORDINARY_PROFILE,
};

/** **Per-glyph refinements of the category profile**, for modes whose time reads
 *  differently from the category they belong to (ADR-0063 refinement, widened in
 *  ADR-0162). A flight's ends are take-off / landing, not the generic departure /
 *  arrival every other transport mode uses. Bounded and declarative like the icon set
 *  itself (ADR-0038): a new mode adds a glyph here and every time-aware surface (hero,
 *  glance markers, day entries) picks it up — no per-screen branching.
 *
 *  **It used to refine `transitions` only, and the car hire is why it no longer does.**
 *  A hire is `transport`, so it inherited that category's hours and a five-day one read
 *  "120 ש׳" wherever an EVENT was the subject — the booking surfaces were already right,
 *  because they ask the type (`bookingTypeDurationUnit`). Rather than add a second
 *  glyph table beside this one for the second field, the values became a `Partial` of
 *  the profile: whatever a mode disagrees with, it states here.
 *
 *  A glyph is a weaker carrier than a type — the icon is the user's to change, so a hire
 *  re-badged ⭐ falls back to its category. That is the same looseness a flight's wording
 *  has always had, and it is why the type-keyed path exists for anything booked. */
export const ICON_TIME_PROFILE: Record<string, Partial<CategoryTimeProfile>> = {
  '✈️': {
    transitions: { startKey: 'flightDeparture', endKey: 'flightArrival' },
    // The one mode whose middle has its own word. Everything else that carries you
    // inherits `transport`'s generic `בדרך`.
    midSpan: { kind: 'journey', liveKey: 'flightLive', labelKey: 'transitLabel' },
  },
  // A hire is picked up and returned, not departed and arrived — and it is measured in
  // the days you hold it (ADR-0162). Both halves of `transport` that a car disagrees with,
  // plus a third (session 215): **you are not in transit while you hold a car.** The
  // middle of a hire is a held resource, so it earns no rail, no travelling mark and no
  // arrival — its end is a return deadline. Same rule as ADR-0163 §4 one surface over.
  '🚗': {
    transitions: { startKey: 'carPickup', endKey: 'carDropoff' },
    midSpan: { kind: 'held', liveKey: 'carHoldLive', labelKey: 'carHoldLabel' },
    durationUnit: 'auto',
  },
};

/** The profile for an event's category. A null/unset category (ADR-0038) uses
 *  the ordinary profile (a plain point/block). */
const profileFor = (category: EventCategory | null | undefined): CategoryTimeProfile =>
  category != null ? CATEGORY_TIME_PROFILE[category] : ORDINARY_PROFILE;
/** How long to offer for something placed at a position, by category (ADR-0161 §5). A
 *  null/unset category (ADR-0038) gets the ordinary hour. */
export const typicalMinutesFor = (category: EventCategory | null | undefined): number =>
  profileFor(category).typicalMinutes;

/** An event's time profile: its category's, refined by whatever its own glyph
 *  disagrees with (`ICON_TIME_PROFILE`). The one resolution both readers below share,
 *  so a mode never reads its wording from the glyph and its unit from the category. */
const timeProfileFor = (event: Pick<TripEvent, 'category' | 'icon'>): CategoryTimeProfile => {
  const base = profileFor(event.category);
  const refinement = event.icon != null ? ICON_TIME_PROFILE[event.icon] : undefined;
  return refinement ? { ...base, ...refinement } : base;
};

/**
 * **How far ahead this event is notified**, in minutes — `0` for never (ADR-0198 §3).
 *
 * Reads the event's own **refined** profile rather than its category's, so a mode that
 * disagrees can say so in `ICON_TIME_PROFILE` and every reader picks it up, exactly as a
 * flight already overrides its transition words. Nothing overrides it today; the seam is the
 * point, because the alternative is a second table keyed by glyph that can disagree with this
 * one.
 */
export const notifyLeadMinutesFor = (event: Pick<TripEvent, 'category' | 'icon'>): number =>
  timeProfileFor(event).notifyLeadMinutes;

/** The two i18n transition keys for a bracketed event's ends, or `undefined`
 *  when its category isn't bracketed. Resolves finer than category so wording is
 *  by mode, not hard-coded: an event's own glyph (`ICON_TIME_PROFILE`) wins
 *  over the category default — a train reads departure/arrival, a flight reads
 *  take-off/landing, a hire reads pick-up/return — with the category profile as the
 *  fallback for every other glyph and for manual (non-booking) events (ADR-0063 §4). */
export const eventTransitionKeys = (
  event: Pick<TripEvent, 'category' | 'icon'>,
): { startKey: string; endKey: string } | undefined => timeProfileFor(event).transitions;

/** **What this event's middle is while you are inside it** — a journey between two
 *  places, or a resource you are holding (session 215). Resolves exactly like
 *  `eventTransitionKeys`: the event's own glyph refines its category, so a flight's
 *  middle differs from a train's by one word and a hire's differs in kind.
 *
 *  The hero used to answer this with a literal (`בטיסה`) and a hard-coded plane, which
 *  is why a train read as a flight and a same-day car hire read as a journey. */
export const eventMidSpan = (
  event: Pick<TripEvent, 'category' | 'icon'>,
): CategoryTimeProfile['midSpan'] => timeProfileFor(event).midSpan;

/** Is this event's middle a journey (a leg you are being carried along), as opposed to
 *  a resource you are holding? The one predicate every "should this show a progress
 *  rail / an arrival countdown" question asks. */
export const isJourney = (event: Pick<TripEvent, 'category' | 'icon'>): boolean =>
  timeProfileFor(event).midSpan?.kind === 'journey';

/** **What the number on a row MEANS** (ADR-0171 §1) — a third axis, beside ADR-0011's
 *  commitment axis (can this move) and ADR-0063's presentation axis (bracketed/ambient).
 *
 *  - `exact` — the instant IS the commitment. A flight departs, a table is booked.
 *  - `not-before` — the earliest it can be. A room from 15:00, a hire counter at 10:00.
 *  - `not-after` — a deadline. Out by 11:00, the car back by 18:00.
 *  - `window` — BOTH bounds are known and neither is the moment. Check-in 17:00–21:00.
 *    Added by ADR-0184, and it is the closed form of the two flexible values above
 *    rather than a fourth kind of thing. */
export const TIME_MEANING = {
  EXACT: 'exact',
  NOT_BEFORE: 'not-before',
  NOT_AFTER: 'not-after',
  WINDOW: 'window',
} as const;
/** The four, in the order above — for a `z.enum` that cannot drift from the object beside it
 *  (the sharing contract needs one, ADR-0213's 2026-08-31 amendment). */
export const TIME_MEANINGS = [
  TIME_MEANING.EXACT,
  TIME_MEANING.NOT_BEFORE,
  TIME_MEANING.NOT_AFTER,
  TIME_MEANING.WINDOW,
] as const;
export type TimeMeaning = (typeof TIME_MEANING)[keyof typeof TIME_MEANING];

/** **What one END of this event's time means**, resolved from the profile that already
 *  answers it under another name: `midSpan.kind` (ADR-0171 §2).
 *
 *  A `journey` leaves at a moment and arrives at a moment. A `held` resource is
 *  **available from** a time and **due back by** one — which is what holding something
 *  means, so this is the same fact rather than a coincidence worth exploiting. Writing
 *  it a second time as an `edges` field beside `midSpan` would be two sources for one
 *  fact, exactly what ADR-0162 §2 refused when it made `durationUnit` optional.
 *
 *  Resolves like every other reader here — the event's own glyph refines its category —
 *  so a car hire gets floor/deadline ends through `ICON_TIME_PROFILE`'s `🚗` row with
 *  nobody having thought about cars. Anything with no `midSpan` is an ordinary point,
 *  which is `exact` at both ends and is most of the app.
 *
 *  **The seam ADR-0171 §2 named is now taken, by data rather than by a field** (ADR-0184):
 *  an AUTHORED window on the event wins over the profile's answer. Nobody is asked to
 *  classify anything — a second number was typed, and having one IS being bounded — so
 *  this is not the per-event authoring question §8 there refused. An explicit `edges` on
 *  `ICON_TIME_PROFILE` is still the seam for a MODE that disagrees, and still unbuilt. */
export const edgeMeaning = (
  event: Pick<TripEvent, 'category' | 'icon' | 'startWindowEnd' | 'endWindowStart'>,
  edge: 'start' | 'end',
): TimeMeaning => {
  if (windowBoundOf(event, edge) != null) return TIME_MEANING.WINDOW;
  if (timeProfileFor(event).midSpan?.kind !== 'held') return TIME_MEANING.EXACT;
  return edge === 'start' ? TIME_MEANING.NOT_BEFORE : TIME_MEANING.NOT_AFTER;
};

/** The authored other-bound of this edge's window, if there is one. One accessor rather
 *  than `edge === 'start' ? … : …` at six call sites — the pairing of edge to field is
 *  the kind of thing that reads fine and inverts silently. */
export const windowBoundOf = (
  event: Pick<TripEvent, 'startWindowEnd' | 'endWindowStart'>,
  edge: 'start' | 'end',
): string | undefined =>
  (edge === 'start' ? event.startWindowEnd : event.endWindowStart) ?? undefined;

/** Does this end name a moment the app actually KNOWS? The one predicate the day's
 *  ordering and the map's numbering both ask (ADR-0171 §10a/§10b) — and they must ask
 *  the same one, or a row can hold a position its pin refuses to number.
 *
 *  **A window is not a moment** (ADR-0184 §4), so it stays false here: the row regains a
 *  list POSITION because it is placeable, and still earns no stop number, which is
 *  ADR-0171 §10b's Iceland rule holding rather than being re-litigated. */
export const isExactEdge = (
  event: Pick<TripEvent, 'category' | 'icon' | 'startWindowEnd' | 'endWindowStart'>,
  edge: 'start' | 'end',
): boolean => edgeMeaning(event, edge) === TIME_MEANING.EXACT;

/* `edgeHoldsPosition` lived here and is GONE (2026-08-13, amending ADR-0171 §10a and
   ADR-0184 §4). Every span edge holds a position now — a floor is placed at the instant the
   day's other hard facts allow (`day-entries.ts`'s `edgeAt`) rather than kept out of the
   list — so the predicate had no consumers left and, worse, answered `false` about something
   the app places. Not kept "in case": a name that contradicts the behaviour is what the next
   reader trusts. */

/** The unit an event's duration reads in — its category's, unless its glyph names a
 *  different one (ADR-0063 extension, ADR-0162's refinement). A null/unset category
 *  uses the ordinary 'auto'.
 *
 *  For anything with a BOOKING behind it, prefer `bookingTypeDurationUnit`: the type
 *  is the authority and the glyph is only its badge. */
export const eventDurationUnit = (event: Pick<TripEvent, 'category' | 'icon'>): DurationUnit =>
  timeProfileFor(event).durationUnit;

type TimedEvent = Pick<TripEvent, 'category' | 'date' | 'endDate'>;

/** The event's ends matter and its middle is passive (ADR-0063). */
export const isBracketed = (event: Pick<TripEvent, 'category'>): boolean =>
  profileFor(event.category).bracketed;

/** The event crosses days — its `endDate` is set and lands on a later day than
 *  `date` (ADR-0018/0047). A single overnight tail (ADR-0037, no `endDate`) is
 *  not multi-day. */
export const isMultiDay = (event: Pick<TripEvent, 'date' | 'endDate'>): boolean =>
  event.endDate != null && event.endDate > event.date;

/** The event renders as an off-schedule backdrop: its category is
 *  ambient-when-multi-day AND it is currently multi-day (ADR-0054, rebased). */
export const isAmbient = (event: TimedEvent): boolean =>
  profileFor(event.category).ambientWhenMultiDay && isMultiDay(event);

/**
 * **Is this event a way of GETTING somewhere, rather than somewhere to be?**
 *
 * Asked of the booking first, because a booking states its type, and of the category only for
 * an event no booking backs. Both vocabularies already exist and `BOOKING_TYPE_TO_CATEGORY`
 * maps between them, so this names no third set — which is the correction it carries: the
 * sharing projection wrote the same rule out as a literal list of four types, beside a comment
 * saying it should not. Now both layers ask it here (ADR-0219 §7's move, extended).
 *
 * Its one caller-facing rule: a day's REGION and KIND are voted on by the settled stops only,
 * since an airport's region would name a travel day after the municipality of its runway.
 */
export const isTransportEvent = (
  event: Pick<TripEvent, 'category'>,
  booking?: Pick<Booking, 'type'>,
): boolean =>
  booking
    ? BOOKING_TYPE_TO_CATEGORY[booking.type] === EVENT_CATEGORY.TRANSPORT
    : event.category === EVENT_CATEGORY.TRANSPORT;

/** The closing edge of an event: the boundary past which it is behind you, for
 *  every now-relative "is this over?" question (the Index past/upcoming split,
 *  ADR-0049). Derived purely from the event's own timing *shape*, never its type
 *  or category — so a new booking type, category, or bracketed/ambient profile
 *  inherits correct behaviour with no new branching here:
 *
 *   - `endsAt` set          → the exact end instant (a flight's arrival, a hotel's
 *                             check-out, an activity's end)
 *   - multi-day, no end time → the whole check-out day (`endDate`): an in-progress
 *                             stay is behind you only once its last day is, never
 *                             the morning after check-in
 *   - a single moment (`startsAt`, no end) → that instant (an arrival-less flight
 *                             or open-ended activity is behind you once it happens)
 *   - only a `date`         → the whole day: an untimed booking lingers till midnight
 *
 *  Returns a discriminated boundary the caller resolves against its own clock —
 *  an `'instant'` compares to `now` (epoch ms); a `'day'` compares to the trip's
 *  own today (YYYY-MM-DD, lexical). Keeping derivation here (clock-free, unit-
 *  testable) and resolution at the caller (which owns `now` + timezone, ADR-0026)
 *  is what lets this stay pure and shared. */
export type EventEndBoundary = { kind: 'instant'; at: number } | { kind: 'day'; date: string };

export const eventEndBoundary = (
  event: Pick<TripEvent, 'date' | 'endDate' | 'startsAt' | 'endsAt'>,
): EventEndBoundary => {
  if (event.endsAt) return { kind: 'instant', at: Date.parse(event.endsAt) };
  if (isMultiDay(event)) return { kind: 'day', date: event.endDate! };
  if (event.startsAt) return { kind: 'instant', at: Date.parse(event.startsAt) };
  return { kind: 'day', date: event.date };
};

/** **Per-booking-type shape profile (ADR-0154 §2).** The booking-type peer of
 *  `CATEGORY_TIME_PROFILE` above, in the same file and the same idiom, and it exists
 *  for the same reason that one does: so a per-type fact stops being a predicate
 *  scattered across call sites.
 *
 *  It replaced **six** hand-written definitions of "is this transport?" in two
 *  packages — two of them exported in parallel and imported by different call sites,
 *  and written two different ways (`flight || train` in four places,
 *  `categoryForBookingType(…) === 'transport'` in two). None was exhaustive, so a
 *  surface that forgot the question compiled clean; that is exactly how `EventForm`
 *  came to send a single `placeId` for a flight and get a 400 back from the server.
 *
 *  **The reframing is the point, not the table.** Every one of those call sites was
 *  really asking *"does this carry a route?"* — so that is what the field is called,
 *  and a future ferry or bus is one row here rather than a tour of two packages.
 *  Same property `NOTE_HOST_FIELD` states for a sixth note host (ADR-0152 §2). */
export interface BookingTypeProfile {
  /** Which place shape this type carries (ADR-0048, enforced server-side): `route` =
   *  `fromPlaceId`/`toPlaceId`, `single` = `placeId`. Mutually exclusive — a type has
   *  one or the other, never both. */
  places: 'route' | 'single';
  /** Two endpoints that may fall on different days (departure→arrival,
   *  check-in→check-out, start→end), versus a single point on one day. */
  schedule: 'span' | 'point';
  /** The commitment a freshly created booking of this type opens with (ADR-0011).
   *  Orthogonal to booked-ness (ADR-0136 §4) — a restaurant booking is soft. */
  defaultKind: EventKind;
  /** How many journeys one save may author, and how the extra ones relate to the first.
   *  Two independent shapes, because they are genuinely different relations: a round
   *  trip is a **mirror** and a connection is a **sequence** (ADR-0154 §7 named the
   *  distinction and left the second one unpopulated; ADR-0159 populates it).
   *
   *  **Deliberately not derived from `places`.** A split hotel stay would be
   *  `places: 'single'` with a sequence, and collapsing the axes would block exactly
   *  the extension this table exists for. */
  legs: {
    /** Leg 2 reverses leg 1's route — the round trip (ADR-0154 §4). */
    mirrored: boolean;
    /** Legs chain end to start (Tokyo→Dubai→Tel Aviv), plus the window that decides
     *  when two of them are ONE journey rather than two. `null` = this type has no
     *  such thing, which is every non-transport type.
     *
     *  The window is per type because the two answers genuinely differ. A flight's
     *  ceiling is the aviation line between a layover and a stopover (24h); a train
     *  or a bus stop measured in hours is a visit to the city, not a change of
     *  platform. Same for what counts as TIGHT: 90 minutes is a short connection with
     *  bags and a terminal, 20 minutes is a short one on a platform. */
    sequence: ConnectionWindow | null;
  };
  /** **How long one of these reads, when the type disagrees with its category**
   *  (ADR-0162). Absent for every type whose category already answers correctly —
   *  which was all of them until the car hire, where `transport`'s hours turned a
   *  five-day booking into "120 ש׳".
   *
   *  Optional rather than a required column, so the category stays the default and
   *  this table only carries the exceptions. Read through `bookingTypeDurationUnit`,
   *  never off the profile directly. */
  durationUnit?: DurationUnit;
  /** **What a fresh schedule of this type OFFERS before you type it** (field report #11).
   *  Required rather than optional, so a new booking type has to say which of the three
   *  answers it is instead of silently inheriting one. See `BookingTimeOffer`. */
  times: BookingTimeOffer;
  /** **Where this type's title comes from** (ADR-0163). `'route'` derives it from the
   *  two endpoints (ADR-0059 §3: nobody names a flight, so `origin ← dest` IS its name);
   *  `'name'` means the booking carries one of its own.
   *
   *  **A separate axis from `places`, and that is the whole point.** Until the car hire
   *  the two moved together, so `carriesRoute` was doing both jobs and a hire — which
   *  carries a route and is *called* Hertz — came out named `נריטה ← נריטה`. Read through
   *  `titlesFromRoute`, never by asking whether the type has a route. */
  titleFrom: 'route' | 'name';
  /** **Is the WHOLE of this type's span time spent in motion, being carried?**
   *  (ADR-0061's 2026-08-14 amendment.) A flight, a train and a bus hold you for their
   *  entire length — which is why a night inside one is a night nobody books a bed for.
   *
   *  **Not `carriesRoute`, and the car hire is why.** A hire carries a route and spans
   *  two instants like the three above, but its span is a period you HOLD the vehicle,
   *  most of which is parked while you sleep somewhere; reading it as motion would tell
   *  a five-day rental that it needs no lodging at all. Optional, so the table carries
   *  only the types this is true of. Read through `spendsSpanInMotion`. */
  inMotion?: boolean;
  /** **What kind of place this type's ROUTE endpoints are** (ADR-0203 §8). A flight's leg
   *  wants an airport, a train's wants a platform.
   *
   *  This replaces a conditional at the call site, and that is the reason it is here rather
   *  than staying there. `BookingSheet.findPlace` asked `type === BOOKING_TYPE.FLIGHT` and
   *  its own comment named what that cost: _"a train's stop is a station this restriction
   *  has no type for yet"_ — so a train, a bus and a ferry endpoint searched the whole
   *  corpus. One column, and a new transport mode answers it by existing.
   *
   *  Optional, because it is a property of a ROUTE and `places: 'single'` types have none
   *  to restrict — a hotel's place is a hotel, and a restaurant's is a restaurant. Read
   *  through `placeSearchKindFor`. */
  searchKind?: PlaceSearchKind;
}

/** **The clock the day is assumed to begin on** (owner, field report #11: _"most events
 *  are at least on the day start, so like 7:00 should be the default starting time"_).
 *  Named once and referenced by every `duration` row below, so re-tuning it is one edit. */
export const DAY_START_TIME = '07:00';

/** **What a fresh schedule of this type offers**, before anything is typed (field report
 *  #11). Every offer is an opening position the traveller edits, never a stored fact and
 *  never a refusal — and the three kinds exist because the three situations are genuinely
 *  different, not because the values differ.
 *
 *  The `none` row is the one worth defending. ADR-0171 §1 split a timestamp's meaning into
 *  `exact` / `not-before` / `not-after`, and a journey's ends are `exact`: the carrier
 *  chose them, and a guessed departure would put a **false instant on a hard commitment** —
 *  the one thing an offer must never do. Note that this is also why `typicalMinutes` cannot
 *  be the universal answer: `transport` carries the ordinary 60 and says in its own comment
 *  that it means nothing by it, because a journey's length comes from its two ends. */
export type BookingTimeOffer =
  /** A convention the world already fixed, so the app can state it: a room from 15:00, a
   *  counter that opens at 10:00. The end is a **second clock** rather than a length —
   *  a check-in moved to 18:00 does not move check-out to 13:00 — landing on whatever day
   *  `bookingSpanDayOffset` puts it. */
  | { kind: 'convention'; start: string; end: string }
  /** No convention, so: the day's own start, and an end a typical length after whatever
   *  the start ends up being. The length is the category's `typicalMinutes` (ADR-0161 §5),
   *  which already answers "how long is one of these" — a meal 90 minutes, a museum 120 —
   *  rather than a second per-type list saying the same thing again. */
  | { kind: 'duration'; start: string }
  /** Nothing may be guessed. */
  | { kind: 'none' };

/** What makes two bookings one journey, and what makes the join a tight one. */
export interface ConnectionWindow {
  /** Longest gap between an arrival and the next departure that still reads as one
   *  journey. Beyond it they are two journeys that happen to touch. */
  maxGapMinutes: number;
  /** At or below this, the connection is called short — a description, not a warning:
   *  the app does not know your terminal, and a `--miss` treatment would claim
   *  something has already gone wrong. */
  tightMinutes: number;
}

const MINUTES_PER_HOUR = 60;

/** A route-shaped type: two endpoints, a round trip is a mirror of them, and a
 *  connection is a sequence of them. The window differs per type, so each type
 *  supplies its own below rather than sharing this one. */
const transportProfile = (
  sequence: ConnectionWindow,
  searchKind: PlaceSearchKind,
): BookingTypeProfile => ({
  places: 'route',
  searchKind,
  schedule: 'span',
  defaultKind: 'hard',
  legs: { mirrored: true, sequence },
  // A departure is the commitment itself, so it is never guessed (field report #11).
  times: { kind: 'none' },
  // Nobody names a flight or a train (ADR-0059 §3) — the route IS the name.
  titleFrom: 'route',
  // You are carried for the whole of it, so a night inside one needs no bed. Set here
  // rather than per row, so a future carried mode inherits it by being one of these.
  inMotion: true,
});

/** No second journey of any shape. */
const ONE_JOURNEY = { mirrored: false, sequence: null } as const;

export const BOOKING_TYPE_PROFILE = {
  // A layover, by the aviation line that separates one from a stopover.
  flight: transportProfile(
    { maxGapMinutes: 24 * MINUTES_PER_HOUR, tightMinutes: 90 },
    PLACE_SEARCH_KIND.AIRPORT,
  ),
  train: transportProfile(
    { maxGapMinutes: 6 * MINUTES_PER_HOUR, tightMinutes: 20 },
    PLACE_SEARCH_KIND.TRAIN_STATION,
  ),
  // **The third transport mode** (ADR-0156). It carries a route, spans two instants, is a
  // real commitment, can be bought as a round trip and can be changed halfway — exactly
  // like the two above, and on a platform's timescale rather than an airport's.
  transit: transportProfile(
    { maxGapMinutes: 6 * MINUTES_PER_HOUR, tightMinutes: 20 },
    // A bus or a ferry stops at a platform or a quay, not a rail station — the wider kind.
    PLACE_SEARCH_KIND.TRANSIT_STATION,
  ),
  // **The fourth transport mode** (ADR-0162) — and the first that is NOT
  // `transportProfile`, which is the whole point of it. A hire carries a route
  // (pick-up → drop-off) and spans two instants like the three above, but the `legs`
  // axis inverts: you are driving the vehicle, so there is no return leg to buy
  // (`mirrored` would author a SECOND rental) and no connection to make (two hires
  // four hours apart are two hires, not one journey with a change).
  //
  // `durationUnit` is the other half: `transport` reads in hours because a flight is
  // hours even overnight, and a five-day hire read "120 ש׳". You hold a car in days.
  //
  // `titleFrom: 'name'` is the third disagreement, and ADR-0163 is the report that found
  // it: a hire is CALLED something — Hertz, Europcar — where a flight is not. Deriving
  // its title from its route named a same-counter hire `נריטה ← נריטה`.
  car: {
    places: 'route',
    schedule: 'span',
    defaultKind: 'hard',
    legs: ONE_JOURNEY,
    durationUnit: 'auto',
    // A counter opens in the morning and wants the car back at the hour you took it —
    // two clocks, not a length (ADR-0171's floor/deadline pair, reached here through
    // `🚗`'s `held` middle).
    times: { kind: 'convention', start: '10:00', end: '10:00' },
    titleFrom: 'name',
  },
  // A stay is two endpoints at ONE place — which is why `places` and `schedule` are
  // separate axes rather than one "is it transport" flag.
  hotel: {
    places: 'single',
    schedule: 'span',
    defaultKind: 'hard',
    legs: ONE_JOURNEY,
    // The industry's own floor and deadline, not an estimate of yours — and the one type
    // whose end lands on a different DAY, which `bookingSpanDayOffset` reads off `nights`.
    times: { kind: 'convention', start: '15:00', end: '10:00' },
    titleFrom: 'name',
  },
  activity: {
    places: 'single',
    schedule: 'span',
    defaultKind: 'hard',
    legs: ONE_JOURNEY,
    times: { kind: 'duration', start: DAY_START_TIME },
    titleFrom: 'name',
  },
  restaurant: {
    places: 'single',
    schedule: 'point',
    defaultKind: 'soft',
    legs: ONE_JOURNEY,
    times: { kind: 'duration', start: DAY_START_TIME },
    titleFrom: 'name',
  },
  other: {
    places: 'single',
    schedule: 'point',
    defaultKind: 'soft',
    legs: ONE_JOURNEY,
    times: { kind: 'duration', start: DAY_START_TIME },
    titleFrom: 'name',
  },
} as const satisfies Record<BookingType, BookingTypeProfile>;

/** **Does this booking type carry a route** (`fromPlaceId`/`toPlaceId`) rather than a
 *  single `placeId`? The one definition behind every surface that used to ask "is it
 *  transport" — the form fields, the title, the map reference, the location fact, and
 *  the server's own `assertPlaceShape` guard. */
export const carriesRoute = (type: BookingType): boolean =>
  BOOKING_TYPE_PROFILE[type].places === 'route';

/** **Is this type's title derived from its route** rather than carried as its own name
 *  (ADR-0059 §3, made its own axis by ADR-0163)?
 *
 *  Deliberately NOT `carriesRoute` — the two answered together until the car hire, which
 *  carries a route (two counters) and has a name (the rental company). Asking the wrong
 *  one of the two is exactly how `נריטה ← נריטה` got saved as a booking's title. */
export const titlesFromRoute = (type: BookingType): boolean =>
  BOOKING_TYPE_PROFILE[type].titleFrom === 'route';

/** **What kind of place this type's route endpoints are** (ADR-0203 §8), or `undefined` for
 *  a type whose place is not a route endpoint at all. See `BookingTypeProfile.searchKind`. */
export const placeSearchKindFor = (type: BookingType): PlaceSearchKind | undefined => {
  // Widened to the interface deliberately, same as `bookingTypeDurationUnit` and
  // `spendsSpanInMotion`: `as const satisfies` narrows each row to its own shape, on which
  // an OPTIONAL field simply isn't a property to read.
  const profile: BookingTypeProfile = BOOKING_TYPE_PROFILE[type];
  return profile.searchKind;
};

/** Two-endpoint schedule (start + end, may span days) rather than a point on a day. */
export const hasSpanSchedule = (type: BookingType): boolean =>
  BOOKING_TYPE_PROFILE[type].schedule === 'span';

/** **Is this type's span time spent being carried** rather than time spent somewhere
 *  (ADR-0061's 2026-08-14 amendment)? The one question behind "was there a bed-shaped
 *  gap in this night" — see `BookingTypeProfile.inMotion` for why it is not `carriesRoute`. */
export const spendsSpanInMotion = (type: BookingType): boolean => {
  // Widened to the interface deliberately, same as `bookingTypeDurationUnit` above:
  // `as const satisfies` narrows each row to its own shape, on which an OPTIONAL field
  // simply isn't a property to read.
  const profile: BookingTypeProfile = BOOKING_TYPE_PROFILE[type];
  return profile.inMotion === true;
};

/** The commitment a fresh booking of this type opens with (ADR-0011 / ADR-0136 §4). */
export const defaultKindForBookingType = (type: BookingType): EventKind =>
  BOOKING_TYPE_PROFILE[type].defaultKind;

/** **The unit a BOOKING of this type reads its length in** — the type's own answer
 *  where it has one (ADR-0162), else its category's. The type is the authority here
 *  and the category is the fallback, which is the same precedence `bookingDurationUnit`
 *  already documented: a booked event's category is icon-overridable, so a hire badged
 *  ⭐ must still read in days. */
export const bookingTypeDurationUnit = (type: BookingType): DurationUnit => {
  // Widened to the interface deliberately: `as const satisfies` narrows each row to its
  // own literal shape, on which an OPTIONAL field simply isn't a property to read.
  const profile: BookingTypeProfile = BOOKING_TYPE_PROFILE[type];
  return profile.durationUnit ?? CATEGORY_TIME_PROFILE[BOOKING_TYPE_TO_CATEGORY[type]].durationUnit;
};

/** **What a fresh schedule of this type offers** (field report #11) — the profile's own
 *  row, widened to the interface so the union reads as the union rather than as whichever
 *  literal shape `as const satisfies` narrowed that row to. */
export const bookingTimeOffer = (type: BookingType): BookingTimeOffer => {
  const profile: BookingTypeProfile = BOOKING_TYPE_PROFILE[type];
  return profile.times;
};

/** **How long one of THESE usually runs**, in minutes — the category's `typicalMinutes`
 *  (ADR-0161 §5) reached through the booking type, which is the length a `duration` offer
 *  puts between the two ends it fills in. */
export const bookingTypicalMinutes = (type: BookingType): number =>
  typicalMinutesFor(BOOKING_TYPE_TO_CATEGORY[type]);

/** **How many days after its start a span of this type ENDS on**, as an opening offer
 *  (field report #4). Read off the unit the type already reads its length in rather than
 *  from a second per-type list: a stay counted in **nights** cannot be zero of them, so a
 *  check-out opens on the day after the check-in, and everything measured in hours or days
 *  opens on the same day. One axis, already answered, doing a second job — which is why
 *  there is no `endDayOffset` field inside `times` above. */
export const bookingSpanDayOffset = (type: BookingType): number =>
  bookingTypeDurationUnit(type) === 'nights' ? 1 : 0;

/** Can one save of this type author a mirrored return leg (ADR-0154 §4)? */
export const authorsRoundTrip = (type: BookingType): boolean =>
  BOOKING_TYPE_PROFILE[type].legs.mirrored;

/** Can a journey of this type be broken by stops — a layover, a change of train
 *  (ADR-0159)? The window that decides when two legs are one journey, or `null`. */
export const connectionWindow = (type: BookingType): ConnectionWindow | null =>
  BOOKING_TYPE_PROFILE[type].legs.sequence;

/** Is this join a short one? False for a type that has no connections at all, which
 *  is the honest answer rather than a thrown error: nothing is short about a hotel. */
export const isTightConnection = (type: BookingType, minutes: number): boolean => {
  const window = connectionWindow(type);
  return window != null && minutes <= window.tightMinutes;
};
