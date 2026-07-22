# 2026-07-22 · Session 67 — Maps & Places epic: PM scoping

**Type:** Product-management session (no code). Sets the scope frame and phasing for the Maps & Places work; design, FE-arch, and BE-arch are explicit follow-ons.
**Output:** [ADR-0105](../decisions/0105-maps-and-places-epic-scope-and-phasing.md) + backlog rework + this note.

## Why now

The Map is the last unbuilt core tab — a dead `<Placeholder>` in a primary nav slot (UI/UX review U-06). The early record (vision pillar 3, feature-catalog "Should", the backlog "Map tab" item) predates the current data model, so we re-scoped from where we actually stand rather than inheriting the old sketch.

## Where we stood (the read-in)

- **Data layer already shipped, ahead of the feature.** The `Place` entity (ADR-0048) + full normalization (ADR-0051) mean every location is already a `Place` FK and "every place on this trip" is one query. But almost every `Place` is "Place-lite" (name only, no `googlePlaceId`/coords) because there is no picker yet — so nothing can be pinned/measured/navigated.
- **Two standing holes the picker fixes:** EventForm lost its place-authoring input (ADR-0051 removed it rather than build a throwaway), and every place lacks coordinates.
- **Standing blocker:** the Google Cloud project (OAuth consent, Maps/Places keys, billing) — the human task gating any real Google surface.
- **Already-decided scope not to re-litigate:** own-device location IN / member GPS sharing OUT (ADR-0006); navigate-to-next deferred _to this work_ (ADR-0045); integrations are pipes but Map is a first-class _surface_ (ADR-0004); we deep-link to Google Maps, we don't rebuild nav; pin colour derives from `category` (ADR-0038).

## Decisions taken (→ ADR-0105)

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

Checked the place-usage derivation against `schema.prisma` + `packages/shared` before treating it as real (captured as ADR-0105's "Data-model verification" section). Confirmed: the snapshot ships `places`/`maybeItems`/`events`/`bookings` together (offline-safe holds), and `Place` is multiply-referenced (union semantics correct). Five refinements banked into the ADR: `isMaybe` keys on `MaybeItem.consumed`; a booking's day comes only from its linked event (unlinked booking → no day); transport contributes both from/to pins; event place resolution is conditional (reuse `lib/places.ts` + shared `bookingEventFields`, don't re-derive); coordless "Place-lite" rows are list-able but not pin-able (confirms Phase 3 can partly run before the picker). One open design Q surfaced: multi-day place under the day filter — every span day vs. edge days (follow 0054/0064's ambient-vs-edge precedent).

## Left open for the follow-on sessions

- **BE-arch:** Places API key model — restricted client key vs. backend proxy (the cost/exposure lever).
- **FE-arch:** one shared search core vs. two components (leaning shared, two presentations); reuse the Index chip/search/mode-accent grammar (ADR-0098/0100, `lib/index-bookings.ts`) for the Map filter row rather than a second copy.
- **Design:** geolocation permission UX + degrade-if-denied.
- **Product (minor):** ratify union semantics + colour-by-most-committed for multi-facet places.

## Next

Design session on the Map surface, then FE + BE architecture sessions, then implementation starting at Phase 1 (the picker) once Google Cloud (Phase 0, human) is done.
