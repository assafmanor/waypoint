# 0152 — A note is one entity with an optional host, and an external tip is a card until someone keeps it

**Status:** Accepted (owner sign-off 2026-08-01; the strategy contract of §8 is **reserved, not built**)
**Date:** 2026-08-01
**Session note:** [`planning/2026-08-01-session-204-notes-become-one-entity.md`](../planning/2026-08-01-session-204-notes-become-one-entity.md)

**Refines:** [0047](0047-booking-event-linkage-and-notes.md) §5 — which put a booking's notes inside the `Booking.details` JSON blob "no schema migration" — and §6, which moved WiFi off `TripNote` and thereby left that table reader-less, so session 25 retired it entirely. A note comes back as an entity here, and **not for the reason the old one died**: `TripNote` existed to hold WiFi, and WiFi is a field with one reader. **Discharges** [0098](0098-index-landing-and-dedicated-screens.md)'s deferred third content type and the `מחקר` naming debt it explicitly owed to whoever proposed this tile.
**Builds on:** [0151](0151-a-suggestion-has-a-source-and-a-reason.md) (§6's never-persist-until-picked, §5's absent-offline, §7's armed-by-intent, and the registry idiom — §8 below amends its cost axis), [0094](0094-one-pluggable-change-applier-registry.md) (the applier registry a new syncable entity registers into rather than branching), [0095](0095-named-constants-for-string-discriminants.md), [0058](0058-documents-in-the-trip-snapshot.md) (the worked example of a list joining `TripSnapshot` as a first-class reactive entity), [0042](0042-shared-state-is-offline-syncable.md), [0023](0023-zod-first-entities-and-openapi.md)
**Relates:** [0038](0038-icons-and-canonical-category.md) (the canonical `EventCategory` this reuses instead of drawing a taxonomy), [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) / [0121](0121-embedded-map-phase-6-design.md) §6 (the subordinate "not in the trip yet" tier §3 spends), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md), [0149](0149-the-top-bar-is-two-rows.md) (the density budget §6 respects), [0004](0004-integrations-are-pipes.md), [0065](0065-app-scope-many-trips-small-groups.md)

## Context

Notes exist in exactly one place in the shipped app, and it is not a place: `Booking.details.notes`, a key inside a `Json?` blob (ADR-0047 §5), untyped in `@waypoint/shared` — `entities.ts:211` types the whole field as `z.record(z.string(), z.unknown())`. An `Event`, a `MaybeItem`, a `Place` and a `Document` cannot carry a note at all. There is nowhere to write down a general thing the group knows.

Four facts verified against the tree this session rather than recalled:

- **The Hebrew word is already spent.** `i18n/he.ts:485` and `:494` label the booking form's field `הערות`.
- **ADR-0098 already reserved the seat and left the debt.** Its landing was stress-tested at five tiles specifically against "notes, research, media", and `mockups/index-findability-split-v1.html:913` draws a disabled `הערות` tile subtitled `הערות חופשיות לקבוצה`. Its Consequences make the `מחקר` collision — that word already names the Map's shipped place search — the responsibility of whoever proposes the tile. That is this ADR.
- **`TripNote` is not a precedent to restore.** It held WiFi; ADR-0047 §6 moved WiFi onto the hotel booking; session 25 retired the table rather than narrowing it, because nothing read it.
- **The suggestion contract shipped the day before this** (ADR-0151): `{ source, ref, score, reason }`, a registry, a `LOCAL`/`REMOTE` placement split, and §6's rule that an external candidate owns no row until a human picks it. The owner's ask — notes as the foundation for Wikipedia/Google/AI tips — lands directly on it.

The owner's framing was one integrated model rather than five fields: entity notes and general notes in one place, comfortable to add and to read, and a foundation for automatic ones.

## Decision

### 1. A note is one row, and what it is about is a field

One `Note` entity in `schema.prisma` + `@waypoint/shared` (zod-first, ADR-0023):

```
Note { id, tripId, title?, body?, url?, category?, <host FK>?, source, createdBy, createdAt, updatedAt, updatedBy }
```

A note with no host is a **general** note — a tip, a link, something true about the trip. A note with a host is that event's / booking's / place's / idea's / document's note. **Same row, same list, same editor, same sync channel, same offline story.**

The alternative everyone reaches for first — a `notes` text column on each of the five entities — is rejected in §"Alternatives", but the short version belongs here because it is the whole reason this ADR exists: five columns produce five editors and **no unified view**, which is precisely the thing being asked for, and they leave a machine-generated tip nowhere to be a first-class thing later.

### 2. The host is a typed nullable FK, and a host's death is a change the clients must hear

Five nullable FKs (`eventId`, `bookingId`, `placeId`, `maybeItemId`, `documentId`), **at most one set**, each `onDelete: Cascade`. This is the shape `Booking` already uses for its three place references (`placeId`/`fromPlaceId`/`toPlaceId`), so it is the repo's existing idiom for a small closed union, and it buys referential integrity and orphan cleanup from the database rather than from five service methods.

**The non-obvious cost, stated because it is silent and it will bite.** A database cascade deletes rows **without writing `Change` rows**, so a peer holding the trip in memory or in Dexie never hears that a deleted event's notes are gone, and keeps rendering them until the next snapshot. The cascade is therefore the _storage_ guarantee, not the _sync_ one. The sync half is one rule registered in the ADR-0094 appliers — **a `delete` change for a host drops the notes whose host is that id** — registered in both places a change is mirrored (the memory channels in `state/trip-state.tsx` and `CACHE_CHANNELS` in `lib/cache.ts`). One rule, two registrations, no new mechanism, and no per-entity branch.

**Amended (2026-08-02, session 209) — the cascade is now SAID before it happens and UNDONE after it. Neither was true when this section shipped, and the paragraph above is the reason: it got the PEER's view right and left the ACTOR's two halves open.** Both were named at planning time and deferred with a stated reason — the build plan's decision 7 and its G5 — and they are one pass rather than five because doing any one host alone would have made a fourth inconsistency.

**Said: the delete confirm names the count.** `3 פתקים יימחקו`, one gender-free sentence so that three hosts cannot drift into three wordings, on a new `consequence` slot on ADR-0079's one `ConfirmDialog` — never a second prompt. Its own slot rather than more body text because every one of these bodies ends in a question and a count belongs before the question is answered. `--miss`, not the amber of `.bs-hard-note`: this is a destructive consequence, and amber in this app means commitment (rule 4).

Three hosts have such a confirm, and **the count is three rather than five, which "every host's delete confirm" hides:** a **soft event's** delete and an **idea's** removal have no confirm at all and need none — they are one-tap actions with an undo, and the undo now restores what they took; a **place cannot be deleted from this app at all** (no `@Delete` route in `places.controller.ts`, no verb, no surface), so its cascade is unreachable until someone builds one. Recorded rather than left to be re-derived by the next person who counts five FKs and looks for five confirms.

The linked-booking dialog is the one that needed a decision rather than a line: it can delete two hosts. The booking's own notes go on the consequence line (both branches take them); **the linked event's go on the `both` choice only**, because `unlink` keeps the event and therefore keeps its notes, so a line above the choices would be false in the branch beside it.

**Undone: the notes come back.** The sharper half, and the one the delete confirm cannot fix. `verbs.ts` reverses a delete by re-creating the host **with the same id** — and nothing else, so the rows Postgres cascaded away stayed gone, on the one gesture this app uses for every destructive write. The undo now carries their content: the delete captures the host's notes into its undo descriptor (**at the delete, because afterwards there is nowhere left to read them from** — the FK cascade has removed them from the database and this section's own applier rule from memory and from Dexie), and the undo re-creates them **under their original ids**, after the host exists and awaited in order, so the FK resolves online and the FIFO outbox keeps it resolving offline. The original id is also what makes an outbox retry idempotent, since the service already treats a duplicate note id as already-applied.

**The applier subtlety, which is this section's own rule read backwards.** A cascade writes no `Change` rows, so there is no echo for the restore to mirror and no synthetic change to emit (ADR-0093 is for entities the SERVER materializes; this is the client re-writing rows it destroyed). The restore is therefore an **ordinary `createNote`** through `noteVerbs` — which is precisely what puts it through the ADR-0094 registry that the drop rule rides, in both places a change is mirrored, with no second path beside it.

Two costs, stated because both are real and neither is worth buying back. A restored note is a new row under an old id, so **`createdAt`/`createdBy` are stamped at the restore** and an undone delete lifts its notes to the top of the notes screen (ADR-0153 §2 sorts on `createdAt`) — accepted rather than letting a client submit a creation time it could forge. And the undo now **carries content in memory**, proportional to the host's note count, which at this app's scale is a sentence or two.

What is deliberately NOT restored: undoing a **create** — a schedule, a booked save — still takes the notes written during that same save. They were part of the action being undone, so removing them is the undo working, not the bug this amendment fixes.

The accepted cost of typed FKs is a migration when a sixth entity becomes note-bearing. That is the right trade: the union is small, closed, and changes about once a year, while an untyped `targetType`/`targetId` pair moves orphan cleanup into application logic in five delete paths and lets offline replay resurrect a note whose host is gone.

### 3. Two tiers on one surface, and the boundary is who wrote it

- **A kept פתק is a `Note` row.** A member wrote it, or a member **kept** a card. It syncs, it is editable, it is the group's memory, and it is offline-complete.
- **A card is produced at read time by a strategy and is never persisted.** It renders in the subordinate tier the app already owns twice — a Google result is a ring (ADR-0132), the embedded map's ghost pins (ADR-0121 §6) — so this spends the existing grammar rather than drawing a third. A tap **keeps** it: the card becomes a `Note` whose `source` records where it came from.

This is ADR-0151 §6 applied one surface over, and it is the load-bearing rule of this ADR. The moment Wikipedia and an LLM can write rows, the group's own notes drown at machine volume — the exact crowding ADR-0116 and ADR-0151 just spent two sessions undoing on the shelf, and a notes list crowds **faster** than the shelf, because every entity in the trip can contribute to it and the machine never gets bored.

The chosen vocabulary reinforces the boundary rather than fighting it: a card is not a פתק. It becomes one when a human keeps it.

### 4. The word is `פתקים`, and `מחקר` stays where it is

The tile, the screen and the entity read `פתקים` / `פתק` (owner's call over the incumbent `הערות`): it reads as the group's own scribbles rather than a records field, which is what this surface actually is. The booking form's existing `הערות` copy (`i18n/he.ts:485`, `:494`) is renamed with it — one word in one place, and leaving it would put two names on one concept the same week it was unified.

`מחקר` is **not** used here, and ADR-0098's naming debt is discharged by not incurring it: that word keeps naming the Map's place search, and nothing on this surface competes for it.

### 5. No new taxonomy — the category is `EventCategory`, and a link is a field

`Note.category` is the canonical `EventCategory` (ADR-0038): `transport | food | lodging | sightseeing | nature | activity | shopping | services | other`, optional. It already carries an icon per value and it is already the category on `Event` and `MaybeItem`, so the notes screen inherits ADR-0098 §2's filter-chip row with matching glyphs and no new lookup table.

**Custom user-defined categories are rejected for v1, and the reason is a cost rather than a taste.** The app has no open taxonomy anywhere — `EventCategory`, `BookingType` and `DocumentType` are closed enums with per-value `Record` lookups (`frontend/CLAUDE.md`'s constants rule) whose whole value is that the compiler flags a missing case when the enum grows. The first open one costs: no icon, no exhaustiveness, a merge problem the LWW model has no answer for (two members type `אוכל` and `אכל` on different phones and the trip has two categories that mean one thing), and no i18n story. If it still feels necessary after the surface has been lived with, it gets its own ADR, because what is being added is a taxonomy and not a field.

**Amended (2026-08-01, session 205, owner's call) — an inherited category is RESOLVED, not copied, and the same chain covers the glyph.** The owner's instruction for the host forms is that adding a note _"shouldn't have to open a new form … it should be on the way … and everything that could be spared from the user should be"_ — which means a hosted note is written with **no category chosen at all**. So `Note.category` stays `null` and the render resolves `note.category ?? host.category`, through the same `??` chain `chosenIcon` already runs (`frontend/src/constants.ts:313`). Copying the host's value at write time looks identical on day one and goes stale the moment the host is recategorised, which is exactly the "content-enum-as-decoration" mistake `constants.ts` already warns about beside `DEFAULT_STAY_ICON`. **There is no `Note.icon` field**: the same chain gives the glyph for free, and a field of its own would drag an icon picker into the editor — one more input, against the instruction. Adding one later is a column and a link in the chain, not a redesign.

**Amended (2026-08-01, session 206, phase 5c) — the host is immutable to a USER, transferable by a CONVERSION, and (2026-08-02, session 209) re-established by an UNDO.** That last case is §2's amendment and not this one's machinery: a delete has no new host to move a note to, so the undo re-creates the row rather than re-pointing it. This ADR and ADR-0153 §5 both say the host is not editable, and the reason given is that attachment is established from the host's side and v1 has no host picker. That is still true of every surface a person operates. What the wording did not cover is the app converting one entity into another, and all three shipped conversions were losing notes:

- **an idea scheduled into an event** left its notes on the consumed idea — off the shelf, so reachable only from the notes screen, chipped to something the user can no longer see;
- **an event parked back onto the shelf** was worse than stranding: parking DELETES the event, and the five host FKs are `onDelete: Cascade`, so the notes were **destroyed in the database**;
- **an idea booked** left them behind in the same way as scheduling.

So a conversion carries the notes with it, in the write it already performs. `updateNoteSchema` gains the five host FKs, and they are **the one part of that payload that is not whole-content: absent means untouched, not cleared** — an ordinary edit sends none of them and cannot lose a host, a conversion sends the new host and `null` for the old. A submitted host is scope-checked exactly like a created one.

**Ordering is the correctness condition, not a detail.** Offline the outbox is FIFO, so the move is queued **after** the new host exists and **before** the old one is deleted. The same rule mirrored is what makes undo safe: undoing a schedule deletes the event, so the notes ride back to the idea first; un-parking deletes the idea, so the event is re-created first, the notes ride to it, and only then does the idea go. Both were data loss before this.

**"Social media" is not a category — it is a link.** `Note.url` covers a pasted Instagram/TikTok/blog reference with no enum at all, and a URL-only note renders as a link card. It is also the honest hook for later enrichment (resolving a link's title and thumbnail is a remote strategy, §8), which a category never could have been.

### 6. The Index gets a third tile; a row gets a mark, not a body

**On the Index**: a third `IndexTile` on ADR-0098's landing, pushing a dedicated screen exactly as bookings and documents do (the same `useOverlay` sub-view shape, §5 of that ADR, with zero changes to `resolveBack`). No new tab — non-negotiable rule 2, and ADR-0098 measured the landing at five tiles precisely so this would be a tile.

The screen inherits ADR-0098 §2's apparatus **from day one rather than when it crowds**, because a notes list crowds faster than a bookings list: the category chip row, the search control (ADR-0102's multi-field matching over title/body/url), and the shared reveal (ADR-0120) on every control that changes the list. General notes and hosted notes are one list with the host shown on the row; the grouping and default order are a design-session question for the mockup, not a decision this ADR should invent from a fixture.

**On every host surface: a note is a mark on the row, not content in it.** The row shows a small count/glyph; the body lives in the detail surface and the row menu (ADR-0138 — the row menu is one surface).

_Amended 2026-08-01 (session 206, phase 5b), because "the detail surface" turned out to name a different element on each host and one of them cannot hold a body._ **An event's notes went into its `⋯` sheet rather than its expanded card**, for exactly one reason: `.wp-event-actions` animated `max-height: 0 → 220px`, a **fixed** cap, so a section that grows with the note count is clipped at around three notes — and raising the cap changes the reveal's motion for every card on the day (ADR-0140), which looked like a bigger change than the feature.

**Amended again 2026-08-02 (session 206, owner's report), and this one RETRACTS the paragraph above: an event's notes live in the card the row EXPANDS, and the cap is gone.** The owner, on finding them in the menu: _"I was thinking that events with notes, when clicking on them to expand, will show all notes. Instead they only appear on the 3 dots menu, which I think that they don't belong to."_ Correct on both counts, and the second is the general rule worth keeping: **a row menu is a list of verbs (ADR-0138 §1); notes are content, and content read from inside a menu is content nobody finds.** A reader who never opens the `⋯` never learns the notes exist — the mark on the row says "there is something here" and then the obvious gesture, the expand, did not show it.

What the retraction cost, stated because the first amendment was not wrong about the constraint, only about which side of it to yield: `.wp-event-actions` now animates `grid-template-rows: 0fr → 1fr` instead of a `max-height` number, so its height is the content's and **nothing can be clipped at any note count**. The inner wrapper carrying `min-height: 0` + `overflow: hidden` is what makes a collapsing track able to shrink its child. The motion consequence is real and touches every card on the day, noted in ADR-0140's own amendment: the strip used to race toward a 220px ceiling and stop where its content ended, and now every strip travels exactly its own height (same duration, same easing, different distance). That is a smaller change than it looked from behind the cap — which is the lesson: **a fixed cap in the way of the right room is a thing to remove, not to route around.** The rule the first amendment added still stands for future hosts, with its cause named rather than its symptom: the body belongs on the host's detail surface, and a height cap there is a bug in the cap. (A **document** still takes its section in the manage sheet — its viewer's body is a pinch-zoom image in a card that clips, which is a different constraint and not a cap.)

### 6b. A note is written **on the way**, in the host's own form — amended 2026-08-01 (session 205), and it retracts a caution this ADR's §9 had left open

The owner's call, and it settles the brief's §B1: adding a note from an event / booking / place / idea / document form **never opens a second form**. The host's form carries a plain `textarea`; a blank one writes nothing; the host's own save commits both.

**The objection that was raised against this did not survive contact with the code, and that is worth recording rather than quietly dropping.** The design brief argued that one save writing two entities is, offline, two outbox ops with an id dependency between them. It is not:

- **Host ids are client-generated** — `crypto.randomUUID()` in `trip-state.createBooking` (`frontend/src/state/trip-state.tsx:930`), so the host's id exists _before_ the save and the note can carry it immediately.
- **The outbox is FIFO**, stated verbatim above `createPlace` for the case that already relies on it: a name-only Place is queued before the Booking that FK-references it.
- **The shape is already solved twice** — Place→Booking (ordering) and Booking→derived Event ([ADR-0093](0093-offline-booking-linked-event-coherence.md), which also supplies the pattern: the derived entity is emitted as **one synthetic `Change` through the same appliers the WS echo uses**, never a parallel offline handler).

So the inline note is cheap, and the build follows ADR-0093's path rather than inventing one. What the user is spared, in full: the category (§5's chain), the glyph (same chain), the title (absent from the host form — the body is the note), and any second commit.

**More than one note per save, via one input that never moves.** The slot holds a single `textarea`; a committed note collapses to a **one-line chip** above it, the same compact shape the detail surfaces already use. `＋` (or Enter) commits and clears — but **the common case costs nothing**: whatever is still in the input when the host is saved becomes a note too, so one note is type-and-save with no extra press. `＋` exists only to start a second one.

**A committed note stays editable**: tapping its chip returns the text to the composer with the caret at the end, and `＋`/Enter puts it back — anything half-typed is committed first so nothing is clobbered. Without it a typo costs a delete and a retype, which is the opposite of sparing anyone. The chip's fill is the neutral ink wash `list-row.css` already uses at this layer, **not `--paper`** — that token is a warm cream (#f3efe6) that is right behind a 40px badge glyph and reads as a beige wash at full width.

**A first attempt auto-opened a fresh `textarea` per note and was rejected by the owner, on two grounds that are one mistake:** it optimised the rare case (several notes at once) at the expense of the common one (nought or one). A box that appears unasked is something the user must notice, understand and then ignore — "spare the user" cannot mean "add UI on their behalf" — and a held-open `textarea` per note added ~62px each, pushing the save button off a phone for the least important field on the form. Measured in the mockup: three notes cost **113px** as chips against **152px** as stacked boxes, and the chip cost stays linear and small. **Also rejected: one box split on blank lines** — a note is a row, a paragraph break is not a user saying "these are two things", and it would leave editing one of them ambiguous forever after.

**On edit the same slot lists the host's existing notes** — compact, tappable to edit — above one blank field. Still no second form, still one save. This is the case a create-only design discovers late.

_And it was: shipped 2026-08-02 (session 206), after the owner found `EventForm`'s edit half with no notes at all — "very bad as that's the only way to view notes on plan mode", which is exactly right and is the reason this paragraph is load-bearing rather than tidy._ **In Plan mode the form IS the event's detail surface**: the builder's row opens it directly, with no expanded card behind it, so a create-only composer left a whole mode unable to read a note or write one. Two build notes, both of which the paragraph above implies and neither of which is obvious: the existing notes read through the same `HostNotes` section every other host uses (so a tap there READS — ADR-0153 §4's amendment — rather than editing), and that section's own `＋ פתק` is **suppressed here**, because the box below it already is the way to add and it rides this form's save instead of opening a second sheet. The composer's label changes to `פתק חדש` on this half for the dullest of reasons: two headings reading `פתקים` one under the other is one heading twice.

### 6c. What the mark costs `EventCard`, measured — three changes, and one of them is a rule about what a row says

Added 2026-08-01 (session 205) from [`mockups/notes-on-a-host-v1.html`](../../mockups/notes-on-a-host-v1.html), which measured this rather than asserting it. The mark rides `.wp-event-m` — the meta line, which already hosts the sync badge — and getting it there costs three edits, listed because the third is not a styling choice:

1. **A new `notes?: number` prop.** There is no `meta` prop to pass a node through: `EventCard.tsx:148` builds `[placeName, code].join(' · ')` internally from two string props.
2. **The meta line becomes `nowrap`, and its text becomes elements.** `.wp-event-m` is `flex-wrap: wrap`, and **flex wraps before it shrinks** — so the mark pushed the text to a second line, +19px on a 102px row, and giving the text a shrinkable span changed nothing. Only `nowrap` + ellipsis returns it to 0px. The joined string also has to become `placeName` / separator / `code` as separate items, because flex cannot protect part of a text node — and without that the ellipsis ate the **confirmation code**, which is the fact the row is opened for. The code and the mark are `flex: 0 0 auto`; only the place name shrinks. **This changes rows with no notes at all** (a long meta ellipsises where it used to wrap beneath the sync badge), which is why it is here and not in a commit message.
   **Measured at build (session 206), on the case §6c did not cover.** The mockup's `eventCard` rendered no sync badge, so the crowded row was measured **without the one node the ADR itself calls "the one node already living there"** — badge + code + mark had never been on screen. It holds: given a badge already on the line, the mark adds **0px**. What the measurement did find is unrelated to notes and predates them — the badge is **taller than the meta text** (19px against 15px), so any row with a queued write has always had a 4px-taller meta line. Not a wrap, not something the mark caused, and not worth changing; recorded so the next person to measure this line is not surprised by it. Pinned in `e2e/note-mark.spec.ts`, which compares mark-present against mark-absent **with the badge present in both** — the first draft compared before-and-after queuing and was measuring the badge.

3. **A row carrying both a code and a mark drops its place name.** The line is exactly full at 390px — 151px available, 174px needed, and the shortfall is the width of the mark _(session 206: the 174px is webfont-dependent and does not reproduce without Assistant loaded; the 151px available does. The rule below is unaffected — it is deterministic in the composition, not in a measured width)_ — so the place name would render as roughly two characters plus an ellipsis. That is noise, not information, and the district is one tap away in the expanded card. Omitting it is deterministic and testable; degrading it is neither. Rejected alternatives, with their costs: keep the stub (permanent noise); move the mark to the title line (the hard/soft tag already flows to a second line on a long title, so it reintroduces the height problem); drop the code instead (it is the glanceable fact the row exists for).

### 7. A booking's notes migrate; its WiFi does not

`Booking.details.notes` becomes `Note` rows hosted by the booking, in a one-time migration. `Booking.details.wifi` **stays exactly where ADR-0047 §6 put it**: it is a field with one specific reader (Home's quick-access, via `frontend/src/lib/home-quick.ts`), not a note, and moving it would re-open the sync question that ADR ruled on.

Migrating rather than reading both is the same call ADR-0047 made against a WiFi fallback: two places one note can live is a drift problem, and this ADR's entire premise is one place.

### 8. The strategy contract is a sibling of ADR-0151's, and it needs the cost axis that ADR conflated

**Reserved here, built by whatever ships the first strategy — no strategy is registered by this ADR.**

**What transfers unchanged** from ADR-0151: the registry idiom, the `LOCAL`/`REMOTE` placement split, §5 (offline, a remote source is **absent** — not empty, not stale, not spinning), §6 (never persists until picked, which is §3 above), §7 (armed by intent), and the one that matters most on this surface — **a reason is not optional, and it is structured rather than rendered** (`packages/shared` holds no UI copy). `מתוך ויקיפדיה`, `הצעת AI` and `נכתב על ידי דנה` are different claims, and an AI tip in a travel app with no visible source is the worst available version of this feature.

**What does not transfer, and why this is a sibling registry rather than a fourth `ref` tag.** A `Suggestion.ref` **points at** a thing; a note card **carries content**. A suggestion answers _"what should I do next"_; a note answers _"what should I know about this"_. Interleaving them in one ranked list is meaningless, so `NOTE_STRATEGIES` is its own registry with its own payload, sharing ADR-0151's `SUGGESTION_PLACEMENT`, its structured-reason discipline and its rank-interleave rule. What gets shared is the **contract and the rules**; a common runner is worth extracting only if it stays small enough to be obviously one thing — if it turns into a substantial generic refactor, stop and ask (root `CLAUDE.md` rule 8).

**The amendment ADR-0151 needs, which this surface is what surfaced it.** Its §2 defines `REMOTE` as _"needs a key and bills for it"_, conflating **needs the network** with **costs money**. Wikipedia is remote, free and unauthenticated — a real third case, and not a hypothetical one, since it is the cheapest first external source this ADR exists to enable. The conflation matters because §7's armed-by-intent rule is calibrated to **money**: keyed off placement, a free Wikipedia blurb would have to sit behind a deliberate tap for no reason at all, on a surface whose whole value is that the tip is already there when you look.

So: a strategy declares **two** properties, `placement` (`LOCAL` | `REMOTE` — where it runs, and therefore whether it is absent offline) and **`cost` (`FREE` | `BILLED`)**, and **§7's arming rule re-keys to `cost`**. One field on a registry entry. ADR-0151 is amended in place at §2 with a pointer here.

### 9. What this build does NOT do, stated so the scope is not read up

The entity, its sync channels, authoring and reading on all five hosts, the Index tile and screen, and the booking-notes migration. **Zero strategies are registered**, no external source is called, no endpoint is built, nothing bills, and `Note.source` only ever reads "a member wrote it". §8 is the seam — the same posture ADR-0151 took toward its own §4 endpoint, and for the same reason: retrofitting a two-tier surface and a never-persist rule under a shipped notes list is the more expensive half.

Also deferred, recorded rather than half-built: **private notes** (`Document.ownerUserId?` is the precedent and the pattern is cheap, but every read path and the offline cache gain a visibility filter and every note gains a scope control — group-only keeps v1's sync story the same as everything else's); custom categories (§5); note-to-note or note-to-many hosting; and rich text.

## Reuse audit (ADR-0096 / root `CLAUDE.md` rule 8)

Before writing anything new:

- **The list rows** — `ListRow` + `RowManageSheet` (`ui/domain`), the generic managed-list-row + kebab shape already serving bookings, documents and members. A fourth managed list extends it; it does not grow a fifth bespoke row.
- **The tile** — `ui/domain/IndexTile`, built by ADR-0098 and explicitly sized for this: a third call site is a third `<IndexTile>`, not a component.
- **The filter chips** — `ChoiceGrid`'s scrollable pill variant, already extended for the bookings screen by ADR-0098 §"Reuse audit". A second consumer is the point of having extended it.
- **The search** — the existing search control + `lib/search-terms.ts` multi-field matching (ADR-0102), with `url` and `body` added to the fields it already spans.
- **List motion** — `lib/filter-reveal.ts`'s `revealRows` through `ui/primitives/RevealList` (ADR-0120). A chip or query that `.filter()`s the array is the one-off that made the Map jump for two releases.
- **The editor** — a `Modal`-based sheet (never a hand-rolled portal; lint-blocked) with `useFormErrors` + `data-invalid` for its refusals (ADR-0150). A note with neither body nor url is the one refusal it owes, and it marks the field.
- **Empty states** — `ui/feedback`'s `EmptyState` for both "no notes yet" and "nothing matches this filter". A bespoke `<div>` here is the seventh copy of what ADR-0078 collected.
- **Sync** — one `ENTITY_TYPE.NOTE` constant, one `notes: Note[]` in `tripSnapshotSchema`, one memory channel, one `CACHE_CHANNELS` entry, outbox verbs through the existing `outboxOpToCacheChanges` path (ADR-0094/0042/0058). No new sync mechanism, and §2's host-delete rule rides the same registry.
- **Net-new**: the `Note` model/schema and its module. Nothing else.

## Consequences

- **One schema migration** (the `Note` table + its five FKs and indexes) plus a one-time data migration of `Booking.details.notes`. `details.wifi` is untouched, so `home-quick.ts` does not change.
- **`Booking.details` loses its only typed-by-convention key** and goes back to being what it is — a blob for provider-shaped extras — which is a small honesty win for a field ADR-0047 chose specifically to avoid a migration.
- **The Index landing goes to three tiles**, on a shape measured at five (ADR-0098). Nothing about its navigation changes.
- **ADR-0098's `מחקר` debt is discharged** without spending the word.
- **ADR-0151 §2 gains a `cost` axis** and §7's arming rule re-keys to it — amended in place, with the first free-remote strategy as the consumer that will prove it.
- **The first external source is a registration plus one handler**, against a contract already fixed — which is the flexibility asked for, bought without pre-building a pipe that has no consumer (ADR-0065).
- **The host forms each gain one `textarea`** (§6b), and `BookingSheet`'s existing `הערות` field becomes that slot rather than being removed — the one form that already had this keeps it.
- **New `he.ts` copy** for the tile, the screen, the editor and the host-surface affordances, and the booking form's `הערות` renamed. No em dashes, per convention.
- **Design owes a mockup** before the build: the notes screen's grouping and default order, the host-surface mark, and the card tier's exact subordinate treatment (§3 names the grammar to spend, not the pixels).

## Alternatives considered

- **A `notes` text column on each of the five entities.** Cheapest possible change and genuinely fixes "an event cannot carry a note". Rejected: it produces five editors and no unified view — the actual request — and it leaves general notes homeless and machine-generated tips with nowhere to be a row. It also cannot be migrated into this model later without touching all five.
- **`targetType` + `targetId` strings** keyed off the existing `ENTITY_TYPE` constant. Attractive: a sixth attachable entity needs no migration. Rejected (§2): it moves orphan cleanup out of the database and into five delete paths, and offline replay can resurrect a note whose host is gone. The union is small and closed; a migration a year is cheaper than integrity in application code.
- **A fourth `ref` tag on ADR-0151's `Suggestion`** carrying the note's body, so one registry serves both. Rejected (§8): a `ref` points at a thing and a note carries content, and ranking "go here next" against "here is a fact about this place" in one list is meaningless. The shared thing is the contract's grammar, not its payload.
- **Persisting external tips as `Note` rows with a `source` flag.** Rejected (§3): it is ADR-0151 §6's rejected shortcut with a bigger firehose behind it, and it puts rows in the trip that no human chose.
- **Custom user-defined categories**, as raised. Rejected for v1 (§5) on cost — the app's first open taxonomy, with no icon, no exhaustiveness, no merge rule under LWW and no i18n. Deferred, not refused: it is a taxonomy decision and it should get to be one.
- **`הערות` over `פתקים`.** The incumbent word, already in the booking form and already in ADR-0098's placeholder tile, so it would have cost no rename. Overruled by the owner in favour of the warmer word — and it turned out to carry §3's tier boundary for free, since a machine card is not a פתק until someone keeps it.
- **A fourth tab for notes/knowledge.** Rejected on non-negotiable rule 2 (integrations are pipes, not screens) and because ADR-0098 built the landing to absorb exactly this.
- **Private notes in v1** (`ownerUserId?`, mirroring `Document`). Deferred (§9): the precedent is real and the field is cheap, but the visibility filter reaches every read path and the offline cache, and every note-writing surface gains a scope control. Group-only keeps v1 identical to how everything else in the trip behaves.
