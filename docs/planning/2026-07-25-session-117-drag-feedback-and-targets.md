# Session 117 — the drag shows where it is, and accepts what it should

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-117 amendment)

Three requests from the owner once the gesture finally worked on a phone (session
116). All three are the same complaint from different angles: the drag was correct
but uninformative, and it refused cards and days it obviously should accept.

## 1. The held card follows the finger

The card used to stay in its slot and only change style, so the drag said "picked
up" and never "…and it is over **here**".

A **clone** moves rather than the card, for a structural reason: the card sits inside
`.shelf`, a horizontally scrolling strip, so translating it in place would clip it at
the strip's edge and drag its own layout slot along. `position: fixed` escapes that.
It is not an ADR-0090 overlay — not a back target, never in the back stack, so no
`Modal`/`useOverlay`.

`lib/useDragGhost.ts` writes the transform straight to the node, not through React
state: it fires on every pointer move, and 60 state updates a second would re-render
the whole builder each time — the exact cost that broke the hold in session 116. It
keeps the grab offset, so the clone appears where the card was instead of snapping
its corner under the finger.

**This reverses session 115's call on the source card, for the reason that session
gave.** It removed the `opacity: 0.55` because a dimmed source is borrowed from
implementations where a ghost follows the finger — and none did, so dimming made the
thing you were holding the faintest thing on screen. One does now, so the source dims
again as the slot the card came out of, keeping its space so drop targets don't
reflow mid-drag.

**One RTL trap**, which cost a debugging round: the clone anchors with the physical
`left: 0`, not the logical `inset-inline-start: 0`. In RTL the logical form resolves
to `right: 0` and anchors to the viewport's right edge, while the transform comes from
`clientX`, which is physical — mixed, the clone sat a viewport-width from the finger.
Found by asking the browser what was under the finger rather than by reasoning.

## 2. A skipped event drags

It renders on the day's shelf group and was the only card there that couldn't be
dragged — the card that most obviously wants to go back onto the day.

The drag now carries a **tagged subject** (idea | skipped event); everything up to the
release is identical, so there is no second drag. Only the write differs:

- **on a gap → restored INTO that gap**: `status: planned` + the new slot in **one
  patch**, so it's one change-feed row and one undo, not "restored" then "moved". A
  plain restore would put it back at its old time and contradict the gesture.
- **a shelf group is not a target for it**: an event has no `targetDate` to re-aim,
  and turning one into an idea is `park` — a different verb with its own affordance.

## 3. An empty day accepts a drop, and asks for a time

Gap chips exist only _between_ events, so a day with nothing on it had no target at
all. While a card is in flight the empty state becomes one — the same "chrome that
exists only while it's useful" move the empty day _group_ already makes.

It knows which day but offers no slot, so the kinds diverge honestly: an **idea** has
no time, so the release opens the schedule sheet and the user picks; a **skipped
event** already owns one and just goes back to it.

## Where the decision lives

One pure table — `lib/shelf-drop.ts`'s `resolveShelfDrop` — with the screen's
`onDrop` reduced to turning each outcome into the verb that already performs it. The
split is for testability: these are data writes, and the drag that produces them
cannot be driven in jsdom at all (no compositor, no `elementFromPoint`). The table
gets exhaustive unit coverage; the gesture gets the e2e.

Rendering also collapsed: all three groups **and** the clone go through one
`shelfCard`, so the clone can't drift from what it clones and the day group and the
pool stop being near-identical copies.

## Harness work this needed

- **The e2e answers `PATCH /trips/:tripId/events/:id`**, not only reads. Without it
  the optimistic update landed, the real request 404'd against the dev server, and
  the app correctly rolled itself back — so a test asserting what a drop _produced_
  was really asserting the rollback.
- **`shelf-drag.spec.ts` is now per-scenario**, because the targets a day offers
  depend on what's on it: a day with a gap, a day with a skipped event, a day with
  nothing.
- **`holdOver()`**, which re-aims at a target until it lights up. Aiming once at a
  position measured before the move is genuinely wrong, not merely flaky: if the
  target sits in an edge band, the finger arriving there starts the auto-scroll,
  which moves the target. Re-measuring converges, since the scroll stops at the end
  of the scroller.

## Testing

`format` / `lint` / `typecheck` / `build` green. **985 unit tests / 92 files** (+14:
the drop table exhaustively, and the ghost's offset arithmetic including a clone that
mounts a frame after the lift). **17 e2e / 3 files**, run through twice
(`--repeat-each=2`, 34/34) — three new: the clone follows the finger while its slot
stays behind, a skipped card drags and comes back into the gap it was dropped on, and
an empty day grows a drop zone and asks for a time.

Backend untouched; its suite still can't run in this sandbox (no Postgres).

**Still wants a real-device pass** (ADR-0017) — Chromium isn't the engine, and how
the lift _feels_ isn't testable.
