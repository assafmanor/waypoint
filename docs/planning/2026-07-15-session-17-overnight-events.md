# Session 17 — Overnight events (2026-07-15)

**Outcome:** Lifted ADR-0036 §5's same-day-only guard so a regular event can end in the small hours of the next day (a night out: `23:00 → 02:00`), while still belonging to its start night. New **ADR-0037**. Same branch, follow-up to sessions 15–16.

## The model

`date` = start night (event shows once, on that day). `endsAt` becomes a next-day instant when the end reads earlier than the start (`resolveEndIso` → `date + 1`). Not a two-day model — the data layer already stored `endsAt` as an instant; the constraints were all UI/derivation.

## Rules (the edge-case guard)

An end at/before the start is read as _next day_ only when the end is ≤ **07:00** (`OVERNIGHT.END_HOUR`) **and** the start is afternoon/evening ≥ **12:00** (`OVERNIGHT.MIN_START_HOUR`). So `23:00→02:00` is a 3h overnight, but `05:00→04:00` (morning start) stays a rejected typo, not a silent 23h span — no magic duration cap needed.

## Transportation is a separate category (recorded decision)

The 7am cutoff can't fit a red-eye flight landing at 09:00 — on purpose. Per the discussion: transportation isn't a regular event (it has origin/destination, terminals, timezone changes) and deserves its own primitive later with its own looser cross-day rules, rather than widening the overnight cutoff for all events. Captured in ADR-0037 §3; the transport primitive itself is unscoped/unscheduled.

## What changed

- **TimePicker** — `endToDuration` accepts a valid overnight span; `clampSameDay` → `clampToLatestEnd` (allows the overnight window for an evening start); presets extend to the cutoff; duration readout + preset rows show a `למחרת` tag.
- **time.ts** — `resolveEndIso` (next-day end) and `crossesMidnight` (display signal).
- **EventForm / DayView ScheduleSheet** — compute `endsAt` via `resolveEndIso`.
- **Day + builder rows** — a small amber `+1` after the end (`crossesMidnight`) so `23:00–02:00` doesn't read backwards.
- **nextSlot** — measures ends as minutes since the day's local midnight, so an overnight end clamps to 23:59 (start-only) instead of looking like a 02:00 slot on this day.
- Docs: ADR-0037, README + INDEX registered, ADR-0036 header marked §5-superseded.

## Deliberately deferred (in ADR-0037 consequences)

- `hardConflicts` only checks same-`date` events → a conflict between a cross-midnight event and a next-day one isn't flagged (rare; warning-only).
- Next morning's day view doesn't list a still-running overnight event (board's `deriveNow` does show it live). Carryover chip considered, deferred.
- `gapBetween` fill isn't midnight-aware (no gap forms after a night's last event in practice).

## Verified

`typecheck · lint · test · build` green; **190** frontend tests (new `endToDuration` overnight cases, `clampToLatestEnd`, `resolveEndIso`, `crossesMidnight`, `nextSlot` overnight clamp). Drove the real app (headless Chromium): created a `מועדון לילה` event via the actual TimePicker — start 23:00, duration readout **"3 שעות · עד 02:00 למחרת"**, saved, and the day row rendered **`23:00–02:00 +1`**.
