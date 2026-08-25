# Routes and travel time — what is actually possible now that the renderer is ours

**Date:** 2026-08-24
**Branch:** `claude/map-routes-travel-time-rgriqk`
**Status:** Research. **No decision taken** — this is the input to an ADR, not the ADR.
**Raised by the owner:** the map draws straight lines between places and the app has no travel
estimate beyond crow-flies distance. Routes were deferred on Google Places/Routes cost
([ADR-0121 §14](../decisions/0121-embedded-map-phase-6-design.md), [backlog](../backlog.md) "Paid
Routes / live ETAs"); [ADR-0186](../decisions/0186-the-map-is-ours-and-it-works-on-a-plane.md)
changed the renderer, so the deferral is worth re-testing.

## The premise needs one correction, and it does not change the answer

**MapLibre GL JS does not compute routes.** It is a renderer — it draws a `LineString` you hand it,
and `DayConnector` in `MapPane.tsx` already does exactly that. The official
[`maplibre-gl-directions`](https://github.com/maplibre/maplibre-gl-directions) plugin (MIT) is a
_UI wrapper_: it draws and manages waypoints, and delegates every route to "any OSRM- or Mapbox
Directions-compatible provider". Nothing in the MapLibre swap made routing free by itself.

**What did change is the reason we said no, and that reason is now gone** — the same shape as
ADR-0186's own "the reason we said no is wrong". The deferral was never really about drawing a
line. It was about Google's per-request bill _and_, more decisively, Google's **prohibition on
caching route results**, which forces a paid call on every view. Both are properties of that
vendor. OSM-based routing has neither: the engines are FOSS, the hosted tiers are free at our
volume, and **ODbL lets us cache the answer forever**. §4 is the part that matters most.

## What routing over OSM actually costs — measured, not read

All numbers below are live calls made from this session on 2026-08-24 against the public
[FOSSGIS Valhalla](https://valhalla.openstreetmap.de/) planet server, using real Tokyo coordinates
(Senso-ji, Skytree, Ueno, Akihabara, Tokyo Station).

### A single route

| call                                                | result                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /route`, pedestrian, Senso-ji → Skytree       | **HTTP 200 · 0.92 s · 11.1 KB** · 1,268 s (21 min), 1.806 km, 20 maneuvers |
| the geometry inside it                              | **410 characters** of encoded polyline                                     |
| `POST /route`, auto, Tokyo Station → Kyoto (457 km) | 200 · 0.84 s · 39 KB · 5.9 h                                               |
| OSRM demo server, driving, same city pair           | 200 · 0.66 s · 1.3 KB                                                      |

**410 characters.** That is the whole cost of storing a walking route between two places. The
"expensive" thing we deferred is smaller than most of our place records.

### A whole day, in one request

`sources_to_targets` (Valhalla's time+distance matrix) over all five stops — a 5×5 matrix:

| costing    | response | latency | Senso-ji → each stop (min) |
| ---------- | -------- | ------- | -------------------------- |
| pedestrian | 2.3 KB   | 1.04 s  | 21 · 31 · 46 · **73**      |
| auto       | 5.4 KB   | 1.15 s  | 7 · 11 · 11 · 14           |
| bicycle    | 2.3 KB   | 2.60 s  | 9 · 11 · 14 · 23           |

**One HTTP call answers every pair in a day.** A 10-day trip at 6 stops a day is 10 calls per
costing mode — thirty calls for a whole trip, _ever_, against free tiers measured in thousands per
day. The cost argument that deferred this does not survive contact with the numbers.

### Three failure modes, all found by calling rather than reading

1. **One bad pair kills the whole matrix.** A matrix containing a Tokyo→Paris pair returns
   `HTTP 400` for the _entire request_, not a `null` cell. Any day matrix must be pre-filtered by
   crow-flies distance first — which we can do offline with the `haversineMeters` already in
   `@waypoint/shared`. This is a real constraint on the design, not a detail.
2. **Pedestrian routing has a hard 200 km ceiling** (`error_code 154`, server-configured). Fine
   for a day's stops, fatal if we ever hand it a flight's endpoints.
3. **Cross-cluster pairs must never be routed at all.** ADR-0186 §4 already clusters a trip's
   coordinates; the same clustering is the gate here. Two places in different clusters get the
   existing crow-flies chip, not a route. **The clustering we built for tiles is also the routing
   scope** — one derivation, two consumers (rule 8).

## The transit gap is the honest hard part

Look at the pedestrian row again: **Senso-ji → Tokyo Station is 73 minutes walking**. Nobody walks
it. The real answer, measured against [Transitous](https://transitous.org/) (community MOTIS, global
GTFS):

> 9 itineraries · best is **25 min, 1 transfer** (walk 8 → Tsukuba Express 5 → walk 2 → JR 4 → walk 3)

**48 minutes of difference.** A city app that answers "how long to the next stop" with the walking
number is not merely imprecise, it is wrong in the way that makes someone miss a reservation. This
is the single biggest finding in this note and it is the thing that decides whether the feature is
worth building at v1 scope or needs phasing.

And transit is the one piece nothing free gives us cleanly:

- **The FOSSGIS Valhalla server has no transit data.** Confirmed: `multimodal` on `/route` returns
  "Locations are in unconnected regions", and `sources_to_targets` rejects `multimodal` outright.
  Valhalla _supports_ GTFS, but only if the tiles were built with it — theirs were not.
- **Transitous works beautifully and we may not use it.** Its terms: _"not intended for commercial
  or for-profit purposes"_, and applications must _"publish source code under an appropriate
  open-source license"_. Travelive is a private-repo product. **Ruled out**, cleanly, before
  anyone builds against it.
- **Self-hosting [MOTIS](https://github.com/motis-project/motis) (MIT)** is the un-blocked path —
  it takes one `osm.pbf` plus GTFS feeds and does street routing, transit, geocoding and tiles.
  It is also a second service, a second import pipeline, and per-region GTFS sourcing, which is a
  materially bigger operation than anything in §5.

## The unlock is caching, and it is a licensing fact

Google's Routes terms forbid caching, which is why every ETA there is a live paid call and why
ADR-0121 §14 called it "a second cost envelope". **OSM-derived routes are not like that.**

- OSMF's [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines):
  individual geocoding/routing **results do not carry attribution** and are not a Derivative
  Database, _provided they do not form one_. The app must credit OpenStreetMap somewhere — and it
  already does: `MAP_ATTRIBUTION = '© OpenStreetMap · Protomaps'` in `lib/map-style.ts`, rendered
  on the canvas per ADR-0186's Consequences. **The attribution obligation is already discharged.**
- Share-alike triggers on _Publicly Using a Derivative Database_ — distributing OSM data or a
  derived database outside the organisation. A per-pair cache of "walking A→B is 21 min, here is
  the polyline", read back by our own app, is a set of results, not a republished road database.
  Worth a sentence in the ADR and worth not over-thinking; it is the posture every routing app on
  OSM operates under.

**And our routes are unusually cacheable, because our places do not move.** A `Place` row has fixed
coordinates. Walking A→B is a _static fact_ about the world, not a live query. Which means the cache
key is `(placeA, placeB, mode)` and the entry effectively never expires — invalidated by an OSM
data refresh, nothing else. Driving-with-traffic and transit-at-a-time are the only genuinely
time-varying answers, and neither is in a v1 built on walking.

**This maps exactly onto a rule we already wrote.** ADR-0186 §6: _"an extract is a cache, never
data"_. A route is the same kind of object — nothing a person authored lives in it, losing one costs
a recomputation and nothing else. That licenses the same aggressive posture, and it means a route
cache is not a violation of ADR-0018/0027's derived-not-stored rule any more than a tile archive is.

## The options, scored against this repo's actual constraints

|                               | terms                                                                                | our volume                 | transit                     | operational cost                            |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------- | --------------------------- | ------------------------------------------- |
| **FOSSGIS Valhalla** (public) | fair use, 1 call/user/s, asks for an `X-Client-Id` header                            | free, and we are far under | **none**                    | zero                                        |
| **Self-hosted Valhalla**      | none beyond OSM attribution                                                          | unlimited                  | only if we build GTFS tiles | a service + volume + per-region graph build |
| **Self-hosted MOTIS**         | MIT                                                                                  | unlimited                  | **yes**                     | highest — OSM + GTFS import per region      |
| **Geoapify**                  | 3,000 credits/day free, commercial allowed, **caching/storage explicitly permitted** | comfortable                | limited                     | zero, but a key and a vendor                |
| **openrouteservice**          | free tier ~2,500/day, 40k/month, cumulative across all endpoints                     | comfortable                | none                        | zero, but a key                             |
| **Stadia Maps**               | free tier is **non-commercial only**, and caching is **prohibited**                  | —                          | —                           | **ruled out** on terms                      |
| **Transitous**                | non-commercial, open-source apps only                                                | —                          | excellent                   | **ruled out** on terms                      |

Two of the seven are ruled out by their own terms before any technical comparison — which is the
kind of thing worth finding in an afternoon rather than after a build.

## What this unlocks, concretely

The owner's instinct that this "opens a lock" is right, and the list is specific:

- **Time-to-next on the hero.** [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md)'s
  horizon has `איפה` with a `ניווט` hand-off and no answer to "how long". The backlog has literally
  been carrying the target string — `23 דק׳ · צאו ב־18:37` — since ADR-0106.
- **[ADR-0159](../decisions/0159-the-day-says-what-is-between-two-events.md)'s free-time claim is
  currently overstated, and this is the fix.** `פנוי · 2:40 שע׳` counts the whole gap as free. If
  40 minutes of it is the walk to the next stop, the app is telling you that you have time you do
  not have. A gap minus travel is the _true_ free window, and it is the same slot, restated.
- **The day connector stops lying by omission.** `DayConnector`'s own comment reserves the ground:
  _"Dashed because a straight segment is not the route you will walk — drawing it solid would claim
  it is — which also leaves **solid + amber** unspent for a real Routes polyline later."_ The
  design decision was made in advance; this is what spends it. (Rule 4 check: amber is time and
  commitment, and a travel duration is time. It fits.)
- **Ripple gets real inputs.** Soft events currently move on clock arithmetic alone; travel time is
  the missing term (ADR-0011 keeps hard events out of it either way).
- **Notifications get sharper.** ADR-0198 notifies what you can still miss; "leave in 10 minutes"
  is a stronger obligation than "starts in 30".

## Offline: precompute, do not route on-device

In-browser routing (a Valhalla/WASM graph in the PWA) is not a realistic path — there is no
production WASM build and the graph is far heavier than a tile extract.

**But we do not need one.** A trip's stops are known in advance, which means the routes between
them are computable in advance and are ~400 bytes each. So a route cache is a **third artefact
alongside the world layer and the trip extract**, built by the same pipeline, downloaded on the
same policy, evicted by the same rules. ADR-0186's §5/§6 machinery takes it with no new concepts.
Only an ad-hoc route to somewhere you had not saved would need a network — and that already degrades
to the crow-flies chip `lib/distance.ts` exists for.

## Recommendation

Phase it, and let the first phase be cheap enough to be reversible.

1. **Walking + driving, matrix-first, cached per place-pair.** Backend proxy (ADR-0108/0110's rule:
   never straight to a vendor), one matrix call per day per mode, crow-flies pre-filter against the
   200 km ceiling and cluster boundaries, cache keyed `(placeA, placeB, mode)`. Start on
   **FOSSGIS Valhalla** behind an interface — it costs nothing and it is the same wire format as a
   self-host, so §5's decision stays deferred and reversible.
2. **The reads.** Time-to-next on the hero, gap-minus-travel in the day, the solid polyline on the
   connector. This is where the product value is, and none of it needs phase 3.
3. **Self-host Valhalla** only when phase 1's volume or the fair-use policy says to. Not before.
4. **Transit** as its own decision, on its own evidence. It is the 48-minute finding and it deserves
   an ADR rather than a rider on this one.

## Open questions for the owner

- **Is walking-and-driving-only acceptable for v1?** The Tokyo number says an ETA without transit
  is wrong in a dense city, and that is the whole shape of this trip type.
- **Does a public community server belong on the critical path**, even behind our proxy and even
  with a cache in front of it? The alternative is operating Valhalla, and that is a real cost.
- **What does the map draw** — every consecutive pair of the day, or only the selected/next one?
  Five solid polylines on a phone will fight "quiet base, loud pins" (ADR-0121). This is a design
  session with a mockup, not a code decision.
- **Which mode is the default per trip?** A car trip in Iceland and a metro trip in Tokyo want
  different defaults, and the trip may be the right place to hold it.

## Note on the attached screenshot

The homepage screenshot attached to the request **arrived as an empty capture** — the status bar
(01:33, 34% battery) over a pure-black body with no app content. Nothing in this note is informed by
it. If the intent was to show a specific hero treatment, it is worth re-sending.
