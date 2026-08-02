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

import type { BookingType, EventCategory, EventKind, TripEvent } from './entities';
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
 *  event derives its category from the linked `Booking.type`. */
export const BOOKING_TYPE_CATEGORY: Record<BookingType, EventCategory> = {
  flight: 'transport',
  train: 'transport',
  transit: 'transport',
  hotel: 'lodging',
  restaurant: 'food',
  activity: 'activity',
  other: 'other',
};

export const categoryForBookingType = (type: BookingType): EventCategory =>
  BOOKING_TYPE_CATEGORY[type];

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
  /** How this category's *duration* reads when shown in a preview (ADR-0063
   *  extension): transport in **hours** (a flight is hours, even overnight),
   *  lodging in **nights**, everything else **auto** — hours when it stays on one
   *  calendar day, days when it spans days. Derived display only; the frontend
   *  formatter turns it into words. */
  durationUnit: DurationUnit;
}

/** The unit a category's duration is expressed in (ADR-0063 extension). */
export type DurationUnit = 'hours' | 'nights' | 'auto';

const ORDINARY_PROFILE: CategoryTimeProfile = {
  bracketed: false,
  ambientWhenMultiDay: false,
  durationUnit: 'auto',
};

export const CATEGORY_TIME_PROFILE: Record<EventCategory, CategoryTimeProfile> = {
  // Generic transport wording (departure/arrival) is correct for every mode — a
  // train, bus, ferry or car all leave and arrive. A mode whose vocabulary
  // differs (aviation's take-off/landing) refines it per-glyph via
  // `ICON_TRANSITION_KEYS`; nothing hard-codes flight words for the category.
  transport: {
    bracketed: true,
    ambientWhenMultiDay: true,
    transitions: { startKey: 'departure', endKey: 'arrival' },
    durationUnit: 'hours',
  },
  lodging: {
    bracketed: true,
    ambientWhenMultiDay: true,
    transitions: { startKey: 'checkIn', endKey: 'checkOut' },
    durationUnit: 'nights',
  },
  food: ORDINARY_PROFILE,
  sightseeing: ORDINARY_PROFILE,
  nature: ORDINARY_PROFILE,
  activity: ORDINARY_PROFILE,
  shopping: ORDINARY_PROFILE,
  services: ORDINARY_PROFILE,
  other: ORDINARY_PROFILE,
};

/** Per-glyph transition-wording overrides for modes whose ends read differently
 *  from their category default (ADR-0063 refinement). A flight's ends are
 *  take-off / landing, not the generic departure / arrival every other transport
 *  mode uses. Bounded and declarative like the icon set itself (ADR-0038): a new
 *  mode with distinct wording adds a glyph here and every time-aware surface
 *  (hero, glance markers, day entries) picks it up — no per-screen branching. */
export const ICON_TRANSITION_KEYS: Record<string, { startKey: string; endKey: string }> = {
  '✈️': { startKey: 'flightDeparture', endKey: 'flightArrival' },
};

/** The profile for an event's category. A null/unset category (ADR-0038) uses
 *  the ordinary profile (a plain point/block). */
const profileFor = (category: EventCategory | null | undefined): CategoryTimeProfile =>
  category != null ? CATEGORY_TIME_PROFILE[category] : ORDINARY_PROFILE;

/** The two i18n transition keys for a bracketed event's ends, or `undefined`
 *  when its category isn't bracketed. Resolves finer than category so wording is
 *  by mode, not hard-coded: an event's own glyph (`ICON_TRANSITION_KEYS`) wins
 *  over the category default — a train reads departure/arrival, a flight reads
 *  take-off/landing — with the category profile as the fallback for every other
 *  glyph and for manual (non-booking) events (ADR-0063 §4). */
export const eventTransitionKeys = (
  event: Pick<TripEvent, 'category' | 'icon'>,
): { startKey: string; endKey: string } | undefined => {
  const override = event.icon != null ? ICON_TRANSITION_KEYS[event.icon] : undefined;
  return override ?? profileFor(event.category).transitions;
};

/** The unit an event's duration reads in, from its category profile (ADR-0063
 *  extension). Keys on `category` so every surface formats duration the same way
 *  — no per-type branching. A null/unset category uses the ordinary 'auto'. */
export const eventDurationUnit = (event: Pick<TripEvent, 'category'>): DurationUnit =>
  profileFor(event.category).durationUnit;

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
}

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
const transportProfile = (sequence: ConnectionWindow): BookingTypeProfile => ({
  places: 'route',
  schedule: 'span',
  defaultKind: 'hard',
  legs: { mirrored: true, sequence },
});

/** No second journey of any shape. */
const ONE_JOURNEY = { mirrored: false, sequence: null } as const;

export const BOOKING_TYPE_PROFILE = {
  // A layover, by the aviation line that separates one from a stopover.
  flight: transportProfile({ maxGapMinutes: 24 * MINUTES_PER_HOUR, tightMinutes: 90 }),
  train: transportProfile({ maxGapMinutes: 6 * MINUTES_PER_HOUR, tightMinutes: 20 }),
  // **The third transport mode** (ADR-0156). It carries a route, spans two instants, is a
  // real commitment, can be bought as a round trip and can be changed halfway — exactly
  // like the two above, and on a platform's timescale rather than an airport's.
  transit: transportProfile({ maxGapMinutes: 6 * MINUTES_PER_HOUR, tightMinutes: 20 }),
  // A stay is two endpoints at ONE place — which is why `places` and `schedule` are
  // separate axes rather than one "is it transport" flag.
  hotel: { places: 'single', schedule: 'span', defaultKind: 'hard', legs: ONE_JOURNEY },
  activity: { places: 'single', schedule: 'span', defaultKind: 'hard', legs: ONE_JOURNEY },
  restaurant: { places: 'single', schedule: 'point', defaultKind: 'soft', legs: ONE_JOURNEY },
  other: { places: 'single', schedule: 'point', defaultKind: 'soft', legs: ONE_JOURNEY },
} as const satisfies Record<BookingType, BookingTypeProfile>;

/** **Does this booking type carry a route** (`fromPlaceId`/`toPlaceId`) rather than a
 *  single `placeId`? The one definition behind every surface that used to ask "is it
 *  transport" — the form fields, the title, the map reference, the location fact, and
 *  the server's own `assertPlaceShape` guard. */
export const carriesRoute = (type: BookingType): boolean =>
  BOOKING_TYPE_PROFILE[type].places === 'route';

/** Two-endpoint schedule (start + end, may span days) rather than a point on a day. */
export const hasSpanSchedule = (type: BookingType): boolean =>
  BOOKING_TYPE_PROFILE[type].schedule === 'span';

/** The commitment a fresh booking of this type opens with (ADR-0011 / ADR-0136 §4). */
export const defaultKindForBookingType = (type: BookingType): EventKind =>
  BOOKING_TYPE_PROFILE[type].defaultKind;

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
