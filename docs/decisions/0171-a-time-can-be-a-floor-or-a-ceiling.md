# 0171 — A time can be a **floor** or a **ceiling**, and one connection is one stop

**Status:** Accepted (owner sign-off 2026-08-07, in session, on all four questions). **Not built** — this is the semantics; the rendering needs a mockup pass first (§9).
**Date:** 2026-08-07

**Extends** [0063](0063-category-time-behaviour-profile.md) — the time-behaviour profile gains its fourth behaviour, and it is read off the `midSpan.kind` that profile already carries rather than off a new field.
**Amends [0121](0121-embedded-map-phase-6-design.md) §6's 2026-08-06 amendment** (§7 below), which made "a place visited twice is two stops" the rule. That rule stands for a genuine revisit and is **reversed for exactly one case**.
**Refines** [0159](0159-the-day-says-what-is-between-two-events.md) §1 (what bounds a gap), [0164](0164-a-spans-own-edge-is-something-you-can-still-miss.md) (when an edge stops being ahead of you).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (hard/soft is the **commitment** axis and nothing here touches it — see §1's guard), [0018](0018-timeline-data-model-shape.md) (derive, don't store), [0038](0038-icons-and-canonical-category.md)/[0162](0162-a-car-hire-is-transport-you-drive-yourself.md) §3 (a glyph refines its category's whole time profile), [0109](0109-map-tab-design.md) §7 (no routing, and no travel-time model), [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §10 (the day list is an **ordering**, not a proportional timeline), [0163](0163-a-hire-is-not-a-journey.md) §4 (holding a car is not being in transit).
**Answers** field reports #16, #17, #18 and #10 from the [session 216 triage](../planning/2026-08-07-session-216-field-reports-triage.md) — Workstream F.

## Context

Day view, 11 September, in the order it rendered on the owner's phone:

| row              | reads           |
| ---------------- | --------------- |
| flight           | `15:30–18:15`   |
| hotel check-in   | `15:00`         |
| flight           | `21:00–23:20`   |
| a band before it | `פער של 3 שעות` |

**You cannot be at the hotel at 15:00 when you land at 18:15**, and the app said you could. The check-in is a real, unmovable commitment with a real number on it — and the number does not mean what every surface in the app assumed it means. `15:00` on a check-in is the hour the room becomes **available**; the app read it as the hour you **arrive**, sorted the day on that reading (`mergeDayEntries` orders transition points by instant, ADR-0064 §B), and printed a sequence that is physically impossible.

The `~3 שעות` band is the same defect one surface over, which is why it is not fixed here as its own bug: report #16 is a **witness**, not a cause. Patching the number would have made the day agree with a reading of `15:00` that is wrong.

**And the app has no word for any of this.** ADR-0011 types every event `hard` or `soft`, and a check-in is emphatically `hard` — guarded on edit, never auto-moved, excluded from ripple, all correct. Hard/soft was simply never asked "what does the number mean", because until a booking's time could be a **floor** the question had one answer everywhere.

**Bundled in: one connection consumes two stop numbers** (report #10). Ben Gurion `1`, Vienna `2`, Keflavik `4` — the missing `3` is Vienna counted twice, once as the connection's arrival and once as its departure. It is here rather than in its own session because it is the same question in the other axis: **what is one moment and what is two**, asked of a place instead of a clock.

## Decision

### 1. A timestamp has a MEANING, and it is a third axis

```
exact       the instant IS the commitment          a flight departs, a landing lands, a table is booked
not-before  the instant is the EARLIEST it can be  a room from 15:00, a hire counter opening at 10:00
not-after   the instant is a DEADLINE              out by 11:00, the car back by 18:00
```

**The guard, stated once and load-bearing everywhere below: hard/soft answers whether a commitment can be moved or skipped. exact/not-before/not-after answers what the number on the row means.** They are independent and they compose freely. A hotel check-in is **hard and not-before** — it cannot be dragged, skipped or rippled, _and_ `15:00` is a floor. Nothing in this ADR makes a hard event soft, and nothing in it moves a hard event: §4 moves a **row**, never an instant.

That is the third axis, after ADR-0011's commitment axis and ADR-0063's time-presentation axis (bracketed / ambient / typical length). ADR-0063 §5 already said those two "compose freely — a `hard` `transport` flight is bracketed-not-ambient". This is the same sentence with one more column.

### 2. It is DERIVED, and it is already in the profile under another name

Owner's call: derived from the category and the edge, not stored, not authored. `CATEGORY_TIME_PROFILE` (ADR-0063) is where "how a kind of thing behaves over time" lives, and **the fact is already there** — it is `midSpan.kind`, added in session 215 and refined per glyph in ADR-0162 §3:

| `midSpan.kind` | what the span is    | start edge   | end edge    |
| -------------- | ------------------- | ------------ | ----------- |
| `journey`      | you are in transit  | `exact`      | `exact`     |
| `held`         | you hold a resource | `not-before` | `not-after` |
| absent         | an ordinary point   | `exact`      | `exact`     |

**This is not a coincidence to be exploited, it is the same fact.** A journey leaves at a moment and arrives at a moment. A resource you hold is **available from** a time and **due back by** one — that is what holding something means. Writing it a second time as an `edges` field beside `midSpan` would be two sources for one fact, which is exactly the shape ADR-0162 §2 refused when it made `durationUnit` optional rather than restating every category's answer.

So: **one resolver, `edgeMeaning(event, edge)`**, reading `timeProfileFor(event)` — the resolution that already exists, so a mode never reads its wording from the glyph and its meaning from the category. Everything falls out with no new table:

- **A hotel:** `lodging` is `held` → check-in `not-before`, check-out `not-after`. The reported case.
- **A car hire:** `transport` by category, but `🚗` refines `midSpan` to `held` (ADR-0162/0163) → pick-up `not-before`, return `not-after`. Which is the right answer, and nobody had to think about cars: a counter that opens at 10:00 and a car due back at 18:00 are a floor and a deadline. ADR-0164's own trigger was a car hire, and it called those two "timed obligations that can be breached" — a deadline in as many words.
- **A flight, a train, a bus:** `journey` → both ends `exact`. Unchanged, which is most of the app.
- **Everything else** — a museum, a meal, a soft idea — `exact`. Unchanged.

**No migration, no schema change, no new field on an entity, and it works for manual non-booking events** (ADR-0063 §4), which is the whole reason the profile is keyed on category rather than `BookingType`.

**The extension seam is named rather than built.** If a mode ever disagrees with its `midSpan.kind` — a check-in a hotel really does hold to the minute — it states an explicit `edges` in its `ICON_TIME_PROFILE` row and `edgeMeaning` reads that first. One line, the same shape as every other refinement in that table. We do not add the field before something needs it.

### 3. The row says which it is, in one token

`15:00` becomes `מ-15:00`. `11:00` becomes `עד 11:00`. `exact` is unmarked, because it is the default and marking it would put a word on nearly every row in the app to say "normal".

That is the smallest change that stops the lie, and on its own it would already answer half of report #17. It is not enough on its own — see §4 — but it is what makes §4's move readable rather than mysterious: a row that has moved still carries the number it was authored with.

### 4. A row moves only when its stated time is **impossible**, never when it is merely uncertain

This was the one question the owner did not sign off as first put (_"sometimes it's obvious on a rolling trip where you move from one place to another, or you check in after a flight, and sometimes it's not obvious at all"_), and the hesitation was right about the first proposal, which slid a flexible edge past any transport on the day. **The distinction the owner was reaching for is impossible vs. unknown**, and the app can tell them apart without guessing:

> **A `not-before` edge is placed after the last `journey` on its day that ENDS after its nominal time. A `not-after` edge is placed before the first `journey` on its day that STARTS before its nominal time. Otherwise nothing moves.**

Both halves say one thing: **you cannot be at a place while you are in transit somewhere else.** If the day's last flight lands at 23:20, `15:00` is not when you reach the hotel — no reading of the clock makes it so, and the app is not guessing which hour you will actually check in, it is refusing to state one it knows is false.

| day                                                                 | result                                             |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| 11 September (flights to `18:15` and to `23:20`, room from `15:00`) | check-in moves below both flights                  |
| land `10:00` · museum `12:00` · room from `15:00` · dinner `20:00`  | **nothing moves** — no journey ends after 15:00    |
| room until `11:00` · breakfast `09:00` · flight `14:00`             | **nothing moves** — no journey starts before 11:00 |
| room until `11:00` · flight departs `10:00`                         | check-out moves above the flight                   |

**Why a journey and not "any commitment".** A dinner reservation at 20:00 is exact and it is a real commitment, and it says nothing about whether you can check in at 15:00 — you would obviously check in first. A journey is the one commitment the app knows **takes you somewhere else and holds you for its whole span**, and ADR-0163 §4 already drew that line for its own reasons: holding a car is not being in transit, so a hire on the day moves nothing. The same `midSpan.kind` that decides §2 decides this, which is why there is one property here and not two.

**Three properties this move has, and each is a constraint on how it is built:**

- **It is a POSITION, not a time.** The day list is an ordering, not a proportional timeline (ADR-0161 §10), so placing a row lower claims nothing about the clock. The row still reads `מ-15:00`; the app does not invent `23:20` for it and must not.
- **The stored instant is never rewritten.** This is what keeps ADR-0011 whole: a hard event is never auto-moved, and nothing here moves one. The placement is derived at render, from data that is already there — the same posture ADR-0159 §3 took for the connection and ADR-0063 for the profile itself.
- **The moved row names its anchor** (owner's call): `צ׳ק-אין · מ-15:00 · אחרי הנחיתה`. A row that is not where its clock says it is must not be a mystery, and the word comes from the anchoring journey's own `eventTransitionKeys` end key — so a train reads `אחרי ההגעה` and a flight reads `אחרי הנחיתה` with nothing hard-coded. **A row that did not move says nothing extra**, which is the majority of them.

### 5. A flexible edge does not bound free time

Free time is time between **commitments**. A room available from 15:00 does not consume any particular hour, so it neither opens nor closes a gap: **`freeBetween` measures between `exact` edges** (ADR-0159 §1's derivation and `GAP_MIN_MINUTES` floor are otherwise untouched, in both modes, so the two still cannot disagree about what a hole IS).

Report #16 is then answered without a patch of its own. With the check-in out from between the two flights, they are **adjacent**, and whatever ADR-0159 §2 says about them is what the day draws.

**And that adjacency is worth more than it looks.** `dayBlocks` sets `prevEnd = null` on any entry that is not a leaf event, so today a transition row sitting between two legs **suppresses the join between them entirely** — no gap, no connection band, nothing derived at all. The misplaced check-in was not only stating a false order, it was hiding whatever was really true of that window.

### 6. A floor passing is not the thing happening

ADR-0164 counts an ambient span's own edge in `נותרו היום` while `t.atMs > nowMs`. Under §1 that test means different things at the two ends, and the owner's call splits them:

- **A `not-after` edge stays as it is.** Check-out by 11:00 stops being ahead of you at 11:00, because at 11:01 it is not pending, it is missed. Unchanged.
- **A `not-before` edge stays counted until it is settled or its day ends.** 15:01 does not mean you have checked in. ADR-0164's question is _"how many things ahead of you today can still be missed"_ and an un-checked-into hotel at 19:00 is exactly one.

**ADR-0164's rejected alternative stays rejected.** It refused to count only the END transitions, on the grounds that _"a 15:00 check-in with luggage is equally missable"_ — and it was right; this section makes the check-in count for **longer**, not less. Its `isAmbient` double-counting guard (§3 there) is untouched, so a same-day journey still contributes one.

### 7. One connection is one stop (reversing part of ADR-0121 §6's amendment)

**Merge exactly when the two moments are the two ends of ONE derived connection** — the arrival of a leg and the departure of the next leg of the same journey, which `connectionMinutes` already answers and `connectionStops` already keys by place **and day**. Vienna is then one stop and Keflavik is `3`.

**Anything else keeps its own number**, including two moments at one place with nothing else drawn between them: landing at an airport in the morning and returning a car there at 18:00 is a genuine revisit, and adjacency in the day's stop list is not evidence that it was one visit.

**What ADR-0121 §6's amendment claimed, and what survives.** It said, correctly, that _"a day is a sequence of STOPS, and a place you go to twice is two of them"_ — and it was reasoning about a place whose landing was at 02:00 and whose car was due back at 18:00, which is a real revisit. The reversal is narrow and its scope is the whole of it: **a derived arrival-plus-departure of one connection is not going somewhere twice, it is waiting.** Everything else that amendment decided is preserved, and preserving it is a constraint on the build rather than an afterthought:

- The stop sequence is still built and numbered **with no clock**, so a tick can never renumber a pin.
- A place visited once still cannot move — nearly every pin on the canvas.
- A genuine later revisit still consumes its own number.
- Gaps in the numbering are still correct and informative where a filter hides a stop.

**And the merge reads the derivation the surfaces already share.** The pin's word, the day's band and the Map row all come from `connectionMinutes` (ADR-0159 §6), so the number now comes from it too — the same property, extended: one derivation, rendered wherever it is asked. A stop merged into one number is precisely a stop already wearing the connection word instead of `נחיתה`.

### 8. Deliberately not doing

- **No travel-time model, no routing, no "can you make it".** ADR-0109 §7 stands, and ADR-0159/0161 both refused a crow-flies number in this exact slot for the reason that decides it again: a number that looks like an answer is worse than none. §4 never says how long it takes to reach the hotel; it says only that you were not there yet.
- **No per-event override, and no authoring question.** §2's seam is named and left unbuilt. Asking someone to classify the time they just typed for a museum is a worse form than the defect.
- **No new hue and no new row shape.** `מ-`/`עד` and the anchor phrase ride the existing transition row's own slots.
- **Not the round-trip/multi-city authoring axis**, and not ADR-0159 §7's legs on different days. Untouched.

## Consequences

- **`CATEGORY_TIME_PROFILE` gains its fourth behaviour and no fourth field.** `edgeMeaning(event, edge)` joins `eventTransitionKeys` / `eventMidSpan` / `bookingTypeDurationUnit` as a reader over one resolution, and a new category or mode declares nothing new to get the right answer.
- **Three surfaces stop asking the clock a question it cannot answer**: the day's entry order (`mergeDayEntries`), the gap derivation (`gaps.ts` / `day-joins.ts`), and `נותרו היום` (`buildDayGlance`). Each consumes §1 rather than growing its own special case, which is the routing the triage note asked for.
- **A suppressed join becomes derivable.** Once the check-in leaves the middle of the two flights, `dayBlocks` can measure between them for the first time on that day — see §5.
- **The ordering rule is testable without a device**: §4's table is four fixtures, and the clock-pinning rule (`setSimulatedNow`) already applies to every one of them.
- **Report #16 gets no code of its own**, and that was the point of holding it. If the band still reads wrong after §4 and §5, it is a different defect (see below), not this one.
- **`buildPinOrderIndex` takes a dependency on the journey derivation** it did not have — the pin number now reads `connectionMinutes` like the pin's word already does. That is one more caller of a shared rule, not a new rule.
- **Two ADRs are refined in place rather than superseded**: 0164's count question keeps its answer at one end and gains a longer tail at the other; 0121 §6's amendment keeps everything except the one case §7 names.

## What this does not settle

- **Whether the 11 September flight pair derives as a connection at all.** `connectionMinutes` requires `from.toPlaceId === to.fromPlaceId`, and two separately-authored bookings can name one airport through two different `Place` rows. If they do, §5 leaves a correct-but-thin `פנוי · 2:45 שע׳` where a layover band belongs — which would be **its own defect**, in the place-identity axis, and should be filed as one rather than folded in here. The build session should check this first, on the owner's real data, because it decides whether §5's outcome on the reported day is a band or a gap.
- **Whether `צ׳ק-אין · מ-15:00 · אחרי הנחיתה` fits a phone row.** Three tokens in a slot ADR-0161 §7 measured to the pixel. This is a mockup question at 360px and 390px, and it is why §9 exists.
- **Whether a moved row needs anything at its nominal position** to say "it was here". Probably not — nothing else in the day leaves a trace of where it is not — but it is judged from a render, not from here.

## Alternatives considered

- **Overload hard/soft.** Rejected in the handoff and again here: it is the axis ADR-0011 built the whole app on, "can this move" and "what does this number mean" are different questions, and a check-in answers `no` and `a floor` at the same time. Conflating them would make the one primitive rule 1 protects mean two things.
- **Store the meaning on the booking, authored per event.** Rejected (owner's call): a migration, a write path, a new field on a shape ADR-0018 keeps derived, and a form question nobody wants for a museum. The lookup answers every real case, including manual non-booking events, which a booking column cannot.
- **A fourth explicit `edges` field on the profile beside `midSpan`.** Rejected as two sources for one fact (§2) — the same argument ADR-0162 §2 made against restating `durationUnit` on every row. Named as the seam if a mode ever disagrees.
- **Wording only, no ordering change** (`מ-15:00` and leave every row where it is). Genuinely defensible, and rejected: 11 September still lists a check-in above a flight that lands eight hours later, and an honest label on a false sequence is still a false sequence.
- **Always slide a flexible edge past the day's transport.** The first proposal, rejected by the owner's hesitation and then on its own merits: it moves rows on days where nothing was wrong.
- **Pin every `not-before` edge to the foot of its day.** Predictable and needs no rule at all, and wrong on the common day where 15:00 genuinely is when you check in, between the museum and dinner.
- **Slide past any exact commitment, not only a journey.** Rejected on the dinner case (§4): being booked for 20:00 says nothing about whether you can be at the hotel at 15:00.
- **Compute when you can actually reach the hotel** (travel time from the airport). Rejected: it is routing, the app has none by decision, and the honest weaker claim — "not before you land" — is the one that needs no data we do not have.
- **For #10: merge any two adjacent moments at one place.** Cheaper, no journey derivation, and it merges the morning landing with the evening car return whenever nothing else was drawn between them. Adjacency is not evidence of one visit.
- **For #10: one place, one number per day.** Simplest rule in the file, and it drops the distinction the owner asked for by name: a genuine later revisit loses its own number.

## §9 — What the build session needs before it renders anything

A phone-sized day-timeline mockup, at 360px and 390px, in both themes, with **11 September as a mandatory case**: the four rows above, before and after, plus the unchanged ordinary day from §4's table (so the comparison shows what does _not_ move), a `not-after` check-out above a departing flight, and the `נותרו היום` count at two clocks either side of 15:00. It settles the three questions above and nothing in §1–§7 is waiting on it.
