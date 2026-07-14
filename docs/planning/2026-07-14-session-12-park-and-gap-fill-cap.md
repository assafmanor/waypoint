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

## Declutter: row actions behind one ⋯ button, not a strip of icons

Adding park as a third inline trailing icon (📥 · ✏️ · 🗑️) — on top of the grip + ▲/▼ reorder
cluster — crushed the title on a phone (the fixed-width bits ate ~260–310px of a ~300px row).
The `plan-mode-v1` mockup was always leaner: grip · emoji · title · time · **one** trailing
affordance. So all three actions (**edit · move-to-shelf · delete**) now collapse into a single
⋯ button that opens a bottom **action sheet** — full-width, thumb-sized rows, reusing the same
`Sheet` the gap-fill chooser uses (no popover positioning). Edit stays reachable by tapping the
row body too. Hard events get the same ⋯ (edit · delete), no park. Mockup updated to match (the
`.bld` rows now show ⋯). Restores the mockup's one-affordance density and honors mobile-first
(ADR-0017).

## Verified

Full CI pipeline locally against real Postgres (`typecheck · build · test · lint · format:check`)
— all green; **229** tests (157 frontend incl. new `applyPark` + updated `gaps` cases, 72 backend).
