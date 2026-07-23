# 0110 — Maps & Places frontend architecture: the shared search core, the place-usage derivation, per-event zone threading, and the context-aware day select

**Status:** Accepted (frontend module/derivation/state shape for the Maps & Places epic; no feature code — the client-side structure the Phase-1+ implementation builds inside)
**Date:** 2026-07-23
**Refines:** [0106](0106-maps-and-places-epic-scope-and-phasing.md) (answers its two remaining FE-arch open questions — "one shared search core vs. two components" and "the place-usage / filter derivation" — and structures the picker/filters it scoped), [0107](0107-per-place-timezones-and-multi-zone-time.md) (structures the per-event zone threading through `lib/time.ts`/`lib/places.ts` it left open, and **resolves its §7 store-vs-derive sub-question** for the frontend), [0109](0109-map-tab-design.md) (turns its settled surface + reuse audit into a module layout — the design is not re-opened here), [0035](0035-in-app-back-and-return-gesture.md)/[0090](0090-back-is-computed-from-nav-state.md) (generalizes the day-select rule to make the Map a second day-scoped surface) (relates [0048](0048-index-build-data-model-refinements.md)/[0051](0051-place-normalization-and-authority.md) the `Place` registry + resolver this builds on, [0094](0094-one-pluggable-change-applier-registry.md)/[0095](0095-named-constants-for-string-discriminants.md) the sync registries + named-constant convention it reuses, [0038](0038-icons-and-canonical-category.md)/[0028](0028-plan-violet-color-budget-dark-ready.md) the category palette the pin colour reads, [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) the proxy/key/cost boundary it calls into)

## Context

ADR-0106 fixed the epic's scope/phasing, ADR-0107 the time model, ADR-0108 the backend/cost/key shape, and ADR-0109 the surface (list-first tab, pins, geolocation UX, the forms, the picker flow) plus a frontend reuse audit. Everything visual and behavioural is settled. What remains — and all this session decides — is the **client-side code structure** behind that settled surface: where the shared search core lives, where the place-usage index is derived, how ADR-0107's per-event zone threads through the existing time/place libs, and the one contained navigation change the design needs. **Paper only — no feature code.** This is FE-architecture session #3 of ADR-0106's follow-on roadmap.

The read-first set was ADR-0109 (esp. its §12 picker flow, §4/§5 pin derivation, and the reuse audit), the "FE-architecture handoff" section of the session-70 planning note (ADR-0108's hard FE requirements), ADR-0106/0107, `frontend/CLAUDE.md`, and the code the design reuses — `lib/time.ts`, `lib/places.ts`, `lib/index-bookings.ts`, `state/nav-state.tsx`/`state/trip-state.tsx`, and the primitives `ChoiceGrid`/`WhenField`/`DayStrip`/`ListRow`/`Modal`+`useOverlay`. Verified against the current tree, not recalled.

Four things constrain everything below and are **inherited, not re-decided** (ADR-0108 §1/§5, consolidated in the session-70 handoff): the FE never holds the Places/Routes key and calls only our backend proxy under `trips/:tripId/places`; autocomplete is **debounced/pause-gated** (a cost requirement, not polish); the FE **mints + threads the session token** per pick; and a proxy `429`/`RATE_LIMITED` degrades softly. The zone resolver **reads** cached `Place.timezone` and never computes one (ADR-0108 §2). Dedup is server-enforced on `(tripId, googlePlaceId)` (ADR-0108 §3).

## Decision

### 1. One shared search core, two shells — a hook over the proxy, not a second client

ADR-0106's "one shared search core vs. two components" (simplified by ADR-0108 to "one vs. two clients of our proxy") resolves to **one core, two shells**, matching CLAUDE.md rule 8 and the design's assumption (ADR-0109 §12). The core is a **hook**, not a component, so both shells reuse the behaviour without sharing chrome.

**Layering (three pieces, only the primitive is net-new UI):**

- **`lib/api.ts` — extend, don't add a module.** Two proxy calls beside the existing `createPlace`/`updatePlace` (which already own `placesUrl`/`placeUrl`):
  - `searchPlaces(tripId, { input, sessionToken, signal })` → `PlacePrediction[]` — the debounced Autocomplete relay (`GET`/`POST trips/:tripId/places/search`). `signal` lets a superseding keystroke abort the in-flight request.
  - `resolvePlace(tripId, { googlePlaceId, sessionToken, enrichPlaceId? })` → `Place` — the terminating create-or-link/enrich-on-pick call. The **same** session token as the searches (that is what bills in-session autocomplete at $0, ADR-0108 §1). Dedup is server-side; the FE just adopts the returned row.
- **`lib/usePlaceSearch.ts` — the shared core (net-new hook, lib-co-located like `useClock`/`useUnsavedGuard`).** Owns the whole lifecycle so neither shell re-implements it:
  - **Session-token lifecycle in code.** A `sessionToken` ref minted lazily (`crypto.randomUUID()`) on the first keystroke of a pick session, threaded through every `searchPlaces` and the terminating `resolvePlace`, and **retired** on a successful pick **or** on shell close without a pick (abandonment) — the next open mints fresh. This is the FE-minted-token requirement (ADR-0108 §1) made concrete.
  - **Debounce, pause-gated (mandatory, ADR-0108 §1).** A trailing debounce keyed by a new `PLACE_SEARCH_DEBOUNCE_MS` constant (recommend **≈350 ms**; each keystroke resets the timer) plus a `PLACE_SEARCH_MIN_CHARS` floor (≈2) so a one-letter query never fires. This is a **cost** control, not UX polish — it keeps a type-and-abandon session to ~one or two billable calls and a typist under the search-relay rate limit.
  - **`alreadyInTrip` is a client-side derivation, not a proxy field.** The snapshot already ships every `Place`, so the "כבר בטיול" dedup chip (ADR-0109 §12) matches a prediction's `googlePlaceId` against local `places` — free, offline-consistent, no extra round-trip. A prediction that matches links to the existing `placeId` on pick (skips `resolvePlace` entirely — zero Google spend).
  - **Soft 429 handling (ADR-0108 §5).** Surfaces a `rateLimited` state off the existing `ERROR_CODE.RATE_LIMITED` `ApiError` predicate (ADR-0095), rendered as a brief "try again" cue via `ui/feedback/StatusBanner` — never a hard error.
  - **Offline / name-only fallback goes through the existing outbox, not the proxy.** The core exposes a `saveNameOnly(name)` that enqueues `OUTBOX_VERB.CREATE_PLACE` (a coordless "Place-lite", optimistic null timezone) via the path that already exists (`outboxOpToCacheChanges` → `applyChangeToCache`, ADR-0094). The FE adopts the server-resolved coords/zone/rating when the op round-trips. **The proxy search/resolve calls are online-only reads/enrichment and are deliberately *not* outboxed** — they need Google, which offline can't reach; this is the clean boundary (queue = offline-capable writes; proxy = online enrichment).
- **`ui/primitives/PlacePicker.tsx` — the single-select in-form shell (net-new, wired into every place slot: EventForm location, booking location, transport origin/destination, maybe-item).** Every overlay it opens (the prediction sheet, later the zone picker) renders through **`Modal`/`useOverlay`** — never a hand-rolled portal (lint-blocked, ADR-0090/0109 reuse audit). Renders the prediction list (primary name + secondary address), the dedup chip, the session-token cost footer (ADR-0109 §12), and the name-only fallback affordance.
- **Phase-5 research surface — deferred (ADR-0109 "Scope … deferred"), but pre-shaped.** When built, it is a second thin shell over the *same* `usePlaceSearch` (multi-result browse → "＋ אולי"); the core already returns a list + pick action, so the research surface adds only a multi-select presentation. Not designed here.

**Enriching an existing Place-lite (the one non-obvious flow).** When the picker is opened from a field already holding a *coordless* `placeId` (a name-only Place-lite authored offline), a pick passes `enrichPlaceId` so the proxy **updates that row** (adopts `googlePlaceId`/coords/timezone/rating) rather than minting a duplicate — the "auto-enriches on next pick" behaviour ADR-0106 §12 promised. Server dedup still governs the corner case where that `googlePlaceId` already exists on another row.

**Sync path — no new plumbing (ADR-0094).** `place` is already a registered entity type in both the memory (`applyControlChangeToList`) and cache (`CACHE_CHANNELS`) registries. An online `resolvePlace` persists server-side through `ChangeService.mutate`, whose WS `place` `Change` reconciles the list through the existing registry (server-minted id → no duplicate); the `resolvePlace` response is authoritative for the form's immediate use while the echo lands. Nothing new to register.

### 2. The place-usage derivation lives in `lib/place-usage.ts`, built on the existing resolver

The per-`Place` index ADR-0106 §4 named — `{ days[], categories[], isMaybe, isScheduled }` — is derived **once** in a new `lib/place-usage.ts`, and **feeds both the filter chips and the pin colour from that one derivation** (ADR-0109 §2/§3/§4). It **builds on** `lib/places.ts`'s linked/unlinked authority (`eventPlaceId`, `eventRoute`) and does **not** re-derive that branch (ADR-0106 verification pt 4).

**Shape:**

```
interface PlaceUsage {
  placeId: string;
  days: { date: string; prominence: 'edge' | 'ambient' }[]; // §5
  categories: EventCategory[];        // every referencing category (union)
  isMaybe: boolean;                   // referenced by an unconsumed MaybeItem
  isScheduled: boolean;               // referenced by a scheduled event
  coordless: boolean;                 // lat/lng absent → not pinnable/measurable
  pin: { category: EventCategory; commitment: 'hard' | 'soft' | 'idea' }; // §3/§4
}
buildPlaceUsageIndex(events, bookings, maybeItems, places): Map<string, PlaceUsage>
```

**Reference gathering (all through the existing resolver):**

- **Events** contribute via `eventPlaceId(event, booking)`; a **transport** event contributes **both** endpoints (`booking.fromPlaceId` + `booking.toPlaceId`, walked via `eventRoute`'s authority), each dated by the linked event (ADR-0106 verification pt 3). Day(s) come from `event.date` (+ the `endDate` span for a multi-day event).
- **Unlinked bookings** have **no day** (Booking carries no time, ADR-0106 verification pt 2) — their place appears under all/type/maybes but never a day facet.
- **Unconsumed `MaybeItem`s** (`consumed === false`, ADR-0106 verification pt 1) contribute `isMaybe` + their `category`.

**Union semantics + colour-by-most-committed (ratified, ADR-0109 §4).** A place appears under **every** facet it matches. Each reference carries a commitment weight — **hard event > soft event > idea (maybe)** — and the **most-committed reference wins** the pin's `category` *and* its hard/soft grammar. The tiebreak is a single ordered comparison, reused by both the pin and (implicitly) the badge in the list.

**Multi-day edge-vs-ambient (ADR-0109 §5, following 0054/0064).** A multi-day place is present on **every** span day, but each `DayUsage` is tagged `edge` (arrival/departure day → loud pin/row) or `ambient` (strictly-middle day → quiet "your base" row, no amber core). This reuses the shared `isMultiDay`/`isAmbient` predicates in `@waypoint/shared/icons.ts` rather than re-deriving span logic.

**Coordless handling.** `coordless` is set from `lat`/`lng` absence; consumers filter on it — near-me (Phase 4) and map pins (Phase 6) drop coordless places (ADR-0106 verification pt 5), while the list + day/type/maybes facets include them (a hollow dashed listed-only row, ADR-0109 §3).

**Category → pin hue is a `Record` lookup, not a switch (CLAUDE.md / ADR-0109 reuse audit).** A `CATEGORY_PIN_HUE: Record<EventCategory, PinHue> as const satisfies …` in `constants.ts` maps the **9** `EventCategory` values onto the **5-hue** palette (ADR-0038 §2 / ADR-0028 decorative palette): `transport→transit`, `food→food`, `lodging→lodging`, `services→services`, and `sightseeing`/`nature`/`activity`/`shopping`/`other → leisure`. An **uncategorised** place (all references `category = null`) falls back to `leisure`. The five hue tokens (`--pin-food` … `--pin-services`) live in `styles/tokens.css`, theme-aware; teal/amber stay off the fill (affordance/time, ADR-0109 §3). Keeping this a `Record` lets the compiler flag a missing case when `EventCategory` grows.

**Filters reuse the Index primitive; the counting is map-specific and *shaped like* — not generalized from — `index-bookings.ts`.** The genuinely-shared thing (already extracted) is the **`ChoiceGrid` `pills` layout + the covering `SearchOverlay` + the mode-tinted `--idx-accent`** (ADR-0098/0100); the Map reuses those verbatim. The facet counting/matching runs over a **different entity (`Place`) and a different enum (`EventCategory`) plus a `maybes` facet**, so it is new logic in `lib/place-usage.ts`, written in the same idiom as `index-bookings.ts` (a `Record<EventCategory, number>` count, a `matches` predicate). We **do not** generalize `index-bookings.ts`'s booking-specific helpers (`countByCategory`/`matchesCategory`/`visibleRows`): they key on `Booking`/`BookingType` and a single-select model, and forcing a shared generic over two different entities + two different selection models would be a substantial refactor for little gain — exactly the "ask before taking on the larger change" case in CLAUDE.md rule 8. Flagged here rather than silently forked. **Selection model:** *type* is single-select (all / one category), mirroring the Index exactly; *maybes* is an **independent boolean toggle** chip (a small one-facet extension, not a new multi-select primitive). Day scope is **not** a filter chip — it lives on the header strip + the all-days chip (Decision 4).

### 3. Per-event zone threads through `lib/places.ts` + `lib/time.ts`; `Event.displayTimezone` is a manual override, derived by default

ADR-0107's model is threaded, **not reinvented** — `zonedIso`/`formatTime`/`tzParts` already take a zone argument (today always `trip.timezone`); the work is resolving the *right* zone and passing it where `trip.timezone` is passed now.

**The sticky display-zone resolver lives in `lib/places.ts`** (where place resolution already lives, ADR-0107 consequence), reading **cached `Place.timezone` only** (never computing — ADR-0108 §2):

```
eventDisplayZones(event, bookings, places, trip, segments): { start: string; end: string }
```

Priority per ADR-0107 §3: **place > itinerary segment > trip primary**. The `{ start, end }` pair carries the **transport asymmetry** — a zone-crossing transport event renders `startsAt` in the origin (`fromPlace`) zone and `endsAt` in the destination (`toPlace`) zone; every other event has `start === end`. A single accessor returning both ends keeps the asymmetric case from special-casing every call site.

**The segment-partition helper is keyed off zone-crossing transport** (ADR-0107 §3), a sibling in `lib/places.ts` (promote to `lib/zones.ts` only if it outgrows the file):

```
partitionZoneSegments(orderedEvents, bookings, places, trip): SegmentZones
```

It walks the itinerary in order; a transport event whose `fromPlace.timezone !== toPlace.timezone` is a **crossing**. Everything before the outbound crossing is the **origin/home zone** (derived from the outbound flight's `fromPlace` — a *segment* concept, never a stored trip field), everything after is the **destination** zone, and so on per crossing. A **placeless** event inherits its segment's zone. This is the input the resolver's "segment" tier reads.

**The `Event.displayTimezone` store-vs-derive sub-question (ADR-0107 §7) resolves to: derive by default, store only as a manual override.** This is the load-bearing call of this decision and it unifies §6 (editable chip) with §7 (placeless stickiness):

- **`displayTimezone = null` → trust the derivation** (place > segment > primary). This is what makes ADR-0107 §3's wanted behaviour work: before the outbound flight exists a pre-departure home event defaults to the trip primary (destination) zone, and **flips to the origin zone once the flight is added** — a *derive* behaviour that a store-at-author-time cache would freeze wrongly.
- **`displayTimezone = <iana>` → the user pinned it via the zone chip (§6); honour it forever.** This is the *only* writer of the field. It gives true stickiness exactly where the "a fixed plan must not appear to move" principle (ADR-0107 §2) demands it — for a zone the user deliberately set — without freezing the un-pinned majority.

So `displayTimezone` is the **override slot**, not a cache of the derived value. Storage stays minimal (most events null), the reorientation behaviour is the default, and the editable chip has a real backing field. **For the data-model session:** the field shape is unchanged from ADR-0107's proposal (nullable `Event.displayTimezone`, mirrored in `@waypoint/shared`) — only its *semantics* are pinned here: "manual override," not "resolved-zone cache." The resolver therefore reads `event.displayTimezone ?? eventDisplayZones(...)`.

**The zone chip is an addition to `WhenField`/`TimeField`, not a new time control** (ADR-0109 reuse audit):

- `variant="day"` gains optional `zone: string` + `onZoneChange?: (tz) => void` → one chip `🕐 HH:MM · <city> ▾` on the time (the caret is a real SVG, not a `▾` glyph — ADR-0109 §8).
- `variant="span"` (transport) carries **two** chips — origin on the start leg, destination on the end leg — composing with the existing `+N` day-crossing badge to render the `23:00 · תל אביב ▾ ← 18:00 +1 · טוקיו ▾` case (ADR-0107 §3/§8).
- The chip opens a minimal `ZonePicker` overlay (net-new, `ui/primitives`, via `Modal`/`useOverlay`) listing the sensible candidates (the place's zone, the current segment zone, the trip primary, plus a search); picking one writes the `displayTimezone` override. Its detail is an implementation call.

**Threading surface (where `trip.timezone` becomes the resolved zone).** Authoring: `EventForm` and `BookingSheet`'s span legs pass the resolved zone into `zonedIso`/`resolveEndIso` instead of `trip.timezone`. Display: `formatTime`/`tzParts` callers in the day view, Index, and Home read the per-event resolved zone. Per ADR-0107, this display/authoring/segment layer runs **alongside Phases 2–3 and independent of the map render** — it is a time-model change, not a map-surface one. The **§8 attach-place-after-placeless-time edge rule** (keep the wall-clock, shift the instant) is an `EventForm` concern, not the resolver's: when `placeId` changes, recompute `startsAt`/`endsAt` via `zonedIso` in the new zone while preserving the `isoToTimeInput` HH:MM — flagged as a form wiring point.

### 4. `setActiveDate` becomes context-aware — the Map joins the Day view as a second day-scoped surface

Today `daySelectTarget` unconditionally lands on the `days` tab (ADR-0035 §4), so tapping a strip day always jumps to the Day view. The Map is genuinely a **second day-scoped surface** (its content is "this day's places"), and the shared header `DayStrip` already renders on every tab via the persistent `AppShell` header — so the only change is to stop forcing the `days` landing (ADR-0109 §1). A **contained generalization of an existing rule**, not a new mechanism.

- **`state/nav-state.tsx`:** add a named `DAY_SCOPED_TABS` set (`'days'`, `'map'`) beside `TAB_PARAM`/`DAY_PARAM`. `daySelectTarget(date, today, currentTab)` gains the current tab: when `currentTab ∈ DAY_SCOPED_TABS` it **preserves that tab** (`?tab=<currentTab>&day=…`, still omitting `?day=` when the date is today so the URL stays clean and Home derives to today); otherwise it routes to `days` exactly as before. So tapping a day *on the Map* focuses that day **in place**, and from Home/Index it still routes to the Day view — the strip's real, already-shipped rule (ADR-0109 §1), now literally true for two surfaces instead of coincidentally one.
- **`state/trip-state.tsx`:** `setActiveDate` already computes `currentTab`; it passes it to `daySelectTarget`. No other call site changes.
- **`resolveBack` is untouched.** The Map is a non-Home tab, so a structural back still resolves `to-home` (rule 2) — the day-scoped generalization is purely about *forward* day selection, never back. This keeps the change off the pure back-decision function (the ADR-0102 precedent: don't add structural cases to `resolveBack`).
- **"All days" is Map-screen-local state, not the global day param** (ADR-0109 §1 — the app tracks exactly one active date, a strip can't express "all"). The Map screen holds an `allDaysScope` boolean defaulting **by mode** (Trip → today, Plan → all); it is not synced and not in `?day=`. Tapping any strip day exits all-days and calls `setActiveDate`; the "🗓️ כל הימים" chip in the scope/sort strip re-enters it. When all-days is active the strip shows only the today-anchor with no filled selection — a small `DayStrip` prop (e.g. `allScope?: boolean` suppressing selection styling) is the one minor extension to that component, kept inside the reuse (extend, not fork).

## Two model touches to coordinate (from ADR-0109), confirmed for the FE

Both are ADR-0109's, restated only to pin the FE shape:

- **`Place.rating` / `Place.userRatingsTotal`** (ADR-0109 §9) — new nullable fields, mirrored in `@waypoint/shared`'s `placeSchema` and `schema.prisma` (non-negotiable rule 3), cached on the row at pick time (they ride the same Place Details response, ADR-0108 §3). Rendered as a `★ 4.6` meta tag (the star glyph carries it; no semantic hue).
- **`PlacePrediction`** — the proxy's autocomplete result crosses the FE/BE boundary, so its shape (`googlePlaceId`, `primaryText`, `secondaryText`) is a `placePredictionSchema` in `@waypoint/shared` (per that package's CLAUDE.md: a value both layers need). `alreadyInTrip` is **not** on it — that is a client-side derivation over the snapshot (Decision 1).
- **Event/MaybeItem `category` as an explicit form field** (ADR-0109 §11) — **no schema change** (`Event.category`/`MaybeItem.category` already exist); the selector is the **same `ChoiceGrid`** the booking type picker uses (compact, horizontally-scrollable for the 9 values, no per-card swatch), `IconPicker` becomes glyph-only in every host (`categoryForIcon` retired as a category source), and a booking-seeded event keeps its read-only derived category. This is presentation wiring, not new structure.

## Consequences

- **The picker is a hook + one primitive, not two components or a second proxy client.** `usePlaceSearch` (session token + debounce + `alreadyInTrip` + offline fallback + soft 429) is the single core; `PlacePicker` is a thin single-select shell and the Phase-5 research surface will be a second thin shell over it. The proxy calls are two functions on the existing `lib/api.ts`; the online enrichment path reuses the existing `place` sync registry (ADR-0094) with nothing new to register.
- **A hard boundary is drawn: outbox = offline-capable writes; proxy = online enrichment.** Name-only Place-lite creation queues; search/resolve never do (they need Google). This keeps CLAUDE.md rule 5 intact — the whole list + filter layer is pure derivation over the snapshot and works offline; only live search/resolve need network.
- **One derivation (`lib/place-usage.ts`) feeds both the filter chips and the pin colour**, built on the existing linked/unlinked resolver, so filter-by-type and colour-by-type stay one vocabulary and the place-usage index isn't computed twice. The category→hue and category→glyph lookups are exhaustive `Record`s, so a new `EventCategory` is a compile error until every map surface handles it.
- **The zone model threads through the two libs it already belongs in** (`lib/places.ts` resolver + segment helper, `lib/time.ts` zone argument) with no new timezone machinery — `zonedIso`'s DST fixed-point is untouched. The **derive-by-default, store-on-override** resolution of `Event.displayTimezone` gives the design's editable chip a real backing field, keeps storage minimal, preserves the wanted "add the flight → times reorient" behaviour, and still makes a *user-pinned* zone truly sticky.
- **The nav change is one generalized rule + one screen-local boolean.** `resolveBack` stays a pure function of structural state; the Map focuses days in place like the Day view; "all days" is honestly modelled as map-local scope rather than faked into the single-source day param.
- **No scope creep into the deferred phases.** Phase-5 research detail and the full Phase-6 rendered map remain deferred (ADR-0109); this ADR only ensures the shared core and the derivation extend into them without a rewrite.

## Alternatives considered

- **Two independent search components (one per shell).** Rejected — the exact parallel-copy trap CLAUDE.md rule 8 and ADRs 0078/0079/0094/0095 exist to undo; the session-token lifecycle, debounce, dedup match, and offline fallback would drift across two copies. One hook, two shells.
- **A dedicated `google-places.ts` FE client module.** Rejected — `lib/api.ts` already owns `placesUrl`/`createPlace`/`updatePlace`; two more proxy functions extend it. A new module would split place I/O across two files for no gain.
- **Outbox the proxy search/resolve like every other write.** Rejected — they require Google, which offline can't reach, and they must dedup-before-spend at the DB (ADR-0108 §3); queuing them optimistically would either fabricate coords/zone the FE can't produce or duplicate the server's dedup. The clean split is queue-for-offline-writes, proxy-for-online-enrichment.
- **Store `Event.displayTimezone` at author time for every placeless event (ADR-0107 §7's literal "store" reading).** Rejected — it freezes a pre-departure home event in the trip-primary zone so it never flips to the origin zone when the outbound flight is later added, contradicting ADR-0107 §3's explicitly-wanted reorientation. Derive-by-default preserves that; storing only the user's manual override preserves stickiness where it's actually asked for.
- **Re-derive the zone on every render with no stored override at all.** Rejected — then a user's deliberate zone correction (§6) has nowhere to live and would be overwritten the next time the itinerary re-partitions, making a *fixed* plan appear to move — the precise failure ADR-0107 §2 forbids.
- **Generalize `index-bookings.ts`'s counting helpers into a shared entity-agnostic filter core.** Rejected for now — they key on `Booking`/`BookingType` and a single-select model; the Map filters `Place`/`EventCategory` with an extra `maybes` toggle. A shared generic over two entities + two selection models is a substantial refactor with little payoff; the reused thing is the `ChoiceGrid`/`SearchOverlay`/accent *primitive*, and the map's counting is new logic in the same idiom. Revisit only if a third such filter appears.
- **A `?scope=all` URL param for all-days (parallel to `?day=`).** Rejected — it re-introduces a second source of truth for "which day(s)" that ADR-0035's single-source day param exists to prevent, and only the Map has the concept. Screen-local state keeps the global model at exactly one active date.
- **Add a `map` case to `resolveBack` so back from a focused day returns to all-days.** Rejected — `resolveBack` must stay a pure function of *structural* nav state (ADR-0090/0102); the day/all-days distinction is view state, resolved in the screen, not a back layer.
- **A second, map-specific day picker instead of generalizing `setActiveDate`.** Rejected (ADR-0109 §1 alternatives) — two day-number rows on one screen is redundant, and it ignores that the Map is a real day-scoped surface the shared strip should drive.
