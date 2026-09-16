# 0233 — The tab bar groups the day surfaces, and the drawer sits at the end

**Status:** Accepted 2026-09-16. **Built** the same day — a one-line reorder of `TABS`.
**Date:** 2026-09-16
**Reported:** the owner, against the shipped bottom bar — _"The bottom bar currently reads from right
to left: home, map, index, day to day. From a best UX standpoint, given that the map and the day to
day are both day aware, the index is not, and other factors … like which ones are used the most
(probably home > day to day > map > index), should we reorder?"_
**Amends:** [`design-language.md`](../design/design-language.md)'s **Bottom nav** entry, which until
now recorded the tabs' icons and states but never their sequence.
**Constrained by:** [0035](0035-in-app-back-and-return-gesture.md) §4 / [0090](0090-back-is-computed-from-nav-state.md)
(Home is the back anchor), [0060](0060-reopen-after-idle-returns-to-trip-home.md) (reopening resets to
Home), [0110](0110-maps-and-places-frontend-architecture.md) §4 (`DAY_SCOPED_TABS`),
[0017](0017-mobile-first-device-targets.md) (phone-primary, one-handed).

## Context

### 1. The order was inherited, never argued

`TABS` has read `home · map · index · days` since the shell was built. No ADR decides it,
`design-language.md`'s Bottom nav entry names the four icons and the active-pill treatment and stops
short of the sequence, and the mockups do not agree with each other or with the app: seven of the
map-session files (`map-split-v2`, `map-chrome-v1`, `map-errand-v1`, `map-search-v1`,
`map-google-pins-v1`, `map-place-becomes-v1`, `event-also-booked-v1`) draw
`בית · יום ביום · אינדקס · מפה` while the app ships `בית · מפה · אינדקס · יום-יום`. Seven drawings
quietly moving Day-by-day to position 2 is the strongest evidence that the shipped order was nobody's
decision.

### 2. One of the four tabs is not like the others, and it is sitting in the middle

`tabShowsSelectedDay` (nav-state) is true for **home, days and map** and false for **index** — the
Index is trip-wide by design, so the header's day strip singles out no pill there while the
remembered day rides along in the URL (`dayCarriedFrom`). Two of the three are also `DAY_SCOPED_TABS`:
a strip tap focuses the day **in place** rather than routing away.

So the bar is a group of three plus one — and the odd one is in slot 3. Walking the bar right to
left, the header's day strip means "the day you are looking at", then means nothing, then means it
again. **Two boundaries across four positions**, on the one element that is above every tab.

### 3. The hardest corner is holding the second-most-used tab

RTL, phone-primary, one-handed (ADR-0017): the right end of the bar is where the thumb rests and the
far left is the worst reach. Today the far left is `יום-יום` — on the owner's own frequency estimate
(home > day-by-day > map > index) the **second**-most-used surface — while the least-used sits in a
prime middle slot. Reach cost and usage run in opposite directions.

## Decision

**The bottom bar reads, right to left: `בית · יום-יום · מפה · אינדקס`.**

`TABS[0]` is the rightmost tab; the array becomes `home, days, map, index`.

**And the rule behind it, which is the part worth keeping:** the day-anchored surfaces are contiguous
and ordered by narrowing subject — Home (today, at a glance) → Day-by-day (that day's sequence) → Map
(that day's ground) — and the trip-wide reference drawer sits at the far end. A fifth tab joins the
group whose question it answers. **Nothing goes in the middle of the day block.**

Four readings land on the same sequence, which is why this is a reorder and not a preference:

- **Structure.** One day/not-day boundary instead of two. The day strip's meaning changes exactly
  once as you cross the bar, at the last adjacency.
- **Reach against frequency.** Cost rises as usage falls: home (thumb-rest) → days → map → index
  (worst corner, least used). The current order inverts this for the two middle tabs.
- **Reading order.** Hebrew starts at the right; position 1 is "first". Home is uncontested there —
  it is the back anchor (ADR-0090) and the idle-reset target (ADR-0060), so back must land on the tab
  the eye starts at. What follows is the product's stated core question, "what now / what next".
- **Drill.** `home → days → map` is one subject getting narrower. `home → map → index → days` is not
  a sequence anyone can say out loud, which is the tell that it was never chosen.

## What this costs

**Muscle memory, for everyone who has used the build.** That is the entire cost and it is real: a
tab bar is learned by position, not by reading. It is paid once, and this is the cheapest moment it
will ever be — the app is invite-only and pre-launch (ADR-0065), so the population that has to
relearn is the group that asked for the change. Deferring it only raises the price.

Nothing else moves: no code branches on tab position, the icons and labels are unchanged, and the
active-pill/stroke treatment is untouched. One e2e (`back-navigation.spec.ts`) selected the Day tab
as `.last()` and now selects it by name — the positional selector was a latent trap regardless of
this change, since it encoded "days is last" in a comment rather than in an assertion.

## Alternatives

- **Leave it.** The status quo has no argument behind it (§1), and the two defects in §2/§3 are
  structural rather than matters of taste. Rejected.
- **`days · home · map · index`** — put the workhorse under the thumb. Rejected: Home is where back
  lands and where an idle reopen resets to, so it cannot be the tab your eye does not start at.
  Making the anchor not-first costs more than it buys a heavy user.
- **`home · map · days · index`** — fixes §2 (index at the end) but not §3, and it separates the two
  surfaces that answer "what now". Rejected on the frequency ordering it ignores.
- **Index out of the bar entirely** (a header entry point, freeing a slot). Rejected here as a
  bigger question than the one asked: ADR-0004 makes the Index one of the app's four destinations,
  and demoting it is a product decision, not a nav-order one. Recorded so it is not re-derived as a
  cheap alternative to this.
- **Sort purely by frequency and ignore day-awareness.** Lands on the same four positions by
  coincidence today, and would be the wrong rule the moment a fifth tab arrives — frequency is
  measured, and we measure nothing yet. The grouping rule survives a new tab; a guessed frequency
  ranking does not.

## Not decided here

The mockups are left as they were. A mockup is the record of what a session promoted
(ADR-0097/0175), not a live rendering of the shell — retrofitting nineteen files' nav markup would
rewrite that record to say something those sessions did not decide. New mockups draw the order above.
