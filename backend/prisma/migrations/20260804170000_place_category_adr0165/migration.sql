-- ADR-0165: what a human said a place IS, on the place itself.
-- Nullable and additive, exactly like `Place.icon` before it (ADR-0147): every existing row
-- reads as "nobody said", so the category keeps deriving from the referencing entities and
-- there is nothing to backfill.
ALTER TABLE "Place" ADD COLUMN "category" "EventCategory";
