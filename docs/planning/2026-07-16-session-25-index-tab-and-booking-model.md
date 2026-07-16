# Session 25 — The Index tab: booking/document design + the booking data model

**Date:** 2026-07-16
**Outcome:** the Index-tab design settled and mocked; ADR-0047 (earlier, PR #120), ADR-0048, ADR-0049, ADR-0050; `mockups/trip-index-v1.html` (new), booking-form + `trip-home-v3` + `trip-home-refinements-v1` updated, `trip-dashboard-v2` Index section retired; `index-bookings-documents-proposal-v1.html` retired after promotion.

## Why this session happened

The Index tab was still a `Placeholder` (the last unbuilt core tab). Assaf: design how bookings (flights, trains, hotels, WiFi, …) relate to timeline events, and how documents (passports, insurance) are managed — "this isn't trivial at all how it should behave." Brainstormed into a spec (`docs/superpowers/specs/2026-07-16-index-bookings-documents-design.md`), then ADRs, then mockups. The mockup pass surfaced several data-model questions the spec had left implicit, which became ADR-0048/0049/0050.

## What was decided

**ADR-0047 (earlier this session, merged in #120):** Booking↔Event is strict 1:1 optional; saving with a time auto-creates the Event; hotel spans reuse `Event.endDate`; one merged edit surface; delete → explicit delete-both/unlink prompt; documents are one row per file grouped by type; generic booking notes + hotel WiFi live in `Booking.details`; WiFi moves off `TripNote` onto the hotel Booking; both modes can add a booking (Tier 2).

**ADR-0048 — data-model refinements the build surfaced:**

- The **Event is the sole time authority**; `Booking.startsAt`/`endsAt` are dropped (a timed booking's time lives on its auto-created Event; ADR-0047 §1 already implied this).
- A minimal **`Place` entity** (`id, tripId, googlePlaceId?, name, address?, lat?, lng?`); every `placeId` (`Event`, `Booking`, `MaybeItem`) becomes an **FK → Place**. Trip-scoped, data-plane. This is the registry the Map/Places work needs, and it's introduced now because we were adding place-bearing columns anyway (Assaf caught the coupling: "if we add a Place schema, the booking decision changes too" — yes).
- **Transport bookings carry origin + destination** as two Place FKs (`fromPlaceId`/`toPlaceId`); the linked Event's `placeId` points to the origin (navigate-to-next target). The minimal, additive slice of ADR-0037's deferred transport primitive.
- **`TripNote` is retired entirely** (not narrowed) — ADR-0047 §6 left it reader-less.
- **`kind` stays selectable** on a booking-backed Event (default hard, but a coded-yet-skippable dinner reservation can be soft).

**ADR-0049 — the Index across mode & lifecycle:** mode = chrome only (Plan reskin, identical content — nothing on the Index is Tier-3-gated); a during-trip past/upcoming split ("כבר מאחוריכם"); a read-only, washed archive with documents still openable; bookings and documents are peers with matched add affordances.

**ADR-0050 — Home quick-access:** tiles deep-link into the Index; derived tiles (next code, WiFi-from-hotel) vanish when there's no source (grid reflows, no manual add); the managed documents tile is always present with a ＋ invite when empty. Removed the old manual "＋ קוד WiFi" tile.

## Design calls worth remembering

- **Reused, not reinvented:** the booking form/sheet use the existing `TimePicker` (ADR-0036/0037) for dates and `IconPicker` + derived category (ADR-0038) for the glyph, rather than free-text fields.
- **Transport route in the row:** a flight/train row leads with `origin → dest` (`.route`, `dir="ltr"` so it reads origin-left in RTL) instead of burying it in the title — the same Place data the Map will use.
- **All enum values shown:** the mockups render all 6 `BookingType`s (incl. activity, other) and all 4 `Document.type`s (incl. visa, other), which the earlier draft had dropped.
- **Terminology fix:** the mockup had used "יומן" for the trip timeline; "יומן" is Google Calendar (ADR-0003) — the timeline is "מסלול". Fixed throughout.
- **Mockup file strategy:** extracted the Index into its own `trip-index-v1.html` (mirroring how `trip-home-v3` superseded `trip-dashboard-v2`'s Home), rather than patching the pre-ADR-0028 franken-file.

## Open items / deferred

- **Board hero booking presentation** (deferred, own follow-up): the now/next hero already shows a booking-backed hard event's time + code by inheritance, but the richer transport-route / hotel check-in-out / gate presentation on the hero is not yet designed. Backlog item added.
- **`Place`-picker component**: Google Places search → creates/links a `Place`; needed by every `placeId` FK and the transport route. Gated on the Google Cloud setup already in the backlog.
- ADR-0038 is still **Proposed** — the IconPicker chrome the mockups lean on isn't ratified; if it changes, the booking form's icon treatment follows.
- All implementation (the ADR-0048 migration, the Index/form UI, the quick-access behavior) is unbuilt — captured in `docs/backlog.md`.
