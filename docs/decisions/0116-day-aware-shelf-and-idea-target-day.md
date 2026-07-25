# 0116 — The shelf becomes day-aware: an idea's optional target day, one union in both modes, and skip vs. park

**Status:** Accepted (design + build)
**Date:** 2026-07-25
**Refines:** [0027](0027-soft-item-lifecycle-shelf-slip.md) (the parking-lot model: an idea is parked _or_ placed; the shelf renders unplaced ideas **and** skipped soft events "uniformly" — a promise only Trip mode ever kept), [0025](0025-trip-mode-edit-capability-tiers.md)/[0029](0029-trip-mode-day-scope-gating.md) (which verbs are reachable on which day — the gate the new day picker obeys), [0038](0038-icons-and-canonical-category.md)/[0109](0109-map-tab-design.md) §11 (an idea is created uncategorised; category is captured when it's scheduled — now also when it's parked), [0083](0083-whenfield-datetime-standard.md) (the one date/time entry primitive the schedule sheet finally uses), [0085](0085-relative-day-phrasing.md) (how an idea states its day)

Mockup: [`mockups/shelf-day-aware-v1.html`](../../mockups/shelf-day-aware-v1.html)

## Context

The maybe shelf shipped as a flat trip-wide pool and never grew past it. Checked against the tree this session:

- **Both hosts list every unconsumed idea, unscoped and unsorted.** `DayView.tsx` and `PlanDay.tsx` each render `maybeItems.filter((m) => !m.consumed)` — no day, no category, no order (the snapshot query has no `orderBy`), no cap, no collapse; overflow is a hidden-scrollbar horizontal strip. On a two-week trip with a research habit (now cheap to acquire — [ADR-0115](0115-plan-mode-place-research.md) put `＋ אולי` one tap from a Google result) that strip is the only home for every idea anyone ever had.
- **`MaybeItem` has no day and no order field at all** (`entities.ts` / `schema.prisma`): `title`, `icon?`, `category?`, `placeId?`, `consumed`, audit columns. So "what were we thinking of for Thursday?" is not a question the data can answer, and the Map's day filter can only ever show ideas in all-days scope.
- **ADR-0027 §2's uniform union is half-built.** Trip mode's `DayView` does render the day's skipped soft events as restorable shelf cards (`skippedToday`, scoped to `activeDate`). Plan mode renders no such thing — and hides skipped events from the builder on a live trip — so in Plan mode a skipped event is invisible everywhere.
- **`park` is the only path that turns an event back into an idea**, and it is Plan-mode-only, soft-only, and **drops the event's `category`** (it copies `title`/`icon`/`placeId`). Trip mode has no park affordance.
- **Slotting always means "the day you are standing on."** `buildScheduleEvent` takes `fields?.date ?? activeDate`; Trip mode's `ScheduleSheet` passes `date: activeDate` and offers a bare `TimePicker` with no date control at all — so putting an idea on Thursday means navigating to Thursday first. Plan mode's shelf hint copy says `גרור ליום כשמשבצים` ("drag it to a day"), which the app does not implement: the only drag is soft-event reorder _within_ a day.

## Decision

### 1. An idea gains an optional **target day** — pencilled in, not committed

`MaybeItem.targetDate` (nullable `YYYY-MM-DD`, mirrored in `@waypoint/shared`).

- **It is not a schedule.** No time, no `sortOrder`, no place on the timeline, not counted in the day's `remaining`, invisible to the glance rail and to now/next. An idea with a target day is still an idea; the only thing that changed is that it now says _which day we were thinking of_.
- **It is freely clearable** — back to `null` is "someday", the state every idea starts in. Nothing derives from it and nothing breaks when it's wrong, which is what makes it safe to guess (the same posture ADR-0113 took with the trip's primary timezone: a default you can fix, never a forced choice).
- **Why store it rather than derive a fit.** The rejected alternative was ranking the shelf per day by derived fit (near that day's stops, fills a real gap). It sounds cheaper — no migration — but it is a guess the user cannot correct, and the question being asked ("what did _we_ mean to do on Thursday") is a human intention, not a geometry problem. Derived fit is a good future _sort_ inside a group; it is not a substitute for the field.
- **`consumed` is untouched.** Parked vs. placed stays ADR-0027's binary; `targetDate` only qualifies the parked state.

### 2. The shelf is two groups, and an out-of-day idea names its day

The shelf (both modes) renders, in order:

1. **`לְיום הזה`** — ideas whose `targetDate === activeDate`, plus (unchanged, ADR-0027) that day's **skipped soft events**.
2. **`רעיונות`** — everything else: dateless ideas first, then ideas targeted at another day, each stating **which** day via `relativeDayLabel` (ADR-0085: `מחר`, `עוד 3 ימים`, …) in its meta line.

Three notes:

- **An idea targeted elsewhere is never hidden.** It sits in the pool with its day named — the same choice the Map list made for its rows in all-days scope (ADR-0109 session-109): a per-item label claims only what it knows, where a hard filter would silently omit. Hiding it would strand ideas on days you rarely open.
- **A group header appears only when it has content**, so a trip with no target days looks exactly like today's flat strip. This is additive: nothing about the existing shelf regresses if nobody ever uses the field.
- **Order inside a group** is the snapshot's order (unchanged — no `orderBy` added, no ordering field invented). Sorting the pool is a separate question and stays open.

### 3. The ADR-0027 union is rendered in **both** modes

Plan mode's shelf gains the day's skipped soft events, exactly as `DayView` renders them (same `MaybeCard` + `skipped-card` treatment, same one-tap `restore`). ADR-0027 §2 already decided this ("the shelf renders unplaced maybe ideas **and** skipped soft events, uniformly"); only Trip mode implemented it. Plan mode is the building surface, so a skipped event being invisible there is the worst case of the two — you cannot rebuild around something you cannot see.

### 4. Skip and park stay two verbs, and both are reachable in both modes

They answer different questions, and the fix is to make each one say its own thing rather than merge them:

| Verb     | Means                          | Data                                                  | Where it lives                                                             |
| -------- | ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| **skip** | "not happening"                | `status = skipped`; the event keeps its date/slot     | unchanged; restorable in place from the day's shelf group (§3)             |
| **park** | "keep the idea, drop the slot" | the event becomes a `MaybeItem`, the event is deleted | now in **both** modes, soft events only, wherever delete is allowed (0029) |

Two corrections to `park` while it is being surfaced:

- **It carries the event's `category`** (today it silently drops it, so a parked restaurant comes back uncategorised and its Map pin loses its hue). It already carries `title`/`icon`/`placeId`.
- **It carries the event's date as the idea's `targetDate`.** Parking is "not in this slot", not "not this day" — so the day survives as a pencil mark you can clear. This is the first writer of §1's field, and it makes the new field earn itself immediately.

**Merging the two was considered and rejected** (the "skip converts to a maybe" reading): it destroys the record that something _was_ scheduled for Tuesday 14:00 and abandoned, which is exactly what ADR-0027's "Unresolved (past day)" phase and the settle strip exist to let a human resolve. Skip is reversible in place; park is a deliberate demotion. Both, clearly labelled, beats one verb with a lossy default.

### 5. Slotting: the sheet picks the day, and a drag can drop an idea into a gap

- **The schedule sheet gains a day.** Trip mode's `ScheduleSheet` drops its bare `TimePicker` for **`WhenField variant="day"`** — the app's one date/time entry primitive (ADR-0083), which already carries date + start/end + the ADR-0107 zone chip. So "put this on Thursday" no longer requires navigating to Thursday. The day defaults to `targetDate ?? activeDate`.
- **Day-scope gates the range, it isn't re-decided here** (ADR-0029): in **Trip mode** `minDate` is trip-local today (scheduling into a past day is a create, and creates are locked there), in **Plan mode** the whole trip range is open. `maxDate` is the trip's end in both.
- **Drag targets free time, not rows.** In Plan mode a shelf card can be dragged onto a **gap chip**, which schedules the idea into that gap — the same write `GapFillSheet` already performs, reusing the existing pointer-capture drag (`data-gap-id` targets beside the existing `data-bld-id` ones). Dropping onto an occupied row is deliberately **out**: it would mean displacing a scheduled event, which is a ripple decision (ADR-0041) and not what "drag it to a day" ever meant. Tap-to-schedule stays the complete path (any day, any time); drag is the shortcut for the obvious case, and the mockup's long-standing `גרור ליום` hint stops being a lie.

## Consequences

- **The shelf can finally answer "what's this day about?"** without pretending an idea is scheduled, and the Map's day filter gains ideas that were previously all-days-only (a place referenced by an idea with a `targetDate` now has a day facet).
- **One schema field, one migration**, additive and nullable; every existing idea reads as "someday" with no backfill. `createMaybeItemSchema` + the `CREATE_MAYBE_ITEM` outbox op carry it, so it works offline through the existing path.
- **ADR-0027's union is true for the first time**, in both modes, and `park` stops quietly losing data.
- **The schedule sheet joins the WhenField standard** (ADR-0083) instead of being the last bespoke time-only control, which also gives it the zone chip for free.
- **Deferred, recorded here rather than half-built:** sorting the idea pool (by fit/proximity/recency — the derived-fit idea from §1, a good sort but not a field); a "someday vs. this trip" split for ideas that outlive the trip; dropping an idea onto an occupied row (needs ripple semantics); and a shelf-level filter row mirroring the Map's chips (the shelf is a strip, not a list — earn it when the strip crowds).

## Alternatives considered

- **Keep the shelf dateless and flat** (status quo). Rejected: it is the only surface with no answer to "which day were we thinking of", and ADR-0115 just made ideas cheap to accumulate, so the strip only gets worse.
- **Derive a per-day fit instead of storing a day** (rank by proximity to that day's stops / gap size). Rejected as the primary mechanism (§1) — a guess with no correction affordance — but kept on the table as a future _sort_.
- **Give an idea a full `startsAt`** so it can be pencilled in at a time. Rejected: that is a scheduled event with extra steps, and it would drag an idea into the timeline, the glance, and now/next — exactly the boundary ADR-0027 draws between parked and placed.
- **A `sortOrder` on `MaybeItem`** so the shelf can be arranged by hand. Rejected for now: no surface asks for it, and the shelf's grouping (§2) is the cheaper answer to "the strip is a jumble".
- **Merge skip into park** (§4). Rejected: loses the "was scheduled, didn't happen" record ADR-0027's phases depend on.
- **Drop an idea onto any builder row.** Rejected (§5): displacing a scheduled event is a ripple decision, not a drop target.

## Amendment (2026-07-25, session 113) — post-ship fixes from real screenshots

Three things the shipped build got wrong, reported from the running app on a phone. All three are consequences of §2 and §5, so they belong here rather than in a new ADR.

**1. The two shelf groups rendered at different heights.** Both groups render the same `MaybeCard`, so the cause wasn't a forked component — it was that `.shelf` is a flex row, and splitting the shelf into **two** strips gave each its own `align-items: stretch` context. Each strip sized to its own tallest card, so one long place name (a researched hotel carrying its full official name, wrapping to three lines) made `לְיום הזה` visibly taller than `רעיונות`. The fix is a **`min-height` floor on the card** (fitting icon + a 2-line title + meta + the action) plus a **2-line clamp on the title** so nothing can exceed the floor — the same clamp the event card's title already uses. The action also moves to the card's floor (`margin-top: auto`), so the `＋ שבץ ליום` line aligns across cards whose titles differ in length. Cards are now one height in every group, which is what the shelf looked like before it had groups.

**2. A drag couldn't reach past the viewport.** §5 gave the drag its target (a gap chip) but said nothing about reach: the day's list is taller than the screen and the shelf sits at the bottom of it, so the gap you're aiming for is frequently off-screen and the drag had no way to get there. **While the pointer is held near the top or bottom edge, the scroller now keeps moving under it** — the step ramping with depth into the edge band, so easing toward the edge crawls and pinning against it moves at full speed. It resolves the **nearest scrolling ancestor** rather than assuming the window (this app scrolls `.body`, not the document). Shared by **both** of the builder's drags: the reorder grip had the identical reach limit, so this is one mechanism (`lib/edge-autoscroll.ts`), not a second copy — and the pacing is a pure function, so it is tested without layout.

**3. The purple stroke on a selected card read as choppy.** Two overlapping causes, both geometry rather than colour: the dragging state used `outline` + `outline-offset`, which draws its own corner radius over the card's dashed border, and the inner body button's focus ring drew a **`radius-8` outline inside a `radius-15` card**, so its corners cut across the card's rounded ones. Both are now a **spread `box-shadow` ring on the card itself**, following the card's own radius and anti-aliased — the idiom the Map's next-stop ring already uses. Focus keeps teal, drag keeps violet; the inner ring is gone.

**4. The shelf strips stopped scrolling — a regression from (2), and its first fix was wrong too.** `touch-action: none` on every draggable card is what makes a vertical drag possible, and it also killed the browser's pan gesture on the card, so swiping the strip only worked if your finger happened to land in a gap between cards. Reported as "a chopped idea": the third card sat half-off the edge with no way to reach it. The strip also adopts the **edge-fade mask** ADR-0100 §6 established for the Index chip row (same declarations), so an inherently-partial card at the edge reads as "scroll for more" rather than as clipped.

The first fix was `touch-action: pan-x` — split the gesture by **direction**: sideways scrolls the shelf, vertical drags the card. It restored the strip and broke the page: a vertical swipe starting on a card dragged it instead of scrolling the day underneath, which is worse than the bug it fixed. **Direction cannot arbitrate this, because "swipe up to scroll" and "drag up onto a gap" are the same movement.** See (6).

**6. The gesture is arbitrated by TIME, not direction: press-and-hold to drag** (the owner's suggestion, and the right one). A drag arms only after the finger has been still on the card for `DRAG_HOLD_MS` (280 ms); any movement past an 8 px slop before that cancels the pending drag, so the browser keeps the gesture and the scroll proceeds untouched. Scrolling is therefore the default in **both** axes — no `touch-action` override on the card at all — and dragging is a deliberate act, the same bargain the platform's own reorder gestures make. Four details worth recording, since each is a bug if missed:

- **The armed drag suppresses scrolling itself.** Setting `touch-action` on arm is too late (the browser decides at touch-start), so while armed a non-passive `touchmove` listener calls `preventDefault()` — React's own `onTouchMove` can't do this reliably.
- **A mouse arms immediately.** There is no scroll to disambiguate from (the wheel scrolls), so a hold on a pointer device would just feel broken.
- **The click a completed drag fires is swallowed** — the card is a button, so a drop would otherwise also open the schedule sheet.
- **A long press on a button starts a text selection / iOS callout**, so a draggable card sets `user-select: none` + `-webkit-touch-callout: none`, and the context menu is prevented while the hold is live. **That is not sufficient on its own** (reported from the running app): `selectstart` is the event that actually begins a selection, and once the finger moves it is selecting whatever sits _under_ it — a row, a header, anything but the card. So a pending hold cancels `selectstart` document-wide, and an armed drag additionally parks a `body.wp-dragging` class that turns selection off page-wide until the drop; a selection that slipped through before the listener attached is cleared on release. The guard is its own `useSelectionGuard`, shared with the reorder grip — which arms on contact rather than on a hold, but drags across the same text.

The mechanism is `lib/useHoldToDrag.ts`, tested through the arbitration itself (a flick never arms, a hold does, a wobble is tolerated, a cancel is not a drop, a drop is not a tap). The Plan-mode shelf hint now teaches it (`לחצו כדי לשבץ · לחיצה ארוכה לגרירה`) — the hold is the one part of the gesture nobody guesses.

**5. An idea can be dragged between the two groups.** §2 grouped the shelf by `targetDate` but left **no way to set one** except parking an event — research and the quick-add both create dateless ideas, so the `לְיום הזה` group was unreachable for most ideas. Dragging an idea onto the day's strip now pencils it in for that day, and dragging one back to the pool clears it to "someday". This is a **day re-aim, not a schedule** (the drop targets are distinct: a gap chip schedules, a group only re-aims), and the toast says so rather than reusing "שובץ".

- **The empty day group materializes during the drag.** On a day nothing is pencilled into, §2's "a header only when its group has content" rule left nothing to drop onto. While a pool idea is being dragged, the group appears with a dashed drop zone; it disappears again on release. Chrome that exists only while it is useful.
- **It needed the first write path for an existing idea:** `PATCH /trips/:tripId/maybe-items/:id` with a deliberately narrow `updateMaybeItemSchema` (`targetDate` only — the one field with an edit surface), through `ChangeService.mutate` like every data-plane write, plus an `UPDATE_MAYBE_ITEM` outbox verb + cache mirror + a `TRIP_ACTION.UPDATE_MAYBE` reducer case, so it works offline and undoes like everything else on the shelf.

## Amendment (2026-07-25, session 115) — the drag and the auto-scroll were fighting over the scroller

Reported from the running app: "dragging and auto-scrolling aren't working properly, I think they're clashing." They were, in two independent ways, and both are about the auto-scroll rather than the hold:

1. **The auto-scroll picked the wrong scroller.** It walks up for the nearest ancestor that scrolls vertically — and a horizontally-scrolling strip **reports `overflow-y: auto`**, because CSS makes the other axis compute to `auto` when one axis is not `visible`. The shelf strip is typically a pixel or two taller than its box, so it passed a bare `scrollHeight > clientHeight` test and the drag spent its frames nudging a 2 px strip instead of scrolling the page. A minimum-overflow floor (`DRAG_SCROLLER_MIN_OVERFLOW_PX`) is the fix, and it is load-bearing rather than defensive.
2. **The drop target went stale while the page moved.** The hit-test ran only on pointer _move_, but a finger held in the edge band doesn't move — the content does. So the gap you just scrolled into view never lit up and couldn't be dropped on: the drag looked broken exactly when the auto-scroll was doing its job, which is why the two read as clashing. The auto-scroll now calls back on every frame that **actually** scrolled (not merely every frame it wanted to, so hitting the end of the scroller costs nothing) and the drag re-runs the same hit-test the pointer uses.

**And the lift was styled backwards.** The dragged card was rendered at `opacity: 0.55` — a convention borrowed from implementations where a **ghost follows the finger** and the source dims to show it left. Nothing follows the finger here, so the card is the only feedback there is, and fading it (ring included) made the thing you were holding the faintest thing on screen. It now reads as picked up: full opacity, a crisp 2 px violet edge, real elevation, a 1.03 scale, and lifted above its neighbours so the ring isn't clipped by the next card.

## Amendment (2026-07-25, session 116) — the gesture never owned the finger, and three separate reasons why

Reported after session 115 shipped: "still unfixed, still the same exact bugs" — the finger scrolls the page one way while the edge auto-scroll drives it the other, the card never settles over a drop target — plus "the drag activates, but only when you hold specific areas of the card". Sessions 113–115 had each fixed a real defect and left the reported symptom in place, which is the signal that the defects were being guessed at rather than observed. So this round started with a **browser-contract e2e** (`frontend/e2e/shelf-drag.spec.ts`, CDP touch events on a 390×660 touch viewport) and let it name the causes. It found three, none of which the reports had separated:

**1. Any re-render inside the hold window cancelled the pending drag.** `useHoldToDrag`'s teardown was `useEffect(() => reset, [reset])`, and `reset` closed over the object `useSelectionGuard()` returns — a fresh literal on every render. So the effect's cleanup re-ran on **every** re-render of the builder, clearing the hold timer. The Plan day builder re-renders once a second (it renders the now-line off `useClock`), so a 280 ms hold armed or didn't depending on where it fell between ticks. **That is the whole "only some areas of the card" report**: the card was never the variable, the timing of the next re-render was — which is also why a jsdom probe of all four card regions passed. The guard object is now memoised, and the teardown is unmount-only through a ref, so identity churn cannot reach a live gesture.

**2. The edge auto-scroll measured its bands against the wrong box.** It compared a **viewport** `clientY` with the **scroller's** height. `.body` starts below the app header, so both bands sat roughly a header's height too high: a finger resting in the middle of the list computed as "past the bottom edge" and the list ran away under it at full speed. Read against the scroller's own `getBoundingClientRect()`, which is what the pure `edgeScrollStep` was always documented to take. This, not native scrolling, is most of what the report described as "the two scrolls fighting".

**3. The click a drop fires retargets, so the card could not swallow it.** Session 113's fourth bullet ("the click a completed drag fires is swallowed") was implemented as `onClickCapture` on the card — but a dragged card is `pointer-events: none` (session 115, so the drop hit-test sees what is _under_ the finger), which means the click lands on that other element and never passes through the card at all. Releasing a drag over a gap chip therefore opened the new-event sheet. The swallow is now one document-level capture listener, armed for exactly one click after a drop, self-disarming on a timer if no click arrives. The e2e caught this as a side effect of holding the same card four times in a row.

**What did work, and what was removed as a dead end.** Attaching the non-passive `touchmove` guard at **mount** rather than on arm is correct and is what actually suppresses native scrolling — proven by the e2e, which measures `.body`'s `scrollTop` across an armed drag through the middle of the scroller. Two CSS routes tried alongside it are gone, documented in `styles/tokens.css` so they aren't reintroduced:

- `touch-action: none` on a live drag — `touch-action` is read when the touch **starts**, so setting it mid-gesture changes nothing;
- `overflow-y: hidden` on `.body` for the drag's duration — it does stop native scrolling, but the container then stops reporting as a scroller and `nearestScroller` finds nothing to scroll, so the edge auto-scroll dies with it. The two guards were cancelling each other.

**Why an e2e, and what it still cannot prove.** Every defect above turns on something jsdom does not have: a compositor, real layout, real hit-testing, `cancelable` touch semantics, a clock driving re-renders. The unit tests were green through all four reported rounds. Chromium is not the engine the reports came from, so the file catches the **class** of bug and keeps it from returning; feel — whether the hold reads as responsive — is still out of reach of any automated test, and ADR-0017's real-device pass still stands. Two of the three causes are also expressible in jsdom once you know what to look for, so they are pinned by unit tests too (a re-render mid-hold, and a retargeted click), each verified to fail against the pre-fix code.

## Amendment (2026-07-25, session 117) — the drag shows where it is, and two targets it never had

Three requests from the owner once the gesture finally worked on a phone, all of them the same complaint from different angles: the drag was correct but uninformative, and it did not accept the cards or the days it obviously should.

### 1. The held card follows the finger

Until now the card stayed in its slot and only changed style, so the drag said "picked up" but never "…and it is over **here**" — the drop stayed guesswork right up to the release.

**A clone moves, not the card**, and the reason is structural rather than conventional: the card lives inside `.shelf`, a horizontally scrolling strip, so translating it in place would clip it at the strip's edge the moment it left, and it would drag its own layout slot around with it. `position: fixed` escapes that clipping. The clone is explicitly **not an overlay in ADR-0090's sense** — it is not a back target and must never enter the back stack, so it does not go through `Modal`/`useOverlay`.

The position is written straight to the node's style (`lib/useDragGhost.ts`), not held in React state: it updates on every pointer move, and routing ~60 state updates a second through this screen would re-render the whole builder for each one. That cost is not hypothetical — a churning render is exactly what broke the hold in session 116. The grab offset is kept too, so the clone appears where the card was instead of snapping its own corner under the finger.

**This reverses session 115's call on the source card**, with the reason it named. That session removed the dragged card's `opacity: 0.55` because a fading source is a convention borrowed from implementations where a ghost follows the finger — and nothing followed it, so dimming made the one thing you were holding the faintest thing on screen. Something follows it now, so the source dims again, as the slot the card came out of. It keeps its space, so the drop targets do not reflow mid-drag.

One RTL trap, recorded because it cost a debugging round: the clone anchors with the **physical** `left: 0`, not the logical `inset-inline-start: 0` this codebase otherwise prefers. In RTL the logical property resolves to `right: 0` and anchors the box to the viewport's right edge, while the transform is computed from `clientX`, which is physical — mixing them put the clone a viewport-width away from the finger.

### 2. A skipped event drags

A skipped soft event renders on the day's shelf group (§4, ADR-0027's union) and was the **only card there you could not drag** — the card that most obviously wants to go back onto the day. It drags now, through the same mechanism: the drag carries a **tagged subject** (an idea or a skipped event) and everything up to the release is identical, so this is not a second drag implementation. Only the write differs.

- **Dropped on a gap it is restored INTO that gap** — `status: planned` plus the new slot in **one patch**, so it is one row in the change feed and one undo rather than "restored" then "moved". A plain restore would put it back at its old time, contradicting the gesture that just placed it somewhere specific.
- **A shelf group is deliberately not a target for it.** An event has no `targetDate` to re-aim, and converting one into an idea is `park` — a different verb, with its own affordance in the row menu, and not something a stray drop should trigger.

### 3. An empty day accepts a drop, and asks for a time

Gap chips only exist _between_ events, so a day with nothing on it offered **no drop target at all** — on the very day where dragging an idea in is most obviously the point. While a card is in flight the empty state itself becomes the target, the same "chrome that exists only while it is useful" move the empty day _group_ already makes on the shelf (§2 amendment).

It knows **which** day but has no slot to offer, so the kinds diverge and both readings are honest: an **idea** has no time at all, so the release opens the schedule sheet and the time is the user's to pick rather than one the drop invents; a **skipped event** already owns a time, so it simply goes back to it.

### Where the decision lives

All of the above is one table — `lib/shelf-drop.ts`'s `resolveShelfDrop(kind, target, activeDate)` — pure and separate from the screen, with the screen's `onDrop` reduced to turning each outcome into the verb that already performs it. That split exists for a testing reason: these are data writes (one of them restores and moves an event in the same patch), and the drag that produces them **cannot be driven in jsdom** at all. The table is unit-tested exhaustively without a browser; the gesture is covered by the e2e.

The e2e harness grew one capability to make this provable: it now answers `PATCH /trips/:tripId/events/:id` rather than only reads. Without it the optimistic update landed, the real request 404'd against the dev server, and the app correctly rolled itself back — so a test asserting what a drop **produced** was really asserting the rollback.

## Amendment (2026-07-25, session 118) — the drag goes both ways, and one ghost serves both of them

Two requests, and together they close the drag's remaining asymmetries.

### 1. A builder row can be dragged onto the shelf

§5 gave the shelf a way to put a card **onto** the day (a gap chip) and left the day with no way to send a row **back**. The row's grip already dragged — for reorder — so this adds a target rather than a gesture: a shelf group is now a drop target for a row, and dropping there **parks** it.

Which group decides the idea's **day**, not whether it parks at all: the day's group keeps it pencilled in for the day it came off (which is what `park` already did by default, §4), the pool clears it to "someday". `park` gains a `targetDate` override for exactly that second case — the one field with a reason to differ.

**Both groups materialize for a row drag**, not just one. §2's amendment conjured the day's group for a pool idea in flight; a row can target either, and on a day with an empty shelf that means both would otherwise be missing. Each empty zone names its own outcome (`ליום הזה` / `מתישהו`) rather than both saying "drop here", because for this drag the choice of group is the whole decision.

**Reorder still wins on a row and the shelf wins over a row**, resolved in `lib/shelf-drop.ts`'s `resolveRowDrop` beside the card's table: the shelf sits below the list, so being over it is the more deliberate act. Dropping a row on itself is nothing — a grip nudged and released.

### 2. The row drag gets the ghost too, and the ghost became a DOM clone

Session 117 gave the shelf card a floating clone and left the row drag with only the source's dimming, which is the same "correct but uninformative" gap that request was about.

The clone is now a **`cloneNode` of whatever the finger picked up**, rather than a React re-render of it. That is what lets **one** mechanism serve markup as different as a 150 px shelf card and a full-width builder row: neither needs a bespoke "how do I draw myself while dragging" renderer, and the clone cannot drift from the original because it _is_ the original's markup (CLAUDE.md rule 8 — the alternative was a second ghost renderer beside the first). Session 117's `shelfCard(subject, ghosted)` branch is gone with it, and the lift styling moved from the card's own CSS to `.wp-dragghost > *`, where a spread `box-shadow` picks up whatever radius the cloned element already has.

Two things the clone must do that a naive copy wouldn't:

- **It is sized to its source.** Lifted out of its parent, a full-width row (or a card sized by a flex strip) collapses to fit its text.
- **Ids and `data-*` attributes are stripped, at every depth.** `pointer-events: none` already keeps the clone out of `elementFromPoint`, but a `querySelector` — in app code, or in a test — would happily find a second `[data-bld-id="ev-1"]`. The clone is scenery; it must not be addressable.

### A note on the e2e that came out of this

The "drop target keeps up while the page auto-scrolls" case was rewritten. It used to hold the finger where a **gap chip would sweep past** it, and assert the highlight appeared — which races React's batching: a target under the finger for one or two frames may never be painted, and the test failed under parallel load for a reason unrelated to the behaviour. It now holds in the opposite band so the scroll **ends** with the shelf at rest under the still finger: a stable end state, same invariant, no race. A swept target is not a thing to assert on.
