# Session 09 — Builder drag-reorder + shelf tombstone fix (2026-07-14)

**Outcome:** Shipped real drag-to-reorder in the Plan builder and fixed a maybe-shelf dead-end. No new ADR (implements ADR-0011 / ADR-0027). Branch restarted from `main` after #70 merged.

## Bug fixed: the "שובץ" tombstone

Scheduling a shelf idea sets `consumed = true` and the shelf kept rendering it as a **disabled "שובץ" card with no ✕** — so a scheduled idea was stuck with nothing you could do. ADR-0027 says a scheduled idea should **leave** the shelf. Fix: both shelves (Plan `PlanDay`, Trip `DayView`) now filter out consumed items, and `MaybeCard` no longer carries a consumed/tombstone state.

## Drag-to-reorder

Confirmed model (my recommendation; the picker prompt kept failing to register): **"slots stay, events swap in; hard events pinned."**

- `lib/reorder.ts` `planReorder(dayEvents, movedId, targetId)` — pure, tested. The day's **soft** events hold a set of time slots; moving one reassigns which soft event holds which slot, keeping the list time-ordered. **Hard events are never moved or referenced** (pinned anchors, ADR-0011).
- `REORDER` reducer action generalized to N patches (one atomic dispatch → single undo snapshot). `verbs.reorder(dayEvents, movedId, targetId)` computes patches via `planReorder`, applies optimistically, persists one `updateEvent` per moved soft event, reconciles/rolls-back. No hard-edit gate needed (only soft events move). Replaced the old two-arg `slotSwap`/`applyGuardedReorder`.
- UI: soft rows get a **drag grip** (`touch-action: none`, pointer-capture; the row under the pointer via `data-bld-id` is the drop target) **plus** ▲/▼ as the keyboard/a11y fallback (now soft-neighbour-scoped). **Hard rows show a static anchor glyph**, no reorder controls.

## Deferred (tracked)

- **Gap chip picks from the shelf** (#21).
- **Tablet two-column builder** (#18) — needs the shell to widen past its 430px cap.
- **Skip parks a soft event back to the shelf** (#23, ADR-0027).
- **Live cross-client sync** of shelf add/remove — reducer remote-change handler is still event-only.

## Verified

- `pnpm typecheck` (frontend) green; `build` + `lint` green; **150** frontend unit tests pass (new `planReorder` suite + updated `applyReorder`).
- **Not exercised in a browser** — the drag _gesture_ (pointer capture + `elementFromPoint` hit-testing) has no unit coverage and no live run here (the app needs the full backend/Postgres/OAuth stack); the reorder _logic_ it calls is pure and tested. Worth a manual pass when the stack is up.
