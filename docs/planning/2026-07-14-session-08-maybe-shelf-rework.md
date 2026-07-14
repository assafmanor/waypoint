# Session 08 — Maybe-shelf rework (2026-07-14)

**Outcome:** Made the Plan-mode maybe shelf actually functional. No new ADR: implements existing design (ADR-0025 Tier 3, ADR-0027 shelf-as-parking-lot). Branch restarted from `main` after #69 merged.

## Problem

The shipped builder shelf only did a one-tap `schedule` that dumped the idea at a hardcoded `17:30–18:30` on the active day (a ponytail placeholder). You couldn't pick a time or day, and there was no way to add or remove ideas — the shelf was seed-only.

## What was decided / built

- **Schedule with a picker.** Tapping a shelf idea now opens `EventForm` prefilled (title/icon/soft, day = active day) so you choose the **day + time + hard/soft**; on save it creates the event (`source: maybe_shelf`) and consumes the idea. `verbs.schedule(m, fields?)` gained an optional fields arg — with fields it's the picker path, without it the Trip-mode one-tap quick-schedule onto today (Tier-1) is preserved.
- **Add & remove ideas** (Tier-3 build-the-shelf). New backend `POST /trips/:id/maybe-items` (create) + `DELETE /trips/:id/maybe-items/:id`, both through `ChangeService` (create is P2002-idempotent like events). `createMaybeItemSchema` already existed in shared but was unwired. Client: `createMaybeItem`/`deleteMaybeItem`, reducer `ADD_MAYBE`/`REMOVE_MAYBE`, `verbs.addMaybe`/`removeMaybe` (optimistic + undo; called online, not via the write outbox — that only carries day-editing verbs). Builder UI: an add-idea input under the shelf and a ✕ on each card. `api-contract.md` corrected (it listed a `/maybe` + `/schedule` shape that was never built).

## Deferred (tracked as todos)

- **Gap chip picks from the shelf** (#21) — gap "＋ שבץ" still opens a blank new-event form; wiring it to choose an existing idea is next.
- **Drag reorder** (#22) — the recommended model is "slots stay, events swap in; hard events pinned as anchors" (the ▲/▼ shipped in #69 is the adjacent-swap case). The reorder-time-model decision was surfaced to the user but not yet confirmed; drag is its own PR.
- **Skip parks a soft event back to the shelf** (#23, ADR-0027) — touches Trip-mode DayView + derived phases.
- **Live cross-client sync of shelf add/remove** — the reducer's remote-change handler is still event-only (as noted in `trip-state.tsx`); other members see shelf adds/removes on next resync, not live. Acceptable at this trip's scale.

## Verified

- `pnpm typecheck` green (4/4). Frontend `build` + `lint` green; **147** frontend unit tests pass (incl. new add/remove-maybe coverage).
- Backend maybe-items specs for create/remove added, mirroring the existing consume tests — **not run here** (no Docker/Postgres in this environment); they run in CI.
