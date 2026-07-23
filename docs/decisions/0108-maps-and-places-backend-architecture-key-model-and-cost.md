# 0108 — Maps & Places backend architecture: split-key + Places/Routes proxy, `geo-tz` on the server, the `Place` row as the cache

**Status:** Accepted (backend/cost/library shape for the Maps & Places epic; no feature code — the shape the Phase-1+ implementation builds inside)
**Date:** 2026-07-23
**Refines:** [0106](0106-maps-and-places-epic-scope-and-phasing.md) (answers its first deferred open question — "Places API key model + the Phase-6 cost envelope" — and makes its "the `Place` row _is_ the cache" / "dedup by `googlePlaceId`" cost discipline concrete on the server), [0107](0107-per-place-timezones-and-multi-zone-time.md) (picks the "free, offline lat/lng→IANA zone lookup" its `Place.timezone` rides on, and where it resolves), [0048](0048-index-build-data-model-refinements.md) (the `Place` row is the enrichment cache; adds the `timezone` column + the `googlePlaceId` dedup constraint it implied) (relates [0020](0020-single-origin-deployment.md)/[0031](0031-hosting-railway.md) single-origin + Railway, [0096](0096-per-domain-claude-md-guides.md) reuse-before-adding, [0055](0055-document-blob-read-cache.md) the blob-cache this deliberately does _not_ imitate)

## Context

ADR-0106 fixed the Maps & Places epic's scope and phasing and deferred three server-side calls to this session (its first listed open question). ADR-0107 needs a free, offline coordinate→timezone resolver for `Place.timezone`. This is the BE-architecture session named in the session-68 handoff roadmap: **paper only, output a key/cost-model ADR** — no feature code.

Three things must be decided:

1. **The Places API key model** — a restricted client-side key vs. a backend proxy — weighed against exposure and the Phase-6 cost envelope (Places Autocomplete with session tokens + Place Details, Maps-JS dynamic map loads, and the paid Routes API).
2. **The offline lat/lng→IANA timezone library** for `Place.timezone` — free, offline-capable, resolved once at pick time and cached on the row.
3. **How Google enrichment is cached + deduped by `googlePlaceId`**, and where any proxy/cache sits relative to existing backend infra (reuse before adding, ADR-0096).

Two facts from the codebase frame all three (verified this session, not recalled): the `places` module already exists (`backend/src/places/` — controller + service + spec, writing through `ChangeService.mutate`), and the `Place` row already carries `googlePlaceId?`/`lat?`/`lng?`/`address?` with **no** unique constraint on `googlePlaceId`. So the picker's server side is an _extension_ of a live module, not a new one.

### Current Google Maps pricing (confirmed 2026-07-23, not quoted from memory)

Google **retired the universal $200/month credit in March 2025** and replaced it with a **per-SKU free tier** and an Essentials / Pro / Enterprise tier split (the field mask you request decides the tier). Confirmed figures, at the 10K–100K/month volume band, USD per 1,000 calls:

| SKU (what triggers it)                              | Price /1,000 | Free /month |
| --------------------------------------------------- | ------------ | ----------- |
| **Autocomplete** — per-request, standalone          | ~$2.83       | (per-SKU)   |
| **Autocomplete** — inside a Pro/Enterprise session  | **$0**       | —           |
| **Place Details** — Essentials tier                 | ~$5          | 10,000      |
| **Place Details** — Pro tier                        | ~$17         | 5,000       |
| **Place Details** — Enterprise tier                 | ~$20         | 1,000       |
| **Dynamic Maps** (Maps JS API map load, Phase 6)    | ~$7          | 10,000      |
| **Routes API — Compute Routes**, Essentials/Basic   | ~$5          | 10,000      |
| **Routes API — Compute Routes**, Advanced           | ~$10         | —           |
| **Routes API — Compute Routes**, Preferred          | ~$15         | —           |

Two consequences of the tier split matter for cost: **a session terminated by a Place Details call bills every Autocomplete keystroke in that session at $0**, and **the field mask decides the Place Details / Routes tier** — request only the fields we cache and we stay in the cheapest tier that returns them (the exact field→tier mapping shifts across Google releases; confirm it at implementation against Google's current field list, don't hardcode a recalled mapping). At this app's scale (small groups per trip, ADR-0065) real spend sits well inside the free monthly allowances; the design goal is that a **leak or abuse can't blow past them**, not that steady-state usage is expensive.

_Accuracy note (inherited from ADR-0106):_ Google's pricing and SKU/field-tier details move. These figures were confirmed on the date above; the **Phase-0 Google Cloud human task re-confirms them** when it enables billing and mints the keys. The _architecture_ below (who holds which key, what's proxied) does not change if a number moves.

## Decision

### 1. A two-key split, with a backend proxy for the paid web-service calls

**Not one restricted client key, and not a full proxy either — a split keyed to the exposure surface.** The deciding fact: Phase 6's embedded map is on the Maps **JavaScript API** (ADR-0106), which loads in the browser with the key **in the script URL** — that key is _necessarily_ public and cannot be proxied. Given that a public browser key exists no matter what, the lever is: keep the expensive, abuse-attractive SKUs off it.

- **Browser key (`VITE_GOOGLE_MAPS_BROWSER_KEY`, a frontend build var — Phase 6 only):**
  - **API restriction:** Maps JavaScript API **only** (the Dynamic Maps SKU).
  - **Application restriction:** HTTP-referrer, locked to our single production origin — clean because we are single-origin (PWA + API + WS on one origin, ADR-0020/0031).
  - **Blast radius on leak:** map loads only (~$7/1,000, 10,000/mo free), and cappable with a hard SKU quota. A scraped browser key **cannot** call Place Details or Routes.
  - It lives in the frontend build, **not** `backend/src/common/env.ts` — the backend never sees it.

- **Server key (`GOOGLE_MAPS_SERVER_KEY`, backend env — held by a thin proxy):**
  - **API restriction:** Places API (New) + Routes API.
  - **Application restriction:** IP (Railway egress) or held server-side only; **never sent to the browser**.
  - Every **Autocomplete**, **Place Details**, and **Routes** call goes out through the backend using this key.

**Why proxy the Places/Routes calls rather than expose them on the browser key** — three reasons, in priority order:

1. **Cost containment is the epic's stated constraint (ADR-0106 §5).** The expensive SKUs are Place Details (Enterprise ~$20/1k) and Routes (up to ~$15/1k). A public key that could call them is a standing bill-run-up risk (HTTP-referrer restriction is spoofable outside a real browser). Behind the server key + auth, only what the backend chooses to send is ever billed.
2. **The backend is the natural cache/dedup boundary.** "The `Place` row _is_ the cache" (ADR-0048) is only enforceable where the DB is. The proxy checks `(tripId, googlePlaceId)` **before** spending a Place Details call (Decision 3); a client-side key can't consult the trip's places cheaply or atomically. Proxying is what makes the dedup-cache a real cost floor, not a hope.
3. **Paid calls sit behind `MembershipGuard`.** Trip-scoped proxy routes mean **only authenticated members of the trip** can spend our Google quota — an unauthenticated public key can be scraped and driven by anyone. This is defense-in-depth on top of the SKU quota.

**Session tokens survive the proxy.** The frontend mints the session token (a UUID) and passes it on each search request; the proxy forwards it verbatim and reuses it on the terminating Place Details call. Autocomplete keystrokes in the session bill at $0. Latency of relaying keystrokes through our backend is a non-issue at this scale and buys the three wins above.

Rejected: **one restricted client key for everything** (simplest, but puts the ~$20/1k SKU on a spoofable public key — the exact cost exposure ADR-0106 set out to bound); **a full proxy including the map** (impossible — the JS API renders vector tiles in the browser against a URL-embedded key; there is nothing to proxy).

### 2. `geo-tz` on the backend for lat/lng→IANA, resolved once at Place write time

`Place.timezone` (ADR-0107) is resolved with **`geo-tz`**, called **server-side in `PlacesService`** when a `Place` is written with coordinates, and cached on the row.

- **`geo-tz`** does exact-polygon lookups from the `timezone-boundary-builder` dataset (OSM-derived) — the accurate option. It's Node-only and reads a bundled data file; both are fine **on the server**, which has no bundle-size budget and never ships this to a browser. It's free and fully offline (the data ships with the package; no runtime fetch, no Google Time Zone API cost).
- **Rejected: `tz-lookup`** (`@photostructure/tz-lookup`, ~72kb, isomorphic, ~100× faster) — its appeal is a small isomorphic bundle, but it is **lossy near borders (~10% mismatch even for inhabited points, ~30% on random points)**. Zone correctness at borders and airports is the _entire point_ of ADR-0107 (the motivating bug is a flight departure painted in the wrong zone). Since we resolve **server-side, exactly once per place, and cache forever**, `tz-lookup`'s size/speed edge buys nothing and its inaccuracy costs the feature. If a future need ever demands client-side resolution, revisit — it isn't one today.

**Why server-side resolution is coherent with offline (ADR-0106 rule 5).** Coordinates only ever arrive from an online Google pick, and picks flow to the backend through the offline outbox (`create`/`update` place op). So the backend **always** has coords + network at the moment it resolves the zone. Offline, the client can only author a coordless "Place-lite" — which has no zone by definition (ADR-0107 §1). The frontend leaves `timezone` null optimistically and adopts the resolved value when the op round-trips; ADR-0107's display layer already falls back to the trip primary zone until then. Nothing about offline reads breaks.

This is a one-time enrichment step, distinct from the frontend's per-event "which zone is this event in" resolver (`lib/places.ts` + the segment-partition helper, ADR-0107) — that reads the cached `Place.timezone`; it does not re-run `geo-tz`.

### 3. The `Place` row is the cache; dedup by a `googlePlaceId` uniqueness constraint

No new caching mechanism. The row is authoritative DB state, cached-into per ADR-0048 — **explicitly not** the `blob-cache.ts` pattern (ADR-0055), which is a two-tier LRU mirror of _immutable ciphertext_ from S3. Place enrichment is durable, mutable, trip-scoped domain data; treating it as a cache tier would be the wrong shape. The distinction is worth stating so a future session doesn't reach for the blob-cache template here.

Concrete server flow, all inside the extended `places` module:

- **Schema (Phase-1 migration, noted not built):**
  - add `Place.timezone String?` (IANA id, nullable — a Place-lite has none);
  - add `@@unique([tripId, googlePlaceId])` — Postgres treats `NULL`s as distinct, so many name-only (`googlePlaceId = null`) places coexist while any real Google id is unique per trip;
  - `@waypoint/shared` `placeSchema` mirrors `timezone` (non-negotiable rule 3).
- **Dedup-before-spend (the cost floor):** on a pick, the proxy looks up `place.findFirst({ tripId, googlePlaceId })`. **Hit** → return the cached row, **zero Google spend**, zero new `geo-tz` work. **Miss** → one Place Details call, resolve the zone with `geo-tz`, persist through `ChangeService.mutate` (create-or-link), return. The same place is never enriched twice in a trip (ADR-0106 §5).
- **Field mask decides the SKU tier — request only what we cache.** The Place Details tier (Essentials ~$5 / Pro ~$17 / Enterprise ~$20 per 1k) is set by the `X-Goog-FieldMask` header. Phase 1 caches `id` / `name` / `address` / `location` only, so the picker's mask must stay within the **cheapest tier that returns those fields**. The exact field→tier mapping shifts across Google releases (ADR-0106 accuracy note), so it is **confirmed against Google's current field list at implementation**, not hardcoded from a recalled mapping; vNext hours/photos knowingly move to a higher tier when that pipe is built.
- **What's cached on the row:** `googlePlaceId`, `name`, `address`, `lat`, `lng`, `timezone`. Later enrichment (hours, photos — vNext pipe, ADR-0106 OUT) lands as further nullable columns/source keys kept separable; not built here.

**Where it sits (reuse, ADR-0096):** the existing `places` module gains proxy route(s) on `PlacesController` (trip-scoped, already behind `MembershipGuard`) — a search/autocomplete relay and an enrich-on-pick path — backed by a new `google-places.client.ts` (the only new file: the outbound `fetch` wrapper holding the server key). The key name is added **once** to `common/env.ts` (`GOOGLE_MAPS_SERVER_KEY`, read via `requireEnv`), never inlined. Writes go through `ChangeService.mutate` (never a hand-rolled transaction or a direct `Change`/broadcast — the one hard boundary, `backend/CLAUDE.md`); trip/ownership checks extend `trip-scope.util.ts` rather than re-implementing a `findFirst` + throw. No new module, no new cache, no class-validator DTOs.

### 4. The Phase-6 cost envelope (Routes API + dynamic map loads)

Recorded now so Phase 6 inherits a decided shape, not re-litigation:

- **Dynamic map loads** bill on the **browser key** (Decision 1) — unavoidable, cheap (~$7/1k, 10k free), SKU-quota-capped.
- **Routes API** (paid live ETAs, ADR-0106 §D/§F) routes through the **same backend proxy + server key** as Places. Request the **Essentials/Basic** field mask (~$5/1k) unless a feature genuinely needs Advanced/Preferred fields — the "leave by 18:37" ETA between two hard anchors (the §F payoff) is a Basic-tier compute-route. The free connectors + whole-day deep-link (ADR-0106 §D) cost **nothing** and ship first; paid Routes is the sequenced-after enhancement.
- Routes results are **traffic-time-sensitive**, so they are **not** cached on the `Place` row (unlike static enrichment). If a cache is ever wanted, it's a short-TTL derivation keyed by the day's ordered stops — a Phase-6 call, not decided here.

### 5. Per-member, per-trip rate limits on the proxy — reusing the existing throttler

`MembershipGuard` stops non-members, but not a member (or a hijacked member session) scripting the proxy to run up the **server-key** bill. Session tokens cap cost per _completed_ pick, not raw call volume. So the paid proxy routes carry a rate limit.

**Reuse, don't add (ADR-0096):** the backend already runs `@nestjs/throttler` — a global per-IP default (300/min) in `app.module.ts`, per-route `@Throttle` on abuse targets (auth/join/invite, 20/min, B-10), `ERROR_CODE.RATE_LIMITED` + a 429/`Retry-After` mapping in `all-exceptions.filter.ts`, and an e2e pattern (`throttler.e2e.spec.ts`). The proxy limit is the **same mechanism with a different tracker**: a custom `getTracker` keyed on **`${principal.userId}:${tripId}`** (the actor + the route's `tripId`) instead of IP, so the cap is per member per trip and shared devices/NAT don't collide. The per-IP global stays as the outer backstop.

**Targets — comfortably above real use, well below what makes scripting worth it** (the two paid buckets are the point; all env-tunable via named constants in `env.ts`, defaults below):

| Proxy route            | Per-minute / member·trip | Per-day / member·trip | Reasoning                                                                                          |
| ---------------------- | ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------- |
| Search / autocomplete relay | 120                 | 2,000                 | Free within a session, but the scrape surface; a debounced human can't sustain this, a script trips it fast |
| Place Details (enrich-on-pick) | 30               | 500                   | A heavy planner completes a few picks/min; dedup makes re-picks free — 30/min is ~10× real use, ~$0.15/min ceiling |
| Routes (Phase 6)       | 30                       | 500                   | A per-day macro fires ~10–25 at once; 30/min covers re-renders, the daily cap bounds a drip attack |

The per-day window is defense-in-depth against a slow-drip script that stays under the per-minute cap. A breach returns the standard 429 + `Retry-After` envelope (ADR-0070) the frontend already handles. Numbers are a starting point tuned once Phase-0 gives real usage data — the _mechanism and the per-member·trip keying_ are the decision, not the exact integers.

### 6. Phase-0 cost guardrails are a hard gate, not optional

The Phase-0 Google Cloud human task (ADR-0106) must, before any real key ships:

- **A Google Cloud budget alert** on the project (e.g. thresholds at 50/90/100% of a set monthly ceiling) — the outer safety net if every in-app guard is somehow bypassed. **Required, not optional.**
- **A hard per-SKU daily quota cap** on **Dynamic Maps** (the browser key's only reachable SKU) and on Place Details / Routes — this is what actually bounds a forged-referrer abuse of the public map key to a known maximum.
- **Re-confirm current pricing** when enabling billing (the figures in this ADR were confirmed 2026-07-23; the model doesn't change if a number moves).

## Consequences

- **The picker's server side is an extension, not a new module** — proxy routes + one HTTP client on the existing `places` module, writing through the existing `ChangeService`. Small, and it keeps the reuse rule (ADR-0096) intact.
- **The expensive SKUs are never on a public key.** A scraped browser key can only trigger map loads (cheap, quota-capped); Place Details / Routes live behind the server key + `MembershipGuard`. The cost exposure ADR-0106 worried about is bounded structurally, not by trust in referrer restriction.
- **Cost floor is enforced where the data is:** dedup-before-spend on `(tripId, googlePlaceId)` means re-picking or re-referencing a known place is free; session tokens make autocomplete free within a completed pick. Steady-state spend sits inside the per-SKU free tiers at this scale.
- **A compromised member session can't run up an open-ended bill:** the proxy's per-member·trip throttle (Decision 5) caps paid-call volume above real use but far below what pays off for an attacker, reusing the existing throttler + `RATE_LIMITED`/429 path; the Phase-0 budget alert + per-SKU daily quota (Decision 6) are the outer net, required before any key ships.
- **`Place.timezone` has a concrete, free, accurate resolver** (`geo-tz`, server-side, once, cached) — ADR-0107 Phase-1 fold-in is unblocked; the offline story holds (coords only arrive online).
- **Two schema additions for Phase 1:** `Place.timezone` and `@@unique([tripId, googlePlaceId])`, mirrored in `@waypoint/shared`; no migration of existing rows beyond adding the nullable column + constraint (greenfield place data, no coords in the wild yet).
- **New env: `GOOGLE_MAPS_SERVER_KEY`** (backend, `env.ts`, boot-required once the picker ships); **`VITE_GOOGLE_MAPS_BROWSER_KEY`** (frontend build, Phase 6); plus env-tunable throttle constants for the proxy's per-minute/per-day caps (Decision 5), named once in `env.ts`. Both keys minted by the Phase-0 human task, which also sets the budget alert + per-SKU quota and re-confirms current pricing.
- **`api-contract.md` gains the proxy endpoints** when Phase 1 lands (search/relay + enrich-on-pick under `trips/:tripId/places`); noted, not written this session.
- **FE-arch inherits a settled boundary:** the frontend calls _our_ endpoints, mints the session token, and never holds the Places/Routes key — the shared-search-core question (ADR-0106) is now "one client of our proxy vs. two," which simplifies it.

## Alternatives considered

- **One restricted client-side key for all Google calls.** Simplest, but places the ~$20/1k Place Details and up-to-$15/1k Routes SKUs on a browser key protected only by spoofable HTTP-referrer restriction, and gives up the DB-side dedup-before-spend cache floor. Rejected — it reopens exactly the cost exposure ADR-0106 §5 exists to close.
- **Full backend proxy, including the map.** Rejected as impossible: the Maps JS API renders vector tiles client-side against a URL-embedded key; there is nothing to proxy, so a public browser key is unavoidable for Phase 6 regardless.
- **`tz-lookup` (isomorphic, ~72kb) for the zone lookup.** Rejected: ~10–30% border/inland mismatch defeats the point of ADR-0107 (correct zones at borders/airports), and its small-bundle/speed advantage is irrelevant when we resolve server-side once and cache. `geo-tz`'s accuracy wins where it matters.
- **Google Time Zone API for the zone.** Rejected: a paid, online per-call SKU for something a free offline library resolves once — contradicts ADR-0106/0107's "free, offline" requirement and the cost discipline.
- **A blob-cache-style tier for Google enrichment.** Rejected: enrichment is authoritative, mutable, trip-scoped DB data, not an immutable ciphertext mirror; the row already _is_ the cache (ADR-0048). Reusing the wrong template would add a cache where a column suffices.
- **Resolve the timezone on the client at pick time.** Considered (co-locates with the pick), but it forces the lossy isomorphic library and duplicates resolution per client; server-side resolution is authoritative, accurate, and consistent regardless of which client picked. Rejected.
