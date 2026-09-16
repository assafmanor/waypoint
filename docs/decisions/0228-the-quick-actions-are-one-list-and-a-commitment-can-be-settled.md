# 0228 — The day row's quick actions are one ordered list, and a commitment can be marked done

**Status:** Accepted — **built 2026-09-15**, **amended and rebuilt the same day** (§5 below)
**Date:** 2026-09-15
**Refines:** [0011](0011-hard-soft-event-model.md) (hard/soft, and what it actually reserves), [0043](0043-day-view-now-line-phases-and-archive-chrome.md) §2/§3 (the settle strip, the reframed `סיימנו`, the phase-scoped nudge), [0139](0139-settling-an-event-from-the-map.md) §2/§4 (every event is settleable; the write path is existing), [0029](0029-trip-mode-day-scope-gating.md) (a past day keeps settle and the read), [0025](0025-trip-mode-edit-capability-tiers.md) / [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) (the `⋯` is Tier-2 and stays there)
**Amends:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §3 — an event's documents are now reachable on a passed row too, which is where §3's "the read is on the card" was quietly not true.

## Context

Owner report, off the deployed build, quoted: _"Looks like you can't mark bookings as complete (or settled), i.e. mark as done, like you can do on regular events. Another thing, the quick actions for bookings/hard events vs. regular events are different, while they should be the same. For instance see the location of the navigate button, and the postpone/early buttons."_

Two complaints, and the code says they are one defect.

`EventCard`'s action row was **three hand-written JSX arms** — `isDone ? … : isHard ? … : …` — each with its own button list in its own order. Nothing in the repo decided what any of them contained. What they had drifted into:

|        | done            | hard                        | soft                            |
| ------ | --------------- | --------------------------- | ------------------------------- |
| order  | `שחזור` `ניווט` | `ניווט` `בדרך` `דחה 30 דק׳` | `סיימנו` `דילוג` `−30+` `ניווט` |
| settle | —               | **absent**                  | present                         |
| nudge  | —               | one-way button              | ±stepper                        |

So `ניווט` **led** a booking and **trailed** a stop; the same nudge was two different controls; and a booking had no way to record that it happened. `showSettle` read `!isHard && isPassed`, and `DayView` had the screen's half of the same gate (`e.kind === EVENT_KIND.SOFT`) on the read-only past day.

**Nothing withholds a record from a commitment.** ADR-0011 reserves _moving_ a hard event — guarded on edit, never auto-moved, out of the ripple — and says nothing about its outcome. The write path never looked at the kind: `applySetStatus` → `setEventStatus` → a `status` column. And every other surface that settles has always offered it on a booking: the Map's reference row (ADR-0139 §1 excludes only ideas and bookings-as-references, which carry no `EVENT_STATUS`), the lifted hero, `StayRow`, `TransitionRow`, `UnplacedCommitment`. **The day card was the one place in the app where a commitment could not be marked done** — and it is the surface the question is asked on.

## Decision

### 1. The order is a list, not a branch

`ui/domain/event-actions.ts` holds one ordered spec. Each entry names a verb and a `when`; `eventQuickActions(ctx)` filters it. `ui/domain/EventActions.tsx` renders whatever comes back, one drawing per verb. The card no longer contains a per-kind arm of any kind.

The order, right to left:

**`סיימנו` · `דילוג` · `− 30 דק׳ +` · `בדרך` · `ניווט`**, with the `⋯` in its own end slot.

Read as a sentence: **what happened, when it happens, how you get there.** It is the soft row's shipped order with `בדרך` slotted beside the other on-the-ground verb, chosen over the hard row's because it is the one that already carried the full set.

**`kind` is in the context and no shipped entry reads it.** That is the point rather than an oversight: the lever for a genuinely kind-specific verb exists and is a one-line `when`, so the next specialisation cannot become a fourth arm. The two specialisations that survive are both already elsewhere and both keep a stated reason — `החלף` and `העבר למדף` are soft-only in the `⋯` sheet (a commitment is not displaced, ADR-0011/0161 §6), and a hard nudge asks for confirmation **inside the verb** (`applyGuardedDelay`), never as a different button.

**`בדרך` is base now, and its gate is the PHASE.** It shipped as a hard-row extra with no reason attached; heading somewhere is a claim about what is ahead of you, so it belongs on any upcoming or now row and on no passed one — which is also a fix, since the hard arm offered it on an event that had already happened. Home has always offered the same verb on `shownNext` whatever its kind.

**What the spec costs, measured** (360px viewport, real stylesheet, Chromium, an expanded upcoming row with a place — old markup against new in the same box):

|      | old                                                                             | new                                                                                            |
| ---- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| soft | **96px**, two lines — the four verbs fill line 1 and the `⋯` is alone on line 2 | **97px**, two lines — `סיימנו` `דילוג` `−30+` on line 1 with the `⋯`, `בדרך` `ניווט` on line 2 |
| hard | **57px**, one line                                                              | **97px**, same as soft                                                                         |

So the soft row is **+1px** and the hard row gains a line, which is what carrying the full set costs. The measurement corrected an assumption worth recording: the soft row was **already** wrapping, and what it was spending the second line on was the `⋯` by itself. That is fixed here for its own sake — the row is two boxes now, the verbs wrapping inside theirs and the menu a non-wrapping sibling pinned to the trailing edge, so the `⋯` sits in the same place on every card instead of being shoved onto a line of its own by whichever verb happened to appear last. The verbs' box is ⁦~300px⁩ at this viewport, which is why 313px of items never fit on one line to begin with.

### 2. A commitment carries an outcome, and the row says when it is missing

`showSettle` is `isPassed`. `DayView`'s read-only forcing drops its `=== SOFT`. Both halves of one withholding, and neither was decided.

The `לא סומן` chip moves ahead of the kind in the tag ladder. It sat inside the soft arm, so a passed booking — now the row carrying exactly that open question — said nothing about it. That slot is the **status** slot (ADR-0178 §4 emptied it of the kind); status is read first, kind second.

### 3. The ask sits on the card rather than instead of it

The passed-and-unmarked card used to **return early**: a static face plus the strip, no chevron, no panel. So a passed row's documents, notes and tasks were unreachable — and on a booking, its confirmation code and its hard-edit warning with them, which is why §2 could not simply be turned on.

The strip is a **band under the face** now and the card expands as every other card does. ADR-0043 §2's "one tap exactly where you glance back" is untouched (the strip is still visible without expanding); what goes away is a card that swallowed its own contents. The strip's clearance rule loses its `.soft` key with the same reasoning as the chip: it clears a chip both kinds now wear.

### 4. `earlier` goes through the guard

`applyGuardedDelay`'s own comment calls it "the single choke point", and `verbs.earlier` was calling straight past it to `applyDelay`. Harmless while the ±stepper was soft-only; a hole the moment one row offers both directions to both kinds — a commitment would have moved with no confirmation at all. The guard is keyed on the kind, not on the sign, so this is one call swapped. It needs `toast.hardEarlier`: `hardDelayed` says the move was a postponement, and the half that matters — go and change the booking — is the same either way.

## 5. Amendment, 2026-09-15: a quick action is scoped by how near the row is, not by its phase alone

Owner, with a screenshot of **day 16 browsed on day 15** at ⁦09:20⁩: _"looks like too many buttons. Do you think that we need all of these as quick actions? Especially for events that are still ahead of us, even not today…"_

The count was the symptom. **The gate was the defect, and it is §1's.** Each verb was scoped by `EventPhaseName`, which `eventPhase` derives per event from the clock — so **every row on a future day reads `upcoming`, identically to "later this afternoon"**. A waterfall at ⁦06:30⁩ two days out was offering to be marked done, to be told you were on your way to it, and to be nudged by half an hour. Six controls, none of which had a now to act in.

**And §1 was contradicting an ADR while it did it.** [ADR-0043 §2](0043-day-view-now-line-phases-and-archive-chrome.md) says of `סיימנו`: _"demoted, not removed… its natural home is **behind the line**"_ — a looking-back verb. The shipped soft row had always **led** with it on an upcoming event, and §1 preserved that instead of noticing the ADR said otherwise. Half of this amendment is simply ADR-0043 being applied.

### 5a. The rule

**A quick action answers "what do I do about this row _now_". A row you will not reach for two days has no now.** So the context carries `today` — whether the row's DAY is today, which no per-event phase can supply — and the on-the-ground verbs ask for it.

| the row is                      | verbs                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| **now** — you are inside it     | `סיימנו` `דילוג` · `+30` · `ניווט`                          |
| **today, ahead of you**         | `−30+` · `בדרך` · `ניווט`                                   |
| **passed**                      | — (the `היינו שם?` strip above is already asking, in words) |
| **done / skipped**              | `שחזור`                                                     |
| **another day**, past or future | —                                                           |

Each line is one `when`, in the same single ordered list §1 built — which is the infrastructure earning itself: the fix is five predicates, not a re-plumb. `ניווט` survives a `now` row because being inside an event's window is not the same as having arrived, and goes once the row is behind you, where the strip is asking a different question; `מפה` on the badge still answers "where is this" on every row of every day, so nothing is stranded. Everything taken off a row is in `⋯`, one tap, with a label and an icon — which is more discoverable than a fifth identical pill, not less.

**The cap is that the band fits one line at 360px**, and the count is how it is kept: **never more than three verbs**, asserted in `event-actions.test.ts` so a fourth has to face the measurement rather than quietly wrap. Measured on the shipped stylesheet: the `now` row is ⁦57px⁩, one line; the upcoming row ⁦57px⁩, one line; a passed row and any row on another day render **no band at all**.

### 5b. The `⋯` moves to the card face

It was the last item of the verb band, so its position depended on how many verbs the row happened to carry — and once the band is allowed to be **empty**, it would have been a strip of padding holding one glyph. On the face it is in the same place on every card, and reachable **without expanding**, which is what `עריכה` and `מחיקה` always wanted.

A `role="button"` span, not a `<button>` — `PlaceBadge`'s reason one element over: nested buttons are invalid HTML, and the tap must not also toggle the row. `menu` joins `check` as an optional `auto` grid track, so a past day's card (no `⋯`, ADR-0029) lays out exactly as it did. The 30px glyph carries ADR-0017's 44px floor on an `::after` overlay rather than by growing, which is [ADR-0177](0177-a-when-reads-as-a-sentence.md)'s recipe on a control that had to shrink to fit the when line.

The band's two-box split from §1 is gone with the `⋯` it was written to pin; one wrapping box again, `flex-wrap` kept as a safety net for a longer translation.

### 5c. What this trades

**`סיימנו` leaves the upcoming row.** The original report was about _passed_ bookings, which keep it — on the strip — so the ask that started this ADR is intact, and the early mark ADR-0117 §2 protects ("a human outranks the clock") is in `⋯`. §2's reading of that clause stands and narrows: it is about marking **tonight's** dinner done at 11:00, which is a claim about today, not about Thursday.

**`ניווט` leaves a past day**, which amends [ADR-0043 §4](0043-day-view-now-line-phases-and-archive-chrome.md)'s _"Done / Skip / Restore / Navigate stay"_. Directions to somewhere you already were is not a thing anyone taps; the badge keeps the place one tap away either way. Done/Skip/Restore are untouched — that is the retrospective job §4 was actually written for.

## 6. Amendment, 2026-09-16: the early mark is actually in `⋯`, and the parking lot takes a commitment

Owner, with two screenshots of day 16 at ⁦13:51⁩ and the `⋯` sheet open on a ⁦15:00⁩ boat tour: _"Our boat tour got canceled, and the app doesn't have a way to say that, especially because it's a hard event."_

**§5c says the early mark is in `⋯`. It was not.** The sheet carried `החלף` · `העבר למדף` (both soft-only, ADR-0011) · `עריכה` · `מחיקה`, so an upcoming **booking** had exactly one verb that took it off the day, and that verb throws away the confirmation code you are about to need for the refund. The i18n already described `actions.skip` as _"the row-menu action"_ — the word was there, the row never was. The row ahead of the line is also the one where a cancellation actually reaches you: the operator writes in the morning, not once the slot has passed.

**Counting the consumers of `skipped` found the second half.** `shelfGroups` kept `kind === SOFT` on ADR-0027's parking lot from the days when only a soft event could be skipped, and §2 made a commitment settleable without visiting it. A skipped booking left `dayEvents` in both modes (`DayView` and `PlanDay` both filter `!== SKIPPED`) and was refused by the shelf — no surface left, restorable only from the Map's reference row. That was already true of a passed booking marked `דילגנו` under §2; this amendment is the first time the state is reachable **ahead of time**, which is when you go looking for the card.

### 6a. What changed

- **`EventCard`'s `⋯` sheet leads with `סיימנו` · `דילוג` on an `upcoming` row**, hard and soft alike, when both handlers are wired — the both-halves rule `SettleControl` and `EventActions` already hold. One place per phase and no duplicates: passed → the strip (§3), now → the band (§5a), done → the chip is the undo ([0230 §1](0230-one-done-mark-and-it-is-the-undo.md)), upcoming → `⋯`. The pair leads the sheet: what happened, before what to do about the row.
- **`shelfGroups.skipped` drops `=== SOFT`.** `place-usage`'s `isParked` — the Map's `אולי` facet, defined as "what the shelf renders" — follows, so the two cannot disagree about a parked booking.
- **Nothing new on what the parked card can do.** A tap restores in place. Plan's drag into a gap already goes through `verbs.update` → `applyGuardedUpdate`, so a hard card re-timed by a drop asks first (ADR-0011); the drop table's refusal to re-day a skipped card is unchanged.
- **No write, no schema, no backend change**, one more time. `applySetStatus` never read the kind; `event-soon` selects `status: 'planned'`, so a skipped booking stops being reminded about; the travel legs, the gaps and the leave-by all read the day without it, which is what "the tour is off" has to do to the afternoon.

### 6b. What it says, and what it does not

**The verb is `דילוג` and the record is `דילגנו` / `דילגתם`**, the vocabulary ADR-0139 fixed. A tour the operator cancelled is not, strictly, something _we_ skipped. A fourth `EventStatus` (`canceled`) was considered and **not** taken: it is a Prisma enum migration plus some forty frontend consumers that test `=== SKIPPED` or `DONE || SKIPPED`, for a distinction the day does nothing different with — not happening is not happening, and the booking keeps its code in the Index either way. **For the device pass:** whether `דילגתם` on a parked booking reads wrong enough to earn its own word. If it does, the cheap answer is a kind-aware _label_ on the parked card, not a status.

**Skipping does not pass the hard gate.** `שינוי מחייב עדכון ההזמנה` guards edits to the commitment's time and its deletion; a settle is a record about the world, not an edit of the booking (§2's strip and the Map's row never asked either), and the booking itself is untouched.

**Tests:** `EventCard.test.tsx` pins the pair on an upcoming hard row and its identical twin on a soft one, its lead position, and its absence on passed / now / done rows and when either handler is missing; `shelf.test.ts` and `place-usage.test.ts` flip the assertions that had encoded the `=== SOFT`.

## Consequences

- **Frontend only, no schema change and no new write.** `applySetStatus`, the outbox, the undo toast and the backend column already served every kind (ADR-0139 §4's "a new caller, not a new mechanism", one more time).
- **The parity is a test rather than a promise.** `event-actions.test.ts` asserts that a hard row and a soft row in the **same** state produce the identical list, across every phase × today × read-only × strip combination, and `EventCard.test.tsx` asserts the same off the rendered DOM. A future divergence has to be written past both.
- **The amendment cost five predicates and a grid track**, which is the §1 infrastructure being paid back on its first real test: the order, the renderer and the parity tests are untouched.
- **`EventKind` / `EventPhaseName` moved to `ui/domain/event-phase.ts`** so the spec can name them without importing the component that renders it. `EventCard` re-exports both; no call site changed.
- **A passed row gains a panel it did not have.** Soft rows included — the ADR-0174 §3 amendment above. This is a behaviour change on a surface the report did not name, and it is what makes §2 affordable rather than a trade.
- **Every band is one line now** (⁦57px⁩), and most rows have none — the two-line row §1 measured lived for one afternoon. The device-pass question §1 left open (_"whether `בדרך` earns its place on every soft row"_) is answered by §5 rather than deferred: it does, on today, ahead of you, and nowhere else.
- **For the device pass:** whether the `לא סומן` chip on a passed booking reads as an open question rather than as a fault, beside a lock that is still on its when line.

## Alternatives considered

- **Give the strip to hard events and keep the early return.** The one-line version of §2, and it takes a booking's documents, code and warning off the card on exactly the day you go looking for the receipt. Rejected in §3.
- **Keep `בדרך` as the hard row's specialisation.** It preserves one line at 360px and preserves nothing else: there is no reading of ADR-0011 under which "I am on my way" is a property of a commitment, so it would have been the same undecided divergence with an ADR number on it. §5 scopes it by proximity instead, which is the axis it was always about.
- **Leave the `⋯` in the band and let the band be a strip of padding on a future day** (§5b). Rejected on the same ground as the wrap it replaced: a 40px line for one glyph, in a position that moves with the verb count.
- **Hide the whole card's expansion on a day that is not today.** Tempting once the band is empty, and wrong for §3's reason — the documents, tasks and notes under it are exactly what you open a future row to read.
- **Render the act-row pair through `SettleControl`.** Tempting under rule 8, and wrong on the words: ADR-0139 settled that the pair is a **record** (`היינו` / `דילגנו`) and that `actions.skip` stays for instruction surfaces. The act row is a row of verbs, so it keeps `סיימנו` / `דילוג`; the strip above it keeps the control. ADR-0139's "what was deliberately left" is unchanged by this ADR.
- **Order the row `ניווט` first, as the hard arm did.** Rejected with the coin-flip it was: neither arm's order was ever chosen, so the tie breaks to the arm that carried the whole set.
