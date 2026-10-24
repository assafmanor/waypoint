# 2026-09-03 — The mark was a fraction of the drive

**Task:** the owner, with the shared page and the day view side by side on a real trip at
⁦12:12⁩ — _"Looks like the line isn't on the currently happening event on the live sharing page.
See the difference between the sharing page and the day view"_.

**Shipped:** the nailing moved from the host into `EventRow`, an e2e geometry assertion, a unit
assertion of the invariant under it, and [ADR-0217](../decisions/0217-the-now-marker-points-it-does-not-separate.md)'s
2026-09-03 amendment. No mockup: the drawing was right, the scope of one wrapper was not.

## What the two screenshots showed

Same moment, same event, two answers. The day view nailed the mark inside the ⁦12:00–13:00⁩
coffee with `47 דק׳` of it left. The shared page drew the arrow and its rule on the ⁦14⁩-minute
drive **above** the card — while the card itself still wore its `עכשיו` chip. So the page
asserted both "this is happening" and "this has not started", in adjacent elements.

Worth noting because it nearly sent me the wrong way: that chip is rendered from the same
`held` flag as the mark. Its presence proved `shareNowLine`'s `inside` was resolving correctly,
which ruled out the whole derivation — the labels, `nowInside`, `dawnOrder`, the projection's
`startLabel`/`endLabel` — before any of it was read. The one contradictory-looking detail was
the fastest way in.

## The cause: a wrapper's scope, not a number

`--thru` is a percentage of the marked box's height. `EventRow` returns a **fragment**, and an
event carrying a stored journey renders `.sh-journey` as a sibling line before its
`article.sh-event`. The host wrapped "the row" — both of them — so the fraction was measured
over drive + card.

Measured in a browser against the shipped code: ⁦30⁩ minutes into a ⁦90⁩-minute event the arrow
sat at ⁦y=178.1⁩ with the card starting at ⁦y=189.8⁩. ⁦11.7px⁩ high, which is a drive line.

**`DayView` never had it, and that is the fix rather than a curiosity.** A join there is its own
row, with its own mark when the moment falls in the gap — so no wrapper on that screen ever
spans a travel line and a card. Matching that scope is the repair; adjusting `thruFrac` would
have been fitting a number to one layout.

The nailing therefore moved into `EventRow`, which already decides which of its three shapes is
the row's own box: the summary row, the `Trek` container (a chained journey IS the event, so it
takes the mark whole), or the article with its drive left outside. The host hands down a
`nowMark` and no longer has an opinion about what a box is.

## Why the suite was green, and the general lesson

**In jsdom every box is ⁦0px⁩ tall**, so no rendered fraction is distinguishable from any other.
No amount of unit-test diligence could have caught this: the derivation was correct, the DOM
contained the right elements, and the only wrong thing was a ratio over a box with no height.

`playwright.config.ts` already says the transferable version of this — _"an asset path, a chunk
boundary and a worker URL are all build-time facts, and a dev-server suite asserts none of
them"_. **A rendered fraction is in that family**, and this is the second time in two days that
this page's defect lived exactly where its suite could not look (the first was the e2e stub
outside the typecheck program). The pattern to carry forward: when a feature's correctness is a
_measurement_ rather than a _value_, the test has to be somewhere a measurement exists.

So two tests, one per altitude, each verified to fail on the old scope:

- **e2e** reads `--thru` off the element, computes the arrow's `y`, and asserts it is inside the
  card's rect and below the drive's. The second clause is separate on purpose — a card grown
  tall enough to swallow the drive would pass the first without the bug being fixed. Fails with
  `expected >= 189.796875, received 178.13`.
- **unit** asserts the invariant jsdom _can_ see: the journey line is outside `.now-here`, the
  card inside. Fails with `expected <div class="sh-journey"> to be null`.

## Untouched

`shareNowLine`, `nowInside`, `dawnOrder` and `thruFrac` all return exactly what they returned —
`thruFrac` was right the whole time. The boundary form does not move. `NowMarker` is unchanged
for the third host in a row, which is the argument for it being one component.
