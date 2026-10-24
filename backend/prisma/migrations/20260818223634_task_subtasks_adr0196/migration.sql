-- Sub-tasks: a task can hold a checklist of its own (ADR-0196 §1).
--
-- One nullable self-referencing column, no second table. NULL means "a top-level task",
-- which is every task written before this — so no backfill, and this migration cannot change
-- how a single stored task reads. Additive, reversible by dropping the column.
--
-- `ON DELETE CASCADE` so deleting a parent takes its steps with it in one statement. Note
-- what that does NOT do, because the client depends on knowing: a database cascade writes no
-- `Change` rows, so peers holding the trip in memory or in Dexie are told by an applier
-- keyed off the delete instead (`dropTasksForHostChange`, ADR-0152 §2 / ADR-0157 §3).
--
-- Depth is capped at one level and the SERVER enforces it (`TasksService.create` refuses a
-- parent that is itself a step): a self-relation cannot express "not more than one deep",
-- and a cap only the client knows is a cap the offline outbox can replay past.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentTaskId" TEXT;

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
