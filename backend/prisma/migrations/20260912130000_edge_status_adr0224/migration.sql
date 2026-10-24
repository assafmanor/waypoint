-- A transition is settled on its own (ADR-0224 §1).
--
-- A bracketed span surfaces at TWO moments — check-in and check-out, pick-up and return,
-- take-off and landing — and `Event.status` is one column. The app had already spent it on
-- the opening edge without writing that down: `glance.ts` clears a `not-before` row on
-- `status = 'done'` and `hero-booking.ts` tests the same field on its missed-check-in arm.
-- So there was nowhere to record a check-out, and doing it through `status` would have said
-- "we checked in", a day late, moving a number that was already right.
--
-- A SECOND column rather than a rename: `status` keeps meaning exactly what two shipped
-- derivations already read it as, so nothing that reads it has to change. This is the shape
-- `startWindowEnd`/`endWindowStart` (ADR-0184) already established on this same table — one
-- authored fact per edge, stored as a pair, read through one accessor (`edgeStatusOf`).
--
-- Nullable with no backfill and no default: NULL is "nobody has answered" (ADR-0117 §1's
-- third state, and the commonest), which is a different claim from `planned` being a stated
-- answer — and defaulting it would assert something about every stay already in the table.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "endStatus" "EventStatus";
