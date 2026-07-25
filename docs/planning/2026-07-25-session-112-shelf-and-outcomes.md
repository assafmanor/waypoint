# Session 112 — The day-aware shelf, and what happened at a place

**Date:** 2026-07-25
**Branch:** `claude/shelf-day-aware-and-visited`
**ADRs:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (the shelf) · [0117](../decisions/0117-map-place-outcome-states.md) (the Map)
**Mockup:** [`mockups/shelf-day-aware-v1.html`](../../mockups/shelf-day-aware-v1.html) — two frames, one design pass

## Where this came from

Straight after Phase 5 shipped (session 111), the owner raised three things about the maybe shelf and the Map, and picked the direction on each after an investigation established what actually exists:

1. How should the shelf behave with filtering — all ideas? the day's? and how do you slot one onto a day?
2. Skipped events should be categorised as maybes.
3. There should be a way to tell places we've **been to** from ones we haven't.

The investigation is what made the questions answerable, and three of its findings changed what got built:

- **The shelf has no scoping whatsoever.** Both hosts inline `maybeItems.filter((m) => !m.consumed)` — no day, no category, no order (the snapshot query has no `orderBy`), no cap. And **`MaybeItem` carries no day or order field at all**, so "what were we thinking of for Thursday" was not a question the data could answer.
- **Skip never created a maybe.** `skip` sets `status = skipped`; Trip mode's `DayView` then _renders_ that day's skipped soft events as shelf cards. Plan mode renders nothing of the kind — so ADR-0027 §2's "the shelf renders unplaced ideas **and** skipped soft events, uniformly" had been half-built since 2026-07-12. The one path that really converts an event to an idea is `park`: Plan-only, soft-only, and it **silently dropped the event's category**.
- **The Map never read `event.status`.** Neither `place-usage.ts` nor `Map.tsx` contained the string `EVENT_STATUS`, so the ahead/behind partition was purely clock-derived: a place you **skipped** sank under `כבר היינו` ("we were already here"), and a place you marked done early stayed "ahead of you".

## What the owner chose

| Question   | Chosen                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| Idea + day | an **optional target day** on the idea (over staying dateless, or a derived fit) |
| Slotting   | a **day picker in the sheet** _and_ **drag onto the day**                        |
| Skip       | **keep two verbs, surface both** (over merging skip into park)                   |
| Been-there | **three honest states** (over two, or a stored `visited` flag)                   |

## What shipped

**The shelf (ADR-0116).**

- `MaybeItem.targetDate` — nullable, additive migration (`20260725150000_maybe_item_target_date_adr0116`), mirrored in `@waypoint/shared` (`maybeItemSchema` + `createMaybeItemSchema`), passed through `MaybeItemsService.create` + `toMaybeItemDto`. It flows offline for free: the outbox mirror already spreads `op.input`.
- **Pencilled in, not scheduled** — no time, no slot, nothing on the timeline, out of `remaining`. It only groups the shelf.
- `lib/shelf.ts` — one pure `shelfGroups(maybeItems, events, date)` both hosts call, returning `forDay` / `pool` / `skipped`. Plan mode now renders the skipped union; the pool puts dateless ideas first and labels out-of-day ones with `relativeDayLabel` (ADR-0085).
- **park** carries `category` + the event's date as `targetDate`, and is exposed in Trip mode through `EventCard`'s ⋯ menu (soft, not done, gated on `readOnly` — it deletes an event, so it lives where delete already does, ADR-0029). `t.planDay.toShelf` moved to `t.actions.toShelf`: one label, two surfaces.
- **`ScheduleSheet` now uses `WhenField variant="day"`** (ADR-0083) with `minDate`/`maxDate`, so an idea can be put on another day without navigating there — and the last bespoke time-only control in the app is gone.
- **Drag a shelf card onto a gap chip** (Plan mode): the same pointer-capture + `elementFromPoint` hit-test the reorder grip already uses, with the target's slot travelling on `data-gap-date/start/end` so the drop needs no lookup table and no id for a gap that only exists for that render. `MaybeCard` gained `dragProps`/`dragging`; the gap highlights while an idea is over it.

**The Map (ADR-0117).**

- `DayUsage` gains `outcome` (`done` beats `skipped` across a day's references) and `settled` (all references settled). Both are **stored facts**, so `place-usage.ts` stays clock-free and ADR-0027 §1's human-writes-only rule is untouched.
- `isDayUsagePast` treats a settled day as behind you **whatever the clock says**.
- Rows carry `היינו`/`דילגנו` in the day view's own words, in `--ok`/`--miss` (ADR-0028 reserves those for statuses); a skipped-only row goes quiet, reusing the ambient treatment.
- The block header is now the neutral `מה שמאחורינו`, with `מה שלפנינו` rendered **only when** a behind block exists.

## Testing

939 tests across 88 files, green (`format` / `lint` / `typecheck` / `build` too). New: `lib/shelf.test.ts` (grouping, the consumed-is-off-the-shelf rule, day/kind-scoped skipped events), `place-usage.test.ts` outcome + `isDayUsagePast` cases, `Map.test.tsx` outcome rows **in both day scopes with a pinned clock**, and a `verbs.test.ts` case pinning park's category + date (the data it used to drop).

## Not done, deliberately

- **Sorting the idea pool** (derived fit / proximity / recency) — a good sort, not a field; recorded in ADR-0116.
- **Dropping an idea onto an occupied row** — displacing a scheduled event is a ripple decision (ADR-0041), not a drop target.
- **An outcome filter facet** on the Map ("what's left", "where we've been") — the outcome is on every row now, which is the cheaper half; a third chip facet is its own design question.
- **A shelf-level filter row**, and a "someday beyond this trip" split for ideas that outlive the trip.
- **No live device pass on the drag.** The mechanism is the shipped reorder drag's, but touch-dragging a card onto a chip deserves one real phone check (ADR-0017) — worth doing on staging before leaning on it.
