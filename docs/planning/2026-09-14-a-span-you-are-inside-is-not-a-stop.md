# 2026-09-14 — A span you are inside is not a stop

**Outcome:** [ADR-0227](../decisions/0227-a-span-you-are-inside-is-a-condition-not-an-event.md), designed and built in one session.
**Mockup:** [`a-span-you-are-inside-is-not-a-stop-v1.html`](../../mockups/a-span-you-are-inside-is-not-a-stop-v1.html)

## The report

The owner, with two screenshots of one Iceland afternoon — the collapsed board at ⁦15:31⁩ with `The Garage` up next, and the same board lifted:

> _"Events that don't have an exact time, but are like 'from... Until...' like hotel bookings, car rentals etc. are looking a little awkward on the hero and the lifted hero, especially when it makes then collide with other events. […] the app should prioritize glanceability, not long sessions, during the trip, so that means less clutter and less detail and more keeping to the important stuff, especially on the trip hero."_

## What reading the code changed

Read as written, this is a request to remove things from a crowded card. Three greps turned it into three faults, and **two of them are false statements** — which a smaller font does not fix.

1. `clusterAround` grows a stop through `spansOverlap`, and `spansOverlap` is true of **containment**. Measured on the reported day: `clusterAround(The Garage)` → **5 members**, `deriveNow(15:31).nextAll` → 5. ADR-0041 has said since July that containment is a nest and only partial overlap clusters; `buildTimeTree` still implements it and `DayView.tsx:581` drops ambient stays before asking, so the day and the hero disagreed completely — while `clusterAround`'s docblock asserted they could not.
2. `isAmbient` is `ambientWhenMultiDay && isMultiDay`, so a **same-day** hire never reached Home's filter. `deriveNow(12:20)` → `now: Iceland Car Rental`, lunch at `nowAll[1]`.
3. `edgeMeaning` and `.tr-clock[data-bound]` already answer the "from/until" question — on the day row only.

**The count was the deliverable, not the preamble.** Every one of these was a one-line probe against a real fixture, and the third fault was only visible because the first two had been measured rather than reasoned about.

## The fork that mattered, and how it was settled

The obvious fix for §A is "exclude containment". It is **measurably wrong**: `spanContains` needs one strict edge, so `08:30–10:00` beside `08:30–09:30` reads as containment and two waterfalls that start together stop being one stop. Applying it turned `time.test.ts`'s `groups nextAll by the earliest upcoming start` red.

That is why the mockup drew **three candidate rules on two cases** rather than one recommendation: the second case is what falsifies the middle option, and no amount of prose would have. The discriminator that survives is `midSpan.kind === 'held'` — the axis ADR-0063 already built for exactly this question.

## Forks put to the owner, and the answers

All three as recommended (_"I accept your recommendations, write the ADR and build"_):

- **§A** — `midSpan.kind === 'held'`, not containment, not a duration threshold.
- **§B** — a held span's middle keeps the now-slot **only when nothing else is running**; always-backdrop was the runner-up and deletes a state session 215 designed deliberately.
- **§C** — the word (`מ-16:00`), not the full open bracket, which measured ⁦4px⁩ on the densest line on the card.

## Two things the render corrected, and one the suite did

- **The board does not get shorter.** The file's first draft claimed the meta line wraps today and straightens after — a ⁦19px⁩ saving. With Assistant loaded it wraps **neither way** (⁦17px⁩ → ⁦17px⁩). The first probe had been taken without `render.mjs`'s curl-proxied webfonts, and the fallback face is **wider** than Assistant — `pitfalls.md` documents this trap with the fallback narrower, so it ran the other way here and would have made the file report a win it never measured. What actually shrinks is the lift: ⁦778.2px⁩ → ⁦623.2px⁩.
- **§4ג is not free** — ⁦4px⁩ — which is what turned §C from a preference into a recommendation.
- **The lift stopped opening**, and only the suite could see it. Filtering the held span out of the schedule also removed it from `nowAll`, which the horizon is built from, so on a day whose only event was the hire the board drew `כרגע · הרכב אצלנו` correctly and `canLift` answered "nothing to lift" — the one surface carrying that span's booking, notes, files and settle became unreachable. A journey never had the problem because journeys were never filtered. `heroNowAll` states the rule once: the horizon's now-points are whatever the board is showing.

## Method note worth keeping

Every new spec was run against the **pre-change** derivation and confirmed to fail, and the two-waterfalls guard was additionally run against the **rejected alternative** and confirmed to fail there. A spec that passes either way measures nothing, and this session had three chances to ship one.
