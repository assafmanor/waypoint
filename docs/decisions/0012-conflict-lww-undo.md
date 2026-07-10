# 0012 — Conflicts: last-writer-wins + undo for v1

**Status:** Accepted
**Date:** 2026-07-09 (accepted 2026-07-10, T-025)
**Mechanism refined by:** ADR-0019 (row-level, server-authoritative; `Change.seq`; atomic write path).

## Context

Multiple members edit a shared itinerary. Full conflict machinery (CRDTs, OT) is powerful but heavy for ~5 users.

## Decision

For v1: **row-level, server-authoritative last-writer-wins** on soft events (the server stamps `updatedAt`; whichever write commits last wins the row — _not_ field-level, which would need per-field clocks; see ADR-0019), plus **undo everywhere** and a **change-feed** for awareness. Hard events are protected (explicit confirmation, never auto-moved), shrinking the conflict surface. `Change` records (`updated_by`/`updated_at`, before→after) are the substrate for undo and future upgrades.

## Consequences

- Simple, good-enough concurrency for a small trusted group.
- Awareness (change-feed) over locking — no turf wars, everything undoable.
- If LWW causes real pain, specific entities can be upgraded to CRDT-backed fields later; the change log makes that feasible.

## Alternatives considered

- **CRDT/OT now:** rejected for v1 — disproportionate effort for the group size.
- **Pessimistic locking:** rejected — clunky UX for a fluid on-the-ground tool.
