# 0192 — A form has bands, and its content sections have one look

**Status:** Accepted and **built** (2026-08-16). Every number is measured — first off the mockup's rendered DOM, then in the **running app**.
**Date:** 2026-08-16
**Design reference:** [`mockups/a-form-has-bands-and-one-content-section-v1.html`](../../mockups/a-form-has-bands-and-one-content-section-v1.html) — §1 the content band · §2 the five bands · §3 the cost of moving `סוג`. **Promoted by this ADR.**

**Builds on:** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6b (a note is written on the way), [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §3/§5 (documents above notes, and the one-control empty state), [0191](0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md) §5/§7 (one row shape for both sections on a surface), [0136](0136-an-event-can-also-be-booked.md) §4 (the booked row derives the kind), [0107](0107-events-carry-a-display-timezone.md) (the place decides the authoring zone).

## Context

Two owner reports on the event and booking forms, in one ADR because they are one form:

> _"Notes and tasks in the event/booking creation/edit forms are formatted differently, let's align them to the same style (I think preferably to the tasks style)."_

> _"I feel like every time we add a new field or section to the event form (create, edit) we just append them to the end, now it looks very messy. Let's decide on a new ordering (+ an instruction to think from now on where we add things)."_

Reading the code before drawing anything changed both:

- **The notes block was TWO blocks on an edit** and the tasks block was one. `EventForm` rendered `<HostNotes>` — which paints a `פתקים` header and the rows — and then a separate `<Field label={t.notes.composer.labelMore}>` around the composer. That string (`פתק חדש · לא חובה`) existed **only** to stop the word `פתקים` appearing twice in a row. It is a workaround for a structure, not a caption.
- **`.note-sec-h .t` and `.doc-sec-h .t` were byte-identical**, nine declarations each, in two stylesheets. The second copy already existed; notes becoming a third is precisely what rule 8 forbids.
- **The two forms disagreed about place vs time.** `BookingSheet`'s steps run `type → what/where → when → more`; `EventForm` ran `category → title → when → place → booked`. One of them had to be wrong.
- **There was no rule anywhere.** `conventions.md`, `design-language.md` and the ADR router carry no form-field order. Appending is not laziness — it is what happens when nothing says otherwise.

## Decision

### 1. One section header, extracted rather than copied a third time

`.sec-h` lives in a new `ui/section-head.css` that `NoteSection`, `TaskSection` and `DocumentAttachField` each import. It is not in either of the sheets it came from, because all three components load it and none of them owns it — a fourth content type is now one import and one `className`.

**The copies had already drifted, which is the argument for doing it now.** `.doc-sec-h .t .icon` sized the header glyph to 13px; `.note-sec-h .t .icon` did not exist, so the mark on the documents header and the mark on the tasks/notes header were different sizes **on the same form**. Nobody had seen it because those two sections are only ever adjacent here. The 13px wins: it is the one that was deliberate.

**The extraction takes the WHOLE header, not the intersection.** `.add` belongs to it even though the documents header has no add control — the mockup's first draft left it behind and `＋ משימה` fell back to a native `<button>`, three pixels shorter and wearing platform chrome. No test could see it; a screenshot could.

### 2. The notes are ONE section, and the composer is its last row

`NoteSection` gains a `compose` slot. The form mounts one `HostNotes` — header, then the existing notes, then the composer, then the inherited-category caption — on **create and edit alike**, where a create simply has no rows above the box. `HostNotes`' `id` is optional now, which is exactly the shape `HostTasks` and `DocumentAttachField` already take, so the three content sections on a form say "not saved yet" the same way instead of each inventing it.

`t.notes.composer.labelMore` is **deleted**. `label` survives for `DocumentUploadSheet` and `MapPlaceForm`, which keep a captioned `Field` — see the Consequences.

**A section with a composer has no empty-state line.** `אין פתקים על זה` directly above the box that invites you to write one states the obvious and costs a line; the composer _is_ the empty state. That is ADR-0174 §5's argument for the documents control, applied to its neighbour.

**What this deliberately does NOT change is how a note is written.** The owner's word was "preferably to the tasks style", and the alignment is of the **chrome**, not the entry mechanism: the composer stays inline and ADR-0152 §6b stands. ADR-0191 §7 already stated the distinction — a task has a deadline and an assignee, so a title-only box produces systematically weak tasks and it needs the editor; **a note is its body**, and a free box omits nothing. Making a note cost a sheet would tax the common case (one note) to make two components match.

### 3. Five bands, and the two orderings that are load-bearing

    1 · מה      what it is         category · icon + title
    2 · איפה    where              place, or the two route ends
    3 · מתי     when + commitment  the when, its conflict warning, hard/soft
    4 · הזמנה   the booking        `יש הזמנה` and everything it opens
    5 · מצורף   attached content   documents → tasks → notes

**Where before when, and this is the half that is not taste.** The place is what derives the zone the times are read in (`EventForm`'s `tz`). Type `19:00`, then pick a place in Tokyo, and the same wall clock is stored as a **different instant**. Asking where first is what stops the form silently re-interpreting what was already typed — and it is the order `BookingSheet` has always run, so it ends a disagreement rather than creating one.

**`סוג` joins the time band.** Hard/soft is a claim _about the time_ — ADR-0011's hard event is the one that is never auto-moved — and rule 4's amber is time-and-commitment, one budget. It read as an afterthought of `יש הזמנה` only because that is where it was appended.

**Band 5's internal order is ADR-0174 §3's, unchanged.** A document is a thing you need, a note is something about it, a task is a thing to do between them; the read surfaces run the same sequence and the app must not teach one order for authoring and another for reading.

**The rule is written into `frontend/CLAUDE.md` and asserted by a spec.** A rule nothing checks drifts again — which is the entire report. `EventForm.test.tsx` reads the rendered sequence and fails with the band names when a block moves out of its band.

### 4. The cost of moving `סוג`, and what pays it

Real: `יש הזמנה` re-derives the kind (ADR-0136 §4), and the control now sits **above** the toggle, so it can change off screen. Paid in the derived sentence already under that toggle, which names the kind it is setting — a clause, not a second control.

**On the CREATE only, and a spec is what found that.** The re-derivation runs only while the kind is untouched, and ADR-0136 §4 counts an existing event as touched — so on an edit the toggle never moves the kind, and `יסומן …` there would announce a change that is not going to happen. `bookedDerivedConvert` keeps its original wording.

## Measurements

Off the rendered mockup at 360×640 and 390×844, both themes, and confirmed in the running app.

| what                           | today       | proposed | note                                                                |
| ------------------------------ | ----------- | -------- | ------------------------------------------------------------------- |
| notes section · **create**     | 108.7px     | 108px    | **−0.7px** — buys consistency, not space                            |
| notes section · **edit**       | 193.5px     | 144.8px  | **−48.7px** — a heading, a label and a hint slot                    |
| the reorder itself             | —           | —        | **0** (residual −2px = `.field` 18px → `.note-sec` 16px top margin) |
| `סוג` clause in the sentence   | —           | —        | **0px at 360**, **+17px at 390**                                    |
| task row text vs note row text | 44px / 44px | same     | already aligned by ADR-0191 §5                                      |

**Two numbers were wrong before it was rendered, and both were the mockup's own fault** — recorded because they are the reason the file exists:

- The first draft wrapped every block in mockup chrome, so the two frames differed by four `flex` gaps and four label lines and it reported a **fake 134.7px saving**. The band rail rides the block the app already renders now, and the residual is printed as a measured row rather than argued.
- The first draft also dropped the composer's `Field` **shell** along with its label, which silently strips `field.css`'s border, padding and `min-height: 56px` from the textarea. Half the measured "saving" was an input shrinking. The shell stays; only the label goes.

**The `סוג` clause costs 0px at 360 and 17px at 390** — the opposite way round from the guess, because at 360 the sentence already wraps to two lines.

## Consequences

- **`DocumentUploadSheet` and `MapPlaceForm` keep the captioned `Field` composer** and are now the odd ones out. Deliberate: neither is one of the forms the report names, and `MapPlaceForm` sits on the Map's place card, whose height is arithmetic (ADR-0148 §1) and not something to disturb in a change about a different surface. On the backlog.
- **`labelMore` is gone**, so a form that grows a second notes block in future has no string to reach for — it should not be growing one.
- **`HostNotes` now accepts a host with no id.** The `NoteSheet` it can open is guarded on the id anyway; the guard is unreachable in practice (every form passes `canAdd={false}`, and a row can only be edited if a row rendered) and is there so the type is honest rather than asserted.
- **The band spec constrains the form's future.** That is the point, and the cost is that adding a field now requires deciding which band it is in. If it fits none, that is an ADR, not an append.

## Alternatives rejected

- **Aligning the entry mechanism too** — `＋ פתק` opening `NoteSheet`, exactly like tasks. The fullest reading of "align to the tasks style", and it reverses ADR-0152 §6b to make the common case (one note) cost a sheet. §2 has the argument: a task's box omits a deadline, a note's box omits nothing.
- **Widening `--sec-lead` to give the tick air** (the sibling report, fixed the same day). It honours the both-texts-start-at-the-same-x invariant too, and spends 6px of every note's width to fix a task's spacing.
- **A "מצורף" super-heading above band 5.** The form carries no group headings anywhere else, and it would put a fourth heading level above three sections that already have one. The rails in the mockup are its own chrome, not a proposal.
- **Keeping when above where and moving only `סוג`.** A smaller diff that preserves the exact gap that lets a typed time change meaning, and leaves the two forms disagreeing. If the order is a rule, it cannot run two ways in two forms.
- **Building `tsk-sec-quiet`** — ADR-0191 §7's quiet form density, specified and never written. Left open on purpose: this report asks the notes section to match the tasks section's **full-strength** look, which makes "does a form want a quieter density at all" a live question rather than a paint bug.
