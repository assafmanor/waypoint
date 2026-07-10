# 0018 — Timeline & data-model shape

**Status:** Accepted
**Date:** 2026-07-10
**Supersedes parts of:** the original `data-model.md` sketch (Day table, `EventStatus.now`, `Booking.offlineAvailable`).

## Context

The scaffold's data model (from planning) modeled several things as **stored state that is actually derived**, and left the timeline model ambiguous for multi-day items. The T-025 architecture review (see `planning/2026-07-10-session-03-architecture-review.md`) went through it field by field.

## Decision

1. **Drop the `Day` table; put `date DATE` on `Event`.** A trip "day" is just a calendar date in the trip's range — derivable, not an entity. The `Day` row bought one nullable `label` and cost a lifecycle (create-on-trip, reconcile-on-date-change, and a **cascade-delete that would take events with it**), a second source of truth for "when", and a join on every itinerary read. Empty days (which Plan mode renders as "gaps to fill") derive from the trip range. Optional day labels, if ever wanted, become a `Trip.dayLabels Json?` keyed by date.

2. **Remove `now` from `EventStatus`.** "Now" is a function of the clock, not stored state — storing it needs something to flip it and shows stale "now" on an offline phone. Statuses are `planned | done | skipped`; the amber "now" treatment is computed client-side from `startsAt/endsAt` vs. the current time.

3. **Times are UTC instants; display converts through `Trip.timezone`.** `startsAt/endsAt` are UTC `DateTime`. A trip has one timezone (fine for a single-country trip; a per-event tz override is a non-breaking future add). Overnight/midnight-crossing blocks (a 23:00→06:00 flight) are one point-in-time event whose `endsAt` lands on the next date — no special modeling.

4. **`Event.endDate DATE?` for genuine multi-day _spans_.** Null (>99% of events) = single-day point-in-time block anchored to `date`. Non-null = an **ambient span** (`date..endDate`) — a multi-day wedding, a festival — rendered as a strip across those days (the same treatment as a hotel `Booking` with a date range), **not** duplicated as a block per day. This distinguishes point-in-time blocks (timeline) from ambient spans (framing).

5. **Client-generated entity IDs.** The client mints the id (cuid/uuid; server validates format). This deletes the offline temp-id→real-id swap, makes creates idempotent on retry (re-POST → unique violation → already-applied), and lets undo-of-delete restore the exact row so references survive. Server still owns `seq`, `updatedAt`, and authorization. (Enables ADR-0019.)

6. **Uniform audit columns** — `createdAt`, `updatedAt`, `updatedBy` (and `createdBy` where relevant) on every entity a member can mutate (Trip, Event, Booking, MaybeItem, Document, TripNote), not just Event — LWW arbitration and the change-feed need them everywhere. `Trip.createdBy` becomes a real FK.

7. **Drop `Booking.offlineAvailable`.** A whole trip is a few hundred small rows; the client mirrors all of it. Selective per-row caching flags earn nothing and complicate the offline layer.

8. **Roles: `MembershipRole { admin, peer }`** — the trip creator is `admin`; joiners are `peer`. Structural from day one so we never backfill "who's the admin". Enforcement is minimal/deferred (see ADR-0005).

9. **Practical layer, minimal:** emergency numbers = static frontend data keyed by country (no DB); budget = `Trip.currency String?` + `Trip.dailyBudgetMinor Int?`; WiFi codes / notes = a small `TripNote` table.

## Consequences

- Fewer entities, fewer lifecycle traps, no derived-state drift. Itinerary reads are `Event`s filtered/grouped by `date` client-side.
- `move` takes `{ date?, startsAt?, sortOrder? }` instead of an FK day lookup; `GET /days` → `GET /events` (see api-contract.md).
- Multi-day rendering has one rule: _anything with a date range (Booking across nights, or Event with `endDate`) → ambient strip; point-in-time → timeline block._
- Applied to `schema.prisma` + `packages/shared` + a migration in **T-026** (this ADR is the spec).

## Alternatives considered

- **Keep `Day` for explicit ordering:** rejected — `sortOrder` within a `date` gives ordering without the entity + cascade risk.
- **`endDate` vs. per-day duplicated events for multi-day:** duplication has no umbrella entity and N rows to keep in sync; one nullable column is cheaper and truthful.
- **Server-assigned ids:** rejected — forces the temp-id swap and non-idempotent creates in the offline path.
