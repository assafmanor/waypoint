# 0045 — Trip-mode Home: real data only (quick-access rework + day-at-a-glance)

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0004](0004-integrations-are-pipes.md) (integrations feed surfaces, don't get their own), [0006](0006-no-live-location-v1.md) (no live location in v1), [0014](0014-budget-display-only-v1.md) (budget display — now deferred off the home)

## Context

The Trip-mode Home (`frontend/src/screens/Home.tsx`) was assembled from the original `mockups/trip-dashboard-v2.html`. Its board hero (derived Now/Next, ADR-0018) works as intended — it is the "one loud element" the design language is built around. But the two supporting sections below it were carried over as **fixtures for features we don't have**, and in one case will never have as specced:

- **Quick access** (`גישה מהירה`) — four tiles. Only two were real: **קוד WiFi** (copies a real `TripNote`) and **הכרטיס הבא** (derives the next booking's confirmation code). The other two were fake concierge: **ניווט למלון** was a toast with no location behind it, and **כספומט קרוב** ("nearby ATM") requires Places + live device location — which [ADR-0006](0006-no-live-location-v1.md) deliberately keeps out of v1. A tile that can never be real is worse than no tile.
- **Quick view** (`מבט מהיר`) — weather, FX, and daily-budget glance cards, all fed by a static `GLANCE` fixture. Weather and FX are **unbuilt integration pipes**; budget is display-only per [ADR-0014](0014-budget-display-only-v1.md) but backed by nothing (no expense model) and, on reflection, not something this product manages.

The through-line: the Home was showing capability we don't have. For a *living visibility layer* whose whole promise is "what's true right now, even offline," shipping fixtures is the wrong failure mode — it erodes trust in the one screen that must be trustworthy.

## Decision

**The Trip-mode Home shows only elements backed by real, offline-safe trip data.** No fixture stands in for an unbuilt feature; a section that would need data we don't collect is removed until the data exists, not faked.

Concretely:

1. **Board hero — unchanged.** Still the single loud element; still derived from `events` + the clock. Not touched by this ADR.

2. **Quick access → three *real* shortcuts (v1).** The grid stops being a concierge and becomes shortcuts into data/surfaces we actually have:
   - **הכרטיס הבא** — the next hard booking's confirmation code, tappable → the index. (Kept, upgraded from a toast to a real jump.)
   - **קוד WiFi** — copy the hotel WiFi `TripNote` to the clipboard. (Kept.)
   - **מסמכים** — jump to the encrypted offline documents in the index. (Added; real surface.)
   - **Removed:** `כספומט קרוב` (needs live location — ADR-0006) and the old standalone `ניווט למלון` toast.
   - **Empty states are an "add" affordance, not a dead tile.** A tile with no data behind it (no WiFi note yet, no documents) renders in the soft/dashed "provisional" grammar — muted, `＋ הוסיפו…` — reading _set me up_ rather than a blank filled card (design-language: "empty states teach, never dead-end"). WiFi is real and its add can be wired later; **documents are not on the FE yet, so that tile is an honest fixture** — it shows the add-affordance and stubs the action until the docs feature lands. Presented as "not set up," never faked as working.

   **Navigate-to-next is deferred to v1.next (decided 2026-07-16).** A fourth tile, **ניווט ליעד הבא**, was in the approved set but is held back until the maps/location work lands. The subtlety worth recording: the tile does **not** depend on live *user* location — a Google Maps deep-link (a catalog *Must*) hands off to Maps, which does the routing from the device's own position, so [ADR-0006](0006-no-live-location-v1.md) does not block it. What it depends on is **real place data on the event** (address / Places id / coords). Today an event carries only a free-text `title`/`location`, so the only thing buildable now is a Maps *search-query* deep-link — which can resolve to the wrong city or an ambiguous match. That is exactly the "might-be-wrong fixture" this ADR exists to remove, and it would be the one tile on the screen that could confidently send someone to the wrong place. So navigate waits for the place-data work; when it lands, the tile slots back in as the fourth and the grid returns to four columns. The design intent (four tiles) is unchanged — only its phasing.

3. **Quick view → replaced by a derived "day at a glance" card.** The weather/FX/budget row is removed. In its place, one paper card computed **100% from `events`** (offline-safe, no fixture): a segmented block bar plus a lead **"נותרו"** count, the next **hard anchor** ahead, and the day's free-until / end-of-day framing. It's deliberately a different visualization from the board's time-progress bar, so the two don't read as duplicates. Options were mocked up in `mockups/trip-home-glance-options-v1.html` (lead-with-remaining vs. three-way split vs. full breakdown); **lead-with-"נותרו" was chosen** — one number that can't be misread, with the bar carrying the done/passed/skipped texture.
   - **Counts are phase-derived, not settle-derived** (this was the load-bearing correction). The card reads `eventPhase()` (`lib/time.ts`, ADR-0027/0043): `done` · `skipped` · **`passed` (time over, never marked — the common case)** · `now` · `upcoming`. "הושלמו" (settle-only Done) would have misfiled both skipped and — far more often — passed-unmarked events. So **"נותרו" = `phase ∈ {now, upcoming}`**, which drops passed/done/skipped automatically, with zero dependence on anyone marking anything.
   - **The bar and count are on top-level _blocks_, not raw events** (consistency with [ADR-0041](0041-parallel-overlapping-events.md), which already rejected a proportional time-rail as too busy and collapses concurrency to "one hero + ועוד N"). The card runs on the **roots of the containment forest** (`buildTimeTree`): a nesting envelope with N stops inside is **one block**; a partial-overlap **cluster is one block** (drawn as a tight sub-tick bundle = "בו-זמנית", no legend). So "נותרו" is _chapters of the day left_ and can never imply a longer/busier day than exists. With no overlap, roots == events, so it's identical to the plain case. The **hard-anchor count stays at the leaf level** — a booking at 19:30 matters even nested inside a soft envelope (the one deliberate roots/leaves exception). Mocked in `mockups/trip-home-refinements-v1.html`.
   - **Empty day (no events): a calm teach state**, not a hidden card and not a "0 / 0" bar (which reads broken). "היום עוד פתוח · יום חופשי" with a soft add prompt (Trip-mode quick-add, ADR-0043) — an open day is useful information on the ground. No amber: nothing is "now," so no pulse. Same state serves a future empty day reached via the day-strip.
   - Colors stay on-budget (ADR-0028): `--ok` for done blocks, `--amber` for the live block and the hard-anchor (time & commitment), everything else neutral. No teal, no violet on this card.

4. **Weather / FX return as themselves, later.** When those integration pipes land they come back as their own glance cards (exactly ADR-0004's "an integration feeds an existing surface") — not as pre-wired empty shells now.

5. **Budget is deferred off the Home.** See the ADR-0014 amendment: display-only budget is pulled from the v1 Home; the `Trip.dailyBudgetMinor` field and `formatMoney` stay (cheap, harmless, and re-usable if real expense tracking is ever built), but nothing renders them.

## Consequences

- The Home is trustworthy: every number and tile on it reflects real trip state and survives offline. Nothing on the screen implies a capability we lack.
- `mockups/trip-home-v3.html` is the new Trip-mode Home reference; it supersedes the HOME section of `trip-dashboard-v2.html` (which stays the reference for the other tabs). Two companions carry the refinements: `mockups/trip-home-glance-options-v1.html` (the glance counting-model options) and `mockups/trip-home-refinements-v1.html` (empty tiles, overlap-aware glance, empty day).
- Doc sync in the same change: `design/design-language.md` "Core components" (quick-access grid + day-at-a-glance entries), `product/feature-catalog.md` (glance-cards and per-day-budget rows), and the [ADR-0014](0014-budget-display-only-v1.md) amendment.
- **Implementation is a separate change** — this ADR + the mockups land first as the design record; `Home.tsx` / i18n follow on their own PR.
- The `GLANCE` fixture's weather/FX/budget shapes are no longer rendered by the Home. They remain in `fixtures.ts` only as long as something references them; the budget field on `Trip` is untouched.
- Component lexicon: `GlanceCard` is repurposed — the canonical Trip-home instance is now the derived day-at-a-glance card, not a weather/FX/budget widget.

## Alternatives considered

- **Keep weather/FX/budget as honest "coming soon" placeholders.** Rejected: dashed placeholders are still dead space on the one screen that must feel live, and they invite "why doesn't this work?" The derived card gives the section a real job today.
- **Remove the quick-view section entirely.** Considered; rejected in favor of the derived card, which keeps a genuine glance layer using data we already have.
- **Make "nearby ATM" real.** Blocked by [ADR-0006](0006-no-live-location-v1.md) (no live device location in v1); not reopened here.
- **Keep budget on the Home per ADR-0014 as-is.** Rejected: the decision itself flagged its prominence as uncertain, and there is no expense model behind it — it was a number with nothing to say.
