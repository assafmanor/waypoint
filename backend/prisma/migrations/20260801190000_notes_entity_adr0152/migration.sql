-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "url" TEXT,
    "category" "EventCategory",
    "eventId" TEXT,
    "bookingId" TEXT,
    "placeId" TEXT,
    "maybeItemId" TEXT,
    "documentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'member',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_tripId_idx" ON "Note"("tripId");

-- CreateIndex
CREATE INDEX "Note_eventId_idx" ON "Note"("eventId");

-- CreateIndex
CREATE INDEX "Note_bookingId_idx" ON "Note"("bookingId");

-- CreateIndex
CREATE INDEX "Note_placeId_idx" ON "Note"("placeId");

-- CreateIndex
CREATE INDEX "Note_maybeItemId_idx" ON "Note"("maybeItemId");

-- CreateIndex
CREATE INDEX "Note_documentId_idx" ON "Note"("documentId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_maybeItemId_fkey" FOREIGN KEY ("maybeItemId") REFERENCES "MaybeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
