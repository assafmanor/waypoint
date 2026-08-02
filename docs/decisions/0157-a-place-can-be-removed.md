# 0157 — A place can be removed, and the delete says what it costs

**Status:** Accepted. **Built 2026-08-02.**
**Date:** 2026-08-02

**Closes** a gap nothing had written down and the code stated out loud: `host-delete-confirm.test.tsx` opened with _"a `Place` has no delete path in the app to confirm"_, and the `places` controller ended at `PATCH`. Every other entity in the trip could be removed from the UI; a place could be created, enriched, renamed and iconed, and never deleted — in Trip mode or in Plan mode.
**Extends** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §2 to its fifth host, and reuses that ADR's whole shape for a second cascade: a rule the database performs silently, mirrored client-side off one change, said out loud before it happens, and put back by the undo.
**Extends** [0147](0147-a-place-is-made-on-the-canvas.md) §1 — the canvas's one gesture recogniser now answers for **what the finger was on**, which is what keeps making a place and acting on one from being two gestures fighting over a pointer.
**Amends** [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §8's _"it has no row menu and no detail surface of its own"_: still true of the row, now false of the pin. See §2.
**Applies unchanged** [0079](0079-one-confirm-dialog.md) (one variant-driven confirm), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) (`RowManageSheet`, and destructive verbs partition rather than recolour), [0019](0019-atomic-writes-and-broadcast.md) (the write is a `ChangeService.mutate`), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) §3 (an errand takes the verbs away).

## Context

A place accumulates. It arrives from a search result, from a long press on the canvas, from a booking form's picker — and once it is in the trip it is permanent. You can rename it; you cannot get rid of it. The owner's report was two sentences: there is no way in the UI to delete a place, not in Plan mode and not in Trip mode.

Three things made this more than a missing button:

- **The `places` module had no delete at all.** Not hidden, not host-gated: absent, end to end.
- **The database already knows what a delete means.** Four FKs (`Event.placeId`, `Booking.placeId`/`fromPlaceId`/`toPlaceId`, `MaybeItem.placeId`) are `onDelete: SetNull`; `Note.placeId` is `onDelete: Cascade`. So an event keeps its slot and loses its location, and the place's own notes go with it — decided in the schema long before there was a way to trigger either.
- **Neither of those writes a `Change` row.** This is exactly the trap 0152 §2 found for notes, now over three more stores. A peer holding the trip in memory or in Dexie hears one delete and must derive the rest, or it renders an event pinned to a place that no longer exists.

## Decision

### 1. Delete is allowed even when the place is referenced

The alternative — refuse while anything points at it — is simpler and was rejected (see Alternatives). A place is a **location registry entry** (0048), not the thing that gives an event its meaning: an event whose place is gone is still a real event on a real day, which is precisely what `SetNull` says. Refusing would mean you cannot clear out a place a stale idea happens to hold without deleting the idea first, on a tab whose whole job is showing you what is in the trip.

What the decision costs is that the delete has to be **said** before it happens and **reversible** after it — §2 and §4.

### 2. Two ways in, one confirm, and the long press finally has two objects

**On a selected row, a trash in the footer.** Selection already reveals this row's verbs — the rename pencil, the way-in block, the schedule action — so the destructive one joins them rather than inventing a surface. It is in the **footer** beside the schedule pill, not beside the pencil, and that is a measurement rather than a preference: the pencil is a 16px control carrying its 44px target as an `::after` inset of −14px, so a second one next to it would overlap that target by ~20px. Of the two verbs, the one you must not hit by accident is this one. Because the row and the canvas place card are one `renderRow`, the trash lands on **both** surfaces from one prop.

**On the canvas, a long press on the pin opens a menu.** A pin has no room for a row of verbs, and the tap is already spoken for (select + frame). Long press is what "act on the thing under my finger" means on a phone — and it opens **options**, it does not commit one. The menu is `RowManageSheet` (0138), a fourth consumer after bookings, documents and members, with `שינוי שם` and a partitioned `מחיקת המקום`. Nothing in it deletes: the destructive item opens the same `ConfirmDialog` the trash does.

**This is where 0153 §8 is amended.** That section said a place has no row menu, because its selected row IS its card. That stays true of the row — there is no kebab in the list. What the pin has is a **gesture-only** menu on a surface where the row cannot be shown. The keyboard path is the trash on the row, which is why the trash is not optional.

**And the two long presses must not collide.** 0147 §1 put every gesture decision in one machine, deliberately: a marker is a DOM overlay inside the same pane, so a second capture-phase pipeline would race the first for one pointer id and one click swallow. So the recogniser does not learn what a pin is. It reports **where the finger was and what element it landed on**; `MapPane` resolves `data-pin`; the screen branches. One press, one meaning, decided by what is underneath.

That also fixes a live defect nobody had filed: before this, a long press **on** a pin dropped a brand-new place on top of the one you were pressing.

### 3. The client mirrors the cascade off the one change it hears

`clearPlaceRefsForChange` in `lib/place-refs.ts` is the twin of `dropNotesForHostChange`, and is registered in the same two places a change is mirrored — the memory channels in `state/trip-state.tsx` and the applier in `lib/cache.ts`. `PLACE_FK` names the four FKs once, so the local cascade, its undo and the confirm's count cannot disagree about what a delete touches.

Two shapes worth stating because they are easy to get wrong:

- **Events and ideas ride the reducer, so they need a reducer action** — and it has to be **two** actions over one transform. Ours (`DELETE_PLACE`) takes the undo snapshot; a peer's (`REMOTE_PLACE_DELETED`) must not, or a remote change would overwrite the snapshot and the next undo would revert somebody else's edit.
- **Our own optimistic delete applies the cascade itself** rather than waiting for the echo, because offline there is no echo coming. `indexVerbs.deletePlace` owns the write, the local cascade over all four stores, and the rollback — one verb, so no call site can do three of the four.

### 4. An undone delete puts everything back

Same rule 0152 §2 arrived at for notes, now over the widest cascade in the app: **restore and warn, not one or the other.** The descriptor captured at the delete is the only surviving record of what the database took — after it, nothing can be read back.

The undo re-creates the place **under its own id, first** (everything else FK-references it; offline the outbox is FIFO, so "first" means enqueued first), then hands back every FK through the writer that owns each store, then writes the notes home.

One consequence reaches the shared schema: `createPlaceSchema` now accepts `rating`/`userRatingsTotal`. Every other field is either user-authored or re-derived server-side (`timezone`, from the coordinates) — these two came from a Place Details call, and without them the undo would silently return a place missing its ★. The client is re-asserting a number our own server cached and handed it, in one trip; that is the whole of the trust involved.

### 5. The confirm names both counts

A `--miss` consequence line, in the `ConfirmDialog` slot 0152 §2 added: how many rows lose their location, and how many notes go. Counted rather than listed and gender-free, because one sentence has to serve אירועים, הזמנות and רעיונות at once — the same call `notes.hostDelete` made. Recomputed when the dialog renders rather than captured at the press, so a peer's edit in the seconds it is open cannot make the sentence a lie.

## Consequences

- **The Map tab is the only surface with a place delete, and that is correct** — it is the only surface with a place. Both modes get it, because the tab is one screen.
- **An unreferenced place still cannot be reached, and still cannot be seen.** `buildPlaceUsageIndex` is built from references, so a place nothing points at has no row and no pin (0112, and `landPlace`'s comment says so). It cannot be deleted for the same reason it cannot be looked at. Deleting the last reference therefore leaves a `Place` row behind — invisible, and re-adopted by the dedup the next time that Google place is picked. A sweep is backlogged, not built.
- **`ConfirmDialog`'s `consequence` slot has a second consumer**, and it is now carrying two facts joined by the app's `·` — the shape it was built one release ago to hold one of.
- **The canvas recogniser reports its press target.** `onHold(at, target)` — a small widening with a large payoff: any future "act on what is under the finger" gesture is a branch in `MapPane`, not a second pipeline.
- **A booking that both starts and ends at the deleted place is one link with two fields**, not two links. The undo patches it once; two links would patch it twice and the second would win with half the truth.
- **`placeLinks` counts consumed ideas and `placeRefs` does not**, deliberately. A consumed idea is not a way _in_ to anything, so the way-in block ignores it — but it still holds the FK, so Postgres still nulls it, and an undo that skipped it would restore the place with one link quietly missing.

## Alternatives considered

- **Refuse to delete a referenced place.** Rejected in §1. Simple, trivially undoable, and it makes the common case — clearing a place a stale idea holds — impossible without deleting the idea first.
- **Delete and unlink with no restore of the links.** Rejected: it makes the undo lie about what it restored, which is the exact defect 0152 §2's second half was written to undo.
- **Long press deletes (with the confirm as the only guard).** Rejected: the confirm makes it safe but the gesture's whole meaning becomes _delete_, on a press a thumb resting over a pin while reading the map will make.
- **Long press only selects and peeks.** Rejected: that is what a tap already does, so the gesture earns nothing.
- **A trash beside the rename pencil in the title line.** Rejected on the measurement in §2 — two 44px targets 8px apart, one of them destructive.
- **A soft delete / archive for places.** Rejected as scope: nothing else in this app archives, and an invisible tier of hidden places is a second state to explain on a tab whose list is already faceted three ways.
- **Emit `Change` rows server-side for each `SetNull`ed row.** Rejected: it would make the delete a multi-entity mutation to keep atomic, for a result the client already derives from one change — and 0152 §2 chose the same way for the same reason.
