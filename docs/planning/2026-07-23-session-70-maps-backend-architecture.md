# Session 70 — Maps & Places backend architecture (key model, cost, timezone library)

**Date:** 2026-07-23
**Type:** Backend-architecture session (paper only, no feature code). The BE-arch follow-on named in the session-68 handoff roadmap.
**Output:** [ADR-0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md) (Accepted).
**Read first (handoff set, per session-68):** ADR-0106 (cost §, embedded-map §, open questions), ADR-0107, `backend/CLAUDE.md`, `architecture/tech-stack.md`.

## What this session decided

Answered ADR-0106's first deferred open question and picked ADR-0107's timezone library. Three calls:

1. **Key model — a two-key split with a backend proxy for the paid web-service calls.**
   - **Browser key** (frontend build var, Phase 6 only): Maps JS API only, HTTP-referrer-locked to the single origin (ADR-0020/0031). Necessarily public because the JS API embeds it in the script URL — but its blast radius on leak is map loads only (~$7/1k, 10k/mo free, quota-cappable).
   - **Server key** (backend `env.ts`, never in the browser): Places API (New) + Routes API, held by a thin proxy on the existing `places` module. All Autocomplete / Place Details / Routes calls go out through the backend.
   - Rationale: the JS-API map forces a public browser key regardless, so the lever is keeping the expensive/abuse-attractive SKUs (Place Details Enterprise ~$20/1k, Routes up to ~$15/1k) off it. The proxy also (a) enforces the dedup-before-spend cache at the DB, and (b) gates paid calls behind `MembershipGuard` so only trip members spend our quota. Session tokens pass through the proxy unchanged.

2. **Timezone library — `geo-tz`, server-side, once, cached on the row.**
   - Accuracy-first (exact OSM/`timezone-boundary-builder` polygons). Node-only + disk-data — fine on the server (no bundle budget, never shipped to a browser). Free + fully offline.
   - Rejected `tz-lookup` (isomorphic, ~72kb, ~100× faster) — its ~10–30% border mismatch defeats the whole point of ADR-0107 (correct zones at borders/airports), and its size/speed edge is irrelevant when we resolve server-side once and cache. Coords only ever arrive from an online pick, so backend resolution doesn't break offline (offline you only make coordless Place-lite, which has no zone anyway).

3. **Caching + dedup — the `Place` row is the cache (ADR-0048), not a new tier.**
   - Add `Place.timezone String?` and `@@unique([tripId, googlePlaceId])` (Postgres NULLs distinct → many name-only places coexist); mirror `timezone` in `@waypoint/shared`.
   - Dedup-before-spend: proxy looks up `(tripId, googlePlaceId)` before a Place Details call — hit = zero Google spend; miss = one Details call + `geo-tz` zone + persist via `ChangeService.mutate`.
   - Explicitly **not** the `blob-cache.ts` pattern (that's an immutable-ciphertext S3 mirror; enrichment is authoritative DB state). Lives as an extension of the existing `places` module: proxy routes on the controller + a new `google-places.client.ts` for the outbound HTTP; key name once in `env.ts`; reuse `ChangeService` + `trip-scope.util.ts`.

Also recorded the **confirmed current pricing** (checked 2026-07-23, not from memory — the $200 credit was retired March 2025, replaced by per-SKU free tiers + Essentials/Pro/Enterprise field-mask tiers) and the **Phase-6 cost envelope** (dynamic map loads on the browser key; Routes API through the proxy at the Basic/Essentials field mask; free connectors + whole-day deep-link ship before paid Routes; Routes results not row-cached — traffic-time-sensitive).

## Added after the first pass (review discussion)

Three hardening decisions folded into ADR-0108 after a review question about the browser key's exposure:

- **Clarified the browser-key exposure** (Decision 1 / the discussion): the Maps JS API embeds a key in the browser by design — it can't be proxied, only referrer- + API-restricted + quota-capped, so its blast radius is map loads only. **In the near-term phases (1–5) there is no browser key at all** — everything is proxied; the browser key first appears at Phase 6.
- **Per-member·trip rate limit on the proxy (new Decision 5)** — `MembershipGuard` stops non-members but not a scripted/compromised member session running up the server-key bill. Reuse the existing `@nestjs/throttler` (global per-IP 300/min, per-route `@Throttle`, `RATE_LIMITED`/429 + `Retry-After`, e2e pattern) with a custom `getTracker` keyed on `${userId}:${tripId}`. Starting targets (env-tunable): search relay 120/min·2,000/day, Place Details 30/min·500/day, Routes 30/min·500/day — comfortably above real use, well below attacker-worthwhile. The keying + mechanism is the decision; integers tune once Phase-0 gives real data.
- **Phase-0 cost guardrails are a hard gate (new Decision 6)** — a Google Cloud budget alert + a per-SKU daily quota cap (Dynamic Maps / Place Details / Routes) are **required before any key ships**, plus re-confirming pricing at billing setup. The field-mask → SKU-tier confirmation (keep the picker in the cheapest tier that returns id/name/address/location) is also written down explicitly.
- **Mandatory FE debounce on autocomplete (Decision 1)** — the picker must fire an Autocomplete request only on a typing pause, never per keystroke. It's a **cost requirement**: session tokens make in-session autocomplete free only when the session ends in a Place Details pick, so a type-and-abandon session bills each keystroke call per-request (~$2.83/1k); debouncing collapses that and keeps a typist under the search-relay rate limit. The interval is an FE-arch call; pause-gating is not optional. Recorded in the ADR + the backlog Phase-1 line for the FE-arch/implementation handoff.

## FE-architecture handoff — everything frontend this session settled

The BE-arch session made several calls that **constrain the frontend**, but they live inside a _backend_ ADR (0108). Consolidated here so the FE-architecture session inherits them in one place. **Add ADR-0108 to that session's read-first set** (the session-68 roadmap's FE-architecture row is updated to include it).

**Hard requirements the FE must honour (not FE-arch's to re-decide):**

1. **The frontend never holds the Places/Routes key.** All Autocomplete / Place Details / Routes calls go through _our_ backend proxy under `trips/:tripId/places` (trip-scoped, behind `MembershipGuard`). The only Google key the browser ever sees is the Phase-6 map-load key. (ADR-0108 §1)
2. **Debounced autocomplete — pause-gated, never per keystroke.** Fire a search request only after the user stops typing (each new character resets the timer). This is a **cost requirement**, not UX polish: a type-and-abandon session (no pick) bills each Autocomplete call per-request (~$2.83/1k). The exact interval is FE's call; pause-gating is not optional. (ADR-0108 §1)
3. **The FE mints + threads the session token.** Generate a session token (UUID) per pick, pass it on every search request _and_ the terminating Place Details call, then retire it after the pick — that's what makes in-session autocomplete bill at $0. (ADR-0108 §1)
4. **Browser key is Phase-6-only.** `VITE_GOOGLE_MAPS_BROWSER_KEY` is a frontend build var used solely to load the Maps JS API for the embedded map (Phase 6). Phases 1–5 ship **no** Google key in the browser — everything is proxied. (ADR-0108 §1)
5. **Handle the proxy's rate-limit response gracefully.** The proxy can return `429` / `RATE_LIMITED` + `Retry-After` (ADR-0070 envelope, already handled globally). The picker should degrade softly (a brief "try again" state), not hard-error, if a member ever trips the cap. (ADR-0108 §5)

**Behaviours & data the FE builds on:**

6. **Offline = coordless "Place-lite" only.** Offline the FE can author a name-only `Place` (no coords → no timezone). Leave `Place.timezone` null optimistically and adopt the server-resolved zone when the create/update op round-trips the outbox. Coords _and_ zone only ever arrive online (from a Google pick). (ADR-0108 §2 / ADR-0107)
7. **The per-event zone resolver reads the cached zone — it does not compute one.** `lib/places.ts` + the ADR-0107 segment-partition helper read `Place.timezone`; the lat/lng→IANA lookup is server-side `geo-tz`, run once at Place write. No client-side zone library. (ADR-0108 §2)
8. **Dedup is server-enforced.** `@@unique([tripId, googlePlaceId])` + dedup-before-spend mean the FE's create-or-link flow can rely on re-picking a known place returning the cached row (no duplicate, no Google cost). (ADR-0108 §3)

**Open questions still for the FE-architecture session (unchanged):**

- **Shared search-core vs. two components** — now simplified to "one vs. two clients of our proxy" (the in-form picker and the Map-tab research surface). (ADR-0106 open q)
- **The place-usage / filter derivation** (day/type/maybes; union semantics + colour-by-most-committed reference). (ADR-0106)
- **Threading ADR-0107's per-event zone** through `lib/time.ts` / `lib/places.ts`, and the `Event.displayTimezone` store-vs-derive sub-question. (ADR-0107)
- **The debounce interval and the geolocation-permission degrade** — some overlap with the design session running in parallel.

## Follow-on / handoff

- **Google Cloud setup (human, Phase 0)** re-confirms pricing and mints both keys (`GOOGLE_MAPS_SERVER_KEY` backend, `VITE_GOOGLE_MAPS_BROWSER_KEY` frontend).
- **Phase 1 implementation** carries the two schema additions, the `env.ts` key name, the proxy routes, and the `geo-tz` resolution step; `api-contract.md` gets the proxy endpoints when they land.
- Nothing about scope/phasing (ADR-0106) or the time model (ADR-0107) changed — this only fills the server/cost/library shape they left open.
