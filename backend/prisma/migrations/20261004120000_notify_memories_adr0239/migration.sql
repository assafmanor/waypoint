-- ADR-0239 §8: the anniversary push has its own switch, on by default, so turning off tasks
-- never silences it and turning it off never silences a task.
ALTER TABLE "User" ADD COLUMN "notifyMemories" BOOLEAN NOT NULL DEFAULT true;
