-- ADR-0173 (field report #26): a document attaches to a booking or an event, and it
-- detaches rather than dying with it.
--
-- Purely additive (§8): no document has a host today, so there is no existing data to
-- interpret. The table starts empty and every existing document keeps behaving exactly as
-- it does now — trip-scoped, in the documents list, attached to nothing.

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "eventId" TEXT,
    "bookingId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentAttachment_tripId_idx" ON "DocumentAttachment"("tripId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_documentId_idx" ON "DocumentAttachment"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_eventId_idx" ON "DocumentAttachment"("eventId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_bookingId_idx" ON "DocumentAttachment"("bookingId");

-- CreateIndex
-- Two constraints rather than one over three columns: Postgres treats NULLs as distinct, so
-- each of these binds only the rows where its host is actually set, and between them every
-- row is covered.
CREATE UNIQUE INDEX "DocumentAttachment_documentId_eventId_key" ON "DocumentAttachment"("documentId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAttachment_documentId_bookingId_key" ON "DocumentAttachment"("documentId", "bookingId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- The file is gone, so its pointers are meaningless.
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Deleting the HOST takes the LINK and cannot reach the document — it is a separate row,
-- still owned by the trip. This is the whole argument for the join table.
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
