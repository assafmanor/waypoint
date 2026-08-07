# Session 220 — what a time MEANS, decided with the owner

**Date:** 2026-08-07
**Branch:** `claude/temporal-semantics-connection-stops-cpxc56`
**Workstream F** of the [session 216 triage](2026-08-07-session-216-field-reports-triage.md) — field reports **#10, #16, #17, #18**. A + B + C shipped the same day as ordinary bug fixes (PRs #516–#518); this one was routed as _"product + architecture session, ADR expected"_ and that is what it was.

**Paper only.** No feature code, no test, no schema, no CSS. Output: [ADR-0171](../decisions/0171-a-time-can-be-a-floor-or-a-ceiling.md), an amendment block inside [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md) §6, this note, and a rewritten Workstream F backlog line.

## What was decided, and by whom

Every decision below is the owner's, taken in session on eight questions asked in two rounds. What the session contributed was the framing, the code trace, and one finding (§3) that made two of the questions cheaper to answer.

| Question                                    | Answer                                                          |
| ------------------------------------------- | --------------------------------------------------------------- |
| What does a flexible time change?           | **Wording and position** — not wording alone                    |
| Stored or derived?                          | **Derived** from category + edge; no field, no migration        |
| What may a row slide past?                  | **Only when its stated time is impossible**, and only a journey |
| Does a moved row say why?                   | **Yes** — it names its anchor                                   |
| Does a flexible edge bound a gap?           | **No** — gaps run between `exact` edges                         |
| A `not-before` edge after its floor passes? | **Stays counted** until settled or the day ends                 |
| #10's merge condition                       | **Only the two ends of one derived connection**                 |

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

## 5. Deliberately not done here

- **No mockup.** ADR-0171 §9 specifies the one the build session needs — 11 September before/after at 360 and 390 in both themes, plus the unchanged ordinary day, a `not-after` check-out above a departing flight, and `נותרו היום` at two clocks. The three open render questions are listed in the ADR's "What this does not settle"; the semantics are not waiting on any of them.
- **No code.** Including the three files this decision will land in (`day-entries.ts`'s instant sort, `gaps.ts` / `day-joins.ts`, `map-pins.ts`'s stop list) and the one-line shared-package addition.
- **No fix for #16 in isolation**, which is the whole reason the triage held it back.
- **No per-event override** for the meaning. The seam is named in ADR-0171 §2 and left unbuilt.
