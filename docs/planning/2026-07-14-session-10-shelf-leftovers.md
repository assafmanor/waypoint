# Session 10 — Shelf leftovers: gap-fill-from-shelf + skip-parks-to-shelf (2026-07-14)

**Outcome:** Two of the tracked "build-now" leftovers. No new ADR (implements ADR-0027). Branch restarted from `main` after #71 merged.

## What was built

- **Gap chip picks from the shelf (#21).** The builder's gap "＋ שבץ" chip now opens a chooser (`GapFillSheet`, reusing the neutral `Sheet`): tap an existing shelf idea → it schedules into the gap's exact slot (`verbs.schedule` with the gap's start/end), or "אירוע חדש" → the existing new-event form prefilled to the gap. Previously the chip only opened a blank form.
- **Skip parks a soft event back to the shelf (#23, ADR-0027).** Skipping a soft event set `status = skipped` and it just vanished from the day (transient undo only). Now the day's shelf (Trip-mode `DayView`) also renders the day's skipped soft events as restorable cards — one tap runs `verbs.restore` to bring it back. Makes the shelf the parking lot ADR-0027 describes (ideas + skipped events, together) and makes skip durable/reversible. Scoped to the active day, so no cross-day confusion.

## Not built (held, with reasons)

- **#18 tablet two-column builder** — doable but needs the app shell widened past its 430px phone cap (affects header/nav); left as an optional follow-up.
- **#7 Google-connection status / #8 documents-passport row** — need the trip snapshot to expose per-member connection / expected-docs; backend work.
- **#9 required-booking-missing** — needs a "what this trip requires" model; an ADR-worthy decision.
- **#10 Gmail import + WhatsApp** — v1.1 / "Could" in the feature-catalog; not front-running the roadmap.
- **#11 CTA targets** — "build a day" already lands on the real builder; "add booking" still needs the unbuilt Index-entry screen (T-002).

## Verified

Full CI pipeline run locally against a real seeded Postgres (`typecheck · build · test · lint · format:check`) — all green; **222** tests (150 frontend + 72 backend). UI wiring only (no new pure logic), so no new unit tests.
