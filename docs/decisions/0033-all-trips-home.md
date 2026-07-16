# 0033 — "All trips" home: land there unless a trip is live; it replaces the switcher sheet

**Status:** Accepted
**Date:** 2026-07-14
**Refines:** [0021](0021-multi-trip-membership.md) (active-trip resolution), [0024](0024-app-shell-and-trip-lifecycle.md) §5 (trip switcher)

## Context

ADR-0024 made the trip switcher a **sheet** ("not a route") and, with ADR-0021, always resolved _some_ active trip and dropped you straight into it (in-progress → nearest upcoming → most recent). Two problems surfaced while designing the switcher:

1. **No home base.** There was nowhere to see and manage your trips as a set — only a transient sheet on top of whichever trip you were forced into.
2. **You get dropped into a trip that isn't happening.** When nothing is in progress, ADR-0021 still opens the nearest upcoming trip in Plan mode. Waypoint is a "when you're on the ground" tool; if you're not on the ground on any trip, the right place is an overview, not someone else's future itinerary.

## Decision

**1. An "All trips" home is a real surface** (`/trips`) — a lean list of your trips, each with a date-derived **now / soon / past** chip, plus **create**. It is a page, not a sheet.

**2. Landing rule (refines ADR-0021).** On load, authenticated:

- **A trip is live** (in progress today, by dates) → open it directly (`/`) — on-the-ground priority is preserved.
- **No trip is live** (all upcoming/past) → **All trips** home. Do not auto-open a future trip.
- **No trips at all** → Zero-state (unchanged, ADR-0024 §2).

`resolveActiveTrip` keeps its in-progress branch; the upcoming/past fallbacks now feed "which trip is marked, if any" on the All-trips page rather than a forced landing.

**3. Access from inside a trip (replaces ADR-0024 §5's sheet).** The trip name in the in-trip header (▾) navigates to All trips — one surface, reached both as the landing and as the way "out and across." The switcher **sheet** is dropped; there are not two presentations of the same list.

**4. No "Join with a link" on this surface.** Joining always begins from an external invite link (ADR-0030) — a join button here is redundant. Create only. (Zero-state keeps Join: it's the genuine first-run "open the app first" path.)

**5. Not a dashboard, and no board.** The All-trips page is a navigation list, not a lobby of rich cards. Nothing is "live" on it (a live trip would have opened directly), so it carries **no departure board** — the board stays inside a trip, keeping the "board = the trip is speaking" scarcity (ADR-0028).

## Consequences

- Supersedes the "switcher is a sheet, not a route" line of ADR-0024 §5; that section now describes the All-trips page. Routing map gains `/trips` and the live-vs-not landing branch.
- `mockups/trip-switcher-v1.html` → renamed `mockups/all-trips-v1.html`, rebuilt as a page (greeting header, trip list with now/soon/past chips, single create CTA, offline state).
- **Implementation follow-up:** the `/new`-style shell route `/trips` + the landing branch in `App.tsx`; the current switcher-sheet stub (`Sheet` render for `'switcher'`) is replaced by navigation to `/trips`. `CreateJoinActions` is no longer used here (create is a plain button); it stays in the zero-state.
- Shell chrome unchanged: indigo/neutral, no amber/teal/violet (ADR-0028).
- **Trip identity is a single free-text `destination` string** (as modeled — one column, no structure). Each trip row shows `destination · dates · member-count`, all model-derived. Earlier mockups drew a multi-stop itinerary ("טוקיו → קיוטו → אוסקה") in the destination line — that implied a structured multi-destination the model doesn't have. **Structured multi-destination is deferred** (it would mean per-leg stops/dates, a real model change); a user who wants a route can still type one into the free-text field.

## Revision (2026-07-16) — v2 presentation: sectioned list + a live-trip hero

The first shipped version (`all-trips-v1.html`) was a flat list where the live trip was near-invisible (an off-white card) and the meta line was cramped. The presentation is revised — **the decisions above are unchanged** (still a navigation list, create-only, no join, shell chrome); only how the list is drawn changes. Reference mockup: `mockups/all-trips-v2.html` (supersedes v1).

1. **The list is sectioned** by the same date-derived split — `עכשיו` / `בקרוב` / `הסתיים` — instead of one flat run under a total count. Hierarchy is read at a glance; the `now/soon/past` chip is dropped from the `now` group (the section header + hero carry it).
2. **The live trip gets a prominent indigo hero.** This is the one loud element on an otherwise paper page: chrome-base `--indigo` (never the darker `--board`), elevated, with an enter affordance. **It is a nav card, not a departure board** — no board glow, no pulse, no Now/Next content — so §5 ("no board here") and the ADR-0028 board-scarcity rule both still hold. This clarifies, rather than reverses, §5: _the prohibition is on the board surface + its live grammar, not on using the chrome color prominently._ No "active trip" caption sits on the hero: the `עכשיו` section header above it and the indigo prominence already carry that, so a label would only crowd the trip name (the visible section text still provides the non-color redundancy).
3. **Meta line follows the type system.** Spaced middots (`·`), and the date range + member count set in JetBrains Mono `dir="ltr"` (design-language: mono = dates/numbers). Isolating the numeric run in `dir="ltr"` also fixes an RTL bidi bug where the date range rendered reversed (`23.07–16.07`). Card titles move to `Secular One` (the ramp's h3). A `destination` that the trip name already contains is hidden to keep the line lean.
4. **Past trips** are de-emphasized a notch (quieter surface + desaturated icon).
