# 0116 — The shelf becomes day-aware: an idea's optional target day, one union in both modes, and skip vs. park

**Status:** Accepted (design + build) — **amended 2026-08-22** (§2b: the surface's inline edge is a second route to another day; §2c: that turn is drawn rather than teleported; §2d: it is lifted to a detent and completed by staying, superseding §2c's approach — and repaired the same day, twice: the ghost's containing block, the interrupted turn, the band's hysteresis, the cheaper reversal, and then the landing that keeps the detent)
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

### 5a. Amended 2026-08-01 (session 206, notes phase 5): **a tap on an idea opens the idea, and `שיבוץ ליום` is the first thing in it**

The tile's tap went straight to the schedule sheet. It now opens a `RowManageSheet` for the idea, whose first action is `שיבוץ ליום` — so scheduling moves **one tap deeper** and is named where it used to be implied. This is a behaviour change to a shipped gesture, which is why it is here rather than in a session note.

**Why it had to change.** [ADR-0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6 gives every note host a surface where the note's **body** lives, and [ADR-0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §8 closed the idea's gap with "the sheet the tile already opens". There was no such sheet: the tile's only tap was `onSchedule`, so nowhere in the app said _"here is this idea"_ — and a note section above a **scheduling form** is the wrong room, because the form's whole question is "which day and what time", not "what do we know about this". Building the sheet also collects the idea's scattered verbs (a tap that scheduled, a Plan-only `✕`) onto the one surface ADR-0138 §1 says a row's actions belong on. The idea was the last shelf citizen with no such surface; a **skipped** event still restores on tap, because it has one — its own day row.

**What makes the extra tap affordable:** in Plan mode **hold-to-drag onto a gap chip (§5 above) is the fast path** for slotting, and it is untouched. Trip mode keeps one tap to the sheet and one to the day picker, on the surface where writing a note matters most (ADR-0153 §9 — authoring is ungated and most valuable on the ground).

Rejected, with what each costs:

- **A `⋯` in a corner.** Plan's remove `✕` already owns top-inline-end and ADR-0153 §7 puts the note mark at top-inline-start — three controls on a 140×76 tile, two of them 20px.
- **Long-press.** Taken by hold-to-drag (§5), and it is the gesture nobody guesses.
- **Tapping the note mark as the way in.** The right instinct, and the app's own `PlaceBadge` idiom, but the mark is ~13px against a 44px floor (ADR-0017) — the same objection that made it read-only in ADR-0153 §8.

**Capabilities are unchanged.** The sheet offers `הסרה` only where the host already allowed it (Plan mode's `✕`, §4), and it offers **no `עריכה`** — the mockup drew one and the app has no idea-edit surface, so inventing a form here would be a second decision hidden behind a gesture change. The section hints say what a tap now does (`לחצו לפתיחה ולשיבוץ`, and Plan's `לחצו לפתיחה · לחיצה ארוכה לגרירה ליום`).

**Amended 2026-08-11 (owner, on a report from a real user):** both section hints are **removed**, along with the gesture clause in `skippedTag` (now the state alone, `דילגתם`). The objection was that a surface needing a sentence to be operable should be fixed rather than captioned, and that the caption made the screen look cluttered. Capabilities are again unchanged — what a tap opens is exactly what it opened before; only the sentence announcing it is gone.

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

**6. The gesture is arbitrated by TIME, not direction: press-and-hold to drag** (the owner's suggestion, and the right one). A drag arms only after the finger has been still on the card for `DRAG_HOLD_MS` (500 ms, matched to Android's own long-press timeout — see the 2026-07-25 session-124 amendment); any movement past an 8 px slop before that cancels the pending drag, so the browser keeps the gesture and the scroll proceeds untouched. Scrolling is therefore the default in **both** axes — no `touch-action` override on the card at all — and dragging is a deliberate act, the same bargain the platform's own reorder gestures make. Four details worth recording, since each is a bug if missed:

- **The armed drag suppresses scrolling itself.** Setting `touch-action` on arm is too late (the browser decides at touch-start), so while armed a non-passive `touchmove` listener calls `preventDefault()` — React's own `onTouchMove` can't do this reliably.
- **A mouse arms immediately.** There is no scroll to disambiguate from (the wheel scrolls), so a hold on a pointer device would just feel broken.
- **The click a completed drag fires is swallowed** — the card is a button, so a drop would otherwise also open the schedule sheet.
- **A long press on a button starts a text selection / iOS callout**, so a draggable card sets `user-select: none` + `-webkit-touch-callout: none`, and the context menu is prevented while the hold is live. **That is not sufficient on its own** (reported from the running app): `selectstart` is the event that actually begins a selection, and once the finger moves it is selecting whatever sits _under_ it — a row, a header, anything but the card. So a pending hold cancels `selectstart` document-wide, and an armed drag additionally parks a `body.wp-dragging` class that turns selection off page-wide until the drop; a selection that slipped through before the listener attached is cleared on release. The guard is its own `useSelectionGuard`, shared with the reorder grip — which arms on contact rather than on a hold, but drags across the same text.

The mechanism is `lib/useHoldToDrag.ts`, tested through the arbitration itself (a flick never arms, a hold does, a wobble is tolerated, a cancel is not a drop, a drop is not a tap). The Plan-mode shelf hint now teaches it (`לחצו כדי לשבץ · לחיצה ארוכה לגרירה`) — the hold is the one part of the gesture nobody guesses.

**Amended 2026-08-11 (owner):** that hint is **removed** with the rest of the shelf's explanatory copy (§4's amendment). The hold is still the part nobody guesses, so **the drag's discoverability is now an open question this ADR no longer answers.** What makes the removal affordable rather than a capability loss: the tap path reaches everything the drag does — a tap opens the idea's sheet and `שיבוץ ליום` is its first action — so the hold is a fast path, not the only one. If the drag turns out to go unused, the fix owed is an affordance, not the sentence back.

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

## Amendment (2026-07-25, session 119) — one gesture for everything, and the day strip joins the drag

Two requests. Together they finish the model: every draggable thing in the builder now uses the same gesture, and the drag can reach days that aren't on screen.

### 1. The row's grip and its ▲/▼ pair are retired; a row drags on a hold, from anywhere

A soft row needed a dedicated ⠿ handle for one reason: its drag armed **on contact**, so making the whole row draggable would have eaten the row's tap (which opens the edit sheet). Time arbitrates now — the same press-and-hold the shelf card uses, through the same hook — so the handle has no job left. Both it and the ▲/▼ stack beside it are gone, and the row gets that width back on a phone (ADR-0017).

**Reorder keeps a non-pointer path**, deliberately: `הקדם`/`אחר` move into the row's ⋯ sheet, which is where row actions belong anyway (the ADR's own rule) and is reachable by keyboard and screen reader. Dragging is now the _primary_ way to reorder, not the only one — retiring the arrows without that would have removed reordering from anyone not using a pointer.

### 2. The header's day strip is part of the drag

The drag could only reach the day already on screen. Now, while a drag is in flight:

- the strip's pills become **drop targets** — releasing on one puts the dragged thing on that day (an idea gets its target day, a row is **moved** there keeping its own clock time, guarded because a hard event changing days is a commitment change);
- **resting on a pill switches to that day**, the spring-loaded-folder idiom, so you can carry a card or a row into a day and then drop it on a gap there. Gated on a dwell (`DRAG_DAY_DWELL_MS`), which is the whole substance of it: a drag crosses several pills on its way anywhere, and opening every day it merely passes over would be unusable.
- A **skipped** card is not accepted by a pill: it belongs to the day it was skipped on, and moving it elsewhere is a reschedule rather than a pencil mark.

**Cancelling puts the day back.** A drop that resolves to nothing — or a cancelled gesture — returns to the day the drag was lifted from, however many days it dwelled through. A committed drop keeps the new day, because you just put something there and want to see it. The asymmetry is the point: the day switch is **scaffolding for the drag**, and day changes are `replace` navigation with no back step (ADR-0035/0090), so a switch left behind by an abandoned gesture would have no reverse gear at all.

### 2b. The surface's own inline edge is a second route to the same day (amended 2026-08-22)

Owner, after the day gained a swipe: _"Regarding event/shelf drag, it should behave differently now. Swipe should be disabled when dragging and you could drag from the edge to a different day."_

§2 gave the drag one way to reach a day that is not on screen, and it is the right way for a mouse and the wrong shape for a thumb: the pills are ~30px targets at the **top** of the screen, and what you are usually aiming at afterwards is a gap chip further down. So **holding the drag near the day surface's inline edge names the day beyond it**, and the dwell that switches to it is `useSpringLoadedDay` — the same hook, the same `DRAG_DAY_DWELL_MS`. One answer to "resting somewhere switches the day", wherever you rest.

Almost nothing here is new, and that is the design rather than an accident:

- **The band arithmetic and the latch are the edge auto-scroll's** (`edgeDepth`, `gateEdgeStep`), shared rather than copied — and the latch is the reason the sharing matters rather than being tidy. Its scar transposes exactly. Vertically it was _"you pressed, held, and the list took off"_; on the inline axis an event row spans the whole surface, so a card or row lifted by its trailing end starts **inside** a band and the days would begin flipping under a finger that had not moved. The gate makes the drag ASK for the band first — by leaving it, or by pushing deeper into it than it was lifted at.
- **The neighbouring dates are the swipe's**, read straight off `useDaySurface`'s peek pair (ADR-0200 §7). Two ways of reaching tomorrow that computed "tomorrow" separately would eventually disagree about it; and `null` at the trip's ends is what makes the edge do nothing there, with no label, exactly as the swipe's rebuff does.
- **The mirror is the peek's.** In RTL the next day's pane sits to the LEFT (`--peek-dir`), so dragging a card left is dragging it toward tomorrow. Read off the element rather than the document, because direction is a CSS variant.
- **Cancelling still puts the day back**, however many days the drag walked through — §2's asymmetry, inherited by feeding the same dwell rather than restated.

**Holding still has to keep stepping, and that is the one thing the dwell could not give for free.** The edge's target is computed from a pointer position, so once the day has switched, a finger that does not move produces no further move event — and the day it named is now the day you are standing on, which `useSpringLoadedDay` correctly refuses as "not a switch". Recomputing when the **neighbours** change is what turns one step into a queue of them, 700ms apart, ending itself where the neighbour is `null`.

**The edge navigates and is deliberately not a drop target.** Feeding it into `overDate` would have been one character of code and a real defect: `resolveShelfDrop` checks `overDate` **before** the gap chip, which is safe only because a pill and a chip can never be under one pointer. An edge band and a chip can — a chip spans the surface, so its last 36px lie inside one — and a drop meant for that slot would have silently become "aim at another day". So a release at the edge means what a release over the surface's margin already meant, and the pill keeps its `drop-over` mark to itself: marking the edge's target the same way would promise a landing that releasing there does not deliver.

**What this leaves open, and it is the one thing worth a device's opinion:** there is no pre-dwell affordance. Nothing says "hold here and the day will turn" — the turn itself is the only feedback, 700ms in. That is exactly how the pill behaved before it had `drop-over`, and it may read as unresponsive on glass. The candidate answer is already in the app's vocabulary rather than new: ADR-0200 §7's peek, a sliver of the neighbouring day at the edge, which is the same claim ADR-0182 §5 made for the Map track — the edge of the next thing is the affordance. Not drawn here, because a pre-dwell hint is a visual decision and this amendment introduces no pixels at all.

### 2c. The turn is drawn, not teleported (amended 2026-08-22)

> **Superseded in approach by §2d the same day** — the claim "the turn is drawn rather than teleported" holds and is what §2d builds on; the pane-only lean this section chose was rejected on sight and is not the shipped motion. Kept because its measurements (the gutter, the clone's coverage, the `--peek-dir` defect) are what §2d stands on.

Owner, on §2b as shipped: _"I think that we need some kind of an animation or something for dragging between pages. Something that looks polished."_

Drawn and measured in [`mockups/a-day-turns-under-a-held-card-v1.html`](../../mockups/a-day-turns-under-a-held-card-v1.html) before any of it was built.

**The finding that made this small.** The app already owns a page turn — ADR-0200 §7 draws both neighbours as real day surfaces one page plus a gutter away, rides them on `--swipe-dx`, and lands them with a `--t-base` / `--ease-standard` settle. The edge-drag is **the one day change that does not use it**. So this is not "add an animation", it is "stop being the exception", and the whole CSS delta is one term in an existing `transform`.

**1 · The hint is the beginning of the turn, not a separate indicator.** While the drag rests in the band with a neighbour to reach, the **incoming pane** comes to meet the finger — `gap + reveal` of travel, `linear`, over exactly the dwell. That single motion says four things with no new vocabulary: something is happening, which direction, which day (its own content is what appears), and **how long is left** — the lean's progress _is_ the dwell's progress.

`linear` is load-bearing twice. It makes the remaining time readable (any curve would lie about it), and it makes the motion **samplable**: a sampled position is a sampled time, which is why the mockup's four frames are the real motion at 0 · 233 · 467 · 700ms rather than an illustration of it. `beats.css` sets the same precedent — _"`linear` because the keyframe offset IS the timing"_.

**2 · The day you are aiming at does not move.** Measured, both models at the same instant: the whole-strip lean displaces the row under the finger by **48px**, the pane-only lean by **0px**. A drag is a targeting gesture, and moving the target while someone aims at it is a cost with nothing on the other side. This is the section's one departure from §7's "the strip moves as one thing", and it is deliberate: during a swipe the finger _is_ dragging the strip, and here nothing is — the day is offering to turn.

**3 · The gutter has to be crossed before any of tomorrow is visible**, which killed the first design. `.day-peek`'s parked offset is `dx ± (page + gap)`, so at rest the incoming pane's near edge sits `--swipe-page-gap` (24px) _outside_ the window: a "12px lean" reveals 12px of page background and **0px** of the day it is promising. A legible reveal therefore costs `24 + N` px — affordable when only the pane pays it, unaffordable when the surface under the finger does.

**4 · The duration is the dwell, and cannot be a motion token.** 700ms is longer than every token except `--t-cinematic` (600ms), which `design-language.md` budgets to exactly one moment in the product. And a token would _lie_: the motion has to end when the day changes, or it promises the wrong time. So it reads `DRAG_DAY_DWELL_MS`, published as `--swipe-dwell` — the mirror of `--swipe-page-gap`, which the pager reads out of CSS so the two cannot disagree.

**5 · The trip's end stays silent, and the abort is asymmetric.** No neighbour, nothing moves — ADR-0182 §5's argument, and the swipe's. `BEAT.REBUFF` was considered and refused on two grounds: its axis is vertical (`translateY(-7px)`) where the absence here is horizontal, and a drag crosses the band many times in normal use, so a beat per crossing is noise. Leaving the band before the dwell unwinds the lean on `--t-quick` / `--ease-exit`, declared on the destination state — the turn is deliberate, giving up is a correction, and `design-language.md` says a mechanism that plays both the same says they are the same.

**What the render answered that reasoning could not.** The dragged clone is a full-width row under the finger, so it **always** covers the revealed strip horizontally — 24 of 24px. That looked fatal until the measurement was taken in the dimension that decides it: the reveal is the body's whole visible height, and the clone is one row, so **89%** of it is never covered at all (24 × 638px revealed, 68px of height crossed), and the crossed part still reads through `--drag-ghost-opacity` 0.78. A width could not see that, exactly as `frontend/CLAUDE.md`'s "a height cannot see a clip" predicts in reverse.

**Built 2026-08-22, as drawn.** Three things the build found that the drawing could not, all of them consequences of the same fact — **the peeks now mount DURING a drag, so a day screen exists three times over while one is in flight**, where §7 only ever mounted them during a swipe (when no drag is running):

- **A global side effect in a component-scoped teardown is now owned three times.** `useSelectionGuard`'s `release` removes `body.wp-dragging` and runs from an unmount cleanup, so a preview pane going away took the class the REAL drag was using — and the lean's own stylesheet keys off exactly that class. Measured, not reasoned: the probe read the class present at the arm and gone one move later. Both it and `useSpringLoadedDay` now stand down inside a preview, which is `state/day-preview.tsx`'s existing rule (_"suppress anything that reaches OUT of the pane"_) reaching two more hooks. Without the second guard, every mounted pane arms a dwell of its own against the shared `overDate` — three timers for one gesture.
- **`:not([data-preview])` on an ancestor does not exclude preview descendants**, which is a sharper version of §7's own warning and cost two green-looking specs. The panes live INSIDE the non-preview host, so `closest('.day-swipe:not([data-preview])')` finds it from a pane as readily as from the real surface: a `[data-shelf-drop="pool"]` query matched three strips, `.first()` resolved to the pane parked off the far edge, and the finger it placed there walked the day back to the trip's first day. Anything scoping to the surface you are ON needs `:not(.day-peek *)`, or a direct-child path from the host.
- **The peeks' mount condition is `live || leaning`, and `leaning` cannot be the pager's `live`** — the pager stands down for a drag by design, so its flag is false in exactly the case the lean needs a pane to animate. That is the one-line reason the shipped §2b step was silent.

**And one thing an e2e cannot read the obvious way:** an unregistered custom property computes to its **token stream**, so `--peek-lean` reads back as `calc(24px + 24px)` and `parseFloat` gives 0 — an assertion that then passes as `0 === 0`. The spec resolves it through a probe element's `width` instead, which makes the number one the browser computed rather than one the test parsed, and needs no timing.

**Still open, and it is a device question rather than a drawing one:** whether the 36px band wants any mark of its own. After §1 the question looks different — the arriving neighbour _is_ the mark — but only glass can say whether a first-time user finds the band at all.

**A shipped defect the drawing found, unrelated to motion.** `screens.css`'s `.day-peek` declares `--peek-dir: -1` / `1` for "which way the inline axis runs" — which is `tokens.css`'s `--dir`, a shipped token four other stylesheets already spend (`modal.css`, `form-steps.css`, `App.css` twice) and which `design-language.md` documents as exactly that. It was introduced by ADR-0200 §7 the day before by a session that did not look. The proposal's rule spends `--dir` and the two `--peek-dir` declarations go with it.

### 2d. The page is lifted, it stops, and staying finishes the turn (amended 2026-08-22, supersedes §2c's approach)

Owner, on §2c as shipped: _"No you got this all wrong. Your design is very ugly, no I don't like the static 'peek' into the next/prev day."_ And then the model to build: _"We should maybe get a peek but in a more fluent way, like it starts dragging to the next day and stops and then if your finger stays then it completes the motion."_

Drawn and measured in [`mockups/a-day-turns-under-a-held-card-v2.html`](../../mockups/a-day-turns-under-a-held-card-v2.html), which has a **play control** — §2c was approved off a filmstrip and rejected on a device, and a filmstrip cannot answer "is this fluent".

**Why §2c read as static, as a number the session had and did not interrogate.** Its lean travels 48px over the 700ms dwell: 1.1px per 16ms frame. A surface moving one pixel per frame is not slow motion, it is a static offset with a timer attached — so _"static peek"_ was a precise description rather than a matter of taste. §2c's own argument (the motion **is** the progress indicator) was sound and unaffordable at that speed. The session checked that the duration matched the dwell and never checked that the result was **perceptible**, which is why the v2 mockup prints **px per frame** for every phase and why that unit is the one to reach for the next time a duration is chosen by what it has to agree with.

**The mechanism, and it is a mechanism rather than a restyling.** Three phases with a **detent** in the middle:

1. **The lift** — the whole strip moves `DRAG_DAY_LIFT_PX` (48px) toward the named day over `--t-base` / `--ease-arrive`, and **stops**. 3.2px/frame, 2.9× §2c's lean.
2. **The hold** — it rests there for the remainder of the dwell (~460ms). Nothing moves.
3. **The completion** — the finger stayed, so the turn finishes on the swipe's own settle and the day changes. 350px over `--t-base` at 360px wide: 23px/frame.

The affordance is no longer "how much is left", it is **"the page is cocked"** — legible at a glance, where a 1px/frame creep was not. Total cost from reaching the edge to the day changing: 940ms, of which the dwell is still `DRAG_DAY_DWELL_MS`.

**1 · Phase ③ is not new code, and that is the whole build.** `useSwipePager` already owns the offset channel, both settle attributes, the timer and §8's wait-for-the-arriving-page. So the pager gained a **commanded** API — `hold(step, px)` and `turn(step)` — and the edge calls it. "A page turn can be **commanded**, not only dragged" is an extraction, not a second turn beside the first; the two ways of reaching tomorrow now share the mechanism as well as the date. `--peek-lean` and the extra `transform` term it added are deleted: the strip's own `--swipe-dx` is the channel, and the panes ride it for free (ADR-0200 §7).

**2 · The whole strip moves, which §2c refused.** §2c measured that model's cost — the row under the finger displaces by the lift — and rejected it on that number. **That rejection was over-weighted.** The displacement exists only while the finger is _in_ the band, and leaving the band unwinds it, so it is never present at the moment anyone is aiming at a chip: 48px during the hold, **0px** once the band is left. And moving the strip restores §7's "the strip moves as one thing", which §2c had to depart from.

**3 · The lift has to clear the gutter, and 48px is the smallest number that does.** `.day-peek` parks at `dx ± (page + gap)`, so the incoming pane's near edge sits 24px (`--swipe-page-gap`) outside the window: a 24px lift reveals 24px of page background and **nothing** of the day it is promising. 48px reveals 24px of tomorrow. The distance stays a `constants.ts` tunable with the mockup's control shipped as its recommendation — it is a feel call, and glass gets the final say.

**4 · Easings, and the abort.** `--ease-arrive` on the lift (its overshoot is weight on 48px and a wobble on 382px) and the pager's own `--ease-standard` on the completion. Leaving the band before the dwell unwinds on `--t-quick` / `--ease-exit`, declared on the destination state — §2c's asymmetry, kept for its reason: the turn is deliberate, giving up is a correction. The trip's end still lifts nothing at all, because a lift with no page behind it shows the gutter and a hole.

**Rejected, and each is a thing that could reasonably be proposed again:**

- **§2c itself** (only the pane moves). Right in argument, unaffordable at 1.1px/frame.
- **Spending the whole dwell on the lift** (§2c's timing with the whole strip). Same 1.1px/frame, with more things moving.
- **A slow creep during the hold**, to keep the "how long is left" reading. The owner said _"stops"_, and motion that continues without arriving is what was rejected.
- **Shortening the dwell** so the total is under 940ms. 700ms is shared with the day pill's route (§2), so changing it moves two mechanisms; the visible lift already answers "nothing is happening".

**Built 2026-08-22, and two things the build found.**

- **`useEffect(() => stop, [stop])` means "on unmount" only while `stop` never changes identity.** The moment it depended on the caller's command callback, that cleanup ran on **every render** and gave the lift back the instant it was taken — one `resolve` and five commands, ending on "let go". The app survived it by luck (the pager's `hold` happens to be stable) and a unit harness passing an inline arrow did not. The command is read through a latest-ref, which removes the luck.
- **An e2e that waits for a stepped day has to poll faster than the step.** §2d puts `--t-base` between a turn being _commanded_ and its day arriving, so the repeat cadence is 940ms and the next turn is committed 240ms before the previous day appears. `expect.poll`'s default ladder (0, 100, 250, 500, 1000ms) then reports an arrival up to a second late — measured: 2026-08-23 reported at 1850ms, 2026-08-24 landing at 1880 — and a test that acts on what it saw is acting on the day before last. A flat 50ms interval hands the caller the whole dwell to move out of the band in. This is a general hazard for any assertion about a **repeating** state, not a quirk of one spec.

**Repaired the same day, after five reports against one gesture.** Owner: _"it doesn't work as expected at all"_ — (1) after moving to a day the card is no longer under the finger, (2) it doesn't always move to the next or previous day, (3) it is hard to go back, (4) the ghost disappears sometimes, (5) a weird stutter that looks like it tries to complete the swipe but out of place. **Two defects and two missing rules**, and the pairing is the useful part: 1/3/4 are one bug, 2/5 are another.

**1 · A transform re-parents every `position: fixed` descendant, and the drag ghost was one.** The clone renders inside `.day-page` — the element §2d translates. So the instant the lift wrote `--swipe-dx`, the ghost stopped being positioned against the viewport and took on the page's own offset. Measured, with the finger never leaving `y=353`:

|                       | finger  | ghost   | `offsetParent` |
| --------------------- | ------- | ------- | -------------- |
| before the lift       | 195,353 | 125,303 | `null`         |
| lifted 48px           | 25,353  | 19,420  | `day-page`     |
| after the day changed | 25,353  | 19,459  | `day-page`     |

117px out, then 156px — which is _"no longer under the finger"_, and off the bottom of a short screen is _"the ghost disappears"_, and aiming with a clone that far from your finger is _"hard to go back"_. **This hook's own docblock warned about it** (`enabled: !dragging` exists because "the drag's ghost is `position: fixed` and this host would become its containing block the moment we set a transform on it") and §2d then drove that transform from a channel `enabled` does not gate. Moving the transform to the inner page is what makes the fixed PANES work; what nobody checked is what else lived inside that page. The ghost is one level out now, a direct child of `.day-swipe`, which is never transformed. The e2e asserts `offsetParent === null` rather than a rect, because that is the mechanism rather than a symptom of it.

**2 · One pixel of jitter cancelled the turn.** `hold` and `turn` share one channel, and the edge re-issues `hold(step)` on **every** move it sees — every pointer twitch, and every frame the auto-scroll scrolls. `hold` cleared the settle timer and re-parked the page at the detent, so: `dx 382px` / `settling=turn`, one 1px move, `dx 48px`, and the day never changed. Two rules now:

- **A commanded turn is uninterruptible by a lift.** The dwell fired; `--t-base` is not a window for a change of mind, and re-parking mid-flight is exactly the snap-back that read as a stutter.
- **`hold(null)` still cancels it**, which is the asymmetry worth stating: a re-lift is jitter, but "there is no day being aimed at any more" is the gesture withdrawing — the finger left the band, or let go over a target. Committing anyway would move the day out from under a drop that had already landed on the day before it.

And the channel is **idempotent**: a command that rewrites the value it already holds is a no-op, asked of the DOM rather than of a second copy of the state, so the arriving page's own `clear()` correctly reads as "not held" and the next cycle lifts again. A command channel whose caller is a stream needs that property whether or not it is currently load-bearing.

**3 · The band had an entry threshold and no exit threshold.** Nothing about cancelling was wrong in principle — leaving unwinds on `--t-quick`/`--ease-exit`, and the drag coming to nothing takes the whole walk back (§2b) — but a finger resting near the boundary chattered: lift, unwind, lift, at whatever rate the pointer reported. Entering still costs `DRAG_DAY_EDGE_PX`; leaving costs that **plus `DRAG_EDGE_SCROLL_RELEASE_PX`**, which is the same distance the latch already spends on this axis for the same question — how much movement counts as intent. Asked as two calls to `edgeDepth` rather than arithmetic of its own, so a short box still shrinks both bands. The **opposite** band is untouched: it starts where it always did, so reaching across stays as easy as it was.

**4 · Undoing a step is cheaper than making one** (owner's call, on _"hard to go back"_: half dwell when reversing). Reversing cost a fresh 940ms with nothing to say it was an undo. The opposite band, within `DRAG_DAY_REVERSE_MS` (2s) of a step, now pays `DRAG_DAY_REVERSE_DWELL_MS` — half, **derived** from the dwell rather than typed so the two cannot drift. The lift and the turn are unchanged; only the hold shortens, because `design-language.md` already says a correction is quicker than the thing it corrects. A window rather than "for the rest of the drag": five minutes into a long drag, a band brushed while aiming should not be a day change with half the warning. The dwell is therefore a property of the **target** and is computed by `useEdgeDayStep` — a pill always pays full.

**And the abort stays silent** (owner's call). The 140ms unwind is the whole statement; a drag crosses the band many times in normal use, so a beat per crossing is noise — the same argument §2c made when it refused `BEAT.REBUFF`, and it survives the change of what moves.

**Repaired again the same day, and this one was a design gap rather than a defect.** Owner: _"after landing on the new day there's like a second animation for switching days"_, and _"moving multiple days by holding on the edge is not looking good — perhaps related to the first issue"_. It was the same issue, once per day.

**Recorded rather than reasoned about, because "there's like a second animation" is a claim about how many there are.** A `transitionrun` listener over a hold that stepped two days, before the fix:

```
 946ms  transform on .day-page                 ← the lift
1677ms  transform on .day-page + both peeks    ← the turn
1904ms  URL ?day=2026-08-23                    ← the day lands
1995ms  transform on .day-page + both peeks    ← a THIRD run, 91ms later
2710ms  … turn        2920ms  URL 08-24        2993ms  … and again
```

The third run is the **re-lift**. §8's reset hands back the whole offset when a turn commits, so the surface went to level — and the finger was still in the band, so the edge immediately commanded its lift again: 48px over `--t-base`, starting ~90ms after the day changed. Per day that is a page turn followed by a smaller second animation, which is exactly what a day switch looks like; across a hold it is one of those every second, which is _"not looking good"_.

**So a turn that began at a detent lands back at the detent.** The travel becomes `page + gutter + detent`, and at the commit the offset is rebased to the detent rather than to zero — a jump of exactly one page, over the page that was swapped underneath it in the same paint, so the picture either side is identical. The finger is still where it was; the surface is still held; nothing is left for the next cycle to animate. Holding at the edge is now **one motion per day**, and the strip never returns to level until the drag lets go.

Three things this needed, each small and each load-bearing:

- **The landing is read off the element, not passed in.** `turn()` asks what offset it is currently holding, because the caller would only be repeating what its own last `hold` already said. That also means a **dragged** turn still lands level with no branch anywhere: no detent was held, so there is nothing to land at.
- **A one-frame transition suppression** (`data-swipe-rebase`). The offset changes and nothing moves, which is the one combination a transition gets wrong — it would slide the arriving day in from off screen over `--t-base`. Removed on the next frame, so the detent's own transition is back before anything asks it to move; the edge's re-commanded lift in between writes the value already there and its idempotence makes that a no-op.
- **A completed turn implies the finger stayed**, which is what makes landing-at-the-detent safe rather than a guess: a withdrawal cancels the turn (the rule above), so there is no path where the surface lands held while nothing is holding it.

**And two e2e cases that assert a COUNT rather than a magnitude.** "Nothing animates a second time after a landing" is `transitionrun` events on the day page: unchanged across the 400ms after the day arrives, where the old behaviour started one at 91ms. The multi-day case counts three runs for two days — the lift and a turn each — where the old behaviour ran five. A first version of that test sampled `--swipe-dx` a frame after each landing instead, which is a magnitude at a moment, and it duly failed under two workers for reasons the app had nothing to do with; the same round moved the abort case's `boundingBox` read out of the 240ms window it was racing.

**What this round is really about, as a lesson rather than a fix.** Both defects were in the same class: **a fact about the surrounding DOM that the change assumed instead of counting.** The ghost's containing block is one `grep` for what renders inside `.day-page`; the jitter is one reading of who calls `hold` and how often. Root `CLAUDE.md` has the rule already — _count the call sites before claiming what a derivation does_ — and this is its shape for a gesture: **count the callers of a command channel, and the fixed descendants of anything you transform.**

### Three things this required, each a bug if missed

**The drag must outlive its source.** Switching the day unmounts the very row being dragged. With `setPointerCapture` the browser releases capture when the captured element goes away, and with React handlers on the element they unmount with it — either way the gesture silently freezes mid-air. So `useHoldToDrag` listens on the **window** and uses no pointer capture, and its touch-scroll guard gains a document-level copy at arm time (the element's own is what keeps the gesture cancellable in the first place, but it dies with the element).

**A drop must read live state, not the state it was born in.** The window listeners hold the handlers from the render at touch-down — before any drag existed. Every value a release needs (the active date, the day's events, and the drag's own target) is therefore read from a ref updated each render. This also closes something latent since the drag shipped: a collaborator's change landing mid-gesture used to be dropped onto a stale list.

**The pills cannot detect the pointer themselves.** A touch pointer is _implicitly captured_ by the element the touch started on, so `pointerenter`/`pointerleave` never fire on anything the finger travels over — a pill-owned dwell simply never runs (it didn't, on the first attempt). Only `elementFromPoint` knows, so the builder does the hit-testing and publishes what it found; the strip renders it. That is why `state/drag-state.tsx` exists, shaped exactly like `map-scope-state`: two components in different parts of the tree needing one piece of ephemeral view state. It carries only what the strip has to _render_ — never what is being dragged, or what a drop means.

## Amendment (2026-07-25, session 120) — a touch keeps its target, and every create goes through the form

### 1. The reported bug: the drag died coming back off the day strip

Session 119's mid-drag day switch worked in one direction only. Reported: lift a row, dwell on another day (the day switches — fine), then move **down off the strip into the day view** and the drag cancels, the day snaps back, nothing happened.

Session 119 already knew the day switch unmounts the dragged row and moved the gesture's move/up listeners to the **window** for exactly that reason. What it got wrong was the _touch-scroll guard_. Instrumenting the reported sequence showed the actual mechanism, which is not what the previous amendment assumed:

```
lostpointercapture  target=document
pointermove         target=header      ← retargeted, reaches the window fine
pointercancel       target=header      ← the browser takes the gesture
```

— and **no `touchmove` reaching the window at all**. A touch's target is fixed at `touchstart`, and touch events keep being dispatched to that node even once it is detached, where it has no path to `document` or `window`. So the document-level copy of the guard that session 119 added could never run; nothing called `preventDefault`; the browser started panning and cancelled the pointer.

**The guard therefore lives on the element and outlives the element.** The ref's cleanup deliberately does _not_ remove it when the unmounting element is the one being dragged — the drag's own teardown does. The document-level copy is gone, because it was dead code with a plausible-sounding comment, which is worse than none.

This also means the earlier framing was half right: window listeners are correct for _pointer_ events (they retarget and keep arriving), and useless for _touch_ events (they don't). The two need opposite treatment, which is why one round of fixing only pointer events looked like it worked.

### 2. Every drop that CREATES an event now opens the form

Asked as a question, and the answer that holds is a line between **create** and **move**:

- **An idea dropped on a gap, or on an empty day** — a create. Nothing existed before, and its time, length and kind are all still open, so the drop opens the schedule form, prefilled with the gap's slot when the target had one and with the day's next opening when it didn't. A gap drop used to commit silently on a 60-minute default the user never saw, which is a smaller version of the "hardcoded 17:30 dump" §5 replaced tap-to-schedule to get rid of.
- **Everything that already exists moves silently**: a skipped event restored into a gap (one patch, one undo), a row moved to another day, a row parked on the shelf, an idea's target day re-aimed. Each has a title and a duration already; a form there is a speed bump.

`SHELF_DROP_ACTION.SCHEDULE` is retired — with creates routed through `CHOOSE_TIME` (which now carries an optional prefill) there is nothing left that schedules an idea straight from a drop.

**Not changed, deliberately:** tapping a gap chip and picking an idea from the gap-fill sheet still commits into that slot. There the gap is the _premise_ — you chose the slot, then the idea — whereas in a drag you chose the idea and the gap is where your finger landed, so the slot is the part worth confirming.

## Amendment (2026-07-25, session 122) — the mount-time guard outlives the gesture, not the other way round

The session-120 amendment above is right about _where_ the touch-scroll guard lives and wrong about _when_ it comes off. Reported immediately after it shipped: "after starting the drag operation and starting the move it cancels briefly after, and the auto-scroll isn't working."

Session 120's teardown removed the guard **from the element** at the end of every gesture — but that listener is the one attached at **mount**, before any touch exists, which is the whole reason an armed drag can suppress the native pan at all (the WHEN half of the same comment). The ref callback is stable, so nothing ever re-attaches it. So the first gesture on a card — a drag, a tap, even a scroll that never armed — stripped the card's permanent guard, and from then on that card's drags panned the page and got their pointer cancelled a moment after the finger moved. The auto-scroll "not working" was the same bug seen from the other end: the drag was dead before it could reach an edge band.

**The guard is only the gesture's to remove when the element is gone from the tree** (`!el.isConnected`) — the orphan case session 120 introduced the escape hatch for, where the ref cleanup deliberately skipped removal and the teardown is the only other chance. A still-mounted element keeps its mount-time listener.

The class of miss is worth naming, because it is now three sessions old: **every e2e in `shelf-drag.spec.ts` booted cold and touched its target once**, which is the one thing a real session never does. Two tests were added for the second gesture — a shelf card and a builder row — and they fail on session 120's code and pass on this one.

## Amendment (2026-07-25, session 123) — the day's edges accept a drop, and a row lands on another day as an event

Two reported gaps in the model, both of the same shape: a place the gesture obviously meant to reach and structurally could not.

### 1. Free time at the day's EDGES is a gap too

A gap chip has always meant "the empty stretch **between** two consecutive events", which quietly excludes the two stretches with an event on one side only — before the day's first event, and after its last. So "drag this in before the flight" had no target, and the only way to put something at the head of a day was the form.

The day now offers up to two more chips, from the same `lib/gaps.ts` and rendered by the same component as every other one, so all three kinds accept exactly the same drops (an idea → the form on that slot, a skipped card → restored into it, a row → moved into it):

- **`gapBeforeFirst`** — from `DAY_WINDOW.START_HOUR` to the first timed event's start.
- **`gapAfterLast`** — from the last event's end to 23:59, prefilled with `nextSlot`, which is the same slot the foot-of-the-day add button already offers. The chip and the button therefore cannot drift apart; the chip is the one you can drop **onto**.

**Each hugs the event it is named for.** "Before the 10:00 tour" prefills 09:00–10:00, not the start of the day's window — the window is a floor on how far out the chip reaches, never the thing it aims at. `gapBetween` already behaves this way (its slot butts against the event before it); the edges just have a different neighbour to butt against.

**Where there is no time, there is no chip** — the same `GAP_MIN_MINUTES` threshold every gap answers to, applied to four cases the edges introduce:

- a first event at or before the day's window start (07:30 leaves 30 minutes, so nothing);
- a day whose events are all **untimed** — nothing to hang an edge off, and the untimed rows carry no clock position, so the tail chip renders **below** them;
- a last event running **past midnight** (ADR-0037): the same-day tail is zero, so no chip, matching `nextSlot`'s existing clamp (ADR-0036);
- a read-only past trip, which has no gap chips at all (ADR-0040).

**An event before the day's window keeps its edge.** A 05:30 flight measures its leading gap from midnight instead — the small hours in front of it are exactly when "add the taxi before this" gets asked, and a window that swallowed them would be a wall rather than a floor.

### 2. A row takes every target a card takes

Session 119 let a row be carried to another day by **releasing on the day's pill**. That was the only cross-day path: once the drag had actually walked to that day, the only thing on screen that accepted a row was the shelf — and a row dropped there **parks**, which turns the event into an idea. The reported symptom is exactly that: carrying an event to tomorrow gave you a maybe on tomorrow's shelf, not an event on tomorrow.

`resolveRowDrop` now reads the two targets the card table already had, in the same precedence order (`lib/shelf-drop.ts` documents it once for both tables, because nothing in the DOM can put two of them under one pointer and the two must never answer the same pointer differently):

- **a gap chip → `MOVE_INTO`.** The chip carries its own day, so a drag that dwelled onto Thursday and let go on a chip there moves the event to Thursday, at that slot. On the day you are already standing on it is a plain reschedule.
- **the empty day → `MOVE_TO_DAY`.** No slot to offer, so the event keeps its own clock time, exactly as the pill does. It can only ever be another day: the day the row came off has at least that row on it.

Dropping a row on an **occupied row of another day** stays out, as it has been since §5 — displacing a scheduled event is a ripple decision (ADR-0041), and with free time and the pill both accepting the row there is now no gesture left that needs it.

### 3. An existing event dropped into free time keeps its length

The one write-shape decision the above forces. A gap chip's `end` is a **prefill for something being created** (`GAP_FILL_MINUTES`, capped at the gap) — reading it as an instruction would silently shorten a two-hour visit to an hour every time it was dragged. So a drop into free time gives an event the gap's **start** and the event's **own** duration; an untimed event, having no length to keep, takes the chip's block, which is the point of dropping it on one.

This is one helper (`slotFor`) shared with **`RESTORE_INTO`**, which used to take the chip's slot outright — so a skipped two-hour event came back as one hour. Fixed here rather than left divergent: two gestures that mean "put this existing thing in that free time" must not write different things. `RESTORE_INTO` also now writes the gap's `date`, which was latent since session 119 made it possible to carry a skipped card to another day: the event's slot moved and its `date` field did not.

### What the copy says

The two new chips read `פנוי לפני` / `פנוי אחרי` rather than `פער של` — a gap "of" two hours implies two sides. The empty day gains a third string: an idea dropped there is asked for a time (`שחררו כאן לבחירת שעה`, session 120's create/move line), an **event** dropped there just moves (`שחררו כאן להעברה ליום הזה`).

## Amendment (2026-07-25, session 124) — the hold matches the platform's own long-press

Reported directly: the press-and-hold felt a beat too quick to read as deliberate. `DRAG_HOLD_MS` was 280 ms, picked in session 113 to be "long enough that a flick never arms it" with no outside reference point; it never claimed to match anything the finger already knows.

Android's own long-press timeout (`ViewConfiguration.getLongPressTimeout()`) defaults to 500 ms, and it is what the platform's long-press haptic fires against — the length of hold a phone's own gestures have already taught the hand to expect. `DRAG_HOLD_MS` now matches it, so the shelf's hold arms right where the gesture already feels confirmed rather than at an arbitrary shorter point.

`DRAG_DAY_DWELL_MS` (the spring-loaded-folder dwell over a day pill, session 119) exists only to stay longer than the hold — a drag crosses several pills on its way anywhere, and every one it merely passes over must not open. It moves from 450 ms to 700 ms to keep that margin; the ratio between the two, not either absolute number, is what the invariant actually needs.

## Amendment (2026-07-25, session 125) — the auto-scroll waits to be reached

Reported off the phone: "when near the top or bottom of the screen, when you start dragging, it starts scrolling in the direction you're close to before you even started moving." Two independent causes, both in the **first frames** of a drag rather than in the pacing §5's amendment settled:

1. **The loop tracked `0,0` until the first move arrived.** `start()` began the rAF loop but seeded nothing, so `edgeScrollStep` read the pointer as pinned against the very top of the scroller — every drag, wherever it was lifted, opened by yanking the list upward at full speed until the finger moved. The lift point is now passed to `start()` and seeds the tracked position, which is what `onArm` always had to hand.
2. **A drag lifted inside a band was indistinguishable from one that had reached it.** The two are opposite intentions: reaching an edge asks for what is off-screen, but resting at one is just where the thing you picked up happened to be. And it is nearly always where it happened to be — the shelf sits at the bottom of the list, so a card is picked up **inside** the bottom band by construction.

So the band a drag is lifted in is **latched off, and stays off until the pointer leaves it** (`gateEdgeStep`); from then on it scrolls like any other. The opposite band is never latched — moving toward it is the deliberate reach the auto-scroll exists for. A latch is per-drag: `start` computes it, `stop` clears it.

**Rejected: gating on distance moved instead** ("don't scroll until the finger has travelled N px"). It answers the words of the report and not the behaviour: a card lifted at the bottom of the shelf is still in the bottom band after 20 px, so the list would run away a heartbeat later — and the drag from the shelf is aimed _up_, at the day, which the distance gate would have started fighting immediately.

The unit tests cover the gate as arithmetic and the loop's first frames with a hand-cranked rAF (`lib/edge-autoscroll.test.ts`); the e2e pins it where the report came from — a row parked at the top of the scroller, held still, with the list not moving under it, then leaving the band and coming back to prove the band still works (`e2e/shelf-drag.spec.ts`). One existing e2e case had to learn the same contract: it lifted a card from the shelf and held in the bottom band, which now requires stepping clear of the band once, exactly as a finger does.

### Follow-up (session 125) — the latch releases on intent, not only on exit

Reported once the above shipped: "near an edge, if you want to drag in the direction of the edge, it doesn't allow you even after starting the move." True, and it made the one edge you could not reach the one you started next to — a card lifted in the shelf had to be walked a full `DRAG_EDGE_SCROLL_ZONE_PX` up the screen and back down before the bottom band would answer. The gesture that most obviously means "further down" was the one the latch refused.

Leaving the band was too narrow a release, because it is a _position_ test on a problem about _intent_: resting where you were lifted and pushing on toward the edge are the same position. Movement since the lift is what tells them apart, so the latch now also releases when the pointer has travelled `DRAG_EDGE_SCROLL_RELEASE_PX` (16 px) **toward** its edge — above `DRAG_HOLD_SLOP_PX` so a thumb settling on the card never counts, well under the band's depth so the ask stays one small movement. That is why the latch remembers where the drag was lifted (`{ dir, from }`) and not merely which band.

## Amendment (2026-08-01, session 202) — the shelf crowds, and three of the fixes are on this ADR's own deferral list

Two owner reports against the shipped shelf, plus a third the code volunteered when they were read:

1. _"some people are going to have tens of maybe items, so at some point it's gonna become hard to find and slot the card that you want."_
2. _"the cards are really big compared to the events themselves."_
3. `GapFillSheet` is handed `maybeItems.filter((m) => !m.consumed)` (`PlanDay.tsx:920`) — the **whole** pool, unsorted, unsearchable — on the one surface whose entire question is _which idea fits this slot_. Nobody reported it because the sheet is opened less often than the shelf is looked at; it is the worse of the two.

**This is this ADR's own trigger firing.** Its Consequences deferred "a shelf-level filter row mirroring the Map's chips" with a condition attached — _"the shelf is a strip, not a list — earn it when the strip crowds"_ — and deferred "sorting the idea pool (by fit/proximity/recency)" beside it. Since then [ADR-0115](0115-plan-mode-place-research.md) put `＋ אולי` one tap from a Google result and [ADR-0135](0135-a-place-becomes-an-event-or-a-booking.md) put `＋ שיבוץ ליום` on the map's place card. Supply rose an order of magnitude; the container stayed §2's two strips.

Designed in [`mockups/shelf-crowded-v1.html`](../../mockups/shelf-crowded-v1.html), whose subject is **N rather than the card** — the idea count is its main toggle (5 · 18 · 40) and every number in its panel is read from the live DOM at the selected count.

### What the mockup measured, including where it corrected the proposal that opened it

- **The idea you are reaching for** (nearest to the day's stops) sits at position **3 · 18 · 18** shipped, and **1** proposed, on both the shelf and the gap sheet, at every count. This is the report restated as a number; every other row in the panel is a size.
- **Swipes to the last card: 2 · 10 · 24** shipped against **2 · 3 · 3** proposed. The point is not that 3 is small — it is that it stops growing.
- **The card is 132px against a collapsed event row's 86px** (1.53×), and **56px of that 132 is padding and slack** held open by `min-height` plus the action line's `margin-top: auto`. The tile is 76px (0.88×); the whole shelf goes 349px → 245px of a 640px screen.
- **The strip holds two cards at any usable width.** Three would need a 102px card, which carries no title. So shrinking the card buys **vertical only** — the horizontal half is fixable only by capping the strip, which is why §5 below is load-bearing rather than a nicety. The first draft of the tile was 148px wide and changed the visible-card count by zero.
- **A one-line title clamp was tried and rejected on sight**: at tile width `מוזיאון אדו־טוקיו` renders `מוזיאון…`. The height comes out of the action line, which carries nothing; never out of the title, which carries the card.

### The five changes

1. **A stable `orderBy`** on `maybeItem.findMany` (`trips.service.ts:456` has none), so §2's "the snapshot's order" is a real order rather than Postgres's whim. At five ideas nobody notices; at forty, the card you were about to hold for `DRAG_HOLD_MS` has moved since the last sync. Every ranking below needs this floor.
2. **The compact tile.** Same soft grammar (dashed + hatch, ADR-0011) — geometry only: a row axis so the glyph sits beside the text, and **the per-card `＋ שבץ ליום` goes**, under a section hint that already says `לחצו כדי לשבץ ליום`. It was the same sentence twice as chrome and then N more times as content. The reclaimed line carries a fact that **varies** (distance from the day's stops, or the day the idea is aimed at), which the action never was.
3. **The pool is ranked, not only grouped** — §1's deferred "future sort", now that `targetDate` exists to rank against. The rule and its registry are [ADR-0151](0151-a-suggestion-has-a-source-and-a-reason.md); this section only records that the shelf is its first consumer. §1's line is untouched: a score never writes `targetDate`, and a pencilled day stays the human intention.
4. **The gap sheet answers its own question**: ranked against the slot it was opened on, capped, searchable past a threshold, and finally rendering `.gapfill-m` — a meta slot styled in `screens.css` since the sheet shipped and never once emitted. It carries the ranking **reason**, not a score (ADR-0151 §8).
5. **The pool's tail leaves the shelf.** The strip keeps the day's working set — the day's group, plus the top of the ranked pool — and everything past the cap goes through to the Map's `אולי` facet, which [ADR-0119](0119-map-maybes-facet-is-the-shelf.md) made the same union and which already carries day scope, type chips, search, distance sort and (since ADR-0135) `＋ שיבוץ ליום`. This is what makes the strip's width independent of N.

**Rejected: a search sheet on the shelf itself.** It would be a third copy of the filter apparatus [ADR-0120](0120-filter-reveal-is-shared-infrastructure.md) exists to have prevented a second of — and worse, it answers "which idea" without showing **where** any of them are, which is the actual basis for the decision at that moment.

**Rejected: filter chips on the strip.** Left open by this ADR, but after (2)–(5) the shelf is no longer a list to narrow; it is five ranked cards. A chip on a strip of five is a control treating the symptom of a version that no longer exists.

**Untouched, deliberately: the drag.** Amendments 113 through 125 above live in that gesture, with unit and e2e cover, and nothing here changes what a drop **means** — only how many candidates you passed to start one.

### The one open question, and it is not a measurement

§5's handoff is a **tab switch mid-build**. ADR-0135 makes it a complete round trip — you slot from the map and never come back — but whether it reads as "the rest of my ideas are over there" or as being thrown off the surface you were working on is a phone judgement (ADR-0017's device pass), not something a desktop browser can settle. Two smaller ones sit beside it: whether the tile's two-line title truncates too much on the trip's real titles, and whether a capped strip reads as "the five best" or as "something is missing".

## Amendment (2026-08-05, session 203) — built, and what the build found

All five changes ship, plus [ADR-0151](0151-a-suggestion-has-a-source-and-a-reason.md)'s contract. Session note: [`planning/2026-08-05-session-203-the-shelf-crowds-built.md`](../planning/2026-08-05-session-203-the-shelf-crowds-built.md).

**The open question was put to the owner and answered "build it as drawn"**, on the reasoning that the alternative — capping the strip with no way through — trades a _suspected_ problem (an abrupt transition) for a _known_ one (35 ideas visibly hidden behind no affordance), and that the destination is complete rather than a dead end. **The device pass is still owed**, and it is the same one: whether the switch reads as the rest being over there. It is now a question about a shipped behaviour instead of a drawing, which is the only thing that changed.

Four things the build found that the mockup could not:

1. **The reason needs two renderings, not one.** `0.3 ק״מ ממסעדת מון` wraps at 140px and takes the tile from 76px to 84px — exactly the height §2 exists to buy back. So the strip says `0.3 ק״מ` and the sheet says the sentence, from one structured reason (ADR-0151 §8's amendment). The mockup had this right and the ADR prose did not: its shelf drew `km(k)` while only its gap row named the stop.
2. **A third reason exists that the fixture never had.** Every idea in the mockup carried a distance. A real shelf holds ideas with no place, and a Place-lite carries no coordinates — for those the only true thing to say is recency, so that is what it says, and it takes no line on the tile.
3. **The remove `✕` overlaps the tile's title**, which the mockup never drew because it drew the strip's cards as plain `div`s. On the shipped card the glyph sits above the title and the corner is free; once the axis is a row the title runs under it. The text yields the corner back.
4. **The strategy's ordering is the mockup's, not this ADR's prose.** §3 of ADR-0151 reads as a priority list with distance first; the mockup's own `ranked()` partitions on spoken-for and sorts by distance _within_ it. The mockup is right, because the other reading silently reverses §2's dateless-before-aimed-elsewhere grouping — the one thing this build was not supposed to touch.

**Also recorded: a distance past ~5km stops discriminating.** Two ideas across town are both simply "not near today", so they tie there and recency breaks it — which keeps an idea that merely _has_ coordinates from outranking a placeless one on that alone.

## Amendment (2026-08-11, session 253) — the idea you just added is pinned to the strip

Field report #40 ("a Place added to the Maybe shelf from the Map did not appear in the
Maybe shelf in Day-by-day") reopened field report #32 with a local witness. Two causes,
and only the second is this ADR's. The first was a sync defect with no bearing on the
shelf's design, fixed in the same change and recorded in
[the session note](../planning/2026-08-11-session-253-a-map-add-lands-on-the-shelf.md);
this section is the shelf half.

**It answers the open question §5 left.** That question was written as _"whether a capped
strip reads as 'the five best' or as 'something is missing'"_ — a device-pass judgement.
The report is the answer, and it is sharper than either reading: **the strip reads as
"the five best" exactly when you needed it to read as "and here is the one you just
made".** Measured on a real stack with the sync path healthy: fourteen undated ideas, a
Map add roughly 7km from the day's stops, and the only thing that moved on screen was
the tail count, `עוד 8` → `עוד 9`. Nothing about that is wrong by §5 — the added idea
genuinely is not one of the five most useful ideas for the day being viewed — and it is
still indistinguishable, to the person who made it, from the add having failed.

**The rule.** The idea **this device added last** leads the pool strip, whatever it
scored. `SHELF_POOL_CAP` is unchanged at 5: the pinned tile takes a slot and the
fifth-ranked idea moves into the `+ N · במפה` tail behind it.

The rule is stated at the level the mismatch is at. ADR-0151's ranking answers _which of
these is useful on the day I am looking at_, and it is right about the just-added idea —
recency is only its tiebreak, and correctly so. But an idea created a second ago is not
asking that question. It is asking whether it landed. So recency stops being a tiebreak
in this one case and becomes a **floor**.

**The cap is not raised to buy the slot,** and that is the whole discipline of §5: a
constant strip width is the promise, so one pinned tile costs one ranked tile **once**,
not one per idea the trip accumulates. Nudging `SHELF_POOL_CAP` to 6 would have hidden
this witness and left the next one — an idea added onto a trip with six better-ranked
ones — to report it again.

**Nothing expires the pin, deliberately.** It ends when the idea leaves the pool
(scheduled, removed, or aimed at the day you are on) or when the next add replaces it,
which is every way "I have seen that it landed" actually ends. A timer would be a second
clock on a surface that has none, and a pin whose idea is gone simply matches nothing —
so no caller has to clear one, and the derivation stays pure.

**Where it lives.** `lib/shelf.ts`'s `poolStrip` — ranked whole, pinned, capped, tail
counted — which is one derivation for both shelves. The twelve lines it replaces were
duplicated verbatim in `DayView` and `PlanDay`, so a rule added at either call site would
have been the two shelves drifting again, which is what `shelfGroups` exists to prevent.
The pin's input is `justAddedIdea`, canonical reducer state written by `ADD_MAYBE` — the
add happens on the Map and the pin has to be true on the day you land on, which no
screen's own `useState` can promise.

**Not decided here:** whether the pinned tile should say so. It currently renders as an
ordinary tile with its own ranking reason (`recently-added` takes no line, ADR-0151), so
it leads the strip with nothing marking it as pinned. Whether that wants a mark is a
drawing question, and it is on the backlog rather than guessed at here.
