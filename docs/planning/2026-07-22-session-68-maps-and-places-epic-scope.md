# 2026-07-22 · Session 68 — Maps & Places epic: PM scoping

**Type:** Product-management session (no code). Sets the scope frame and phasing for the Maps & Places work; design, FE-arch, and BE-arch are explicit follow-ons.
**Output:** [ADR-0106](../decisions/0106-maps-and-places-epic-scope-and-phasing.md) + backlog rework + this note.

## Why now

The Map is the last unbuilt core tab — a dead `<Placeholder>` in a primary nav slot (UI/UX review U-06). The early record (vision pillar 3, feature-catalog "Should", the backlog "Map tab" item) predates the current data model, so we re-scoped from where we actually stand rather than inheriting the old sketch.

## Where we stood (the read-in)

- **Data layer already shipped, ahead of the feature.** The `Place` entity (ADR-0048) + full normalization (ADR-0051) mean every location is already a `Place` FK and "every place on this trip" is one query. But almost every `Place` is "Place-lite" (name only, no `googlePlaceId`/coords) because there is no picker yet — so nothing can be pinned/measured/navigated.
- **Two standing holes the picker fixes:** EventForm lost its place-authoring input (ADR-0051 removed it rather than build a throwaway), and every place lacks coordinates.
- **Standing blocker:** the Google Cloud project (OAuth consent, Maps/Places keys, billing) — the human task gating any real Google surface.
- **Already-decided scope not to re-litigate:** own-device location IN / member GPS sharing OUT (ADR-0006); navigate-to-next deferred _to this work_ (ADR-0045); integrations are pipes but Map is a first-class _surface_ (ADR-0004); we deep-link to Google Maps, we don't rebuild nav; pin colour derives from `category` (ADR-0038).

## Decisions taken (→ ADR-0106)

Three framing calls were made by Assaf via a scoping question set:

1. **Map fidelity:** list-of-pins + deep-links **first**, embedded rendered map as a **defined fast-follow** (not a rewrite).
2. **Picker sequencing:** **bundle** the Places picker into the one Maps epic (not a separate epic) — but it is the foundational first task.
3. **Mode:** **one Map tab, re-emphasized by mode** (both jobs — Plan research + Trip near-me/navigate — on one surface, like Home/Day).

Layered on in discussion:

- **Filtering is first-class and free** — pure client-side derivation over the snapshot (offline-safe), reading a new **place-usage index** (`{ days[], categories[], isMaybe, isScheduled }` per `Place`). Near-term filters: **day · type · maybes**. **"By area" deferred** to the embedded-map phase (pan/zoom is the real area filter; no data model for locality). **Trip mode defaults to today's places** (the mode pivot, rides the day-strip); Plan defaults to all.
- **Cost discipline as a constraint** (Assaf flagged API cost): the `Place` row _is_ the cache (ADR-0048 already decided this), dedup by `googlePlaceId`, session tokens on autocomplete, deep-links + list/filter cost nothing — only new searches and (later) tiles are paid.
- **Navigate-to-next** returns the fourth Home tile (ADR-0045) + lives on the Map; deep-link resolving the transport origin `Place`.

## Phasing

0. Google Cloud setup (human) + key-handling call (BE-arch).
1. Places picker (keystone) — enrich + dedup, wired into all place fields, EventForm authoring restored.
2. Places as real data on existing surfaces (deep-links on booking/event detail).
3. Map tab v1 (list) + place-usage derivation + day/type/maybes filters + mode defaults.
4. Trip-mode live jobs — geolocation permission, near-me sort, navigate-to-next.
5. Plan-mode research — search on the tab → pin → "+ maybe".
6. Embedded map (fast-follow) — rendered pins + the "by area" filter as pan/zoom.

Ordering was confirmed to match Assaf's instinct — the non-obvious call being that _all_ place-authoring (P1) and value-on-existing-surfaces (P2) come **before** the tab renders anything (P3), so the picker earns its keep immediately.

## Schema verification pass

Checked the place-usage derivation against `schema.prisma` + `packages/shared` before treating it as real (captured as ADR-0106's "Data-model verification" section). Confirmed: the snapshot ships `places`/`maybeItems`/`events`/`bookings` together (offline-safe holds), and `Place` is multiply-referenced (union semantics correct). Five refinements banked into the ADR: `isMaybe` keys on `MaybeItem.consumed`; a booking's day comes only from its linked event (unlinked booking → no day); transport contributes both from/to pins; event place resolution is conditional (reuse `lib/places.ts` + shared `bookingEventFields`, don't re-derive); coordless "Place-lite" rows are list-able but not pin-able (confirms Phase 3 can partly run before the picker). One open design Q surfaced: multi-day place under the day filter — every span day vs. edge days (follow 0054/0064's ambient-vs-edge precedent).

## Embedded-map (Phase 6) decisions

Feasibility discussion on the fast-follow map converged into concrete Phase-6 decisions (captured in ADR-0106's dated "Embedded map" section):

- **Maps JavaScript API, not the Embed API** — the free iframe can't be brand-styled; the JS API is required for our palette + custom pins/routes, accepting billed dynamic map loads because the Map is a primary surface.
- **Fully brand-styled** — cloud styling (`mapId`) for the base cartography, `AdvancedMarkerElement` for our own HTML pins (the ADR-0087 Waypoint marker as the literal pin), night/day styles swapping on `data-theme` (0028/0082); Google logo/attribution stay (ToS).
- **Design principle: quiet base, loud pins** — desaturated neutral canvas, semantic colour only on pins/routes (teal=location, amber=time-anchor), never flooded across the base — keeps 0028's colour budget intact. (Assaf's call.)
- **Day-connection spectrum** — free straight `Polyline` connectors + a free whole-day Google Maps waypoint deep-link ship first; paid **Routes API** ETAs are a later enhancement.
- **Trip macro = per-day** connectors/routes on one fit-to-bounds map (not one whole-trip route — semantically weak + waypoint-capped).
- **Routes are visibility, not nav** (turn-by-turn still deep-links out); a route ETA between hard anchors _is_ the "when do we leave" answer (U-06 / Now-Next / navigate-to-next tie-in) — the reason to pursue paid routes eventually.

## Left open for the follow-on sessions

- **BE-arch:** Places API key model — restricted client key vs. backend proxy (the cost/exposure lever).
- **FE-arch:** one shared search core vs. two components (leaning shared, two presentations); reuse the Index chip/search/mode-accent grammar (ADR-0098/0100, `lib/index-bookings.ts`) for the Map filter row rather than a second copy. **Also inherits ADR-0108's FE requirements** (proxy-only calls, debounced autocomplete, FE-minted session token, graceful 429 handling) — consolidated in the session-70 note's "FE-architecture handoff".
- **Design:** geolocation permission UX + degrade-if-denied.
- **Product (minor):** ratify union semantics + colour-by-most-committed for multi-facet places.

## Multi-zone time model (→ ADR-0107)

A location question surfaced that turned out to touch the core time primitive: the single `Trip.timezone` renders every event in one zone, which is wrong for zone-crossing transport (a TLV→NRT flight's departure shows in Tokyo time). Diagnosed and designed into a Proposed **ADR-0107**:

- Storage is already zone-correct (instants are absolute, ADR-0018) and the now/next engine is already correct (instant vs clock) — the bug is confined to display/authoring/day-framing.
- Places carry a timezone (derived from coords via a free offline lat/lng→zone lookup, cached on the row) → the fix **rides the Maps epic's picker** (ADR-0106 Phase 1).
- Separate three conflated roles: authoring default, **sticky** event display zone, and the live "now" — only the live "now" tracks your position, so a fixed plan never appears to move.
- Placeless events resolve by itinerary **segment** (zone-crossing transport partitions the timeline; before the outbound = base, after = destination), **not device GPS** (Assaf's counterexample: at the base airport on flight day, GPS confidently returns base even when you mean the destination). Falls back to a demoted `Trip.timezone` base zone. The resolved zone is always a visible, editable chip.
- Edge rules banked: keep-wall-clock-shift-instant on late place-attach; file a crosser under its departure day/zone; zone-tag cross-zone times.
- Sequencing: `Place.timezone` folds into Phase 1; the display/authoring/segment layer is a follow-on alongside Phases 2–3, independent of the map render. ADR-0106 updated with this dependent workstream.

## Follow-on sessions & handoff roadmap

This PM session produced the scope (ADR-0106) and the time model (ADR-0107); the work now fans out into focused follow-on sessions. **Start each in a fresh chat** (context-as-RAM, root `CLAUDE.md`): the ADRs + this note are the handoff — a new session reads its "read first" set and is oriented, no context carried over. Rough order below; the two paper sessions (design, BE-arch) and the human Google Cloud task can run in parallel.

| #   | Session                                                                                                   | Goal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Read first (handoff)                                                                                                                                           | Depends on               | Output                                                    |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| 0   | **Google Cloud setup** (human)                                                                            | OAuth consent, enable Maps JS + Places + Routes API, billing, and **two referrer/IP-restricted keys** (browser + server, ADR-0108) + a **required budget alert + per-SKU daily quota cap** and re-confirm current pricing before any key ships (ADR-0108 §6).                                                                                                                                                                                                                                         | ADR-0106 Phase 0; ADR-0108; `engineering/prerequisites-checklist.md`                                                                                           | —                        | Keys + a live Places/Maps project (gates all _real_ work) |
| 1   | **Design — the Map surface** ✅ **DONE** (2026-07-23, → ADR-0109 + `mockups/map-tab-v1.html`, session-71) | The list-first tab, filter chips (reuse the Index grammar), mode defaults, pin/marker visual, geolocation-permission UX, and the Phase-6 brand-styled map look. **Delivered** all of that + day-strip reconciliation, forms (places+timezones), explicit event-category model, ratings, the Phase-1 picker flow, and a reuse audit. **Deferred by decision:** the _detailed_ Phase-5-research + full-Phase-6-map mockups + navigate-to-next → their own build sessions (ADR-0109 "Scope … deferred"). | ADR-0106 (+ its embedded-map §); `design/design-language.md`; `design/mockups.md`                                                                              | — (needs no code)        | ✅ ADR-0109 + `mockups/map-tab-v1.html` (session-71)      |
| 2   | **BE-architecture** ✅ **DONE** (2026-07-23, → ADR-0108, session-70)                                      | Places API key model + the Phase-6 cost envelope (JS-API map loads + Routes API); the offline lat/lng→zone library. **Decided:** two-key split + thin backend proxy on the `places` module; `geo-tz` server-side; the `Place` row is the cache; adds `Place.timezone` + `@@unique([tripId, googlePlaceId])`.                                                                                                                                                                                          | ADR-0106 (cost §, open questions); ADR-0107; `backend/CLAUDE.md`; `architecture/tech-stack.md`                                                                 | Google Cloud (for keys)  | ✅ ADR-0108 (key/cost/library-shape ADR)                  |
| 3   | **FE-architecture**                                                                                       | Shared search-core vs. two components; the filter/place-usage derivation; how ADR-0107's per-event zone threads through `lib/time.ts` / `lib/places.ts`. **Inherits ADR-0108's FE requirements** (proxy-only calls, debounced autocomplete, FE-minted session token, graceful 429 handling — see the session-70 note's "FE-architecture handoff") **and ADR-0109's surface/reuse decisions** (ChoiceGrid / ui-feedback / ListRow / WhenField reuse; the context-aware `setActiveDate` change).        | ADR-0106; ADR-0107; **ADR-0108** (+ session-70 note's FE handoff); **ADR-0109**; `frontend/CLAUDE.md`; `lib/time.ts`, `lib/places.ts`, `lib/index-bookings.ts` | Design + BE-arch decided | An FE-structure ADR                                       |
| 4+  | **Implementation**                                                                                        | Phase 1 (picker + `Place.timezone`) first, then outward through ADR-0106's six phases; the ADR-0107 display/segment layer rides alongside Phases 2–3.                                                                                                                                                                                                                                                                                                                                                 | ADR-0106 phasing; ADR-0107; the design/FE/BE ADRs above; `backlog.md`                                                                                          | Sessions 1–3             | The shipped tab, phase by phase                           |

**Open sub-questions to resolve in the sessions above** (from ADR-0106/0107): the shared-search-core call (FE-arch, leaning shared); union semantics + colour-by-most-committed for multi-facet places (product/FE); `Event.displayTimezone` store-vs-derive (data-model/FE-arch, in BE/FE-arch); geolocation degrade-if-denied (design).

**Coordination flag:** the loading-states track (ADR-0105, shipping in parallel on `main`) also touches the design language / colour budget (ADR-0028) — the Map design session should keep the pin/route palette consistent with the loading-states colours now on `main`.
