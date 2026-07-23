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
