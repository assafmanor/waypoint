# 0014 — Budget is display-only in v1

**Status:** Superseded by its own second amendment (2026-08-08) — the budget is removed from the product. Kept for the history of why, and because [ADR-0045](0045-trip-home-real-data-only.md) cites it.
**Date:** 2026-07-09

## Amendment (2026-08-08) — the budget is removed

The first amendment kept `Trip.dailyBudgetMinor` and `formatMoney` on a "harmless, re-usable" argument. Three weeks on that argument had not paid: the column was written by exactly one settings field and read by nothing, so the only thing it did was ask the trip's admin for a number the product never used. Owner's call: **remove it** — backend, frontend and UI.

Removed: the Prisma column (migration `20260808160000_drop_trip_daily_budget_adr0014`), `dailyBudgetMinor` from `tripSchema`/`createTripSchema`/`updateTripSchema`, the service write + mapper read, the settings read row and form field, the `budget` icon key, the `budgetLabel` string, the `.budget-row` CSS, and the `GLANCE.budget` fixture. The drop is destructive by intent — there is no expense model to migrate the numbers into.

**`Trip.currency` deliberately survives, and is not a leftover.** It shared the budget's row in settings (an unlabelled `<select>` borrowing the budget's label), so removing the budget would have taken currency's only editor with it. It now has its own read row and its own labelled field. The reason is not symmetry but a stated plan: currency is to be derived from the destination, surfaced as a rate card, and given a small converter (backlog, _"Currency becomes a feature"_). `formatMoney` stays for the same reason — that card is the surface the minor-unit trap is waiting for.

What does **not** change: shared expense tracking remains a v1.1+ "Could". Removing a display-only field is not a decision about the larger feature.

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
