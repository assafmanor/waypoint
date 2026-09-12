# 0224 — A transition is settled **on its own**

**Status:** **Accepted and built 2026-09-12**, in one session with the design.
**Date:** 2026-09-12
**Mockup:** [`mockups/a-transition-is-settled-on-its-own-v1.html`](../../mockups/a-transition-is-settled-on-its-own-v1.html)
**Session note:** [`planning/2026-09-12-a-transition-is-settled-on-its-own.md`](../planning/2026-09-12-a-transition-is-settled-on-its-own.md)

**Extends:** [0139](0139-settling-an-event-from-the-map.md) — `SettleControl` gains a **subject**, not a fourth host and not a fifth density. Its rule that "the words, marks and hues are not the host's to choose" is kept and sharpened: they are not the HOST's, they are the EDGE's.
**Extends:** [0184](0184-an-edge-can-be-a-window.md) — the same shape, one field on. That ADR gave an edge its own stored bound (`startWindowEnd`/`endWindowStart`); this gives the closing edge its own stored answer.
**Amends in place:** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §11 — the lifted hero's `הבא בתור` block carries the settle pair, which it was never wired to. [0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §6 and §10e — a ceiling becomes settleable; §6's count rule is untouched and is why.
**Relates:** [0011](0011-hard-soft-event-model.md) (a check-out is hard, and settling is not editing), [0117](0117-map-place-outcome-states.md) §1 (the third state is "nobody answered"), [0208](0208-a-claim-needs-something-to-stand-on.md) (what `skipped` already claims about your position — the reason `דילגנו` cannot be the word here), [0028](0028-plan-violet-color-budget-dark-ready.md) (`--ok`/`--miss`, unchanged)

## Context

The owner, with a screenshot of the lifted hero at 10:59 on a live Iceland day — `הבא בתור · Gissurarbúð 5 · צ׳ק-אאוט · 11:00 · 🔒 קשיח`, a one-minute countdown beside it:

> We should add a way to dismiss check in check out and the like, or mark as already checked in or out.

Reading the code split that one sentence into two problems of very different size, and found a third thing nobody asked about.

**The verbs are already built, and the slot is not wired to them.** `SettleControl` has shipped four densities since 0139, and its `board` one was drawn for exactly this dark surface (0160 §11). `HeroLift`'s `Point` renders `<Where/> <Note/> <Tasks/> <Settle/>`. But the `הבא בתור` block **is not a `Point`** — it is hand-assembled in `HeroLift.tsx` and renders `Where`, `Note`, `Tasks` and no `Settle`. The slot in the screenshot has no answer in it because nobody passed one. That half is one line.

**The other half is not, because a stay has two moments and one `status` field.** `TripEvent.status` is a single `planned | done | skipped`, and the app has quietly spent it on the **start** edge: `glance.ts` clears a `not-before` row on `status === DONE` (_"15:01 does not mean anybody has checked in"_, 0171 §6) and `hero-booking.ts`'s missed-check-in arm tests the same field. There is **no field a check-out can be written to**. Mark the stay `done` on the way out and you have said "we checked in", a day late, and moved a number that was already right.

**The day row refuses a check-out on purpose, and the argument only covers the count.** `TransitionRow` gates its settle pair on `meaning === NOT_BEFORE`, with the reason written out: _"a ceiling and a window expire by their own clock and need none"_. That is true of `נותרו היום` — an 11:00 ceiling leaves that number at 11:00 by itself, which is 0171 §6 working. It is not true of the **board**: `CHECKOUT_LEAD_MIN` is 180, so a check-out you made at 08:30 owns the hero until 11:00 with nothing you can say to it. A rule about a **count** was applied to a **control**.

**And `דילגנו` is not merely weak, it is a false claim.** The shipped pair is `היינו` / `דילגנו`. 0208 gave `skipped` a real job on this data: a skipped stop denies the plan the right to claim where you are. On a check-out you actually made, `דילגנו` records that you never left the hotel. `היינו` is only vague; `דילגנו` is wrong.

## Decision

### 1. The answer belongs to the **edge**, not to the span

A bracketed span surfaces at its two transition moments and never across its middle (0059 §2). Those two moments are separately true or false — you can have checked in and not yet out, and on a stay you extended you will never check out on the day the plan says. One `status` cannot carry both, and the app has already spent it on the first.

So a bracketed event gains **`endStatus`**, an optional `EventStatus` beside `status`:

| field       | what it answers                                                                          |
| ----------- | ---------------------------------------------------------------------------------------- |
| `status`    | the span, and in practice its **opening** edge — what two derivations already read it as |
| `endStatus` | the **closing** edge — check-out, car return, landing                                    |

**`status` is not renamed.** It already _functions_ as the opening edge's answer in `glance.ts` and `hero-booking.ts`, so `startStatus` would touch every consumer of it to change no behaviour at all. And the pairing has a precedent on this exact entity: `startWindowEnd` / `endWindowStart` (0184) is one authored fact per edge, stored as a pair, with `windowBoundOf(event, edge)` as the one accessor that stops the two being crossed by hand. `edgeStatusOf(event, edge)` is that accessor, and belongs beside it in `packages/shared`.

Absent means what it means everywhere in this app: **nobody has answered** (0117 §1's third state, and the commonest).

### 2. It is a **group** fact, so it is stored and synced

"We're out" is a fact about the trip exactly as "we were there" is. It rides the existing write path — `applySetStatus`, the outbox, the undo toast — and reaches everyone through the channel `status` already uses. A device-local dismissal was considered and refused in §8.

### 3. The word comes from the transition, the mark and the hue do not

`SettleControl` keeps its two verbs, its ✓/✕, its `--ok`/`--miss`, its settled tag and its `ביטול סימון`. What it gains is a **subject**: on a transition edge the done arm is that transition's own past tense, resolved through the table the labels already come from.

| key               | label (shipped) | done verb (new) |
| ----------------- | --------------- | --------------- |
| `checkIn`         | `צ׳ק-אין`       | `נכנסנו`        |
| `checkOut`        | `צ׳ק-אאוט`      | `יצאנו`         |
| `departure`       | `יציאה`         | `יצאנו`         |
| `arrival`         | `הגעה`          | `הגענו`         |
| `flightDeparture` | `המראה`         | `המראנו`        |
| `flightArrival`   | `נחיתה`         | `נחתנו`         |
| `carPickup`       | `איסוף הרכב`    | `אספנו`         |
| `carDropoff`      | `החזרת הרכב`    | `החזרנו`        |

One entry per key in `t.glance.transition`'s own shape, so a ninth transition is a one-line addition rather than a decision (rule 8). The other arm is **one word for every edge** — `לא קרה` — because what it says does not vary: this edge is not going to happen. A stop keeps `היינו` / `דילגנו` unchanged; nothing about the Map's reference row, the day card's prompt or Plan's archive chooser moves.

> `לא רלוונטי` was drafted first and rejected: it talks about the **row**, and in a pair whose other arm is a record of the world (`יצאנו`), both halves have to be. That is the argument `he.ts` already writes down for why the skip arm reads `דילגנו` and not `דלג`.

### 4. Two hosts, both already built

- **The lifted hero's `הבא בתור` block** — `<Settle point={next} />` after `<Tasks />`, the same part order the lead point uses, at the `board` density 0160 §11 built for this card. Measured: **+51px** on a 255px scrolling card, **+70px** with §6's label. **And zero new CSS** — the mockup proposed one rule for the block's own top padding on the reasoning that a hand-assembled block inherits none of `.hero-point`'s, and the build showed it was not needed at all: `Settle` returns a `.hero-part`, which carries that padding itself. One rule ships from this whole ADR, and it is §6's.
- **The day's `TransitionRow`** — the `NOT_BEFORE` gate drops; **every** edge is settleable, at the shipped `compact` density. Measured: **0px** of row height and 183px of title left at 360px, because `.transition-row .wp-settle.compact` already exists in `screens.css` and the row already reserved that slot for a floor.

**Not the collapsed board.** 0160 §1 renders it as a `<button>` whenever it can lift, so it cannot host a nested control at all — and §11 already answered the taste question: the board is a glance, the controls live in the lift.

### 5. Settling an edge takes it off the hero, which is the whole point

- `deriveHeroBooking`'s `transition-checkout` arm returns `null` once `endStatus` is settled, so the board moves on to the real next thing instead of counting down to something you have done.
- Its `transition-checkin` arm already tests `status !== DONE` on the **missed** branch only; a settled check-in should leave the hero on the live branch too, rather than sitting out its grace or its window.
- `glance.ts`'s `נותרו היום` gains the end edge on the rule §6 there already states for the start one: an edge leaves the count the way it was always going to leave it, **by being settled** — and a ceiling additionally leaves it by its own clock, exactly as today. Nothing about 0171 §6 is reversed; it is applied to the second edge.

### 6. The record, and the label above it

A settled edge renders `SettleControl`'s existing outcome branch with the edge's word: `✓ יצאנו` / `✕ לא קרה`, plus `ביטול סימון`. Undo stays reachable forever — 0139 §2's rule that every event is settleable rather than only the passed ones is what earns it, and it is unchanged here.

**One thing the drawing raised and no reading would have.** Every other block in the lifted hero is labelled (`איפה` · `פתק` · `משימה`) and the shipped `Settle` is not. On the lead point that is fine — it follows prose. In the `הבא בתור` block it lands directly under a row of hand-off chips, and reads as a third row of them. The mockup draws both, with `כבר קרה?` as a `.hero-lbl`: **+19px**, one edge-neutral string rather than a second table of eight.

**Built on**, on both hosts of the `board` density, since the two points must not differ — and with one condition the drawing did not have: the label renders **only while the question is open**. Once answered the block is a record (`✓ יצאנו` plus the undo), and a question mark over an answer is §U's checkbox defect again, a label read as the row's state. The final call on whether the label earns its 19px at all is still a device pass (0017); what ships is the recommendation.

### 7. A defect found by drawing the screenshot, fixed alongside

The owner's board reads `11:00` and `אתמול` on one line, one minute before 11:00 **today**. `Home.tsx`'s `boardNext.day` is `shownNext.date !== today` — and for a check-out `shownNext` is the **stay**, whose `date` is the check-in day. The slot shows `endsAt` and labels it with the other edge's day.

The day token must follow the **instant the slot is showing**, not the row it came from: `todayInTz(tz, new Date(nextInstant))`. Independent of everything above and shipped with it, because it is the same screenshot.

## What the build found, and what it changed

Three things, all of them the same shape: a rule that was half-stated because only half of it could be expressed before this ADR.

1. **The missed-check-in arm tested `!== DONE`, not "settled".** `hero-booking.ts` excluded a _done_ check-in from failing and had no opinion about a _skipped_ one — so a check-in the group had decided against went on being reported as missed. And its LIVE arm made no test at all, so a checked-in stay was offered for the rest of its grace or its window. Both are now one `isEdgeSettled(e, 'start')` guard above the pair, which is §5 as written and is more than §5 asked for.
2. **`glance.ts` restated "settled" inside two of its three arms and not the third.** The floor arm read `status !== DONE` and the window arm repeated it; the clock arm had nothing. Since the per-edge answer has to be asked anyway, it became **one rule prior to all three** (`isEdgeSettled(t.event, t.edge)`), and the arms below it are now purely about clocks. 0171 §6 is untouched: a floor still leaves the count only by being settled, and a ceiling still also leaves it by its own clock.
3. **The undo had to carry the edge.** `UndoDescriptor`'s `status` kind stored only the previous value, and with two columns that is ambiguous — withdrawing a check-out mark would have written `status` and claimed something about the check-in. The descriptor, the outbox op, the reducer action and the REST call all take the same optional `edge`, absent everywhere it was absent before, so **an op already queued in a user's outbox replays unchanged**.

**One shipped test asserted the rule this ADR reverses** (`TransitionRow.test.tsx`: _"does NOT settle a ceiling or a window — both expire by their own clock"_). It is rewritten as an assertion of the new rule with the old one's reasoning kept, because that reasoning was right about the thing it named and wrong about the surface it was applied to.

## What this does not settle

- **Whether a third state is wanted.** The owner's sentence names two things ("dismiss … or mark as already"), and §8 records why this ADR reads them as one. If "get it off my board without saying anything" turns out to be a real need in use, it is a new enum value across `eventStatusSchema`, sharing, the count and 0117's vocabulary — a decision, not an extension.
- **The label** (§6) — device pass. It ships on; whether 19px is the right price for it is a question a phone answers.
- **The car hire's return time still has no home on the day list** (`backlog.md`, 2026-08-31). That row is settleable here the moment it is shown; it is not shown, and that is the other ADR.

## Alternatives rejected

### 8. A device-local dismissal, with no stored field

Cheapest by a wide margin and a lie about what this app is. `יצאנו` is a fact about the group in exactly the way `היינו` is, it already has a write path, and a local dismissal would vanish on reinstall and leave the other four people with a board still shouting. Rule 5 ("everything works offline for reads") is about reads; this is a write.

### 9. Letting `status` serve both edges

Checked, and it does not work: two derivations already read `status` as the opening edge's answer. Marking a check-out through it writes "we checked in" a day late and moves `נותרו היום` in the wrong direction. This is the finding root `CLAUDE.md` asks for by name — count the call sites before claiming what a derivation does — and the count is what killed the cheap option.

### 10. A fifth `SettleControl` density

`board` was built for the lift and `compact` for the reference row; both render here unchanged, which the mockup shows rather than asserts (38×75px and 32×32px). 0139 exists only to undo the fourth parallel copy of this control, and 0171 §10c nearly added a density by not counting the ones that existed.

### 11. Per-edge words for the **skip** arm too

Sixteen strings where nine do the job. What the arm says (`this is not going to happen`) genuinely does not vary by edge, and inventing `לא נכנסנו` / `לא יצאנו` would put a negation beside a positive and make the pair read as one verb with a toggle rather than two outcomes (0117 §1: skipping is not the absence of an outcome, it is the other one).
