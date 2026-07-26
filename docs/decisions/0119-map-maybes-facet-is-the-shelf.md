# 0119 — The Map's `אולי` facet is the shelf: a pencilled day is a day, a skipped soft event is still on the shelf, and a chip counts what the list shows

**Status:** Accepted (build)
**Date:** 2026-07-26
**Refines:** [0109](0109-map-tab-design.md) §2 (the chip facets — _maybes_ was defined as "places referenced by an unconsumed `MaybeItem`"; this widens it and makes the counts honest), [0110](0110-maps-and-places-frontend-architecture.md) §2 (the one place-usage derivation gains a day source and a flag), [0116](0116-day-aware-shelf-and-idea-target-day.md) §1 (its "the Map's day filter gains ideas with a `targetDate`" consequence, never built), [0027](0027-soft-item-lifecycle-shelf-slip.md) §2 (the shelf is unplaced ideas **and** skipped soft events, uniformly — the union the Map wasn't reading), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber is time & commitment, so a pencil mark doesn't get it), [0117](0117-map-place-outcome-states.md) (the outcome tags a skipped row already carries)

> **Phase 6 creates the honest inverse of this ADR's rule, deliberately** ([ADR-0121](0121-embedded-map-phase-6-design.md) §6). This ADR forbids a chip **promising rows the list will not render**. The embedded map's "ghost" tier does the opposite: it renders pins that **no chip counts**, because the chips count the _scoped_ set and a ghost is by definition out of scope (a place pencilled for another day, or with no day, that happens to sit inside the viewport). That asymmetry is why a ghost is drawn hollow, glyph-less, unnumbered and smaller — prominence is what keeps it from reading as part of the answer the chips describe — and ghosts are never counted in a facet nor entered into near-me's sort. A count that **overstates** is the bug this ADR fixed; a subordinate pin no count claims is the opposite failure mode, and it is paid for in prominence rather than in counting.

## Context

Three bugs reported off the running app, all on the Map tab's `אולי` chip. Each has a distinct cause, and two of them are documented decisions that were never built:

1. **"Maybe today" doesn't appear in the list of maybes.** `buildPlaceUsageIndex` passes `days: []` for **every** `MaybeItem`, so an idea has no day facet at all — including one pencilled in for a day. Trip mode opens **day-scoped** (ADR-0109 §1), and the day scope keeps only usages with `days.some(d => d.date === activeDate)`, so an idea aimed at today was filtered out before the `אולי` toggle ever saw it. ADR-0116's consequences already promised the opposite ("a place referenced by an idea with a `targetDate` now has a day facet"); the field shipped, the facet didn't.

2. **Some ideas never appear as maybes, though they do appear under their category.** The facet reads `isMaybe`, which is only ever set by an **unconsumed** `MaybeItem`. A **skipped soft event** is the shelf's other half (ADR-0027 §2, rendered in both modes since ADR-0116 §3) — and it is the common way an idea ends up back there: schedule it (the idea becomes `consumed`, an event is created), then skip it. The event still carries its category, so the place kept showing under its type chip and vanished from the one filter that should still find it. Hence the report's own guess, "perhaps they were events once?" — they were, and they still are.

3. **The maybes count doesn't change when a category is picked.** `maybesInScope` counted `dayScoped.filter(isMaybe)`, ignoring the active category, and `categoryCounts` counted `dayScoped` ignoring `maybesOnly`. So neither facet's count reflected the other, and the "an emptied chip falls back to `הכל`" guard (ADR-0101's rule, mirrored here) was reading counts that could disagree with the list — with `אולי` on and a type picked, a chip could claim rows and the list show none.

## Decision

### 1. An idea's pencilled-in day is a day facet — clock-free

A `MaybeItem` with a `targetDate` contributes one `DayUsage` for that date; a dateless "someday" idea still contributes none and stays an all-days-only row.

The day carries **no clock**: no `at`, no `until`, no `sortOrder`, no `eventId`. That is what keeps ADR-0116 §1's line intact — a target day says _which day we were thinking of_, never that something happens at a time. The consequences follow from the existing comparator with nothing added: the row ranks as untimed (below the day's clocked stops, exactly where the day view puts an untimed row), and a whole passed day still takes it along.

**Two references on one date needed a tiebreak.** The merge picked the day's moment as "the earliest `at`, or whichever is defined" — which meant a clockless reference could take over the pointer when the other one was an **untimed event**, and the row would lose its "what happens here" wording to a pencil mark. The rule is now stated once (`primaryRef`): the earliest reference that _has_ a clock wins, and between two clockless ones a real event outranks a pencil mark.

**On the row the day is named, not claimed.** A day that comes only from an idea renders in a **neutral** tag, not the amber time tag: amber is time & commitment (ADR-0028) and a pencil mark is neither. The row already reads as an idea — dashed/soft grammar plus `על המדף` — so the tag only has to say _which day_.

### 2. The `אולי` facet means "on the shelf", which is ADR-0027's union

`PlaceUsage` gains `isParked` (referenced by a **skipped soft event**), and the facet reads `isOnShelf = isMaybe || isParked`.

- **Soft only.** A skipped **hard** event is not on the shelf and not restorable from it — the shelf's own grouping (`lib/shelf.ts`) already filters `SOFT` + `SKIPPED`, and this reads the same rule rather than inventing a second one.
- **`isMaybe` keeps its meaning** (an unconsumed idea references this place). It is what Plan-mode research asks when it decides between `על המדף` and `כבר בטיול` — there the question really is "would `＋ אולי` duplicate an idea", not "is this place shelved". One flag per question, and the facet composes them.
- **This is not the deferred outcome filter** (ADR-0117's "what's left to do / where we've been"). That facet ranks by what happened; this one answers "what is still unplaced", which is what the chip has always claimed. A skipped row keeps saying `דילגנו` and keeps its quiet treatment (ADR-0117 §4) — the filter finds it, the row still states what it is.

### 3. Each facet counts what the other one leaves visible

With `אולי` on, the type chips count only shelf places (and the `הכל` chip with them); the `אולי` count is always for the picked type — "how many maybe restaurants", not "how many maybes". One rule, both directions, which is also what makes the empty-chip fallback honest: a chip can no longer promise rows the list won't render.

The chip row narrowing with the toggle is deliberate and load-bearing: turning on `אולי` now leaves exactly the types that have shelf places, so the "picked a type, got an empty list" dead end can't be reached by tapping.

### 4. Where it lives

All of §1 and §2 are in `lib/place-usage.ts` — the one derivation ADR-0110 §2 established, which already feeds the chips, the pin, the order and the outcome. `isOnShelf`/`matchesPlaceCategory` are exported beside `matchesPlaceFilter` so a count can narrow by one facet without restating the other (§3), and so the screen holds no second copy of what "on the shelf" means.

## Consequences

- **The day scope stops hiding the ideas it was given a day for.** "What were we thinking of for today" is now answerable on the tab Trip mode opens on, which is where the question gets asked.
- **The shelf and the Map agree about what is on the shelf**, for the first time since ADR-0027 wrote the union: one flag per half, one predicate over both.
- **The chips stop over-claiming.** A count is a promise about the list, and both counts now keep it.
- **No schema change and no new stored state** — a field that already exists (`targetDate`), a status that already exists (`EVENT_STATUS.SKIPPED`), and one derived flag on the existing index.
- **Phase 6 inherits both**: a pencilled idea has a day, so it pins on that day's map, and the shelf facet is one predicate away from a rendered-pin filter.
- **The `אולי` chip now appears in a trip with no ideas at all** but a skipped soft event, since that is genuinely something on the shelf.

## Alternatives considered

- **Widen `isMaybe` itself to cover a skipped soft event.** Rejected: research's `על המדף` badge asks the narrow question (would `＋ אולי` duplicate an idea?) and would have started answering a different one. Two flags, one composed predicate, no call site guessing which meaning it got.
- **Leave a target day out of the day scope and label the chip instead** ("ideas are all-days only"). Rejected: it explains the hole rather than filling it, and ADR-0116 §1 stored the field precisely so the day could be asked about.
- **Give a pencilled day the day's `nextSlot` (or midnight) so it sorts with the clocked rows.** Rejected: it would invent a time nobody chose and drag an idea onto the timeline — the exact boundary ADR-0116 §1 draws between parked and placed. Untimed is not a gap in the data; it is the truth about a pencil mark.
- **Render the pencilled day in the amber time tag like every other day.** Rejected (§1): amber is the app's claim that something is committed at a time (ADR-0028), and spending it on a guess is how a pencil mark starts reading as a plan.
- **Count each facet independently and let a chip disagree with the list** (the shipped behaviour). Rejected: a count exists to predict the list; ADR-0100 §2 put it on the chip for that reason.
- **A third "skipped" facet instead of folding skipped events into `אולי`.** Rejected here as ADR-0117 already deferred it with a reason (the chip row is crowded and an outcome facet is its own design question) — and it would not fix this bug, which is that the shelf's own contents were unreachable from the shelf's own filter.
