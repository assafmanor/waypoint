# Session 13 — Bottom-nav "you are here" active pill (2026-07-14)

**Outcome:** Small UI enhancement. The bottom-nav active tab now reads at a
glance instead of relying on a color-only text shift.

## Problem

The active tab only changed text color (`--muted` → `--indigo`). On a quick
glance — the app's whole job — it was easy to miss which view you were on.

## Options studied

Built `mockups/nav-active-states-v1.html` (four treatments + the color-only
baseline, each in Trip and Plan chrome, tappable): **A pill**, **B top rail**,
**C icon chip**, **D lift + dot**. Chose **A — tinted pill**: reads fastest,
bigger tap target, stays quiet on the paper chrome (one-loud-element rule).

## Implementation

- `--nav-accent` / `--nav-tint` on `.nav`, re-scoped under
  `.app[data-mode='plan']` so the marker **follows mode identity** — chrome
  indigo in Trip, `--plan` violet in Plan. Never amber/teal (ADR-0028 color
  budget).
- New `--indigo-tint` token (light + dark) mirroring `--plan-tint`, so the
  Trip pill has a defined wash. Dark value is brightened; the accent-text
  contrast in dark mode stays part of the deferred dark-mode sweep (dark mode
  is still inert).
- Every `.nav .ic` reserves the pill box (radius + padding); only the active
  one gets the tint, so there's **no layout shift**. Tint fades in
  (`transition: background-color`).

Files: `frontend/src/styles/tokens.css`, `frontend/src/App.css`,
`docs/design/design-language.md` (bottom-nav entry).

## Verified

Deps aren't installed in this environment, and the change is CSS/token-only.
Rendered the **real** `tokens.css` + `App.css` against the actual nav markup
in headless Chromium (both modes, several active tabs): indigo pill in Trip,
violet pill in Plan, bold accent label, no layout shift, inactive icons
aligned. Screenshot confirmed.
