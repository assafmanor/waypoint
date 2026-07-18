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

import type { BookingType, EventCategory, TripEvent } from './entities';

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

const normalizeTerm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/["'`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Vibe glyphs whose terms match a search query (empty query → none; the picker
 *  shows the spaced clusters instead). */
export const searchVibeIcons = (query: string): readonly string[] => {
  const q = normalizeTerm(query);
  if (!q) return [];
  return TRIP_ICON_SET.filter((g) =>
    (TRIP_VIBE_TERMS[g] ?? []).some((term) => normalizeTerm(term).includes(q)),
  );
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
}

const ORDINARY_PROFILE: CategoryTimeProfile = { bracketed: false, ambientWhenMultiDay: false };

export const CATEGORY_TIME_PROFILE: Record<EventCategory, CategoryTimeProfile> = {
  transport: {
    bracketed: true,
    ambientWhenMultiDay: true,
    transitions: { startKey: 'departure', endKey: 'arrival' },
  },
  lodging: {
    bracketed: true,
    ambientWhenMultiDay: true,
    transitions: { startKey: 'checkIn', endKey: 'checkOut' },
  },
  food: ORDINARY_PROFILE,
  sightseeing: ORDINARY_PROFILE,
  nature: ORDINARY_PROFILE,
  activity: ORDINARY_PROFILE,
  shopping: ORDINARY_PROFILE,
  services: ORDINARY_PROFILE,
  other: ORDINARY_PROFILE,
};

/** The profile for an event's category. A null/unset category (ADR-0038) uses
 *  the ordinary profile (a plain point/block). */
const profileFor = (category: EventCategory | null | undefined): CategoryTimeProfile =>
  category != null ? CATEGORY_TIME_PROFILE[category] : ORDINARY_PROFILE;

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
