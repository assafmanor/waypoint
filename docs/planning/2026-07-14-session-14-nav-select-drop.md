# Session 14 — Bottom-nav select drop animation (2026-07-14)

**Outcome:** Follow-up to session 13 (PR #77, merged). The active-tab pill
shipped, but the select motion from the mockup was missing.

## Problem

In `mockups/nav-active-states-v1.html` the active tab's icon + label sit a
little lower than the siblings (the pill added vertical padding to the active
icon only). The shipped version reserves the pill box on **every** icon to
avoid layout shift, so the active tab was flat — no drop, no select animation.

## Fix

`.nav button.on` now gets `transform: translateY(3px)` and `.nav button`
transitions `transform 0.2s ease`. Selecting a tab settles its icon + label
down a few px; the deselected tab rides back up. Using a **transform** (not
padding) keeps the drop reflow-free — the pill box stays reserved on all
icons. The existing global `prefers-reduced-motion` block disables the
transition (the static offset remains, no motion).

Also killed the mobile browser's blue tap-flash
(`-webkit-tap-highlight-color: transparent`) — reported from a device
screenshot where tapping a tab painted a translucent blue box over it.
Applied **app-wide** in the `*` reset (the property is inherited, and every
tappable surface already has its own `:active` / hover / focus-visible
feedback) rather than per-button, so the crude default overlay is gone
everywhere, not just the nav.

Files: `frontend/src/App.css`, `frontend/src/styles/tokens.css`,
`docs/design/design-language.md` (bottom-nav entry).

## Verified

CSS-only change; deps aren't installed here. Rendered the real
`tokens.css` + `App.css` against the actual nav markup in headless Chromium
(Trip + Plan, several active tabs): the active tab's icon/pill and label rest
~3px below the siblings in every case, matching the mockup. Prettier
(`3.9.5 --check`) clean.
