-- **The route cache** (ADR-0205 §4), the routes epic's one table and its M4 milestone's only
-- schema change.
--
-- Outside the change log, for the three structural reasons `PlaceEnrichment`, `FxRateSet` and
-- `PushSubscription` are: there is no trip to write a change against (no `tripId` — the whole
-- point is that the answer is shared ACROSS trips), there is one writer, and there is no action
-- anyone would undo. Nothing here goes through `ChangeService`.
--
-- Keyed on rounded coordinates and mode rather than on `placeId`: a `Place` is trip-scoped
-- (ADR-0147), so two trips that both save the same place hold two rows and a `placeId` key would
-- cache each trip separately and never hit across them. The key is directional on purpose —
-- one-way streets and turn restrictions make A→B and B→A different answers.
--
-- Additive and empty on arrival, and absence is a designed state throughout: a leg with no row
-- reads as ADR-0206 §D4's crow-flies chip, which is the same thing a person sees when the trip is
-- offline or the pair is out of range. There is no error state to migrate into.
--
-- No foreign key and no cascade, deliberately. This table references nothing and nothing
-- references it: losing every row costs a recomputation, which is exactly what licenses evicting
-- it freely (§4).
CREATE TABLE "RouteLeg" (
    "key" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "fromLat" DOUBLE PRECISION NOT NULL,
    "fromLng" DOUBLE PRECISION NOT NULL,
    "toLat" DOUBLE PRECISION NOT NULL,
    "toLng" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "shapeEncoded" TEXT,
    "shapePrecision" INTEGER,
    "provider" TEXT NOT NULL,
    "tilesetAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteLeg_pkey" PRIMARY KEY ("key")
);

-- The only non-key query this table has: M12's eviction sweep when the provider's tileset rolls
-- (ADR-0205 §Z5). Every read is by primary key.
CREATE INDEX "RouteLeg_tilesetAt_idx" ON "RouteLeg"("tilesetAt");
