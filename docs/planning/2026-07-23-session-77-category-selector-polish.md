# Session 77 — category selector polish + maybe-shelf revision

**Date:** 2026-07-23
**Kind:** UI follow-up on the session-76 category selector (PR #236), from use feedback.
**ADRs:** revises the [0038](../decisions/0038-icons-and-canonical-category.md) 2026-07-23 amendment (follow-up recorded there); relates [0109](0109-map-tab-design.md) §11.

## Changes

Two requested tweaks to the `EventForm` category selector + one revision to the maybe shelf.

1. **Bigger category buttons.** The category pills were the compact `.choice-pill` shared with the Index filter chips (ADR-0100). Scoped a size bump to a `.category-pills` wrapper (`--text-secondary` up from `--text-caption`, a bit more padding) so the form selector reads larger without touching the Index chips.
2. **Category above the name + icon row.** In `EventForm` the category `Field` now precedes the title (icon + name) row — it reads naturally first because choosing a category defaults the badge glyph.
3. **Maybe shelf: category selector removed from the day-view quick-add.** A full pills row in the one-line "add idea" jot was awkward, and category isn't a must for a loose idea. The quick-add is back to minimal (icon + name); an idea is created **uncategorized** and gets its category when **scheduled into an event** (EventForm's selector) — the point category matters (it becomes a real pin/timeline item). `IconPicker` stays glyph-only in the shelf. Tagging an idea on the shelf itself (an optional `MaybeCard` affordance) was considered and **deferred**. Recorded as the ADR-0038 follow-up; only `EventForm` carries the explicit selector now.

Reverted the `.add-idea` two-row layout back to a single row and dropped the now-unused `AddIdea` category state/imports + the `addIdeaCategory` string.

## Verification

`pnpm format` + `pnpm typecheck` + `pnpm build` green; frontend suite 650/650. Backend unaffected.
