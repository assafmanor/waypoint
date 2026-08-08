# 0174 — An attachment is **marked** and **opened**, and an event gets a **read**

**Status:** **PROPOSED** — designed and measured, **not accepted, nothing built.** §4 carries an open question the owner has to answer before any of it ships.
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

### 4. An event gets a read surface — **and this is the open question**

**Recommended: `EventDetail`, the peer of `BookingDetail`**, reached by the Plan row's tap, with `עריכה` as its own control.

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

**Nothing here is built until that call is made**, because it decides whether `EventDetail` is a new component or an unnecessary one.

### 5. The attach control gets 4px and moves above the notes

Owner, mid-session: the attach control should be _"a little more prominent, maybe have a little more height"_ and _"be above the notes section"_. Both are taken; both were drawn and measured rather than just agreed, because ADR-0173 §5's same-day amendment argued this slot **down** to 40px on a measurement (86px → 40px, saving 46px on a ~1565px form), so raising it again owes the same evidence.

- **Height: 40px → 44px.** The app's touch floor, and **measured: +4px** on the whole block (191px → 195px). Against §5's 46px saving that is noise; the amendment's argument was about a _header, an empty-state line and two entrances_, not about four pixels.
- **Prominence: the border stops being dashed.** This is the sharper half and it is not taste. `--cta` text on `--card` behind a **dashed** `--line` border is this app's grammar for **an absence** — the same dashed treatment `.bld-time.empty` uses to mark "this event has no time". So the control was reading as scaffolding rather than as an invitation, which is the report. The proposal: a **solid** border tinted toward `--cta`, a 5% `--cta` wash, and the 44px. It stays neutral — no amber, no teal, no violet — because rule 4 has nothing to lend a document either.
- **Order: attach above notes.** The reorder is **free** (it moves rows, it adds none), and §3 already argued why the same order has to hold on the read surfaces.

**One caveat recorded rather than left to be rediscovered:** on a _create_, the attach slot now sits above a notes composer whose `＋` is the form's most-used control, so that composer is 44px further down the scroll on a form ADR-0155 already measures at ~1565px against ~675px of visible phone.

### 6. What this does NOT do

Unchanged from ADR-0173 §9, and named again so the boundary is explicit rather than assumed:

- **No attaching from the document's side.** The one entrance stays the host's form. A second entrance later must reach the same link row, not become a second mechanism.
- **No "where is this document attached?" on the documents screen.** This is the _reverse_ read, and it is a real gap — ADR-0173's own Consequences flag that a document row can no longer be read as "belongs to the trip and nothing else". It is deliberately a **separate** decision: it is a third feature, and the owner's standing constraint this session was that the UI must not grow.
- **No auto-attachment**, no attachment to a `MaybeItem` or to another document, no change to encryption, download or the MIME allowlist.
- **No change to how the Trip-mode day card opens.** It already expands and that expansion already holds the notes; it gains the documents section (§3) and nothing else.
- **No change to Plan's hero.** ADR-0160 §H settled that separately and its reasoning (the prep hero summarises the checklist rendered beneath it) does not reach the row.

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
