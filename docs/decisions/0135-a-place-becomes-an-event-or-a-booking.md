# 0135 — A place becomes an event or a booking: one action on the way-in block

**Status:** Accepted — designed 2026-07-29 (session 181), after the owner rejected the session's first design in place; widened 2026-07-30 (session 182); **narrowed 2026-07-30 (session 183)**, when its §2/§4/§4a/§6 were extracted to [ADR-0136](0136-a-confirmation-code-makes-an-event-a-booking.md) because they are not map decisions (owner: _"independently from the maps, events in general"_). What is left is the map's half. **Design only; nothing below is built.** The mockup renders the shipped stylesheets in a headless browser and every number in §8 is read from its live DOM, but no canvas over real tiles has been seen (ADR-0121 §13) and nothing here claims otherwise.
**Date:** 2026-07-29

**Extends** [0121](0121-embedded-map-phase-6-design.md) **§8** — the selection-revealed way-in block, which lists one entry per reference a place **already has**, gains a single primary action (§1). §8's own rule (a row tap normalises the sheet to `half`) is untouched.
**Extends** [0134](0134-the-map-is-where-a-forms-place-comes-from.md) **§9** — its fourth target is the precedent this reads from, and §3 says why the errand's _channel_ is deliberately not reused. §3 of that ADR ("only one place is being chosen") is what makes §7 absent-during-an-errand.
**Needs** [0136](0136-a-confirmation-code-makes-an-event-a-booking.md) — what the form does once it opens with a place. Designed here, extracted there; the two build independently (§2).
**Applies** [0027](0027-soft-item-lifecycle-shelf-slip.md) **§2** and [0116](0116-day-aware-shelf-and-idea-target-day.md) **§1** unchanged: consume-on-schedule is reached from a new surface, not redefined (§5), with one case named where it deliberately does not fire.
**Relates** [0112](0112-place-in-trip-is-referenced-not-cached.md) (why a create is what puts a place in the trip), [0115](0115-plan-mode-place-research.md) §3 (`＋ אולי`, the only path today, and the control this reuses), [0028](0028-plan-violet-color-budget-dark-ready.md) (why the control is neutral), [0017](0017-mobile-first-device-targets.md) (the 360×640 screen §8 measures against), [0090](0090-back-is-computed-from-nav-state.md) (which this needs **nothing** from, and that is the finding).

Mockup: [`mockups/map-place-becomes-v1.html`](../../mockups/map-place-becomes-v1.html) — **shared with ADR-0136 since the split.** This ADR's frame is the way-in block in three states (shipped, the rejected menu, the proposal), with a panel measuring all three from the live DOM at three screens and two stops; the form and outcome frames are 0136's. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

A place added from the map can only ever be an **idea**. ADR-0115 §3 made `＋ אולי` one tap from a Google result, and ADR-0134 made the map the route a form takes to _get_ a place — but there is no path in the other direction. Standing on a place that is in the trip, nothing says "put this on Tuesday at 14:00" or "attach the reservation I just got".

Checked against the tree first:

- **`refEntriesFor` builds ways in to references that already exist.** One `.map-ref` per reference — an idea to the shelf, an event to its day, a booking to its detail. There is no create branch.
- **The row grammar is full** (ADR-0109 §1: badge · name · meta · distance · `נווט`), and ADR-0134 §4 already measured why nothing more fits there: `.map-right` is a column, so a verb added beside `נווט` buys no width and costs height.
- **Everything a create needs already exists on both sides.** `EventForm` takes `maybeItem` (the schedule-from-shelf flow, whose save runs `verbs.schedule` — create the event **and** consume the idea, one action). `BookingSheet` takes `seed`. `bookingEventFields` already produces a booking's linked event identically on client and server. And **the Map tab already hosts a form**, with `usePlaceErrandReturn<BookingSheetDraft>('booking', 'map', …)` already wired.

### The first design, and why the owner rejected it

This session's first pass hung **two** entries in the way-in block — `＋ אירוע` and `＋ הזמנה` — in the same grey `.map-ref` box as the references. The owner's verdict: **"cluttered and very amateur looking"**, and _"maybe the user doesn't choose one or the other but the code understands instead."_

Both halves were right, and both are recorded because the reasons generalise:

- **The shape.** A `.map-ref` says "this place is already there" and ends in a chevron because it **goes** somewhere. A create goes nowhere. Dressed in the same box, the expanded row became four equal grey rectangles — a summary, a navigation list and a **command menu** in one card. A selected item gets one obvious action; a create is not the references' peer.
- **The question.** "Event or booking?" is the app's question, not the traveller's. It asks a human to know the schema before they can say what they know.

## Decision

### 1. One action, in a control this tab already owns

The block keeps its reference list unchanged and gains a **footer with a single control**: `＋ שיבוץ ליום`.

It is `.map-addmaybe` — the pill the tab already uses for _make something out of this place_ (`＋ אולי` on a Google result). Same job, same neutral `--cta` (amber is time and commitment, plan violet is Plan mode, a create is neither: ADR-0028, root rule 4). What separates it from a reference row is **shape and weight**, not a new colour, which is what stops the block reading as a list of equals.

**One scoped size change, and it is a floor rather than a taste.** On a result row that pill is a trailing chip in a dense 68px row (~29px tall). Here it is the selected row's primary action, so it meets 44×44 (ADR-0017). Scoped to `.map-refs-foot`, so the result row is untouched.

No group header, and no second control: ADR-0134's session-164 correction ("the two corpora are not two sections") applies to a two-item menu with the same force.

### 2. What the form does with the place is **not this ADR's decision** — see ADR-0136

The action opens `EventForm` pre-filled with the place. What that form then does — the collapsed `יש קוד הזמנה?` line, a code creating a **`Booking`** instead of an event, the type derived from the form's category, the kind rules, and converting an existing event — was designed here in sessions 181–182 and **extracted to [ADR-0136](0136-a-confirmation-code-makes-an-event-a-booking.md)** in session 183, on the owner's call: _"independently from the maps, events in general."_

It is not a map decision and it is **independently buildable**. This ADR needs exactly one thing from it: that opening the form with a place is enough, because the form knows how to become either kind of thing. Read 0136 before touching the form; read this one before touching the map.

**What stays here** is the map's half: where the action lives (§1), why it is not the errand backwards (§3), what happens to the originating idea (§5), when it is absent (§7), and what the block costs (§8).

**§4 and §4a left with it, and the numbering keeps the hole on purpose** — this ADR is cited by section from `decisions/README.md`, the router and the mockup catalog, and renumbering to close a gap would rot every one of those references to save a reader one moment of surprise.

### 3. This is **not** the errand run backwards, and the difference is what the errand is for

The tempting reading is "ADR-0134 hands a place to a form; this hands a form to a place; reuse the channel." It is wrong, and saying why is most of this ADR's value.

**The errand exists because of loss, not because of direction.** A form is a `Modal` with local state that no URL addresses, so **leaving** it loses it. Everything expensive in ADR-0134 — the opaque `draft`, `usePlaceErrandReturn`'s exactly-once apply, the `hostTab` filter that took four attempts and a real browser to get right, five hosts wired — is machinery for surviving a **round trip between two screens**.

**Here there is no round trip.** The form opens **over the map, on the map's own tab**, which this tab already does for `BookingSheet`. Nothing is left, so nothing needs preserving: no draft, no `returnTo`, no host waiting on a channel, no nav-state rule. `Modal`'s own `useOverlay` is the entire back story — back closes the form and lands on the map with the row still selected.

**The precedent inside ADR-0134 is §9, not §1.** Its fourth target has no `returnTo` because it **starts on its own destination**, and session 179 named the rule: the target is the row, it has no field, and neither exit navigates. This is that shape from the other side.

**What the errand _is_ owed: one hook call.** The tab now hosts `EventForm` too, so it must call `usePlaceErrandReturn<EventFormDraft>('event', 'map', …)` — session 165's rule, _a host that renders a form owes it a way back_. Without it, a place errand started from the form's own picker (the field keeps its `onFind`, so the place stays changeable) returns to a closed form with everything typed gone. One line in a mechanism already generalised for exactly this, and the `hostTab` filter already handles a `returnTo` pointing at the Map.

### 5. The originating idea is consumed — through the path that already consumes it

If the place has **exactly one** idea referencing it, the action opens the sheet the shelf opens (`EventForm maybeItem={idea}`) and the save runs `verbs.schedule`: the event is created and the `MaybeItem` consumed, in one action. Not a new decision — ADR-0027 §2's, reached from a new surface.

**Why consuming is not optional.** Leaving the idea parked leaves the same place both scheduled and shelved: two rows in the list, two pins on the canvas, one of them a lie. The map is where that duplication is most visible.

**The code path consumes too.** A booking creates a linked event, so it puts something on the day exactly as scheduling does, and produces the same duplication. The consume is already a **separate call** on the existing path (`OUTBOX_VERB.CONSUME_MAYBE_ITEM` — see `applySchedule`, which issues it after the create rather than as part of it), so both paths end in the same line. What the build adds is a standalone dispatch for it with the same undo coverage `applySchedule` has, not a new sync path.

**With more than one idea, nothing is consumed, and that is deliberate.** Two ideas on one place are two intentions ("a meal there", "drinks there"), and scheduling one must not eat the other. The block itself cannot tell them apart — a shipped idea entry reads `על המדף · <day>` and nothing else — so the screen does not guess: the create is fresh, and the ideas stay on the shelf where scheduling one names it.

### 6. Hard vs. soft is never asked here

Withdrawn to [ADR-0136 §4](0136-a-confirmation-code-makes-an-event-a-booking.md), which owns the whole rule (derived at create, **preserved** on conversion). What matters on this surface is only the half that was always true: **the map does not ask.** Asking here would create a second place that decides commitment, which root rules 1 and 8 both refuse, and the control is one tap away inside the form either way.

### 7. Absent while an errand is live

When a place errand is pending, the tab is answering one question — _choose one place_ — and ADR-0134 §3 is explicit that the verb **changes** rather than accumulating. The footer is absent, exactly as `נווט` is: a control only where it has something to do, the derived-affordance rule this tab already runs for `קרוב עכשיו`, `אולי`, `מה נשאר`, `באזור` at zero and `frame` with nothing to frame.

### 8. What it costs, measured — and the finding is not the one this was built to look for

Read from the mockup's live DOM. A plain row is **73px**; the sheet's scroller is `.wp-snapsheet-body`.

| Selected row             | 390×844 · `half` (267px) | 360×640 · `half` (153px) | `full` (517 / 313px) |
| ------------------------ | ------------------------ | ------------------------ | -------------------- |
| As shipped (1 reference) | 142px                    | 142px                    | fits                 |
| **The rejected menu**    | 234px (**+92**)          | 234px, over by 81px      | fits                 |
| **This design**          | **198px (+56)**          | 198px, over by 45px      | fits                 |

One control instead of two costs **+56px instead of +92px** — under a plain row rather than over it — and at 390 `half` it is the difference between the block fitting with room and the block being the sheet.

**The form's own length is the other half of the cost, and it is not this ADR's** — it is paid on every screen that authors an event, so it is measured in [ADR-0136 §5](0136-a-confirmation-code-makes-an-event-a-booking.md) (482px → 560px with the line closed).

**And the block already overflows the `half` sheet on a 360 before this phase adds anything:** a place with two references is 186px against a 153px scroller, as shipped. So the create does not introduce the condition; it makes it ordinary. **One thing therefore ships with it that the shipped code never needed: selecting a row scrolls it into view** — `scrollIntoView({ block: 'nearest' })` inside the sheet's own scroller. Without it the footer can open entirely below the fold on the screen ADR-0017 names as the small target, and the action would be the half you cannot see. It is a fix for something already true, arriving with the change that makes it common.

### 9. What this does not do

- **It does not touch the Google result row.** A result not in the trip has no way-in block, because it has no references. The route stays `＋ אולי` and then the row's own footer — which also protects a measurement: ADR-0134 §5 measured that row to its limit (68px, six rows at 390).
- **It does not add a place-detail screen.** The place's answer is the row, not a screen of its own.
- **It does not change what a row tap or a pin tap does** (ADR-0129 §1 / ADR-0134 §6).
- **It does not take Phase 11** (booking phase labels on pins), which is a legibility question about the amber budget and deserves its own call.
- **It does not build ADR-0131 §9's long press**, still blocked on the coordinate-only `Place`.

## Alternatives considered

**Two entries, `＋ אירוע` and `＋ הזמנה`, in the block.** This session's first design; rejected by the owner and measured against in §8. It looks like a command menu because it is one, and it asks the schema's question.

**A map-local "create" sheet** carrying day, time and code (the shape ADR-0136 would have taken if it had stayed here). Contained blast radius, and a third authoring surface beside `EventForm` and `BookingSheet`. Rejected under root rule 8; the owner chose the app-wide line instead.

**Event only; no code line, booking stays out of the map.** The smallest change and the cleanest screen. Rejected because it drops the backlog line's second half ("attach the reservation I just got") and leaves the schema question merely moved rather than retired.

**Reuse the errand channel, backwards.** §3: it would navigate away from the map to author something about a place you are standing on, and pay the draft machinery's whole cost to protect a form nobody has typed into yet.

**Put the action on the row itself.** Measured and rejected before this session: ADR-0134 §4 established `.map-right` is a column, so a verb there costs height on every row rather than width on one.

## Consequences

- **The Map tab becomes a host of `EventForm`**, and therefore owes it `usePlaceErrandReturn<EventFormDraft>('event', 'map', …)`. Forgetting it reintroduces session 165's exact failure on a fifth host.
- **A standalone consume gains a dispatch.** Today `consumed` flips only under `TRIP_ACTION.SCHEDULE`; the code path needs the same flip without an event of its own, with matching undo.
- **`scrollIntoView` becomes load-bearing** on the selected row (§8). A future change adding a second footer control has a table to answer.
- **"Exactly one idea" is a branch in meaning, not just in data** (§5), and it is the kind of rule that gets simplified away by someone reading one half. Its reason is stated so that edit has to argue with it.

## The device pass, and what it owns

- **Whether the pill reads as the row's primary action** at 44px, against a reference row above it.
- **Whether 198px at `half` on a 360 is usable** even with the scroll-into-view — or whether a row tap on a small screen should drop to `full` rather than `half` when the block will overflow.
- **Whether a booking consuming an idea surprises anyone.** It is the same duplication argument as an event, but a longer inference to make.
