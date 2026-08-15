# 0189 — The editor uses the idiom the app already had, and a task is read where it sits

**Status:** Accepted, and **built** (2026-08-15, tasks phase 1b — [session note](../planning/2026-08-15-tasks-editor-built.md)). Every number below is measured, first off the mockup's rendered DOM and then off the **running app**; where the two differ, the running app's number is the one quoted.
**Date:** 2026-08-15
**Design reference:** [`mockups/task-editor-and-read-v1.html`](../../mockups/task-editor-and-read-v1.html) — §1 the form before/after · §2 the flag at three densities · §3 the assignee row and the word · §4 the four readings of a task. **Promoted by this ADR**; it was Proposed until now.
**Session notes:** [design](../planning/2026-08-15-tasks-editor-design-session.md) · [build](../planning/2026-08-15-tasks-editor-built.md)
**Build plan:** [`planning/2026-08-15-tasks-build-plan.md`](../planning/2026-08-15-tasks-build-plan.md) — phase 1b.

**Amends:** [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md), which designed the row, the two menus and both Home bands and **never designed the editor** — that omission is this ADR's whole reason for existing, and §3 below changes one behaviour ADR-0188 §3 implied.
**Builds on:** [0136](0136-an-event-can-be-booked-from-one-row.md) §1 (the boolean-in-a-form idiom this adopts verbatim), [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §4 (open-in-place, whose foot this generalises), [0133](0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) §3 (`Avatar` as the one renderer for a person), [0017](0017-mobile-first-device-targets.md) (the 44px floor every number here is measured against), [0118](0118-bidi-isolation-and-stored-content-direction.md) (which the build violated once and the running app caught)
**Relates:** [0098](0098-the-index-is-a-landing.md)/[0047](0047-home-is-the-trip-spine.md) (the tile order §4 settles), [0028](0028-plan-violet-color-budget-dark-ready.md) (the budget this spends nothing from), [0096](0096-reuse-existing-infrastructure.md) (rule 8, which is what every section below is an application of)

## Context

The owner reviewed shipped phase 1 and reported four things: _"The creation form seems amateur … the 'important' button is really ugly"_ · _"On the index, tasks should be above notes"_ · _"Who is in charge shouldn't have a default and it should have a different look, also `של כולנו` isn't a good description"_ · _"No preview for a task and no way to see the task info (פרטים)"_.

**They arrive together because they are one omission.** ADR-0188 designed the row, the two menus and both Home bands. It never designed the editor, and phase 1 built one anyway from `NoteSheet`'s shape **without rendering it**. Three of the four reports are that gap; the fourth is a field with no reader.

Three findings shaped everything below, and none of them is a matter of taste.

- **"Ugly" had a measurable defect under it.** The app already ships the boolean-in-a-form idiom — `EventForm`'s `יש הזמנה` row (ADR-0136 §1): a `.field` wrapper, `ToggleChip tone="cta"`, and `size="touch"`, whose stated job in `toggle-chip.css` is _"The touch floor (ADR-0017), for a chip that is its surface's primary control rather than one of a strip"_. Phase 1's chip had **none of the three** and measured **29px against 44**. Rule 8 found this, not an eye.
- **`של כולנו` was a name collision with phase 6, not a copy nit.** The brief's §6 has three assignment states: _nobody_ ("one of us"), _one person_, and _everyone_ (each completes it for themselves, `completedBy[]`). Phase 1 gave the **first** state the **third**'s word, and the owner read it as the third — which is the report.
- **`body` was write-only.** The editor wrote it and one grep said nothing rendered it: not the row, not the menu, no detail surface. "No way to see פרטים" was not a missing affordance but a field with no reader at all.

## Decision

### 1. The `important` flag is `EventForm`'s `יש הזמנה` row verbatim, and the word is `חשוב`

`.field` + `ToggleChip tone="cta" size="touch"` + a star, which is ADR-0136 §1 letter for letter. No `field-label`: the button says `חשוב`, and a label above it saying the same word is that word twice for 20px.

Measured in the running app: **44px**, against the 29px phase 1 shipped. **The floor arrives from the primitive** — nothing in `tasks.css` sets a size, and the only new rule is the star's `fill`.

**`חשוב`, not `חשובה`** (owner, 2026-08-15). Grammatically `משימה` is feminine and the shipped string agreed with it; the call is that the flag is a **label** rather than an adjective about the task, so it does not inflect. Carries to `סימון כחשוב` / `ביטול הסימון כחשוב` in the `⋯` sheet.

**Rejected: a star alone beside the title field**, drawn and measured at §2ג. It saves a whole row and reads clean, and it fails on two things: a star with no word is a symbol that must be learned, and a **create** form has no other row to teach it; and the touch floor forces a 44px box inside a field row — which is exactly what `ValueToken` solves with an `::after` overlay precisely because it sits **inside a sentence**, and here there is no sentence. The star survives as the mark on the row, where it already works (ADR-0188 §3).

### 2. The assignee row is `ChoiceGrid layout="pills"` with a PERSON where the glyph goes

The row **is** the shipped primitive. Scroll, snap, edge mask, `useCenterSelected` centring and the radiogroup ARIA all arrive from it untouched, and what it grows is **one optional field on `Choice`**.

**Why not the shipped text pill.** `layout="pills"` is the app's **filter** grammar — the Index category chips, the Map facets — and phase 1 spent it unchanged on an assignment. The two then look the same and mean opposite things: a filter narrows what you see, this decides who owes the outcome. ADR-0153 §4 dropped the author's avatar from a note **row** because identity served no decision the reader was making there; in this form the reader **is** making it, so the same rule points the other way.

**And it meets 44px, which the shipped pill does not.** `choice-grid.css` records that debt in place: `.choice-pill` is 36px "here AND on the shipped category selector", and raising it moves three shipped surfaces, one with an arithmetic card height (ADR-0148 §1). **A new host is not bound by a deferral it did not incur** — it scopes its own sizing exactly as `.category-pills` already does, and pays nothing. Measured in the running app: **45.7px** per option against the shipped **28px**.

**The field landed as `lead?: ReactNode`, not the `AvatarPerson` the design proposed** — and the reason is the unassigned option. It is a **person-shaped absence**: the same circle with a group glyph instead of a face, dashed while unchosen. There is no person to pass for it, so a typed field would have forced it to be a differently-shaped chip beside the people — which says "this is a different kind of answer" about the same question's **default** one. `Avatar` still does all the drawing (ADR-0133 §3); the primitive just does not need to know that is what it is holding.

**What the render caught that reading did not.** The design's first draft grew a **second scroller** — a bespoke `flex-wrap` grid of 60px avatar columns, which at a realistic roster (five people + unassigned) measured **156px across three lines** against the pill row's 21px. A parallel mechanism was being born, and the measurement is what exposed it. That is the finding, more than the number.

### 3. `לא משויך` is the word AND the default — and the word is what brings the default back

The owner's report said the assignee should have no default. The design removed it on that rule. **The owner then reinstated the default with the new word, and that is not a reversal of the rule but an application of it.**

"No answer should be presumed" is correct while the word is `של כולנו`, because that word is a **claim about the task** and a presumed claim can be false. `לא משויך` is a **description of the form's own state**: when nobody has been chosen, nobody is in fact assigned, so the lit option cannot be wrong. What is **saved** is identical either way (`assigneeUserId: undefined`) — only what the reader is told changes.

Not inflected for `משימה`, the same call as §1: it names a state, it does not describe the task.

**Rejected: `מישהו מאיתנו`** — the brief's own words, accurate to the behaviour (one tick closes it for the group), and it **promises that somebody will take it**, which the form does not know. **Rejected: `של הקבוצה`** — too near the `של כולנו` it replaces, so it repeats the phase-6 collision in different words. Both were drawn live in the mockup's own control and read in place before the fork was closed; the control was then removed, because a control for a settled fork is a fork that gets re-opened.

Either way, **`של כולנו` is freed for phase 6**, which is what the report was actually about.

### 4. A task is READ WHERE IT SITS, and the row's tap stops opening the editor

ADR-0153 §4's second amendment already settled this one feature over: a row's tap **opens it where it is** — the clamp lifts, a foot line appears, no sheet and no scrim, and the list stays where it was. A task inherits that idiom rather than growing a detail surface.

**This changes phase 1's behaviour, deliberately.** Phase 1 pointed the row's tap at the **editor**, and the consequence is the fourth report: `body` had no reader anywhere in the app. Now the tap opens the task, and editing is one press away from the foot's `עריכה` and from the `⋯`.

- **Every row opens, whether or not it has a body.** An open task with no details still shows who owes it and the verb — the same answer the notes screen already gives on a host's section, where the words were never what was missing.
- **The "there is more" mark is a separate claim** and it costs the row **0px**: one `⋯` glyph at the end of the meta line, present only when there is a body, absent while the row is open because the words are printed underneath by then. Its job is to say there is more, not to print it.
- Measured: the open block adds **+46.3px** in the mockup (28.1px of body + 37.9px of foot in the running app, for this fixture), against **216.5px** for the detail sheet drawn beside it and **rejected** — a sheet takes you out of the list you are scanning in order to show one line of text.

**The foot is GENERALISED, not copied.** `.note-open-foot`/`-host`/`-sp`/`-act` become `.row-open-*` in a new `ui/domain/row-open.css`, with `RowOpenFoot` as the shared shell over them; `NoteOpenFoot` keeps only what is note-specific (the url line, and what the lead says). A task wearing a class called `note-open-foot` is the parallel copy under a borrowed name, and ADRs 0078/0079/0094/0095 exist only to undo four of those. `.wp-listrow.is-open`'s own rule moved with it, since it describes any row that opens rather than a note.

### 5. The Index tile order is `הזמנות · משימות · מסמכים · פתקים`

Below the spine, one rule: **order by whether a tile can be LATE.** A task expires and a missed one costs the thing it was guarding (brief §11); a document does not change; a note never expires at all — ADR-0153 §1's own tile line is "what did someone just write", a browse rather than a need.

**Bookings keeps the lead it has held since ADR-0047/0049.** The design session first recommended `משימות` first, and that was dropped against a sentence already in `Index.tsx`: prominence for a time-bearing entity comes from the **Home bands** (phases 2–3) rather than from chrome. Leading the landing with tasks spends the first slot on prominence the bands are already paying for, and takes it from the trip's spine — the tile most consulted on the ground.

## Consequences

- **`ChoiceGrid` gains one optional field (`Choice.lead`)** and `choice-grid.css` gains nothing. The 44px density is the host's own wrapper (`.tsk-who`), which is `.category-pills`' shipped pattern and leaves the deferred pill debt exactly where `choice-grid.css` records it.
- **`RowOpenFoot` + `row-open.css` are net-new shared infrastructure with two consumers on day one**, which is the bar rule 8 sets. A third surface that opens a row in place adds a `lead` and nothing else.
- **`.note-open-foot`, `-host`, `-sp`, `-act` no longer exist**, and neither does `.wp-listrow.is-open` in `notes.css`. Four test files and one e2e spec were renamed with them; `.note-open-url` stays in `notes.css`, because a url is a note's own fact rather than a shape two features share.
- **The row's tap means "open", not "edit", on the tasks screen.** Stated here so a later phase does not treat it as an inconsistency with phase 1 and quietly restore it. The spec that asserted the old behaviour was rewritten rather than deleted.
- **Five `he.ts` strings changed** (`importantLabel`, `manage.flag`, `manage.unflag`, `sheet.nobody`, `subject.group`) and **no new copy was needed** — the foot reuses `t.tasks.manage.edit` and the open row's lead reuses `t.tasks.sheet.nobody`.
- **A bidi defect was introduced and caught by running the app, not by the suite.** `.tsk-open-body` renders stored content, so it needs `dir="auto"` (ADR-0118); without it the block inherits the page's RTL and a body opening with a Latin or numeric run comes apart. Measured live: the first glyph of `2-14-5 Kabukicho, Shinjuku` painted at **x=404** in a box spanning 53–449, and at **x=67** once the attribute was added. **jsdom cannot see this** — it is the class of bug the unit suite is structurally blind to, and it is why the mockup's "render it" rule extends to the built screen.
- **The tile order is now pinned by a spec.** Nothing else in the app enforced it, and three e2e specs selected the documents tile **positionally** (`.nth(1)`), which the reorder silently repointed at tasks — a wrong screen, not a failed click. All three select by name now.
- **`.checklist` vs `.index .listcard`** stays on the backlog, untouched here.

## Alternatives considered

- **A star alone beside the title field.** Rejected (§1): a symbol to learn in a create form, and a 44px box inside a field row with no sentence to hang an `::after` on.
- **Keeping the shipped text pills for the assignee.** Rejected (§2): the app's filter grammar spent on a question that is not a filter, at 28px against a 44px floor.
- **A bespoke avatar grid for the assignee.** Rejected (§2) and measured: 156px across three lines at a five-person roster, against 47.7px on one line — a second scroller, which is the parallel mechanism rule 8 exists to stop.
- **`Choice.person?: AvatarPerson`, as designed.** Rejected (§2) in the build: no person exists for the unassigned option, so the type would have forced it into a different shape and made the default answer look like a different kind of answer.
- **No default on the assignee.** Rejected (§3), and by the owner who first asked for it — the objection was to a presumed **claim**, and `לא משויך` is a description, which cannot be wrong.
- **`מישהו מאיתנו` and `של הקבוצה`** for the unassigned state. Rejected (§3): one promises somebody will take it, the other repeats the phase-6 collision.
- **A detail sheet for a task.** Rejected (§4) and measured at **216.5px** against **+46.3px**: it takes you out of the list you are scanning to show one line of text. ADR-0153 §4 rejected the same thing for notes and built the in-place expansion instead.
- **Copying `.note-open-foot` under a task name.** Rejected (§4): that is the parallel copy, and four ADRs in this repo exist only to undo instances of it.
- **`משימות` first on the Index.** Rejected (§5) against `Index.tsx`'s own comment — the Home bands already pay for a task's prominence, so the landing's lead does not owe it a second time.
