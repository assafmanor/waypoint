# Session 39 — Flight form: the route endpoints ARE the title row

**Date:** 2026-07-19
**Branch:** `claude/glance-timeline-layout-guv3ao` (restarted from the merged `main` after #170)
**Touches:** ADR-0059 §3 (the entry-form refinement)

## What prompted it

Session 38 (#170) removed the flight name field and stood a read-only `מוצא ← יעד` **preview** in its place, styled like the title. Assaf: it "looks clickable while it's only read only." Suggested fix — drop the preview line and put origin/destination together on the same line as the icon picker.

## What changed

- **`ui/BookingSheet.tsx`** — for a transport type the title row is now `IconPicker` + **two editable inputs** (`מוצא` / `יעד` placeholders) with the route arrow (`NavArrow`) between them. The read-only `RouteLabel` preview and the separate origin/destination `bs-row2` block below are gone (the endpoints only live in the title row now); the place-picker hint stays under it. `RouteLabel` import → `NavArrow`.
- **`i18n/he.ts`** — `form.routeGhost` removed; `form.originShort` (`מוצא`) + `form.destShort` (`יעד`) added as the input placeholders. Full labels (`originLabel`/`destLabel`) become the inputs' `aria-label`.
- **`screens.css`** — `.bs-route-preview` → `.bs-route-inputs`: a flex row of two `.bs-title`-styled underlined inputs with the muted arrow between.

Derivation, validation, and the stored-title behaviour (`routeTitle`, `routeRequired`) are unchanged from #170 — only the title-row _presentation_ changed from a preview to direct inputs.

## Verification

- `typecheck` + `build` green; **373 tests pass** (unchanged — this is presentation-only over the same derivation).
- Rendered the real `screens.css` against the form DOM (headless Chromium): the flight title row shows the icon + two underlined, editable route inputs (`מוצא`→`יעד`) with the arrow between, empty and filled; a hotel keeps its single name input.

## Git note

#170 squash-merged to `main` while earlier work was in flight; per the merged-PR rule the branch was restarted from the latest `main` and this refinement applied on top — its PR is a new PR.
