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

### 6. The orphan sweep (added 2026-08-02, session 211)

The Consequences below shipped with a gap stated rather than closed: a place nothing references has no row and no pin, so this delete cannot reach it and neither can a reader. The owner's call is to sweep them, and the shape has four parts.

**What an orphan is, and what is spared.** No `Event`, `Booking` (any of its three FKs) or `MaybeItem` pointing at it — the definition — and **no notes**. That second exclusion is the one that matters: `Note.placeId` is `onDelete: Cascade`, and a place's notes are not invisible at all (the notes screen lists them under its name, 0153 §8). A sweep that destroyed them would be the one silent loss this whole feature is built to avoid.

**A grace period, and it is doing two jobs at once.** Only rows untouched for longer than `PlacesService.ORPHAN_GRACE_MS` (a week) are eligible.

- The row is a **paid cache**: `resolvePlace` dedups on `(tripId, googlePlaceId)` (0108 §3), so deleting an enriched orphan means the next pick of that place buys Place Details again. That cache is worth most immediately after a pick — pick, cancel, re-pick tomorrow — and about nothing a week later.
- **An undo must still find what it re-links to.** Deleting the last reference orphans a place; undoing that delete puts the reference back. A week is far longer than the one-slot undo can survive.

**Where it runs: on a MINT, and nowhere else.** A create is the only moment the table grows; it is already a write with a transaction and a change stream; and it bounds the work to one trip. This repo has no scheduler, and a GC is not a good enough reason to add one (root rule 8). The consequence is honest and worth stating: **a trip where nobody adds places is never swept** — which is also a trip whose place table is not growing. The sweep is best-effort and can never fail the pick it rides on.

**Every deletion is a `Change`,** like every other data-plane write (0019), so a peer's list and Dexie cache lose the row rather than carrying it to the next snapshot. But it is **not somebody's edit**, and the change feed would otherwise report _"דנה removed <place>"_ against whoever happened to pick a place that minute. So the sweep marks its changes `HOUSEKEEPING_CHANGE` — riding the delete's otherwise-unused `after`, which no applier reads — and `describeChange` skips them. Same ring-pressure argument as 0152's session-206 rule that a note's edits do not narrate.

**The race this accepts, stated:** a peer picking a place in the seconds between your delete and your undo could sweep a place your undo wanted — but only one already orphaned and untouched for a week. It is the same class of race LWW already accepts everywhere, at a fraction of the likelihood.

### 7. Two corrections from the device (session 211)

**The long press was opening two surfaces.** Reported with a screenshot: holding a pin raised its menu **and** the place card behind it. The release's click reaches the marker as **Google's own callback**, so the recogniser's DOM swallow — which already covers the canvas tap for exactly this reason (0148's build log) — could never see it. The pane's `gestureTapRef` is the only channel that can, and the marker's select now consults it, one target over from where the canvas tap already did.

**And the menu's first verb was promising less than it does.** It said `שינוי שם`. What it opens is 0147's form — name, glyph, category, and a note on the way — whose own title has said `שם ופרטים` since it shipped. It is `עריכת המקום` now, in the menu and on the row's pencil, which also pairs it with `מחיקת המקום` beside it.

### 8. The warning names what it is about (added 2026-08-02, session 212)

§5 shipped the consequence line counting **`פריטים`** — gender-free on the reasoning that one sentence had to serve אירועים, הזמנות and רעיונות at once. The owner's report is what that reasoning cost:

> _"I created this place and then immediately tried to delete it. There are no linked entities here."_

There was one, and the line said so — `פריט אחד בטיול יישאר בלי מיקום`. The item was the **shelf idea the add itself had created** (`landPlace`: a place with no reference is cache-only and would not list at all, so every add mints an idea behind it). So the sentence was simultaneously correct, unactionable, and hiding the one fact worth knowing. **A warning you cannot act on is not a warning.**

So the line **names its subjects** — `האירוע "ארוחת ערב" יישאר בלי מיקום` — and falls back to counting by kind past two of them, because a dialog reciting five titles is a report rather than a question. Past the limit the specifics are still on screen: the selected row's way-in block is right behind the dialog, listing every reference with its own label.

The cost of naming is Hebrew agreement, and it is why this is a table rather than a template: אירוע is masculine, הזמנה is feminine, and there is no neutral singular verb for them to share. One subject takes its own verb; several join under the masculine plural, which is what Hebrew does with a mixed list anyway.

### 9. A place's sole shelf idea goes with it

The same report, read one step further — the owner got there first: _"it's probably the maybe that's gonna stay orphaned, right?"_ Yes. Deleting a place you just added left an idea nobody typed sitting on the shelf, now without a location: a ghost of the thing you just removed.

**Exactly one live idea on a place IS that place's intention, so the delete takes it too.** That is [0135](0135-a-place-becomes-an-event-or-a-booking.md) §5's rule read from the other end — scheduling a place consumes its sole idea, for the same reason and with the same `soleIdeaFor` helper. And the other half transfers unchanged: **with two or more, none are touched.** Two ideas on one place are two intentions ("a meal there", "drinks there"), nothing on screen tells them apart, and the screen does not guess.

Three things follow, and each is the reason the alternative was rejected:

- **The confirm says it.** The idea leaves the "survives without a location" list and gets its own clause — `גם הרעיון שעל המדף יימחק` — which names the shelf, because that is the surface the reader has to picture. Nothing is deleted that the dialog did not name.
- **The undo puts it back**, under its own id, pointed at the place again, with its own notes — after the place, since it references it.
- **It is one reducer action.** `DELETE_PLACE` carries the idea's id rather than a second dispatch beside it: two dispatches would take two undo snapshots, and the second would capture a state the first had already changed.

## Consequences

- **The Map tab is the only surface with a place delete, and that is correct** — it is the only surface with a place. Both modes get it, because the tab is one screen.
- **An unreferenced place still cannot be reached by hand, and still cannot be seen.** `buildPlaceUsageIndex` is built from references, so a place nothing points at has no row and no pin (0112, and `landPlace`'s comment says so). It cannot be deleted from the UI for the same reason it cannot be looked at — **§6 is what collects it instead**, a week later, from the server. (Written before §6 existed, it read: _"a sweep is backlogged, not built"_.)
- **`ConfirmDialog`'s `consequence` slot has a second consumer**, and it is now carrying two facts joined by the app's `·` — the shape it was built one release ago to hold one of.
- **The canvas recogniser reports its press target.** `onHold(at, target)` — a small widening with a large payoff: any future "act on what is under the finger" gesture is a branch in `MapPane`, not a second pipeline.
- **A booking that both starts and ends at the deleted place is one link with two fields**, not two links. The undo patches it once; two links would patch it twice and the second would win with half the truth.
- **The consequence line is now three clauses, not two** — what loses its location, what is deleted with the place, and what the note cascade takes — joined by the app's `·`. They make opposite claims, which is exactly why the idea is not folded into the first one.
- **A consumed idea is not swallowed.** `soleIdeaFor` ignores consumed ideas, so an idea that has already become an event keeps its own row and simply loses its location like any other reference.
- **`placeLinks` counts consumed ideas and `placeRefs` does not**, deliberately. A consumed idea is not a way _in_ to anything, so the way-in block ignores it — but it still holds the FK, so Postgres still nulls it, and an undo that skipped it would restore the place with one link quietly missing.

## Alternatives considered

- **Refuse to delete a referenced place.** Rejected in §1. Simple, trivially undoable, and it makes the common case — clearing a place a stale idea holds — impossible without deleting the idea first.
- **Delete and unlink with no restore of the links.** Rejected: it makes the undo lie about what it restored, which is the exact defect 0152 §2's second half was written to undo.
- **Long press deletes (with the confirm as the only guard).** Rejected: the confirm makes it safe but the gesture's whole meaning becomes _delete_, on a press a thumb resting over a pin while reading the map will make.
- **Long press only selects and peeks.** Rejected: that is what a tap already does, so the gesture earns nothing.
- **A trash beside the rename pencil in the title line.** Rejected on the measurement in §2 — two 44px targets 8px apart, one of them destructive.
- **Deleting every idea that points at the place, not just a sole one.** Rejected in §9 on 0135 §5's own reasoning: two ideas on one place are two intentions, and nothing on screen distinguishes them.
- **Leaving the idea and only saying so.** Rejected by the owner after §8 made it visible: the sentence would be honest and the outcome would still be a shelf entry nobody typed, for a place that no longer exists.
- **Offering the choice in the dialog** (delete both / delete only the place, the linked-booking shape). Rejected: it puts a second decision in front of every place delete, including the ones where only one answer makes sense.
- **Naming every subject, however many.** Rejected in §8 — a confirm listing five titles stops being a question.
- **A soft delete / archive for places.** Rejected as scope: nothing else in this app archives, and an invisible tier of hidden places is a second state to explain on a tab whose list is already faceted three ways.
- **A scheduled job for the sweep** (`@nestjs/schedule`). Rejected in §6: a new dependency, a new module and a new failure mode, for a GC that a mint can amortize. Revisit if a trip is ever found growing places without minting them, which is not a shape that exists.
- **Sweeping immediately on dereference** (delete the place when its last reference goes). Rejected: it is the one timing that makes an undo of that same delete fail on a foreign key, and it also throws away the paid cache at the exact moment the cache is most likely to be re-picked.
- **A UI that lists orphans so they can be deleted by hand.** Rejected before the sweep was: it is a second, uglier place list on a tab that already has one, showing rows whose whole defining property is that they mean nothing to the trip.
- **Emit `Change` rows server-side for each `SetNull`ed row.** Rejected: it would make the delete a multi-entity mutation to keep atomic, for a result the client already derives from one change — and 0152 §2 chose the same way for the same reason.
