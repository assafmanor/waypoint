# 0014 — Budget is display-only in v1

**Status:** Accepted (amended 2026-07-16 — display pulled from the Trip-mode Home, see [ADR-0045](0045-trip-home-real-data-only.md))
**Date:** 2026-07-09

## Amendment (2026-07-16)

The decision below left the display-only budget's prominence explicitly uncertain ("may not be a main feature; we'll see how it's used"). It resolved as: **not a feature this product manages.** There is no expense model behind it, and the daily-budget glance card on the Trip-mode Home was a fixture. Per [ADR-0045](0045-trip-home-real-data-only.md), the budget card is **removed from the Home**. The `Trip.dailyBudgetMinor` field and `formatMoney` helper stay (harmless, re-usable if real tracking is ever built), but nothing renders them in v1. Shared expense tracking remains a v1.1+ "Could" as originally scoped. The original decision follows, unchanged.

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
