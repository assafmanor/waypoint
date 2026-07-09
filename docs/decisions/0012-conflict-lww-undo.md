# 0012 — Conflicts: last-writer-wins + undo for v1

**Status:** Proposed
**Date:** 2026-07-09

## Context
Multiple members edit a shared itinerary. Full conflict machinery (CRDTs, OT) is powerful but heavy for ~5 users.

## Decision
For v1: **field-level last-writer-wins** on soft events, plus **undo everywhere** and a **change-feed** for awareness. Hard events are protected (explicit confirmation, never auto-moved), shrinking the conflict surface. `Change` records (`updated_by`/`updated_at`, before→after) are the substrate for undo and future upgrades.

## Consequences
- Simple, good-enough concurrency for a small trusted group.
- Awareness (change-feed) over locking — no turf wars, everything undoable.
- If LWW causes real pain, specific entities can be upgraded to CRDT-backed fields later; the change log makes that feasible.

## Alternatives considered
- **CRDT/OT now:** rejected for v1 — disproportionate effort for the group size.
- **Pessimistic locking:** rejected — clunky UX for a fluid on-the-ground tool.
