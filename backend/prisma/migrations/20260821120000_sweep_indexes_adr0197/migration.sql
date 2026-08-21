-- The notification sweep's two indexes (ADR-0197 §3).
--
-- The sweep asks "what is due in this narrow window, across every trip" — one range scan per
-- kind rather than a walk over trips. Every existing index on these tables leads with
-- `tripId`, which a cross-trip query cannot use, so without these the sweep is a full table
-- scan on `Task` and on `Event` every minute, forever.
--
-- Measured reason this shape was chosen over the per-trip loop it replaced: at 1,000 live
-- trips the loop cost ~3,000 sequential queries a tick and passed the 30-second threshold
-- ADR-0197 §3.1 sets; at 5,000 it exceeded the 60-second interval outright. The cost scaled
-- with trips when it should scale with things due — and on a notification sweep almost every
-- tick has nothing to do.
--
-- `status` leads on `Task` because it is the selective half: most rows are settled and can
-- never be due again, so the scan starts from the small end.
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");
