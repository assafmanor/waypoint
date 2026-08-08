# Session 225 — notes and documents share a **context**, and only one of them needed a migration

**Date:** 2026-08-08
**Field reports:** #24 (workstream I) and #26 (workstream K), from the [2026-08-08 addendum](2026-08-08-session-224-incremental-field-reports-addendum.md) §4 and §6.
**Output:** [ADR-0172](../decisions/0172-a-linked-pair-is-one-context-and-a-place-may-inherit-it.md), [ADR-0173](../decisions/0173-a-document-attaches-and-detaches-never-dies.md), [`mockups/notes-and-documents-in-context-v1.html`](../../mockups/notes-and-documents-in-context-v1.html), and the #24 build (PR #532). **#26 is decided and drawn but NOT built** — see §6.

## 1. What the session was asked to decide, and what it actually found

The brief framed #24 as revising ADR-0152's single-host note model and #26 as adding hosting to documents from nothing. It expected a storage answer for each, and explicitly permitted them to differ.

**The finding that reframed #24: the relationship it asks about is already 1:1.** `Booking↔Event` is strict 1:1 and optional (ADR-0047 §1), re-affirmed under pressure by ADR-0154 ("a round trip stays **two** `Booking`s… that ADR already rejected 1:many"). So the owner's rule 1 was never a request for a note with two hosts. It was a request for **two rows that are already one thing to the user** — ADR-0047 §2 gave them one merged edit surface for exactly that reason — to be one thing for notes too.

That makes storage the wrong layer. A `NoteHost` join table would buy the ability to express a relationship the schema forbids, at the cost of a migration, a snapshot entity, a sync channel, a Dexie table and two cascade directions.

**And the app had already half-solved it, deliberately, with a note attached.** `lib/hero-horizon.ts`'s `notesForEvent` read an event's notes as the union of `eventId`- and `bookingId`-hosted rows, and its comment stated the field report's own complaint before the field report existed — then said: _"This diverges from `EventCard`'s mark… That is a real inconsistency and it is the hero's side that is right… Flagged rather than silently fixed on both."_ Root `CLAUDE.md` rule 8 names what to do with that, and it is what this session did: generalize the one-off, delete it.

## 2. The four rounds with the owner

Workstream F's session was the model, and this one needed the same number of rounds.

**Round 1 — four questions.** Storage shape (resolution vs. join table vs. host set); where a note typed on a uniquely-referenced Place lands; whether an idea counts toward "exactly one relevant context"; and Documents' storage. All four came back on the recommended option: **resolution**, **the context's anchor**, **ideas don't count**, **an attachment join table**.

**Round 2 — three questions**, all of which only became answerable once round 1 settled. Whether a Place is a full member or a one-way inheritor (**inherit-only**); where attaching happens (**on the way, in the host's form**); and sequencing (owner chose **build both in this session**, against the recommendation to hand #26 to a fresh session — flagged at the time, and §6 is the consequence).

**Round 3 — the owner interrupted the build to ask for mockups.** The right call, and §5 is what came of it.

**Round 4 — two design approvals** off the measured mockup.

## 3. What is forced rather than chosen, and why that matters

Three of this ADR's decisions are not preferences, and the session note records them because a future reader will otherwise re-litigate them:

- **The anchor must be the Booking.** ADR-0093 materializes a booking's derived event **server-side from a seed**, so at the moment `BookingSheet` commits there is no client-held event id. Event-as-anchor cannot serve the create path at all. ADR-0154 §6 had already reached this conclusion from the round-trip direction without naming it as a rule.
- **"Relevant" must be counted through ADR-0048's authority rule.** A linked event's `placeId` is not authoritative; its booking's is. Counted naively, a hotel and the event it backs are two references to one place, so **no place is ever unique and the feature is dead on arrival**. This is the single easiest way to build #24 wrong, and it now has its own test.
- **One-way inheritance is what makes the owner's rule 4 free.** Full membership leaks in reverse: a place-hosted note that showed on booking A reverts to the place when the place is reused, and the place is then reachable from both uses. One-way makes leakage structurally impossible in both directions.

**The general rule worth carrying out of this session:** when a requirement says "state X must stay with Y after Z happens", check whether X can just be **stored on Y in the first place**, before building the machinery that moves it there when Z fires. Rule 4 looked like the hardest requirement in the brief and cost nothing.

## 4. Where the two features part company, and why it is principled

Session 224 left open whether Notes and Documents share an internal abstraction. **They share the derivation and the grammar; they do not share the storage**, and the reason is a real asymmetry rather than convenience:

**A note is born owned by its host. A document is not.** A `TripDocument` already exists as a first-class trip entity with its own screen, upload flow, encryption and list — it gets _attached_ after the fact. So a host FK on the document row would make the natural cascade `Cascade` (wrong: a cancelled hotel deletes your voucher) and the correct one `SetNull`, a special case somebody later "fixes". With a link row, **the correct behaviour is the default behaviour**. Many-to-many then falls out for free and pays for itself immediately: one confirmation PDF covers a round trip, which ADR-0154 makes two `Booking`s.

Sharing storage would have forced Notes into a migration ADR-0172 proves unnecessary and forced Documents onto a cascade that destroys files. What must not exist twice is the "exactly one relevant context" test — and that is exactly what `lib/host-context.ts` is.

## 5. The mockup, and the two things it changed

The owner interrupted the build to ask whether mockups should come first. The honest answer was _partly_: ADR-0172's decisions are invisible (which row holds a note, which host owns a write) and a drawing would be theatre, but ADR-0173 §5 puts a **new slot on `BookingSheet`** — a form ADR-0155 already measures at ~1565px against ~675px of visible phone — and nobody had seen what that costs. The build was paused and [the mockup](../../mockups/notes-and-documents-in-context-v1.html) drawn, measured headless at 390×844.

**Two of the four measurements changed the design, which is the argument for having been asked:**

- **The attach slot's empty state cost 86px** with a header and two entrances. Too much for nothing on that form, so **variant D was drawn after the measurement**: one 40px control until something is attached. Saves **46px** on every form that attaches nothing, which is most of them. ADR-0173 §5 amended. This is the same measurement ADR-0152 §6b made for notes and the same conclusion — the composer is small until there is something to compose with.
- **An inherited note marked with its source costs 2px per note** (111 → 115px for two). ADR-0172 §9 had deferred that distinction as "a design change to one component, later"; at 2px it was too cheap to defer, and the argument is not decorative — deleting the anchoring booking destroys those notes, a booking delete has no undo, and the place card is the one surface where a note's origin is least guessable. §9 amended.

The other two confirmed rather than changed: the mark costs **0px** on the crowded row, and the reworked delete dialog is **23px shorter**.

**What the mockup could NOT settle, recorded so it is not read as a refutation:** ADR-0152 §6c's drop-the-place-name rule. The name did not clip here — and §6c already wrote down why that would happen, since its 174px is webfont-dependent and does not reproduce without Assistant loaded. The measurement is height only.

## 6. What shipped, and what did not

**#24 is built** (PR #532), and it is a frontend change end to end: no schema, no migration, no backend, no API, no new sync channel. `lib/host-context.ts` plus union reads, anchor writes, the mark counting the context on all four surfaces, `hero-horizon.ts`'s one-off deleted, and the booking delete confirm reworked with unlink carrying the notes to the surviving event. Suite green at 188 files / 3081 tests, including a new `host-context.test.ts` pinning the derivation directly.

**#26 is NOT built.** ADR-0173 and the approved mockup are its complete spec; the entity, migration, backend module, snapshot field, sync channel, appliers and attach slot are not written. This is the sequencing risk that was flagged in round 2 and accepted by the owner: #26 is a new syncable entity across every layer, and it wanted the context window that the decision rounds and the mockup pass consumed. Stated plainly here rather than left to be discovered from a half-built branch.

**Two behaviour changes are recorded in the tests that caught them**, because neither is visible in a diff: the hero now orders a booked event's notes by recency rather than event-first (they are one list now, ADR-0153 §2), and the linked-booking confirm no longer carries a consequence line above the choices — §5 made that line false in the branch beside it.

## 7. Deliberately not done

No visual distinction on the Booking/Event side (there is nothing to mark — inheritance is one-way). No attachment from the Documents side; no attachment to a `MaybeItem`; no auto-attachment by parsing an upload (that is a strategy under ADR-0152 §8's reserved contract, and none is registered). No backfill of existing `eventId`-hosted notes onto their bookings — the union already reads them, so it would be a write with no reader.
