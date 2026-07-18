# Session 34 — booking-presentation refinements (day transition entries + Home band trim)

**Date:** 2026-07-18
**Outcome:** [ADR-0064](../decisions/0064-day-transition-entries-and-home-band-trim.md) (Accepted). Follows the session-32/33 booking-presentation build (ADR-0059/0054/0063), which shipped earlier today.

## What happened

After the session-33 implementation landed (ADRs 0063/0059/0054/0035/0060/0061/0062 + four booking bug-fixes, all merged), Assaf reviewed the running app on the ground (screenshots of the Trip-mode Home and day screen, hotel "מלון קליפורניה") and raised two things, worked through as a design consult:

1. **The ambient "mid-stay" band is over-exposed and mistimed.** On Home it duplicates the WiFi tile + the glance check-in marker (a fourth "there is a hotel"), and it rendered `לילה 1 מתוך 2` at 16:51 while check-in was `17:00` — claiming occupancy before check-in.
2. **A multi-day bracket has no discrete entry in the day timeline.** As `isAmbient` it is excluded from `dayEvents`; on its end day the event's `date` doesn't match `activeDate` at all. So check-in/check-out (and departure/arrival) never appear as timed entries among the day's events.

## Decisions (the Q&A that shaped ADR-0064)

- **Same-day brackets stay one span row; only multi-day brackets split** into per-day start/end entries. (A same-day flight as two point-rows is noise; the gap is multi-day brackets showing nothing.)
- **One representation per covered day:** a transition entry on the check-in/checkout (departure/arrival) days; the backdrop strip only on **strictly-middle** nights (`date < activeDate < endDate`). This also removes the wrong checkout-day strip.
- **Transition entry behaviour:** a read-only reference row → the booking detail (ADR-0053); no inline settle/delay verbs (it is a derived view of one edge of a span); **Navigate on the start edge only** (check-in / departure), since that is the one on-the-ground verb that fits.
- **Home:** drop the persistent ambient band; the hero (transition moments + in-transit) and the glance markers already carry every edge. Any mid-stay treatment is gated strictly inside the stay span.

## Architecture agreed

- Lift the inline per-day start/end logic in `glance.ts` into one pure `bookingTransitionsOnDate(events, date)`; **both** the Home glance markers and the day entries derive from it.
- Day timeline consumes a typed `DayEntry` union (`event | transition`) — **no synthetic `TripEvent`s** (they would leak into ripple/verbs/write paths). Transitions merge into the top-level timeline sorted by instant; they do not nest/cluster.
- No data-model or backend change (all derived from `startsAt`/`endsAt`/`endDate`).

## Implementation split (for the follow-up build)

Two areas, overlapping in `glance.ts` / `he.ts` / `screens.css`, so **sequence rather than parallelise** (the shared derivation lands first):

1. **Shared derivation + day entries + strip rule** — `glance.ts` (extract `bookingTransitionsOnDate`), new `lib/day-entries.ts` (`DayEntry` + merge + tests), `DayView.tsx` (`TransitionRow` + merge + strictly-middle strip), `he.ts`, `screens.css`.
2. **Home band trim + timing** — `Home.tsx` (drop the persistent band; gate the mid-stay treatment inside-span), consuming the same shared derivation for its markers.

## Backlog

Pruned the shipped "Home & bookings triage" section (session-32/33 items — all merged) and the subsumed "board hero" / ambient lines; added the ADR-0064 build item.
