# Session 43 — A booking's category comes from its type, not its icon

**Date:** 2026-07-19
**ADRs touched:** [0038](../decisions/0038-icons-and-canonical-category.md) (amendment), [0084](../decisions/0084-booking-duration-display.md) (amendment), [0083](../decisions/0083-whenfield-datetime-standard.md) (WhenField `durationUnit`)

## The bug

A hotel (`מלון הכוכבים`, a 2-night stay 07-15 → 07-17) read its duration in **days**:

- the Index row showed `... · 3 ימים` instead of `2 לילות`;
- the booking edit form's span read-out showed `משך: יום · חוצה יממה` instead of `2 לילות`.

## Root cause

Duration keys on the linked event's `category` (ADR-0084 via ADR-0063). That hotel's event carried `category: 'other'`, not `lodging` — because the booking had a ⭐ badge icon, and the booking form let the IconPicker's per-glyph category suggestion (`⭐` is in the `general` group → `other`) overwrite the type-derived category. So `eventDurationUnit` picked `auto` → days. The check-in/out **labels** were still correct because `timingLabels` keys on `booking.type` — that inconsistency (labels from type, duration from category) was the tell.

This contradicted ADR-0038 §4 ("a booked event derives its category from `Booking.type`"). Per the user: the icon must never influence the category — a booking selected as lodging is lodging, for every type.

## The fix

- **Source (`BookingSheet`):** `category` is no longer state fed by the picker; it's derived `= BOOKING_TYPE_TO_CATEGORY[type]`. The IconPicker's `onChange` sets the badge glyph only (its category suggestion is ignored for bookings). So a ⭐ hotel stays `lodging`, and _all_ category-keyed behaviour (nights, check-in/out bracketing, ambient backdrop) follows the type. The icon→category suggestion still applies where there's no type — the manual `EventForm` and the maybe-shelf.
- **Display robustness (`lib/booking-timing`):** `bookingDurationUnit(type)` resolves the unit from the booking type; `formatBookingDuration` takes it as an optional third arg. The Index row and `BookingDetail` pass it, so a booking reads correctly even if its event was mis-saved before the source fix (legacy data), without a re-save.
- **Edit form read-out (`WhenField`):** the `span` variant takes a `durationUnit`; for `nights` it phrases the two calendar days as לילות (no "crosses a day" note). `BookingSheet` passes `bookingDurationUnit(type)`.

## Notes / limits

- Legacy events mis-saved with a wrong category self-correct on their next save (the form now writes the type's category). The _duration_ surfaces are robust before that; other category-keyed surfaces (Home board bracketing, glance markers) correct on re-save. Full read-side normalization of legacy booked-event categories wasn't needed for anything reported — left out (YAGNI).
- Tests added: `booking-timing.test.ts` (unit override + `bookingDurationUnit`), `WhenField.test.tsx` (nights read-out). Suite green (533), typecheck + build + lint clean.
