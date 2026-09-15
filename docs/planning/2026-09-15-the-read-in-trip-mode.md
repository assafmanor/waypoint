# 2026-09-15 — The read in Trip mode: the day row has no way to an event's facts

**Outcome:** [ADR-0229](../decisions/0229-the-row-opens-what-you-do-and-the-read-is-one-tap-further.md) (**Proposed**, drawn and measured, not built) · mockup [`mockups/the-read-in-trip-mode-v1.html`](../../mockups/the-read-in-trip-mode-v1.html) · [ADR-0174](../decisions/0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §6 amended in place · catalog + backlog updated.

## What was asked

The owner, with three screenshots of the running app — the Trip-mode day with `Jökulsárlón Zodiac Boat` expanded, and the same booking's read in Plan:

> There's a discrepancy between day view (trip mode) and plan day (plan mode), between how we display information about events and bookings. See how the plan day has a way to see info while trip mode doesn't.
>
> We should think how to do this in a way that's convenient and like not a main function probably, because trip mode should be more glanceable, different than plan mode.

A design task, explicitly: "ux ui thinking, planning, and mocking up", with the mockup as the deliverable.

## What reading the code changed, before anything was drawn

Four things, and the count matters because three of them narrow the problem and the third changes its status.

1. **The gap is the facts, not "a read".** Both surfaces already reach the trip's own content in one tap — `HostDocuments` → `HostTasks` → `HostNotes` render inside `EventCard`'s expansion (the `*Slot` props) and inside `DetailSheet` for Plan. What Trip cannot reach is `DetailSheet`'s `knowledge` + `facts`.
2. **The verb band cannot host the reach.** `event-actions.ts` gates every entry on `live(c) = c.today && !c.readOnly`; a row on another day gets `[]` and `EventActions` returns `null`. So a read living in that band would be absent on tomorrow's row and on a finished trip — the two places the facts matter most.
3. **ADR-0223 relies on a path that does not exist.** It deleted the confirmation code from five surfaces on the mitigation _"every surface that dropped the code is one tap from the booking that has it."_ `BookingDetail`'s callers are `PlanDay.tsx` and `IndexBookingsView.tsx`. The Trip-mode day view has none — and it went unnoticed because a **hard** row's edit warning happens to print the code (ADR-0174 §8's carve-out). A **soft booked** row states it nowhere.
4. **ADR-0174 §6 had already answered the question, and its answer expired.** _"No change to how the Trip-mode day card opens. It already expands and that expansion is the read."_ True on 2026-08-08; ADR-0219 §6, ADR-0223 and ADR-0228 each moved something out from under it. §6 is amended in place rather than contradicted from a distance.

Point 3 is what turned this from a preference into a defect, and it is the reason the ADR is framed as **completing ADR-0223** rather than as an addition.

## What was drawn

Five sections, measured off the rendered DOM at 360×640 and 390×844 in both themes.

| container                       | card height | vs. today                         |
| ------------------------------- | ----------- | --------------------------------- |
| א · today                       | ⁦393px⁩     | —                                 |
| ב · read row in the panel       | ⁦447px⁩     | ⁦+54px⁩                           |
| ג · a fifth control on the face | ⁦393px⁩     | ⁦0px⁩ height, ⁦26px⁩ of the title |
| ה · the facts inside the card   | ⁦557px⁩     | ⁦+164px⁩                          |

ה's ⁦+164px⁩ is the same number ADR-0174 §4's own mockup measured for "expansion in place" on the Plan row. Coincidence, recorded because it will look like a copied figure.

## What rendering it found

- A real confirmation code (`#MEGAZIP-T141215488` — ADR-0174 §8's own device report) **wraps the shipped `.wp-event-hard-warn` onto two lines**. It wraps rather than overflows, so it is not a defect; it is ⁦16px⁩ spent on a fact the read states properly, and one more argument for where the code belongs.
- The file's first pass **hand-rolled the `⋯` sheet** (`sheet-card`, `rowact`) and it rendered as one squashed line. The real tree is `Modal` → `RowActionList`. This is the rule-8 failure the format exists to catch, committed inside the file whose premise is that it does not invent markup — worth recording precisely because it happened here.
- The way-in glyph was `NavArrow`, which is the app's **back/route** arrow. "Through to another card" is already drawn once, as `<Icon name="caret" dir="left" />` in `.map-know-more`.

## The forks put to the owner

1. **The row's density** — label (⁦44px⁩) · label + address (⁦54px⁩, shipped as the recommendation) · label + address + a two-line summary. The mockup carries the control; the device pass owns the answer.
2. **Whether the card closes when the read opens**, or the duplicated host sections are lived with as Plan effectively does.

Both are in the ADR's closing section. Nothing is built until they are answered.

## Not taken

- No ADR for the hard-warn wrap: it wraps, it does not overflow, and the fix is ADR-0229 itself.
- No second mark on the meta line, no picture in the read row, no long-press — each refused in the ADR with the rule it would have broken.
