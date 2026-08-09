-- The world's exchange rates (ADR-0180 §7): global, server-owned, one row per
-- base currency and in practice one row. Outside the change log for the same
-- structural reasons as PlaceEnrichment (ADR-0166 §6) — no tripId, one writer,
-- never client-mutated.
--
-- Additive and empty on arrival. Absence is a designed state, not a defect: the
-- rate card is absent until a set exists, and the converter says so.
CREATE TABLE "FxRateSet" (
    "base" TEXT NOT NULL,
    "rates" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "nextUpdateAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUrl" TEXT NOT NULL,

    CONSTRAINT "FxRateSet_pkey" PRIMARY KEY ("base")
);
