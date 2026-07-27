# Session 144 — the Map's filters, stated once, and `מה נשאר` fixed

**Date:** 2026-07-27
**Branch:** `claude/maps-filters-behavior-wy31nw`
**Build session, ADR written at its end** — the shape of the controls did not change (no new chip, no new surface, no mockup), only what one predicate means and what the tab says when a list comes back empty. Produces [ADR-0124](../decisions/0124-map-filters-scope-facets-and-what-is-left.md).

## What was asked

Two reports, both from using the tab:

1. "I'm not sure what stays at `מה נשאר` and what not. I'm not sure how compound filtering works (`מה נשאר` + `אולי` for example)."
2. "I see past events in `מה נשאר` and I really don't understand what's the usage here."

The first is a documentation failure, the second a design defect. They have the same root, which is why they arrived together.

## The finding

**`מה נשאר` was defined against something that rarely happens.** ADR-0121 §9 made it "hide everything `settled`". Settling is a **manual tap** — ADR-0027 §1 and ADR-0018 both refuse to auto-write status, deliberately — so on a real trip most stops are never settled and the filter hid almost nothing. §9's own justification ("with the settled pins gone the remaining cluster is legible") never came true, because the pins never went.

The fix is in the predicate the tab already had. `isDayUsagePast` is **both** closers — it reads `settled` before it reads the clock — so reusing it gives the tab one explainable sentence: **`מה נשאר` hides exactly what the list files under `מה שמאחורינו`.** The owner asked separately that a stop still ahead of you but marked `היינו` be hidden too; that falls out for free, and now has its own test.

**Writing the model down exposed a second defect.** In all-days scope every place was read off `days[0]`, so one past day classified it however alive the trip still was with it. Two visceral cases:

- The hotel you are **sleeping in tonight**, from its second night on: `מה שמאחורינו`, with a **desaturated** pin.
- A café visited Tuesday and booked again Thursday: filed as done.

`מה נשאר` — which asks about **all** a place's days — kept both. A filter and a block header disagreeing about the same place is what made it findable.

**Worth recording about the fade specifically**, because it looks like a regression of work that had just shipped and is not: [session 137](2026-07-27-session-137-ambient-stay-prominence.md) removed the desaturation from the **ambient** tier precisely because "on this canvas desaturation already means behind you". That fix is correct and untouched. All-days simply never reached the ambient tier — it resolved to the check-in day, got `PIN_TIER.behind`, and `MapPane`'s tier→class map sends `behind` to the **`skipped`** class, i.e. `saturate(.3)`. Harder than the paint session 137 removed, through a door it never looked at.

## What changed

| File                 | Change                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/place-usage.ts` | `placeDay` takes a context and resolves the **live** day in all-days; `placeMetaDay` added; `isPlaceSettled` → `isPlaceLeft` over `placeBlock` |
| `lib/map-pins.ts`    | `placePinTier` passes the whole context; `buildPinOrderIndex` explicitly passes **no clock**, with the reason stated at the call               |
| `screens/Map.tsx`    | one `dayCtx`; `hasSettled` → `hasBehind`; self-clearing toggles; the three-way empty state; `forceDay` reaches `refEntriesFor`                 |
| `i18n/he.ts`         | `emptyDay.*`, `filter.noResultsBody`, `filter.clear`                                                                                           |

Two things deliberately **not** changed: the count-coupling rule (ADR-0119 §3, which already made the compound honest — the counts were never the problem) and ADR-0117's outcome states, tags and quiet skipped row.

## The trap, for the next session

**`buildPinOrderIndex` must keep getting no clock.** `placeDay` is now clock-aware _when given one_, so passing `nowMs` there would make a pin's number change on a tick — the one thing ADR-0121 §6 forbids. It is a one-word mistake with a silent, once-a-second symptom, so the reason is written at the call site rather than left to the ADR.

## Two things the tests taught, both worth keeping

- **Two references on one date merge to one day**, whose `until` is the **latest** of them. A first draft seeded a passed morning stop and an evening stop on the same place and got no "behind you" at all — correctly: the place is live until the evening. Fixtures for behind/ahead need two **places**, not two events.
- **The type chip cannot reach the filtered-empty state.** An emptied type falls back to `הכל` (ADR-0119 §3), which is the dead end that rule was written to prevent. So the reachable paths are the two **toggles** (tappable at zero) and the **day scope** — which is what the new empty state is actually for, and what the test now exercises.

## Not done here, deliberately

- **The Map tab's own search renders in day-scoped grammar.** Search is global (scope- and facet-blind, the Index's rule), but its rows are rendered and blocked against the strip's day, so a hit from another day shows no day at all and is filed under `ללא יום` — a claim about the place, when it is a fact about the scope. Left out because [session 135's](2026-07-26-session-135-map-panel-second-pass-triage-and-phasing.md) **Phase 6a** (#7, "search needs a map") is a cost-gated session that may rework this surface; backlogged so it inherits the defect rather than rediscovering it. Owner's call.
- **Phase 5** (#6, widening `useShowPlaceOnMap`) is untouched and still open.
- **Converting a place into an event or a booking** — reported this session and backlogged below; it is a new surface, so it needs a design session before a build.
