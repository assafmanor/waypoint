# Integrations — Overview

**Status:** PROPOSED. Governing principle: **integrations are pipes, not islands.**

## The principle

No integration gets its own screen. Each one **feeds the two existing surfaces** — the "Now/Next" timeline and the central index — by producing the same `Event` / `Booking` entities the UI already renders. The trip is the only surface.

## Account model (decided)

- **Each member connects their own Google account** — not a shared account. (ADR-0002)
- This is what lets calendar sync be per-person and Gmail import read each person's own bookings.

## Per-integration notes

### Google Maps / Places
- **Feeds:** event locations, "near me now," hours, ratings; **deep-links** to Google Maps for turn-by-turn (we don't rebuild navigation).
- **v1:** yes. Lowest-risk, highest-daily-use.

### Gmail booking import ("the TripIt magic")
- **Feeds:** the index (and hard Events) by parsing confirmation emails into Bookings.
- **How:** read-only Gmail scope on each member's account → a parsing layer (provider templates + heuristics) → Booking entities → member confirms/edits.
- **Effort:** highest single build. Parsing is messy and per-provider.
- **v1 or v1.1 🔶** — flagged as the key scope decision.

### Google Calendar (one-way)
- **Feeds:** each member's **personal** calendar from the trip (trip → calendar). **One-way only** — two-way is a conflict trap. (ADR-0003)
- **v1:** Should.

### Flight status
- **Feeds:** Now/Next directly (gate, delay, terminal).
- **v1.1.**

### WhatsApp share-out
- **Feeds:** outbound only — share a card/plan into the group chat.
- **v1.1.**

### Expense splitting (Splitwise-style) / Google Photos album
- **Feeds:** practical layer / a shared album.
- **v1.1+.**

### Web / AI enrichment (future pipe 🔭)
- **Feeds:** existing `Event` / `Booking` / `MaybeItem` entities with auto-pulled detail (opening hours, photos, descriptions, local tips; filling booking fields from a confirmation).
- **Why it fits:** it's a textbook pipe — enrich the entities, never a new screen (ADR-0004).
- **Keep-open requirements (so v1 doesn't block it):** preserve `source`/provenance on entities so enriched data is distinguishable and re-fetchable; keep `placeId` and free-text separable as stable keys to hang enrichment on.
- **Phase:** vNext, not v1. Recorded so the data model stays compatible (see product/modes.md).

## Rule for adding any future integration

Before building it, answer: *which existing surface does this feed — Now/Next or the index?* If the honest answer is "it needs its own screen," reconsider — that's a signal it doesn't fit the product.
