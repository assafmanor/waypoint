# 0108 — Map tab design: the list-first surface, the Waypoint pin, geolocation UX, and the resolved open questions

**Status:** Accepted (design)
**Date:** 2026-07-23
**Implements the design half of** [0106](0106-maps-and-places-epic-scope-and-phasing.md) (this is session #1 of that ADR's follow-on roadmap — "Design — the Map surface"; scope/phasing there is unchanged, this ADR only fills in the visual/interaction shape and ratifies its recommended-but-open calls) and [0107](0107-per-place-timezones-and-multi-zone-time.md) (§6's editable zone chip is designed here).
**Refines:** [0028](0028-plan-violet-color-budget-dark-ready.md) (spends the map's colour inside the budget — teal = place, amber = time-anchor — and **trims** the "5 pastel category pins" the design-language previously sanctioned), [0087](0087-app-logo-waypoint-marker.md) (the Waypoint marker becomes the literal pin), [0038](0038-icons-and-canonical-category.md) (category is carried by the pin glyph, not a pin fill), [0098](0098-index-landing-and-dedicated-screens.md)/[0100](0100-index-bookings-header-search-redesign.md) (the filter chip/search/mode-accent grammar the tab reuses rather than forking), [0054](0054-ambient-span-events-off-the-day-schedule.md)/[0064](0064-day-transition-entries-and-home-band-trim.md) (the ambient-vs-edge precedent the multi-day-place rule follows), [0006](0006-no-live-location-v1.md) (own-device geolocation IN, member sharing OUT), [0105](0105-loading-states-design.md) (keeps the map palette consistent with the loading-states colours — "amber is an accent, not a ground")

Mockup: [`mockups/map-tab-v1.html`](../../mockups/map-tab-v1.html) — the list-first tab in both modes, all four location states (normal / near-me granted / denied / offline), the pin-anatomy legend, a Phase-6 rendered-map preview, and the ADR-0107 zone chip.

## Context

ADR-0106 fixed the Maps & Places scope: one mode-re-emphasized Map tab, picker-first, **list-of-pins before an embedded map**, filters that are pure client-side derivation. It deliberately left the visual and interaction design to a follow-on session (this one) and named the concrete open design questions to resolve here. Nothing about scope, phasing, or the embedded-map direction is reopened — this ADR is the design layer on top of that frame.

Two coordination facts shaped the palette: the loading-states track (ADR-0105) shipped to `main` in parallel and re-affirmed "amber is a time **accent**, never a ground"; and ADR-0028's colour budget (teal = location, amber = time/commitment, violet = plan) is non-negotiable (CLAUDE.md rule 4). The pin design had to land inside both.

## Decision

### 1. The tab is a list, re-emphasized by mode; the day filter is the mode pivot

The Phase-3 surface is: **mode chrome → day-strip → filter chip row → near-me/sort strip → the pinned-place list**. Each list row is a place with its usage meta (when/rating/"on the shelf"), a distance chip (Phase 4, when near-me is on), and **deep-link actions** (👁 open in Maps, 🧭 navigate) — we never rebuild navigation (ADR-0106 Decision 3/6).

- **Trip mode pre-selects _today_; Plan mode pre-selects _all days_.** This is the single mode pivot (ADR-0106 Decision 1). The same day-strip gesture widens or narrows either default; the strip carries an explicit "כל הימים" pill so "all" is a first-class selection, not an absence of one.
- The chrome follows the mode identity (indigo/dark Trip · light drafting-table Plan) exactly as Home/Day/Index do — mode is readable from the chrome before any content (design-language mode-identity table).

### 2. The filter row reuses the Index chip/search/mode-accent grammar — one primitive, not a second

The filter row **is** the `index-bookings-compact-v2` grammar (ADR-0098/0100), extended, not re-copied (CLAUDE.md rule 8; the FE-arch session confirms the extraction of `ChoiceGrid`/`lib/index-bookings.ts` helpers):

- Scrollable **label+count pills**, a **mask-image edge-fade** instead of a hard-clipped chip, a **covering search overlay** (the search icon covers the chip strip in place), and the **mode-tinted selected accent** (`--idx-accent`: neutral ink in Trip, `--plan` violet in Plan — the exact per-mode selection rule ADR-0100 §5 / ADR-0028 already establish; not a new colour rule).
- **Facets: day · type · maybes.** _Day_ is the day-strip above (the pivot). _Type_ = `category` (ADR-0038) — the chips carry the category glyph + count, so filter-by-type and colour-by-type read as one vocabulary. _Maybes_ = places referenced by an **unconsumed** `MaybeItem` (`consumed === false`, per ADR-0106's schema verification) — a dashed pill, matching the soft grammar. "By area" stays deferred to the embedded-map phase (pan/zoom is the honest area filter).
- All three facets are **pure client-side derivation** over the trip snapshot (offline-safe), reading the place-usage index `{ days[], categories[], isMaybe, isScheduled }`. Only live search (Plan-mode research, Phase 5) and the Phase-6 rendered map need network.
- In **Plan mode** the search icon opens Google place research (Phase 5); in **Trip mode** it filters the existing list. One control, two presentations — mirroring the "one shared search core" lean (ADR-0106 open questions, for the FE-arch session).

### 3. The pin is the Waypoint marker (ADR-0087): teal body, glyph = category, amber core = commitment

The pin is the ADR-0087 Waypoint marker rendered as a custom `AdvancedMarkerElement` (Phase 6) and as the row's leading badge (Phase 3). It obeys **"quiet neutral base, loud semantic pins"** (ADR-0106 Decision C):

- **Base = a desaturated cool-paper canvas** (the `--screen` neutral the whole app sits on, faint grid, POI clutter dropped), **never a teal flood.** This keeps ADR-0028's budget intact and matches the ADR-0105 loading-states ground now on `main`.
- **Pin body = teal** (location — the marker _is_ a place). **Category is the glyph inside** (content, ADR-0038: 🍜 / 🚉 / 🏨 / ⛩), **not a pin fill.**
- **The amber core encodes commitment** — this is where **colour-by-most-committed** (ADR-0106 Decision 4) lives, expressed as core state rather than a separate hue:
  - **hard scheduled** → solid teal body + **lit amber core** (a soft static glow — deliberately **not** the reserved live pulse) + a 🔒 micro-cue (hard grammar, ADR-0011).
  - **soft scheduled** → solid teal body + **dim amber core**.
  - **maybe-only idea** (unscheduled) → **dashed/hollow body, no core** (soft grammar — dashed border + hatch, ADR-0028 hard/soft).
  - **ambient base** (mid-stay lodging, see §5) → **desaturated teal, no core** (quiet, not a loud anchor).
  - **coordless "Place-lite"** (no `lat`/`lng` yet) → a hollow dashed ring, listed but not navigable/measurable until the picker enriches it (ADR-0106 verification point 5).
- The blue "me" dot on the eventual rendered map is an **OS-map convention, deliberately outside** the amber/teal/violet budget (design-language "Map" entry, unchanged).

**This supersedes** the design-language's earlier "teardrop pins in 5 pastel category colours" and removes "map pin categories" from the sanctioned decorative palette: teal stays a _signal_, not one of five decorative fills, and a map drowned in five hues would dilute exactly the location-signal teal is reserved for. `design-language.md` is updated in this change.

### 4. Multi-facet place → union semantics, coloured by most-committed reference (ratified)

ADR-0106 Decision 4 recommended this; it is **ratified here.** A place referenced by more than one entity shows under **every** filter facet it matches (a place that is both a scheduled event and an unconsumed maybe appears under both its type filter **and** the maybes filter), and its pin/row takes the **most-committed** state on the ladder in §3 (`hard > soft > idea`; ambient/base is a presentational overlay from §5, not a rung). In the mockup, `% Arabica` is both `food` and a `maybe` and renders once per matching facet with its idea-state pin.

### 5. Multi-day place under the day filter → edge-loud, middle-ambient (follows 0054/0064)

The open question ("surface on every span day vs. edge days only") resolves to **neither extreme, following the 0054/0064 ambient-vs-edge precedent exactly:**

- On its **arrival / departure (edge) days**, a multi-day lodging place appears as a **normal loud pin/row** — the check-in / check-out edge, a real anchored moment (the direct analogue of ADR-0064's per-day transition entry on edge days).
- On its **strictly-middle days**, it appears **only as a quiet ambient "your base" row** (desaturated pin, no amber core, hatched-paper row), **never a loud time-anchored pin** — the analogue of ADR-0064's backdrop-strip-on-middle-nights (the middle days show context, not a commitment you "go to").

So a multi-day place _is_ present on every span day (you can always find your hotel), but its **prominence is edge-vs-ambient**, not uniform — which is the honest reading of the day filter ("what's anchored to _this_ day"). This keeps the map consistent with how the day view and glance already treat the same booking.

### 6. Geolocation is just-in-time and never blocks reads (ADR-0006 own-device)

- **Never asked on tab open.** The tab renders fully — list, filters, deep-links — with **zero** location. The permission is requested **only on intent**: tapping the "קרוב עכשיו" (near me now) chip, behind a **one-line pre-prompt** that states why and that the location stays on-device and is not shared with the group (reinforcing ADR-0006's own-device-IN / member-sharing-OUT line).
- **Granted** → distance chips appear on coord-bearing rows and the list gains a "לפי קרבה" sort (§7).
- **Denied / unavailable** → the list **stays on its default sort** (today/relevance), distance chips are simply absent, a quiet dismissable banner explains ("מיקום כבוי · הרשימה ממוינת לפי לו״ז") and offers a re-enable affordance that deep-links to the OS location settings when the permission is hard-denied. Nothing is dead-ended; near-me is strictly additive.

### 7. "Near me now" without a rendered map (Phase 4 ships before Phase 6)

Because Phase 4 (near-me) lands before Phase 6 (the rendered map), "near me now" is presented **without any spatial "me" dot**:

- It is a **re-sort of the list plus per-row distance chips** ("90 מ׳", "1.1 ק״מ", teal — location), under a "לפי קרבה אליך" group header. There is no map to place a dot on, so proximity is expressed numerically and by order.
- **Only coord-bearing places participate**; coordless "Place-lite" rows sink to the end with no distance (they can't be measured until the picker enriches them).
- **Offline** degrades this honestly: the list desaturates, the near-me chip is hidden (you can't re-locate offline), and any distance reads "מרחק לא זמין" rather than a stale number, under the "last saved locations" banner (the offline grammar the design-language already prescribes for the map).
- When Phase 6 lands, the **same sort** simply gains the spatial "me" dot on the rendered map; the list treatment is unchanged, so Phase 4 is not throwaway.

### 8. ADR-0107's editable timezone chip on the time input

The WhenField time input shows the inferred zone as a **one-tap-correctable chip** — `🕐 19:30 · טוקיו ▾` — tapping it opens a zone picker (ADR-0107 §6: "sensibly defaulted, trivially fixable," never silently authoritative on the boundary cases). **Transport shows two chips** — the origin zone on the start time, the destination zone on the end time, with the cross-zone `+1` day tag (`23:00 · תל אביב ▾ ← 18:00 +1 · טוקיו ▾`, ADR-0107 §3/§8). The chevron is a real SVG caret, not a raw `▾` glyph (design-language "emoji are content, icons are UI"). This is designed here because the picker (Phase 1) is where zones get resolved and the authoring surface is where the chip lives, riding alongside Phases 2–3 (ADR-0107's sequencing).

## Consequences

- **Design-language is updated in this change** (CLAUDE.md founding principle): the "Map" component entry and the decorative-palette sentence now describe the Waypoint pin (teal body + glyph + amber core) and drop the "5 pastel category colours" pin, superseding the retrofitted `trip-dashboard-v2.html` map sketch. The mockup catalog gains this file's entry.
- **The three ADR-0106 open design questions are closed:** geolocation UX (§6–7), multi-facet union + colour-by-most-committed (§4), and the Index-grammar reuse (§2). The one data-model-section open question (multi-day place under the day filter) is closed in §5. ADR-0106's "Open questions" are annotated to point here.
- **No backend, `@waypoint/shared`, or data-model change from this ADR** — it is presentation + local view/interaction state, the same posture as ADR-0098/0100. The place-usage derivation, the shared-search-core call, and how ADR-0107's per-event zone threads through `lib/time.ts`/`lib/places.ts` are the **FE-arch session's** to structure (ADR-0106 roadmap #3); this ADR fixes _what it looks like and how it behaves_, not the module layout.
- **Cost discipline is preserved by design** (ADR-0106 Decision 5): the entire list + filter + near-me-sort layer is a pure derivation over the snapshot; the only paid Google operations remain new searches (Phase 5) and rendered tiles (Phase 6).
- **The pin scales straight into Phase 6:** the same teal-body/glyph/amber-core marker is the `AdvancedMarkerElement` HTML on the rendered map (ADR-0106 Decision B), so the list badge and the map pin are one design, not two.

## Alternatives considered

- **Keep the five pastel category pin fills** (the design-language's prior sanction + the `trip-dashboard-v2.html` sketch). Rejected: five decorative hues on the pins fight "quiet base, loud pins," dilute teal as the location signal (ADR-0028), and duplicate a category signal the glyph already carries (ADR-0038). Category → glyph, commitment → amber core, is the coherent single-budget reading the task and ADR-0106 Decision C ask for.
- **A category colour on the pin body plus the amber core.** Rejected for the same budget reason — it re-introduces a second colour meaning-system on the one element ADR-0087 deliberately built from teal+amber only.
- **Ask for geolocation on tab open** (so distances are ready immediately). Rejected: a cold permission prompt with no stated reason is the classic dark-pattern and reads as the app grabbing location; ADR-0006's own-device posture and basic UX both call for just-in-time, reason-first prompting. Reads never depend on it.
- **Surface a multi-day place on edge days only** (drop it from middle days entirely). Rejected: you always want to be able to find your hotel on the map mid-stay; the ambient treatment shows it as context without pretending it's a day-anchored commitment — matching how the day view already handles the same span (ADR-0054/0064).
- **Surface a multi-day place identically on every span day** (a loud pin every day). Rejected: it mis-reads the day filter (a mid-stay hotel is not a thing anchored to _that_ day) and re-introduces exactly the "counted like a block" error ADR-0054 fixed for the glance.
- **A spatial "me" dot mini-map for near-me in Phase 4** (bring a slice of Phase 6 forward). Rejected: it would pull the most expensive, least-offline-friendly piece (rendered tiles) into the phase specifically scoped to avoid it; the list re-sort + distance chips answer "what's near me" completely without a render, and the sort survives unchanged into Phase 6.
- **A second, map-specific filter component.** Rejected outright (CLAUDE.md rule 8): the Index already ships the chip/search/mode-accent primitive; a parallel copy is the exact trap ADRs 0078/0079/0094/0095 exist to undo.
