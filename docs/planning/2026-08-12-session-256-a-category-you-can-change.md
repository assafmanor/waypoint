# Session 256 — a category you can change, on a booking and on a note

**Date:** 2026-08-12
**Output:** [`mockups/category-on-a-booking-and-a-note-v1.html`](../../mockups/category-on-a-booking-and-a-note-v1.html), its catalog entry, and the backlog section under "Re-filing what is already saved". **No code, no ADR, no schema change** — the mockup is _Proposed_ and the build waits on approval.
**Baseline:** every file, line and constant cited below was read on `24da021` (`fix(enrichment): a backfill that finishes…`, `origin/main`) in this session.

## 0. The report, and why it is two reports

> "When editing booking and notes, you're unable to update the category. It should be available."

Read against the code, that one sentence covers two different mechanisms, and only one of them is a `category` field:

- **A note** has `Note.category`, optional, resolved as `note.category ?? host.category` at render ([ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) §5's 2026-08-01 amendment).
- **A booking has none, by decision.** [ADR-0038](../decisions/0038-icons-and-canonical-category.md)'s 2026-07-19 amendment made `Booking.type` the sole authority, and it exists because the icon picker _was_ writing a category: a ⭐ badge on a hotel stored a non-lodging category, and every category-keyed behaviour — duration in nights, check-in/out bracketing, the ambient backdrop — silently read wrong.

So the booking half of this report is **not** "add a category picker". Adding one restores exactly the second source of truth that amendment deleted. What is actually missing is that **the type is not editable after the save**.

## 1. And nobody decided that it isn't

Session 221's note states it as a premise rather than a decision:

> "A saved booking's type has never been editable, so on an edit there is no question to ask."

No ADR owns it. `BookingSheet` already has the grid, and `BookingTypeRow` already has an `onChange` prop; a single `isCreate` at `BookingSheet.tsx:945` withholds both. That is worth naming precisely because it is the cheap kind of gap: the mechanism was built, and one condition kept it from the surface that needs it.

The cost of the gap is not small. With the type locked, a stay filed as `אחר` can only be corrected by delete-and-recreate — which drops the confirmation code, the attached documents, the notes and the linked itinerary event.

## 2. The two owner calls, and the principle they add up to

Both were made against the mockup's first draft, and both changed what ships.

**Call 1 — no step for this.**

> "I don't want a full step just for choosing the category. It doesn't make sense because most edits will be changing other stuff and not the category."

The first draft brought the create-only type STEP back on edit (3 steps → 4). Rejected, and the reason generalises: **a step is what you pay on every pass through the form**, so the cost of a rare edit should fall only on whoever makes it. Create keeps four steps and edit keeps three — session 221's arithmetic untouched.

**Call 2 — the thing on top is the control.**

> "Yeah the edit already has a category on top, so it should probably become clickable — for both notes and bookings."

This is the design. The collapsed type row already sits at the top of every step in the booking editor, stating what the booking is; making it a `<button>` that reveals the grid **in place** costs 0px until it is touched. And "for both" is what turns two fixes into one mechanism: the note editor gets the same row, stating the category in force and — when the note carries none of its own — where it came from (`🏨 לינה · לפי ההזמנה`).

That preserves what ADR-0152 §6b bought. **The row states; it does not ask.** A note written on a host still needs no answer from anyone.

**Call 3 — and what does hotel → restaurant even mean?**

> "So some category changes are going to become intransferable right? What does it mean to change from a hotel booking to a restaurant for example? On these changes we should probably pop up a warning for doing that will reset and you will have to refill everything, makes sense?"

**Yes to the warning, with one correction that is the whole of §2c.** Yes it needs more weight than a banner, so it becomes a `ConfirmDialog` — reusing the `consequence` slot that primitive already has, whose own comment describes it as "what else this delete takes … a `--miss` statement of consequence". But **not** "reset and refill everything", because that is not what happens, and saying it would push the user straight back into delete-and-recreate — the behaviour this change exists to end.

Counted off the real profile axes, `hotel → restaurant` drops **three** things and carries **eight** across:

| drops                                        | why                                                             |
| -------------------------------------------- | --------------------------------------------------------------- |
| the end clock, and the spread across days    | `span` → `point`: a four-night stay becomes a point on one day  |
| the room number and the WiFi                 | `BookingSheet.tsx:633-635` already prunes these when `!isHotel` |
| (conditional) the derived round-trip pairing | route → no route breaks the mirror ADR-0154 §3 pairs on         |

| carries across                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- |
| the name, the place, the confirmation code, the provider, the start date and time, the notes, the attached documents, the linked event's identity |

**Call 4 — and then cut the copy.**

> "No need to be over descriptive in the warning, really short and no need to list everything that will be deleted."

So the dialog is **one line**: `חלק מהפרטים לא עוברים לסוג החדש`, with no itemised losses and no `consequence` row. And the in-grid banner the previous draft had added **is gone entirely** — one warning, in one place, short. A banner and a dialog carrying the same short sentence is exactly the duplication session 246 (workstream L) was written to delete, and keeping the banner's list while shortening the dialog would have put the descriptiveness back one surface over.

Two things follow, and both are improvements rather than costs:

- **The mechanism the build needs is a boolean**, `switchIsLossy(from, to, booking)`, not a list anyone has to phrase into copy. The itemised version stays in the mockup as the matrix — **documentation, not copy** — and that is what earns the short sentence: a reader can check that "חלק מהפרטים" means three of eleven and not "everything".
- **It measures smaller twice.** The confirm card halves, 196.5px → 99.8px. And dropping the banner takes the opened booking form from 704.9px to 649.3px, so at 360×640 it now overruns the screen by 9px instead of 65px.

**And the confirm is on the SAVE, not on the tap.** Three reasons, each a rule rather than a taste: (1) at the tap it confirms something that has not happened — the form commits once (ADR-0155) and form state still holds the place, the route and the end, so switching back restores them; (2) a grid of eight cards that throws a dialog on every tap is a minefield, and on create `changeType` is tapped freely; (3) it is already the app's grammar — the hard-event guard (ADR-0011) and the delete/unlink prompt (ADR-0047 §3) both confirm **at the destructive action**, not when editing begins. §2c draws the rejected version over the open grid, because that is the argument.

**Not** a refusal, either: blocking a lossy switch blocks exactly the report. A stay misfiled as a restaurant is a wrong classification to correct, not a state to defend — and the block leaves the user with the delete-and-recreate that loses more than any switch does.

## 3. What the mockup settles, and the one thing it does not

| §   | question                                | answer                                                                                       |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| §1  | where does a category live, per entity  | a table over all six · four editable today, two not                                          |
| §2  | how does a booking's type open          | the statement is a `<button>`; the grid reveals in the shared `Collapsible`                  |
| §2  | what does the grid say while you choose | nothing · a choice is a choice, not a warning                                                |
| §2c | what a switch actually costs            | a matrix computed from the axes (documentation) · and a one-line `ConfirmDialog` on the SAVE |
| §3  | how does a note's category open         | the same row, same mechanism                                                                 |
| §3  | how do you get back to "no category"    | a leading sentinel pill · `IndexNotesView`'s `הכל` shape, zero new CSS                       |
| §3b | why not a sheet, why not `ValueToken`   | drawn and measured rather than asserted                                                      |
| §4  | how many components does this leave     | three layers, each already three-quarters built                                              |
| §5  | can the wire even carry it              | not today · one schema word per field                                                        |

**Open, and deliberately handed to a device:** whether the note's 44px statement row is worth it on a form whose whole point is to ask nothing (§6b). In a booking there is no question — the row exists today and the change measures 5px. The mockup's `§3 · צורה` control switches between the row and the always-open field so the table prices both.

## 4. Rule 8, spent and not spent

What the proposal reuses, named so the build cannot quietly redraw any of it: `ChoiceGrid` (untouched), `Collapsible` (the reveal; its `max-height: 2000px` cap is safe here for the reason ADR-0152 §6's trap was not — nine pills and eight cards cannot outgrow it, where a note composer can), `StatusBanner tone="warn"` (`--miss`, a status token and not the amber/teal/plan budget), `lib/category-options.ts`'s single options list, and `buildNoteHosts` as the one host resolver.

What it adds is two components, both of which collect existing duplication:

- **`ChoiceDisclosure`** — the statement-as-control plus the `Collapsible` under it. New, composed of two existing things.
- **`CategoryField`** — the nine categories plus an optional default pill. A straight extraction of three call sites that already build the identical sandwich (`NoteSheet:132`, `EventForm:680`, `MapPlaceForm:275`).

The proposed CSS is ~30 lines, and **four of its rules are `.bs-type-row`'s shipped rules moved verbatim** out of `.booking-sheet` scope so a second editor can wear them. The net new is a button reset, the 44px floor, and the `--muted` caption naming an inherited value's source.

**Two rejections worth keeping**, because both would have looked fine in a description:

- **A `Modal` sheet holding the grid.** A second layer over a sheet, for one of eight options with no search, hiding the form the choice returns to. `CodePicker` is the right shape for a list you must search (currencies, zones); eight cards are not that.
- **`ValueToken`** ([ADR-0177](../decisions/0177-a-when-reads-as-a-sentence.md)). The right rule for the wrong case, and the mockup draws it so the reason is visible rather than argued: `value-token.css` declares the open/focus mark in **amber for every host**, and the only `kind="word"` host today is a duration — i.e. time. A booking type is not time, and lending it amber dilutes rule 4's budget; the alternative, a third tone on a shared primitive for one host, is a change to the primitive. Separately, the reason ADR-0177's `::after` reach exists at all (a list line that must not grow) does not apply to an editor's header row.

## 5. Three defects found while reading, and one found only by rendering

None of these is a design choice; all four are recorded in the backlog where the fix lands.

1. **The wire cannot express a type change.** `updateBookingSchema` is `createBookingSchema.partial()`, and `placeId`/`fromPlaceId`/`toPlaceId` are `.optional()` rather than `.nullish()` — so `null` never reaches the server and **a place cannot be cleared**. `bookings.service.ts:116` then merges `before.fromPlaceId` under the new type and `assertPlaceShape` throws 400. Traced through the source, not inferred: the form sends `{ type: 'hotel', placeId: undefined }`, `JSON.stringify` drops the key, and the server sees `{ type: 'hotel', fromPlaceId: 'p-nrt' }`. **This blocks the feature**, and the fix is one word per field in the wording the schema already uses beside `startDisplayTimezone`: null clears.
2. **Clearing a booking's place is a silent no-op today** — same root, no relation to this feature, and it needs its own test.
3. **`NoteSheet:132` omits `.category-pills`**, so the note editor's pills render at the Index _filter_ density: **28px against 35px**, measured off the render. It disappears by construction once the three sandwiches become `CategoryField`.
4. **`HostNotes`' `NoteHostRef` is hand-built at five call sites, three of them without `category`** (`BookingSheet:1349`, `EventForm:951`, `DetailSheet`) — while `buildNoteHosts` derives it correctly, in one place, on the notes screen. Two derivations of one fact, and it is what makes §3 impossible today: the editor cannot state an inherited value it was never handed. While in there, `buildNoteHosts` also drops `Place.category` on the strength of an ADR-0147 comment that [ADR-0165](../decisions/0165-a-place-says-what-it-is.md) superseded.

**And the one the render produced.** At 360×640 the booking form with the grid revealed measures **686px against a 640px screen**. In the app the sheet scrolls (`max-height: 80vh`), so the real question is whether it scrolls _itself_ — and it does, for free, **because the statement is a `<button>`**: `BookingSheet.tsx:931`'s existing `onFocusCapture` → `scrollIntoView({ block: 'center' })` catches a focusable row where a `<div>` would not. Worth knowing before someone later turns the row back into a div. The corollary is the fourth rule-8 finding: that reveal-into-view is hand-rolled three times (`BookingSheet:931`, `EventForm:673`, `DocumentUploadSheet:116`) and **absent in `NoteSheet`**. Lift the three onto one place; do not add a fourth.

## 6. What the build owes

Four pieces, each reviewable alone, in this order:

0. `lib/booking-edit.ts` — one `switchIsLossy(from, to, booking)` beside `mergeBookingDetails`, computed from `BOOKING_TYPE_PROFILE`'s axes so a ninth booking type answers by existing. A **boolean**, not a list: the dialog's copy is one fixed sentence in `he.ts`, and the itemisation lives in the mockup as documentation.
1. `packages/shared` — the three place FKs become `.nullish()` on the update path, mirrored to `schema.prisma` (rule 3), with a test for the clear.
2. `ui/primitives/ChoiceDisclosure` + `ui/primitives/CategoryField`, each with its own test file, and the three existing category call sites moved onto the latter (the Map keeps its always-open row: there the category **is** the pin's hue, and `MapPlaceForm`'s own comment says absence of a choice is wrong information rather than absent information).
3. `BookingSheet` — the type control on edit, `changeType`'s existing preserve-what-a-human-typed rule unchanged, the save's one-line `ConfirmDialog` (the sheet already renders one for discard; this is a second call of the same primitive, not a second prompt), and the payload that actually nulls the stranded place fields. No banner.
4. `NoteSheet` + `HostNotes` — the row, the sentinel pill, and the host resolved from the one index.

**And an ADR on approval**, because the premise "a saved booking's type is immutable" was never written down as a decision and this reverses it. The mockup is the spec; the ADR is what makes the reversal citable.
