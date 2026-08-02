# 0156 — A bus is transport: the third mode the picker always meant

**Status:** Accepted. **Built 2026-08-02.**
**Date:** 2026-08-02

**Closes** the gap [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §7 stated and deliberately left open: _"A real third transport mode. The `🚌 אחר` gap above is stated, not closed — once §2 lands it is one row, and it should be taken as its own change with its own migration."_ This is that change.
**Rides** 0154 §2's `BOOKING_TYPE_PROFILE` — the claim that table made was that a new mode is **one row**, and this is the first time anything has tested it.
**Applies unchanged** [0048](0048-index-build-data-model-refinements.md) (the route/single-place invariant, enforced server-side from the shared profile), [0136](0136-an-event-can-also-be-booked.md) §2 (the transport pills are the one question the category cannot answer) and §4 (booked-ness and commitment are different axes), [0038](0038-icons-and-canonical-category.md), [0102](0102-index-search-and-filter.md) (the search vocabulary per type).

## Context

`TRANSPORT_BOOKING_TYPES` has offered three pills since the picker shipped — `✈️ טיסה`, `🚄 רכבת`, `🚌 אחר` — and the third one wrote `other`.

`other` is not route-shaped. So a bus booked from `EventForm` saved with a single `placeId`; `BookingSheet` never showed it a route field; and it could **never be given one**. It also lost everything a route buys: the route title (0059 §3), the location fact, the map pin, `ניווט`, the per-endpoint zones, the Plan readiness count.

**The picker was lying, and two smaller things in the code were saying so out loud.** Its glyph had to be spelled `🚌` inline rather than read from `BOOKING_TYPE_ICON`, because that table said `📄` — a document among two vehicles. And `icons.test.ts` carried an assertion whose comment named the contradiction and pinned it, so that closing it would be a decision rather than a drift:

> `other` is the one that reads wrong to a human — `TRANSPORT_BOOKING_TYPES` offers it as 🚌 in the event form — and the model says it is not a route.

## Decision

### 1. `transit` is a `BookingType`, and it carries `TRANSPORT_PROFILE` verbatim

One member in `bookingTypeSchema`, one in `BOOKING_TYPE`, one in the Prisma enum, and one row in each of the four `Record<BookingType, …>` tables. Its profile is the **same object** flight and train use: a bus, a ferry or a car hire carries a route, spans two instants, is a real commitment, and can be bought as a round trip. Nothing needed a new branch, which is what 0154 §2 promised and had not yet been asked to prove.

**Named `transit` rather than `bus`** because the pill has always covered bus, ferry, car hire and cable car; naming it after one of the four would be the same kind of lie, one level down. Hebrew `נסיעה` for the same reason — `אוטובוס` is wrong on a ferry, and `תחבורה` is the **category's** name, not a booking's.

### 2. `other` goes back to meaning what it says

Not transport. A shopping reservation, a service, a booking that is none of the above. It keeps `places: 'single'`, and the picker no longer offers it under transport.

### 3. The migration is additive, and there is **no backfill**

Postgres cannot remove an enum value without rewriting the type, and there is nothing to remove. The harder half is what NOT to do: an existing `other` booking might be a bus or might be a theatre ticket, and **nothing stored distinguishes them**. A guess would silently re-type real rows — and re-typing one to `transit` would then demand a route the row does not have, turning a saved booking into one that cannot be saved again.

So existing rows keep their type. The pill writes the right one from now on. A user who wants an old bus to become a real journey re-types it themselves, which is one tap in the edit sheet and is the only place the knowledge exists.

### 4. `transit` is **hard**, and that changes one shipped behaviour

`other` is not a span type, so `defaultKindForBookingType` opened it **soft**. `transit` is a span type, so it opens **hard** — a booked bus is as much a commitment as a booked train, and 0136 §4's "commitment has one source" is what makes that automatic rather than special-cased.

The visible consequence: picking the third transport pill used to give you a soft event and now gives you a hard one, which is guarded on edit (0011). That is the correct reading of what the pill means, and it is stated here because it is the one behaviour a user could notice changing under them.

## Consequences

- **`TRANSPORT_BOOKING_TYPES` is a list of types now, not of type-and-glyph pairs.** The glyph comes from `BOOKING_TYPE_ICON` like everyone else's, because the table finally has the right answer in it.
- **The search vocabulary matters more for this type than for any other.** Nobody searches for a bus by typing `נסיעה`; they type `אוטובוס`, `מעבורת`, `רכב שכור`, `הסעה`. So unlike `train` and `other`, whose synonym lists are deliberately empty, `transit`'s is the point rather than padding.
- **Three `icons.test.ts` enumerations gained a member**, including the one that pinned the gap open — its comment now records that the gap is closed rather than stated.
- **Three `EventForm` specs asserted the old behaviour and were rewritten, not relaxed.** One of them existed only to pin the contradiction; one asserted `other → soft`, which no longer happens inside the transport pills, so it now shows 0136 §4's axis where it still varies — across categories.
- **A fourth transport mode is one row.** Still true, and now demonstrated rather than claimed.

## Alternatives considered

- **Make `other` route-shaped.** Rejected: it is the catch-all for bookings that are not transport at all, and giving it a route would demand one from a shopping reservation.
- **Backfill `other` → `transit` for rows with a transport-ish title.** Rejected in §3 — a heuristic over free text, re-typing real rows, and the failure mode is a booking that can no longer be saved.
- **`bus` / `ground`.** Rejected in §1: `bus` names one of four, and `ground` excludes the ferry.
- **Keep the pill and drop the third option.** Rejected — the pill answers a real question, and a bus is the most commonly booked ground transport on a trip like this.
