# Session 16 — Shelf → schedule consistency (2026-07-15)

**Outcome:** Follow-up to session 15 (branch restarted from `main` after #88 squash-merged). Made every "schedule an idea from the shelf" path prefill a time like the builder's add button, gave the Trip-mode shelf a quick time prompt, and fixed a same-day edge bug that end-to-end verification caught.

## 1. Plan-mode shelf tap prefills the next slot

Tapping a shelf idea in the builder opened `EventForm` with empty time fields. Now it seeds `gapFill = nextSlot(...)` first, so it defaults to the next open slot — same as the trailing add button. One-line parity fix in `PlanDay.tsx`.

## 2. Trip-mode shelf: quick time prompt instead of a 17:30 dump

Trip-mode (`DayView`) scheduled a shelf idea with a **one-tap** `verbs.schedule(m)` that dumped it at a hardcoded `DEFAULT_SCHEDULE_SLOT` (17:30). It now opens a minimal bottom sheet (`ScheduleSheet`) — just the `TimePicker`, prefilled to `nextSlot`, and a confirm — then schedules onto the active day. Simple and quick, matching Trip-mode's Tier-1 "one thing" sheets (ADR-0025); the full day/kind/location form stays Plan-mode work. Confirm button uses neutral `--cta`, not plan violet (Trip mode; design-language §semantic color).

Still-open (deliberately deferred, user's call): Trip mode has no **add-idea** or **remove-idea** on the shelf — it's schedule-only, while Plan mode is full CRUD. Left as a conscious tiering choice for now.

## 3. Bug fix: `nextSlot` kept within the same day

Driving the real app surfaced it: when the day's last event ends late (23:15), `nextSlot`'s naive `start + 1h` end (00:15) crossed midnight, and the same-day-only `TimePicker` (ADR-0036) rendered it as a bogus **"23 שעות"** duration. `nextSlot` now clamps the end to 23:59 and drops it entirely (start-only) when the start leaves no room — no midnight spill. Also protects the Plan-mode add button, which shared the helper.

## Verified

`typecheck · lint · test · build` green; **184** frontend tests (incl. 2 new `nextSlot` clamp cases). Drove the real app headless (Chromium): booted Trip mode on fixtures, tapped a shelf idea → quick sheet opened with the time prefilled to 23:15, duration correctly clamped to `44 דק' עד 23:59`, confirmed → event placed on the day (23:15–23:59, soft) and the idea left the shelf, with the optimistic write queued offline.
