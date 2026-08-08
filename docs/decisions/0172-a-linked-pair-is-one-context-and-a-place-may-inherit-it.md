# 0172 — A linked pair is one **context**, a place may **inherit** one, and none of it is stored

**Status:** Accepted (owner sign-off 2026-08-08)
**Date:** 2026-08-08
**Session note:** [`planning/2026-08-08-session-225-notes-and-documents-share-a-context.md`](../planning/2026-08-08-session-225-notes-and-documents-share-a-context.md)

**Refines:** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §1/§2 — and the first thing to say is what it does **not** do. It does not reverse the single-host row. A note still carries at most one typed host FK, still cascades from it, still migrates nothing. What this ADR adds is a **resolution layer above** that storage, and §1 below is the whole argument for why the reversal everyone expected is not needed.
**Refines:** [0047](0047-booking-event-linkage-and-notes.md) §2 (the merged edit surface, which already treats a linked pair as one thing — this extends that from fields to notes) and §3 (the unlink branch, which now carries notes; §5 below).
**Builds on:** [0048](0048-index-build-data-model-refinements.md) (the place-authority rule §3's counting rule is derived through, and cannot be short-cut), [0093](0093-offline-booking-linked-event-coherence.md) (the server-materialized derived event, which is what **forces** §2's anchor), [0094](0094-one-pluggable-change-applier-registry.md), [0152](0152-a-note-is-one-entity-with-an-optional-host.md), [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md)
**Relates:** [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §6 (a round-trip note goes on the outbound — the same "which of the two rows holds it" question, answered the same way), [0173](0173-a-document-attaches-and-detaches-never-dies.md) (the second consumer of §3's derivation), [0011](0011-hard-soft-event-model.md), [0065](0065-app-scope-many-trips-small-groups.md)

## Context

Field report #24 (`planning/2026-08-08-session-224-incremental-field-reports-addendum.md` §4): a note written on a booking is invisible on the event that booking backs, and vice versa. The owner's four rules, confirmed in the reconciliation and re-confirmed in this session:

1. A directly linked Booking + Event should surface the same logical note.
2. A Place joins that shared context **only when it has exactly one relevant Booking/Event context** — not globally.
3. A Place reused by multiple contexts falls back to the safe behavior: its own notes stay separate.
4. A Place that starts unique and later becomes reused keeps its already-shared notes with the **original** context — they must not leak into the new use.

**Two structural facts decided this ADR, and both were read out of the tree rather than assumed.**

**The relationship is 1:1, so nothing many-to-many was ever being asked for.** ADR-0047 §1 fixes Booking↔Event as strict 1:1 and optional, and ADR-0154 re-affirmed it under pressure ("a round trip stays **two** `Booking`s… that ADR already rejected 1:many `Booking→Event`"). So rule 1 is not a request for a note to have several hosts. It is a request for **two rows that are already one thing to the user** — ADR-0047 §2 gave them one merged edit surface for exactly that reason — to be one thing for notes too.

**The app already does this in one place, deliberately, and flagged that it was a one-off.** `frontend/src/lib/hero-horizon.ts`'s `notesForEvent` reads an event's notes as the union of `eventId`-hosted and `bookingId`-hosted rows, and its comment states the defect in the report's own terms — a booked note lands on the booking because the event is materialized server-side and has no client id, so "asking only for `eventId` finds nothing on exactly the events most likely to carry a note." It then says: _"This diverges from `EventCard`'s mark… That is a real inconsistency and it is the hero's side that is right… Flagged rather than silently fixed on both."_ Root `CLAUDE.md` rule 8 names what to do with that: generalize the existing one-off, don't add a second beside it.

## Decision

### 1. A context is **derived at read time**, not stored — so there is no join table and no migration

A **context** is the set of hosts that surface one another's notes. It is computed over the snapshot the client already holds, on every read, and nothing about it is persisted.

- A **Booking** and the **Event** it backs (`Event.bookingId`) are one context.
- An **unlinked Event** is a context of one. A **Booking with no event** is a context of one.
- A **Place** with exactly one relevant Booking/Event context **inherits** that context (§3) — one-way.
- Every other host (`MaybeItem`, `TripDocument`) is a context of one, unchanged.

**Reads union the context. Writes land on the context's anchor (§2).** That is the entire mechanism.

The alternative everyone reaches for — a `NoteHost` join table — was considered and rejected in "Alternatives", but the short version belongs here because it is why this ADR is three files of frontend derivation instead of a schema change: a join table buys the ability to express a relationship **that the data model already forbids**. `Booking↔Event` is 1:1. There is no note that needs two hosts; there are two rows that need to be read as one. Storage is the wrong layer to fix a reading problem, and paying a migration, a new snapshot entity, a sync channel, a Dexie table and two cascade directions to fix it is the expensive way to be wrong.

**What this buys, stated plainly because it is the reason to prefer it:** zero schema change, zero migration, zero backend change, zero API change, no new entity in `TripSnapshot`, no applier registration, no offline-replay hazard. #24 is a derivation and a write-target rule.

### 2. The anchor is the **Booking**, and this is forced rather than chosen

Every write from anywhere in a context lands on the context's **anchor**: the Booking when the pair is linked, otherwise the single host itself.

This is not a preference between two workable options. ADR-0093 materializes a booking's derived event **server-side from a seed** — so at the moment `BookingSheet` commits, there is no client-held event id to hang a note on. `Booking` ids are client-generated (`crypto.randomUUID()` in `trip-state.createBooking`, ADR-0152 §6b); derived event ids are not. **Event-as-anchor cannot serve the create path at all.** ADR-0154 §6 reached the same conclusion from the round-trip direction and stated the principle without naming it: "a note hangs on the host whose id the **client** holds, which is why a booked event's notes go on the booking."

So the anchor rule is what the code already does on the create path, promoted from an accident of `crypto.randomUUID()` to a rule with a reason.

**Notes may still be spread across both rows of a context, and that is fine.** An event that carried notes before it was booked (ADR-0136), or before this ADR, keeps them on `eventId`. The union reads them; nothing needs re-pointing. §8.

### 3. A Place **inherits** its single context, one-way, and "relevant" is counted through the authority rule

A Place with exactly one relevant Booking/Event context **displays** that context's notes. A note written on the Place surface is stored on that context's **anchor** (§2). A Place's own rows — those written when it had no single context — **never surface on the Booking or the Event**.

**One-way is the load-bearing half, and it is what makes rule 4 free.** The alternative (full membership, so place-hosted rows also show on the booking) leaks in the reverse direction: a place-hosted note that showed on booking A reverts to the place when the place becomes reused, and the place is then reachable from both uses — so context B reads a note written in context A's era. One-way makes leakage structurally impossible in both directions, and it gives Notes the same grammar the owner independently chose for Documents (a place may display, not originate — ADR-0173 §4).

**What counts as a relevant context, precisely.** Three rules, and the first is the one a naive implementation gets wrong:

- **Counted through ADR-0048's place-authority rule, never off raw FKs.** A linked event's `placeId` is not authoritative — its booking's is (`bookingPlaceId`/`eventPlaceId` in `lib/places.ts`). Counting raw FKs makes a hotel booking and the event it backs two references to one hotel, so **no place is ever unique** and the whole feature is dead on arrival. A booking contributes its `placeId` / `fromPlaceId` / `toPlaceId`; only **unlinked** events contribute their own.
- **An idea does not count** (owner's call). A hotel with one booking and three `MaybeItem`s pointing at it still inherits. Ideas are cheap, unscheduled and consumed when scheduled, so letting one suppress sharing means a stray _"maybe we eat here"_ silently hides a restaurant's notes with no visible cause on the surface the reader is looking at.
- **No date scoping — every live reference in the trip counts, regardless of when.** A place used on day 2 and again on day 9 is genuinely two uses and the safe fallback is the right answer. Scoping by date would make a place's notes appear and disappear as the trip advances, and it would put a clock inside a derivation that both packages read — which `packages/shared/CLAUDE.md` forbids for exactly this reason.

A transport booking whose origin and destination are both this place is still **one** context: the unit is the referencing entity, not the FK.

### 4. Rule 4 costs nothing, because the row never moves

The owner's fourth rule — a place that starts unique and later becomes reused keeps its already-shared notes with the original context — needs **no mechanism at all** under §2 and §3. There is nothing to detach, no transition to capture, no second-reference trigger, no live mutation fired by an unrelated write, and nothing for the offline outbox to replay out of order.

The note was written to the anchor the day it was typed. When a second booking starts referencing the place, the place stops resolving to a single context and simply stops displaying it. The row has not moved, so it cannot leak.

**This is the single strongest argument for the whole shape,** and it is worth stating as a general rule: when a requirement says "state X must stay with Y after Z happens", check whether X can just be **stored on Y in the first place**, before building the machinery that moves it there when Z fires.

### 5. Unlink carries the context's notes to the surviving event

ADR-0047 §3's delete prompt offers **delete both** or **unlink-and-keep-Event**. With the booking as anchor, the second branch would run the booking's `onDelete: Cascade` over notes the user is explicitly choosing to keep the other half of — silent data loss on the one branch whose entire promise is that the event survives.

So unlink **moves the context's notes to the event first**. This is a **fourth conversion** in the list ADR-0152 §2's session-206 amendment already built for (idea→event, event→shelf, idea→booking), and it reuses that machinery exactly: `updateNoteSchema`'s host fields, where absent means untouched and a submitted host is scope-checked like a created one; and the FIFO ordering rule, which here means **the move is queued before the booking's delete**, so the note's new host exists before its old one is destroyed. No new mechanism, no new verb.

### 6. A confirm counts what the **cascade destroys**, which is no longer what the surface **displays**

ADR-0152 §2's amendment gave the delete confirms a `consequence` slot naming the count (`3 פתקים יימחקו`). Those two numbers used to be the same number and now are not, so the rule has to be said rather than left to be re-derived:

- **A booking delete, `both`:** takes the booking's notes **and** the event's — the whole context. That is the context count, and it now includes notes authored through a uniquely-referenced place, because those were anchored on the booking (§3). This is the case the old wording under-counted.
- **A booking delete, `unlink`:** takes **nothing** (§5). The line that used to appear on both branches was already flagged in the code as awkward; it is now simply false here, and it goes.
- **A booking delete, no linked event:** own notes = the context. Unchanged.
- **A hard event delete:** takes the event's **own** rows only. Its booking survives and keeps its notes, so counting the context here would overstate what the tap destroys. Unchanged — and under §2 this number is usually **zero**, because a linked event's notes live on its booking.

The general rule: **the confirm states what the write destroys, not what the screen was showing.** Where those diverge, the cascade is the truth.

### 7. The mark counts the context, which closes a divergence the code had already flagged

`EventCard`'s note mark counts `eventId` alone; the lifted hero counts the union. `hero-horizon.ts` names this inconsistency, says the hero is right, and declines to fix the other side because "changing the mark changes what every day row looks like, which is not this phase's call." It is this phase's call. The mark counts the context.

**The visible consequence, stated because ADR-0152 §6c measured the old case and not this one:** rows that never carried a mark now do — every booked event whose booking has notes. §6c's rule 3 (_a row carrying both a code and a mark drops its place name_) therefore fires on more rows than it was measured against. That rule is unchanged and still right; what changes is how often it is reached.

### 8. No migration, and the reason is that a backfill would have no reader

Existing notes hosted on an `eventId` whose event is linked to a booking resolve correctly through §1's union. Re-pointing them to the booking anchor would be a write with no reader, and it would burn the one thing this ADR is buying — that #24 touches no schema and no server.

### 9. What this does NOT do

A note still cannot have two hosts. There is no host picker, and attachment is still established from the host's side (ADR-0152 §2's phase-5b amendment, ADR-0153 §5). A **Place** still cannot be a member of a context, only an inheritor (§3). Deleting the anchor still destroys the context's notes; only unlink is special (§5). Nothing here touches `MaybeItem` or `TripDocument` hosting, and no strategy is registered (ADR-0152 §8 remains reserved).

**Amended same day (session 225, owner's call) — an inherited note SAYS where it came from, and this paragraph is what it reverses.** This section shipped reading "deliberately not built: a visual distinction between a place's own notes and its inherited ones… if the ambiguity turns out to matter on a real device, it is a design change to one component." The mockup the owner asked for before #26 was built ([`notes-and-documents-in-context-v1.html`](../../mockups/notes-and-documents-in-context-v1.html) §2) measured it instead of waiting for the device: the source chip rides the meta line the author and the elapsed time already share, so it costs **2px per note** (111px flush against 115px marked, two notes) and opens no new line.

At that price the deferral was the wrong call, and **the reason is not decorative**. Deleting the anchoring booking destroys these notes, and a booking delete has no undo (§2's amendment). A reader looking at a place card cannot otherwise tell that the note in front of them is hostage to a booking somewhere else — the place is precisely the surface where a note's origin is least guessable, because it is the one host that never authored it. A 2px chip is what makes the Consequences entry below ("a place that gains a second reference silently stops showing inherited notes") legible rather than mysterious.

Still deliberately not built: any distinction on the **Booking/Event** side. There is nothing to mark there — §3 is one-way, so everything those surfaces show is their own.

## Reuse audit (ADR-0096 / root `CLAUDE.md` rule 8)

- **The union itself** — `hero-horizon.ts`'s `notesForEvent` is the existing one-off, and it is **generalized into `lib/host-context.ts` and deleted**, not left beside the new thing. This is the rule-8 case in its textbook form: a single call site doing almost the same job.
- **The place-authority rule** — ADR-0048's, applied rather than re-litigated: a **linked** event contributes no place reference of its own because its booking already does. (`lib/places.ts`'s `bookingPlaceId`/`eventPlaceId` answer "the one place a reference shows", which is a different question from "every place a context touches" — a transport booking touches two — so this counts the FKs directly under that same rule instead of calling them.)
- **The host→FK lookup** — `NOTE_HOST_FIELD` in `@waypoint/shared`, unchanged, so a sixth hostable entity is still one line there.
- **The host-notes surface** — `HostNotes` + `useHostNoteCount` already centralize "a host's notes" for every surface; both resolve a context instead of a host, in one place, so the surfaces don't drift.
- **The conversion machinery** — `updateNoteSchema`'s host fields and the FIFO ordering rule (ADR-0152 §2), for §5's unlink. Not a new verb.
- **Net-new**: `lib/host-context.ts`. Nothing else.

## Consequences

- **No schema migration, no backend change, no API change, no new sync channel.** #24 is a frontend derivation, a write-target rule, and the deletion of one one-off.
- **`hero-horizon.ts` loses its local `notesForEvent`** and its comment's "flagged rather than silently fixed" caveat is discharged.
- **More day rows carry a note mark** (§7), so ADR-0152 §6c's place-name rule fires more often.
- **The booking delete dialog changes shape** (§6): the note consequence moves onto the `both` choice and off the `unlink` branch, where it was about to become false.
- **A note typed on a uniquely-referenced place is destroyed when that booking is deleted.** Accepted, and it is the cost of the anchor rule that makes rule 4 free. The booking delete has no undo (ADR-0152 §2), so this is stated in the confirm rather than recoverable.
- **A place that gains a second reference silently stops showing inherited notes.** No event fires, nothing is logged, and the notes are not gone — they are on the booking. This is rule 4 working, and it is the one behavior a reader is most likely to file as a bug, which is why it is here.
- **ADR-0152's single-host model is reaffirmed, not reversed** — worth stating because the field report reads like a request to reverse it, and a future reader who finds a context layer above a single FK should know that was the decision rather than a compromise.

## Alternatives considered

- **A `NoteHost` join table** (a note gains many explicit hosts). The shape the report seems to ask for, and genuinely more extensible. Rejected (§1): the relationship it would express is one the data model forbids (`Booking↔Event` is 1:1, ADR-0047 §1), so it buys nothing that resolution doesn't, at the cost of a migration, a snapshot entity, a sync channel, a Dexie table, cascade rules in two directions — and, fatally, rule 4 would then need a real detach: link rows to the new use actively withheld or removed at the moment a second reference appears, which is a live mutation triggered by an unrelated write and the exact thing FIFO offline replay handles worst.
- **A host set on the note row** (an array of typed refs). Already rejected by ADR-0152's own Alternatives in its `targetType`/`targetId` form, for reasons unchanged here: orphan cleanup leaves the database, and offline replay can resurrect a note whose host is gone.
- **Event as the context anchor.** Would make §5's unlink a no-op, which is genuinely attractive. Rejected (§2): ADR-0093's derived event has no client-held id at booking-save time, so the create path — the single most common way a booked note is written — cannot target it.
- **A Place as a full member of its single context**, so place-hosted notes surface on the booking too. Closer to a literal reading of rule 3. Rejected (§3): it reintroduces the leak in reverse when the place becomes reused, which is the one thing rule 4 rules out.
- **Counting an idea as a relevant context.** Simpler to explain ("one thing points here"). Rejected (§3): sharing would switch off for a cause invisible on the surface the reader is on, and switch back on when the idea is consumed.
- **Date-scoping the relevance test** (only references on the same day / within the stay count). Rejected (§3): notes would appear and disappear as the trip advances, and it puts a clock in a derivation that must stay clock-free.
- **Backfilling existing `eventId`-hosted notes onto their booking.** Rejected (§8): the union already reads them, so it is a write with no reader — and it would spend the migration this ADR exists to avoid.
