-- Manual display-zone override for an event (ADR-0107 §7 / ADR-0110): null trusts
-- the derived zone (place > segment > trip primary); non-null is a user-pinned zone.
ALTER TABLE "Event" ADD COLUMN "displayTimezone" TEXT;
