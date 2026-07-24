-- Per-end manual display-zone overrides for a booking (ADR-0107 §6-7, session-99
-- amendment). They follow the same authority rule as the place columns: for
-- transport `start` is the origin's zone and `end` the destination's; for a
-- single-place booking only `start` is used, and it drives both ends. Null trusts
-- the derivation (place > itinerary segment > trip primary), so these are only
-- needed when no place can answer — a coordless Place-lite.
ALTER TABLE "Booking" ADD COLUMN "startDisplayTimezone" TEXT;
ALTER TABLE "Booking" ADD COLUMN "endDisplayTimezone" TEXT;
