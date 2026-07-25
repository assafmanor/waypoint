-- ADR-0116 §1: an idea's optional target day — pencilled in, not scheduled.
-- Nullable and additive: every existing idea reads as "someday", no backfill.
ALTER TABLE "MaybeItem" ADD COLUMN "targetDate" TEXT;
