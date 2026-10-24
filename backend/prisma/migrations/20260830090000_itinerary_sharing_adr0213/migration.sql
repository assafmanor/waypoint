-- CreateEnum
CREATE TYPE "ShareDetailLevel" AS ENUM ('summary', 'full', 'everything');

-- CreateTable
CREATE TABLE "TripShare" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "detailLevel" "ShareDetailLevel" NOT NULL DEFAULT 'full',
    "includeBookingSecrets" BOOLEAN NOT NULL DEFAULT false,
    "includeNotesAndTasks" BOOLEAN NOT NULL DEFAULT false,
    "includeTravelerIdentity" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TripShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripShareDocument" (
    "shareId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "TripShareDocument_pkey" PRIMARY KEY ("shareId","documentId")
);

-- CreateTable
CREATE TABLE "ItineraryNarrative" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "skillVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItineraryNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripShare_tripId_key" ON "TripShare"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripShare_code_key" ON "TripShare"("code");

-- CreateIndex
CREATE INDEX "TripShareDocument_documentId_idx" ON "TripShareDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryNarrative_shareId_locale_inputHash_skillVersion_key" ON "ItineraryNarrative"("shareId", "locale", "inputHash", "skillVersion");

-- AddForeignKey
ALTER TABLE "TripShare" ADD CONSTRAINT "TripShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShareDocument" ADD CONSTRAINT "TripShareDocument_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "TripShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShareDocument" ADD CONSTRAINT "TripShareDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryNarrative" ADD CONSTRAINT "ItineraryNarrative_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "TripShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
