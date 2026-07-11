# 0025 — Trip-mode edit capability tiers & the Plan escape

**Status:** Accepted
**Date:** 2026-07-12
**Refines:** [0016](0016-plan-trip-modes-one-surface.md) (the "editing is never hard-disabled in Trip mode" clause)

## Context

ADR-0016 established that Plan and Trip mode are one surface and that "editing is never hard-disabled in Trip mode — only de-emphasized and guarded." It never defined _which_ edits belong where. In practice this left every edit — from marking one event done to reordering whole days or changing trip dates — equally reachable on a phone on the ground, where a mistap is costly and the width for structural work isn't there. We need an explicit line, without abandoning the single-surface principle.

## Decision

An edit's **tier is decided by its blast radius, not by mode.** Mode decides _how_ you reach a tier.

- **Tier 1 — on-the-ground verbs** (one tap, on the item): Done, Skip, Do-it-now, Delay/Earlier, Swap, Navigate, On-my-way (hard), Schedule-from-shelf onto today, Add a quick soft event for today. Trip mode's primary surface.
- **Tier 2 — single-item structural**: edit one event's details/exact time, flip one event hard↔soft, Delete an event, quick-add a booking, add a hard event, link a booking. In Trip mode these open an **inline bottom sheet** scoped to the one edit, then drop you back ("unlock this one thing"). First-class in Plan mode.
- **Tier 3 — trip-level building**: add/remove days, move/reorder across days, bulk arrange, trip dates/destination/timezone, invites & membership, maybe-shelf research, budget setup. In Trip mode these are **gated** — a tap shows "Switch to Plan to do this" (the existing per-device override, ADR-0016). The point of Plan mode.

Two deliberate distinctions: **Skip (Tier 1, reversible) vs. Delete (Tier 2, destroys)**; **Schedule-from-shelf (Tier 1) vs. build-the-shelf/research (Tier 3)**.

Hard-event edits within any tier still route through the ADR-0011 confirmation gate (T-030), not a new mechanism.

## Consequences

- "Never hard-disabled" (ADR-0016) is refined: Tier 3 is gated in Trip mode, but the gate is a one-tap, discoverable mode switch — not a dead end. Nothing is truly forbidden; the risky/structural work just requires being in the surface built for it.
- The tier map becomes a shared constant driving which verbs DayView shows per mode; screens read it rather than hard-coding affordances.
- Tier-2 reuses the existing event create/edit form (T-047) as its bottom sheet — no duplicate editor.
- Implemented in T-053 (tiers + escape), on top of T-047 (the form) and T-019 (mode).

## Alternatives considered

- **Pure soft-guard (keep ADR-0016 as-is):** rejected — leaves "what's only in Plan mode" a presentation choice, not a decision; structural chaos stays one tap away on the ground.
- **Hardness-based only (ignore mode):** rejected — soft events would still be freely reorderable across whole days on a phone; hard/soft is about ripple safety, not editing surface.
- **Flip the whole app to Plan mode for any structural edit:** rejected as the default for Tier 2 — yanks you off the on-the-ground view for a one-item tweak; the inline sheet is smoother. (Still the right move for Tier 3.)
