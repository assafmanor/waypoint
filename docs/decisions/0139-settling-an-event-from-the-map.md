# 0139 — Settling an event from the Map, on the reference that names it

**Status:** Accepted (design + build)
**Date:** 2026-07-31
**Refines:** [0137](0137-the-pin-says-what-happened.md) (which made the gap visible and backlogged it), [0117](0117-map-place-outcome-states.md) §1/§2/§5 (the three outcome states, a human outranking the clock, and "an outcome belongs to ALL of a day's references"), [0121](0121-embedded-map-phase-6-design.md) §8 (the way-in block, which turns out to answer this ADR's hardest question already), [0043](0043-day-view-now-line-phases-and-archive-chrome.md) (the settle strip, which stays where it is), [0027](0027-soft-item-lifecycle-shelf-slip.md) §1 (status is only ever human-written)

Mockups: [`mockups/map-settle-from-canvas-v2.html`](../../mockups/map-settle-from-canvas-v2.html) (the decided design) · [`v1`](../../mockups/map-settle-from-canvas-v1.html) (the rejected card-wide strip, and the measurement that shaped v2)

## Context

[ADR-0137](0137-the-pin-says-what-happened.md) gave the canvas the ability to **read** an outcome — a pin now says היינו / דילגנו / nothing — and in the same session backlogged what it could not do: **write** one. Settling lives in the day view's settle strip ([ADR-0043](0043-day-view-now-line-phases-and-archive-chrome.md)) and the event card's `היינו שם?`, so a passed pin could sit on the canvas reporting `עבר · לא סומן` while the only way to answer it was to leave the tab.

That is a sharper defect than a missing feature. ADR-0137's marks turned an unsettled passed stop into a **visible open question** on a surface with no answer available.

## Decision

### 1. The verb hangs on the reference row, because that row already names its target

"Mark this **place** done" is not a well-formed instruction. A place can carry several events on one day, and ADR-0117 §5 is explicit that an outcome belongs to **all** of a day's references rather than to the one that won the row's clock.

The disambiguation problem this implies does not need solving, because it is already solved: the **way-in block** (ADR-0121 §8) enumerates a selected place's references, one row per entity, each labelled in its own words. So the verb goes on the row that already names what it acts on. One event per row, one outcome per event, nothing to resolve.

This is what makes the change small — no picker, no sheet, no second grammar. The row that reads `אירוע · ארוחת בוקר` gains the two verbs that apply to it.

**An idea or a booking reference gets no controls.** Neither carries an `EVENT_STATUS`, so there is nothing to settle, and the absence is a consequence of the model rather than a rule anyone has to remember — the same shape ADR-0137 §4 has for the tiers that cannot carry a mark.

### 2. Every event is settleable; only the passed-and-unanswered one is emphasised

The controls are offered on **any** event reference, not only passed ones. Two reasons, and the second is decisive:

- ADR-0117 §2 already established that a human outranks the clock — marking tonight's 20:00 dinner done at 11:00 is a legitimate thing to do, and the app already sinks it to `behind` when you do.
- **Gating on "passed and unanswered" would delete the undo.** A settled row is no longer passed-and-unanswered, so the control that takes it back would vanish the instant it was earned. The gate defeats itself.

What the clock does drive is **emphasis**: a reference whose day has passed with nothing said about it — ADR-0117 §1's third state, and the commonest one — gets an amber wash. Derived from the same `isDayUsagePast` the pin tier, the block header and `מה נשאר` all read (ADR-0124), so the four cannot disagree about whether a day is closed.

**Amber is on-budget rather than an exception.** This is a claim about **time** — a day that passed and was never answered — which is exactly what ADR-0028 reserves it for. It lands on at most one row of one selected place, so it never becomes the "second accent on everything" ADR-0109 §6 forbids. The ✓/✕ themselves stay **neutral**: amber is time and commitment, so it belongs on the row making the time claim and not on two status controls.

A settled reference shows what a human said, in the row's **own** tag vocabulary (`.map-tag.ok`/`.miss` — the same words and hues ADR-0117 §1 gave the meta line and ADR-0137 gave the pin), plus the one verb left: undo, which is the shipped `verbs.restore`.

### 3. The row becomes a container, which is the change's only structural cost

`.map-ref` was a `<button>` wrapping the whole row. Buttons do not nest, and the settle pair has to be a real control, so the row becomes a container: the open affordance is its own child keeping all the remaining width, and the cluster is its **sibling**.

That is `ListRow`'s existing shape — `.wp-listrow-right` sits beside its open button rather than inside it — so this is a pattern being reused, not invented.

One consequence worth recording because it is the kind of thing that breaks silently: `.map-ref .icon` was scoped to the row while the row _was_ the button and nothing else in it had an icon. The cluster's icons now match that selector, which pushed them to the far edge with `margin-inline-start: auto` and greyed them to `--faint`. The rule travels with the caret it was written for (`.map-ref-open .icon`).

### 4. The write path is entirely existing

`verbs.done` / `verbs.skip` / `verbs.restore` already take a `TripEvent`, go through `applySetStatus`, work offline through the outbox and toast with undo. This is a new **caller**, not a new mechanism (CLAUDE.md rule 8), and ADR-0027 §1 holds by construction — a human tap only, nothing auto-settles.

### 5. It is not a card feature, and not a pin one either

`refs` is passed to a row when that row is **selected**, and `renderRow` serves the canvas card and the sheet list alike. So the cluster appears wherever the selected row is: the card at the `map` stop, the list at `half` and `full`. One implementation, two hosts.

**Settling from the pin itself is rejected**, and the reason is the same one that shaped §1 rather than a shortage of pixels: a pin is a **place**, an outcome belongs to an **event**, and a pin has no way to say which. On a single-event place a pin control would work; on a multi-event one it would be wrong, or need a disambiguating popover — and that popover is the card that already exists. Supporting reasons: the pin ladder has no free axis left (ADR-0137 spent the last one), two 32px controls do not fit a 34px teardrop, the badge itself is ~15px against ADR-0017's 44px floor, and a long press is already spoken for by ADR-0131 §9's canvas pin-drop. The route is already short — pin → card → ✓ — and the middle tap is the one that names the event, so it carries meaning rather than being friction.

## Consequences

- **The Map can answer the question it started asking in ADR-0137.** The loop the outcome marks opened is closed on the surface that opened it.
- **The third hand-rolled settle affordance now exists, and that is the trigger for extracting a shared one.** `EventCard`'s `.wp-event-settle-*` strip and `PlanDay`'s own `.settle-choose` were already two copies of this idea; this is the third. CLAUDE.md rule 8 says to generalise the existing one-off rather than add another beside it — and its own escape clause says to ask first when that is a substantial refactor, which this is (three surfaces the Map does not otherwise touch). Backlogged as its own change, deliberately, so a day-view regression cannot be mistaken for a Map bug. **The alignment should be of the vocabulary, not the geometry**: the day view's is a full-width prompt on a card with room, the Map's is a compact cluster on a 40px row.

  **DONE (2026-07-31, session 189): `ui/domain/SettleControl`, three densities — `prompt` / `sheet` / `compact`.** The prediction held (vocabulary, not geometry: each host keeps its own placement rule, and the `variant` names its density), and the drift was **worse than the two symptoms this line named**. Counting them properly found four, not two:

  - the day view's skip carried **no mark** where its ✓ had one — the pair was asymmetric;
  - it carried **no hue** either, so `--ok`/`--miss` were not a pair anywhere but on the Map's settled tag;
  - the pair was worded `היינו` / **`דלג`** — a record beside an **instruction**, so the two answers to `היינו שם?` were not the same kind of thing. Both halves are records now (`actions.wasThere` / `event.skipped`), which also makes `he.ts`'s own six-week-old claim that the Map "reuses the day view's own words" true: it named `event.skipped`, and the day view had never used it. `actions.skip` stays for the ⋯ menu, where an instruction is what is wanted;
  - the focus ring was **teal on the card and violet in the sheet**, two bespoke rules that were each half of the app's existing `.app[data-mode='plan']` override idiom. One rule now, and the Map's cluster — which had none at all — gains one.

  **The `compact` density keeps one thing to itself, and it is a density call rather than a second vocabulary:** its pair holds the hues back until touched, because on that row §2's amber wash is already doing the asking and two hued 32px controls beside it would compete with the element making the time claim.

  **Geometry parity was measured, not assumed** — old markup under the old stylesheets against new markup under the new, in the same box: `compact` and the settled tag are **identical** (68×32, 32×32 buttons, a 40.2px tag), `sheet` grows **1px** and `prompt` **2px**, both because the skip button now has an icon to be as tall as. The `prompt` strip's buttons widen by 35px total (the mark plus the longer word) and it does **not** overflow down to a 280px card, well under the ~328px a 360px viewport gives it. A CSS move is exactly the change a specificity slip breaks silently, which is also why the two `!important`s the old rules needed (`.settle-yes` losing to `.settle-choose button`) are gone rather than carried across.

  **What was deliberately left:** the settle _verbs_ are one control now, but the _outcome statement_ is still drawn three ways — `PlanDay`'s `.bld-settle` marker and its `softTag`, `EventCard`'s `.wp-event-tag-done`, and this control's own tag. They are one fact in three geometries and a fourth copy would be worth stopping; today they are not the same widget, and folding the `⋯`-slot marker into a control whose other two densities are button pairs would be aligning the geometry, which is the thing this line said not to do.

- **A long event title truncates on the reference row**, at 390 and 360 alike. Stated rather than smoothed: the mockup's §D measures it, dropping the first pass's `היינו שם?` words returned 51px (146 → 197 at 390, 167 at 360) and this particular 199px label still ellipsises. Ellipsising a long title is what the row already does today, and giving up the verb to save the last few characters would give up the feature.
- **For the device pass:** whether 32×32 reads as a touch target in a row whose own target is all the remaining width (the same trade `ListRow`'s kebab makes), and whether an amber-washed reference row reads as "open question" rather than "error".

## Alternatives considered

- **One `היינו שם?` strip on the place card**, mirroring the day view's. Reads correctly with one event and is a lie with two: it has to settle every reference at once, or pick one by clock, which is precisely the reading ADR-0117 §5 forbids. Drawn in v1's §B on a two-event place so the failure is visible rather than argued. It also adds a third grammar to a card that already has a row and a block.
- **Only passed-and-unanswered events settleable.** Rejected in §2 — it deletes its own undo.
- **The words `היינו שם?` inside the cluster** (v2's own first pass). They cost 51px of a 40px row whose label was already truncating. Replaced by the amber row wash — **but not at the first tint tried**: 9% with a hairline was indistinguishable from a row deliberately _not_ emphasised, which the mockup's §B caught by drawing the two side by side. The words had been doing more work than they looked like they were. 16% with a 2px ring at 42%.
- **Settling from the pin.** Rejected in §5.
