# 0183 — **What a thing IS is editable**, and the statement at the top of the editor is the control

**Status:** Accepted (2026-08-12) — **built the same day** in [#579](https://github.com/assafmanor/waypoint/pull/579), design and build in one change. The real-device pass (the collapsed row's 44px target under a thumb, and whether the reveal's arrival reads as motion or as a jump on a slow phone) is still owed.
**Date:** 2026-08-12
**Session note:** [`planning/2026-08-12-session-256-a-category-you-can-change.md`](../planning/2026-08-12-session-256-a-category-you-can-change.md)
**Mockup:** [`category-on-a-booking-and-a-note-v1.html`](../../mockups/category-on-a-booking-and-a-note-v1.html) (§1 the diagnosis · §2 the booking · §2c the switch's cost and its confirm · §3 the note · §3b the two rejected shapes · §4 the layers · §5 the wire)
**Backlog:** "Re-filing what is already saved", from an owner report of 2026-08-12.

**Reverses a premise no ADR ever took:** that a saved `Booking.type` is immutable. It is recorded as a fact in [`planning/2026-08-07-session-221-…`](../planning/2026-08-07-session-221-booking-authoring-decision-session.md) §4 — _"A saved booking's type has never been editable, so on an edit there is no question to ask"_ — and nowhere as a decision. This ADR exists mostly so the reversal is citable.

**Amends in place:**

- [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §5's 2026-08-01 amendment and §6b — an inherited category is still **resolved, never copied**, and a hosted note is still written with **no category chosen**. What changes is that the resolved value is now **stated and overridable** instead of absent: §6b bought "nothing is asked", not "nothing is shown", and the picker's absence was costing the ability to re-file the commonest note in the app.
- [0177](0177-a-when-reads-as-a-sentence.md) §2 — `ValueToken` is now on the record as the wrong primitive for a **non-temporal** value, and why: it declares its open/focus mark in amber for every host, and its only `kind="word"` host is a duration.

**Relates:** [0038](0038-icons-and-canonical-category.md) (the 2026-07-19 amendment this obeys — the type owns the category, so the type is what opens) · [0017](0017-mobile-first-device-targets.md) (the 44px floor the row is measured against) · [0028](0028-plan-violet-color-budget-dark-ready.md) (this spends nothing from the budget) · [0079](0079-one-modal-primitive.md) (the confirm is a second call, not a second prompt) · [0096](0096-per-domain-claude-md-guides.md) / rule 8 (why two components arrive and both are collections of existing ones) · [0098](0098-index-landing-and-dedicated-screens.md) (`Collapsible`, the reveal) · [0109](0109-map-tab-design.md) §11 (the explicit category selector this extracts) · [0150](0150-a-form-refuses-at-the-field.md) (why the "you now need a route" half is a refusal and not a warning) · [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md) (commits once, which is what makes the confirm cheap) · [0165](0165-a-place-says-what-it-is.md) (a place lends its own category) · [0172](0172-a-linked-pair-is-one-context-and-a-place-may-inherit-it.md) §1 (the sibling index this one sits beside)

## Context

One owner report:

> "When editing booking and notes, you're unable to update the category. It should be available."

Read against the code it is **two mechanisms**, and only one of them is a `category` field.

A **note** has `Note.category`, optional, resolved as `note.category ?? host.category` at render. A **booking has none, by decision**: ADR-0038's 2026-07-19 amendment made `Booking.type` the sole authority, and it exists because the icon picker _was_ writing a category — a ⭐ badge on a hotel stored a non-lodging category, and duration-in-nights, check-in/out bracketing and the ambient backdrop all silently read wrong. So the booking half of this report is **not** "add a category picker"; adding one restores exactly the second source of truth that amendment deleted.

What was actually missing, in both halves, was reachability:

- The booking's **type** could not be changed after the save. One `isCreate` withheld a grid and an `onChange` prop that both already existed, and the only way to correct a stay filed as `אחר` was delete-and-recreate — which drops the confirmation code, the attached documents, the notes and the linked itinerary event.
- The note's picker was rendered behind `{!host && …}`, so a **general** note could be re-filed and a note written on a booking, an event, an idea, a place or a document could not. Since ADR-0152 §6b's whole point is that the app nudges you to write notes **on hosts**, the reported case was the common one.
- And neither could reach **no category at all**: `ChoiceGrid`'s `onChange` only ever sets.

## Decision

### 1. What a thing IS is editable, and the statement is the control

Every editor that opens by stating what its subject is makes that statement the way to change it. In a booking that statement already existed (the collapsed type row at the top of every step); in a note it did not, and gains one.

The chooser **reveals in place**, through the shared `Collapsible`. Not a step and not a second overlay:

- **A step is what you pay on every pass through the form**, and this is a rare edit (owner: _"most edits will be changing other stuff and not the category"_). So create keeps its four steps — where the type genuinely shapes every step after it — and an edit keeps its three. Session 221's arithmetic is untouched.
- **An overlay is a layer over a sheet** for one of eight options with no search, and it hides the form the choice returns to. `CodePicker` is the right shape for a list you must search (currencies, zones); eight cards are not that.

Closed, the reveal costs **0px**. That is the property that makes this affordable on a surface whose height is already argued over.

### 2. `ChoiceDisclosure` and `CategoryField`, and both are collections

- **`ChoiceDisclosure`** — the statement-as-control plus `Collapsible`. Generalised from the collapsed `BookingTypeRow`, which had already written the grammar down (a glyph, what the thing is, and the way back to the grid at the far edge) and was missing only the press.
- **`CategoryField`** — the nine categories plus an optional leading pill. An **extraction** of three call sites that were already building `Field` › `.category-pills` › `ChoiceGrid layout="pills"` by hand, one of which had omitted the wrapper and so rendered at the Index **filter** density (28px against 35px, measured on the render). That class of defect an extraction removes by construction rather than by remembering.

`ChoiceGrid` itself is untouched. Of `choice-disclosure.css`, the box, glyph, label and trailing verb are `.bs-type-row`'s shipped rules **moved** out of `.booking-sheet` scope; genuinely new are a button reset, the 44px floor and the caption that names an inherited value's source.

### 3. The way back to nothing is a leading pill with a sentinel value

`ChoiceGrid` only sets, so the route back to `undefined` is one leading option carrying `NO_CATEGORY` — verbatim the shape `IndexNotesView`'s `הכל` chip already ships. No change to the primitive and no new CSS.

Its label is what `undefined` **means** at that host: the inherited value's source on a hosted note (`לפי ההזמנה`), and `ללא` where nothing is inherited. A host that lends no category at all (a document) reads `ללא` rather than inventing an inheritance.

### 4. The row states; it does not ask

This is what keeps ADR-0152 §6b intact while making the field present on every note. The collapsed row arrives already showing the value in force and, while it is inherited, where it came from — so a note written on a host still needs no answer from anyone. Choosing writes `Note.category`; choosing the leading pill writes null and returns to inheritance, which §5's amendment requires to stay resolved at render.

**Amended 2026-08-13 (owner):** on a **note the collapse is for the edit only**, and the category **leads the form** in both modes. Two separate calls, and the second is the one the first draft got wrong.

- **Placement.** The category is the first field, as it already is in `EventForm` (ADR-0109 §11) and as the type row already is in `BookingSheet` — a note is filed under something, and the field saying under what belongs above the boxes rather than after them. It was last in `NoteSheet` for no reason beyond where the new component was inserted.
- **Mode.** A **create** gets the plain always-open field every other form's category is; an **edit** keeps the statement-as-control. This resolves the one fork the mockup deliberately left open (§3 · צורה: the 44px statement row priced against the always-open field) and it splits by mode rather than by host, which is what the drawing did not consider. The collapse earns its tap where there is a saved answer to state and re-filing is the rare pass; on a brand-new note there is no earlier answer, so the same row costs a tap to open plus a tap to close and hides the field it is standing in for. §6b is untouched either way — the leading pill arrives **selected**, carrying the value in force and, while it is inherited, its source — so nothing is asked in either mode. What changes is only whether the nine options are behind a press.

**The height the fork was left open for is 16px.** Read off the mockup's own live measurement table at 360×640, the note's category area is **44px collapsed against 60px as the always-open field** — a caption plus one 35px pill row, because `.choice-grid.pills` is a single horizontally-scrolling row rather than a wrapping grid (the ten options do not stack). That is the whole price of the create's shape, and it buys back the open-then-close pair of taps.

One consequence worth naming: open, the grid states the inherited value as `🏨 · לפי ההזמנה` on its leading pill and leaves `לינה`'s own pill unchosen, where the collapsed row spelled `לינה` out. That is the more accurate render of what is stored (nothing — it resolves), and it is the leading pill's shipped shape rather than a new one.

The inline `NoteComposer` — the one-textarea box that rides a host form's save — gains nothing. There the rule is literally "everything that can be spared", and that box asks nothing at all.

### 5. A lossy switch confirms **at the tap**, in three words

The confirm fires only when the switch would delete something the form is currently holding, and `switchIsLossy` answers a **boolean** off `BOOKING_TYPE_PROFILE`'s axes — so a ninth booking type answers by existing rather than by being added to a list.

**At the tap, not the save**, and this reversed an earlier draft of the mockup. The draft argued save-time on "nothing is lost until the save", which is true of the stored data and **false of the form**: the tap is what takes the route field, the span's end and the stay block off the screen, so the tap is the last moment the warning's subject is visible. Its other two reasons failed too — the "minefield" barely exists because a near-empty create form loses nothing, and "the app confirms at the destructive action" is the argument **for** the tap once the destructive action is located properly.

The decisive evidence was the cancel path. At the tap, `ביטול` is clean: nothing changed, the grid keeps the previous type. At the save it lands you in a form whose boxes are already gone with nothing saying how to get them back. **A broken cancel path is a sign the confirm sits at the wrong moment** — and the label could not be settled without settling the moment, which is why it moved `ביטול` → `המשך עריכה` → `ביטול` across drafts.

**Three words, and no list**: `חלק מהפרטים יימחקו.` Active, and the accurate half of the two drafts — the fields genuinely are deleted on save rather than merely failing to carry over — and it lands on `manage.plainBody`'s existing pattern of one future-tense sentence with a full stop. **Not** "everything resets", which is false: counted off the axes, `hotel → restaurant` drops three things and carries eight across. A prompt that overstates gets dismissed unread, and a user who believes it goes back to the delete-and-recreate this change exists to end. The itemisation lives in the mockup's §2c matrix as **documentation**, which is what earns the short sentence: a reader can check that "חלק מהפרטים" is three of eleven.

There is **no in-grid banner** beside it. One warning, in one place.

### 6. Null clears, on the three place FKs

`updateBookingSchema`'s `placeId`/`fromPlaceId`/`toPlaceId` become `nullish`, in the wording the schema already used beside `startDisplayTimezone`. Without it this feature is impossible rather than merely awkward: `undefined` is dropped by `JSON.stringify`, so the server merged the previous shape's places under the **new** type and `assertPlaceShape` rejected the pair with a 400. It also fixes a shipped defect with no relation to this change — **clearing a booking's place was a silent no-op** for the same reason.

## Consequences

- **A booking's type is editable, and the linked event follows it.** The category the event carries is re-derived from the new type through the existing `bookingEventFields`, so nights-vs-hours, the bracketing and the ambient backdrop all move with it. `changeType`'s existing rule is untouched: an offered end is re-driven, and **an end a human typed is theirs and stays**.
- **`buildNoteHosts` moves into trip-state**, beside `hostContexts`, and gains a place's own category. It was built locally on the notes screen while that was its only reader, which is how the ROW and the EDITOR came to disagree: the row resolved through the index, and the sheet took a `NoteHostRef` literal that five call sites hand-wrote and three wrote without a category. Every derived fact about a host now comes from the one derivation, and the literal supplies only the identity.
- **A closed disclosure is `inert`.** Found by building, not by drawing: `Collapsible` never unmounts its children — its contract, so the transition has something to animate against — and `max-height: 0` hides a thing from the eye only, so a collapsed chooser stayed in the accessibility tree and the tab order. Scoped to `ChoiceDisclosure` rather than widened into `Collapsible`, whose four other call sites are not radiogroups; **that widening is a change to make on its own evidence**, and it is recorded here as unbuilt.
- **The Map opts out of both halves.** `MapPlaceForm` keeps its pills open and offers no leading pill: there the category **is** the pin's hue, and that file's own comment says an unanswered category on a surface whose grammar is "colour = category" is wrong information rather than absent information. Two props, each earned by that one reason.
- **The reveal scrolls itself into view for free, because the row is a `<button>`.** `BookingSheet`/`EventForm` already run `onFocusCapture` → `scrollIntoView` over their whole body, and a focusable row is caught by it where a `<div>` was not — which matters, because at 360×640 the opened form overruns the screen. **`NoteSheet` has no such handler**, and that pattern is hand-rolled three times across the other editors. Lifting the three onto one place is recorded and not done here.
- **No migration, no new entity, no new enum.** `Note.category` and `Booking.type` both already existed; one zod modifier changed.

## Alternatives considered

- **A `category` field on `Booking`.** Rejected — ADR-0038's 2026-07-19 amendment already rejected exactly this, after it had shipped and read wrong. The type is the category, so the type is what opens.
- **The type step returning on an edit** (this design's own first draft). Rejected by the owner, and the reason generalises past this form: a step is paid on every pass, so the cost of a rare edit should fall only on whoever makes it.
- **A `Modal` sheet holding the grid.** Rejected — a second layer over a sheet for one of eight options with no search, hiding the form the choice returns to.
- **The row as a `ValueToken`** (ADR-0177). Rejected, and drawn in the mockup so the reason is visible rather than argued: the primitive declares its open/focus mark in **amber for every host**, and its only `kind="word"` host today is a duration — i.e. time. A booking type is not time, and lending it amber dilutes rule 4's budget; a third tone on a shared primitive for one host is a change to the primitive. Separately, the reason ADR-0177's `::after` reach exists at all — a list line that must not grow — does not apply to an editor's header row, where the floor costs 5px.
- **Confirming at the tap of every card, or confirming at the save.** Both rejected, in opposite directions — see §5.
- **"Everything will reset and you will have to refill it"** as the warning's wording, as proposed. Rejected on the facts, and because a warning that overstates sends the user back to delete-and-recreate.
- **Refusing a lossy switch outright.** Rejected — it blocks exactly the reported case. A stay misfiled as a restaurant is a wrong classification to correct, not a state to defend, and the block leaves the user with the delete that loses more than any switch does.
- **Tap-the-selected-pill-to-clear**, with no leading pill. Rejected: undiscoverable on touch (no hover, ADR-0017) and non-standard for a `role="radio"`. The pill states the state instead of hiding it inside a gesture.
- **A `נקה` button beside the row.** Rejected — a second control for a value that already has a row, and in `ChoiceGrid` it falls outside the `radiogroup` whose accessible name is the field.
- **Copying the host's category onto the note at write time.** Rejected in advance and by name in ADR-0152 §5's amendment: identical on day one, stale the moment the host is recategorised.
- **A hint under the row explaining the inheritance.** Rejected — the row already reads `לפי ההזמנה`. This is the explanatory copy [session 246](../planning/2026-08-11-session-246-copy-that-does-not-earn-its-place.md) removed.
