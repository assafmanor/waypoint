# 0011 — Hard/soft event model as the core primitive

**Status:** Accepted
**Date:** 2026-07-09 (core insight from original planning)

## Context
There's tension between wanting clear structure ("visibility") and wanting to change plans freely ("flexibility"). We need one model that serves both.

## Decision
Every timeline event is typed **hard 🔒** or **soft**. Hard = a real commitment (flight, reservation code, timed ticket): warned on edit, never auto-moved, excluded from ripple, rendered with code + lock. Soft = intention only: freely dragged, skipped, swapped, included in ripple, rendered dashed. `Event.kind` drives both behavior and rendering.

## Consequences
- Hard anchors give "Now/Next" its structure; soft plans flow around them.
- Sharply reduces the conflict surface (only soft events churn) — see ADR-0012.
- Every event-touching feature must respect the hard/soft distinction.

## Alternatives considered
- **All events equal:** rejected — either too rigid or too chaotic; loses the anchors that make Now/Next meaningful.
