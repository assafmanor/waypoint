# 2026-08-21 — A day steps with a swipe, and the document stops scrolling

**Built.** Both halves of one owner message: the empty band under the tab bar on Home, and swiping a day surface to the next/previous day with a rebuff at the ends. [ADR-0200](../decisions/0200-a-day-steps-with-a-swipe-and-the-shell-stops-scrolling.md).

## The band was found in the screenshot, not in the code

The report came with a frame, and the frame is what named the cause. Decoding it (1080×2400, so 3× on a 360×800 device) and reading the row colours down the left edge:

| CSS px      | what                                       |
| ----------- | ------------------------------------------ |
| 592.7       | the nav's `border-top`                     |
| 593.3–654.3 | the nav's ground (~62px — its real height) |
| 654.3–779   | **`--screen`, 124.7px of it**              |
| 779–800     | the Android system bar                     |

`.app` is `height: 100dvh` and its nav is the last child, so the frame's bottom edge **is** 654.3 — about 124px short of the viewport. Add the in-trip header (~128px, absent from the frame) and the geometry closes exactly: the document had been scrolled by ~125px with the body still at `scrollTop: 0`, which is why the hero reads as flush at the top.

**Worth writing down: three wrong hypotheses came before that arithmetic** — the body's 92px tail, an unpaid `--safe-bottom`, and a transient during a toolbar animation. Each was plausible from the code and none of them predicts 124.7px. The pixel decode took two minutes and settled it; the reasoning had already taken twenty.

And then the cause is `html, body, #root { height: 100% }` — a line nobody reads, three lines above a comment asserting the opposite of what it produces. That is the transferable part: **the shell's invariant was written as prose in a comment and enforced nowhere.** It is `overflow: hidden` now.

### The regression I spent an hour proving, which was not one

The shell fix shipped first as `html, body { overflow: hidden }` plus the root chain moved to `dvh`. The full e2e run came back with one failure: `event-arrival-scroll.spec.ts`'s **Plan-day** landing, the row unmoved at `top: 883` in an 844-high viewport. It passed in isolation.

Then I did the right thing badly. I ran the base 12 times (12/12), the change 4–6 times (1 failure each), a `tokens.css`-reverted arm 8 times (8/8), and concluded — with a mechanism to match — that sizing the root in `dvh` was churning layout under `lib/land-at-top.ts`'s watch. Every one of those arms was **too small to distinguish the rate I was claiming**, and the mechanism was a story fitted to noise. Repeating properly:

| root style                 | Plan-day landing |
| -------------------------- | ---------------- |
| base — neither declaration | **51/52**        |
| `overflow: hidden`         | 46/48            |
| `overflow: clip`           | 47/48            |

**The base fails at the same rate.** It is a pre-existing flake in that spec, now backlogged beside the `shelf-drag.spec.ts` one, and nothing in this change made it worse.

Three things worth keeping, none of them about CSS:

- **A bisect arm needs enough runs to see the rate you are claiming.** At a ~2% base rate, 8 runs cannot tell 2% from 0% — and it will happily hand you a clean-looking table.
- **"Passes in isolation" is a statement about parallelism, not a diagnosis.** The prior was available (the backlog already records one flake of exactly this class) and I reached past it for a regression I had just written.
- **A mechanism that explains the data is not evidence the data is real.** The `hidden`-is-a-scroll-container argument is _true_ — and it explained a difference that does not exist.

The fix kept the part that survives on its own reasoning: `overflow: clip`, because `hidden` leaves the root a scroll container that `scrollIntoView` would walk, and `clip` is not one at all. The `dvh` half is gone as redundant — `dvh <= lvh` and the ICB _is_ `lvh`, so the surplus is always below the fold and an unscrollable root makes it unreachable. And `e2e/shell-does-not-scroll.spec.ts` now asserts the invariant the band itself cannot be tested for.

## The gesture: two measurements, each of which looks like the other's answer

The recogniser was the easy half. Claiming the axis was not, and both facts below were measured in a real engine after the unit tests were already green — which is the whole argument for the e2e spec existing.

**1. Chrome cancels the pointer at ~8px, in any direction.** Instrumented on the real day surface, a touch starting on a bare stretch produced exactly this:

```
pointerdown  x=178
pointermove  x=193      (15px)
pointercancel
```

A recogniser whose slop is 24px never sees 24px. And the failure looked _intermittent_: a swipe starting on a day **card** worked the whole time, because ADR-0199 gave those rows a `touch-action` of their own for the hold-drag. Chasing that as flakiness would have been a long afternoon.

**2. `touch-action: pan-y` on the host — the obvious fix — is not available here.** Tried, and the maybe shelf stopped scrolling horizontally at all: `touch-action` intersects down the ancestor chain and no descendant can widen it back. ADR-0182's device pass already found this from the other side; what is new is that on a day surface it is _unfixable by declaration_, because the same subtree contains both a bare stretch that should page and a strip that owns this axis.

So the axis is claimed where the question can actually be asked — `scrollerWithin(target, host, 'inline')` at the press, and a non-passive `touchmove` that decides at 6px and `preventDefault`s only a horizontal start. `lib/scrollable.ts` existed already and is exactly the predicate: **"does this box overflow _right now_"**, which is why a shelf holding two ideas pages the day and a shelf holding ten scrolls itself, with neither the shelf nor the pager knowing about the other.

## The bug that cost the most, and it is a one-liner

The e2e reported a _rightward_ swipe landing on **yesterday**. `getComputedStyle(el).direction` was `rtl`, `stepFor` was right, and the same gesture in a scratch spec worked. The instrumented release said:

```
DBGEND { dx: -177.5, released: true, step: -1 }
```

`-177.5` is exactly `-startX`. The `pointerup` arrived at `clientX: 0` — the CDP `touchEnd` lifts every finger, so the platform had no point left to report it against. The scratch spec had an `evaluate` round-trip before the lift, which is the only reason it passed.

The fix is a product fix, not a test fix: **read the travel from the moves, never from the release.** A `pointercancel` carries no meaningful coordinates at all, so this was never safe — the e2e just made it visible. Generalises past this app: an end event is a _notification that the gesture is over_, not a measurement of it.

## Smaller things the build turned up

- **The pager's `window` listeners outlived the element.** A day surface unmounts on a tab change; a finger still down kept driving a host no longer on screen. Found by two unit tests interfering with each other, which is a fair way to find it — the same leak, one turn of the loop apart.
- **A `pointercancel` must commit nothing.** It first fell through to the same commit path as a release, which meant the browser taking the gesture also stepped the day. It is the browser saying "this was mine", so it settles back and arms no click swallow.
- **`.body`'s 92px tail is not dead space**, which is the other candidate the report could have been about. `.toast` is `position: fixed; bottom: 78px` and floats over the body's last ~56px, so trimming the tail puts a confirmation over the row that produced it. Nothing said so; now a comment does.
- **No new `BEAT`.** The edge refusal is `BEAT.PINNED`'s statement — strain, arrest, return — but a swipe can say it _while it is happening_, so it is the damped follow and the settle rather than a fifth-and-a-half member. Same reasoning made the arriving day free: the new day renders into the element the finger already displaced, and one `transition` back to level is the whole animation.
