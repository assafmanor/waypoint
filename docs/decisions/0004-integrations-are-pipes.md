# 0004 — Integrations are pipes, not screens

**Status:** Accepted
**Date:** 2026-07-09 (decided during original planning)

## Context
It's easy to let each integration sprawl into its own feature area, fragmenting the product.

## Decision
No integration gets its own screen. Each **feeds the two existing surfaces** — the Now/Next timeline and the central index — by producing the same `Event`/`Booking` entities the UI already renders.

## Consequences
- A coherent, single-surface product; the trip is the only surface.
- Integration work is framed as "transform external data into our entities," not "build a new tab."
- Litmus test for any new integration: which surface does it feed? If it needs its own screen, it probably doesn't fit.

## Alternatives considered
- **Per-integration screens/tabs:** rejected — fragments the experience, contradicts the "living visibility layer" concept.
