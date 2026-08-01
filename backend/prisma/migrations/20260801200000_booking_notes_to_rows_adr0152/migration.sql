-- Booking.details.notes → Note rows (ADR-0152 §7).
--
-- A one-time data migration, and deliberately not a read-both fallback: two places one
-- note can live is a drift problem, and this ADR's whole premise is one place. It is the
-- same call ADR-0047 made against a WiFi fallback.
--
-- `details.wifi` and `details.room` STAY EXACTLY WHERE THEY ARE. WiFi is a field with one
-- specific reader (Home's quick-access, via `lib/home-quick.ts`), not a note, and moving it
-- would re-open the sync question ADR-0047 §6 already ruled on. This touches the `notes`
-- key and nothing else in the blob.
--
-- Attribution: the booking's own `updatedBy`, which is the closest thing to an author this
-- data has — the blob never recorded who wrote the note. `createdAt` is the booking's, so a
-- migrated note does not sort to the top of a screen ordered by recency as if it were new.
INSERT INTO "Note" ("id", "tripId", "body", "bookingId", "source", "createdBy", "createdAt", "updatedAt", "updatedBy")
SELECT
  gen_random_uuid()::text,
  b."tripId",
  trim(b."details"->>'notes'),
  b."id",
  'member',
  b."updatedBy",
  b."createdAt",
  b."updatedAt",
  b."updatedBy"
FROM "Booking" b
WHERE b."details" ? 'notes'
  AND trim(coalesce(b."details"->>'notes', '')) <> '';

-- Then drop the key, so nothing can read it again and drift.
UPDATE "Booking"
SET "details" = "details" - 'notes'
WHERE "details" ? 'notes';
