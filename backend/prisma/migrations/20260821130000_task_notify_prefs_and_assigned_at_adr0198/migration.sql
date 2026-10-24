-- Phase A of the notifications catalogue (ADR-0198 §2/§6).
--
-- Two facts and two indexes. Additive and back-compatible: every existing row gets
-- `notifyTasks = true` (the device's own permission is the real opt-in) and
-- `assignedAt = NULL`, which is deliberately NOT backfilled — an assignment that
-- happened before anyone could be told about it is not news.

-- The one category switch phase A needs. `notifyObligations` and `notifyGroup` are
-- absent on purpose: a column for a phase that may never ship is a preference for a
-- feature that does not exist.
ALTER TABLE "User" ADD COLUMN "notifyTasks" BOOLEAN NOT NULL DEFAULT true;

-- When somebody ELSE put this task on its assignee. Null when self-assigned, on
-- un-assign, and for every row written before this column.
ALTER TABLE "Task" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- `task.assigned`'s window: the last few hours of assignments, across every trip.
-- Mirrors the `(status, dueAt)` index the sweep already uses for deadlines.
CREATE INDEX "Task_status_assignedAt_idx" ON "Task"("status", "assignedAt");
