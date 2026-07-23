-- ADR-0108: the Place row is the Google-enrichment cache.
-- Nullable enrichment columns (a Place-lite has none until it's picked) + the
-- dedup-before-spend uniqueness constraint on (tripId, googlePlaceId).

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "userRatingsTotal" INTEGER;

-- CreateIndex
-- Postgres treats NULLs as distinct, so unlimited name-only (googlePlaceId = NULL)
-- rows coexist while any real Google id is unique per trip.
CREATE UNIQUE INDEX "Place_tripId_googlePlaceId_key" ON "Place"("tripId", "googlePlaceId");
