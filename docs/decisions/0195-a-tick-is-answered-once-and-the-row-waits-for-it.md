# 0195 — A tick is answered once, and the row waits for it

**Status:** Accepted, **built** (2026-08-17).
**Date:** 2026-08-17

**Amends:** [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) §2 — the completion control gains a beat, a one-way one, and its hover stops borrowing `--ok`. Its own open device-pass question about whether a 26px ring reads as pressable is answered here with a number, and the answer is not flattering.
**Builds on:** [0140](0140-motion-is-a-vocabulary-not-a-decoration.md) (the motion ramp; §5's "a state that exists only during an animation", §6's "a transition is answered, a status is not decorated", §7's build log), [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §7 (`lib/one-shot.ts`, the beat family), [0120](0120-filtering-a-list-is-a-reveal.md) (the reveal the tasks screen collapses a settled row with).
**Design:** [`mockups/a-tick-that-is-seen-v1.html`](../../mockups/a-tick-that-is-seen-v1.html) — seven candidates with the numbers, promoted by this ADR. [Session note](../planning/2026-08-17-task-tick-beat-design-session.md).

## Context

> _"please design a nice tick animation for the task rows (in the tasks and the home screens). Lets mockup some options"_ — then, on the first render: _"I want more exciting animations! You're an expert designer. I want some playing with the tick sign"_ — then, on the second: _"Unticking shouldn't use the same animation if any, it should be much more minimal I think. Ticking/unticking still leaves the checkbox selected (with a small outline) — we should get rid of it"_ (owner, 2026-08-17)

Two things were true before a pixel was drawn, and the second one is what this ADR is actually about.

**The tick had no motion at all, and not by a decision.** `tasks.css` swapped `::before`'s background to `--ok` and flipped the ✓ from `opacity: 0` to `1` on `[aria-pressed='true']` — no `transition`, no `animation`, no token. There was nothing to tune.

**And on every surface the ask named, the row leaves in the same frame.** `taskMatchesFacet` returns `false` for a settled task under _both_ open facets, so the tasks screen collapses the row through `RevealList` over `--t-base` — the same 240ms a beat would take, on the same easing, in the opposite direction. Neither Home band goes through `RevealList` at all, so there the row **unmounts**. Plan Home's moves into a collapsed drawer. The only surface where a ticked row stays put is a host section.

So "which flourish" was the second question. The first was: **is there anywhere for a flourish to play?**

## Decision

### 1. The beat is a fourth `BEAT`, and the row's departure is sequenced on its return value

`BEAT.TICK = 'is-ticking'`, played by `playBeat` from a new `TaskTick`, keyframes in `tasks.css` beside the control the way that family's own docstring requires. No new mechanism: `lib/one-shot.ts` already carries one-shot-applied-imperatively, duration-from-a-token, and removal by timer rather than `animationend`.

**And `playBeat` already returned the hold.** Its docstring says the ms is _"what lets a caller sequence something after it without asking twice"_ — written for the landing beat and never used by one until now. `TaskTick` fires `onTick` after that many ms, so the write, the optimistic update and therefore the row's departure all happen _after_ the answer has been given. At 0 — reduced motion, or `tokens.css` unreadable — it fires straight away and there is no gap to reason about.

**It must be `playBeat` and not a CSS rule on the state.** A rule keyed on `[aria-pressed='true']` cannot tell "just ticked" from "arrived already done", so the `הושלמו` facet, the Plan drawer and every host section would play the beat on **every** settled row at mount. That is ADR-0140 §6 and §7 one control over, and the mockup's §3 renders it: four rows mid-draw at the same instant.

**What the hold costs, in full:** the row stays on screen ~240ms after the press. Nothing else waits — and one failure it could have introduced is closed rather than accepted: an unmount inside the beat (tab switch, back gesture) **flushes** the held tick in the effect's cleanup, so a tap can never become a press with no write. Nothing else can unmount a ticking row, because until `onTick` runs no state has changed.

### 2. The excitement is in the keyframes, because at this diameter no easing can carry it

The owner asked for more, and two numbers sampled off the mockup's filmstrip say the quiet options _could not_ have delivered it rather than merely being modest:

- **`--ease-arrive` overshoots 0.073px on a 26px disc** — a fifth of a device pixel. The app's only overshooting curve is deliberately "a nudge past the mark, not a bounce", which reads on a sheet arriving and is not measurable on a tick.
- **A ✓ drawn under `--ease-standard` is 61% complete at 60ms of 240** and then crawls through the last 12%. A decelerate is right for an object arriving and wrong for a pen moving.

So the shipped beat is `ה · הקפיצה`: the ink squashes to 0.55, overshoots to **1.14** (a measured **3.408px**, 47× the curve's), settles at 0.965 and lands, while the ✓ is **drawn** through it. `linear`, with the beat written as **interior stops** — `lib/one-shot.ts`'s rule 2, and the same reason it gives: under a non-monotone curve an offset is resampled and stops being the timing.

Two constraints it respects by construction: it peaks at 29.6px inside the 44px box, so nothing clips; and **both transforms are on the `::before` and the mark, never on the `<button>`** — an animation outranks author normal declarations, so a `transform` there would beat `tokens.css`'s app-wide `:active { transform: scale(var(--press-scale)) }` and take the press acknowledgement away with the finger still down.

`is-ticking` also carries the **done paint** itself, because the hold means `aria-pressed` is still `false` while the beat plays: the answer lands before the data does. It also makes the animation's endpoints independent of when React commits.

**Rejected: an expanding ring (a ripple).** Not drawn anywhere, and the reason is the budget rather than the taste: a ring out of a control is the vocabulary of "pulse means live" (design-language), and even one-shot it says "something is still happening" at the moment something _finished_. The candidate that plays with the mark and stays inside the vocabulary was a ghost of the **glyph** — drawn, and rejected on its own cost: a second `<Icon name="check">` at every tick forever so a 240ms flourish can play.

### 3. The way back is not the way in, and the asymmetry is one rule

Un-ticking is a **correction, not an achievement**: no beat, no hold, no keyframe. The fill drains and the mark fades over `--t-quick` on `--ease-exit`, the curve the app already uses for a glow going out.

**Declared on the OPEN state, which is what makes this one rule instead of a flag:** a `transition` is read from the **destination** state's computed style, so it governs done→open and is simply absent on open→done, where the keyframes do the work. Nothing has to know which direction it is going, and the beat stays a pure entrance. Measured 0.14s against 0s on the pressed state.

The first draft got this wrong in the way worth recording: it reused `is-ticking` in both directions, and on an open control that plays the **open state's entrance** — the pop, in reverse. A symmetric mechanism is not the same as a symmetric meaning.

### 4. The hover stops asserting the done state, and `:focus-visible` was innocent

The report was _"ticking/unticking still leaves the checkbox selected (with a small outline)"_, and there were two candidates. **Probed in a real browser rather than reasoned about:**

- `:focus-visible` is matched by **neither** a mouse click **nor** a tap. The focus ring is not involved and is unchanged — a keyboard user needs it.
- `:hover` **latches after a tap** and clears only when something else is tapped.

And the shipped pair made that latch say something false: `:hover .icon` was `opacity: 0.4` and `:hover::before` borrowed **`--ok`**, so an **open** control sat there wearing a ghost ✓ inside a green ring — rendered beside two untouched rows in the same card, it is indistinguishable from done.

**This closes the 2026-08-16 report that "did not reproduce"** (_"when clicking again it still stays marked (not ticked, just an outline)"_). That session drove taps in the running app and read `aria-pressed` and the fill, both of which were correct the whole time, which is exactly why it found nothing. **The general lesson, since it will recur: a report about a control's _appearance_ after an interaction is not answered by asserting its _state_.** The state was right and the paint was lying.

**The repair is a deletion: the tick has no hover state at all.** Verified in a real touch context — after a tap `:hover` is latched and the control paints exactly its resting state (ring `--line`, mark `opacity: 0`), byte-identical to rest and to a mouse hover.

**The build tried the quieter hint first and dropped it, which is worth recording because the reason is not "it looked wrong".** The drawn proposal kept a hint — the ring lifted to `--muted`, gated on `@media (hover: hover) and (pointer: fine)` so it could not latch — and it would have been the app's first such query. It went out because **it could not be verified as cheaply as it could be deleted**: six browser probes disagreed about whether a hovered pseudo-element's colour reads back at all (the rule parsed, the media query matched, `el.matches()` confirmed the selector, and the computed `::before` colour still reported the base value), and this repo has shipped a `className` whose rule did not exist twice already — a rule nobody can measure is the same risk wearing a different hat. It was also mouse-only on a phone-primary app (ADR-0017), so the tick loses nothing a phone ever had: it keeps `cursor: pointer`, its ring, its `:focus-visible` and the app-wide press scale.

**What survives from the attempt is the part with forty other call sites.** On a touch device _every_ `:hover` rule is also a stuck state, and `@media (hover: hover) and (pointer: fine)` is the guard for the ones that must keep a hint — the sweep is on `docs/backlog.md` and deliberately not taken here (rule 8's "ask before the larger change"). Most of those lift a background a few percent, so a latched one merely lingers as a highlight; this one borrowed the vocabulary of `done`.

One specificity trap is recorded in the sheet, because it is what the obvious spelling of a hover _override_ would have hit: `.tsk-tick:hover .icon` and `.tsk-tick[aria-pressed='true'] .icon` are **both (0,3,0)**, so an unscoped rule sitting after the pressed one wins on a hovered **done** tick and takes its ✓ away. Deleting outright avoids it; the next person adding a hover to a stateful control will not.

### 5. One control, five surfaces — `TaskTick`

The tick's `<button>` was hand-copied at **four** call sites (`IndexTasksView`, `TaskBandRow`, `AutomaticTaskRow`, `TaskSection`), identical down to the four attributes and differing only in the density class. Survivable while the control had no behaviour; a beat added at one of them is a beat three surfaces do not have — the shape this feature has already paid for twice (`.chk-toggle`'s font reaching one of two callers, `.tsk-who-row`'s assignee reaching one of two rows).

`TaskTick` owns the beat, the hold and the flush, and nothing else: no state, no data, no copy. The two densities are a `Record<TickDensity, string>` so a third is a compile error rather than a silent default.

## Consequences

- **The tasks screen's collapse and the beat no longer overlap** — the row starts leaving when the beat is done, so `RevealList`'s 240ms is spent on a row the user has finished looking at.
- **The two Home bands still _unmount_ rather than collapse**, and that is left alone deliberately. ADR-0120's rule is about a control that changes a list (filter, search, order) and a tick is not one; with the hold, the vanish now happens _after_ a completed beat, which is what the report asked for. Wrapping both bands in `RevealList` is separate work with its own backlog line.
- **Every existing spec on all four surfaces passed untouched** — `motionDurationMs` answers 0 wherever `tokens.css` is unreadable, which is every jsdom test, so the tick stays synchronous there. That is also why `TaskTick.test.tsx` has to _stub the token_ to see the hold at all: the gap this ADR introduces is invisible to the suite by construction, and the tests that matter are the four in that file.
- **`tasks-section-paint.contract.test.ts` now reads `TaskTick.tsx` too**, and learned to see a class held in a per-variant map rather than at the `className`. Without that, moving the tick out of `TaskSection` would have made the tick's own class names invisible to the sweep that exists _because_ a tick once shipped unpainted — the same failure arriving by a new route.
- **Still open, and worse than the beat: the resting ring measures 1.21:1 in light and 1.33:1 in dark** against the 3:1 a graphic control owes — `1.5px solid var(--line)` is a 10%-alpha hairline on the surface it sits on. That is ADR-0188 §2's own device-pass question answered, and the standing candidate cause of the _first_ 2026-08-16 report (_"the first time it does nothing"_): a control you cannot see is one you aim at badly. Not fixed here because it is a token decision and `--line` has ~200 consumers that are genuinely hairlines. **A beat cannot rescue it** — motion is seen once, the resting state is seen on every row of every list.
- **Three numbers are feel and stay controls in the mockup rather than decisions here:** the hold (240ms), the pop's 14%, and whether a drawn ✓ on a 26px disc reads at all under a thumb. The mockup carries a ×3 slow motion for judging them, and it moves the tokens themselves so its measurement table reports the slowed values instead of hiding a multiplier.

## Revisit when

A second surface wants to sequence something on a beat — the hold is `TaskTick`'s private arrangement today, and two callers doing it would make it the family's business.
