-- The zone a task's deadline was TYPED in (ADR-0193's 2026-08-17 amendment, reversing the
-- tasks brief's §10 "nothing is stored per task").
--
-- Nullable with no default and no backfill, deliberately: NULL means "derive it", which is
-- what every existing row already did and still does. So this migration cannot change how a
-- single stored task reads — the behaviour only differs for a task somebody pins a zone on
-- after it ships. Additive, reversible by dropping the column.
ALTER TABLE "Task" ADD COLUMN "displayTimezone" TEXT;
