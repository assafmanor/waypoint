# 0124 — The Map's filters: one scope, three facets, and `מה נשאר` means somewhere you can still go

**Status:** Accepted — built 2026-07-27 (session 144)
**Date:** 2026-07-27
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§9** (`מה נשאר` is no longer "hide everything settled"; the chip's gate moves with it) and [0109](0109-map-tab-design.md) **§1**'s session-110 amendment (in all-days scope a place is read by the day it is _live_ on, not by `days[0]`). Relates [0117](0117-map-place-outcome-states.md) (the outcome states, which stay exactly as they are), [0119](0119-map-maybes-facet-is-the-shelf.md) (the `אולי` facet and its count-coupling rule, both unchanged), [0027](0027-soft-item-lifecycle-shelf-slip.md) §1 (status is only ever human-written — the fact this ADR turns on), [0106](0106-maps-and-places-epic-scope-and-phasing.md) §4 (pan/zoom is the area filter), [0043](0043-day-close-out-and-settle-strip.md) (whose job the unsettled past actually is).

## Context

Reported from the running tab, twice in one session and in the owner's words: **"I'm not sure what stays at `מה נשאר` and what not. I'm not sure how compound filtering works."** Then, more sharply: **"I see past events in `מה נשאר` and I really don't understand what's the usage here."**

Both reports are about one surface, and neither is a misreading. The tab has four controls of three different kinds, their combined behaviour was never written down in one place, and one of them was defined against a fact that does not hold on a real trip.

**The answer was spread across four ADRs.** The scope is ADR-0110 §4, the type chips and `אולי` are ADR-0109 §2 as widened by ADR-0119, `מה נשאר` is ADR-0117's deferred item as scoped by ADR-0121 §9, and the count-coupling rule that makes them compose is ADR-0119 §3. Every one of those is right about its own piece; none of them says what the tab does. A user cannot reconstruct that, and neither could the next session.

**And `מה נשאר` was defined against something that rarely happens.** ADR-0121 §9 made it "hide everything `settled`, `done` and `skipped` alike". But settling is a **manual tap** — ADR-0027 §1 and ADR-0018 both refuse to auto-write status, deliberately and correctly. So on a real trip most stops are never settled at all, the filter hid almost nothing, and "what's left" answered with three days of places nobody could go to any more. The one payoff a rendered map gives that a list cannot — §9's own "with the settled pins gone the remaining cluster is legible" — never arrived, because the pins never went.

**A third defect fell out of writing the model down.** In all-days scope every place was read off `days[0]`, so a single past day classified it however alive the trip still was with it. The hotel you sleep in tonight sat under `מה שמאחורינו` from its second night on with a desaturated pin; a café visited Tuesday and booked again Thursday read as done. Meanwhile `מה נשאר` — which asks about **all** a place's days — correctly kept both. Two answers to one question, on one screen. Note where the fade came from: [session 137](../planning/2026-07-27-session-137-ambient-stay-prominence.md) removed it from the ambient tier precisely because "on this canvas desaturation already means behind you", but all-days never reached the ambient tier, so `PIN_TIER.behind` re-applied it through the `skipped` class — harder than the paint that was removed.

## Decision

### 1. Four controls, three kinds, and the kinds are the explanation

| Control                    | Kind        | What it does                                                             |
| -------------------------- | ----------- | ------------------------------------------------------------------------ |
| `כל הימים` + the day strip | **scope**   | which days the tab is about                                              |
| type chips                 | **facet**   | single-select over the place's category **union**                        |
| `אולי`                     | **facet**   | on the shelf: an unconsumed idea **∪** a skipped soft event (ADR-0119)   |
| `מה נשאר`                  | **facet**   | somewhere you can still go (§2)                                          |
| `קרוב עכשיו`               | **sort**    | ordering only, never a filter (ADR-0109 session-138)                     |
| pan / zoom                 | **spatial** | ADR-0106 §4 — no chip is ever built; the `באזור` count says so on screen |

The kinds are not decoration. **A scope is not a facet**, which is why the day strip does not appear in the facet strip, why it has its own chip, and why an empty list caused by the scope must not blame the filter (§5). **A sort is not a filter**, which is why near-me changes no row's visibility and lives in the sheet rather than the facet strip.

**Facets compose by intersection, and every count is coupled** (ADR-0119 §3, unchanged): each chip's number is what the _other_ facets leave visible, so `אולי + מה נשאר` shows a count you can trust before you tap it.

**Search is the one thing that ignores all of it** — scope and every facet — exactly as the Index's search does.

### 2. `מה נשאר` = somewhere you can still go

**It hides exactly what the list files under `מה שמאחורינו`.** One sentence, and it is the whole rule.

Two things close a place, not one: **a human closing it, or the clock.** `isDayUsagePast` is already both, and in the right order — it checks `settled` _before_ it reads the clock, so a stop marked `היינו` for tonight goes now rather than at 20:00, and a skipped one goes with it. The predicate therefore reads the block rather than restating it (`isPlaceLeft` → `placeBlock(…) !== behind`), which is what makes a filter and a block header structurally unable to disagree about the same place.

What that keeps, deliberately:

- **No day at all → always left.** A "someday" idea and an unscheduled booking are precisely what remains. They are in the `ללא יום` block, which is not the behind block — the same rule, not an exception to it.
- **All its days, not any.** A café visited Tuesday and booked again Thursday is still ahead of you. Day-scoped it is that one day's answer, which is the question you ask standing in it.
- **A place with nothing in scope falls back to all its days.** This is what applies the toggle to the canvas's **ghost** tier: Tuesday's café must not sit there while you ask what is left, and a ghost by definition has no day in the scope being asked about. In the list the branch is unreachable — an out-of-scope row is already hidden by the day predicate.

**The chip's gate moves with the predicate**: it appears once anything is **behind you**, not once anything is settled. The old gate was the old rule's own blind spot — on a trip where nobody taps `היינו` the chip never appeared, though there was a morning behind you it would have cleared. The derived-affordance rule (ADR-0050) is unchanged; only the question is.

**ADR-0117 is untouched.** The three outcome states, their tags, and the quiet treatment of a skipped row all stay. What changes is that a map _filter_ is no longer the surface for the unsettled past: a passed-but-unsettled stop is still on the tab with the toggle off, still tagged, still under `מה שמאחורינו`. Resolving it is the **settle strip's** job (ADR-0043), which is the surface built for it.

### 3. The compound cases, stated once

With every facet **off**, the list is the day scope. Turning facets on intersects. The two that are worth writing down because they read as surprising:

- **`אולי + מה נשאר` = ideas still open.** A parked (skipped-soft) event is on the shelf _and_ closed, so it cannot survive both. That is correct rather than a bug: `אולי` asks "is this unplaced?", `מה נשאר` asks "can I still go?", and a skipped stop answers no to the second. Restoring it is the shelf's affordance, not this filter's. The coupled count states the narrowing before you tap.
- **A type chip + anything.** The type chips narrow to the types the _other_ facets leave, so a picked type that empties falls back to `הכל`. This is why the "picked a type, got an empty list" dead end is unreachable by tapping — and therefore why the two **toggles** (which are tappable at zero) and the **day scope** are the paths that can empty the list (§5).

### 4. All-days reads a place by the day it is live on

`placeDay` takes a context rather than a bare date. Day-scoped is unchanged: that day, or nothing (a ghost). **All-days it resolves the day the place is live on — the earliest that is not behind you, and its LATEST once they all are**, because the behind block reads newest-first and the day that sinks a place is its last one, not its first. `behind` therefore means _every_ one of its days is, which is the same "all its days" rule §2 asks.

**Without a clock it is still `days[0]`, and that is load-bearing:** `buildPinOrderIndex` passes no `nowMs`, so ADR-0121 §6's invariant survives intact — a tick cannot renumber a pin.

One consequence worth naming: all-days, a stay **in progress** now resolves to its ambient night, which by ADR-0109's 2026-07-27 amendment says nothing about itself. So the row names the span's **next edge** — the check-out it is heading for. Its two wrong answers were naming the check-in it had already passed (which read as a finished stay) and, once the live day resolved correctly, saying nothing at all.

### 5. An empty list says which of its three causes it is

`אין מקומות שמתאימים לסינון` was the only answer, and the most common cause is not a filter. **The facets persist across a day change** — rightly; it is the same question asked of each day — so moving the strip with one on lands you in an empty list that blames a control you never touched.

Three causes, three answers, each handing back the step out of it (ADR-0078's "the app never dead-ends"):

- **No places in the trip at all** — unchanged.
- **No places on this DAY**, no facet narrowing anything → says so, and offers all-days.
- **The facets are too narrow** → says so, **names the facets it is holding** (the strip may well be closed over them), and offers to clear them. It clears the facets only: the scope is not a facet (§1).

**A derived facet chip can also disappear while its filter is on** — another member consumes the last idea, or un-settles the last event, and the snapshot arrives over the socket. The chip unmounts, the toggle stays on, and the strip then holds no control that can turn it off. Both toggles now clear themselves when their affordance goes, which is the guard the type chip already had.

## Consequences

- **The tab is explainable in one sentence per control**, which is what the report actually asked for.
- **`מה נשאר` does something on every trip**, not only on a trip where someone diligently taps `היינו` — and the canvas payoff ADR-0121 §9 promised is real for the first time.
- **A filter and a block header cannot disagree**, because they are one derivation. Getting `placeDay` wrong showed up as exactly that disagreement, which is how it was found.
- **The ambient stay stops being called finished** in the one scope session 137 did not reach.
- **A ghost's way in works** — `forceDay` now drops the scope for a row's references too, not just its day and outcome, so the one row whose tap is the only way to learn what it is stops answering "nothing".
- **No schema change, no new stored state, no new control.** Every change is to a predicate or to copy.
- **The unsettled past loses a surface it was never good at.** If "clean up the loose ends" needs a home on the Map rather than in the settle strip, that is a new decision, taken deliberately — not the accidental behaviour of a filter named "what's left".

## Alternatives considered

- **Keep "hide everything settled" and explain it better.** Rejected: the copy was not the problem. A filter whose usefulness depends on a manual tap most stops never get is broken on the trip it was built for, and no wording fixes that.
- **`מה נשאר` = not settled **and** not past** (i.e. add the clock as a second condition beside the first). Rejected as the same thing said twice: `isDayUsagePast` already checks `settled` first, so "not behind you" _is_ both conditions, and stating them separately would invite the two copies to drift.
- **Make an on-shelf place always count as "left"**, so `אולי + מה נשאר` keeps parked events. Rejected: it would make `מה נשאר` alone show every skipped soft event, which is exactly the clutter the toggle exists to remove. The shelf is the surface for restoring; this one is for going.
- **Three chips for the three outcome states** (ADR-0117's original deferred shape). Rejected again, for ADR-0121 §9's reason and now one more: the question on the ground is binary, and the list already answers "where have we been" by block and by tag.
- **Rank an all-days place by its latest day instead of its earliest.** Rejected: it fixes the hotel and breaks the café — a place with a future booking would be read by that future even while you stand in it today. "Earliest that is not behind you" is the only rule that is right in both directions.
- **Make `placeDay` clock-aware everywhere, including the pin numbers.** Rejected: it would let a tick renumber a pin, which ADR-0121 §6 forbids for good reason. The clock is passed where the caller already has one, and `buildPinOrderIndex` deliberately does not.
- **Reset the facets on a day change**, instead of explaining the empty list. Rejected: asking the same question of each day is the normal use of the tab, and a control that silently resets itself is its own confusion.
