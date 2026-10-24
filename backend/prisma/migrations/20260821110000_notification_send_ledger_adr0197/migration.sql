-- The send ledger (ADR-0197 §3): what was already sent, and the whole of the epic's
-- exactly-once mechanism.
--
-- It records the PAST, which is the half that cannot go stale. That is the deliberate
-- alternative to a queue of future jobs: a queue would be a second copy of a schedule
-- Postgres already holds (`Task.dueAt`, `Event.startsAt`, the ADR-0184 window bounds), and
-- every edit path would have to keep the copy honest — including the cascades that write no
-- `Change` rows and an outbox replaying hours late.
--
-- **The unique index IS the mechanism.** The sweep inserts the row and sends inside one
-- transaction, so a unique violation means another tick — or another backend instance —
-- already has this send. No leader election, no advisory lock, no single-process assumption.
--
-- `fireKey` is the instant the send was aimed at, bucketed to the minute, and dedup on
-- (whom, what, which instant) is what makes edits behave: a deadline moved to a new time is
-- a new key and re-arms, while an edited title is the same key and does not re-send.
--
-- Arrives empty and is read by nothing until a kind is registered (phase 4). The sweep that
-- writes it ships in this same phase and registers no kinds, so the tick runs and sends
-- nothing — a state that is testable and cannot notify anyone by accident.
CREATE TABLE "NotificationSend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fireKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSend_userId_kind_subjectId_fireKey_key" ON "NotificationSend"("userId", "kind", "subjectId", "fireKey");

-- CreateIndex — also what enforces ADR-0198 §5's per-day cap (a count of recent rows).
CREATE INDEX "NotificationSend_userId_sentAt_idx" ON "NotificationSend"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "NotificationSend" ADD CONSTRAINT "NotificationSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
