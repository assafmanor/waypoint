# 0100 — Index bookings screen: compact header merge, mode-tinted accent, and a covering search overlay

**Status:** Accepted (Assaf sign-off 2026-07-21)
**Date:** 2026-07-21
**Refines:** [0098](0098-index-landing-and-dedicated-screens.md) §2 (the category-chip-row + search control it introduced get a denser layout and a different search-open interaction; the past-bookings collapse and the documents screen are untouched)
**Touches:** [0028](0028-plan-violet-color-budget-dark-ready.md) (extends its existing per-mode selection-accent rule — e.g. day-strip selection amber in Trip, `--plan` in Plan — to the Index bookings screen's own selected-chip/search-icon fill; not a new color rule)
**Relates:** [0099](0099-retire-the-custom-edge-swipe-gesture.md) (same follow-up session), [0090](0090-back-is-computed-from-nav-state.md) (no change — the back row still calls the same `onClose`/`useOverlay` path)

## Context

Assaf's post-ship feedback on the ADR-0098 build, in order:

1. With the search bar open the row read fine; closed, "the area still looks amateur."
2. The back-row-plus-title area "takes a really big part of the screen" and "looks uneven" — confirmed against a screenshot showing a large near-empty gap between the back row and the title row (a spacing bug: `.sec-title`'s 22px top margin, sized for separating a section from hero chrome elsewhere, stacking again after the new back row — fixed narrowly on the shipped build, see the session note).
3. Stronger: "It doesn't read as polished, professional. It looks like a hobby project by someone who doesn't know design." Tracing this against `docs/design/design-language.md` surfaced a real rule violation: the search/clear controls were raw 🔍/✕ emoji standing in for UI controls, breaking "emoji are content, icons are UI" (fixed on the shipped build with real `Icon.tsx` SVG glyphs).
4. Given a reference screenshot (a Plan-mode mockup Assaf liked): a materially more compact top+search chrome, a Plan-vs-Trip color palette (colored category icons deferred), and a fix for the back arrow's position/direction — beside "אינדקס", pointing right, so the documents screen can match.

That reference was mocked forward as `mockups/index-bookings-compact-v2.html`, iterated over several rounds of direct feedback (search icon side, minimal-not-rounded icon shape, the search overlay covering the chip row with a small animation, and finally a partially-cut edge chip on the dense scrollable chip row). This ADR is the converged result of that iteration — the ADR-0098 build's shipped chip/search row (still the current code on `claude/index-screens-followups-fixes`) is the interim step this decision supersedes, not yet ported.

## Decision

**1. The back row and the title/count row merge into one compact line.** `[← beside "אינדקס"] ... [count]` — one `idx-head` flex row: `idx-head-start` groups the back button + "אינדקס" label (so the arrow reads as "go back from Index," not a floating unrelated control), the booking count sits at the row's other end. The back arrow is the real `NavArrow` `back` variant (`scaleX(-1)`, never a Unicode glyph, per ADR-0098 §3) and now points **right** — the direction Assaf's reference used — so the documents screen's header can be built identically once ported.

**2. The category-chip row and the search control become one denser row, not two stacked ones.** Each chip carries label + type icon + count in one pill (e.g. "רכבת 🚄 2"), replacing the plain-text chips from the ADR-0098 build. A search icon button sits at the row's fixed **left** end (RTL: last DOM child); the chips scroll in the remaining space between it and the row's right edge.

**3. Opening search covers the chip row in place, not a second row below it.** Tapping the search icon toggles a `chip-slot.searching` state: the chip strip fades and shifts out (`opacity → 0`, `translateX(-6px) scale(0.98)`), the search input scales in from the icon's side (`transform-origin: left center`, `scaleX(0.88) → scaleX(1)`), both plain CSS transitions. The search icon itself tints to the active accent (`.on`) while open. This replaces the ADR-0098 build's approach of the search bar replacing the _title_ row — here it only ever displaces the _chip_ row, which stays the smaller, cheaper-to-restore surface.

**4. The search icon is a minimal real SVG control, not an emoji, and not a circle.** 32×32px rounded-square (`border-radius: 10px`, matching `.back-icon-btn`'s shape family, not `.chip2`'s pill shape) carrying `Icon`'s `search` path — continuing ADR-0098 §3's "every directional/control glyph is a real SVG" rule to this control too.

**5. The Index's own selected-state accent (selected chip fill, search-icon `.on` tint) follows the active mode.** Neutral ink in Trip mode (`--idx-accent: var(--ink)`, unchanged from the ADR-0098 build), plan violet in Plan mode (`--idx-accent: var(--plan)`) via a `[data-mode='plan']` override. This is **not** new color policy: ADR-0028 already established that a selected/active-state fill flips between neutral-in-Trip and `--plan`-in-Plan elsewhere in the app (the day-strip's selected day is the direct precedent, "amber in trip mode but `--plan` in plan mode"). The Index's chip/search accent had simply never been wired to that existing rule — this closes that gap rather than opening a new one. Per-category chip tinting stays deferred and out of scope (unrelated to this accent — it would spend the reserved amber/teal per-category budget ADR-0098 §2 explicitly declined).

**6. The chip row's edges fade instead of hard-clipping a partially-visible chip.** `scroll-snap-type: x mandatory` + `scroll-snap-align: start` aligns the row's resting scroll position to a chip boundary at the _leading_ edge (nearest scroll-start) — including on first load, before any scrolling — but can't fix the _trailing_ edge (the container width is never an exact multiple of chip widths, so a peek is inherent). A `mask-image`/`-webkit-mask-image` linear-gradient (`to right, transparent 0, black 14px, black calc(100% - 14px), transparent 100%`) fades both edges to transparent instead, so the inherent overflow peek reads as a "scroll for more" affordance rather than a broken cutoff. The gradient direction is physical (`to right`), correct in both directions since RTL only reorders flex children, not `mask-image`'s own coordinate space.

## Consequences

- `mockups/index-bookings-compact-v2.html` is the accepted design reference (superseding, for the bookings-screen header/chip/search area specifically, the still-current `IndexBookingsView.tsx`/`screens.css` shipped by ADR-0098 and iterated once already on this branch). Porting it into the real component tree (`ui/IndexBookingsView.tsx`, `ui/IndexBackRow.tsx`, `screens.css`, and `ui/domain/IndexTile.tsx`'s header if the documents screen picks up the same merged-header shape) is tracked in `docs/backlog.md`, not done by this ADR.
- `docs/design/design-language.md`'s semantic color budget is unchanged in substance — this ADR only wires an already-decided per-mode accent rule (ADR-0028) to one more screen; it does not introduce a new hue or relax the amber/teal/violet reservations.
- The documents screen (`IndexDocumentsView.tsx`) is expected to adopt the same merged `idx-head` back row once ported, for the back-arrow-direction consistency Assaf asked for, but carries no chip/search row itself (unchanged, ADR-0098 §2) and is otherwise untouched by this ADR.
- No backend or `@waypoint/shared` change — presentation and local view/animation state only, same as ADR-0098.

## Alternatives considered

- **Keep the search bar replacing the title row** (the ADR-0098-build/interim-branch shape) instead of covering the chip row. Rejected once the denser combined chip+search row was adopted — displacing the title row also hides the booking count, which the compact header keeps visible at all times per point 1.
- **A fixed-right search icon** — Assaf's first phrasing, corrected immediately to fixed-left; kept only as a note in case a future RTL-affordance review revisits it.
- **Hard-clip the trailing chip instead of fading it** (rely on `scroll-snap` alone) — tried first; screenshots after adding `scroll-snap` still showed a hard-cut chip at both the initial and scrolled-to-end positions, since snap only ever guarantees the leading edge. The mask-image fade was added specifically because snap alone didn't resolve Assaf's "partially covered … already when you enter" report.
- **Per-category chip tinting** (colored category icons, from the reference screenshot) — explicitly deferred per Assaf's own framing ("colored icons can be deferred for now"), not decided here.
