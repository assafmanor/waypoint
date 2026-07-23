# 0112 — "In the trip" is a reference derivation, not row-presence; a picked-but-unsaved place is cache-only

**Status:** Accepted (frontend behaviour fix + a model clarification for the Places picker)
**Date:** 2026-07-23
**Refines:** [0110](0110-maps-and-places-frontend-architecture.md) §1 (fixes the picker's `alreadyInTrip` derivation — it was row-presence, now it's reference-based; consistent with §2's place-usage), [0048](0048-index-build-data-model-refinements.md) (the `Place` row is the enrichment cache — this pins what that means for "in the trip"), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §3 (dedup-before-spend is unchanged; it keys on the cache row, which still exists) (relates [0106](0106-maps-and-places-epic-scope-and-phasing.md) whose "cross-trip dedup" remains OUT)

## Context

The Phase-1 picker (ADR-0110) resolves a pick through the backend **immediately** — `resolvePlace` persists a `Place` row server-side (create-or-link, dedup-before-spend) and the FE adopts it. That's correct for the enrichment cache (ADR-0048: "the `Place` row _is_ the cache") and for cost (a re-pick dedups at zero Google spend).

But the picker's "already in the trip" chip — and the pick short-circuit behind it — keyed off **mere row-presence** (`places.find(googlePlaceId === …)`). Consequence, reported in use: open an event/booking form, pick a place, then **cancel** without saving — the `Place` row was already written (and broadcast), so the place lingered and every later pick showed it as **"already in the trip"** despite never being committed to anything. A cancelled form should leave nothing in the trip.

The row genuinely _should_ persist (it's the dedup/enrichment cache; re-picking must stay free). The bug is that **row-presence was being read as trip-membership**. Those are two different things the `Place` row was conflating.

## Decision

**Split the two meanings the `Place` row carries, and derive "in the trip" from references:**

- **Cached** = the row exists (from any pick). Unchanged: it keeps dedup-before-spend working (ADR-0108 §3) — re-picking a cached place never re-charges Google, whether or not it's in the trip.
- **In the trip** = the place is **referenced** by a saved entity — an `Event.placeId`, a `Booking.placeId`/`fromPlaceId`/`toPlaceId`, or a `MaybeItem.placeId`. A picked-but-unsaved place has **zero** references, so it is **cache-only, not in the trip**. It drops out the moment nothing references it and drops back in the moment something does.

This is a **derivation, not a stored flag** — `referencedPlaceIds(events, bookings, maybeItems)` in `lib/places.ts` (where place resolution already lives), a `Set<placeId>` computed over the snapshot. No schema change, no `adopted` column to keep in sync, no migration, and no orphan-cleanup/delete endpoint. It is the **same "referenced places" concept** the Map tab's `lib/place-usage.ts` (ADR-0110 §2) is built on, so the picker chip and the map's place lists stay one definition.

Concretely (`lib/usePlaceSearch.ts`): `alreadyInTrip(prediction)` now matches a local place by `googlePlaceId` **and** membership in the referenced set. A cancelled pick's cached row no longer reads as "in the trip"; picking it again falls through to `resolvePlace`, where the server dedups to that cached row at zero Google spend (it's one extra proxy round-trip, not a local link, and no Google call).

**Why derive, not defer-to-save.** The alternative considered was to _not_ persist on pick — hold the selection and resolve only on form Save, so a cancel truly writes nothing. Rejected: it forgoes the cache (a changed-mind or cancelled pick that's re-picked later would re-spend), refactors the picker→host contract, and moves the terminating Place Details call away from the pick (a session-token-lifetime risk). Deriving in-trip from references keeps the cache _and_ makes cancel a no-op for trip membership, which is what the report actually wanted.

## Consequences

- **A cancelled pick leaves no trip-visible place.** The chip, and any "trip places" surface, read reference-based membership; the cached row is invisible until referenced.
- **The cache is preserved.** Dedup-before-spend is untouched — re-picking a previously-resolved place (in this trip) stays a zero-Google-spend server dedup.
- **One definition of "in the trip"** shared by the picker and the Map tab's place-usage; a `Place` row's two roles (cache vs trip entity) are no longer conflated.
- **No backend/schema change** — this is a FE derivation over the existing snapshot.
- **Cache-only rows still accumulate** in a trip's `places` (downloaded in the snapshot, broadcast on creation). Tolerated at this scale (ADR-0048 already leaves orphans); a later GC/`deletePlace` is possible if it ever matters, not needed now.

## Related, explicitly not decided here

A **cross-trip** global place cache (a popular place resolved once, reused across trips without re-querying Google) would extend the "cache vs trip entity" split further — a global `googlePlaceId → details` tier feeding trip `Place` rows. It is a scale-time optimization, still **OUT** per ADR-0106 ("cross-trip dedup"), and carries a Google-terms content-caching TTL constraint. Captured in the backlog as a proposed future ADR; not built.
