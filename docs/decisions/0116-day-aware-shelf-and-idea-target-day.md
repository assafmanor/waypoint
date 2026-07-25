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
