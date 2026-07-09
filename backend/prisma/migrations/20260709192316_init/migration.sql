-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('hard', 'soft');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('planned', 'now', 'done', 'skipped');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('manual', 'gmail', 'maybe_shelf', 'integration');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('flight', 'hotel', 'restaurant', 'train', 'activity', 'other');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('manual', 'gmail');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('peer');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('passport', 'insurance', 'visa', 'other');

-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('create', 'update', 'move', 'delete', 'status');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL DEFAULT '#E9A63C',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'peer',
    "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleConnected" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,

    CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "kind" "EventKind" NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "placeId" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'planned',
    "bookingId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "EventSource" NOT NULL DEFAULT 'manual',
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "title" TEXT NOT NULL,
    "confirmationCode" TEXT,
    "provider" TEXT,
    "address" TEXT,
    "placeId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "details" JSONB,
    "source" "BookingSource" NOT NULL DEFAULT 'manual',
    "offlineAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileRef" TEXT NOT NULL,
    "ownerUserId" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaybeItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "meta" TEXT,
    "placeId" TEXT,
    "createdBy" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaybeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Trip_createdBy_idx" ON "Trip"("createdBy");

-- CreateIndex
CREATE INDEX "Membership_tripId_idx" ON "Membership"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tripId_userId_key" ON "Membership"("tripId", "userId");

-- CreateIndex
CREATE INDEX "Day_tripId_idx" ON "Day"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Day_tripId_date_key" ON "Day"("tripId", "date");

-- CreateIndex
CREATE INDEX "Event_tripId_idx" ON "Event"("tripId");

-- CreateIndex
CREATE INDEX "Event_dayId_idx" ON "Event"("dayId");

-- CreateIndex
CREATE INDEX "Booking_tripId_idx" ON "Booking"("tripId");

-- CreateIndex
CREATE INDEX "Document_tripId_idx" ON "Document"("tripId");

-- CreateIndex
CREATE INDEX "MaybeItem_tripId_idx" ON "MaybeItem"("tripId");

-- CreateIndex
CREATE INDEX "Change_tripId_idx" ON "Change"("tripId");

-- CreateIndex
CREATE INDEX "Change_tripId_createdAt_idx" ON "Change"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Day" ADD CONSTRAINT "Day_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaybeItem" ADD CONSTRAINT "MaybeItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaybeItem" ADD CONSTRAINT "MaybeItem_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
