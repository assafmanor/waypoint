# 2026-08-16 — Plan Home stops saying "all done", and the prep hero lifts

**Type:** product + design session. **Output:** [ADR-0193](../decisions/0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md), [`mockups/the-plan-hero-lifts-and-the-checklist-counts-everything-v1.html`](../../mockups/the-plan-hero-lifts-and-the-checklist-counts-everything-v1.html), an in-place supersede banner on [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) §H. **Nothing built.**

## The report

One owner message, two asks:

> _"The home readiness should also show non automatic tasks. Maybe tasks that aren't due soon could be collapsed idk, but at least show something, because right now it says all done where it isn't true - that's misleading."_
>
> _"Also we should create a lifted plan hero for upcoming tasks."_

## What reading the code changed before anything was drawn

Five findings; four of them moved a section, and two are defects the report did not mention.

1. **Plan Home already renders manual tasks.** The report reads as "tasks are missing from this screen" and the truth is narrower and more useful: the screen's list comes from `tasksDueSoon`, whose predicate requires `task.dueAt` and admits only overdue or within `TASK_BAND_LOOKAHEAD_DAYS` (7). Two classes are invisible — **undated**, and **more than a week out**. The window is Trip Home's, and `tasks.ts`' own docstring says why it exists there: _"the right rule for a band you read ON the day."_ Plan Home is the screen whose countdown reads `בעוד 47 ימים`.

2. **The open half and the completed half have never asked the same question.** `completedManual` filters `isManual && isSettled` with no date window at all. So an undated task is invisible while open and appears under `הושלמו` the moment it is ticked. This is what makes widening the window the only _consistent_ repair rather than one option among several — it is the open half that is the outlier.

3. **The reported sentence is `converged.length === 0`.** Not a copy problem: the condition is exactly "no live check and nothing due within a week", which a well-prepared trip with a to-do list satisfies constantly.

4. **`.tsk-more` has no CSS rule.** `TripHomeTaskBand.tsx` renders `<button className="tsk-more">` as its overflow row; nothing in `frontend/src/**/*.css` defines it and `App.css` has no global `button` reset. Trip Home's `עוד N משימות` is a bare UA button, measured at **19px** against the 44px floor. Found while looking for geometry to reuse for §3's row — there was none to reuse.

5. **ADR-0160 §H already contained the answer to the second ask.** §H refused the plan lift on structure (_"what it summarises … is the checklist rendered immediately beneath it"_) and wrote its own revisit condition: _"when Plan's hero summarises something it does not show inline"_. Fixing the first report creates that condition. So the two asks are one change, and §H is superseded by its own clause rather than against it.

## The forks put to the owner, and the answers

| Fork                                     | Answer                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the readiness % count manual tasks? | **Two numbers** — the bar keeps the five checks, a second readout names tasks. _"Let's think of the exact phrasing and the design of this."_                                                                                                                                                                                                             |
| What does the inline list show?          | **Urgent + checks inline, the rest in a collapsed group** (the owner's own suggestion in the report).                                                                                                                                                                                                                                                    |
| What does the lift open onto?            | **The full run-up: checks + every open task, banded by deadline.**                                                                                                                                                                                                                                                                                       |
| The lifted card's skin                   | Initially _"not sure, mockup both options, give your recommendations"_ → after seeing them: **"Definitely all violet. Maybe add some gradient that makes it become darker or something."** → against that drawing: **"Much much much more gradual, and like violet to dark violet"** · **"the gradient should be much more subtle, much more gradual."** |

The skin took **three** rounds and each one changed the technical answer, which is the part worth recording.

1. The session recommended the _other_ option — a violet head over the board's ground — on a measured argument: `--on-dark-dim` is 2.02:1 on light-mode `--plan-surface`, so a violet body appeared to need its own white-alpha ink ramp (four overrides, and a new ink family ADR-0158 §3 would want tokenised).
2. The owner chose violet and supplied the fix: **take the ground down instead of taking the ink up.** On a flat deep violet the shipped `--on-dark-*` ramp clears AA untouched, and the four overrides vanish. Cost: one surface token. This looked like the end of it.
3. Then the owner saw the drawing: the darkening resolved in 44px, which is an **edge**, not a gradient — and an edge at the head/body join is the one place a card claiming to be one object cannot have one. Making it gradual **reverses step 2's conclusion**: a ramp's top _is_ bright violet, so a cool grey cannot survive the upper half however deep the bottom gets. White-alpha does, because it composites toward the ground rather than fighting it.

So the ink question was decided by the _shape_ of the gradient, not by the colour of the ground — and neither of the first two rounds could have got there, because both were reasoning about a single flat value. The final cost is one surface token plus **a name for an ink ramp `.prep` has always had**: six white-alpha literals scattered through `screens.css`, which ADR-0158 §3 says should have been tokens all along. Collecting them retires six literals rather than adding four.

## What the render found that reading could not

- **The contrast harness was wrong four times, and every wrong answer was plausible.** (a) Stopping the ancestor walk at the first non-transparent background read a **16%-alpha pill fill as opaque salmon** → 1:1. (b) A gradient ground has no `background-color`, so the walk went past the card to the light page: the _rejected_ skin reported **3.36:1** when it is **5.02** — the measurement was one run away from rejecting the right option for the wrong reason — and near-white ink on deep violet reported **1.06:1**. (c) A translucent ink was read as opaque. (d) Once the ramp became long, **any single stop was the wrong answer too**: the last stop flatters every row near the top, the first flatters none. The harness now composites alpha in both directions and **interpolates a `180deg` gradient at the subject's own vertical position**. That last one is the reusable part — when the ground under a list is not one colour, a single contrast number is a choice about which row to flatter.
- **Chrome drops `180deg` from the computed `background-image`,** because `to bottom` is the default direction. A regex requiring it matches the authored string and never the resolved one, so the interpolator silently fell back to a single stop.
- **The gradient's own selector was wrong, and it presented as a design failure.** `[data-skin='b'] .prep-lifted` is a _descendant_ selector and `.prep-lifted` is the element carrying the attribute — so it matched nothing, the card had no background at all, and every ink measured ~1.05:1 (white on the white page). It read as "the design fails contrast", not as "the rule does not apply".
- **A CSS comment closed early and silently disabled the token.** Prose inserted after a `*/` left the `:root { --plan-surface-3 }` block unparsed. Same class of failure as above: nothing errored, the page rendered, and the symptom was a plausible-looking bad ratio.
- **`--on-plan-faint` is 0.80 because 0.76 measured _exactly_ 4.5:1** on the top band label. Passing by nothing is not passing — one nudge to a stop position and it fails.
- **The overdue pill could not be red ink.** On the head's bright violet a tinted chip with `#f0a09b` (7.82:1 on the board, borrowed) measures **1.94:1**. `tokens.css` already prescribes the way out — `--miss` is a **fill**, `--miss-deep` is the ink — so the pill inverts to solid `--miss` with white ink: **5.74 / 13.87**.
- **Dark mode passes the probe.** `--on-dark-faint`/`-dim` on the _undarkened_ `--plan-surface` measure 4.04 / 5.63 in dark and 1.45 / 2.02 in light. A dark screenshot of the naive violet card is entirely healthy-looking. That is the **third** time this exact pattern has decided a question in this area (ADR-0160 §U's deadline inks, ADR-0158 §15).

## Deliberately not decided here

- **Nothing is built.** This is design; the build is its own phase and gets its own PR.
- **The lift's motion character** is inherited wholesale from ADR-0160 (measured FLIP off the collapsed box, the swing, the landing beat). Nothing about it is re-opened, and the mockup draws every hero **at rest** for the same reason `hero-horizon-v1` did.
- **`BEAT.REBUFF`'s fate.** §H put it back for `.prep` and this retires that consumer. Whether the beat itself leaves `lib/one-shot.ts` depends on remaining claimants and is a build-time check, recorded in ADR-0193's Consequences rather than guessed here.
- **The `.tsk-more` repair** is named and drawn but belongs to the build; it is on the backlog beside the rest.
- **Every pixel number is webfont-dependent and none has been seen on a device.** The one to re-check first is the lifted card at **543.8px** against a 640px screen.
