-- ADR-0113: the trip destination is a picked place that sets the primary timezone.
-- Structured destination fields from the creation Places pick, all nullable (a
-- trip created before ADR-0113 has none); `destination` stays the display string.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "destinationGooglePlaceId" TEXT,
ADD COLUMN     "destinationLat" DOUBLE PRECISION,
ADD COLUMN     "destinationLng" DOUBLE PRECISION,
ADD COLUMN     "destinationCountryCode" TEXT;
