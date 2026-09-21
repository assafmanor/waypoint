# 2026-09-21 — A shared day starts and ends at a bed

**Decision:** [ADR-0238](../decisions/0238-a-shared-day-starts-and-ends-at-a-bed.md) · **Mockup:** [`a-shared-day-starts-and-ends-at-a-bed-v1.html`](../../mockups/a-shared-day-starts-and-ends-at-a-bed-v1.html) · **Probed, designed, drawn and built the same day.**

## The ask

> The live sharing schedule + pdf don't take hotels check in / check out transits into account like the day view / plan day screens do, where the day starts and ends with going from / to the hotel. Thinking of it, I'm not even sure that it works correctly on ambient days (not check in / out days). So I want you to 1. Probe day view / plan day to see that they are taking care of this even on ambient days 2. Align live sharing and pdf, but first make adrs and mockups

## The probe, which is half the answer

**The day surfaces are right, and a middle night needs no rule of its own.** `dayBookendStays`
(`lib/glance.ts`) asks two independent questions of the ambient spans covering a date: `woke` is
the span that began **before** today, `sleeps` the one that runs **past** tonight. A check-in day
answers only `sleeps`, a check-out day only `woke`, a middle night answers **both with the same
stay**, and a hotel-change day answers each from its own span. Three branches would be a bug
waiting; two comparisons cannot have an ambient case.

Both day screens read that one function (`DayView.tsx:909`, `PlanDay.tsx:428`), and
`DayView.travel.test.tsx`'s whole _"the walk out of the bed"_ suite is already fixtured on a stay
running `2026-08-01 → 2026-08-05` asserted on the **3rd** — the file's own words: _"a strictly
middle one: ambient in both directions, and the case no edge row can stand in for."_ It counts
three journey blocks and asserts what the third one says. 184 tests green before a line changed.

So the report's doubt is real and its subject is the **projection**.

## What reading the projection found — three defects, and the second is the one nobody could see

**F1 · The chain has no ends.** Both shared renderers already draw a travel leg: `journeyLookup`
reads the **cached** route between consecutive placed stops and hands it to the destination row,
which prints it as `.sh-journey` / `.pdf-journey`. It starts at the day's first scheduled row and
stops at its last, so the two legs ADR-0206 §AD/§AS calls the most certain were on neither
surface. They could not be — `SharedDay.stay` was a **name in the header**, and a name is not a
position for a leg to hang on.

**F2 · A stay framed one night out of N, and the check-out printed on the wrong morning.**
`groupByDay` files an ambient span into exactly one bucket (correct, for the schedule — its own
comment says a four-night stay must not read as four stays), and the FRAME was read out of the
same buckets. So for a stay checked into on the 1st and out of on the 5th:

| day            | `day.stay` | `day.checkOut`                 |
| -------------- | ---------- | ------------------------------ |
| 1st (check-in) | the hotel  | —                              |
| 2nd            | **absent** | **`עד 11:00`** ← wrong morning |
| 3rd, 4th, 5th  | **absent** | —                              |

`stayMoments` asks "did last night happen somewhere else", which is true on the **2nd** the moment
the frame vanishes — and then reads the instant off that row's own `endsAt`, four days away. It
also silently starved `tripShapeOf`, whose docblock says it is _"the run-length encoding of
`day.stay`"_: the encoding skips absent entries, so an eleven-night trip handed it one, and a star
trip and a rolling trip produced the same array of length 1. The PDF's `לילות` tile counted the
same field, so an eleven-night trip in one hotel printed `1 לילות`.

**F3 · Every booked stop was invisible to the chain.** `journeyLookup` resolved an end as
`event.placeId ?? booking.fromPlaceId/toPlaceId`. ADR-0048 clears `Event.placeId` on every
booking-backed row and a non-transport booking carries its place on `booking.placeId`, so a booked
restaurant, a ticketed attraction and every hotel resolved to **nothing** — the pair was skipped
and `prevId` did not advance, printing the next leg from the row **before** the stop the reader can
see. The other four call sites in that file go through `eventStopPlaceId` and each carries a
comment saying why. This was the fifth. It is load-bearing rather than a drive-by: a hotel is a
booked row, so the bed has no coordinates until it is fixed.

## What the drawing measured, and what the render changed

The mockup's numbers are in the [catalog entry](../design/mockups.md) and the ADR. Three things
the **build** decided that the drawing could not show, all recorded there too:

1. **The reader page is an accordion**, and the file draws an open day. Every card but one is its
   header alone, so dropping the bed from the header would cost a reader the one fact they scan
   twelve days for. Shipped: the header names it when the card is **closed** and steps back to the
   day's summary when it is open, where the two rows say it with their legs attached.

2. **Summary draws no bed rows, and a real Chromium render is what decided it.** They first
   shipped at every level and `pdf-browser.service.spec.ts` put the nine-day reference trip onto
   **two** pages against ADR-0213 §4's one. §1's argument for giving a bed a position is that a leg
   needs a visible origin — and Summary has no legs, no clocks and no addresses. The fact stays on
   the header's own line there, exactly as it shipped.

3. **`stayEndKey` widens `dayBookendStays`, knowingly.** The app gates on `isAmbient`, which needs
   `endDate > date`; the share lifts **every** hotel row out of the schedule before the sections
   are built, so a one-night booking recorded as `17:00 → 13:00 tomorrow` with no `endDate` would
   vanish from the page entirely rather than fall back to being a row. That is the reference
   trip's own guesthouse. Backlogged as a **data** question (a stay crossing midnight should carry
   `endDate`) rather than as a second derivation.

And one the build found in its own diff: a bed's check-in must never print the span's far end.
`sharedTimeOf`'s `exact` arm appends `endsAt`, which for a stay is a check-out days away and reads
backwards — `15:00–11:00`, the exact defect ADR-0213's fourth amendment pulled stays out of the
schedule for, reappearing the moment they came back. Guarded in `bedTime`, not in the fixture.

## What was built

| file                                        | change                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/sharing.ts`            | `sharedJourneySchema` extracted; `sharedDayBedSchema` added; `stay`/`checkIn`/`checkOut` → `wokeIn`/`sleeps`; `SHARE_DAY_SUMMARY_KIND.STAY` removed |
| `packages/shared/src/day-title.ts`          | `fallbackDaySummary` loses its stay rung — the frame says it now                                                                                    |
| `backend/.../sharing-projection.service.ts` | `dayBeds`/`stayEndKey`/`bedTime`; the chain seeded and closed; `journeyLookup` goes through `eventStopPlaceId`                                      |
| `backend/.../itinerary-pdf.template.ts`     | `bedRow` replaces `stayWhen`; the header's stay clause is Summary-only; `.pdf-bed`; the nights tile counts nights                                   |
| `backend/.../hebrew.copy.ts`                | `PDF_STAY_GLYPH`; the day-summary stay string goes with its rung                                                                                    |
| `frontend/.../SharedItinerary.tsx`          | `BedRow`; `StayWhen` reads the two beds; the header's stay line is the closed card's                                                                |
| `frontend/.../shared-itinerary.css`         | `.sh-bed` — two declarations                                                                                                                        |

## What was verified, and how

A **real Postgres** (system cluster, no Docker in this session) plus the repo's own seed, so the
projection's integration spec ran rather than being written blind — which matters here because
every one of the three findings is about what a query returns, not about what a renderer draws.
Four new specs in `sharing-projection.service.spec.ts` over a two-night stay with a booked dinner:
the frame on all three days, the check-out on the morning you leave **and on no other**, both legs
with the morning bed carrying none, and the booked stop back on the chain. Backend **1406 passed**,
frontend **5918 passed**, shared **612 passed**, and the A4 smoke render back to one page at
Summary and two at Full.
