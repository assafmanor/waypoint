-- ADR-0213 tenth amendment: a share link is keyed by its POLICY, not by its trip.
--
-- A level does not determine a projection — `everything` is a family of 2^3 switch
-- combinations times every subset of the trip's files — so one link per trip cannot serve
-- two audiences. The key becomes (tripId, policyHash).
--
-- NOTHING IS LOST AND NO LIVE URL STOPS RESOLVING: every existing row keeps its `code` and
-- is simply given the hash of the policy it already stores.

-- ── TripShare: add the policy key ───────────────────────────────────────────────────────
ALTER TABLE "TripShare" ADD COLUMN "policyHash" TEXT;

-- Backfill with the SAME canonical string `share-policy.ts` hashes, so a `PUT` repeating an
-- existing policy finds this row instead of minting a second link beside it. `sha256()` is
-- core Postgres (11+), deliberately, so this migration needs no extension.
UPDATE "TripShare" s
SET "policyHash" = encode(
  sha256(
    convert_to(
      s."detailLevel"::text
        || '|' || CASE WHEN s."includeBookingSecrets" THEN '1' ELSE '0' END
        || '|' || CASE WHEN s."includeNotesAndTasks" THEN '1' ELSE '0' END
        || '|' || CASE WHEN s."includeTravelerIdentity" THEN '1' ELSE '0' END
        || '|' || COALESCE(
             (SELECT string_agg(d."documentId", ',' ORDER BY d."documentId")
              FROM "TripShareDocument" d WHERE d."shareId" = s."id"),
             ''
           ),
      'UTF8'
    )
  ),
  'hex'
);

ALTER TABLE "TripShare" ALTER COLUMN "policyHash" SET NOT NULL;

DROP INDEX "TripShare_tripId_key";
CREATE UNIQUE INDEX "TripShare_tripId_policyHash_key" ON "TripShare"("tripId", "policyHash");
CREATE INDEX "TripShare_tripId_idx" ON "TripShare"("tripId");

-- ── ItineraryNarrative: keyed by the trip, not the share ────────────────────────────────
-- The generator's input is Summary-public and level-invariant, so two links on one trip
-- describe the same trip. Per-share keying also started cold after every rotation.
ALTER TABLE "ItineraryNarrative" ADD COLUMN "tripId" TEXT;

UPDATE "ItineraryNarrative" n
SET "tripId" = s."tripId"
FROM "TripShare" s
WHERE s."id" = n."shareId";

-- A narrative whose share is already gone has nothing to attach to and no reader; the
-- deterministic fallback covers its absence, and the next public read regenerates.
DELETE FROM "ItineraryNarrative" WHERE "tripId" IS NULL;

ALTER TABLE "ItineraryNarrative" ALTER COLUMN "tripId" SET NOT NULL;

ALTER TABLE "ItineraryNarrative" DROP CONSTRAINT "ItineraryNarrative_shareId_fkey";
DROP INDEX "ItineraryNarrative_shareId_locale_inputHash_skillVersion_key";
ALTER TABLE "ItineraryNarrative" DROP COLUMN "shareId";

-- `placeName` left the generator's input in the same amendment (§6), so every stored hash
-- describes an input shape that can no longer be produced. Left in place rather than
-- deleted: the rows are unreachable by construction (no matching hash), and the eligibility
-- rule is exactly why this table needs no sweeper.
CREATE UNIQUE INDEX "ItineraryNarrative_tripId_locale_inputHash_skillVersion_key"
  ON "ItineraryNarrative"("tripId", "locale", "inputHash", "skillVersion");

ALTER TABLE "ItineraryNarrative"
  ADD CONSTRAINT "ItineraryNarrative_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
