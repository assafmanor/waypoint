-- ADR-0014's second amendment: the daily budget is removed rather than kept dormant.
-- ADR-0045 had already pulled the only thing that rendered it, so since 2026-07-16 the
-- column was written by one settings field and read by nobody. Destructive by intent —
-- there is no expense model to migrate the numbers into.
--
-- `Trip.currency` is deliberately NOT dropped with it. It is not a leftover of the budget:
-- it is the seed of the planned currency work (derive-from-destination, a rate card, a
-- converter — see backlog "Currency becomes a feature"), so it keeps its column and gains
-- its own settings row here rather than being re-added by a later migration.
ALTER TABLE "Trip" DROP COLUMN "dailyBudgetMinor";
