# 0014 — Budget is display-only in v1

**Status:** Accepted
**Date:** 2026-07-09

## Context
"Budget" could mean a simple display (a target vs. spent number) or full shared expense tracking (log expenses, split who-owes-whom). The latter is a large build (Splitwise-class).

## Decision
v1 ships **display-only budget**: a per-day target vs. spent widget (as in the mockup). No expense logging, no settlement. Its prominence is uncertain — it may not be a main feature; we'll see how it's used.

## Consequences
- Minimal build; no financial data model or settlement logic in v1.
- Shared expense tracking remains a v1.1+ "Could" (feature-catalog).
- If it proves valuable, upgrade to real tracking later.

## Alternatives considered
- **Shared expense tracking in v1:** rejected — too big for uncertain value.
