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

The Phase-3 surface is: **mode chrome → day-strip → filter chip row → scope/sort strip → the pinned-place list** — we never rebuild navigation (ADR-0106 Decision 3/6).

- **Trip mode pre-selects _today_; Plan mode pre-selects _all days_.** This is the single mode pivot (ADR-0106 Decision 1).
- The chrome follows the mode identity (indigo/dark Trip · light drafting-table Plan) exactly as Home/Day/Index do — mode is readable from the chrome before any content (design-language mode-identity table).
- **Row anatomy — every element earns its place** (no decorative icons/labels): a leading **category badge** (§3); the place **name** + a 🔒 for a hard commitment; a **meta line** that says _what happens here_ in plain terms — **`<time> · <what>`** (e.g. "18:40 · רכבת לקיוטו"), never a bare transition word like "יציאה" out of context — plus the cached **rating** (§9) and an "על המדף" tag for a shelf idea; a **distance chip** (near-me on, §7); and **one labelled trailing action, "נווט"** (directions — the on-the-ground verb; teal = location). **Viewing the place is the row tap** (opens the place detail / Google Maps place), so there is no second "view" control — the earlier eye-icon (view) + compass-icon (navigate) pair is dropped as two unlabelled, easily-confused glyphs. A coordless "Place-lite" row swaps "נווט" for "＋ מיקום" (opens the picker).

**Day scope reuses the _existing_ shared header day strip (`ui/domain/DayStrip`), reconciled — not a bespoke map strip.** The earlier draft of this ADR invented a map-only strip with a "כל הימים" pill; on review of the shipped component that was wrong on both visual and behaviour, and the reconciliation is cleaner:

- **The strip's real, already-shipped rule** is "focus this day, and show it on a day-scoped surface — update _in place_ if you're already on one, otherwise route to the canonical day surface (the Day view)." On the Day view, tapping a day updates the view in place (no navigation); from Home/Index (not day-scoped) it routes to the Day view. It only _looks_ like "the strip always opens the Day view" because the Day view is currently the only day-scoped surface.
- **The Map is simply a second day-scoped surface.** So tapping a strip day **focuses that day on the map in place** — exactly what the Day view already does — and from Home/Index the strip still routes to the Day view, unchanged. Nothing is special-cased for the map; it _joins_ the Day view's behaviour. The strip keeps its real visual verbatim (header chrome; weekday-letter over mono day-number; amber-anchors _today_ + amber/neutral/violet selection in Trip; violet selection + dashed red-number empty-day markers in Plan; **no "all days" cell**).
- **"All days" is a map-local scope**, not a strip state, because the global model tracks exactly **one** active date (a strip can't express "all"). It is a single chip in the map's scope/sort strip ("🗓️ כל הימים", carrying the same `--idx-accent`); tapping a strip day narrows back to that day. Trip defaults to the active date (today); Plan defaults to all. When "all" is active the strip shows only the today-anchor, no filled selection.
- **Implementation note (for the FE-arch session, stated not hand-waved):** today `setActiveDate` _unconditionally_ lands on the `days` tab (ADR-0035 §4). The one required change is to make that context-aware — "if already on a day-scoped tab (Day view **or** Map), set the date and stay; otherwise route to the Day view." A small, contained generalization of an existing rule, not a new mechanism.

### 2. The filter row reuses the Index chip/search/mode-accent grammar — one primitive, not a second

The filter row **is** the `index-bookings-compact-v2` grammar (ADR-0098/0100), extended, not re-copied (CLAUDE.md rule 8; the FE-arch session confirms the extraction of `ChoiceGrid`/`lib/index-bookings.ts` helpers):

- Scrollable **label+count pills**, a **mask-image edge-fade** instead of a hard-clipped chip, a **covering search overlay** (the search icon covers the chip strip in place), and the **mode-tinted selected accent** (`--idx-accent`: neutral ink in Trip, `--plan` violet in Plan — the exact per-mode selection rule ADR-0100 §5 / ADR-0028 already establish; not a new colour rule).
- **Chip facets: type · maybes** (day scope lives on the header strip + the all-days chip, §1 — not a chip). _Type_ = `category` (ADR-0038) — the chips carry the category glyph + count, so filter-by-type and colour-by-type read as one vocabulary. _Maybes_ = places referenced by an **unconsumed** `MaybeItem` (`consumed === false`, per ADR-0106's schema verification) — a dashed pill, matching the soft grammar. "By area" stays deferred to the embedded-map phase (pan/zoom is the honest area filter).
- Every facet is **pure client-side derivation** over the trip snapshot (offline-safe), reading the place-usage index `{ days[], categories[], isMaybe, isScheduled }`. Only live search (Plan-mode research, Phase 5) and the Phase-6 rendered map need network.
- In **Plan mode** the search icon opens Google place research (Phase 5); in **Trip mode** it filters the existing list. One control, two presentations — mirroring the "one shared search core" lean (ADR-0106 open questions, for the FE-arch session).

### 3. The pin is the Waypoint marker (ADR-0087): teal body, glyph = category, amber core = commitment

The pin obeys **"quiet neutral base, loud semantic pins"** (ADR-0106 Decision C) — but the loud part is **the category colour**, restoring the earlier agreement (ADR-0038 §2 / ADR-0028 decorative palette), not the teal-Waypoint pin an earlier draft of this ADR proposed (see the revision note below).

- **Base = a desaturated cool-paper canvas** (the `--screen` neutral the whole app sits on, faint grid, POI clutter dropped), **never flooded with colour.** Keeps ADR-0028's budget intact and matches the ADR-0105 loading-states ground now on `main`.
- **Pin fill = the category colour** — the **5-hue pastel palette** ADR-0038 §2 already defines (`food` / `lodging` / `transit` / `leisure` / `services`, with `sightseeing`/`nature`/`activity`/`shopping` folding into `leisure`, `other`→`leisure`), which ADR-0028 explicitly sanctions as a decorative palette "**never amber or teal**." An **uncategorised** place (all its references have `category = null`) falls back to the neutral `leisure` hue.
- **Category comes from the referencing entity, and events carry it independently of bookings** (ADR-0038): `Event.category` / `MaybeItem.category` are first-class fields, so a **non-booking manual event still colours its pin**; a booked event resolves via `Booking.type → category`. When a place is referenced by more than one category, the pin takes the **most-committed reference's** category (same tiebreak as §4).
- **Commitment is the hard/soft _grammar_, not a colour** (ADR-0011/0028): **hard** → solid fill + a 🔒 micro-cue; **soft scheduled** → solid fill; **maybe-only idea** → dashed/lightened (soft grammar); **ambient base** (mid-stay lodging, §5) → muted/desaturated; **coordless "Place-lite"** → a hollow dashed ring (listed, not navigable until the picker enriches it, ADR-0106 verification point 5).
- **Two form factors, one colour system:** in the **list** the pin is a **regular rounded category badge** (a map teardrop-to-the-side reads wrong in a list); on the **embedded map** it is a **category-coloured teardrop whose tip points straight down** onto the location.
- **Amber and teal keep their budget roles, off the pin fill:** **teal** = location _affordances_ (the near-me chip, distance chips, the "נווט" button); **amber** = time — the route **ETA** ("when do we leave", ADR-0106-D) and a single **amber ring on the next committed stop** on the rendered map (one time-anchor cue, not on every pin). The blue "me" dot stays an OS-map convention outside the budget.

**Revision note (supersedes this ADR's own first draft):** the first draft made the pin the teal ADR-0087 Waypoint marker with the category as a glyph and an amber commitment core. That contradicted the **earlier, still-standing** agreement that pin colour is category-driven (ADR-0038 §2; ADR-0028's decorative palette; the original design-language "5 pastel category colours"), and it put teal on every pin, diluting teal-as-signal. Reverted to category colour here. The Waypoint marker remains the **brand/logo** (ADR-0087) and the pin **shape** heritage; it is not the pin's colour. This also **revises ADR-0106 Decision C's** "teal = location on the pins" to "category colour on the pins; teal/amber stay for affordances/time" — annotated there.

### 4. Multi-facet place → union semantics, coloured by most-committed reference (ratified)

ADR-0106 Decision 4 recommended this; it is **ratified here.** A place referenced by more than one entity shows under **every** filter facet it matches (a place that is both a scheduled event and an unconsumed maybe appears under both its type filter **and** the maybes filter). "Colour-by-most-committed" now governs **which category colours the pin** when the references disagree: the most-committed reference wins (`hard > soft > idea`), and the hard/soft grammar (§3) reflects that same top reference. In the mockup, `% Arabica` is both `food` and a `maybe` and renders with the food hue in the idea (dashed) grammar.

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

### 8. Places & timezones in the authoring forms — one place vs. two places

The picker + zone chip are designed **in the forms**, not just on the map (they gate the whole epic — ADR-0106 Phase 1 — and ADR-0107 rides them):

- **One `PlacePicker` field in every place slot** (Google Autocomplete + session tokens): EventForm location, booking location, transport origin/destination, maybe-item. A **selected** place shows its category badge + address; an **empty** field shows the search affordance; a **name-only** save is the offline "Place-lite" fallback (no coords/zone until picked).
- **One place (event / single-location booking):** one picker field + the WhenField carrying **one zone chip** — a **one-tap-correctable** `🕐 19:30 · טוקיו ▾` (ADR-0107 §6: "sensibly defaulted, trivially fixable," never silently authoritative on the boundary cases). The chevron is a real SVG caret, not a raw `▾` glyph (design-language "emoji are content, icons are UI").
- **Two places (transport):** an **origin** + a **destination** picker field, and the WhenField carries **two zone chips** — origin on the start time, destination on the end, with the cross-zone `+1` tag: `23:00 · תל אביב ▾ ← 18:00 +1 · טוקיו ▾` (ADR-0107 §3/§8, the asymmetric transport case).

### 9. Ratings are pulled into Phase-1 cached enrichment (small scope addition)

ADR-0106 deferred place enrichment ("hours, photos, descriptions — a vNext pipe") but never named **rating**, which is materially cheaper: `rating` (+ `userRatingsTotal`) come back on the **same Place Details response** the picker already makes at pick time, so they cache on the `Place` row exactly like coords/address (ADR-0048 "the row is the cache") — no extra call, no per-view cost, offline-safe to re-read. They are high-value for the research/maybe flow (Plan mode: "4.7★ — worth a slot?"). **Decision:** include `rating`/`userRatingsTotal` in Phase-1 enrichment; keep hours/photos/descriptions deferred to the vNext pipe. Shown as a small `★ 4.6` meta tag (the star glyph carries it; not a semantic hue). Recorded in ADR-0106's scope + the backlog.

### 10. How the Phase-6 embedded map joins the list-first view

ADR-0106 said "the list becomes its companion" in Phase 6 but left the shape open. The vision (mockup panel): the **list stays; the map is pulled _into_ it** (ADR-0106 Decision 3, "the list is built to accommodate the map"):

- **Phase 3 (today):** list only.
- **Phase 6 default:** a **map pane on top + the list as a draggable bottom sheet** (the standard maps+list pattern — Google Maps / Wanderlog / Airbnb), with a **`רשימה / מפה` segmented toggle** to take either full-screen. Full-screen map keeps a **peeking list sheet**.
- It's the **same pins, same filters, same offline derivation** — the map only adds the spatial canvas + the "me" dot + per-day connectors/routes (ADR-0106-D/E). The list is never thrown away, so the Phase-3 investment carries forward intact.

### 11. Event category is an explicit field (like a booking's type) — the icon no longer decides it

Today a manual event's `category` is inferred from the **icon** the user picked (ADR-0038 §4 Tier-B/manual), while a **booking's** category comes from its explicit **type** (icon glyph-only, ADR-0038's 2026-07-19 amendment). That asymmetry is wrong now that **category drives the pin colour** (§3) — the colour should be a deliberate choice, not a side effect of an icon. **Decision:** the EventForm (and the maybe-item add flow) gets an **explicit category selector**; **the icon becomes glyph-only everywhere** and no longer sets `category`. Category still yields a **default icon** (`iconForCategory`, overridable as a pure badge), so quick entry stays fast. This **amends ADR-0038 §4** (recorded there); no schema change — `Event.category`/`MaybeItem.category` already exist, this only changes _how the value is chosen_. Two specifics:

- **Visual parity with the booking type picker.** The category selector is built to look **exactly like the booking type picker** (`.typepick`/`.tp` card grid in `plan-mode-v1.html`): a 3-column grid of icon-+-label cards with the mode-accent-tinted selected card, over the 9 canonical `EventCategory` values (each card carries its pin-colour swatch so the colour mapping is legible while choosing). One selector shape for "what kind of thing is this," whether booking or event.
- **A booking-seeded event derives its category from the booking — the selector is not shown.** An event created from a booking seed (flight/hotel/train/…) has **no manual category selector**; its `category` is `categoryForBookingType(type)`, **read-only**, surfaced as the same "✨ נגזר מסוג ההזמנה · `<category>`" readout the booking form already uses (ADR-0038's 2026-07-19 amendment — the type owns the category). The explicit selector is for **manual, non-booking events** only.

## Consequences

- **Design-language is updated in this change** (CLAUDE.md founding principle): the "Map" entry and the decorative-palette sentence describe **category-coloured pins** (5-hue palette, ADR-0038/0028) — list = rounded category badge, map = category teardrop — restoring, not dropping, "map pin categories" in the decorative palette. The `trip-dashboard-v2.html` map sketch's pin colours are kept; its teardrop-in-a-list is superseded by the rounded badge. The mockup catalog gains this file's entry.
- **The three ADR-0106 open design questions are closed:** geolocation UX (§6–7), multi-facet union + colour-by-most-committed (§4), and the Index-grammar reuse (§2). The multi-day-place question is closed in §5. ADR-0106's "Open questions" are annotated to point here; **ADR-0106 Decision C** (teal-on-pins) and **ADR-0038 §4** (icon-drives-event-category) are annotated as revised by this ADR.
- **Mostly presentation, with two small model touches for the FE/BE-arch + data sessions to absorb:** the pin/list/filter/near-me layer is pure view state (posture of ADR-0098/0100); the two additions are **`Place.rating`/`userRatingsTotal`** cached at pick time (§9, one field on the existing Details call) and **surfacing `Event`/`MaybeItem` category as an explicit form field** (§11, no schema change). The place-usage derivation, the shared-search-core call, and ADR-0107's zone threading remain the FE-arch session's to structure.
- **Cost discipline is preserved** (ADR-0106 Decision 5): list + filter + near-me-sort is pure derivation; ratings ride the pick-time Details call already being made; the only paid Google operations remain new searches (Phase 5) and rendered tiles (Phase 6).
- **The pin scales straight into Phase 6:** the category-coloured badge (list) and category-coloured teardrop (map) are one colour system, so the list and the rendered `AdvancedMarkerElement` map (ADR-0106 Decision B) never diverge; the map only adds the spatial canvas, the "me" dot, and the amber route ETA / next-stop ring.

## Alternatives considered

- **Teal Waypoint pin + category-as-glyph + amber commitment core** (this ADR's own first draft, and ADR-0106 Decision C's "teal on the pins"). Rejected on review: it contradicted the earlier, still-standing agreement that pin colour is **category**-driven (ADR-0038 §2 + ADR-0028's decorative palette, which sanctions category pin colours "never amber or teal"), and putting teal on every pin dilutes teal-as-signal. Category colour is the loud figure; teal/amber keep their affordance/time roles off the fill. The Waypoint marker stays the brand + shape heritage, not the pin's colour.
- **Let the icon keep deciding an event's category** (status quo, ADR-0038 §4). Rejected (§11): now that colour = category, the category must be an explicit, deliberate field like a booking's type — not a side effect of icon choice.
- **A teardrop map-pin as the list-row badge** (one shape everywhere). Rejected: a tilted teardrop reads as a misplaced map pin in a list and its tip points sideways; a rounded category badge is the right list idiom, the teardrop is the map idiom (both share the category colour).
- **Ask for geolocation on tab open** (so distances are ready immediately). Rejected: a cold permission prompt with no stated reason is the classic dark-pattern and reads as the app grabbing location; ADR-0006's own-device posture and basic UX both call for just-in-time, reason-first prompting. Reads never depend on it.
- **Surface a multi-day place on edge days only** (drop it from middle days entirely). Rejected: you always want to be able to find your hotel on the map mid-stay; the ambient treatment shows it as context without pretending it's a day-anchored commitment — matching how the day view already handles the same span (ADR-0054/0064).
- **Surface a multi-day place identically on every span day** (a loud pin every day). Rejected: it mis-reads the day filter (a mid-stay hotel is not a thing anchored to _that_ day) and re-introduces exactly the "counted like a block" error ADR-0054 fixed for the glance.
- **A spatial "me" dot mini-map for near-me in Phase 4** (bring a slice of Phase 6 forward). Rejected: it would pull the most expensive, least-offline-friendly piece (rendered tiles) into the phase specifically scoped to avoid it; the list re-sort + distance chips answer "what's near me" completely without a render, and the sort survives unchanged into Phase 6.
- **A second, map-specific filter component.** Rejected outright (CLAUDE.md rule 8): the Index already ships the chip/search/mode-accent primitive; a parallel copy is the exact trap ADRs 0078/0079/0094/0095 exist to undo.
- **A bespoke map day strip with an "all days" pill** (this ADR's own first draft). Rejected once checked against the shipped `DayStrip`: it duplicated a shared component, mis-drew it (it's header chrome with weekday-over-number cells, not a white pill row), and couldn't hold "all days" honestly (the app has one active date). The reconciliation in §1 — reuse the real strip, focus-in-place on the map, "all" as a map-local chip — is both less code and more consistent.
- **Keep the strip navigating to the Day view from the Map too** (leave its behaviour byte-identical everywhere). Rejected as bad UX where it matters: tapping "day 3" while exploring the map to have it yank you into a schedule list defeats the map. And it isn't even the strip's real rule — the Day view already updates _in place_; the Map just extends that.
- **A separate map-local full day-picker** (leave the header strip untouched, add a second day selector on the map). Rejected: two day-number rows on one screen is redundant and cluttered, and it ignores that the map is genuinely a day-scoped surface the shared strip should drive.
