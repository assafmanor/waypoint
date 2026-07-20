# 0088 — Home WiFi quick-access is gated to the hotel stay

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Refines:** [0050](0050-home-quick-access-deep-links-and-empty-states.md) (the derived WiFi quick-access tile this narrows), [0047](0047-booking-event-linkage-and-notes.md) (§6 — WiFi comes from the hotel `Booking`'s `details.wifi`), [0059](0059-booking-presentation-on-home-and-index.md) ("inside a booking = where you are"; a bracketed booking surfaces only at the moments it's relevant), [0064](0064-day-transition-entries-and-home-band-trim.md) (mid-stay treatment gated strictly inside the span)

## Context

ADR-0047 §6 moved hotel WiFi onto the hotel `Booking`'s `details.wifi`, and ADR-0050 made the Home quick-access WiFi tile a derived shortcut ("no active/next hotel `Booking` with WiFi → no WiFi tile"). But the shipped `hotelWifi(bookings)` derivation only checked _existence_ — it returned the first hotel booking's WiFi regardless of dates, so the tile showed the WiFi password across the **whole trip**: weeks before check-in and after you'd already checked out.

That contradicts the shortcut's purpose (the password is useful only once you're on the property) and the "inside a booking = where you are" grammar ADR-0059/0064 established for every other hotel treatment — the hero transition windows and the mid-stay band are both gated strictly inside the check-in→check-out span, while the WiFi tile alone ignored it.

## Decision

**The Home WiFi tile surfaces only while you're checked in — `check-in ≤ now < check-out` of the hotel booking's linked stay event.**

- A hotel booking's stay window lives on its **linked event** (`startsAt` = check-in, `endsAt` = check-out; ADR-0047/0048). Among hotel bookings carrying `details.wifi`, the tile shows the one whose linked-event span currently contains `now`. Before check-in and after check-out the tile is **absent** and the quick-access grid reflows (ADR-0050), exactly as it does when there's no source at all.
- **A hotel with WiFi but no linked stay event has no known window, so it falls back to being shown.** We can't gate what has no dates, and hiding a user's WiFi merely for lacking a schedule is the worse surprise; only a hotel that _was_ given a check-in/check-out span gets the during-stay gating.
- The derivation moves from a local helper in `screens/Home.tsx` to a pure, unit-tested `hotelWifi(bookings, events, now)` in `lib/home-quick.ts`, beside `nextCodedBooking` (the other derived quick-access tile).

## Consequences

- The WiFi password shows exactly when it's useful and disappears when it isn't — no more a trip-long always-on tile. The copy-to-clipboard action and the tile's markup are unchanged; only its presence is now gated.
- Frontend + derivation only. No schema, backend, or `@waypoint/shared` change — the stay span already lives on the linked event.
- Multiple hotels are handled: the active stay's WiFi wins; an unscheduled hotel is the fallback only when no stay contains `now`.
- The dev seed's hotel (`bk-hotel`) currently has no linked stay event, so the seeded demo is unchanged (fallback path). Exercising the gating in the demo would need a dated hotel booking — left out of this change.

## Alternatives considered

- **Show for the active _or next_ hotel (ADR-0047 §6's "active/next" wording).** Rejected: surfacing the password before you've arrived is the pre-check-in over-exposure ADR-0064 §A already ruled against for the hero/band. "During the stay" is the useful window.
- **Hide the tile for a hotel with WiFi but no scheduled stay (strict).** Rejected: with no dates there's no stay to be "inside," and silently hiding a password a user deliberately entered is a worse failure than showing it; the fallback preserves today's behaviour for undated hotels.
- **Store a computed "checked-in" flag.** Rejected: presence is derived from the clock + the linked event, never stored (ADR-0018/0043), like every other Home derivation.
