# Session 146 — Phase 7: a number that only means something in a day, and a fade that follows the clock on both halves

**Date:** 2026-07-28
**Branch:** `claude/waypoint-phase-7-pins-fades-rnwupk`
**Build session, no new shape** — two defects, both already decided in [session 145's triage](2026-07-28-session-145-eight-more-from-the-field-triaged.md) (#16, #21). Amends [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md) §6 and [ADR-0117](../decisions/0117-map-place-outcome-states.md) §4; no new ADR, because neither reverses a decision — one enforces §6's own definition and the other extends §4's vocabulary by one class.

## What was asked

Both reports say the same thing from two directions: **the split's two halves make different claims about the same place.**

1. **#16** — the pin/row number "makes sense per day, not in all-days" (a pin read `27`).
2. **#21** — "past places should fade in the list too", not only on the canvas.

## #16 — the number never left day scope; the implementation did

ADR-0121 §6 defines the number as "the index in `comparePlacesBySchedule`'s **day** sequence". The build read that as "whatever scope is on": `buildPinOrderIndex(dayScoped, { onDate: scopedDate })`, with `scopedDate` undefined in all-days, so the comparator sequenced the **whole trip** and the badge showed a place's position in a day nobody was looking at.

**The fix is a guard, not a renumbering.** With no `onDate` the index is empty and nothing is numbered — on the row and on the pin together, since they read the one map, which is the property §6 exists to protect. Renumbering `1..n` per day was the tempting alternative and it breaks the same section: two pins both reading `1` on one canvas, with nothing on either saying which day it belongs to. Nothing is lost, because an all-days row already states its day in words (`relativeDayLabel`) exactly where the number was ambiguous.

Two consequences, expected rather than discovered: `pinZIndex`'s `ORDER_SPREAD` nudge goes inert in all-days (it only ever ordered _within_ `upcoming`; the tier z-order is untouched) and `.map-badge[data-order]` / `.pin-n` stop rendering, as they already do for every unnumbered row. Both are now asserted.

**The clock-free invariant survives, and is now held twice.** [Session 144](2026-07-27-session-144-what-is-left-means-somewhere-you-can-go.md) left "`buildPinOrderIndex` must keep getting no clock" as its trap for the next session; the scope guard makes the branch that trap protected unreachable, but the signature still refuses a clock and the reason still sits at the call site. It was tempting to tidy — it is the cheaper of the two guards and it is the one that states the intent.

## #21 — the row faded on a human, the pin faded on the clock

`.place.skipped` was the row's only quiet treatment, so the list went quiet when a human tapped `דילגנו` while the pin went quiet the moment `isDayUsagePast` turned true. Same place, two answers.

The row now takes `behind={blockOf(usage) === PLACE_BLOCK.behind}` — the derivation that already draws the `מה שמאחורינו` header and already answers `מה נשאר` — and wears its own `.place.behind`. That is [ADR-0124](../decisions/0124-map-filters-scope-facets-and-what-is-left.md)'s principle applied one surface further: the fade, the header and the filter now close a place at the same instant because they cannot disagree about the predicate.

**Reusing `.place.skipped` was the trap, and it is wrong twice.** It re-applies the fade [session 137](2026-07-27-session-137-ambient-stay-prominence.md) deliberately removed from the ambient tier (the hotel you are sleeping in tonight read as finished), and it conflates _a human said this did not happen_ with _the clock passed it_ — two claims that coincide often and mean different things. So the class is its own, it is lighter than `skipped` (the header already says it in words; the fade reinforces rather than carries), and the rule is `.place.behind:not(.skipped)` so a skipped-and-past row takes one treatment rather than compounding a row filter with the badge's own.

Worth naming because it is new behaviour and not just a class: a place marked **`היינו` before its time** now fades. It is settled, `isDayUsagePast` outranks the clock for exactly that reason (ADR-0117 §2), and the row previously said nothing about it.

## What changed

| File                        | Change                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `lib/map-pins.ts`           | `buildPinOrderIndex` returns an empty map without an `onDate`; the number's contract restated as day-scope-only |
| `screens/Map.tsx`           | `PlaceRow` takes `behind`, fed from `blockOf`; the pin call site says why all-days carries no number            |
| `screens/map.css`           | `.place.behind:not(.skipped)` — the row's light echo of the pin's `saturate(.3)`                                |
| `ui/domain/MapPane.tsx`+css | comments only: the pin's `skipped` class is the clock's tier, so the row it mirrors is `.place.behind`          |

The pin class itself was **not** renamed to `behind`. It would read better, but `.map-pin.skipped` is the vocabulary two mockups and ADR-0121 §6 already use, and diverging shipped CSS from the design record costs more than the name saves. The comments now state which row class it actually mirrors, which was the part that could mislead.

## Tests

Both scopes, everywhere — #16 is an all-days-only behaviour, which is precisely the class of bug the two-scope rule was written for:

- `lib/map-pins.test.ts` — all-days numbers nothing while the same fixture still numbers day-scoped; the `ORDER_SPREAD` nudge ties in all-days and the tiers still rank.
- `lib/place-usage.test.ts` — the predicate the fade keys on tells "the clock passed it" from "you are sleeping there tonight", in both scopes (they resolve a stay's day differently, so one says nothing about the other).
- `screens/Map.test.tsx` (the list-only, no-build-config path) — all-days numbers nothing and the row names its day instead; the passed stop carries `behind` in both scopes and the ambient night never does; `היינו` fades without claiming a skip; a skipped row carries both classes.
- `screens/Map.embedded.test.tsx` — the row and its pin lose the number **together**.

The fixture gotcha from session 144 held again: two references on one date merge into one day, so every behind/ahead fixture uses two **places**.

## Not done here, deliberately

- **The paint is a human pass.** The suite holds down which rows and pins carry which class; whether `saturate(.55)` is the right weight for a behind row on a real phone is a look, not a derivation.
- Phases 8–11 (the two-control split, `X באזור` as a button, one-finger zoom, search on the canvas, booking phase labels) are untouched and still sequenced as session 145 left them.
