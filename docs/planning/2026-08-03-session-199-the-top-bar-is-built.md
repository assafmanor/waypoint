# Session 199 — the top bar is built

**Date:** 2026-08-03
**Scope:** Build [ADR-0149](../decisions/0149-the-top-bar-is-two-rows.md). Frontend only, no data-model change.
**Design session:** [session 193](2026-08-02-session-193-the-top-bar-is-two-rows.md)
**Shipped in two PRs:** #388 (the two shipped defects, on its own branch first) and the redesign.

## What the numbers came out at

Measured in a real Chromium at 390×844, `--safe-top` = 0 (a desktop browser pays no notch),
so add 44 for the phone the ADR quotes:

|                  | ADR         | built              |
| ---------------- | ----------- | ------------------ |
| chrome at rest   | 160         | **116 + 44 = 160** |
| chrome condensed | 108         | **64 + 44 = 108**  |
| day strip        | 182         | **184**            |
| mode control     | 88          | **88**             |
| anchor slot      | 54          | **54**             |
| max-length name  | 17px, uncut | **17px, uncut**    |

And the thing the whole §5 argument rests on: going offline moves the header **116 → 116**.
Nothing in the chrome reflows any more.

## The three things the build changed about the decision

1. **The failed-sync control does not survive the condense.** §5 puts it in row 1 and §7
   lifts row 1 out. Amended in the ADR rather than papered over: the badge follows identity
   down so the state is never silent, and both alternatives (a second copy of the control,
   or refusing to condense while a write has failed) are worse than the state they fix.
2. **The slack test needed a number, and the number is derivable.** The ADR gives 48 in /
   12 out and says "never condense when the page barely scrolls". What "barely" means is
   forced: condensing frees 52px, so the body has 52 less to scroll afterwards and must
   still clear the release threshold — hence `52 + 12 = 64` of slack before it may condense
   at all. Verified live: at 390×520 the Home body has 382px of slack and condenses at 200,
   **holds at 20** (the hysteresis) and releases at 0. At 390×844 it has 56 and correctly
   refuses to condense at all.
3. **`useShrinkToFit` needed a guard the defect fix did not.** Measuring with a `Range` is
   right in a browser and _unimplemented_ in jsdom, so the first render of the header under
   test threw. It reports 0 there now — no layout, nothing overflows, leave the size alone.

## What CI caught that the local unit suite could not

Three `shelf-drag` specs failed on the first green-looking push, and **both causes were
real** rather than test noise. Worth reading before touching either file again:

1. **The chrome condensed under a live gesture.** A drag auto-scrolls the body at the
   edge bands, which crossed the condense threshold mid-drag and moved every drop target
   52px. Fixed in the product (`holdChrome`), not in the test, and recorded as ADR-0149's
   third guard.
2. **A drop that lit up and then did nothing.** With the header ~135px shorter, targets
   that used to clear the top edge band now sit inside it, so the auto-scroll was still
   running when `holdOver` returned on the first `drop-over` — and by the release the
   target had slid out from under the finger. `holdOver`'s own comment already promised
   convergence ("the scroll stops at the end of the scroller, and from then on the target
   holds still"); it just returned before converging. Now it waits for lit **and** still.

And one harness lesson that generalises: **a transition in flight makes every measurement
a lie** — the mockup that designed this header hit that four times, and the e2e suite hit
it one layer down, reading boxes in the frames while the chrome was still animating.
`settleChrome` polls the header's height until it repeats rather than sleeping a duration.

## Two things worth knowing before touching this again

**The chip is the `useShrinkToFit` container, and its flex basis is load-bearing.**
`flex: 1 1 0`, not `auto`: with an `auto` basis the chip's width follows its own content, so
observing it to re-fit the name would be observing the hook's own output. The negotiation the
hook's comment always described — a member joins, the stack widens, the chip narrows, the name
re-fits — only actually happens because the basis is 0.

**The mockup's prose is one draft behind its own renderer.** Its cards describe the trip menu
(gear inside it, `כל הטיולים` as the first row), which is the ⟨ערימה בשבב⟩ toggle state. The
file's locked default is `switcher: 'direct'`, and in that state its renderer draws the gear in
row 1 and no menu at all — which is what the owner picked (session 193, call #2) and what
ADR-0149 §4 states. Read the renderer, not the cards.

## Owner's calls this session

- **The chip stays direct** (deck + `swap`, no menu), re-confirmed when the menu variant came
  back up: with the gear and the failed-sync control each keeping their own one-tap path, a
  menu would carry one genuinely new row and two duplicates, and every trip switch would cost
  a second tap.
- **The gear stays between the chip and the people stack**, not at the trailing edge. `/trips`
  and the zero state both end their header row with your avatar, and the in-trip people stack
  is now that same affordance — moving the gear outward would put one tap target in two
  different corners depending on the screen.

## Not done

- **The device pass, which is the ADR's own open question.** The resting day window is 3 at
  390 and the strip is 184px; whether that is usable in the hand is not a measurement. If it
  is too tight, the refused alternative is drawn in the same mockup under ⟨הסרגל מתפרק⟩ — read
  that before redesigning it.
- The other four device questions from session 193 stand unanswered: whether an icons-only
  mode pill reads as trip-vs-plan to someone who has not seen it, whether the deck reads as
  "there are other trips" at 20px, whether 17px Secular One is legible on dark chrome
  outdoors, and whether the condense feels smooth on a body that already cross-fades tabs.
