# Session 210 — A place can be removed, and the long press finally has two objects

**Date:** 2026-08-02
**Kind:** Owner report → design consultation → build, in one session.
**Outcome:** [ADR-0157](../decisions/0157-a-place-can-be-removed.md), in-place amendments to [0147](../decisions/0147-a-place-is-made-on-the-canvas.md) §1, [0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) §2 and [0153](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md) §8, and the feature built end to end.

## What it was for

The owner's report was two sentences: there is no way in the UI to delete a place, not in Plan mode and not in Trip mode. Then, mid-consultation, two constraints that shaped the answer — the delete has to be reachable **from the map as well as from the list**, and the long press already means something on the canvas, so whatever the gesture is, _"make sure that this doesn't conflict and does only one thing"_.

## What reading the code changed about the request

It was not a missing button. `places.controller.ts` ended at `PATCH` — no delete route, no service method, nothing host-gated or hidden. And `host-delete-confirm.test.tsx` said so in prose, in a comment written the day before: _"a `Place` has no delete path in the app to confirm."_

Two facts then decided most of the design before any of it was written:

- **The schema already knew what a delete meant.** Four FKs `SetNull`, `Note.placeId` `Cascade`. Nothing to decide, only to honour.
- **Neither writes a `Change` row.** That is [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) §2's trap, over three more stores — and the session before this one had just fixed both halves of it for notes. So the shape was known: mirror locally off the one change, name the cost in the confirm, restore it in the undo.

## The two decisions that were the owner's

| Question                         | Options put                                                                       | **Decided**                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Where does the delete live?      | Card trash · long-press shortcut · both                                           | **Both** — the trash for discovery and the keyboard, the long press for speed         |
| A place something references?    | Refuse while referenced · delete + name the cost + full undo · delete, lossy undo | **Delete, name the cost, full undo** (the option the ADR argues for in §1)            |
| What should the long press open? | Action menu at the pin · straight to the delete confirm · select-and-peek         | **The menu** — long press opens options everywhere on a phone; it does not commit one |

The third came back to the owner explicitly, because the first answer ("both") had implied a gesture that deletes, and _"the long press to delete shouldn't delete right away"_ was the right instinct: it is the one gesture a thumb resting over a pin while reading the map will make.

## The conflict, and why it was already a defect

The canvas has **one** recogniser, deliberately — [ADR-0147](../decisions/0147-a-place-is-made-on-the-canvas.md) §1 rejected a second capture-phase pipeline because two of them race for one pointer id and one click swallow, which is worse than duplication. A marker is a DOM overlay **inside** `.map-pane`, so a hold over a pin was already reaching that recogniser and being answered as a hold over blank canvas.

Which means the conflict predates this session: **a long press on a pin dropped a brand-new place on top of the one you were pressing.** Nobody had filed it.

The fix stays inside the one machine. The recogniser latches the press's `target` at `pointerdown` and reports it alongside the point; `MapPane` resolves `data-pin`; the screen branches. The recogniser still does not know what a pin is.

## Two things measured rather than argued

- **Why the trash is in the footer and not beside the pencil.** `.map-rename` is a 16px control carrying its 44px target as an `::after` of `inset: -14px` — a deliberate trade recorded in `map.css`. A second 16px control 8px away would overlap that target by ~20px, and of the two verbs the one you must not mis-hit is the delete. The footer already exists, already holds a 44px primary, and gives the destructive verb its own box.
- **Why one prop covers both surfaces.** The sheet's list row and the canvas place card are the same `renderRow`. `onDelete` lands on both, which is also why the gesture-only pin menu is affordable: the keyboard path was already there.

## Where the undo got interesting

The reducer's `undo` is a one-slot snapshot of `{events, maybeItems}`, and it is **consumed** by `TRIP_ACTION.UNDO`. So a delete that dispatched nothing would leave a stale snapshot in place and the next undo would revert an unrelated action. That forced two reducer actions over one transform: ours snapshots, a peer's must not — a remote place delete taking the snapshot would arm the undo with somebody else's edit.

The other one: places are **not** in that snapshot, and neither are bookings or notes. So the undo re-creates the place through the verb that owns its optimistic state, re-links a booking through the verb that owns its own, and lets the reducer's snapshot cover the two stores it actually holds. Order is load-bearing — the place first, because everything else FK-references it, and offline the outbox is FIFO so "first" means enqueued first.

And one small thing the restore made visible: `createPlaceSchema` had no `rating`, so an undone delete would have returned the place **without its ★** and said nothing. Adding the two fields is not a feature; it is the difference between an undo and an approximation.

## Built

Backend: `PlacesService.remove` + `DELETE /trips/:tripId/places/:placeId`. Shared: two fields on `createPlaceSchema`. Frontend: `deletePlace` in `lib/api.ts`, `OUTBOX_VERB.DELETE_PLACE`, `PLACE_FK`/`placeLinks`/`clearPlaceRefsForChange` in `lib/place-refs.ts`, the cascade registered in both appliers, `indexVerbs.deletePlace`, `applyDeletePlace` + its `reverseRest` case, the row's trash, the pin menu, the confirm, the gesture's press target.

Tests: the cascade derivation and its reference discipline; the undo's four claims (place first, every FK back, notes read at the delete, nothing else touched); both entrances on both day scopes; the confirm's two counts; that a hold on a pin makes **no** place; and the backend's cascade shape asserted against a real Postgres, because that is the fact the client's local rule is built on.
