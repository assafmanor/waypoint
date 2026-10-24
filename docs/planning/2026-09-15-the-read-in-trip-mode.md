# 2026-09-15 — The read in Trip mode: the day row has no way to an event's facts

**Outcome:** [ADR-0229](../decisions/0229-the-row-opens-what-you-do-and-the-read-is-one-tap-further.md) (**Proposed**, drawn twice and measured, not built) · mockups [`the-read-in-trip-mode-v1.html`](../../mockups/the-read-in-trip-mode-v1.html) then [`-v2.html`](../../mockups/the-read-in-trip-mode-v2.html) · [ADR-0174](../decisions/0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §6 amended in place · catalog + backlog updated.

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
3. **ADR-0223's mitigation is kept by one row family on this screen and broken by the other.** It deleted the confirmation code from five surfaces on _"every surface that dropped the code is one tap from the booking that has it."_ On the Trip-mode day a `TransitionRow` (a hotel check-in, a flight edge) and `UnplacedCommitment` both reach `BookingDetail`; the **event card** — what a booked activity renders as — reaches nothing. It went unnoticed because a **hard** row's edit warning happens to print the code (ADR-0174 §8's carve-out); a **soft booked** activity states it nowhere.
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

## Second round the same day — "let's be more creative in how we display the information"

The owner, against v1's text row. It is a **correction, not a fork** (root `CLAUDE.md`), so the default changed rather than gaining a sibling: v1's row survives in the drawing only as the measurement baseline and as what a placeless row actually gets.

**What the row got wrong** is not its position or its wording — both survive v2 untouched — it is that it _points at_ the information and displays none of it. The band displays: the place's photograph full-width, the address and its credit over the scrim, the whole thing the way into the read.

**And it is not a new mechanism.** `.wp-dayhead-shot` is already a band with a `figure`/`img`/`figcaption` scrim carrying "what it is" and the credit; the proposal renders that class and overrides a height, a radius and two clamps. Writing a second shot primitive would have been the duplicate this repo has four ADRs retracting.

**The fact that made it affordable, and the reason v1's argument was aimed at the wrong number.** `DayView.tsx:698` — `setOpenId((cur) => (cur === id ? null : id))`. The day is a single-open accordion, so the panel is paid once per day and never per row; the question is not what one card grows by but how much of a 640px screen the one open card takes. §2's frames are cut to a real screen and scrolled to the open card, and count what survives:

|          | card              | neighbours on screen |
| -------- | ----------------- | -------------------- |
| today    | —                 | 3 of 4               |
| v1's row | ⁦447px⁩           | 2 of 4               |
| the band | ⁦482px⁩ (⁦+35px⁩) | 2 of 4               |

**The photograph costs no more of the day than the sentence did.** That is the sentence the second round exists to be able to write, and it is a measurement.

### What rendering found this time — three passes, one wrong assumption

That the day head's caption, written for a short day title alone on its line, would hold an address and a credit with a control beside them.

1. The way-in pill painted **on top of** the credit.
2. Reserving a track for it fixed the overlap and broke the credit instead — ellipsised from its **start** (`…A 2.0 · Ulrich Latzenhofer`), mangling the one line on the band that is a licence obligation rather than a nicety (ADR-0166 §12.2: 27 of 32 Commons files require attribution). The pill moved to the band's top corner: **move the control, don't shrink the obligation.**
3. Neither line clamped, so a long address ran past the picture and the credit wrapped to two lines — at 88px that leaves almost no photograph.

All three would have shipped. None is visible in the source.

### The bolder structure, drawn and refused

A **two-sided panel** — `לעשות` (the verbs and the group's content) / `לדעת` (picture, summary, address, times, code), swapped by a segmented control. Genuinely different, and reading without leaving the day is a real advantage. Refused on three counts the drawing turns into numbers: the control sits on _every_ open card even when there is nothing to know, which is the clutter ADR-0228's amendment just removed; the `לדעת` side is a second copy of `bk-facts`, the shape ADR-0094 retracts; and it teaches a second navigation model inside a card when the sheet answers that question everywhere else.

### The forks now

Three, all in the ADR: the band's height (⁦72⁩/⁦88⁩/⁦116px⁩, 88 proposed), the summary under it (⁦+58px⁩, off proposed), and whether the card closes when the read opens. The first two are controls in the mockup's toolbar and are questions a phone in a hand answers.

## The correction that came out of starting the build

Point 3 above is the corrected version. **What was first written, pushed, and put in the ADR, the README, the backlog, the PR and both mockups was wrong:** that the Trip-mode day had _"no path to a booking at all"_ and that `BookingDetail`'s only callers were `PlanDay.tsx` and `IndexBookingsView.tsx`.

`BookingDetail` has **five** render sites — those two plus `Map.tsx` and **`DayView.tsx` itself**, which reaches it from `TransitionRow` and `UnplacedCommitment`. The error surfaced on the first file opened for the build, when `setDetailTarget` turned up already in `DayView`'s state.

**How it happened is the part worth recording**, because root `CLAUDE.md` names it exactly: _"count the call sites before claiming what a derivation does."_ The grep **was** run. Its output listed `screens/DayView.tsx`, and the line fell outside the `head -30` the result was read through. So the rule was followed and the reading was not — which is a different failure from the one the rule was written for, and a cheaper one to repeat.

**The defect is real and narrower, and the narrower version is sharper.** It is not one screen missing what other screens have; it is **one screen whose two row families disagree** about whether a booking can be read — and the family that cannot is the one a booked activity renders as, carrying the confirmation code. Nothing in the design changes: the band is still the answer, and it is now the answer to a better-stated problem.

## Built the same day

Owner: _"Let's build this, with the photographs, your recommendations."_ All three forks taken as recommended — the band at ⁦88px⁩, the summary off, the card closing behind the read.

**The extraction is the part worth recording.** The band could have reached across into `day-head.css` and worn `.wp-dayhead-shot` on an event card. There is precedent for keeping a misleading class name (`DetailSheet` kept `bk-*`, `MediaViewer` kept `doc-viewer-*`) — but both of those kept a name that still _described_ the thing. `wp-dayhead-shot` on an event card describes the wrong host. Root rule 8's own wording settles it: _"check whether a similar one-off already exists … and generalise that."_ One call site, ~20 lines of JSX, ~50 of CSS: a small extraction, not the substantial refactor the rule says to ask about. So `ui/domain/PhotoBand` exists, `DayHead` is its first consumer, and the read band is its second at a `card` density.

**The summary was not built, and that is a decision rather than an omission.** The recommendation was off; the owner took the recommendations; shipping the rule anyway would be shipping a fork nobody chose. The mockup keeps it in its own non-shipping block so the control still shows what the other answer costs.

**The mockup stopped proposing CSS.** Now that the band ships, `the-read-in-trip-mode-v2.html` inlines `photo-band.css` and `read-band.css` through its manifest and renders the app's real classes — a render of what shipped rather than a drawing of what was asked for. That is also how the photograph path was verified, since the dev seed carries no enrichment at all.

**What the running app proved that no unit could.** Driven headless against a seeded trip: the row in place on an open card, `להזמנה` on a booked row and `פרטים` on an unbooked one, the tap opening the sheet, the sheet carrying `קוד אישור`, and the card closed behind it.

**And one thing the suite caught that the tests did not.** All three new specs passed while `tsc` failed on them — vitest does not typecheck, so a `Booking` fixture carrying a `startsAt` it has never had, an image literal missing its whole provenance block, and a `Date` where the clock takes a number all ran green. The image fixture became `src/test/enrichment-image.ts` rather than a cast, because a spec that casts past a shape is a spec that stops noticing when the shape changes.
