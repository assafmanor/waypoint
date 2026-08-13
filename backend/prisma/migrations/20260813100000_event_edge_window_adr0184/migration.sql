-- ADR-0184: an edge can be a window.
-- A held span's start is already a floor and its end a deadline (ADR-0171 §1), i.e.
-- each is a window with one side open. These two columns close them, so a check-in
-- can read 17:00–21:00 instead of "from 17:00".
--
-- Instants rather than time-of-day, matching startsAt/endsAt: a reception open until
-- 01:00 crosses midnight, and the display-zone derivation (ADR-0107) then applies
-- unchanged. Both nullable and both absent on every existing row — nothing to
-- backfill, because "no window" is exactly what every booking authored so far means.
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "endWindowStart" TIMESTAMP(3),
ADD COLUMN     "startWindowEnd" TIMESTAMP(3);
