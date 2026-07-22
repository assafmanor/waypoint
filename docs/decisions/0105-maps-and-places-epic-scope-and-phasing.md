# 0105 — Maps & Places epic: one mode-re-emphasized tab, picker-first, list-before-map, and the scope boundary

**Status:** Accepted (scope + phasing). Design & front-end/back-end architecture deliberately deferred to the follow-on sessions — this ADR is the durable _frame_ the epic grows inside, not its final shape.
**Date:** 2026-07-22
**Refines:** [0004](0004-integrations-are-pipes.md) (Map is one of the _surfaces_ a pipe feeds, and the exception to "no integration gets a screen" — the map is a first-class pillar, not an integration island), [0006](0006-no-live-location-v1.md) (own-device location IN, member sharing OUT), [0038](0038-icons-and-canonical-category.md) (pin colour derives from the referencing event's `category`), [0045](0045-trip-home-real-data-only.md) (navigate-to-next was deferred _to this work_; its fourth Home tile returns here), [0048](0048-index-build-data-model-refinements.md) (the `Place` registry + "cache Google enrichment on the row" this builds on), [0051](0051-place-normalization-and-authority.md) (the picker re-fixes the EventForm place-authoring hole this ADR left open; place authority)

## Context

The **Map** is the last of the four core tabs still unbuilt — `App.tsx` renders `<Placeholder>` for it in both modes ("designed later", `T-002`). Home, Day-by-day, and Index are shipped. So Map is simultaneously the largest untouched surface _and_ a dead slot in primary navigation (UI/UX review **U-06**: a dead placeholder in a primary nav slot, with no live answer to "where do we go / when do we leave").

The early record sketched this tab — vision pillar 3 ("Map as a primary surface: everything pinned, what's near me right now"), the feature catalog ("Map with pinned events + near me now", **Should**, v1), and the backlog's "Map tab" item (Places search, pins, results → "+ maybe"). But that thinking predates the data model we now have, and this session revisited it.

Crucially, the data layer for the map **already shipped, ahead of time**, when the Index was built:

- A real `Place` entity exists ([0048](0048-index-build-data-model-refinements.md)): trip-scoped, flowing through the normal sync/offline/undo path.
- **Every** location in the app is already a `Place` FK ([0051](0051-place-normalization-and-authority.md)) — event locations, booking locations, transport `fromPlaceId`/`toPlaceId`. "Enumerate every place on this trip" is one query today.
- Transport carries origin + destination; the map-pin / navigate target for a flight derives as the origin.

What is _missing_ is enrichment: there is no Google Places **picker**, so almost every `Place` is "Place-lite" ([0051](0051-place-normalization-and-authority.md)) — `name` only, no `googlePlaceId`/`lat`/`lng` — which means nothing can actually be pinned, measured, or navigated yet. ADR-0051 also _removed_ EventForm's free-text location input rather than build a throwaway, so manual events currently cannot be given a place at all. And the Google Cloud project (OAuth consent, Maps/Places keys, billing) is the standing human blocker gating any real Google surface.

This ADR is a **product-management scope decision**, taken before the design and architecture sessions. It fixes _what's in, what's out, and the order of development_; it deliberately leaves the visual and technical design open.

## Decision

**1. One Map tab, re-emphasized by mode** — like Home and Day-by-day, not two separate features.

- **Plan mode** default: research — search Google for places, pin candidates, feed results to the maybe-shelf; and see every place on the trip.
- **Trip mode** default: **today's places** — the "what now/next" north star applied to the map. This is the pivot between the two modes: Trip mode pre-selects _today_, Plan mode defaults to _all days_; the same day filter widens either one, riding the existing **day-strip** gesture.

**2. The Google Places picker is bundled into this epic as its foundational first task** (not carved into a separate epic, but sequenced first). It is the keystone: it unblocks the map, **re-fixes EventForm place authoring** (the hole [0051](0051-place-normalization-and-authority.md) left open), enriches every `Place` with real coordinates, and lands `googlePlaceId` dedup (which [0051](0051-place-normalization-and-authority.md) explicitly said arrives "with the picker"). It wires into every place field: EventForm, booking-form location, transport from/to, maybe-item.

**3. List-of-pins + Google Maps deep-links first; the embedded rendered map is a designed fast-follow.** The map's first render form is a list of the trip's `Place`s with deep-links out to Google Maps (we don't rebuild navigation). An interactive in-app map with rendered pins is the single most expensive, most API-cost-sensitive, and least offline-friendly piece — it is scoped as a defined later phase the list is built to accommodate, not a rewrite.

**4. Filtering is a first-class part of the tab, and it's free.** Every filter is a **pure client-side derivation over the trip snapshot** (`events` + `bookings` + `maybeItems` + `places` all ship together), so the entire list + filter experience is **offline-safe** — only live search and the eventual rendered map need network. It reads from a new derived **place-usage index**: for each `Place`, the referencing entities gathered into `{ days[], categories[], isMaybe, isScheduled }`.

- **In near-term:** **by day**, **by type** (= `category`; shares the pin-colour facet from [0038](0038-icons-and-canonical-category.md), so filter-by-type and colour-by-type are one derivation), **by maybes** (unscheduled ideas — the bridge to Plan-mode research).
- **Deferred to the embedded-map phase: by area** — the one filter with no data model behind it; pan/zoom on a rendered map _is_ the area filter, so we don't build a shaky derived-locality bucket early.
- **Multi-facet places use union semantics** (recommended, still open — see below): a place referenced by both a scheduled event and a maybe shows under both filters, coloured by its most-committed reference.

**5. Cost discipline is a design constraint, not an afterthought.** The Places API bills real money; the epic is shaped to touch it as little as possible:

- **The `Place` row _is_ the cache** ([0048](0048-index-build-data-model-refinements.md) already decided to store Google enrichment on the row, not re-fetch per reference). Pick once → coords/address (+ later hours/photos) are ours forever, offline, free to re-read.
- **Dedup by `googlePlaceId`** → the same place is never enriched twice in a trip.
- **Session tokens** on autocomplete → billed per-session, not per-keystroke.
- **Deep-links to Google Maps cost nothing** (no API call), and the **list + filter layer costs nothing** (pure derivation).
- So the _only_ paid operations are genuinely-new searches and (fast-follow) map-tile loads. Everything else is served from our own row.

**6. Navigate-to-next lands here.** A Google Maps deep-link (Maps routes from the device's own position, so [0006](0006-no-live-location-v1.md) does not block it) resolving the origin `Place` for transport. It returns as the fourth Home quick-access tile [0045](0045-trip-home-real-data-only.md) held back — the grid returns to four columns — **and** appears on the Map tab.

**7. Scope boundary — explicitly OUT of the near-term epic (recorded so we don't re-litigate):**

- **Member-to-member live GPS sharing** — stays deferred ([0006](0006-no-live-location-v1.md)); needs its own ADR covering consent, on/off control, and battery/PWA constraints when picked up.
- **True offline map tiles** — a PWA limitation the PRD already accepts. The _list_ works offline; a rendered map will not.
- **AI / web enrichment of places** (hours, photos, descriptions) — a vNext pipe ([0004](0004-integrations-are-pipes.md)); we keep `source`/keys separable so it stays unblocked, but it is not built here.
- **Cross-trip `Place` dedup and orphan-`Place` GC** — cheap to leave at this scale ([0051](0051-place-normalization-and-authority.md) accepted both).

## Phasing (development order)

- **Phase 0 — Foundations (gates everything).** Google Cloud project (human): OAuth consent, enable Maps JS + Places API, billing, a referrer/IP-restricted key. Plus the key-handling call (Phase 0 of the BE-arch session — see open questions).
- **Phase 1 — The Places picker (keystone).** `PlacePicker` over Places Autocomplete with session tokens; on select, create-or-link a `Place` enriched with `googlePlaceId` + coords + address, deduped by `googlePlaceId`; wired into all place fields (EventForm authoring restored). Name-only `Place` authoring stays as the offline fallback.
- **Phase 2 — Places as real data on existing surfaces.** Enriched places show properly on booking/event detail with a working "open in Maps" deep-link; every surface that shows a place gets the deep-link. (Value before the tab renders anything.)
- **Phase 3 — Map tab v1 (list form) + filters.** The `Place` registry rendered as a list; the place-usage derivation + the day/type/maybes filters (reusing the Index chip grammar — see open questions); Trip-mode defaults to today, Plan to all; per-place view/navigate deep-links.
- **Phase 4 — Trip-mode live jobs.** Device geolocation permission flow (own-device, [0006](0006-no-live-location-v1.md)) → distance + "near me now" sort (needs no map render — ships independent of Phase 6); navigate-to-next (Home tile + Map).
- **Phase 5 — Plan-mode research.** Search Google Places from within the Map tab (reusing the picker's search core) → pin results → "+ maybe" onto the shelf; closes the vision's pillar-4 "discovery by location and free time."
- **Phase 6 — Embedded map (fast-follow).** A rendered Google map with pins; the list becomes its companion; the "by area" filter arrives as pan/zoom.

## Open questions (deferred to the design / FE-arch / BE-arch sessions)

- **Places API key model** — a restricted client-side key vs. a backend proxy for Places calls. The real cost/exposure lever; the BE-arch session's first call.
- **One shared search core vs. two components** — the in-form picker (single-select, in a form) and the Map-tab research surface (multi-result, browse-y) share the Google call, session tokens, and result→`Place` dedup logic; only the shell differs. **Leaning:** one shared core, two presentations (avoids the parallel-copy trap [0094](0094-one-pluggable-change-applier-registry.md)/CLAUDE.md rule 8 guards against). Final call in the FE-arch session; nothing about scope/phasing depends on it.
- **Geolocation permission UX** — when we ask, and how "near me now" degrades if permission is denied (design session).
- **Multi-facet place semantics** — confirm union semantics + colour-by-most-committed reference (recommended above, not yet ratified).
- **Reuse the Index filter grammar** — the Index bookings screen already ships category filter **chips + search + a mode-tinted selected accent** ([0098](0098-index-landing-and-dedicated-screens.md)/[0100](0100-index-bookings-header-search-redesign.md), helpers in `lib/index-bookings.ts`). The Map filter row should extend that primitive, not grow a second one; the FE-arch session confirms the extraction.

## Consequences

- The Map tab stops being a dead nav slot and answers U-06 the moment Phase 3 renders — before navigate-to-next even lands.
- The picker's value is front-loaded: Phase 1 alone re-fixes the EventForm place-authoring regression and enriches the whole trip's places, independent of the tab.
- The `Place` registry ([0048](0048-index-build-data-model-refinements.md)/[0051](0051-place-normalization-and-authority.md)) is validated as the right early investment — the map is a read over data we already hold, and enrichment has a home to cache into.
- The entire list + filter layer is offline-safe, keeping CLAUDE.md rule 5 intact for everything except the genuinely-online search and rendered map.
- Cost is bounded by design: paid Google operations are limited to new searches and (Phase 6) tiles; everything else reads the cached row.
- Follow-on sessions have a stable frame: this ADR is referenced by the design, FE-arch, and BE-arch sessions rather than each re-deciding scope.

## Alternatives considered

- **Picker as its own separate epic, ahead of the Map epic.** Considered (it _is_ independently valuable). Rejected in favour of bundling it in as the first task of one coherent Maps & Places epic — the seams between picker, place-data-on-surfaces, and the map are thin, and one epic keeps them from drifting.
- **Embedded interactive map first ("map as a primary surface" taken literally).** Rejected: the most expensive, least offline-friendly piece, and it needs coordinates that mostly don't exist until the picker runs. List-first delivers the product answer sooner and cheaper; the map slots in beside it.
- **Two separate Map features, one per mode.** Rejected: one re-emphasized tab is consistent with Home/Day-by-day and lets the day filter be the single mode pivot, instead of two surfaces to build and reconcile.
- **A derived-locality "by area" filter now.** Rejected: no data model behind "area", low value on a single-region trip, and pan/zoom on the fast-follow map is the honest version of it.
- **Map-lite before the picker (pin only the places that already have coords).** Rejected: almost every `Place` is coordless today, so there'd be little to show; the picker has to come first for the map to be worth rendering.
- **Member GPS sharing folded in ("where is everyone?").** Rejected: out of scope by [0006](0006-no-live-location-v1.md); a privacy/consent decision that earns its own ADR, not a rider on this one.
