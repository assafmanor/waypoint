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

import type { BookingType, EventCategory } from './entities';

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
