# 0227 — A span you are inside is a **condition**, not an event

**Status:** **Accepted and built 2026-09-14**, in one session with the design. Owner, on the mockup: _"I accept your recommendations, write the ADR and build"_ — §A / §B / §C as recommended. Build log in §5.
**Date:** 2026-09-14
**Reported:** the owner, with two screenshots of one Iceland afternoon — the board at ⁦15:31⁩ with `The Garage` up next, and the same board lifted.
**Mockup:** [`mockups/a-span-you-are-inside-is-not-a-stop-v1.html`](../../mockups/a-span-you-are-inside-is-not-a-stop-v1.html)
**Session note:** [`planning/2026-09-14-a-span-you-are-inside-is-not-a-stop.md`](../planning/2026-09-14-a-span-you-are-inside-is-not-a-stop.md)

**Refines:** [0225](0225-two-things-at-one-time-are-one-stop.md) §7 (`clusterAround` is the cluster's membership rule, and containment was never part of it), [0059](0059-booking-presentation-on-home-and-index.md) §1/§2 (a bracketed booking surfaces at its transitions — now for a SAME-day span too, and its strip takes them), [0054](0054-ambient-span-events-off-the-day-schedule.md) (ambient says how a span renders across days; it was standing in for "a span you are inside", which is a different question).
**Applies unchanged:** [0041](0041-parallel-overlapping-events.md) (containment is a nest, partial overlap is a cluster — this makes the hero obey it), [0063](0063-category-time-behaviour-profile.md) (`midSpan.kind` is the axis), [0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) / [0210](0210-a-day-is-points-lines-and-envelopes.md) §2 (a held span's ends are a floor and a ceiling), [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §1/§12 (one object at two elevations; no third slot), [0028](0028-plan-violet-color-budget-dark-ready.md) / root rule 4 (no new hue — this spends none).

## Context

> _"Events that don't have an exact time, but are like 'from... Until...' like hotel bookings, car rentals etc. are looking a little awkward on the hero and the lifted hero, especially when it makes then collide with other events. […] the app should prioritize glanceability, not long sessions, during the trip, so that means less clutter and less detail and more keeping to the important stuff, especially on the trip hero."_

Read as clutter, this is a request to remove things. Reading the code first turned it into **three separate faults, two of which are false statements** — and a false statement is not cleaned up by being made smaller.

### 1 · `בו-זמנית · ועוד 4` is not true, and the day view already disagrees

`clusterAround` grows a stop through `spansOverlap`. **`spansOverlap` is true of containment too**, so a stay running ⁦16:00⁩ → ⁦11:00⁩ the next morning overlaps the supermarket run, the aurora, and two of tomorrow's stops — and all four join the check-in's stop. Measured on the reported day: `clusterAround(The Garage)` answers **five members**, `deriveNow(15:31).nextAll` answers five events.

ADR-0041 decided the opposite in 2026-07: **a parent is the smallest event that strictly contains a child, and only _partial_ overlap clusters**. `buildTimeTree` still implements it, and `DayView.tsx:581` filters ambient stays out before even asking — so the day draws a bookend `StayRow` plus four ordinary rows while the hero draws one stop with four peers. `clusterAround`'s own docblock claimed the two "cannot disagree about who is in the stop"; it was false the day it was written, and no test could see it because every ADR-0225 fixture used partially-overlapping spans.

The lift compounds it: the peer rows print `⁦09:30–10:10⁩` with no day token, so a stop eighteen hours away reads as this morning.

### 2 · A held span can own `עכשיו` for nine hours

Home drops an ambient span once you are inside it. But `isAmbient` is `ambientWhenMultiDay && isMultiDay`, so a **same-day** car hire is never ambient, survives the filter, and — being hard — wins `byPrimaryNow`. Measured: `deriveNow(12:20)` over a ⁦09:00–18:00⁩ hire and a ⁦12:00–13:00⁩ lunch answers **`now: Iceland Car Rental`**, with the meal you are sitting at in `nowAll[1]`.

Session 215 designed what a held middle _looks_ like (`כרגע · הרכב אצלנו`, no rail, no travelling mark, an amber deadline rather than a teal arrival). It never asked whether that middle should be the card's **subject** while something else is happening.

### 3 · The clock already knows, and only the day prints it

`edgeMeaning` has answered `not-before` for a check-in and `not-after` for a check-out since ADR-0171, and `.tr-clock[data-bound]` has drawn the open bracket on the day row since ADR-0210 §2. The board prints a bare `16:00` beside `🔒 קשיח`. The pair reads as an appointment you can be late for.

## Decision

**A span you are inside is a condition, not an event.** A stay, a hire, a locker is a resource you hold: its **ends** are moments and its **middle** is a state you are in. Three rules follow, and none of them adds a mechanism.

### §A · A held span is never a peer

`clusterAround` excludes `midSpan.kind === 'held'` from the pool, and a held seed clusters alone. The hero then agrees with `buildTimeTree` by construction, and the reported board's `בו-זמנית · ועוד 4` and the lift's four-row block both simply go.

**The discriminator is the category axis, not the geometry**, and that is a measurement rather than a taste. "Exclude containment" was tried first and is measurably wrong: `spanContains` needs only ONE strict edge, so `08:30–10:00` beside `08:30–09:30` reads as containment, and two waterfalls that start together — plainly one stop — stop being peers. `time.test.ts`'s `groups nextAll by the earliest upcoming start` went red on it. A test now guards that case against the rejected alternative rather than a comment describing it.

### §B · A held span's middle yields the slot; its ends do not

Two changes, one rule.

- **The schedule filter asks `midSpan.kind` directly.** `isAmbient(e) && !isJourney(e)` was "a multi-day held span", and the multi-day half was never part of the argument — it is just where the predicate came from. The replacement is simpler AND broader, and changes nothing for a multi-day span: the only ambient categories are lodging (held) and transport (journey, exempt before and after alike).
- **The board's in-transit slot is gated on nothing else being in progress.** When something is, the subject is what you are doing and the span drops to the `.stay-strip` — the slim dismissible teal strip ADR-0059 §2 already built for exactly "you are inside a booking". When nothing is, the middle keeps the slot exactly as session 215 drew it, because then there is nothing for it to talk over.

**Its ENDS are untouched, and that is the line.** `transition-arrival` — a return deadline inside its emphasis window — is the "what do I need in the next 30 minutes" question this card exists for, so it outranks lunch and is deliberately not gated.

The strip's source generalises with it: `heldSpansOnDate` replaces `ambientEventsOnDate(...).find(!isJourney …)`, which was that predicate with a multi-day restriction nobody wanted. A journey is now excluded by construction rather than by a guard at the call site.

**Never both.** The one state the wider source newly creates is the one where the board is already saying it, so the strip stands down when the board's now-point _is_ that span.

### §C · The next slot's clock states its bound

`מ-16:00` for a check-in, `עד 11:00` for a check-out, a window as its two authored numbers, an exact moment as the bare clock it always was — through `edgeTimePhrase`, the app's one answer to this question, which had two callers already (the day's transition row, the ambient strip). This is the third, not a fourth phrasing (root rule 8). The lift takes the board's own string, so both elevations are one derivation.

**The word, not the bracket.** `.tr-clock[data-bound]`'s full open bracket is more correct in the abstract and costs ⁦4px⁩ — measured, meta ⁦17⁩ → ⁦21⁩, card ⁦268⁩ → ⁦272⁩ — on a line already carrying a transition label and a lock. The character earns its place; the box does not, on this surface. It stays drawn in the mockup as the live alternative.

## Consequences

- **The board does not get shorter, and saying so would have been a win nobody measured.** With Assistant loaded the meta line fits on one line at ⁦360⁩ both ways (⁦17px⁩ → ⁦17px⁩, card ⁦268px⁩ → ⁦268px⁩ — ADR-0225 §6's own measurement holding). What shrinks is the **lift**: ⁦778.2px⁩ → ⁦623.2px⁩. The win of §A is a false claim going away.
- **§C slightly widens the window case.** The branch it replaces printed a range only while the next slot WAS the hero booking; `edgeTimePhrase` asks `windowBoundOf` unconditionally, as the day row does. A windowed event that is merely next now reads as a range here too — the board agreeing with the day, not a new behaviour.
- **Plan and the Map are untouched, and that is counted rather than assumed.** `clusterAround` has exactly one caller (`deriveNow`); `PlanDay` renders off `buildTimeTree`, which already nested correctly; `buildDayStopSequence` has read `buildTimeTree` since ADR-0225 §10.
- **A same-day held span is now a first-class backdrop**, which it never was: it reaches the strip, and `ambientSpanPosition` had to stop reading `endDate!` (`Math.max(1, NaN)` is `NaN`). Its own docblock had already said a same-day span should answer 1 rather than 0; this makes that true.
- **No new hue, no new component, no stored state.** Rule 4 spends nothing; the one CSS rule the mockup proposed was for the rejected §4ג and is not built.

## Alternatives, and the measurements that killed them

- **Exclude containment from the cluster (§A).** Rejected by measurement, not by argument — see §A. The falsifying case is now a test.
- **A duration or ratio threshold** ("a container more than 3× its contents", "longer than four hours"). Rejected: a number nobody authored and nobody could defend, on an axis that already has an answer in the data.
- **A held span is always backdrop (§B's ג).** Simpler, and it deletes a state session 215 designed deliberately. The gate keeps it exactly where it reads well and removes it exactly where it collides; the condition is stated once.
- **`.tr-clock`'s full open bracket on the board (§C's ג).** ⁦4px⁩, on the densest line on the card. Drawn and kept as the live alternative.
- **A "what is inside this stay" list in the lift.** This is precisely what ADR-0160 §12 refused when it refused a third slot: a hero that starts itemising the day has started competing with the Day tab, and the Day tab wins.
- **`3 לילות` on the board's next meta.** At ⁦15:31⁩ what is needed is "check in, ⁦16:00⁩, hard". The nights belong to the Index, and adding them returns exactly the density the report asked to remove.

## Build log (2026-09-14)

Built as decided, with **one thing the drawing could not have caught**, found by the suite rather than by review.

- **`clusterAround` excludes held spans** (`lib/time.ts`), seed included. Three specs: a stay does not pull its contents in, a stay is not dragged into a dinner's stop, and the two-waterfalls guard against the rejected alternative — which was verified to FAIL under that alternative rather than assumed to.
- **`heldSpansOnDate`** (`lib/glance.ts`) replaces the strip's one-off; `ambientSpanPosition` tolerates a span with no `endDate`.
- **Home**: the schedule filter, the `heldMiddleYields` gate, the strip's source and stand-down, and `nextTimeText` through `edgeTimePhrase`. `nextShownEdge` is hoisted and read three times — the horizon's edge, the zone, and now the bound — where three sites had been re-deriving the same comparison.
- **THE THING THE MOCKUP COULD NOT SEE.** Filtering the held span out of the schedule also took it out of `nowAll`, and the horizon is built from `nowAll` — so on a day whose only event was the hire, the collapsed board correctly drew `כרגע · הרכב אצלנו` and `canLift` then answered **"nothing to lift"**: the one surface carrying that span's booking, notes, files and settle could not be opened at all. A journey never had this problem because journeys were never filtered. Fixed with `heroNowAll` — "the horizon's now-points are whatever the board is showing", written as _is the board's now-point already in the list_ rather than as a second reading of `midSpan.kind`, so the rule lives in one place. Caught by `Home.lift.test.tsx`'s existing same-day-hire spec, which is the argument for that spec having asserted the lift as well as the board.
- **Two imports died with the change** (`isJourney`, `windowBoundOf` in `Home.tsx`) and are removed rather than left for lint to warn about forever.
- **Verified:** `pnpm typecheck`, `pnpm lint` (0 errors; the 2 remaining warnings are pre-existing and on HEAD), `pnpm build` green; frontend suite **306 files, 5,584 tests** green, +9 new. Each new spec was run against the pre-change derivation and confirmed to fail — a spec that passes either way measures nothing.
