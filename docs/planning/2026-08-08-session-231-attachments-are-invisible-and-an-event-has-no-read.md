# Session 231 — attachments are invisible, and an event has no read (design session)

**Date:** 2026-08-08
**Outcome:** [ADR-0174](../decisions/0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) — **PROPOSED, not accepted.** Mockup: [`mockups/attachments-and-event-preview-v1.html`](../../mockups/attachments-and-event-preview-v1.html). **Nothing built.**
**Branch/PR:** `claude/attachments-event-preview-ux-dphcvf`

## What the owner asked

Three reports, the third arriving mid-session:

> "After having added document attachments recently … there's no easy way to view attached documents or even any indication that we have attachments. Then what is it for? We must have an easy and quick way for it (without adding too much to the already crowded ui, important to remember)"
>
> "And speaking of having a hard time viewing attachments, there's no easy way to preview events, at least not in plan mode."
>
> "the attach document button should be **A.** a little more prominent, maybe have a little more height **B.** be above the notes section"

And the framing: _"in this session I want to decide how to handle both. Let's think and mockup, then we'll build what we've decided."_ So: think, draw, measure, **decide with the owner**, then build. This session is the first three.

## What the codebase actually said

The reports are all correct, and each one is checkable rather than a matter of taste. Recorded here because the ADR states them compressed:

| Claim                             | Evidence                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No indication anywhere            | `lib/attachments.ts` exports `attachmentCountsByHost` + `attachmentCountFor`, in `lib/notes.ts`'s exact shape. `grep` across `frontend/src`: **zero call sites.** The count was written for a mark and the mark was never built.                                         |
| No way to view                    | `DocumentChip` (`ui/DocumentAttach.tsx:246`) renders a title `<span>` and one `<button>` — and that button **detaches**. `MediaViewer`/`DocumentViewer` exists and is reached by `DocumentsSection`, `screens/Map.tsx` and `FilePicker`. **No host surface reaches it.** |
| Attachments show only in the form | `DocumentAttachField` is imported by `EventForm.tsx` and `BookingSheet.tsx`, and by nothing else. Not `BookingDetail`, not `EventCard`, not `BuilderRow`, not the map's place card.                                                                                      |
| No event preview in Plan mode     | `BuilderRow`'s `.bld-main` is a `<button onClick={onEdit}>` (`screens/PlanDay.tsx:1946`). On `readOnly` it is a `<div>` — so an **archived trip's events cannot be opened at all**, which nobody had reported yet.                                                       |
| Notes got all of this             | `NoteMark` on five row types; `HostNotes` on `BookingDetail`, the expanded `EventCard`, `MaybeManageSheet`, `DocumentManageSheet` and the map's place card. The asymmetry is not a decision — ADR-0173 §9's deferral list never mentions the mark or the read.           |

**The reframing that made it one session rather than two:** the answer to reports (a) and (b) is a _mark_ and a _section_, and a section needs a surface to live on — which is report (c). They are one shape.

## What the mockup changed

Five sections, every number read from the live DOM in headless Chromium at 390×844. **Two measurements changed what the ADR proposes**, and neither was what the file was drawn to find:

1. **The day card's second mark costs 0px** (86 → 86), because ADR-0152 §6c's place-name rule already fires on any row with a code and a mark. The **one** case that changes is _code + document, no note_: `hasMark` counts notes only, so the place name stays and is then **truncated to 48px of the 107px it needs**. With `hasMark` counting documents too it is 70px and nothing truncates. So the day card's change is **one predicate learning to count a second thing**, not a new rule — which is a much smaller diff than the session started out expecting.

2. **The Plan builder row costs +10px per row, and that is a prerequisite, not a cost.** `.bld-m` is a plain span holding a **joined string** with no `nowrap` and no element per part, so an appended inline-flex mark does not shrink the text — it **wraps** it. Rebuilt as ADR-0152 §6c already rebuilt `.wp-event-m`, the same row with both marks is 58 → 58, **+0px**. `.bld-m` has to get §6c's treatment _before_ it can carry §6c's mark.

Only a headless pass could have said either. Both are in the ADR because a reader meeting "+10px on every plan row" in a future diff would reasonably conclude the mark was a bad idea.

The rest, for the record: an openable chip costs **0px** (34px in all three variants); `HostDocuments` costs `BookingDetail` **+72px** for one document (56px section + chip); §4's three containers measured **497px** (today's form, and that is a _truncated stub_) / **+164px** (expansion) / **290px** (`EventDetail`); §5's promotion is **+4px** (191 → 195).

## The one thing left open

**§4: does the Plan row's tap stop opening the editor?**

Every container for an event preview assumes it does — the row has four targets already (`PlaceBadge` → map, `.bld-main` → edit, `.bld-time` → position, `⋯` → menu) and the owner's own constraint was that the UI must not grow, so a fifth is out. The ADR recommends `EventDetail` (the peer of `BookingDetail`) on three arguments: the drag geometry, the fact that a _booked_ event's read already exists as `BookingDetail`, and ADR-0053's own reasoning. The cost is one extra tap to edit a soft event in the mode whose job is editing — mitigated by `עריכה` already being the first row of the `⋯` sheet, by the time button already owning "move this", and by drag already owning reorder.

**That is a product call, not an inference, so nothing was built.** It decides whether `EventDetail` is a new component or an unnecessary one.

## What was deliberately not decided

- **"Where is this document attached?" on the documents screen** — the _reverse_ read. ADR-0173 §9 deferred it and ADR-0173's own Consequences already flag that a document row can no longer be read as "belongs to the trip and nothing else". It is now written down twice; the next session touching documents should decide it rather than inherit it a third time.
- Attaching from the document's side, auto-attachment, and any change to encryption/download/MIME — all still ADR-0173 §9.
- Plan's hero. ADR-0160 §H settled that, and its reasoning does not reach the row.

## For the next session

Read [ADR-0174](../decisions/0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) and the mockup, get the owner's answer on §4, then build. The build order that falls out of the measurements:

1. `.bld-m` rebuilt as a nowrap line of elements (prerequisite, height-neutral, no new behaviour).
2. `DocumentMark` + `hasMark` counting documents + wiring `attachmentCountsByHost` at the row hosts.
3. `DocumentChip` gains its open; `HostDocuments` beside `HostNotes`; the section on `BookingDetail`, the expanded day card and the place card (the last is ADR-0173 §4's already-decided follow-up).
4. §5's 44px + solid border + the reorder.
5. §4, **only after the owner's call.**

1–4 are independent of §4 and independently shippable.
