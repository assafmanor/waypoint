-- The forecast store (ADR-0218 §1/§3): `PlaceEnrichment`'s shape with `FxService`'s policy.
--
-- Global and OUTSIDE the change log, for the three reasons ADR-0166 §6 states — no `tripId`,
-- no client writes it, and it is ordered against nothing. The key is a rounded 0.1° coordinate
-- cell (~11km, the distance the day anchor already treats as one place) rather than a
-- `placeId`, because `Place` is trip-scoped by decision and would fetch the same hotel twice.
--
-- No index beyond the primary key: every read is `cell IN (…)`, which the composite PK's
-- leading column already serves.

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "cell" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "symbolCode" TEXT NOT NULL,
    "tempMax" DOUBLE PRECISION NOT NULL,
    "tempMin" DOUBLE PRECISION NOT NULL,
    "precipMm" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastModified" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("cell","date")
);
