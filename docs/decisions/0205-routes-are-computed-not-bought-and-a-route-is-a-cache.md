# 0205 — A route is **computed, not bought** — and a route is a **cache**

**Status:** **Accepted 2026-08-25** on the owner's M0 answers. **§2 and §6 are amended by §Y at the
end — read it before choosing a provider or shaping the endpoint.** The provider itself is the one
thing still open, and §Y1 records the standing default so no work is blocked on it. **Nothing here
is built.**
**Date:** 2026-08-24
**Research:** [`planning/2026-08-24-routes-and-travel-time-what-is-actually-possible.md`](../planning/2026-08-24-routes-and-travel-time-what-is-actually-possible.md) — every number below was measured live on that date, not read.
**Plan:** [`planning/2026-08-24-routes-epic-milestone-board.md`](../planning/2026-08-24-routes-epic-milestone-board.md) — the milestone board is the live tracker; this ADR is the decision it executes.
**Companion:** [ADR-0206](0206-a-travel-time-belongs-between-two-points.md) decides **what a travel time says**. This one decides **where it comes from**. Same split as [ADR-0186](0186-the-map-is-ours-and-it-works-on-a-plane.md) (the renderer) and [ADR-0121](0121-embedded-map-phase-6-design.md) (what the map says), and for the same reason: a substrate decision and a product decision approve on different evidence.

**Reverses** [ADR-0121](0121-embedded-map-phase-6-design.md) §14's deferral of "Paid Routes / live ETAs", and [ADR-0186](0186-the-map-is-ours-and-it-works-on-a-plane.md) §9's "not routing".
**Extends** [0186](0186-the-map-is-ours-and-it-works-on-a-plane.md) §4 (its clustering becomes the routing gate), [0166](0166-place-enrichment-is-a-multi-source-pipe.md) §6 (a server-owned cache table outside the change log — second consumer), [0187](0187-detail-is-live-and-an-extract-is-only-for-the-plane.md) (warm-in-background + `Retry-After`, second consumer), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md)/[0110](0110-maps-and-places-frontend-architecture.md) (never straight to a vendor).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (a travel time never moves a hard event), [0018](0018-timeline-data-model-shape.md)/[0027](0027-soft-item-lifecycle-shelf-slip.md) (a route is a cache, not derived state made durable — §4 is why that is not a violation), [0019](0019-sync-protocol.md) (routes never touch `ChangeService`), [0094](0094-one-pluggable-change-applier-registry.md)/[0095](0095-named-constants-for-string-discriminants.md) (named constants, registry over `switch`).

## Context

The map draws a dashed straight line between a day's stops and the app's only spatial answer is
crow-flies metres (`lib/distance.ts`). Every travel-time feature the product promised — the hero's
`23 דק׳ · צאו ב־18:37` most of all — has been deferred since ADR-0106 on cost.

**The premise of that deferral is now false, and not for the reason it looks like.** Swapping to
MapLibre did not make routing free: **MapLibre does not compute routes.** It renders a `LineString`,
which `DayConnector` in `MapPane.tsx` already does. What actually died is the _cost model_.

Google's Routes terms **forbid caching results**. That is what made ETAs "a second cost envelope"
(ADR-0121 §14): not the price of a call, but the fact that every view is a _fresh_ call, forever,
for an answer that never changes. **OSM-derived routing has no such term.** And a `Place` in this
app has fixed coordinates, so "walking from A to B takes 21 minutes" is a **static fact about the
world**, computed once and kept.

This is the same shape as ADR-0186's own finding — _"the reason we said no is wrong"_ — and it lands
the same way: the constraint was a property of the vendor, so it is answered by changing vendors.

## Decision

### 1. A routing **engine** over OSM, drawn by the renderer we already have

Three layers, and only the middle one is new:

| layer              | what                      | status       |
| ------------------ | ------------------------- | ------------ |
| draw the line      | MapLibre + `DayConnector` | **exists**   |
| compute the line   | an OSM routing engine     | **this ADR** |
| decide what to say | ADR-0206's derivations    | companion    |

**We do not adopt `@maplibre/maplibre-gl-directions`.** It is MIT and it works, but it is a
_waypoint-editing UI_ — it owns its own layers, its own drag-to-add-a-stop interaction and its own
chrome. We already have a line renderer with our grammar on it, and ADR-0121 §12's "our controls,
not Google's" applies to any vendor. Rule 8 says extend `DayConnector`; a second line implementation
beside it is precisely what ADRs 0078/0079/0094/0095 exist to undo.

**No new frontend dependency at all**, in fact. The one thing a route needs that we lack is a
polyline decoder, and that is ~25 lines in `@waypoint/shared` rather than a package.

> **The trap, measured, because it fails silently.** Valhalla encodes shapes at **precision 6**, not
> the precision 5 that Google, OSRM and every copy-pasted decoder assume. Decoded at 5, our Tokyo
> walk comes back as `(357.14757, 1397.96481)` — a valid-looking number, ten times off, no error,
> a line drawn nowhere. The decoder takes precision as an argument and its spec asserts a real
> decoded coordinate, not a round-trip.

### 2. The provider is a **port with one implementation**, and the first one costs nothing

`RouteProvider` — two methods, `route()` and `matrix()`, in our own shapes. Behind it, **Valhalla**,
reached at first through the public [FOSSGIS](https://valhalla.openstreetmap.de/) planet server.

Why a port before there is a second implementation, when rule 8 usually says the opposite: because
the _provider question is the one this ADR most wants to leave open_. Self-hosting Valhalla is a
Railway service, a volume and a per-region graph build — a real operating cost that phase-1 volumes
do not justify and phase-3 volumes might. The port is what makes that a later decision instead of a
rewrite, and it is one interface with two methods, not a framework.

**Why Valhalla over OSRM or GraphHopper**, measured rather than argued:

- **One matrix call answers a whole day.** `sources_to_targets` over five Tokyo stops: **2.3 KB in
  1.04 s** for all 25 pairs. A 10-day trip is ~10 calls per mode, _ever_.
- **Modes are a request parameter, not a build.** Valhalla costs at runtime, so walking, driving and
  cycling come from one deployment. OSRM bakes one profile into the graph — three modes is three
  servers. That single fact decides it for a self-host we may later want.
- **It degrades to a self-host with no wire change**, which is what makes §2's deferral honest.

**The known ceilings, all found by calling:**

- **One out-of-range pair returns HTTP 400 for the entire matrix** — not a `null` cell. Every batch
  must be pre-filtered before it is sent. This is §3's gate, and it is not optional.
- **Pedestrian routing stops at 200 km** (`error_code 154`, server-configured).
- **FOSSGIS asks for fair use** — 1 call/user/s — **and an `X-Client-Id` header**. Both are cheap to
  honour and both are conditions of using it at all.
- **No transit.** Confirmed: `multimodal` errors on that server, because its tiles carry no GTFS.
  Transit is ADR-0206's v2 and has its own backlog line.

**Ruled out on their own terms, before any technical comparison:** **Stadia Maps** (free tier is
non-commercial _and_ prohibits caching — the one thing this whole ADR rests on) and **Transitous**
(non-commercial, and requires the consuming application to be open source; this repo is private).
Recorded here so neither is proposed again. **Geoapify** is the paid-tier fallback if FOSSGIS
becomes unavailable: 3,000 credits/day free, commercial use allowed, and caching explicitly
permitted.

### 3. The gate: **cluster first, route second**

ADR-0186 §4 already clusters a trip's coordinates to decide what map to download. **That same
clustering decides what may be routed**, and this is one derivation with two consumers rather than a
new rule (rule 8):

**And the gate is per-mode, which is the part that is easy to get wrong.** A single
cluster-shaped rule would quietly break the car-hire trip (ADR-0162): Reykjavík→Vík is two clusters
apart and is exactly what a road trip _is_. Measured: driving Tokyo→Kyoto (457 km) answers in
0.84 s, while pedestrian routing refuses past 200 km.

1. **Walking and cycling: same cluster only.** Beyond it, nobody is walking, and the answer would be
   absurd rather than merely long.
2. **Driving: distance alone**, under a ceiling below the provider's own. A road trip crosses
   clusters by definition.
3. **Either way, over the ceiling → never call.** Return nothing and let `formatDistance`'s
   crow-flies chip stand. Tokyo→Paris is not a walk with a long duration, it is a flight, and
   ADR-0011 already says a flight is a hard commitment nobody is estimating.

Every check runs on `haversineMeters` (already in `@waypoint/shared`) **before the network**,
because a 400 costs a round-trip to learn what arithmetic knows for free. **The ceilings are numbers
to measure against real trips in M1, not to pick here.**

The pre-filter is a pure function in `@waypoint/shared` and it is tested without a network.

### 4. The cache is **server-owned, cross-trip, and outside the change log**

A new `RouteLeg` table, and it is the third of exactly this shape — `PlaceEnrichment` (ADR-0166 §6)
and `FxRateSet` (ADR-0180 §7) are the precedent, and their reasoning transfers verbatim: **no
`tripId`, one writer (us), never mutated by a client.** So there is no LWW to arbitrate, no undo to
offer, no per-trip ordering to keep, and **nothing here goes through `ChangeService`** — which is
the one hard boundary in the backend, and this is the documented kind of thing that sits outside it
rather than an exception to it.

**Keyed on rounded coordinates and mode, never on `placeId`.** This is the finding that would
otherwise be discovered late: **`Place` is trip-scoped** (ADR-0147 — a chosen icon is data about
_this trip's_ view of the place). Two trips that both save Senso-ji hold two `Place` rows, so a
`placeId` key would cache each trip separately and never hit across them. Coordinates are the
thing that is actually shared.

Rounded to **5 decimal places (~1 m)** before hashing — the same rounding `map-region.ts` already
applies for the same reason, that floating-point noise must not invalidate an entry describing
identical ground. _Whether 5 is the right snap is an open question:_ coarser buys cross-trip hits
between a pin dropped by hand and the same place picked from search, and pays in accuracy. **Measure
it against real trips in M1; do not pick it here.**

**It effectively never expires.** A walking route between two fixed points is invalidated by an OSM
data refresh and by nothing else — not by a clock, not by a TTL guess. That matches
`blob-cache.ts`'s rule (_"invalidated by explicit eviction only, never a TTL guess, because the
cached bytes are keyed by an immutable id"_), which is the server-cache template this follows.

**Why this does not violate ADR-0018/0027.** Those forbid persisting _derived state_ — a value the
app could recompute from its own data, which then drifts. A route is not derived from our data at
all; it is an **answer from outside** that we would otherwise have to re-ask. It is the same
category as a map extract, and ADR-0186 §6 already named the rule that governs it: _"an extract is a
cache, never data"_. Nothing a person authored lives in a `RouteLeg`; losing one costs a
recomputation. **Which is also what licenses evicting it freely** — the same bargain, restated.

### 5. Legality, stated once so it is not re-litigated

- **ODbL permits this.** OSMF's [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
  are explicit that individual routing results carry no attached attribution and are not a
  Derivative Database _provided they do not form one_. Share-alike triggers on **Publicly Using a
  Derivative Database** — republishing a road database. A per-pair table of "walking A→B is 21
  minutes, here is the line", read back by our own app, is a set of results.
- **The attribution obligation is already discharged.** `MAP_ATTRIBUTION = '© OpenStreetMap ·
Protomaps'` in `lib/map-style.ts` renders on the canvas (ADR-0186's Consequences). Routes come
  from the same data under the same credit. **No new UI is owed** — worth stating, because the
  instinct is to add a second credit line and that would be noise.
- **Two vendors were excluded on terms, not price** (§2). Terms are checked before capability, in
  that order, and the exclusions are written down so the check is not repeated.

### 6. Backend: one module, following the shapes already here

`src/routing/` — its own module, per `backend/CLAUDE.md`'s module rule.

| piece                                                            | pattern it follows                     |
| ---------------------------------------------------------------- | -------------------------------------- |
| `route-provider.ts` (the port) + `valhalla.provider.ts`          | new                                    |
| `routing.service.ts` — read-through cache, `inFlight` dedupe     | `MapService.readyOrWarm` / `cached`    |
| `routing.controller.ts` — `MembershipGuard`, `ZodValidationPipe` | every controller here                  |
| `RouteLeg` Prisma model                                          | `PlaceEnrichment` / `FxRateSet`        |
| a politeness limiter — 1 call/s, server-wide                     | new, and required by §2                |
| `ROUTING_*` env names in `common/env.ts`, kill switch            | `PUSH_DISABLED` / `DOC_CACHE_DISABLED` |
| error codes as `ERROR_CODE.*` members                            | ADR-0095                               |

**The endpoint is batch-shaped, because the matrix is** — one request carries the day's ordered
stops and gets back every leg. A per-leg endpoint would turn one 1-second call into five, and would
make the pre-filter of §3 a client concern, which it must not be.

**Warm-in-background, answer immediately.** ADR-0187's flow exactly: a cold batch returns what it
has plus `202`/`Retry-After` and builds the rest; it never holds a socket open. The client already
knows how to read that — `map-archive-cache.ts` parses `Retry-After` today.

### 7. Frontend: no new layer, three existing ones extended

- **Pure derivations go to `@waypoint/shared`** — `leaveBy`, `freeAfterTravel`, `daySequenceFits`,
  the polyline decoder and the §3 pre-filter. They are testable without a browser or a network, and
  Plan mode and Trip mode must not be able to disagree about them. This is where ADR-0121 §13's
  testing posture paid for the MapLibre swap, and it is being spent the same way again.
- **The client cache is a Dexie table, not `byte-cache`.** `byte-cache.ts` is for _blobs_ (map
  archives, document bytes); a route leg is a small JSON record. It does **not** join the
  `CACHE_CHANNELS` change registry either, for §4's reason: it is not a syncable entity, it has no
  writer on the client and no LWW.
- **The reads extend components that exist** — `DayConnector` gains a route, `DayJoinRow` gains a
  travel line, the hero's horizon gains a leave-by. None of them is a new surface. ADR-0206 decides
  what they say.
- **Offline is the absence of a fetch, again.** A missing route falls back to the crow-flies chip
  `lib/distance.ts` already renders. **Never an error state** — ADR-0186 §6 rule 5, restated for a
  second artefact.

### 8. What this is **not**

- **Not turn-by-turn navigation.** The `ניווט` hand-off to a native app (ADR-0160 §3) stays exactly
  as it is. We estimate; we do not guide.
- **Not transit, in v1.** §2's measurement is why, ADR-0206 §V2 is where it goes.
- **Not live traffic.** It needs a paid vendor and it breaks §4's "never expires", which is most of
  the value. If it ever returns it is a separate cache with a clock.
- **Not a second renderer, a second line layer, or a routing UI.** §1.
- **Not member GPS.** ADR-0006 refused it and nothing here reopens it.

## Consequences

- **The backend gains an outbound dependency on a community server.** Behind our proxy, behind a
  cache that makes a repeat call unnecessary, and behind a kill switch — but it is on the path the
  first time a route is asked for, and it can be down. Every read degrades to crow-flies, so the
  failure is a quieter app rather than a broken one.
- **A new table that grows with distinct place-pairs, not with usage.** Bounded by how many places
  our trips hold, which is small. It still gets an eviction story before it gets a size problem.
- **OSM walking data quality is now user-visible in a new way.** A missing footpath was invisible
  when we only drew a straight line; it becomes a wrong number here.
- **Estimates will sometimes be wrong, and the design must expect it** — ADR-0206's honesty
  principles are not decoration, they are what makes this shippable.
- **We can now be wrong in a way that costs someone a booking.** That is the real weight of this
  ADR, and it is why ADR-0206 §D5 refuses to state a confidence we do not have.

## Alternatives considered

- **Pay Google Routes.** Rejected: the ban on caching is the whole cost, and it buys transit we
  could otherwise not get. Revisit only if transit turns out to be worth a bill (v2's decision).
- **`maplibre-gl-directions`.** §1 — a routing UI, not a routing engine, and we have the drawing.
- **OSRM.** One profile per graph; three modes is three deployments. Fine as a hosted demo, wrong as
  the thing we might self-host.
- **Self-host Valhalla now.** Deferred, not rejected. §2's port is what keeps it cheap to change
  our mind; doing it first would spend a service, a volume and a build pipeline before a single
  read exists to justify them.
- **Key the cache on `placeId`.** §4 — `Place` is trip-scoped, so it would never hit across trips.
- **Compute in the browser (Valhalla/WASM).** No production build exists and the graph dwarfs a tile
  extract. Superseded by a better idea anyway: our stops are known in advance, so routes are
  **precomputable** and ship with the extract (ADR-0206 §V1.8).

## Phasing

Deliberately **not** listed here. The milestone board owns it, is updated as work lands, and names
what can run in parallel: [`planning/2026-08-24-routes-epic-milestone-board.md`](../planning/2026-08-24-routes-epic-milestone-board.md).

## Y. Amendment (2026-08-25) — the provider, weighed; and the endpoint takes a set of modes

### Y1. Community server vs. self-host, and why the default is the community server

The owner asked for the trade rather than answering it: _"What's the pros and cons of running on a
community server vs. a self host? Is self hosting more complex or something?"_

**Yes — and the complexity is not the server. It is the graph build.**

|                   | FOSSGIS Valhalla (community)                | self-hosted Valhalla                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **coverage**      | **the whole planet, today**                 | only the regions we build                                                                                                                                                                                                                                                                                             |
| **ops**           | none                                        | a second Railway service + a persistent volume, where today the whole app is one service (`deployment.md`)                                                                                                                                                                                                            |
| **the real cost** | —                                           | **a per-region graph build.** Measured in the research: a city-sized PBF builds in minutes, **a country takes hours, the planet takes days.** So planet is off the table for our hosting, which means building per trip-region — a pipeline keyed to ADR-0186 §4's clusters, i.e. the PMTiles extract pipeline's twin |
| **memory**        | —                                           | 4–8 GB is workable (Valhalla loads tiles on demand), still well above what a small Nest app needs                                                                                                                                                                                                                     |
| **freshness**     | theirs, maintained                          | ours to re-run as OSM moves                                                                                                                                                                                                                                                                                           |
| **limits**        | fair use, 1 call/user/s, not ours to change | none                                                                                                                                                                                                                                                                                                                  |
| **availability**  | volunteers, best-effort, no SLA             | ours                                                                                                                                                                                                                                                                                                                  |
| **transit later** | **impossible** — their tiles carry no GTFS  | the only path (§V2's transit needs GTFS tiles)                                                                                                                                                                                                                                                                        |

**The sharpest con, stated plainly because it rhymes with a mistake this repo already paid for:** a
community server is a third-party runtime dependency, and deleting exactly that from the map is what
[ADR-0186](0186-the-map-is-ours-and-it-works-on-a-plane.md) was written to do. Field report #35 had
four causes and every one was a variation on "the map cannot work without fetching third-party code
at runtime."

**But the failure mode is categorically milder, and that is what decides it.** ADR-0186's problem was
a hard dependency in the render path with page-global one-shot state: no Google script, no map at
all. Here, provider down means travel times are **absent** and ADR-0206 §D4's crow-flies chip stands
in — a quieter app, not a dead screen. The shape rhymes; the blast radius does not.

**So the standing default is the community server**, on three grounds:

1. **Our load on them is genuinely negligible, and §4 is why.** The cache means we ask once per
   place-pair _ever_ — a whole trip is ~30 calls in its lifetime. This is not a service we would be
   leaning on; it is one we would touch and then stop touching.
2. **§2's port makes the switch cheap by construction.** Same wire format, so self-hosting later is
   a deployment, not a rewrite. Committing now would spend a service, a volume and a build pipeline
   before one read exists to justify them.
3. **We do not yet know our real volume.** M1 measures it. Buying infrastructure before that
   measurement is the decision we would most likely regret.

**And there is a middle rung, so "self-host or nothing" is a false pair.** If FOSSGIS becomes
unavailable or asks us to stop, **Geoapify** (3,000 credits/day free, commercial use allowed, caching
explicitly permitted) is a config change behind the same port — not a project.

**Switch to self-hosting when any of these fires**, and not before: the fair-use limit binds in M1's
measurements; FOSSGIS asks us to stop or degrades; or **transit is taken up**, which forces it
regardless, since GTFS tiles cannot come from anyone else's build.

**This remains the owner's call and it is reversible either way** — that is the whole purpose of the
port. Work proceeds on the default meanwhile.

### Y2. The batch endpoint takes a **set of modes**, not one

§6 described a batch carrying a day's ordered stops. It must also carry **every mode the gate admits
for those stops**, fetched together, because ADR-0206 §Z2 requires a mode switch to be instant and a
per-mode endpoint makes each switch a ~1 s round-trip.

The arithmetic makes this a non-decision: one day matrix is 2.3 KB and ~1 s, three modes is ~7 KB,
and §4's cache means it happens once per place-pair ever. **One request per day, not one per day per
mode** — and the politeness limiter counts what actually leaves the process, so a three-mode warm is
three upstream calls paced by the limiter, not a burst.

The gate stays per-mode (§3), so the admitted set differs per leg: a 9 km pair yields driving and
cycling but no walking answer, and that absence is ADR-0206 §D4's chip rather than an error.
