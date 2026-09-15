# 0228 — The day row's quick actions are one ordered list, and a commitment can be marked done

**Status:** Accepted — **built 2026-09-15**
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

## Consequences

- **Frontend only, no schema change and no new write.** `applySetStatus`, the outbox, the undo toast and the backend column already served every kind (ADR-0139 §4's "a new caller, not a new mechanism", one more time).
- **The parity is a test rather than a promise.** `event-actions.test.ts` asserts that a hard row and a soft row in the **same** state produce the identical list, across every phase × read-only × strip combination, and `EventCard.test.tsx` asserts the same off the rendered DOM. A future divergence has to be written past both.
- **`EventKind` / `EventPhaseName` moved to `ui/domain/event-phase.ts`** so the spec can name them without importing the component that renders it. `EventCard` re-exports both; no call site changed.
- **A passed row gains a panel it did not have.** Soft rows included — the ADR-0174 §3 amendment above. This is a behaviour change on a surface the report did not name, and it is what makes §2 affordable rather than a trade.
- **The hard row gains a second line at 360px** (⁦57px⁩ → ⁦97px⁩); the soft row was already two lines and is ⁦+1px⁩. Left for the device pass: whether `בדרך` earns its place on every soft row, which is one `when` to change if it does not.
- **For the device pass:** whether the `לא סומן` chip on a passed booking reads as an open question rather than as a fault, beside a lock that is still on its when line.

## Alternatives considered

- **Give the strip to hard events and keep the early return.** The one-line version of §2, and it takes a booking's documents, code and warning off the card on exactly the day you go looking for the receipt. Rejected in §3.
- **Keep `בדרך` as the hard row's specialisation.** It preserves one line at 360px and preserves nothing else: there is no reading of ADR-0011 under which "I am on my way" is a property of a commitment, so it would have been the same undecided divergence with an ADR number on it.
- **Render the act-row pair through `SettleControl`.** Tempting under rule 8, and wrong on the words: ADR-0139 settled that the pair is a **record** (`היינו` / `דילגנו`) and that `actions.skip` stays for instruction surfaces. The act row is a row of verbs, so it keeps `סיימנו` / `דילוג`; the strip above it keeps the control. ADR-0139's "what was deliberately left" is unchanged by this ADR.
- **Order the row `ניווט` first, as the hard arm did.** Rejected with the coin-flip it was: neither arm's order was ever chosen, so the tie breaks to the arm that carried the whole set.
