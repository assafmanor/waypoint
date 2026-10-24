-- A device this user can be reached on (ADR-0197 §2), the first table of the
-- notifications epic.
--
-- Control plane, not data plane: no `tripId`, no `Change` row, no broadcast. The same
-- three structural reasons `PlaceEnrichment` and `FxRateSet` sit outside the change log
-- (ADR-0166 §6) — there is no trip to write a change against, there is one writer, and
-- there is no action anyone would undo.
--
-- Keyed on the push service's own `endpoint` rather than a device id of ours: the browser
-- already issues exactly one per (profile, origin, subscription), so a second name for the
-- same thing would let a stale row stay addressable after a key rotation.
--
-- Additive and empty on arrival. Absence is a designed state — a user with no rows simply
-- cannot be reached, which is every user until they grant permission, and no copy anywhere
-- may imply otherwise.
--
-- `ON DELETE CASCADE` from `User`: an account that is gone cannot be notified, and unlike
-- the trip-scoped cascades this one owes no client applier, because nothing about this table
-- is mirrored into memory or Dexie.
--
-- NOT created here: `NotificationSend`, the send ledger. It lands with the sweep that reads
-- it (ADR-0197 §3, phase 3). A new table costs nothing to add later, so there is no reason
-- to ship one nothing writes.
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
