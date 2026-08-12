// The 9 EventCategory options for the shared category selector (ADR-0109 §11):
// the same `ChoiceGrid` the booking-type picker uses, reused by EventForm and the
// maybe-shelf add flow (frontend CLAUDE.md rule 8 — one options list, not two).
// Glyph = the category's default icon; NO colour swatch — 5 of the 9 fold to the
// single `leisure` pin hue, so repeated swatches would misread as duplicates
// (the category→colour mapping lives on the pin/legend, not the selector).
import { EVENT_CATEGORY, iconForCategory, type EventCategory } from '@waypoint/shared';
import { t } from '../i18n/he';

export const EVENT_CATEGORY_OPTIONS: {
  value: EventCategory;
  icon: string;
  label: string;
}[] = Object.values(EVENT_CATEGORY).map((c) => ({
  value: c,
  icon: iconForCategory(c),
  label: t.iconPicker.categories[c],
}));

/** **"No answer of its own"**, as a `ChoiceGrid` option value — what `CategoryField`'s
 *  leading pill carries, and the only way back to `undefined` from a grid whose `onChange`
 *  only ever sets.
 *
 *  A sentinel rather than a primitive change, because the app already does exactly this:
 *  `IndexNotesView`'s filter row prepends `NOTE_CATEGORY_ALL` to this same list. Prefixed so
 *  it can never collide with an `EventCategory` value, present or future. */
export const NO_CATEGORY = '@none' as const;
