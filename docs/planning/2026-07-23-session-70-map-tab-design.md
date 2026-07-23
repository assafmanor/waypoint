# Session 70 — Map surface design (ADR-0108)

**Date:** 2026-07-23
**Type:** Design session (no app code). Session #1 of ADR-0106's follow-on roadmap ("Design — the Map surface").
**Output:** [ADR-0108](../decisions/0108-map-tab-design.md) (Accepted, design) + [`mockups/map-tab-v1.html`](../../mockups/map-tab-v1.html), plus doc sync (design-language, mockup catalog, INDEX/README routers, backlog, ADR-0106 open-question annotations).

## Frame (unchanged, inherited)

Scope, phasing, and the embedded-map direction were already fixed and merged in [ADR-0106](../decisions/0106-maps-and-places-epic-scope-and-phasing.md), with the companion multi-zone time model in [ADR-0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md). This session did **not** reopen any of that — it filled in the deferred visual/interaction design and resolved the named open design questions. Read-first set was ADR-0106 (esp. phasing + the embedded-map § + open questions), ADR-0107, `design/design-language.md`, and the map entries in `design/mockups.md`.

## What was designed

- **List-first Phase-3 tab, re-emphasized by mode.** Chrome (incl. day strip) → filter chips → scope/near-me strip → the pinned-place list, each row deep-linking out. Trip pre-selects today, Plan defaults to all.
- **Day scope reuses the shared header day strip, reconciled** (revised after Assaf showed the real component + flagged the behaviour conflict — see below). Not a bespoke map strip.
- **Filter chips (type · maybes) reuse the Index grammar** (ADR-0098/0100), not a second copy (CLAUDE.md rule 8): label+count pills, edge-fade mask, covering search, mode-tinted `--idx-accent`, pure offline-safe derivation over the place-usage index.
- **The pin = the Waypoint marker** (ADR-0087) as a custom AdvancedMarker on "quiet base, loud pins" (ADR-0106 Decision C): teal body = location, **glyph = category** (ADR-0038, not a fill), **amber core = commitment** (colour-by-most-committed, expressed as core state: lit/dim/absent). Kept inside ADR-0028's budget and consistent with the ADR-0105 loading-states palette now on `main` (amber is an accent, not a ground).
- **ADR-0107's editable timezone chip** on the time input (single chip for a placed event, two for transport with the `+1` tag).

## Open questions resolved (recorded in ADR-0108, annotated back into ADR-0106)

1. **Multi-day place under the day filter → edge-loud, middle-ambient** (follows 0054/0064): loud pin on arrival/departure edge days, a quiet ambient "your base" row (no amber core) on strictly-middle days. Neither "every span day (loud)" nor "edge days only".
2. **Multi-facet place → union semantics + colour-by-most-committed** (ratifies ADR-0106's recommendation): shows under every matching facet, pin takes the most-committed state (`hard > soft > idea`).
3. **Geolocation UX → just-in-time, never blocks reads** (ADR-0006): asked only on tapping "near me now" behind a reason-first pre-prompt; denied/unavailable degrades to the default sort with distance chips dropped and a quiet re-enable affordance.
4. **"Near me now" without a rendered map** (Phase 4 before Phase 6) → a list re-sort + teal distance chips, no spatial "me" dot; only coord-bearing places participate; the sort survives unchanged into Phase 6.

## Notable call — superseding the 5 pastel category pins

The design-language previously sanctioned "teardrop pins in 5 pastel category colours" (+ "map pin categories" in the decorative palette). ADR-0108 **supersedes** that: category moves to the glyph, the pin spends only teal + amber. Rationale: five decorative hues fight "quiet base, loud pins," dilute teal as the location signal (ADR-0028), and duplicate a signal the glyph already carries (ADR-0038). `design-language.md` updated in the same change (founding principle: docs stay in sync).

## Day-strip reconciliation (post-review revision)

Assaf showed the real shipped day strip (both modes) and asked how it fits the map, since **tapping a day currently navigates to the Day view** (`setActiveDate` lands on the `days` tab) — different from the in-place filter the first draft assumed. Read `ui/domain/DayStrip.tsx` + `App.tsx`. Resolution recorded in ADR-0108 §1:

- The strip's real rule is already "focus this day → show it on a day-scoped surface, **in place** if you're on one (the Day view updates in place), else route to the Day view (Home/Index)." The Map is simply a **second day-scoped surface**, so it focuses the day in place — no new inconsistency, it joins the Day view's behaviour.
- The first draft's bespoke map strip + "כל הימים" pill was wrong (duplicated the shared component, mis-drew it, and can't hold "all days" since the app has one active date). Corrected: reuse the real `DayStrip` verbatim; "all days" is a **map-local scope chip**.
- One contained nav change flagged for FE-arch: make `setActiveDate` context-aware (stay on a day-scoped tab instead of always jumping to `days`).

The mockup's day strip was rebuilt to match the shipped component (header chrome, weekday-over-number, amber-anchor/violet-selection/dashed-red empty days) and verified in both modes.

## Explicitly left for follow-on sessions (not this one)

- **FE-arch (roadmap #3):** the place-usage derivation module, the one-shared-search-core-vs-two-components call (leaning shared), and how ADR-0107's per-event zone threads through `lib/time.ts`/`lib/places.ts`. ADR-0108 fixes _what it looks like and how it behaves_, not the module layout.
- **BE-arch (roadmap #2):** the Places API key model + the Phase-6 cost envelope + the offline lat/lng→zone library.
- **Google Cloud setup (roadmap #0, human):** still gates all real work.

## Files touched

- New: `docs/decisions/0108-map-tab-design.md`, `mockups/map-tab-v1.html`, this note.
- Updated: `docs/design/design-language.md` (Map entry + decorative-palette sentence), `docs/design/mockups.md` (new entry + `trip-dashboard-v2` map-section supersession), `docs/decisions/README.md` (0108 row), `docs/INDEX.md` (design-domain router + planning-session rows), `docs/backlog.md` (epic header + Phase 3/4 lines), `docs/decisions/0106-…md` (open-question resolutions annotated).
