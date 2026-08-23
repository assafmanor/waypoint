# The rail came back with six reports — 2026-08-23

Session note for the second pass on [ADR-0203](../decisions/0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md), the day it shipped. Design reference: [`mockups/a-clock-follows-the-one-before-it-v1.html`](../../mockups/a-clock-follows-the-one-before-it-v1.html).

## What came in

Six reports, in the order they arrived, all from using the merged rail on a phone:

1. No gap between the `טיסה` type row and the journey block.
2. The arrival's time list opens at 00:00 whatever the departure was — _"it should always start ahead of the departure time… If it crosses midnight maybe even make it circular, wdyt? This holds for other bookings and events as well, so maybe we should add this as a primitive."_
3. _"the line spacing seems off: both for the layover and for the timezone."_
4. **The form could not be completed** — _"I'm unable to continue to the next step! Can't go past choosing the times!"_, then _"happened after I added a layover"_, then _"Perhaps I had missing fields in the form, but I received no nudge so idk."_
5. On a round trip the return leg is not offered the trip's end date.
6. A layover's two clocks do not say which is which.
7. _"The step titles should be pinned so that they aren't scrolled out"_, with before/after screenshots.

(Seven items; two of them — 1 and 7 — are the same surface and landed in one section.)

## The forks, and how they were settled

**Was the blocker (4) the layover or the times?** Neither. It is §9's summarisation meeting ADR-0150's delivery: a summarised node renders no `Field`, and that box is what the message renders in and what `report` looks up to nudge and scroll. The form refused and stayed silent. The owner's three sentences each named a symptom of one defect, and the third — "no nudge" — is the one that identified it.

Settled by reproduction, not inference. Two hypotheses were wrong first (an empty stop departure; an out-of-range date on a filled chain) and both were **eliminated by a spec that passed**, which is what pointed at summarisation. The reproduction is now the regression spec.

**Rotate the list, or filter it?** Rotate. `minTime` already filters and its own docblock explains why the report exists: it is passed only while the span's end is on the same calendar day, so a later day "passes nothing" and falls back to 00:00. Filtering here would delete a legal 00:45 arrival after a 20:30 departure. All 96 slots stay; only the order changes.

**Is rotation actually better?** The mockup said no, for the reported case, and that correction is in the ADR. For a 20:30 departure a 4h15 leg arrives 00:45, which the shipped 00:00-first order puts at row **3** — nearly optimal by luck. The honest claim is the invariance: the row a leg lands on is 2–86 today depending on where midnight falls relative to the departure, and a constant 3 rotated. The distance becomes a property of the journey instead of a coincidence. This was measured across three anchors rather than argued.

**Where does the day turn?** Not at midnight, and this is the one thing a reader would get wrong. Tokyo 21:00 → Honolulu 09:00 is the same calendar day. So the picker takes a `dayOffsetOf` callback and the host answers it through `resolveJourneyDays` — the derivation stays in one module and the primitive never computes a day.

**"Use it in all relevant areas" — how many are there?** One, and by construction. `transportProfile` sets `inMotion: true` for flight, train and transit only, and all three also title from their route, which is the other half of `isJourney`. So every in-motion span is a journey and renders the rail; what is left in `WhenField` is a stay and a hire, where anchoring a checkout on a check-in would be **wrong** rather than merely unnecessary. The prop lives on the primitive; the rail is its only caller. Counted rather than assumed, per root `CLAUDE.md`'s "count the call sites".

**Two sticky rows, or one sticky box?** One. Two siblings leave the scroll container's own gap between them and the content scrolls through it — 24px, measured. So `FormStepPanel` grew a `header` slot rather than each host writing a sticky rule.

## What the render caught that reading did not

Three things, and the third is the reason this note exists.

- The obvious claim about rotation was false for the reported case (above).
- A divider built from `.tp-list button`'s own class collapsed against the row above and read as a dead option.
- **Twice, the mockup's "before" columns were drawing the fix and grading it a win.** The file was written with its change and inlines the stylesheets that carry it, so the shipped CSS _is_ the "after". First render: 8px of zone-chip gap in both columns. Second: 44px rows and 12px seams in both. Every baseline is now explicitly restored under `.bld-was*`, and the file says so where a reader will look.

That last one is a new trap for a mockup written **after** its change rather than before, which is the shape a bug-report session produces. It is worth carrying into the skill.

## Also fixed on the way

A shipped ADR-0017 miss the render surfaced: `.tp-list button` measured **36.1px** against the 44px floor, on the control a traveller taps most while setting a journey. 14px measured 43.1px; 14.5px is exactly 44, and `.tp-list`'s cap grew so the same five rows stay visible.

## Verification

`frontend` 4386/4386, `pnpm typecheck` clean, and the two specs that matter most were each confirmed to **fail without their fix** — the deferred refusal delivery and the summarised-node reopen.
