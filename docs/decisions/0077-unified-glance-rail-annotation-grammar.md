# 0077 — Unified glance rail-annotation grammar

**Status:** Accepted
**Date:** 2026-07-19
**Refines:** [0059](0059-booking-presentation-on-home-and-index.md) (§4's glance transition markers, whose amber-pill-per-edge treatment this replaces), [0054](0054-ambient-span-events-off-the-day-schedule.md) (the 2026-07-18 amendment's uncounted check-in/out markers this re-expresses), [0064](0064-day-transition-entries-and-home-band-trim.md) (the shared `bookingTransitionsOnDate` derivation this pairs by day; the day-view transition **rows** are unchanged), [0041](0041-parallel-overlapping-events.md) (the overlap/containment count chips this folds into the shared primitive), [0045](0045-trip-home-real-data-only.md) (the derived day-at-a-glance card this restyles), [0063](0063-category-time-behaviour-profile.md) (the `bracketed` profile every rule keys on), [0028](0028-plan-violet-color-budget-dark-ready.md) (the amber/teal/neutral colour budget this obeys)

## Context

The Trip-mode Home glance ("היום במבט", ADR-0045) carries **two unrelated annotation systems that share no visual language**:

1. **Transition markers _above_ the rail** — amber pills `[icon · word · time]`, absolutely positioned by time and lane-stacked on collision (`.glance-marks`/`.tmark`, ADR-0054 amendment + ADR-0059 §4).
2. **Count chips _below_ the rail** — neutral chips `×N` (overlap cluster) / `כולל N` (containment envelope) on a composite block (`.seg .n`, ADR-0041).

Because the two don't rhyme — and because each transition pill is heavy (icon + Hebrew word + time) and positioned independently — a busy day reads as noise. Observed on a real travel day with a red-eye flight (`המראה 01:00 → נחיתה 04:30`) and a ferry (`יציאה 10:30 → הגעה 14:30`): four heavy pills ladder into two rows and smear, and a booking's two edges read as two unrelated items — you can't see that `01:00` and `04:30` are the **same flight**.

The fix has to cover more than flights: **hotel check-in / check-out that fall on separate days**, the **overlap / containment** conflict labels, a **crowded first/last trip day** (checkout + transfer + a new check-in all at once), and annotations at the **edges** of the timeline (very early / very late). They should all speak one language.

Design exploration: `mockups/glance-transition-labels-v1.html` (transitions in isolation) → `mockups/glance-timeline-labels-v2.html` (the unifier, with three candidate grammars compared head-to-head). Signed off on the two-bands grammar.

## Decision

Replace both systems with **one pill primitive** whose meaning is carried on two orthogonal axes:

- **Tint = family.** **Amber** = a **time anchor** (a hard, time-anchored commitment; ADR-0028). **Neutral** = **structure** (informational — a conflict is not a commitment, so it stays off the amber budget).
- **Connector = shape.** **Bar + two feet** = a **span** (the two instants of one booking). **Stem** = a **point** (a single instant). **Short tick** = a **block note** (attached to a counted block).

### A. Two bands, never stacked on each other

Time-anchors render **above** the rail; structure notes render **below** it. The two families therefore never compete for the same vertical lanes — which is what halves the stacking pressure that made the old markers ladder.

### B. Span vs. point — one rule for every bracketed booking

A **bracketed** booking (lodging, transport; ADR-0063) is drawn by how many of its edges land on the viewed day:

- **Both edges today → a span:** one centered pill `[icon] t0 → t1` over a bar whose feet mark the two exact instants. Order implies direction (earlier foot = departure / check-in), so a span carries **no words** — just icon + range.
- **One edge today → a point:** a single pill `[icon] [word] [time]` + stem. It carries the **transition word** (צ׳ק-אין / צ׳ק-אאוט / המראה / נחיתה / יציאה / הגעה) because there is no partner edge to imply direction.

This is the unifier: a **multi-day hotel degrades to a point on each of its edge days automatically** (check-in one day, check-out another), while a same-day flight or ferry is a span — no per-type special-casing. (Consistent with ADR-0064 §B, which already splits multi-day brackets into per-day edges for the day view; here the same per-day edges drive the glance, paired into a span only when both fall on one day.)

### C. Overlap / containment become block notes in the same primitive

`×N` (overlap cluster) and `כולל N` (containment envelope, ADR-0041) render as the **neutral** pill below the rail, with a **layered top edge** that deliberately echoes the composite block's own `.multi` layered edge, tying note to block.

### D. Crowding → collapse to a legs line

Generalize the existing `assignMarkerLanes` (ADR-0054 amendment) to run over the anchor band. When the anchor band would exceed **two lanes** (a crowded arrival/departure day), collapse the anchors to a **legs line** — the same pills, flow-laid below the rail-ends like a departures board — so overlap is impossible by construction. The rail keeps its blocks + now-line + block notes. Block notes keep the existing `MIN_COUNT_FRAC` drop rule (a too-narrow composite keeps only the layered cue).

### E. Edges and short spans

- Any anchor within `MARKER_EDGE_FRAC` of a rail edge **anchors inward** (grows toward centre) instead of centring on its point, so it can't clip. The window already stretches to the earliest/latest instant (`buildDayGlance`), so no anchor falls off the scale.
- A **span keeps both times inside the one centered pill** — never at the bar feet. A 35-minute flight is a short bar with the same centered pill, so the two times can never collide (this fixes the latent flaw in the v1 "times at the feet" sketch).

## Architecture (derivation + rendering)

- **Reuse the shared derivation.** `bookingTransitionsOnDate` (ADR-0064) already returns per-day `{ event, edge, atMs, labelKey }` descriptors. Add same-day **pairing**: group a booking's descriptors that land on the viewed day — two → a span, one → a point. Pure and unit-tested in `lib/glance.ts`.
- **Extend the glance model, don't fork it.** `GlanceMarker` carries a shape (`span` | `point`), and for a span its two instants; the neutral notes still come from `GlanceSeg.composite`/`clusterLike`/`count`. One render component draws the two bands + the collapse.
- **Derived, no data-model or backend change.** `startsAt`/`endsAt`/`endDate` already exist. i18n reuses the existing `transition` + `concurrent`/`contains` keys.
- **Scope: the Home glance rail only.** The day-view transition **rows** (`TransitionRow`, ADR-0064 §B) are a different surface and are unchanged. Home carries no persistent ambient band (ADR-0064 §A) — that stays; on a stay's strictly-middle nights the glance shows nothing, by design.

## Consequences

- Touches `lib/glance.ts` (same-day pairing, lane assignment over both bands, the collapse threshold + tests), `screens/Home.tsx` (render the two bands + legs collapse), `screens.css` (the `.achip` primitive replacing `.tmark` and the `.seg .n` count chips). Frontend + derivation only.
- Supersedes the **marker treatment** of ADR-0054's amendment and ADR-0059 §4 (the amber-pill-per-edge) and re-expresses ADR-0041's glance count chips through the shared primitive; the underlying models (`bookingTransitionsOnDate`, `buildTimeTree`) are unchanged.
- **Generality:** keys on the `bracketed` profile (ADR-0063), so any future bracketed category (a multi-day rail pass, a car rental) gets spans/points for free.
- **Open, deferred to build:** whether a span should also carry words (start with icon + range; add a start-foot word only if testing shows icon + order is unclear) and whether the collapse trigger should be lane-count (chosen: > 2 lanes) or a raw anchor count — both are single-constant tweaks settled during implementation.
- **Post-build fix (2026-07-19):** the lane-gap constant `MARKER_MIN_GAP_FRAC` was `0.28`, narrower than a real pill on a phone, so two anchors that actually overlapped still shared one lane and smeared (never crossing the > 2-lane collapse) — visible on a crowded day. Sized it to a real phone pill (~116px on a ~320px rail → **0.36**) so "would cover another" is the real trigger: touching pills split to a new lane and, past two lanes, collapse to the legs line. Pure tune in `lib/glance.ts` + a phone-width regression test; no grammar change.

## Alternatives considered

(All three unified grammars are rendered head-to-head on one mixed day in `mockups/glance-timeline-labels-v2.html`.)

- **Grammar 2 · one band, colour-only.** Every annotation above the rail as a stemmed pill, family shown by tint alone, no span bars. Rejected: stacks tall on even a merely-mixed day, and a booking's two edges read as unrelated (no pairing).
- **Grammar 3 · rail-integrated.** Annotations fused into the bar (times hugging block ends, a notch for a check-in, `×N` inside a dark block). Rejected: quietest, but no room for the transition words and it reintroduces the short-span time collision. Kept on the shelf as a possible future "quiet mode" borrow.
- **v1 spans with times at the bar feet.** Rejected: the two times collide on short spans. Putting both times in one centered pill removes the failure mode.
- **Treat a conflict as a status colour (`--miss`).** Rejected: an overlap is structure/information, not a failure; it stays neutral, off the amber/status budget (ADR-0028).
