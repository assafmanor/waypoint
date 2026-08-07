# Session 220 — what a time MEANS, decided with the owner

**Date:** 2026-08-07
**Branch:** `claude/temporal-semantics-connection-stops-cpxc56`
**Workstream F** of the [session 216 triage](2026-08-07-session-216-field-reports-triage.md) — field reports **#10, #16, #17, #18**. A + B + C shipped the same day as ordinary bug fixes (PRs #516–#518); this one was routed as _"product + architecture session, ADR expected"_ and that is what it was.

**Paper only.** No feature code, no test, no schema, no CSS. Output: [ADR-0171](../decisions/0171-a-time-can-be-a-floor-or-a-ceiling.md), an amendment block inside [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md) §6, [`mockups/a-time-without-a-position-v1.html`](../../mockups/a-time-without-a-position-v1.html), this note, and a rewritten Workstream F backlog line.

**Read §5–§7 first if you are here for the current state.** The session ran in four rounds, and the second **reopened §3/§4 of the ADR it had just written** — the owner produced a day the ordering rule does not survive. Rounds three and four then generalized the answer past hotels entirely and split two claims the session had been treating as one. §1, §2, §5, §6 and §7 of ADR-0171 stand; §4 is dead; §10a/§10b are new decisions; the pick between two treatments is the one thing left.

## What was decided, and by whom

Every decision below is the owner's, taken in session across four rounds — eleven asked questions and two unprompted refinements, and **the two unprompted ones moved the model further than any of the questions did** (§6, §7). What the session contributed was the framing, the code trace, and three findings the reports had not named.

| Question                                                | Answer                                                          | Round 2                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| What does a flexible time change?                       | **Wording and position** — not wording alone                    | wording stands, **position reopened**                         |
| Stored or derived?                                      | **Derived** from category + edge; no field, no migration        | stands (and §5 reopens one treatment that would need a field) |
| What may a row slide past?                              | **Only when its stated time is impossible**, and only a journey | **reopened — see §5**                                         |
| Does a moved row say why?                               | **Yes** — it names its anchor                                   | moot while the slide is open                                  |
| Does a flexible edge bound a gap?                       | **No** — gaps run between `exact` edges                         | stands                                                        |
| A `not-before` edge after its floor passes?             | **Stays counted** until settled or the day ends                 | stands                                                        |
| #10's merge condition                                   | **Only the two ends of one derived connection**                 | stands                                                        |
| _(round 3)_ generalize "no position" to untimed events? | **Yes — one class**                                             | new, §6                                                       |
| _(round 3)_ is a deadline in that class?                | **No — a ceiling is closed where you act**                      | new, §7                                                       |
| _(round 4)_ may a deadline take a map number?           | **No — a number is only ever a known moment**                   | new, §7                                                       |
| _(round 4)_ one class = one category on screen?         | **No — one derivation, two placements, split on hard/soft**     | new, §7a                                                      |
| _(round 4)_ where does the top live?                    | **The existing `.day-ambient` strip**, tickable `היינו`         | new, §7a                                                      |

## 1. The reframing that unblocked the ordering question

The proposal put to the owner first was _"a flexible edge slides past the day's transport"_. They did not sign it off, and the reason was the useful part: _"sometimes it's obvious on a rolling trip where you move from one place to another, or you check in after a flight, and sometimes it's not obvious at all."_

That is a distinction between **impossible** and **unknown**, and it is one the app can draw without a travel-time model. `15:00` on 11 September is impossible: the day's last flight lands at `23:20`. `15:00` on an ordinary day with a museum at noon and dinner at eight is merely unknown, and the app has no business picking an hour. So the rule became **move only what is impossible**, which moves the reported day and leaves every day nobody complained about exactly as it is.

Recorded because the first framing was the obvious one and it was wrong in a way the owner caught by feel before anyone could name it.

## 2. Where the semantics live, and what the session had to check first

The temptation was a new `edges` field on `CategoryTimeProfile`. Reading `packages/shared/src/icons.ts` before proposing it turned up that the fact is already there, under a name added for a different reason two sessions ago: **`midSpan.kind`** — `journey` (you are in transit) vs `held` (you hold a resource), refined per glyph by `ICON_TIME_PROFILE`.

`journey` ends are instants; `held` ends are a floor and a deadline. That is not a coincidence worth exploiting, it is the same fact — which is why ADR-0171 §2 makes it a resolver over the existing resolution rather than a fourth table beside three that already agree.

The same property answers §4's anchor question: **only a journey can make another row's time impossible**, and [ADR-0163](../decisions/0163-a-hire-is-not-a-journey.md) §4 already ruled that holding a car is not being in transit. One property, both halves, no new predicate — and a car hire gets `not-before` pick-up and `not-after` return without anyone thinking about cars, which is the check that the model is about time and not about hotels.

## 3. Two things found in the code, worth the build session's attention

- **A transition row between two legs suppresses the join entirely.** `dayBlocks` sets `prevEnd = null` on any entry that is not a leaf event, so with the check-in sitting between the two flights, no gap and no connection band could be derived for that window at all. The misplaced row was not only stating a false order, it was hiding whatever was true. Moving it out restores an adjacency the day never had.
- **Whether the reported flight pair derives as a connection at all is unverified.** `connectionMinutes` requires `from.toPlaceId === to.fromPlaceId`, and two separately-authored bookings can name one airport through two different `Place` rows. If they do, the band after this work is a correct-but-thin `פנוי · 2:45 שע׳` rather than a layover — **a different defect, in the place-identity axis**, and it should be filed as one rather than folded into Workstream F. Named in ADR-0171's "What this does not settle" and left unfiled, because it is a claim about the owner's data that this session could not check.

## 4. The reversal, stated where it will be read

Field report #10 reverses an ADR-0121 §6 amendment that shipped **the day before the report** — the triage note flagged this in its §1 and it was the thing most likely to be quietly re-decided. So the reversal is written into §6 itself as a nested block under the amendment it revises, not only in the new ADR: a reader arriving at §6 now meets the current rule, not the superseded one.

Its scope is narrow on purpose. _"A place you go to twice is two stops"_ was reasoning about an airport with a 02:00 landing and an 18:00 car return, and about that it is right. It is wrong about a layover, where the two moments are the two ends of one thing. Everything else §6's amendment established is preserved and named as a constraint on the build: a clock-free sequence, a once-visited place that cannot move, a revisit that keeps its own number, informative gaps under a filter.

## 5. Second round, same session: §4 did not survive the owner's own day

The ADR was written, committed and pushed, and then the owner produced the day the rule fails on:

> Check in from 15:00 · flight lands 21:00 · car rental 22:00 — _"in practice we're gonna check in at the hotel only after the car rental, and end our day there. In other cases maybe we'll actually check in as soon as possible."_

§4 anchors on **journeys**, and a hire is `held` (ADR-0163 §4) — so it lands the check-in after the flight and **before** the car. The important part is that **no repair helps**: extending the anchor to `held` rows fixes this day and breaks the ASAP day, because the two sentences are the same data with two different answers. §4's impossible-vs-unknown distinction was sound and simply does not reach — 22:00 is not _impossible_ at 15:00, it is _unknown_, and §4's only answer to unknown is "leave it", which is where the original defect lives.

**So §1 was one framing too shallow.** It reframed _when may a row move_; the question underneath is **whether the row has a position at all**. Owner: _"maybe these kinds of events/bookings couldn't be numbered and couldn't reliably be ordered on the day schedule… think more creatively and not try to force fit it into our existing solution."_

**Response: reopen §3/§4 in place and draw the alternatives**, rather than patch the rule a third time. [`mockups/a-time-without-a-position-v1.html`](../../mockups/a-time-without-a-position-v1.html) — five treatments, each against the **same three days**, since a treatment that reads well on one is not an answer. §4 is kept in the ADR in full rather than deleted, because the mockup's argument is about what it gets wrong and a reader cannot check that against a blank.

Three things the drawing established that the prose could not:

- **Today's behaviour is not a rule, it is a coincidence** — instant-interleave is correct on exactly one of the three days.
- **Two of the three candidates already exist as shapes**, which is why they are the cheap ones: `.day-ambient` is the backdrop a multi-night stay's _middle_ days already use, and the untimed tail is where ADR-0161 §10 already puts "today, but no position". Neither is new grammar.
- **Only the treatment that stops asking one number to be two facts can answer _when_** — the floor belongs to the reservation, the position to the day — and ADR-0047 §1 makes the Event the sole time authority, so that is a nullable column and a migration. It is drawn because this round's instruction was explicitly not to force the answer into the existing solution; it is the one stored field anywhere in the ADR.

Measured from the mockup's DOM at 360: the tail's hairline is **13px**; the second number doubles the time slot (15 → 30px) and does **not** grow the row, because a transition row's height comes from its badge, but it takes **8px** off the title.

## 6. Third round: the owner generalized it, and the generalization decided the pick

> _"We should think if we should generalize this not-before / not-after behaviour and the 'without a position' for other events that don't have times."_

**They are the same class, and the test is the width of the window.** An untimed event's window is the whole day; a `not-before` edge's is its floor to the end of the day. Both are too wide to place. A `not-after` deadline's is closed on the side you act, so it is **not** in the class.

Two things this changed, and neither was reachable from the hotel case alone:

- **The tail treatment stopped being an addition.** `DayView` already renders untimed events at the tail of `.day-list` with no separator and nothing saying they hold no position — so an untimed event looks like the last thing of the day. That is the reported defect, already shipped and never reported. The treatment is that tail **finally named**, which is rule 8 rather than a new surface.
- **It looked like it broke the ambient-strip treatment, and that reading was wrong.** The session argued: a backdrop can carry a stay and cannot carry `קניות לדירה`, therefore one tail holds both. The owner inverted it, correctly — see §7a. The observation was right; the conclusion collapsed hard/soft.

**And it isolated the one place a stored field is genuinely needed.** An untimed row's number slot is free, so setting its time **is** the placement, through a control ADR-0161 §7 already ships. Only a flexible edge has spent its one number on the floor.

## 7a. The correction that mattered most, and the session did not see it

> _"I'm not sure that untimed events and commitments without a hard time should be classified as the same and shown as the same category. Untimed commitments maybe should be on top?"_

**Right, and it undoes this session's own conclusion one round earlier.** Having generalized correctly — one derivation, "does this hold a position?" — the session then treated the class as one **category on screen**, which folded `hard` and `soft` together. That is the collapse ADR-0011 forbids and the collapse this very ADR spends §1 promising not to make: a real commitment buried at the foot of the day beneath an optional errand is the demotion that rule exists to prevent.

**One derivation, two placements**, and the discriminator is an axis that already exists: `hard` + no position → the top, a claim on your day; `soft` + no position → the tail, spare capacity. So the two treatments were never rivals — each was half, and the mockup's `ג+ד` frames are what the session actually landed on.

Signed off in the same round: the top is the **existing** `.day-ambient` strip rather than a new band (so a stay reads the same way on every day of itself, edges included); a strip row **must** be tickable `היינו`, or ADR-0164's count sticks all evening, which `SettleControl` answers with a fourth density rather than a second widget; and an untimed **hard** event goes up too, because the discriminator is commitment, not whether a number is present.

**Worth recording as a process note, not just a decision.** The session reached the right generalization and then over-applied it in the same breath — "these are the same kind of thing" slid into "these look the same" without anything checking the second step. The guard that should have caught it was written at the top of the ADR by this same session.

## 7. The owner's second refinement: a deadline keeps a position and still earns no number

First: _"there could be a flight before the max checkout time."_ Right, and it is why a deadline's position is not simply its ceiling — a ceiling is closed on the side you act, so it **intersects** with the day's first departure. Two hard bounds, the earlier wins, nothing guessed. That is the asymmetry with a floor, which is open on the side you act and therefore not intersectable at all.

Then the sharper half, which split two claims this session had been treating as one:

> _"It shouldn't be numbered and ordered as if it was a normal event, because then on the map weird things could happen (you're back in Iceland after landing in Tel Aviv for example)."_

**A position in the list and a number on the map are different claims.** The intersect earns the first; it cannot earn the second, because it works only when there is a departure to intersect against, and on a day without one the order is genuinely unknown while a number would assert one. So the map rule came out stronger than the session had it: **a stop number is only ever the index of a moment the app actually knows.**

**Which caught a third shipped defect, unreported:** an untimed event's place is numbered today — `place-usage.ts` gives it `prominence: 'edge'` with `at: undefined`, `hasScheduleSlot` passes, and `buildPinOrderIndex` numbers it after the timed stops. One rule now covers it and the layover both.

**Still open — one thing:** whether the two-numbers path is worth its column. It is the only route to "when" for a flexible edge and the only stored field left in the ADR. Plus one device question the mockup cannot settle — whether `ללא מיקום ביום` reads as a boundary or as an accusation, since "sometime today" is a legitimate thing to say.

## 9. Deliberately not done here

- **No code.** Including the files this decision will land in (`day-entries.ts`'s instant sort, `gaps.ts` / `day-joins.ts`, `glance.ts`, `map-pins.ts`'s stop list) and the shared-package resolver.
- **No fix for #16 in isolation**, which is the whole reason the triage held it back.
- **No per-event override** for the meaning. The seam is named in ADR-0171 §2 and left unbuilt.
- **No pick between the five treatments.** The mockup exists so the owner makes it; writing an ADR §11 that chose one would be the third framing imposed in one session.
