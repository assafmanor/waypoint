# Session 12 — Park events to the shelf + cap the gap-fill block (2026-07-14)

**Outcome:** Two small Plan-mode builder refinements from live use. Branch restarted from `main` after #73.

## Feature: move any soft event to the maybe shelf ("park")

Until now the shelf could only _gain_ items by adding a fresh idea (Tier-3 build) or by
`skip` parking an event that had originally come from the shelf. But a plain soft event
scheduled directly onto a day had no way back to the shelf — you could only delete it.
Users wanted to demote a committed-to-a-time event back into "maybe, not sure when"
without losing it.

**Model:** a soft event → a `MaybeItem` carrying its title/icon/placeId; the event leaves
the day. Surfaced as a 📥 button on soft builder rows (hard events are pinned anchors, so
no park button — consistent with ADR-0011). One atomic `PARK_EVENT` reducer action (remove
event + append idea + single undo snapshot) so the one-slot undo restores both halves in one
step. `applyPark` dispatches optimistically, then creates the idea and deletes the event over
REST; rollback + toast on failure. Undo reverses it (delete the idea, recreate the event).

## Refinement: gap-fill prefills a normal block, not the whole gap

The gap chip's "fill" (שבץ) prefilled a new event spanning the **entire** gap — a 9-hour hole
between two events produced a 9-hour draft, which is never what you want. Now the prefill is a
default **1-hour** block (`GAP_FILL_MINUTES`) anchored at the gap's start, capped at the gap
itself so a 40-minute gap still fills exactly (no overshoot). The user extends from there.

## Verified

Full CI pipeline locally against real Postgres (`typecheck · build · test · lint · format:check`)
— all green; **229** tests (157 frontend incl. new `applyPark` + updated `gaps` cases, 72 backend).
