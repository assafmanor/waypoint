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

### Web enrichment of places — **decided, [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md)** (2026-08-04)

Was "a future pipe 🔭". Its two keep-open requirements — **provenance per value** and **a stable key to hang enrichment on** — turned out to be the load-bearing parts of the design, not preamble.

- **Feeds:** existing surfaces with auto-pulled detail (image/thumbnail, summary, opening hours). A pipe, never a screen (ADR-0004).
- **The constraint that shapes it:** **Google Places content may not be cached** (`place_id` exempt, coordinates ~30 days; names/ratings/photos/phone are request-live-and-attribute, and a photo name must not be cached at all). So the cacheable fields come from cacheable sources: **open-licensed sources are the own-and-cache tier, Google is the live tier.** Multi-source is what makes caching legal, not a nice-to-have.
- **Sources:** Wikidata (CC0), Wikipedia (CC BY-SA), Wikimedia Commons (per-file license), OpenStreetMap/Overpass (ODbL). Google is a provider whose policy forbids storing — so **no Google-sourced value ever reaches the global store**.
- **Where it lands:** a **global** `PlaceEnrichment` row (no `tripId`), keyed by our own id with `googlePlaceId`/`wikidataQid`/`osmRef` as alias columns. The trip-scoped `Place` is unchanged and keeps the trip's _opinion_ (`icon`, `category`, a renamed `name`); the global row holds the world's _facts_. If two trips could legitimately disagree about it, it is not enrichment.
- **ETA is explicitly not this pipe** — it is a property of `(origin, destination, mode, departure time)` and traffic-sensitive; Routes API per ADR-0108 §4, a short-TTL keyed derivation, never the place store.
- **Phase:** 1 — summary + image; 2 — opening hours; 3 — ETA (the only one that spends).

## Rule for adding any future integration

Before building it, answer: _which existing surface does this feed — Now/Next or the index?_ If the honest answer is "it needs its own screen," reconsider — that's a signal it doesn't fit the product.
