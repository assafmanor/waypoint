# Session 07 — Plan-mode Day-by-day (the itinerary builder) (2026-07-14)

**Outcome:** Built the Plan-mode Day-by-day — the **itinerary builder** (`modes.md`; ADR-0025 Tier 3; `mockups/plan-mode-v1.html`). No new ADR: implements already-decided design. Follows Session 06 (prep dashboard); branch restarted from `main` after #67 merged.

## What was decided

- **Builder = structural rows, not quick verbs.** Trip mode follows/adjusts the day (Tier 1 verbs: done/skip/delay…); Plan mode builds it. So a row is: icon · title + hard/soft tag · time · ✎ edit · 🗑 delete. Tapping the row or ✎ opens the edit sheet; there are no on-the-ground verbs here.
- **Reuse `EventForm` for everything editable.** Add and edit both go through it, including the **hard↔soft flip**, retiming, and **moving across days via its date field** (`updateEventSchema` carries `date`/`startsAt`/`endsAt`/`kind`; the `MOVE_CROSSES_DAY`/`MOVE_INTO_PAST` guards only fire on a bare time-nudge, never on an explicit reassignment). Hard-event edits/deletes still route through the ADR-0011 confirm gate (unchanged `verbs.update`/`verbs.remove`).
- **Gap chips are derived** — dead time ≥ 60 min between consecutive events renders a "פער של … · ＋ שבץ" chip that opens the add-event form prefilled to the gap's start/end. No stored gap state.
- **Empty-day markers** on the existing header day-strip (Plan mode only) — dashed pill + red number — rather than a duplicate in-builder day selector.
- **Maybe shelf** → schedule onto the selected day (existing `verbs.schedule`).

## Deferred (tracked as todos)

- **One-tap reorder (drag or up/down).** The mockup's builder rows have a drag grip. Deferred because reorder in a _time-ordered_ list is genuinely decision-worthy: swap times vs. reorder by `sortOrder` (which diverges from the time sort), how to carry `endsAt` on a swap, the reducer's single-op snapshot-undo, and the hard-event gate. Retime + cross-day already cover "arranging" via the edit sheet. Recommended next: up/down buttons swapping adjacent time slots.
- **Tablet two-column layout.** The shell hard-caps `.app` to 430px; a real tablet builder needs the shell to widen at tablet breakpoints (affects header/nav too). `PlanDay` already wraps content in `.builder-main`/`.builder-side`, so it's mostly CSS once the shell widens. Phone-primary shipped now (ADR-0017).
- **Places research panel** — belongs to the Map tab's plan emphasis (Google Places, not built); the builder's side panel is the maybe shelf.

## What landed in the repo

- `frontend/src/screens/PlanDay.tsx` — the builder; routed via `App.tsx` `Screen()` for `days` + Plan mode.
- `frontend/src/ui/EventForm.tsx` — optional `defaults` prop (gap-fill prefill for a new event).
- `frontend/src/App.tsx` — empty-day markers on the day-strip in Plan mode.
- `frontend/src/i18n/he.ts` — `planDay` copy. `screens.css` — builder rows / gap chips / empty state. `App.css` — day-pill empty marker.

## Verified

- `pnpm typecheck` green (4/4); frontend build green; lint clean; **138** unit tests pass.
- Not done: a live browser screenshot — the real builder needs the full backend + Postgres + Google OAuth stack (trip snapshot is server-fetched), not stood up in this session.
