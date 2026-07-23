# Session 75 — Places picker: prod 403, error logging, cached-vs-in-trip

**Date:** 2026-07-23
**Kind:** Bugfix / ops (post-merge follow-ups on the Places picker; PRs #233 + the cached-vs-in-trip change)
**ADRs:** new [0112](../decisions/0112-place-in-trip-is-referenced-not-cached.md); relates [0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md), [0110](../decisions/0110-maps-and-places-frontend-architecture.md), [0111](../decisions/0111-places-field-mask-tier-and-rating-deferral.md).

## 1. Production 403 on `places:autocomplete` — root-caused

Live search failed with Google `403` (our proxy correctly mapped it to `503`). Cause: the `GOOGLE_MAPS_SERVER_KEY` had an **Application restriction = Websites (HTTP referrers)** — a browser-key restriction. Server-to-server calls carry no `Referer`, so Google rejected them regardless of the allow-list. This contradicted ADR-0108 §1 (server key = IP or held-server-side, never referrer); the website entries (`localhost:3000`, the two `*.up.railway.app`) belonged on the future browser key. **Fix (Console, no code):** set the server key's Application restriction to **None** — resolved. (Keep the API restriction scoped to Places API (New).)

## 2. Upstream error-body logging (PR #233, merged)

The client logged status-only, so the 403 had no reason attached. `GooglePlacesClient.fetchJson` now logs Google's error body **server-side** (never to the client — the body carries the reason like `PERMISSION_DENIED`, not the key), bounded to 500 chars. Permanent, useful for any future upstream fault.

## 3. Cached-vs-in-trip fix (ADR-0112)

**Report:** picking a place in a form, then **cancelling**, still left it reading as "already in the trip" — because the picker's `alreadyInTrip` keyed off mere `Place` row-presence, and a pick persists the row immediately (the dedup/enrichment cache, ADR-0048).

**Fix:** "in the trip" now derives from **references** — `referencedPlaceIds(events, bookings, maybeItems)` in `lib/places.ts` (an `Event`/`Booking`[placeId/from/to]/`MaybeItem` pointing at it). The picker's `alreadyInTrip` keys off that; a cancelled pick's row stays as cache (re-picking still dedups at zero Google spend) but isn't in the trip. Derived, not a stored flag — no schema change; the same "referenced places" concept the Map's `place-usage` (ADR-0110 §2) will use. Chosen over defer-resolve-to-save (which would forgo the cache and refactor the picker→host contract) at the requester's suggestion.

## Decided this session

- **Cross-trip global place cache → captured, deferred.** A global `googlePlaceId → details` tier (popular places reused across trips without re-querying Google) is a real scale win, but still **OUT** per ADR-0106 ("cross-trip dedup"), needs a Google-terms content TTL, and buys little at current small-group scale (ADR-0065 grow-later). Backlog item + a future ADR when volume warrants — not built.
- (From session 74, restated:) transport origin/destination → Phase 6; maybe-item place authoring → Phase 5.

## Verification

`pnpm format` + `pnpm typecheck` + `pnpm build` green; frontend suite 649/649 (+3: the `referencedPlaceIds` derivation + the cached-vs-in-trip hook cases). Backend unaffected.
