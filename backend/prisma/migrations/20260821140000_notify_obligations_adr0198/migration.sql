-- Phase B of the notifications catalogue (ADR-0198 §2/§6): the trip's own commitments.
--
-- A separate switch from `notifyTasks` because they are different registers — one is what a
-- person wrote down, the other is what the itinerary already committed them to, and somebody
-- may well want the flight and not the chores.
--
-- Default `true` for the same reason `notifyTasks` is: the real opt-in is the device's own
-- permission, and a person who allowed notifications and then found these switched off would
-- be looking at a switch that lied.
ALTER TABLE "User" ADD COLUMN "notifyObligations" BOOLEAN NOT NULL DEFAULT true;
