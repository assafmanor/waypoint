# 0032 — Trip creation is minimal: three inputs, everything else derived or deferred

**Status:** Accepted
**Date:** 2026-07-14
**Builds on:** [0024](0024-app-shell-and-trip-lifecycle.md) (creation flow: one form, no wizard), [0014](0014-budget-display-only-v1.md) (budget is display-only), [0016](0016-plan-trip-modes-one-surface.md) (mode derives from dates)

## Context

ADR-0024 §3 listed the create form's contents as the whole of `createTripSchema`: name, destination, dates, timezone, and optional currency + daily budget. That reads like a settings page, not a beginning. Creating a trip should be a small, fast, even fun moment — the owner's call: **short, interactive, pleasant; not everything must be chosen at creation** (currency and budget explicitly not).

## Decision

**The create form collects exactly three things, in this order:**

1. **Destination** — the trip's identity; typed first because everything else can derive from it.
2. **Dates** — start + end; required because the Plan/Trip mode switch, the day strip, and "day N of M" all derive from them (ADR-0016, ADR-0018).
3. **Name** — **auto-suggested** from destination + year ("יפן ׳26"), editable inline. A suggestion accepted with zero effort, not a required decision.

**Everything else is derived or deferred — with a sensible default, adjustable later in Trip settings:**

- **Timezone** — derived from the destination (schema already defaults); never asked at creation.
- **Currency** — derived from the destination when budget features first show; not asked.
- **Daily budget** — deferred entirely to settings / plan mode (it's display-only anyway, ADR-0014).

**Form behavior:** one screen, no wizard (unchanged from ADR-0024). The screen shows a live **draft-trip preview card** that assembles as you type, rendered in the **soft grammar** (dashed border, hatch — provisional) and turning solid only on create — the hard/soft language applied to the trip itself. On success → land inside the new trip (Plan mode) with the invite prompt (BoardingPass share, link-only per ADR-0030).

**Shell grammar holds (ADR-0024):** creation is a shell surface — indigo/neutral chrome, neutral `--cta`, no amber/teal/violet. The plan-violet drafting chrome appears only after landing inside the trip.

## Consequences

- **No API change.** `createTripSchema` already makes currency/budget optional and defaults timezone — the form simply stops asking.
- `app-shell.md` §3 rewritten to the three-input contents; design reference `mockups/create-trip-v1.html`.
- **Recorded, deferred:** date-less "idea" trips (the lobby mockup shows a trip with "תאריכים פתוחים") would require schema + mode-derivation changes (dates are load-bearing per ADR-0016/0018) — out of scope; dates stay required.
