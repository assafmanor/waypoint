-- The per-leg travel-mode override (ADR-0206 §V1.6 as amended by §Z2; keyed per §AM).
--
-- No `defaultTravelMode` column anywhere: the default is DERIVED (`derivedTravelMode`) and §Z2
-- forbids storing it. This table is the only persisted half.
--
-- The unique constraint is what makes ONE row serve the pair in both directions — the ids are
-- canonicalised (sorted) by `travelOverridePair` in `@waypoint/shared` before they ever reach
-- here (§AM2). Both place FKs cascade, because the row's whole meaning is the pair (§AM4).

-- CreateTable
CREATE TABLE "TravelModeOverride" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromPlaceId" TEXT NOT NULL,
    "toPlaceId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelModeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelModeOverride_tripId_idx" ON "TravelModeOverride"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelModeOverride_tripId_fromPlaceId_toPlaceId_key" ON "TravelModeOverride"("tripId", "fromPlaceId", "toPlaceId");

-- AddForeignKey
ALTER TABLE "TravelModeOverride" ADD CONSTRAINT "TravelModeOverride_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelModeOverride" ADD CONSTRAINT "TravelModeOverride_fromPlaceId_fkey" FOREIGN KEY ("fromPlaceId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelModeOverride" ADD CONSTRAINT "TravelModeOverride_toPlaceId_fkey" FOREIGN KEY ("toPlaceId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
