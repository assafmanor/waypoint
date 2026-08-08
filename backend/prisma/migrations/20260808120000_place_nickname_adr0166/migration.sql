-- ADR-0166 §18 (field report #23): the short label a human chose for a place.
-- Nullable and additive, exactly like `Place.icon` (ADR-0147) and `Place.category` (ADR-0165)
-- before it: every existing row reads as "nobody said", so the label keeps deriving from the
-- enrichment pipe and the name-stripping fallback, and there is nothing to backfill.
ALTER TABLE "Place" ADD COLUMN "nickname" TEXT;
