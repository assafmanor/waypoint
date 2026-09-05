# 0174 — An attachment is **marked** and **opened**, and an event gets a **read**

**Status:** **ACCEPTED AND FULLY BUILT** — §1/§2/§3/§5/§7 in session 232, and **§4 in session 233** on the owner's word (_"make sure that you build everything that we've decided"_). Session 233 also added **§8**, which retires ADR-0152 §6c's composition rule outright: the owner's call is that a row shows glyphs and no text at all. Read the amendments at the end before §1, §5 or the Consequences — the mockup was re-measured with the app's real typefaces and at 360×640, and two of its numbers changed an argument rather than a digit. **§7 is new**: the lifted Trip hero, which this ADR's first draft did not mention at all and which is the surface the feature exists for.
**Date:** 2026-08-08
**Session note:** [`planning/2026-08-08-session-231-attachments-are-invisible-and-an-event-has-no-read.md`](../planning/2026-08-08-session-231-attachments-are-invisible-and-an-event-has-no-read.md)
**Mockup:** [`mockups/attachments-and-event-preview-v1.html`](../../mockups/attachments-and-event-preview-v1.html)

**Builds on:** [0173](0173-a-document-attaches-and-detaches-never-dies.md) (the model and the authoring this completes — §4's follow-up and §9's deferrals are the boundary), [0172](0172-a-linked-pair-is-one-context-and-a-place-may-inherit-it.md) (`lib/host-context.ts`, reused whole a third time), [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6c/§8 (the mark's rules, extended to a second content type), [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §6/§8 (the mark and the section), [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (the read-surface grammar §4 proposes for a second entity)
**Relates:** [0011](0011-hard-soft-event-model.md) (§4's guard argument), [0029](0029-trip-mode-day-scope-gating.md) / [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (the archived-trip hole §4 closes), [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §H (why Plan's hero does not lift, and why that reasoning does not reach the row), [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) (the drag geometry §4 weighs), [0015](0015-document-encryption-server-side.md) / [0034](0034-document-encryption-trust-model.md) / [0069](0069-document-download-only-and-mime-allowlist.md) (untouched — this ADR adds no permission)

## Context

Three owner reports in one session, and they turn out to be one shape.

> "there's no easy way to view attached documents or even any indication that we have attachments. Then what is it for?"
>
> "there's no easy way to preview events, at least not in plan mode."

ADR-0173 shipped the **model** and the **authoring** and stopped there. Three things follow from where it stopped, and all three are verifiable in the shipped code rather than matters of taste:

1. **Nothing renders a count.** `lib/attachments.ts` exports `attachmentCountsByHost` and `attachmentCountFor` — written for a row mark, in the same shape as `noteCountsByHost`/`noteCountFor` — and **no file calls either of them.** The count exists; nothing shows it. That is report (b), exactly.
2. **No tap in this app opens an attached file.** The only surface that renders an attachment at all is the host's own edit form, and there `DocumentChip` is a title span plus one button that **detaches**. The viewer exists — `MediaViewer`/`DocumentViewer`, the app's one full-screen reader, already reached by the documents list, the map's place photos and `FilePicker`'s pre-save look — and nothing on a host reaches it. That is report (a), and it makes the whole feature write-only.
3. **An event has no read surface.** A booking has one (`BookingDetail`, ADR-0053). In Trip mode the day card expands and that expansion is the read. In **Plan mode** the row's tap opens `EventForm` — so the only way to read an event is to open its editor and scroll past a title field, an icon picker, a category grid, a place picker and a when field. And on a **read-only archived trip** `.bld-main` renders as a `<div>` rather than a `<button>`, so a finished trip's events cannot be opened at all: the mode that is supposed to be a browsable archive (ADR-0040) is the one where nothing opens.

The reports are one shape because the answer to (1) and (2) is a **mark and a section**, and a section needs a surface to live on — which is (3).

**Contrast worth stating once:** notes got all of this and documents got none of it. `NoteMark` is on the day card, the booking row, the map's place rows, the plan shelf's ideas and the document rows; `HostNotes` is on `BookingDetail`, the expanded day card, the map's place card, `MaybeManageSheet` and `DocumentManageSheet`. The asymmetry is not a decision anyone made — ADR-0173 §9's "what this does not do" list never mentions the mark or the read, because they were assumed rather than deferred.

## Decision

### 1. A row says it carries a document, with the note mark's exact shape

A `DocumentMark` beside `NoteMark`: the app's own `documents` silhouette, `--muted`, 13px, a count only past 1, `role="img"` + `aria-label` + `title`. Every one of those is `NoteMark`'s own rule, and the reason to copy them rather than re-decide them is `NoteMark`'s own stated reason — **one shape everywhere, so "document" has ONE silhouette across the app**, the same one the attach control, the picker and the Index tile already use.

**It is a read-only indicator, not a tap target**, on ADR-0152 §8's argument unchanged: ~16px against a 44px floor, and widening it would put it in competition with opening the row it sits in. The reach is the row's own open, which §3 and §4 are.

**Two marks, not one combined "has content" glyph.** They are not the same promise — a note is something a person _wrote_, a document is a file you may have to _show someone at a border_ — and one glyph cannot say which of the two a tap will get you.

**The mockup's §1 measured this and found two things the drawing did not set out to find.**

- **On the day card the second mark costs 0px of height (86px → 86px)**, because ADR-0152 §6c's rule already fires: `eventMetaParts` drops the place name on any row that has a code _and_ a mark. **The one case that changes is a row with a code and a document but no note.** There `hasMark` counts notes only, so the place name stays and is then **truncated to 48px of the 107px it needs**. With `hasMark` counting documents too, nothing truncates and the height is identical. So the mark is not a new rule — **it is one predicate learning to count a second thing**, and that is the whole of the day card's change.
- **The Plan builder row costs +10px PER ROW, and that is a prerequisite rather than a cost.** `.bld-m` is a plain span holding a **joined string** with no `nowrap` and no element per part, so an appended inline-flex mark does not shrink the text — it **wraps** it onto a second line. Rebuilt the way ADR-0152 §6c already rebuilt `.wp-event-m` (one `nowrap` line, elements rather than a joined string, the code its own flex item), the same row with both marks is **58px → 58px, +0px**. **`.bld-m` must get §6c's treatment before it can carry §6c's mark** — which is the same fix the day card already received, not a new idea, and it is the reason this is a decision and not an adjustment.

Only a headless pass could have said either of those. Both are recorded because a future reader looking at "+10px on every plan row" in a diff would otherwise reasonably conclude the mark was a bad idea.

### 2. The chip is the way IN, and the detach is its sibling

`DocumentChip` becomes: the **whole chip a button that opens the document in `MediaViewer`**, with the detach `✕` as a **sibling**, never a child — because buttons do not nest, which is the same reason `ListRow`'s trailing slot is a sibling and `.note-chip`'s `✕` sits outside `.note-chip-t`.

This is `.note-chip`'s shape exactly, and `.note-chip`'s own comment already argues it for the other content type: _"the text is a BUTTON, because a committed note has to be editable before the host is saved."_ A document is the same case one step further along — it has to be **readable** before the host is saved, since the whole point of attaching a boarding pass on the way is that you meant to look at it later.

**Measured: the way in costs 0px.** 34px as-is, 34px openable-with-detach, 34px read-only.

**A read surface has NO detach, and that asymmetry is deliberate.** Detaching is an authoring act and stays where attaching happens — on the host's form. This follows ADR-0173 §4's own logic (a place displays, never originates) applied to every read surface, and it buys two things: one less control on each of them, and no destructive tap on a surface someone opened to _look_ at something.

### 3. `HostDocuments` — the peer of `HostNotes`, one component, the same derivation

One connected component, `HostNotes`'s sibling in every respect: it resolves through **`lib/host-context.ts`** (ADR-0172's derivation, reused whole for the third time and not re-derived), renders the chips of §2, and carries no add control on a read surface.

`HostNotes`'s own file records why it exists as one component rather than as a wiring per host: _"`BookingDetail` did it inline first, which was right for one host; documents and ideas would have been the second and third copy of the same eight lines — the shape ADR-0094/0096 exist to stop."_ Documents are at exactly that moment now — the place card, the booking detail and the expanded day card all want the same list — so the second copy is the one not to write.

Where it goes, which is wherever `HostNotes` already is **and** the host can carry an attachment:

| Surface                       | Today            | With this                                                                             |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `BookingDetail`               | notes only       | + documents (**measured: +72px** for one, of which 56px is the section)               |
| Expanded day card (Trip mode) | `notesSlot`      | + a documents slot above it                                                           |
| Map place card                | notes, inherited | + documents, inherited — **this is ADR-0173 §4's follow-up**, decided and never built |
| `EventDetail` (§4)            | does not exist   | + documents                                                                           |

**§6's visibility rule is untouched and comes along for free**, because the resolution is `documentsForAttachments` over the document list the reader already has: an attachment whose document this reader cannot see resolves to nothing and renders nothing. This ADR adds a pointer and no permission, exactly as ADR-0173 §6 did.

**Documents read ABOVE notes on every surface**, which is also §5's answer arriving early. The reason it is right in both places: a document is _a thing you need_ and a note is _something about it_; and there are almost always fewer documents than notes, so the shorter, fixed-length list goes first and the growing one goes last. The app must not teach two sequences for one pair.

### 4. An event gets a read surface — **BUILT (session 233)**

**`EventDetail`, the peer of `BookingDetail`**, reached by the Plan row's tap, with `עריכה` as its own control. The owner's answer to the open question below was yes; what follows is the case as it was put, kept because the cost is real and someone will ask about it again.

The mockup drew three containers over the same Plan day and measured them:

| Container               | Height                                                       | Covers the day? | Fights the drag? | Exists already? |
| ----------------------- | ------------------------------------------------------------ | --------------- | ---------------- | --------------- |
| A · today's `EventForm` | **497px** (a truncated _stub_ — the real form is far taller) | Yes, entirely   | No               | Yes             |
| B · expansion in place  | **+164px** under the row                                     | No              | **Yes**          | No              |
| C · `EventDetail` sheet | **290px**                                                    | Partly          | No               | **Half**        |

**Height does not decide it.** Three other things do, in order of weight:

1. **The drag.** A Plan row is a press-and-hold drag source _and_ a drop target whose resolution measures boxes (`resolveRowDrop`, `useFlipRows`, `useHoldToDrag`, ADR-0161). An expansion changes one row's box in the middle of that list, so **B is the only option that has to earn its way past machinery A and C never touch.** Trip mode's card expands precisely because that list is _not_ a drag list — which means B is not "the consistent option", it is the option that borrows a pattern from a surface whose constraints are different.
2. **C half exists.** A linked booking and event are **one context** (ADR-0172 §1), so a _booked_ event's read already has a surface — `BookingDetail` — reached today from the Index and from nowhere in Plan mode. C is therefore "give the unbooked event the peer, and route the booked one to the sheet that already exists". B would need a second read grammar standing beside `BookingDetail` doing the same job.
3. **It is ADR-0053's own argument.** That ADR made a booking's read-only sheet the guard for a hard commitment and put editing behind a deliberate tap. An event carries the same commitment when it is hard (ADR-0011).

**What it costs, and this is the owner's call, not an inference:** the Plan row's tap stops opening the editor, so editing a **soft** event in the mode whose job is editing takes one more tap.

The case that it is affordable, stated so the owner can weigh it rather than take it on trust:

- `עריכה` is **already the first row of the row's `⋯` sheet**, so nothing is lost — it is relocated, and the same number of taps as today by that route.
- The **time button already owns the most common builder edit** ("move this", ADR-0161 §7), and **drag already owns reorder**. What is left to the form is rename, category, place, hard/soft and the note — none of which is the per-second builder loop.
- It **closes the archived-trip hole** for free: `readOnly` currently makes the row a `<div>`, and a read surface is exactly what a browsable archive wants.
- The row's marks become **honest**: a mark that promises content is worth having only if a tap gets you the content.

**The alternative the owner may prefer** is to keep tap → edit and reach the read some other way. The mockup states why every "other way" examined is worse: the row already has four targets (`PlaceBadge` → map, `.bld-main` → edit, `.bld-time` → position, `⋯` → menu) and a fifth is precisely the crowding the owner warned against; the marks cannot be the target (ADR-0152 §8, and they sit inside `.bld-main`'s button, which cannot nest); and putting the read in the `⋯` sheet is the thing the owner already rejected once for notes (_"notes don't belong in a menu"_ — a row menu is a list of verbs, ADR-0138 §1).

**The call was made and it is built.** And building it answered the question the ADR could not: `EventDetail` is neither a new component nor an unnecessary one — it is **half of one**. Written out by hand first, its shell came out identical to `BookingDetail`'s line for line (`Sheet` → `.bk-detail` → `.bk-actions` → `.bk-head` → `.bs-hard-note` → `.bk-facts` → `HostDocuments` → `HostNotes`), which is precisely the parallel-copy shape ADR-0078/0079/0094/0095 are retractions of. So the shell was **extracted into `DetailSheet`** and both surfaces render it; what stays per-file is the facts, which are the part that genuinely differs. `BookingDetail`'s 30 tests pass unchanged through the extraction, which is the evidence it is faithful.

**The archived trip is closed as promised.** `.bld-main` is a `<button>` at every scope now, and on `readOnly` the read opens with **no `עריכה` at all** — absent rather than disabled, per ADR-0150 §8.

### 5. The attach control gets 4px and moves above the notes

Owner, mid-session: the attach control should be _"a little more prominent, maybe have a little more height"_ and _"be above the notes section"_. Both are taken; both were drawn and measured rather than just agreed, because ADR-0173 §5's same-day amendment argued this slot **down** to 40px on a measurement (86px → 40px, saving 46px on a ~1565px form), so raising it again owes the same evidence.

- **Height: 40px → 44px.** The app's touch floor, and **measured: +4px** on the whole block (191px → 195px). Against §5's 46px saving that is noise; the amendment's argument was about a _header, an empty-state line and two entrances_, not about four pixels.
- **Prominence: the border stops being dashed.** This is the sharper half and it is not taste. `--cta` text on `--card` behind a **dashed** `--line` border is this app's grammar for **an absence** — the same dashed treatment `.bld-time.empty` uses to mark "this event has no time". So the control was reading as scaffolding rather than as an invitation, which is the report. The proposal: a **solid** border tinted toward `--cta`, a 5% `--cta` wash, and the 44px. It stays neutral — no amber, no teal, no violet — because rule 4 has nothing to lend a document either.
- **Order: attach above notes.** The reorder is **free** (it moves rows, it adds none), and §3 already argued why the same order has to hold on the read surfaces.

**One caveat recorded rather than left to be rediscovered:** on a _create_, the attach slot now sits above a notes composer whose `＋` is the form's most-used control, so that composer is 44px further down the scroll on a form ADR-0155 already measures at ~1565px against ~675px of visible phone.

### 8. The row shows GLYPHS and no text, which retires ADR-0152 §6c

Owner, from a device, with a screenshot (2026-08-09): _"the text is overflowing … events and bookings should only show the glyphs in their row, no names or ids."_

**What was on screen.** A Plan row whose confirmation code was `הזמנה #MEGAZIP-T141215488` — not the `הזמנה MN-4471` every measurement in this ADR and in ADR-0152 was taken against. The code is `flex: 0 0 auto` by §6c's own rule (it must never lose its tail), so it could not shrink; the place name beside it was squeezed to **zero width**, leaving a stranded `·` next to nothing; and the line overflowed the row into the badge and the `⋯`.

That is §6c's own "a two-character stub is noise, not information" failure, arriving through the one part of the line §6c had protected.

**The rule that replaces it is smaller than the rule it replaces.** ADR-0152 §6c existed to decide **what gives way when the line is full**. There is no longer anything on the line to give way: the place name and the confirmation code both come off, and what stays is the sync badge and the two marks. `eventMetaParts` is deleted rather than narrowed — a predicate that returns constants is a place for a future reader to go looking for a rule that no longer exists — and the meta line does not render at all on a row with no glyph and no sync marker.

**Neither fact is lost, and that is what makes it affordable rather than merely smaller.**

- The **place** is the badge, which is also the way to its pin (ADR-0121 §8).
- The **code** is one tap away in the read this row now opens (§4), where `BookingDetail` states it as a `Fact` and the expanded day card's hard-edit warning already prints it.

**What the row says now** is what a row is for: what this is, when it is, and **that there is something here**. The last of those is exactly what a glyph says, which is why the marks are the part that stays.

**One correction the e2e caught, and the unit suite could not.** The first build gated the
meta line on "does it carry a glyph", so an unmarked row lost the line entirely. That is
wrong: `sync` is an **opaque node the screen passes** (`<EntitySyncBadge/>`, which is silent
when synced), so `EventCard` cannot tell whether it will draw anything — and gating on it took
the **pending sync badge** off the row along with the glyphs, breaking ADR-0091/0092 on every
row with a write in flight. The line renders unconditionally; empty it is a flex box with no
children, 0px plus its 3px top margin. jsdom could not see this (`!!sync` is true either way,
and it reports every rect as zero); the browser could.

**Recorded because it will look like a regression in a diff:** a reader meeting "the day card stopped showing confirmation codes" will reasonably think something was lost. It was moved, on the owner's call, after the shipped version overflowed on a real code.

### 7. The lifted hero reaches the file, and that is where this feature was actually missing

**The first draft of this ADR did not mention the lifted hero once**, and it is the single most
important surface here. `HeroLift` (ADR-0160) is Trip mode's read for what is happening now and
next. It already carries `איפה`, `פתק` with a count of what it is not showing, the booking reach
and `הסדרה` — and it showed **no documents at all**. You are standing at the gate, the flight is
`now`, and the boarding pass attached to it is invisible on the one screen built for standing at
a gate. If attachments are worth a mark anywhere, they are worth a reach there first.

**The reach is a chip in the point's own `hero-acts` row, not a section.** That row's own comment
already reads _"every way out of a point, in ONE row"_ — `במפה`, `ניווט`, `להזמנה` — and opening
the document is a way out of the point, reached the same way. Measured on one point: a
`HostDocuments` section is 324px, the chip is 300px, the mark alone is 258px. The chip saves 24px
against the section and reaches the file in the same **one tap**; the mark saves 42px more and
reaches nothing, which is today's defect one surface over.

**It is a DENSITY on the shared chip, and the density was already in the stylesheet.**
`.hero-act`'s base rule is a white 7% fill under the `--on-dark` ramp, and **every call site today
passes `.loc` (teal, a place) or `.time` (amber, a booking)** — so the neutral base had no consumer
at all until a content type arrived that rule 4 has no hue to lend. What is genuinely new is one
`.doc` modifier capping the width and letting the title ellipsise, because a document's title is
the only stored content in that row. That is ADR-0139's rule arriving one surface over: a fourth
host adds a density, not a second control.

**The derivation is extended in `lib/hero-horizon.ts`, and it resolves through ONE context.** The
trap ADR-0160 §I already recorded is ours too: the hero reads a booked event's notes from the
**booking** as well as the event, because a booked event is materialized server-side and has no
client id when the booking saves. Attachments have exactly that shape, so `toPoint` now resolves
`resolveHostContext(…)` **once** and reads both content types from it — two calls is how the note
list and the document list start answering about different hosts on the one row where it matters.

**`canLift` learns to count a document**, and that is not a formality: a point whose only depth is
an attached file would otherwise answer "nothing to lift" and take the rebuff — the board refusing
to open onto the one thing it now has to show.

**Two things come for free and one stays refused.** `הבא בתור` gets the chip because `HeroLift`
already renders `<Where point={next} />`. `אחר כך` gets nothing, also for free, because `HeroThen`
carries no id — ADR-0160 §12's condition holds without a line of code. And the collapsed board
gains nothing: it is the glance surface whose budget ADR-0028 already spent.

### 6. What this does NOT do

Unchanged from ADR-0173 §9, and named again so the boundary is explicit rather than assumed:

- **No attaching from the document's side.** The one entrance stays the host's form. A second entrance later must reach the same link row, not become a second mechanism.
- **No "where is this document attached?" on the documents screen.** This is the _reverse_ read, and it is a real gap — ADR-0173's own Consequences flag that a document row can no longer be read as "belongs to the trip and nothing else". It is deliberately a **separate** decision: it is a third feature, and the owner's standing constraint this session was that the UI must not grow.
- **No auto-attachment**, no attachment to a `MaybeItem` or to another document, no change to encryption, download or the MIME allowlist.
- **No change to how the Trip-mode day card opens.** It already expands and that expansion already holds the notes; it gains the documents section (§3) and nothing else.
- **No change to Plan's hero.** ADR-0160 §H settled that separately and its reasoning (the prep hero summarises the checklist rendered beneath it) does not reach the row. §7 above is the **Trip** hero, which does lift.
- **No document on the COLLAPSED board.** It is the glance surface, and ADR-0028 already spent its budget; the reach lives in the state you asked for.

## Reuse audit (ADR-0096 / root `CLAUDE.md` rule 8)

- **The count** — `attachmentCountsByHost` / `attachmentCountFor`, which already exist and are called by nothing. §1 is their first consumer, not a new derivation.
- **The mark** — `NoteMark`'s shape, size, count rule and a11y contract, copied deliberately rather than re-decided (§1).
- **The meta line** — ADR-0152 §6c's `nowrap`-line-of-elements rebuild, applied to `.bld-m`, which is the same fix rather than a second one (§1).
- **The section** — `HostNotes`'s structure and `lib/host-context.ts`'s derivation, third consumer, not a copy (§3).
- **The chip** — `.note-chip`'s button-plus-sibling-`✕` shape (§2).
- **The viewer** — `MediaViewer`/`DocumentViewer`, the app's one full-screen reader, gaining a call site and no variant (§2).
- **The read surface** — `BookingDetail`'s `Sheet` + `Fact` grammar, with the booked event routed to `BookingDetail` itself rather than to a copy of it (§4).
- **Net-new**: `DocumentMark`, `HostDocuments`, and — **only if §4's open question resolves that way** — `EventDetail`.

## Consequences

- **No schema change, no migration, no backend work.** Every derivation this needs already ships; what is missing is render.
- **`.bld-m` is rebuilt**, which touches every Plan row. Height-neutral when done (measured), and a prerequisite of the mark rather than a side quest.
- **`eventMetaParts`'s `hasMark` learns to count documents**, which changes exactly one case (§1) and leaves every other row byte-identical.
- **Four surfaces gain a section** and `BookingDetail` gains ~72px per attached document.
- **If §4 resolves to C**, Plan mode's row tap changes meaning — the one genuinely user-visible behaviour change in this ADR, and the reason it is Proposed.
- **The documents screen still cannot say where a document is attached** (§6). That gap is now written down twice; the next session that touches documents should decide it rather than inherit it a third time.

## Alternatives considered

- **One combined "has content" mark.** Cheapest on the meta line. Rejected (§1): the two glyphs make different promises and one cannot say which a tap will get you.
- **Making the mark a tap target.** The most direct answer to "no easy way to view". Rejected on ADR-0152 §8's measurement: ~16px against a 44px floor, competing with the row's own open.
- **An expansion in place for the Plan preview.** Consistent with Trip mode's card and it leaves the day visible. Rejected as the recommendation (§4): it is the only option that has to survive the drag geometry, and it needs a second read grammar beside `BookingDetail`.
- **A fifth target on the Plan row for the preview.** Rejected on the owner's own constraint (§4): the row has four already.
- **The read inside the `⋯` sheet.** Rejected: the owner rejected exactly this for notes — a row menu is a list of verbs, and content read from inside a menu is content nobody finds.
- **Keeping the attach control at 40px and dashed.** It is what ADR-0173 §5's amendment measured its way to. Overridden by the owner's report, and §5 records the measurement (+4px) so the override is a trade rather than a reversal of the reasoning.

## Amendment (2026-08-08, session 232) — the mockup was measuring the wrong typeface

Run through the `design-mockups` skill (ADR-0175, which landed on `main` mid-session), and it
found the design half of this ADR asserting numbers it had not earned. Both corrections are here
rather than in a new ADR, because each narrows a specific numbered section.

### A. Every number in the first draft was measured on a fallback font

`mockups/attachments-and-event-preview-v1.html` **had no webfont link at all**, so every px it
reported — and every px §1–§5 above quoted — was a measurement of the sandbox's system face, in
the one part of a mockup that claims to be real. `references/pitfalls.md` names this exactly.
Assistant / Secular One / JetBrains Mono are linked now, and the skill's `render.mjs` serves them
through curl and says which faces loaded.

The corrected figures: the day card's second mark still costs **0px**; the openable chip still
costs **0px**; `HostDocuments` costs `BookingDetail` **+76px** (not +72); the expanded day card is
**422px**; `EventDetail` is **436px**; §5's promotion is **+4px** on a control that measures 44px.

### B. §1's "+10px per plan row" is really "+0px at 390, +14px at 360"

The file measured one phone. The skill requires 360×640 as well as 390×844, and ADR-0017 calls
360 **the design width, not the stress case**. With the real Assistant face the joined string in
`.bld-m` happens to fit a 390px phone and **wraps on a 360px one**.

That does not weaken §1's conclusion, it sharpens it: `.bld-m`'s rebuild is still the prerequisite
of the mark in Plan mode, and it is now **a defect you would not have seen on the phone you tested
on**. Rebuilt as ADR-0152 §6c already rebuilt `.wp-event-m`, the row is 58px → 58px at both widths.

### C. §7's hero exceeds its card at 360×640, and the file had said otherwise

At 360×640 the densest states are **over the lift card's room**: `in-transit` + one document is
668px against 622px (46px over), and `עכשיו` + two documents is 659px (37px over). The mockup had
reported "fits, no scroller" for a day, and the reason it was wrong is worth keeping:

**`.wp-board.hero-lifted`'s `max-height: 100%` is a percentage against a `.modal-card` whose own
height is `auto` with a `max-height`** — and a percentage against an indefinite parent resolves to
`none`. So the hero grows **past** the card rather than bounding inside it, `.hero-scroll` never
overflows, and asking "is the scroller scrolling" answers "fits" about a card that is 46px over.

This is the same class of state ADR-0160 §8 already tabulates as "over" at that width (`heavy` 72px,
`group-split` 92px), so it is not new and it is not a blocker — but **it means ADR-0148 §1's
bounded-card promise may not be holding on the real surface**, which no unit test can see (jsdom
answers zero for every rect). It is a backlog line and an e2e assertion, not a reason to withhold
the chip: the chip's own cost is +42px and exactly **0px** when nothing is attached.

### D. §5 gets a range, and the recommendation is a shipped geometry rather than a new treatment

The owner's reply to §5's first pass was that 44px plus a tinted border **still reads as a faint
outlined afterthought**. Six variants were drawn and all measure 40–48px, so height was never the
axis; what was wrong is that `--cta` text on `--card` behind a **dashed** `--line` border is this
app's grammar for **an absence** (`.bld-time.empty` says "this event has no time" the same way).

**Built: `.pp-trigger`'s geometry** — the place picker's own empty slot, two fields up on the same
form: 44px, a solid `--line` border, `--radius-12`, `--card`, start-aligned like every other slot,
with the weight carried by an **icon in a tinted square** and a trailing `＋`. `--cta` where the
picker puts teal, because rule 4 has no hue to lend a document.

**A filled `--cta` was drawn and refused on a structural reason, not a taste one:** the form already
has exactly one filled `--cta` and it is `שמירה` (`.fa-primary`), sticky at the bottom of the same
scroller. Two filled CTAs on one form is a hierarchy error and the one that loses is the save.

**And one variant reversed its own verdict.** A supporting line under the label was drawn expecting
to be refused on height — it measures **44px, the same as the recommendation**, because two lines
of 14.5px and 11px stack to ~36px and ride inside the touch floor. So it costs nothing at all, and
the argument against it is that a permanent instructional sentence sits on every booking and every
event forever. **That is a copy judgement and it is the owner's**, not a layout one.

## Build log (2026-08-08, session 232)

Built: §1, §2, §3, §5, §7. **Not built: §4**, which is the owner's call.

- **`.bld-m` first** (§1's prerequisite), rebuilt as one `nowrap` line of elements with only the
  place name shrinking. Height-neutral at both widths, no behaviour change. What it deliberately
  does **not** take from ADR-0152 §6c is the place-name DROP: that rule exists because the day
  card's line is exactly full at 390px, and measured here the builder row holds a 44-char address,
  a code and both marks on one line with only the name losing its tail.
- **`DocumentMark`** beside `NoteMark`, and `eventMetaParts`'s `hasMark` counting both. One
  predicate learning to count a second thing; every row but code + document + no note is
  byte-identical.
- **`attachmentCountsByHost` / `attachmentCountFor` gained their first call sites**, through a new
  `attachmentCountForContext` mirroring `noteCountForContext` — so a booked row's mark counts the
  booking's links too. Wired at the day card, the Plan builder row (**which had neither mark
  before**), the Index booking row and the map's place rows.
- **`DocumentChips`**, extracted from `DocumentAttach.tsx` rather than copied: one chip shared by
  the form and every read surface, owning the viewer state so five hosts do not each hold a
  `useState` + `<DocumentViewer>` pair. The form keeps the detach; no read surface has one.
- **`HostDocuments`** as `HostNotes`'s peer over the same derivation, on `BookingDetail`, the
  expanded day card and the map's place row — the last being ADR-0173 §4's follow-up, decided and
  never built. It renders **nothing** when empty, which is where it parts from `HostNotes`: that
  section's empty line is what its `＋ פתק` is inviting, and a read surface has no add control.
- **Two CSS declarations only the real markup could have shown**, both one line and both already
  existing for `.note-sec`: `.wp-event-actions-in > .docr-sec` (the expanded card gives its
  content blocks their own padding and rule) and `.place > .docr-sec` (`.place` is a wrapping flex
  **row**, so a section joins the row unless it is `flex-basis: 100%`). The canvas place card's
  grid gained a row for the same reason.
- **The hero** (§7), extended in `lib/hero-horizon.ts` — pure and clock-free, as it was.

## Amendment (2026-09-05) — the read shows the place's knowledge ([ADR-0219](0219-a-day-is-a-place-you-can-see.md) §6)

§4 made a row's tap a **read**, and the read has never said anything about the place beyond its address. `PlaceKnowledge` — the picture, the credit under it, the clamped summary marked `באנגלית` where it is, and `עוד בגוגל` — serves the Map's place card and Plan's research card and no third host. ADR-0219 §6 puts it in `EventDetail` directly under `DetailSheet`'s head, at `KNOWLEDGE_DENSITY.DECIDING`, with the full picture opening in `MediaViewer` the way the Map's does. The one build cost is extracting its base rules out of `map.css`'s `.map-placecard:has(.map-hero)` scope into a sheet of its own.

**Built 2026-09-05, and one thing in the sentence above was wrong.** `עוד בגוגל` is **not** part of `PlaceKnowledge` — it is `Map.tsx`'s own `.map-refs` row, beside the schedule and delete verbs, and it always has been. What the component renders is the picture, the credit under it, and the clamped summary with its language marker; the read gets exactly that. The description was written from the deciding card as it READS on the Map, where the exit is a sibling of the block rather than inside it, and `EventDetail.test.tsx` now asserts the absence so the next reader of this paragraph finds the answer rather than the claim.

**Whether the read should have a Google exit of its own is a real question and it is left open.** The summary is clamped to three lines with nothing to expand into, so the rest of a long extract is unreachable from here — which is the exact reasoning `PlaceKnowledge`'s own `עוד ›` control carries for the collapsed density. Answering it means either a new prop on the component or a second exit beside it, and neither is this amendment's to decide.

The base rules live in `ui/domain/place-knowledge.css` now; the class names stay `map-*`, because they are what the component renders and what the Map's own layout rules select through. `place-knowledge.contract.test.ts` holds the split — every base rule in the component's sheet, none left stray in the Map's, and the Map card's `:has()` grid still in the Map's.
