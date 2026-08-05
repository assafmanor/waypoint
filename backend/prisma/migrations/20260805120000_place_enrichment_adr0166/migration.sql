-- ADR-0166: the global place-enrichment store.
--
-- Additive and standalone: no `tripId`, no FK to `Place`, and `Place` itself is not
-- touched (§1) — every trip that references the same real-world place reads one row here,
-- while the trip's own opinion of it (`icon`, `category`, a renamed `name`) stays where it
-- is. Nothing to backfill: a place with no row has simply not been looked up yet, which is
-- distinct from a row whose fields say we looked and found nothing (§6.4).
CREATE TABLE "PlaceEnrichment" (
    "id" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "wikidataQid" TEXT,
    "osmRef" TEXT,
    "fields" JSONB NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceEnrichment_pkey" PRIMARY KEY ("id")
);

-- The alias columns are the only things queried, and each is unique so one real-world
-- place can never accumulate two rows once an alias is settled. Nullable, so rows that
-- have not settled a given alias yet coexist freely (Postgres treats NULLs as distinct).
CREATE UNIQUE INDEX "PlaceEnrichment_googlePlaceId_key" ON "PlaceEnrichment"("googlePlaceId");
CREATE UNIQUE INDEX "PlaceEnrichment_wikidataQid_key" ON "PlaceEnrichment"("wikidataQid");
CREATE UNIQUE INDEX "PlaceEnrichment_osmRef_key" ON "PlaceEnrichment"("osmRef");
