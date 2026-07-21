# Session 62 — Index bookings header/search redesign: port ADR-0100 into the real app

**Date:** 2026-07-21
**Branch:** `claude/index-bookings-header-redesign-i0ic6z`
**ADR:** [0100](../decisions/0100-index-bookings-header-search-redesign.md)

## What this session did

Ported `mockups/index-bookings-compact-v2.html` (ADR-0100, Accepted since session 61) into
`ui/IndexBookingsView.tsx`, `ui/IndexBackRow.tsx`, `ui/IndexDocumentsView.tsx`,
`ui/DocumentsSection.tsx`, and `screens.css` — replacing the interim
search-bar-replaces-title-row shape shipped earlier to `IndexBookingsView.tsx` (ADR-0098
follow-up, still current on `main` going into this session).

### 1. Merged back+title+count header row (ADR-0100 §1)

`IndexBackRow.tsx` now renders one `idx-head` row — `idx-head-start` (back icon button +
"אינדקס" label) at one end, an optional `end` slot at the other — instead of the old
`back-row` plus a separate `sec-title`. Both dedicated screens pass their own trailing fact
into `end`: `IndexBookingsView` a booking-count pill, `IndexDocumentsView` the encrypted
badge. The back arrow was already the real `NavArrow variant="back"` (`scaleX(-1)` on a
left-pointing base path) — under `dir="rtl"` that already renders pointing right, so no
change was needed there; confirmed visually (screenshot below).

`IndexDocumentsView`'s own header used to be two pieces — `IndexBackRow` plus
`DocumentsSection`'s internal `.sec-title` ("מסמכים" + the encrypted badge). Per ADR-0100's
Consequences ("adopt the same merged `idx-head` row... for back-arrow-direction
consistency"), and matching the mockup's documents view exactly (no separate "מסמכים"
heading, just the merged row), `DocumentsSection`'s header was removed and its badge moved
into `IndexBackRow`'s `end` slot. `DocumentsSection` is now content-only (addbtn + doc
groups) — this mirrors how the bookings screen's count already lives in the screen-level
component, not the row-rendering one.

### 2. Denser chip+search row with a cover-in-place search overlay (ADR-0100 §2/§3)

`ChoiceGrid` (`ui/primitives/`) gained an optional `count?: number` on `Choice<T>` and, in
`pills` layout only, reorders to label → icon → count (all decorative/aria-hidden except the
label, so the accessible name is unchanged — verified by the existing category-filter test
still passing unmodified). `IndexBookingsView` now computes per-type counts via a new
`countByCategory()` in `lib/index-bookings.ts` (every `BookingType` initialized to 0) and
feeds them into the chip options alongside the existing icon/label.

The chip row (`ChoiceGrid` pills) and the search input now share one `chip-slot` box:
`ChoiceGrid` sits `position: absolute; inset: 0` and fades/shifts out
(`opacity → 0, translateX(-6px) scale(0.98)`) under `.chip-slot.searching`, while
`.search-inline2` grows in from the trailing edge (`scaleX(0.88) → scaleX(1)`,
`transform-origin: left center`) over the same box — a covering animation, not a second row.
The search icon toggle is a fixed 32×32 rounded-square button (`.search-icon-btn`, same
shape family as `.back-icon-btn`) at the row's DOM-last position, which lands at the visual
left end under `dir="rtl"`; tapping it toggles `chip-slot`'s `searching` class and calls
`.focus()` on the (always-mounted) search input directly, matching the mockup's own
`toggleSearch()`. Closing clears the query, same as the interim build; there's no separate
"cancel" text button anymore (`t.index.search.cancel`/`.label` removed from `i18n/he.ts` —
both became unused once the toggle stopped carrying a text label).

### 3. Non-circular SVG search icon (ADR-0100 §4)

Already available — `Icon.tsx`'s `search`/`close` glyphs were added in the ADR-0098
follow-up session and needed no changes. `.search-icon-btn`/`.back-icon-btn` both use
`border-radius: 10px` (rounded-square, not a circle).

### 4. Scroll-snap + mask-image chip-edge fade (ADR-0100 §6)

Added to `ChoiceGrid`'s `pills` layout (`choice-grid.css`) rather than a bespoke
Index-scoped wrapper — it's a primitive fix, not Index-specific, and there's only the one
`pills` consumer today so generalizing it there (rather than duplicating the CSS under
`.index`) keeps the next `pills` consumer getting it for free: `scroll-snap-type: x
mandatory` + `scroll-snap-align: start` on `.choice-pill` (fixes the leading-edge chip
alignment, including on first load), plus a physical `to right` `mask-image` linear-gradient
fading both edges (handles the trailing-edge peek `scroll-snap` structurally can't reach,
since the container width is never an exact multiple of chip widths).

### 5. Mode-tinted Index accent (ADR-0100 §5)

A new `--idx-accent`/`--idx-accent-text` custom-property pair, scoped to `.index` (default
`var(--ink)` / `#fff`) and overridden under `.app[data-mode='plan'] .index` to `var(--plan)`
— the same ancestor-selector pattern the rest of the app's mode-identity CSS already uses
(`App.css`'s `.app[data-mode='plan'] ...` rules), rather than reading `useMode()` inside the
component (which would have required wrapping every test in `ModeProvider` for no
behavioral gain, since the existing chrome-tinting rules already work this way). Wired to:
the selected chip fill (`.choice-pill.on`) and the search-icon `.on` tint — the two
consumers ADR-0100 §5 names explicitly — **and**, matching the mockup's own CSS diff from
the prior (ADR-0098) mockup version, the past-bookings toggle (`.past-toggle`) and the
add-booking button (`.index .addbtn`, overriding the shared `.addbtn`'s unconditional
`--plan-deep`). This is a deliberate faithful port of the mockup (explicitly the task's
"source of truth for exact markup/values") beyond the two literally-named examples in the
ADR's Decision text — flagged here per the task's ask to note deviations; if this reads as
scope creep rather than the same accent extended consistently, worth a quick ADR-0100
amendment note rather than reverting, since reverting would leave `.addbtn`/`.past-toggle`
silently inconsistent with the now-mode-aware chip/search chrome right next to them.

## Verification

- `pnpm --filter @waypoint/frontend typecheck` / `lint` / `test` (599 tests, 63 files) /
  `build` all green; `pnpm format` clean (one auto-format on `lib/index-bookings.ts`,
  applied).
- No test needed updating — `IndexBookingsView.test.tsx`'s aria-label/placeholder-based
  queries (`t.index.backAria`, `t.index.search.button`, `t.index.search.placeholder`,
  category radio names) all still resolve against the new markup unchanged, which also
  incidentally confirms the chip count's `aria-hidden` didn't shift any accessible name.
- Manually driven in a real browser (Playwright against the pinned Chromium build, backend +
  Postgres + Redis running locally with `DEV_AUTH=1` against the seeded demo trip — env
  files gitignored, not committed): confirmed the merged header (back arrow pointing right,
  count pill at the trailing end), the chip row with per-type counts and the mask-image edge
  fade, the search-icon-button opening/closing the covering search overlay (including
  filtering by confirmation code and clearing), the documents screen's matching merged
  header (encrypted badge in place of the count, no duplicate "מסמכים" heading), and the
  Plan-mode accent (chip fill, search icon, add-booking button all switching from ink to
  plan violet) — screenshots taken at each step, matched the mockup.
- Backlog line pruned in the same change; `docs/design/mockups.md`'s
  `index-bookings-compact-v2.html` entry updated from "not yet ported" to shipped.

## Scope / not touched

- Per-category chip color tinting stays deferred (ADR-0100's own Alternatives section) —
  category badges are still neutral paper in both modes.
- The past-bookings collapse behavior, empty/no-match states, and the row motion pass are
  all unchanged from the ADR-0098/interim build — this session touched header/chip/search
  chrome only.
