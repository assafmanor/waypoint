# 0028 — Plan violet, semantic color budget, and dark-mode-ready tokens

**Status:** Accepted
**Date:** 2026-07-12
**Builds on:** [0016](0016-plan-trip-modes-one-surface.md) (Plan/Trip modes, one surface), [0011](0011-hard-soft-event-model.md) (hard/soft grammar)

## Context

A design review of the mockups (lobby, join, settings, plan builder) against the design language found two systemic drifts:

1. **Plan mode had no identity.** It borrowed teal for "planning" and "progress" (readiness bar, settings chrome, builder CTAs, gap chips, booking-type pills), colliding head-on with the rule that **teal = location only**. With ADR-0016 making the two modes one surface, the mode you're in has to be readable from the chrome — and plan mode had no color of its own to do it with.
2. **Semantic colors were leaking into generic UI.** Amber (reserved for "now") was being spent on generic primary buttons ("＋ טיול חדש", "הצטרף לטיול", form submits); teal was being spent on statuses (FX ▲, budget bar) and toggles. Every off-meaning use devalues the color's real meaning everywhere else.

Separately, dark mode had no story at all, and hardcoding a second stylesheet later would be expensive.

## Decision

**1. Plan mode gets its own color and a mode-identity rule.** A new violet family — `--plan #6E59D6`, `--plan-deep #5747B4`, `--plan-tint` — owns everything plan-semantic. Mode identity is "Night vs. Day": trip = dark indigo chrome + amber energy (the night board, may pulse); plan = light drafting chrome + violet (calm, **never** the pulsing blip). Mode is always signaled by at least two channels (chrome + mode pill + texture), never color alone. Teal returns to location-only.

**2. Semantic colors are a budget.** Amber narrows from "now/active" to **time & commitment** (now, countdowns, live blip, the `🔒 קשיח` lock, ripple). Two new families stop the leaks:

- `--cta` / `--cta-text` — a neutral pair for generic primary buttons (the pair flips together in dark mode). Amber on a button is allowed only when the action itself is time-semantic.
- `--ok` / `--miss` — a status mini-palette (FX ▲/▼, budget health, checklist ✓/✗), so statuses stop borrowing teal.

**3. Dark mode is a token remap, not a redesign.** An **inert** `:root[data-theme='dark']` block in `frontend/src/styles/tokens.css` re-maps the same token names (nothing changes until something sets `data-theme="dark"` on `<html>`). Principles: the board keeps the darkest surface so it stays the loudest; ink/paper swap; semantic hues survive brightened; new meanings are never introduced in dark mode.

The full rules, ramps, and the dark remap table live in [design-language.md](../design/design-language.md) (mode identity, functional color coding, scales, dark-mode readiness) — that doc is the current-state source of truth; this ADR records why.

## Consequences

- Applied across the repo: `frontend/src/styles/tokens.css` (new tokens + inert dark block), `frontend/src/screens.css` + `frontend/src/App.css` (status/plan swaps, mode-aware plan styling via `data-mode`), `mockups/plan-mode-v1.html` and `mockups/trip-dashboard-v2.html` (colors retrofitted in place, marked in-file as predating this ADR), and the new `mockups/screens-v1.html` (landing/lobby/join/settings, demonstrating the plan-mode daylight chrome).
- The applied fix list from the review: settings chrome teal → plan drafting chrome; readiness bar teal → `--plan`; lobby/join amber CTAs → `--cta`; pulsing badges on future trips/invites → static; day-strip selection amber in trip mode but `--plan` in plan mode (no day is "now"); ripple "כן" stays amber (time action); toggle "on" teal → `--ink` (or `--plan` inside plan screens); maybe-shelf scheduling teal → `--plan` (scheduling is a plan action even in trip mode) while navigation verbs keep teal.
- **Follow-ups before this is fully realized:** (1) restyle `plan-mode-v1.html`'s chrome to the light drafting table (needs a visual pass — the violet accents are in, the chrome is still indigo); (2) sweep hardcoded hexes (`#fff` hovers, `#FAFBFD`, header blues) into tokens — prerequisite for shipping dark mode; (3) contrast QA pass (amber on dark board: numbers/short labels ≥12px bold only); (4) actually wiring a dark-mode toggle is deliberately out of scope.
