-- ADR-0147: the glyph a human chose for a place, at the bottom of the icon resolution chain.
-- Nullable and additive: every existing place reads as "nobody chose one" and keeps deriving
-- its glyph from the referencing entity's category, so there is nothing to backfill.
ALTER TABLE "Place" ADD COLUMN "icon" TEXT;
