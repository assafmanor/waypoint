# 0205 — A route is **computed, not bought** — and a route is a **cache**

**Status:** **Accepted 2026-08-25** on the owner's M0 answers. **§2 and §6 are amended by §Y; §§1,
3 and 6 by M2's amendments; and §2/§3/§4 by §Z (M1's measurements) — read them before choosing a
provider, shaping the endpoint, or writing the gate.** §Z picks the numbers §3 and §4 left open —
including the ceilings M2 committed as deliberate placeholders — corrects §2's API host and its
account of the out-of-range failure, and (§Z6/§Z7) answers the orphaned leave-by
buffer and records that **the provider's default pedestrian answer boards scheduled ferries and
varies with batch size** — `use_ferry: 0` is not optional. **§Z8 then raises the walking ceiling to
15 km on the owner's call and §Z9 records why the driving one cannot be raised at all — read both
before touching `TRAVEL_GATE`.** **Built so far: the shared half only** — §1's decoder, §3's
gate and §4's key and shapes landed with M2 on 2026-08-25. No provider is called, no table exists,
nothing renders. The provider itself is the one thing still open, and §Y1 records the standing
default so no work is blocked on it.
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

**Amended by M2 (2026-08-25), built: the precision travels WITH the shape, so the trap becomes
unrepresentable rather than test-covered.** An argument is only as good as every call site, and no
runtime check can catch this one — the wrong answer is a well-formed pair of numbers. So a stored
geometry is `EncodedShape = { encoded, precision }` and the two cannot be separated; `decodeShape`
reads the precision off the record and nothing outside `routing.ts` names a precision at all. What
makes this concrete rather than defensive is §2's own fallback: **Geoapify encodes at 5**, so the
provider switch §Y1 keeps cheap is exactly the switch that would otherwise move every drawn line
ten times off the map. Two further details, recorded because each is a decision someone would
otherwise undo: **there is deliberately no encoder** (the round-trip test it enables passes at the
wrong precision, which is the bug), and a **malformed or truncated shape decodes to nothing** rather
than to the points that did parse — a partial line goes somewhere the route does not, and ADR-0206
§D4 makes "no line" free.

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

**Amended by M2 (2026-08-25), found by building: a cluster is not a ceiling, so walking and cycling
need both.** Rule 1 reads as "same cluster only" for those two, and that is not sufficient, because
ADR-0186 §4's clustering is **single-link at 40 km on purpose** — a chain of stops each under 40 km
apart is ONE area, which is what keeps a coastline from becoming a string of boxes. So a ring road
whose stops are 35 km apart is one cluster, "same cluster" alone admits a **175 km walk**, and it is
under the provider's own 200 km pedestrian refusal, so Valhalla would answer it: a forty-hour walk,
rendered as a travel time. Rule 3 is what forbids that; a **per-mode ceiling** is where it lives.

The gate is therefore one rule per mode — `TRAVEL_GATE`, a `Record<TravelMode, {sameClusterOnly,
maxMeters}>` rather than a `switch`, so a fourth mode does not compile until somebody decides what
it admits (ADR-0094/0095). **The ceilings are still M1's to measure and the committed numbers are
placeholders**: they are sized to be obviously-absurd bounds (25 km walking, 100 km cycling, 800 km
driving) rather than good ones, because only a real trip says whether a 25 km walk should ever be
offered. Two smaller findings: cluster membership is matched on the **rounded** coordinate (§4's own
snap, so a day's stop and the trip's point cannot miss each other over float noise), and a point in
**no** cluster answers "not same cluster" — which costs a walking estimate and never an error.

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

**Amended by M2 (2026-08-25), on the provider's own shape: the batch also carries `withShapes`,
because the matrix has no geometry.** `sources_to_targets` answers a whole day's durations in one
~1 s call and returns **no shape at all** — a drawable line is a second call, per leg. So the two
answers this endpoint gives have very different costs, ADR-0206 §D8 draws at most one line anyway,
and a flag is what lets the day read stay one call while the map asks for the one line it draws.
Off by default; a shape we already hold is returned either way, because stripping a cached field to
honour a flag would cost a second request to get it back.

**And the answer per leg is three buckets, not one list** — the modes we can answer, the modes the
gate **refused**, and the modes still **pending**. §D4 says the _user_ must never be able to tell
"not computed" from "not computable", and that is exactly why the _client_ must: without the split
it either polls forever for a refused pair or gives up on a warming one.

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

## Z. Amendment (2026-08-25) — M1's measurements: the five numbers, and three corrections

**M1 (the measurement spike) picked the numbers §3 and §4 deliberately left open.** Everything below
was measured live on 2026-08-25 against FOSSGIS Valhalla `3.8.3-49cd28b` (tileset of 2026-08-24),
using real coordinates. **No production code changed** — the constants are named here so M2 and M4
import a decided number rather than re-deriving one. Scripts were throwaway.

> **The code now matches (M2b, 2026-08-25).** `packages/shared/src/routing.ts` ships every number
> below: the three ceilings of §Z2, its new `ROUTE_MIN_CROW_M` floor enforced in `admitsTravelMode`,
> and §Z1's `ROUTE_COORD_DECIMALS = 5` (unchanged in value, its "M1 measures this" comment replaced
> by the measurement). Each carries its measurement in the comment beside it, and a spec asserts the
> four numbers as literals as well as testing each boundary — because a wrong constant shipping
> unnoticed is the failure this section exists to end. `sameClusterOnly` stays as §Z2 describes it:
> inert, kept, and commented as inert.

### Z0. What was measured against, and the one thing that limits it

**The dev seed carries no coordinates.** Its eight `Place` rows (`backend/prisma/seed.mjs`) are
name-only Place-lite (ADR-0147) — `lat`/`lng` are `null` on every one, and the comment above them
says so: _"the Google Places picker fills in googlePlaceId/lat/lng later."_ So "measure against the
dev seed" could not be taken literally, and **this is a blocker for every downstream milestone that
needs a routable trip**, not a quirk of M1. It has its own backlog line.

What was measured instead, and how to read each number's weight:

| corpus                  | what it is                                                                                                                                                                        | weight                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **the seed's own trip** | its 8 places geocoded from OSM by name, its 10 events walked in `sortOrder` — the trip the seed actually describes, with the coordinates a picker would fill                      | primary; **n is small (9 day-adjacent pairs, one routable day)** and every rate below carries that             |
| **four archetypes**     | Tokyo→Kansai, Iceland ring road (ADR-0162's car hire), a Paris day, a NYC day — real places, real coordinates, trip shapes this repo's own ADRs name as cases the gate must serve | secondary, and the **only** evidence for the driving ceiling: the seed has no long-distance driving leg at all |

29 day-adjacent pairs in total. **Every rate below is over that corpus and should be re-measured
once the seed has coordinates** — they are the best evidence available today, not a large sample.

### Z1. The cache-key snap: **5 decimals, confirmed** — and coarsening was the wrong instrument

**M2 shipped this one as `ROUTE_COORD_DECIMALS = 5` already** (`packages/shared/src/routing.ts`),
taking §4's proposal at face value. It is the right value, and the measurement below is why — so this
section **confirms the shipped constant and closes the question**, and adds no second name for it.

```ts
export const ROUTE_COORD_DECIMALS = 5; // ~1.1m N-S; 0.9m E-W at Tokyo. Unchanged, now measured.
```

§4 asked whether coarsening buys cross-trip hits. **Measured: it buys exactly none, and it cannot.**
Four findings, and the last one is the one that decides it:

1. **Two search pickers do not disagree.** Nominatim and Photon returned **bit-identical**
   coordinates for all 8 seed places — same OSM object, same centroid. They are not independent
   sources, so "two trips, two pickers" is already a 100% hit at any precision.
2. **The same-place distribution is bimodal with an empty middle.** Over 40 same-place pairs (one
   real place reached by different query spellings): **32 pairs at 0.0 m** (same OSM entity) and
   **8 pairs at ≥169.5 m** (a different entity — a market's node vs. its way, a station vs. its
   plaza). Nothing in between. At 5, 4 **and** 3 decimals the hit count is **identical: 32/40.** The
   smallest real gap (169.5 m) is wider than a 3-decimal cell (111 m N-S, 90 m E-W at Tokyo), so
   even the coarsest snap considered rescues nothing.
3. **A grid cell does not collide points inside it.** Monte-Carlo over the 8 real seed coordinates
   (N=20,000 per point): two coordinates **half a cell apart** share a key only **37–43%** of the
   time, and **a full cell apart, 0.4–3.4%**. Rounding collides only when both points fall the same
   side of every boundary. _"An 11 m cell rescues an 11 m pin"_ is false, and it is the intuition
   this measurement exists to kill.
4. **The provider already does this job, better, and at ~10 m.** Valhalla snaps every input to its
   road graph — measured snap distance over the seed places: **min 1.2 m, median 5.5 m, max 35.4 m**.
   Offsetting a real place and re-asking: **≤10 m → the same graph node and a byte-identical answer;
   ≥25 m → a different node and a different answer.**

So the collapse radius that matters is **the road graph's ~10 m, not our rounding's**. 5 decimals
(~1 m) sits safely below it, which is exactly what we want: the key never merges two inputs whose
answers genuinely differ. **4 decimals would be the worst of both** — its cell (11.1 m N-S, 9.0 m
E-W at Tokyo) straddles the 10–25 m boundary where answers start to diverge, so it would begin
merging genuinely-different answers while _still_ not reliably merging identical ones (finding 3).

**If cross-trip hits between a hand-dropped pin and a search result ever become worth buying, the
instrument is a proximity lookup at ~10 m — nearest cached endpoint within a radius — not a coarser
grid.** Recorded so the coarsening idea is not re-proposed; it was measured and it does not work.

### Z2. The mode ceilings: per-mode crow-flies distance, and **`sameClusterOnly` becomes a no-op**

**M2 shipped `TRAVEL_GATE` before these numbers existed, with its ceilings labelled placeholders and
"still M1's to measure" — so this section fills in that `Record`, it does not propose a second gate.**
The measured values for `packages/shared/src/routing.ts`:

```ts
export const TRAVEL_GATE = {
  // ⚠ walking is 15_000 in the code — the owner raised it, see §Z8. The rest is as measured.
  walking: { sameClusterOnly: true, maxMeters: 5_000 }, // was 25_000 (placeholder)
  cycling: { sameClusterOnly: true, maxMeters: 20_000 }, // was 100_000 (placeholder)
  driving: { sameClusterOnly: false, maxMeters: 300_000 }, // was 800_000 (placeholder)
} as const satisfies Record<TravelMode, TravelGateRule>;

/** New, and `admitsTravelMode` has no floor today: below this the provider answers 0-5s. */
export const ROUTE_MIN_CROW_M = 10;
```

**M2 already found half of this by building** — that "a cluster is not a ceiling", so walking and
cycling need a `maxMeters` too, and it cited a 175 km chained walk to prove it. Measured, the same
finding, from the other end: **all of these are inside ONE cluster and all pass `sameClusterOnly`** —
Fushimi Inari → Nara Park, 32.4 km, **a 463-minute walk**; Nara → Osaka Castle, 30.1 km,
**467 minutes**; Þingvellir → Geysir, 37.9 km, **662 minutes, an 11-hour walk.** M2's reading is
confirmed and the ceilings above are what close it.

**What the numbers add, and it is the part M2 could not know without them: once `maxMeters` is below
ADR-0186 §4's 40 km link radius, `sameClusterOnly` can no longer reject anything.** Single-link
clustering puts any two points within 40 km of each other in one area by direct link, and both
measured ceilings (5 km, 20 km) are under that. Verified against the shipped `sameTravelCluster` over
2,500+ random global pairs at ≤20 km separation: **every one co-clusters, so the cluster test never
changes an outcome.** M2's placeholders were the reason it looked load-bearing — at 25 km walking and
100 km cycling it genuinely was.

**And it is not merely inert, it is one-sided.** The only outcome it can still change is a **false
negative**: `sameTravelCluster` answers `false` for a point in no cluster at all, so a pair 140 m
apart is refused a walking estimate if its coordinates were missing from the cluster input — verified
against the shipped function. M2 named that behaviour and accepted it deliberately ("costs a walking
estimate and never an error"); with a sub-link-radius ceiling in front of it, that cost is all it can
ever produce. **So `sameClusterOnly` is safe to set `false` for all three modes**, and the gate
becomes one arithmetic check per mode. Leaving it `true` is harmless but dead, and it is the kind of
dead check a later reader will assume is protecting something.

**What M2b shipped, and why it is not that (2026-08-25).** The flag and its values are unchanged —
`true` for walking and cycling, `false` for driving, exactly as the code block above writes them —
and the reason is that flipping it is a behaviour change, not the application of a measurement:
today's `true` costs the one-sided false negative described above, and `false` would remove it. That
is a separate call from "ship the measured numbers", and M2b's card scoped it to the numbers. The
misreading this paragraph was worried about is answered instead by **saying so where the flag is
declared**: `TravelGateRule.sameClusterOnly`'s doc comment now carries the 2,500-pair result and the
words "inert, kept deliberately", so nobody has to reach this ADR to learn the check protects
nothing. Deleting the field is the option that is genuinely closed — driving still reads it.

ADR-0186's clustering keeps doing what it was built for (map extracts). §3's "one derivation, two
consumers" instinct was reasonable and the measurement simply does not need it — **this is deleting a
check, not adding a mechanism.**

**Where each number comes from** (walk/bike durations are live Valhalla answers for the corpus pairs):

| constant                             | measurement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROUTE_MIN_CROW_M = 10`              | **2 of the seed's 9 day-adjacent pairs are 0.00 km** (four events share `pl-shinjuku`), and Place-lite granularity makes that ordinary, not a seed bug. Measured at separation 0/1/5/10 m the provider answers **0 s, 0 s, 2 s, 5 s**; at 25 m it jumps to 65 s. Below 10 m there is no answer worth a matrix cell or a cache row.                                                                                                                                                                                  |
| `ROUTE_WALKING_MAX_CROW_M = 5_000`   | Admits **9 of 16** measured within-cluster pairs; **worst walk admitted 67 min**. First rejected is 60 min (5.80 km, an unusually indirect 1.71 road/crow), first genuinely absurd is **127 min** (8.58 km, Senso-ji → Shinjuku — a real seed pair). Measured walking speed **4.9 km/h** road. _(The road/crow figures this line first carried were computed from ferry-contaminated distances — see §Z7: ferry-free it is **1.08–1.32, median 1.16**. The ceiling is a crow-flies distance, so it is unaffected.)_ |
| `ROUTE_CYCLING_MAX_CROW_M = 20_000`  | Admits **13 of 16**; **worst ride admitted 91 min** (19.7 km). Rejects 94, 145, 154 and 192-minute rides. Cycling runs ~3.5× walking on the same pairs, which is why it gets its own number rather than sharing walking's.                                                                                                                                                                                                                                                                                          |
| `ROUTE_DRIVING_MAX_CROW_M = 300_000` | **The provider's own `auto` limit is 400 km of _path_ distance** (server-stated, §Z4). Measured `auto` road/crow: **1.23–1.34**, so 400 km road ÷ 1.34 ≈ 298 km crow. Admits **27 of 29** corpus pairs including every real Iceland leg (longest 209.7 km crow); rejects only Tokyo→Kyoto and the flight — **both of which this provider cannot answer anyway** (§Z4).                                                                                                                                              |

**A crow-flies gate is fuzzy at its edge** — a 60-minute walk can be rejected while a 67-minute one
is admitted, because road/crow is not constant. Ferry-free that spread is **1.08–1.32** (§Z7), which
is narrow enough that the fuzz is a few minutes rather than a category error. That is the price of
checking before the network, and §D4's chip covers the rejects. Do not "fix" it by routing first.

### Z3. Cluster-gate hit rate, recorded because M1 was asked for it

Over the 29 day-adjacent pairs, **20 (69%) fall in one cluster**: seed **7/9 (78%)**, archetypes
**13/20 (65%)**. Per trip: the seed's 8 places make **3 clusters**, Iceland's 8 stops make **7**,
Tokyo→Kansai makes **2**, the Paris and NYC days make **1** each.

The Iceland number is the one to keep: **only 1 of 7 ring-road legs is intra-cluster.** §3 already
predicted this in prose ("a road trip crosses clusters by definition"); it is now a number, and it
is the second reason the cluster gate could never have governed driving.

### Z4. Provider behaviour under our actual access pattern — and two corrections to §2

**Correction 1: the API host is `valhalla1.openstreetmap.de`.** §2 links
`https://valhalla.openstreetmap.de/`, which is the **demo web application** — it answers `200` with
an HTML page (`<div id="valhalla-app-root">`) for `/status` and for any API path, and rejects `POST`
with nginx's `405`. That is a correct link for a human and **a wrong base URL for M4**, and it fails
in the most expensive way: a `200` carrying HTML. The API host answers both `POST` and
`GET ?json=` identically. `valhalla2`/`valhalla3` do not resolve.

**Correction 2: there are TWO out-of-range failures, not one, and §2 records only the harsher.**
§2 says _"One out-of-range pair returns HTTP 400 for the entire matrix — not a `null` cell."_
Measured, it depends on **which** distance is over:

| condition                            | response                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| **crow-flies** over the mode limit   | **HTTP 400, `error_code 154`, the whole matrix dies** — as §2 says            |
| crow-flies under, **road path** over | **HTTP 200 with a `null` cell.** The matrix survives; only that pair is empty |

Measured: a 7-point `auto` matrix of the six Tokyo places plus Kyoto (371.5 km crow, 457 km road)
returned **HTTP 200 with 37/49 cells answered and 12 null** — the good pairs survived. Tokyo→Osaka
(400.8 km crow) returned 400 and killed everything. **So M4 must handle both**: pre-filter on
crow-flies to avoid the 400 (§3's gate, unchanged in purpose), _and_ treat a null cell as an ordinary
absence feeding §D4's chip rather than as a parse error. The error message names the limit exactly
(`"Path distance exceeds the max distance limit: 400000 meters"`), so the ceilings are read from the
server, not guessed: **`auto` 400 km, `pedestrian` 200 km, both on path distance.**

**Latency, our pattern (a 6×6 day matrix = 30 ordered pairs, cold, 5 runs each):**

| costing    | payload | min   | median | max     |
| ---------- | ------- | ----- | ------ | ------- |
| pedestrian | 7.53 KB | 536ms | 560ms  | 678ms   |
| auto       | 7.52 KB | 586ms | 646ms  | 1,034ms |
| bicycle    | 7.53 KB | 560ms | 589ms  | 684ms   |

**Faster than the 2026-08-24 research measured** (which saw 1.04–2.60 s for a 5×5), so §Y2's
"~1 s round-trip" arithmetic holds with margin. The tail is the number to design against: **~1 s**,
and ADR-0187's warm-in-background is already the pattern for it.

**The fair-use limit does not bind.** Six concurrent identical day matrices: **all HTTP 200, zero
429s, no `Retry-After`, 1.08 s wall** — no enforcement observed at anything near our pattern. **This
is not licence to burst.** 1 call/user/s is a request from volunteers, the politeness limiter in §Y2
stands, and absence of a rejection is not permission. Recorded because §Y1 makes it a switch trigger.

**Volume, which §Y1 point 3 said M1 would settle.** One matrix call answers 30 ordered pairs. A
10-day trip at 6 stops/day across 3 modes is **30 upstream calls and ~226 KB, for the life of the
trip**, writing ~900 `RouteLeg` rows; at the honoured 1 call/s that is **30 seconds of paced upstream
time for a whole trip**. §Y1's "~30 calls in its lifetime" was right. **Cache every cell the matrix
returns, not just the consecutive pairs** — the other 25 are already paid for, and a reorder or an
inserted stop then costs nothing.

### Z5. What this does to §Y1's switch triggers

**None of the three fired, so the standing default is unchanged: the community server.**
Fair use does not bind (§Z4), FOSSGIS has neither degraded nor asked us to stop, and transit remains
V2. The one thing M1 adds to that ledger is the tileset date the server reports
(`tileset_last_modified`, 2026-08-24) — **that is the cache invalidation signal §4 said a route has
and a clock does not.** It is free on `/status`, so M4 should record it on each `RouteLeg` write and
M12 can evict on a tileset roll rather than guessing a TTL.

### Z6. Re-checked against M3 (2026-08-25), and the leave-by buffer answered

M3's design session landed after Z1–Z5 were written. **None of the five constants changes.** But
re-reading it forced a measurement that found a wrong answer underneath them, so read §Z7 first —
it corrects two figures this section originally carried.

**The walking ceiling and M3's harmful example.** M3 names Senso-ji → Tokyo Station as the case
where a walking number is harmful rather than imprecise (73 min walking against 25 by train).
Measured ferry-free: **4.57 km crow — under `walking.maxMeters` of 5,000, so the gate admits it —
and a 67-minute walk** over 5.34 km of road, ratio 1.17.

Once §Z7's ferry is out of the data, **road/crow is tight** — 1.08 to 1.32 across every real leg in
the corpus (median 1.16; the lone 1.96 is a 100 m leg where one block dominates). That makes a
crow ceiling a **usable** duration proxy, which the contaminated figure had suggested it was not:

| if the product wants a walk bounded at | the crow ceiling is |
| -------------------------------------- | ------------------- |
| ~60 min                                | **~4,000 m**        |
| ~70 min (today's 5,000)                | 5,000 m             |

`walking.maxMeters = 5_000` **stands as the network gate** — its job is to not spend a call and not
trip §Z4's 400. **Whether it should also be 4,000 to bound the read at an hour is ADR-0206's call,
not this ADR's**, because it decides what a person sees. The measurement is here so that call is
made on a number rather than a feeling.

#### The leave-by buffer: it was three things, and only one of them is a buffer

`TRAVEL_BUFFER_SECONDS = 5 * 60` shipped as a placeholder, and it is orphaned — M2 assigned it to
M3, M3 assigned it to M1, M1's card never listed it. It stayed orphaned because it was posed as one
unmeasurable number. It is three, and two of them are not buffers at all:

1. **A wrong road network.** §Z7: the default pedestrian answer boards a scheduled tourist ferry.
   Worth **+22.7 min** on one seed leg alone. **No buffer covers a boat you cannot board** — the fix
   is `use_ferry: 0` on the request, and it is free.
2. **Pace.** Valhalla's `walking_speed` defaults to **5.1 km/h**, a brisk solo adult. This app is for
   **groups of ~5** (root `CLAUDE.md`), which do not move at 5.1. This is a **request parameter**,
   not a hedge: measured on Senso-ji → Shinjuku, `walking_speed: 4.5` costs **+13%** and `4.0` costs
   **+27%**, and Valhalla re-models the crossings around it rather than adding a flat lump. Setting
   the pace we mean is strictly better than buffering the pace we did not mean.
3. **Departure overhead** — finding the door, settling the bill, gathering five people. Constant,
   independent of leg length, and genuinely not derivable from a router.

**Strip 1 and 2 into the request and what is left is (3), which a constant fits exactly — so
`TRAVEL_BUFFER_SECONDS = 5 * 60` stands, with its job narrowed to departure overhead and documented
as such.** That is the answer to the orphan: not "measure it on a real day", but _stop asking one
number to absorb a scheduled ferry, a pace assumption, and putting your shoes on_. Five minutes for
a group of five to get out of a door is defensible as a floor; it is the other two that were making
it look wrong.

The interaction M2's comment flags is unchanged and now bounded: the buffer shifts the leave-by
earlier by exactly its own size, so against M3's `LEAVE_BY_SWAP_MINUTES = 30` a 5-minute buffer
fires the swap 5 minutes early. At 15 it would eat half the threshold — another reason the buffer
should hold only the constant that has to be there.

### Z7. The provider gives a wrong walking answer by default, and an inconsistent one (2026-08-25)

Found by asking why two corpus legs showed a ~10 km/h "walk". **Both bugs are silent, both are in
the endpoint we actually call, and one request parameter fixes both.**

**1. Pedestrian routing boards scheduled ferries.** Asakusa → Tsukiji comes back as
`"Take the 水上バス　浜離宮～浅草 Ferry."` — a **7.48 km maneuver at 16.4 km/h inside a pedestrian
answer**. It is the Sumida River tourist boat, it runs to a timetable we do not have, and the app
would render its 64.8 minutes as a walk. Ferry-free the same leg is **87.5 minutes: the default is
22.7 minutes optimistic**, and optimistic about catching a boat.

Scope, `use_ferry: 0` vs default, day matrices: **Tokyo 2/30 pedestrian legs**, **NYC 6/12**,
**Iceland 4/12** (worst delta +478 min); **Paris 0/20**. Driving and cycling were unaffected on every
leg tested — Iceland's and NYC's road legs route identically with and without — so **this is a
pedestrian (and cycling, defensively) request option, not a global one.**

**2. The matrix answer depends on how many stops are in the batch.** Valhalla silently switches
algorithm by size, and the two disagree wherever a ferry is reachable:

| request                     | algorithm            | Asakusa → Tsukiji                     |
| --------------------------- | -------------------- | ------------------------------------- |
| 1×1, 2×2, 3×3, and `/route` | `timedistancematrix` | 64.8 min / 10.378 km (takes the boat) |
| 6×6 (a real day)            | `costmatrix`         | 87.4 min / 13.343 km                  |

**Same pair, same mode, a 22.6-minute spread decided by batch size.** For §4's cache that is the
serious half: the key is `(mode, from, to)` and records nothing about the batch, so which answer a
leg is cached with becomes a race between whichever day fetched it first. Four of six legs checked
agree exactly; the two that disagree are the two the ferry reaches.

**`use_ferry: 0` fixes both** — with it the 6×6 and the 1×1 return **87.5 min / 7.08 km**, identical.
So it is not a preference, it is what makes the cache coherent.

**This also corrects two figures Z2 and Z6 first carried**, both computed from ferry-contaminated
distances: road/crow is **1.08–1.32 across real legs (median 1.16)**, not "median 1.32, max 2.06",
and Senso-ji → Tokyo Station is **5.34 km road, ratio 1.17, 67 min**, not 9.80 km / 2.14 / 74 min.
The ceilings in Z2 are unaffected — they are crow-flies distances, and no ferry moves those.

**M4 must send `use_ferry: 0` on pedestrian and cycling.** It is one line, and without it the app
ships a walking time that assumes a boat.

### Z8. The owner raises the walking ceiling to 15 km (2026-08-25)

**`TRAVEL_GATE.walking.maxMeters` is `15_000`, not §Z2's measured `5_000`.** The owner's reason, on
reading M2b: _"there are times where we'd prefer walking for the fun of it."_

**§Z2's 5 km was never a limit of the provider** — pedestrian answers to 200 km of path, and the
ceiling exists only so the gate can run before the network. It was a judgement that a walk past
about an hour stops being _useful_, drawn from "worst walk admitted 67 min, first genuinely absurd
127 min". That judgement is the owner's to make and it has been made the other way: a group that
chooses a three-hour walk is not a group that wants it refused. **What the measurement is for is
telling you what you are buying** — at the measured 4.9 km/h and §Z7's 1.16 median road/crow,
15 km crow is a **~3.5-hour walk**, and it admits the 127-minute Senso-ji → Shinjuku pair by name.

**Two constraints on the new number, and both are why it is 15 and not larger:**

1. **It must stay under ADR-0186 §4's 40 km link radius**, or §Z2's "`sameClusterOnly` can no
   longer reject anything" quietly stops being true and that flag becomes load-bearing again
   without anyone deciding it should. A spec now asserts this for every cluster-bound mode, so the
   next raise fails a test rather than falsifying this ADR.
2. **It must stay at or under cycling's 20 km.** A leg you may cycle but not walk is ordinary; a leg
   you may walk but not cycle would read as a broken mode control. Also specced.

Above 15 km the honest instrument is not a bigger ceiling but ADR-0206 §D3's ladder having something
sensible to say about a five-hour walk, which nothing has designed yet.

### Z9. Why the driving ceiling cannot simply be raised (2026-08-25)

Asked on M2b, of a real trip: _"we have days in our upcoming Iceland trip where we cover much
greater distances between stops."_ Recorded because "raise the number" is the obvious response and
it is the wrong one.

**300 km crow is not our taste, it is the provider's 400 km of _path_ divided by the worst measured
road/crow ratio (1.34).** Past its own limit the provider does not answer badly, it answers `400`
with `error_code 154` — and §Z4 measured that **one such pair kills the entire day matrix**, not
just that leg. So raising our ceiling past ~300 km does not buy longer answers; it buys days that
return nothing.

**And the ceiling is not what an Iceland ring road hits.** Crow-flies over the real stops (computed
2026-08-25; the live provider could not be re-queried from that session's network):

| leg                       | crow km | at the 300 km ceiling |
| ------------------------- | ------: | --------------------- |
| Reykjavík → Vík           |   165.4 | admitted              |
| Vík → Jökulsárlón         |   154.9 | admitted              |
| Jökulsárlón → Egilsstaðir |   158.4 | admitted              |
| Egilsstaðir → Akureyri    |   178.3 | admitted              |
| Höfn → Akureyri           |   210.0 | admitted              |
| Reykjavík → Akureyri      |   248.1 | admitted              |
| Reykjavík → Jökulsárlón   |   277.3 | admitted              |
| Reykjavík → Mývatn        |   284.1 | admitted              |
| Reykjavík → Höfn          |   326.0 | **refused**           |
| Reykjavík → Egilsstaðir   |   379.3 | **refused**           |

**Every plausible ring-road day leg is admitted**, including the long transfer days. The two
refusals are both legs whose _road_ distance is well past the provider's 400 km limit (Reykjavík →
Egilsstaðir is ~650 km by road), so they are refused by the provider too — the gate is only
declining to spend a request learning that, and taking the rest of the day's matrix down with it.

**Three ways the limit could actually move, none of them this constant:**

1. **Isolate the long pairs.** §Z4's two failure modes are not equal: a `400` kills the matrix, a
   `null` cell does not. A pair over the ceiling sent in **its own** request costs only itself when
   it fails. That would let the gate admit up to the provider's true boundary (~400 km path)
   instead of the conservative crow proxy. **This is M4's shape, not a number** — and it is the
   only one of the three that is cheap.
2. **Self-host** (§Y1). `max_distance` is a server config; ours to set if the server is ours. This
   is precisely one of §Y1's switch triggers finally having a concrete case behind it.
3. **A different provider** behind §2's port. Geoapify has its own limits; no one has measured them.

Until one of those, a leg past the ceiling reads as ADR-0206 §D4's ordinary absence — which for a
650 km road day is arguably the true answer anyway: that is not a leg, it is a travel day, and
ADR-0011 says a real commitment inside it is a hard event with its own time.
