# 0208 — A claim needs something to stand on. And a confirmation may not outlive the write.

**Status:** Accepted 2026-08-26. **Built:** M6d of the routes epic.
**Date:** 2026-08-26
**Reported:** the owner, from the deployed board, three things in one message — _"`15 מהיציאה` is not
clear enough. It should say that you're late right? But the phrasing is bad"_; _"when you're past a
stop and not exactly on it, it shows you as on the way because we skipped"_; and _"when I click on
postpone on the day view, a pop up says postponed but it doesn't allow it"_.

**Amends** [0206](0206-a-travel-time-belongs-between-two-points.md) §AE1 (the passed arm's word) and
§AE3 (which stop the leg is measured from).
**Extends** [0207](0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) — the same thesis, one
step further: a position was the only thing allowed to withdraw a claim, and now a **settle mark**
can deny one too.
**Applies** [0011](0011-hard-soft-event-model.md) (the nudge's guard), [0019](0019-sync-protocol.md) (a
toast is the app's account of a write), [0041](0041-parallel-overlapping-events.md) (ripple, which already
exists and is not what refused the move).

## Context

M6b and M6c shipped the same day. What came back was not one bug but three, and two of them are the
same mistake in different clothes: **the app asserting something it had not earned.**

## Decision

### 1. The passed arm says `באיחור`, because by the time it can print, everything that could withdraw it has had its turn

§AE1 chose `מהיציאה` — the leave-by's own noun with the preposition flipped, so the minutes are
counted **from** it. The grammar was right and the reading was not: `מ־` says _measured from_, so
`15 · מהיציאה` states "15, counted from the departure" where the thing worth saying is **you should
have left a quarter of an hour ago.** The owner reported it in one line and answered it in the next:
_"It should say that you're late right?"_

**And it may now, which it could not in the morning.** §AE1 refused `באיחור` on v2 §3's ground — the
app cannot know whether you are late or walking — and that was true of a surface with nothing but a
clock. It is no longer true of this one. The tile prints only after three separate refusals: nobody
has pressed `בדרך` (§Z5 §M4), no device fix puts the traveller along the leg or at its end
(ADR-0207 §2), and — §2 below — the plan's own claim about where they are still stands. A word that
survives all three is not a guess.

**The distinction that keeps §Z5 §M4 intact:** `אתם באיחור` is a sentence about people, and it is
still refused everywhere. `באיחור` in the **unit slot** says what the NUMBER is, the way `לסגירה` and
`ליציאה` do — a measurement, not an accusation. The hero's sentence one elevation up still reads
`זמן היציאה עבר ב־18:37` and a spec holds the tile's word out of it.

**Measured**, because the slot is the one place this could cost a line: at 10px with the shipped
`0.08em` tracking, `באיחור` is ⁦30.50px⁩ of ink against `מהיציאה`'s ⁦37.81px⁩ — a hair over the live
arm's `ליציאה` (⁦30.27px⁩), which has been in this slot since M6b. The tile stays on its ⁦74px⁩
min-width, one line, in every arm.

### 2. A skipped stop DENIES the plan's claim about where you are — and a read with nothing to stand on is not made

The leg is measured between two scheduled stops (§AE3), and in a gap the origin is _"the last thing
that started"_ — the plan's claim about where you were left. **`travelOrigin` never read a status**,
so a stop the group had explicitly skipped was still the origin: the app measured the walk out of a
place nobody went to, derived a leave-by from it, and then marked the traveller late against it.

**A skip says nothing about place in either direction.** You may have skipped the café while standing
outside its door, or skipped it from three neighbourhoods away. That is the whole of the rule, and it
cuts down the obvious repair as well: **walking back to the previous non-skipped stop is not a better
answer, it is a staler one** — the leg from where you were six hours ago is no less of a guess, and it
is a guess that makes the app **louder** (a longer leg is an earlier leave-by is a more confident late
mark). So the origin is neither replaced nor trusted. It is reported as **denied**, and:

**A denied claim licenses nothing on its own.** No duration, no leave-by, no late mark — §D4's
absence, which this surface already treats as its ordinary answer. The board goes back to counting to
the event, which is exactly what it does when there is no estimate at all.

**And a position stands it back up**, at either end or between them (ADR-0207's `at-origin`,
`en-route`). This is the same thesis as 0207 and not a widening of it: a fix is a **discriminant over
claims**, never a coordinate we route from, and here it discriminates over one the plan could no
longer make by itself. The consequence is worth stating plainly — with consent, skipping a stop
leaves the read intact and honest; without it, the read disappears rather than lying.

**The gate is on the REQUEST, not on the two reads.** A leg nobody may be shown is a route call
against §D8's budget for nothing, so `useDayTravel` is handed no stops at all. That also makes the
rule impossible to half-apply: there is one boolean, and the estimate, the tile and the horizon row
all follow it.

**Also considered, and left for a report rather than built:** treating a skip as an implicit `בדרך`.
It is nearly subsumed — the mark and the denial withdraw the same claim — and the case it would add
(you skipped the stop, so you must have left it) is precisely the inference this section refuses.

### 3. A verb's confirmation may not outlive its write

`דחה` toasted `נדחה ב-30 דקות` on a move the server had **refused**. `applyDelay` caught its own
failure, rolled the optimistic shift back and posted an error toast — and then **resolved normally**,
so `applyGuardedDelay` returned `true` on both paths and the caller stacked a success message over the
explanation that had just been written. ADR-0019 makes the toast the app's account of what happened
to the plan; a false account is worse than none, and it hid the real reason for two milestones.

`applyDelay` reports whether the nudge stuck, and `earlier` — which never checked at all — waits for
the answer too.

**What actually refused it, and it is not what the report guessed.** The owner read the refusal as
adjacency (_"it's next to a later event with no gap at all"_). There is no such rule: the backend
computes a **ripple suggestion** for an overlap and `DayView` already renders it with yes/no
(ADR-0041), so an overlapping nudge succeeds and offers to push the rest of the chain. What refused
this one was `MOVE_INTO_PAST` — a stop whose start had already gone by, nudged by a step that landed
behind the clock anyway. `t.toast.moveIntoPast` has said so in as many words since T-010; nobody could
read it, because the success toast landed on top.

**So the target is checked before anything is dispatched or queued.** Not a duplicated server rule so
much as the only way to state it **offline**: without the check, `restOrQueue` queues the move, the
optimistic shift stands, and the refusal arrives on a flush nobody is watching.

**Allowing it was the alternative and it is rejected for now** (§Alternatives) — the nudge stays a
fixed step from the event's own start, not from the clock.

## Consequences

- **The board can now say `באיחור`**, which is heavier than what it said this morning. Three
  independent withdrawals have to fail before it prints, and §2 adds a fourth; that is what pays for
  the word.
- **The travel read disappears on a day of skips, for anyone without location consent.** This is the
  cost, it is deliberate, and it is the honest direction: the surface is complete without the block
  (§D4) and was lying with it.
- **`travelOrigin` returns a claim rather than an event**, so a future consumer — the day row's own
  leave-by (§V1.1), M9's feasibility — inherits the denial instead of rediscovering it. That is the
  point of putting it in the derivation rather than in Home.
- **A settle mark is now evidence about PLACE, in one direction only.** `skipped` denies; `done`
  confirms nothing it did not already (it was always the strongest origin). Nothing else reads a
  status this way, and nothing should without saying so here.
- **`delay` and `earlier` can now refuse before writing**, which makes them the first verbs to
  enforce a server invariant on the client. If a third one needs it, that is the moment to lift the
  check out of `applyDelay` rather than copy it (ADR-0096).

## Alternatives considered

- **Keep `מהיציאה` and explain it elsewhere.** Rejected: it was reported as unclear by the person who
  asked for the constraint that produced it, and there is nowhere on a collapsed board to explain a
  unit word.
- **`באיחור` only when a fix EARNS it, and `מהיציאה` when the app cannot tell.** Genuinely tempting —
  it is 0207's grammar — and rejected because the fallback is the word that was just reported as
  unreadable. Two words for one state also costs the reader the thing the tile is for: a glance.
- **Walk back to the previous non-skipped stop** (§2). Rejected: it swaps a wrong claim for a stale
  one, and errs toward a **louder** app.
- **Drop the origin from the stance entirely** and measure only the distance to the next stop.
  Rejected: it deletes `at-origin`, which is 0207's only arm that earns anything, and the leg's length
  is what makes the arrival radius relative (§5 there).
- **Re-anchor the nudge to NOW when the event's own start has passed**, so `דחה` on a late stop means
  "in 30 minutes" and succeeds. This is the owner's _"should we allow this behavior"_ and it is the
  strongest rejected option: it would make the commonest press work instead of refusing. Rejected
  **because of what it does to ripple**, not because of the semantics — the suggestion shifts each
  following soft event by the **mover's own delta**, which is what preserves the gaps between them,
  and a delta measured from the clock rather than from the stale start can be hours. One tap on
  `הזזה` would then push the rest of the day into tomorrow. Ripple would have to learn a **clearing**
  delta first, and that trade is not obviously an improvement in the ordinary case. On the backlog.
- **Refuse, and point at `הזזה`** (the named-position move, which has no past-target rule to break).
  Not rejected so much as not yet earned: the refusal now says why, and whether it should also say
  what to do instead is a copy question worth one report before it is one more instruction in a toast.
