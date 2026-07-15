-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('transport', 'food', 'lodging', 'sightseeing', 'nature', 'activity', 'shopping', 'services', 'other');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "category" "EventCategory";

-- AlterTable
ALTER TABLE "MaybeItem" ADD COLUMN     "category" "EventCategory";

-- Backfill (ADR-0038): existing booked events derive their canonical category
-- from the linked Booking.type. Unbooked events / maybe-items stay NULL.
UPDATE "Event" AS e
SET "category" = (
  CASE b."type"
    WHEN 'flight' THEN 'transport'
    WHEN 'train' THEN 'transport'
    WHEN 'hotel' THEN 'lodging'
    WHEN 'restaurant' THEN 'food'
    WHEN 'activity' THEN 'activity'
    ELSE 'other'
  END
)::"EventCategory"
FROM "Booking" AS b
WHERE e."bookingId" = b."id";
