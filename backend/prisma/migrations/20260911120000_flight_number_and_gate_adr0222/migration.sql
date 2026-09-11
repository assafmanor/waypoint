-- A service's own number, and where you board it (ADR-0222 §1).
--
-- Two nullable columns rather than `details` keys, for two reasons the ADR states:
-- `flightNumber` joins the booking search blob (`searchTerms`, ADR-0102), and putting one
-- half of a matched pair in a column and the other in JSON is a seam a future reader would
-- have to reconstruct a reason for.
--
-- Deliberately NOT flight-shaped in the data: a flight number is a train number is a bus
-- line, and a gate is a platform. One column each, with the per-type WORD living in the
-- client's label `Record` (ADR-0163 §2's shape) and never in the schema.
--
-- Both nullable with no default and no backfill: every existing booking legitimately has
-- neither, and `gate` is unknown at booking time by nature.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "flightNumber" TEXT,
ADD COLUMN     "gate" TEXT;
