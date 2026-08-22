# 2026-08-22 — a day turns under a held card

Third report in two days against one gesture:

> _"I think that we need some kind of an animation or something for dragging between pages. Something that looks polished."_

Drawn in [`mockups/a-day-turns-under-a-held-card-v1.html`](../../mockups/a-day-turns-under-a-held-card-v1.html), promoted into [ADR-0116 §2c](../decisions/0116-day-aware-shelf-and-idea-target-day.md). Nothing is built; the file is the deliverable and the owner's verdict is what turns it into code.

## The brief was "add an animation" and the answer was "stop being the exception"

The app already owns a page turn: ADR-0200 §7 draws both neighbours as real day surfaces one page plus a gutter away, rides them on `--swipe-dx`, and lands them with §9b's `--t-base`/`--ease-standard`. The edge-drag day step, shipped the same morning, is **the only day change that does not use it** — it changes `activeDate` and lets React repaint.

That reframing is the whole session. The proposal's hand-written CSS is **12 lines**, and one of them is a term added to a shipped `transform`. A design session that had started from "what should the animation look like" would have drawn a progress ring and grown a component.

## Three numbers decided the design, and none of them was guessable

- **The gutter has to be crossed before any of tomorrow is visible.** `.day-peek` parks `--swipe-page-gap` (24px) _outside_ the window, so a 12px lean reveals 12px of page background and **0px** of the day it is promising. Every "small hint" design dies here.
- **Row displacement: 48px against 0px.** Leaning the whole strip moves the drop target under the finger; leaning only the incoming pane moves nothing. A drag is a targeting gesture, so that is the whole argument — and it is the one place this feature departs from §7's "the strip moves as one thing", deliberately, because during a swipe the finger _is_ dragging the strip and here nothing is.
- **The dwell is 700ms**, longer than every motion token but `--t-cinematic` (600ms), which `design-language.md` budgets to exactly one moment in the product. So the duration cannot be a token — and it should not be, because the motion must end when the day changes or it promises the wrong time. It reads `DRAG_DAY_DWELL_MS`.

`linear` then earns its place twice: it keeps the remaining time readable, and it makes the motion **samplable** — a sampled position is a sampled time, which is why the filmstrip is the real motion at 0 · 233 · 467 · 700ms rather than an artist's impression. `beats.css` had already written the same sentence for the beats.

## The render answered the one question that could have killed it

The dragged clone is a full-width row under the finger, so it covers the revealed strip **completely** across — 24 of 24px, nothing left clear. Written up like that, the design is dead.

Then the measurement was taken in the dimension that decides it: the reveal is the body's whole visible height (24 × 638px) and the clone is **one row** (68px of it). **89% of the reveal is never covered**, and the covered part still reads through `--drag-ghost-opacity` 0.78. `frontend/CLAUDE.md` warns that "a height cannot see a clip"; this is the same error mirrored, and I made it before I caught it.

## Three defects the file had while being built

Each was found by rendering, and each is recorded in the file rather than quietly fixed:

1. **The lean was added to the parked offset instead of subtracted**, so the "hint" pushed tomorrow _further_ off screen — `translateX(-400px)` where −304 was wanted. Now written as one multiplication where everything inside the bracket is a distance and only `--dir * --peek-side` carries a sign, so it cannot be got wrong again.
2. **A displacement of 378px** that was a fact about `justify-content: center`: I compared rects across frames living in different flex containers. Measured inside each frame it is 48 and 0.
3. **The striped band I drew to explain the edge was painted over the 24px reveal the file is about** — `z-index: 14` on top of the thing being proposed. A mockup hiding its own subject, and it took a screenshot to see. It is a dashed boundary now.

## A shipped defect, unrelated to the subject

`screens.css`'s `.day-peek` declares `--peek-dir: -1` (RTL) / `1` (LTR). That is `tokens.css`'s **`--dir`**, a shipped token with the same two values for the same job, documented in `design-language.md` as "the inline axis's PHYSICAL sign", already spent by `modal.css`, `form-steps.css` and `App.css` twice. I introduced the duplicate in ADR-0200 §7 the day before, in a session that reached for a new variable without looking for the existing one. The proposal's rule spends `--dir`; the duplicate goes with it when this is built.

Worth noting how it surfaced: not by reading the code again, but because the mockup's proposal had to _spend_ a direction, and the skill's rule-8 pass asks "what already does this job" about every line you are about to draw. The design stage caught a code duplicate.

## What is still open

Whether the 36px band wants any mark of its own. After §1 the question changes shape — the arriving neighbour _is_ the mark — but only a phone can say whether a first-time user finds the band at all. Same pass owns `DRAG_DAY_EDGE_PX` (36) and how much of tomorrow should show (16 · 24 · 32 · 44px, shipped at 24 as a recommendation and wired as a control).

---

## Built the same day, and the build found three things the drawing could not

The owner approved the drawing (_"approved, let's build this"_) and it shipped as drawn. Every surprise came from one fact the mockup could not model, because a mockup has no second component instance: **the peeks now mount during a drag, so a whole day screen exists three times over while one is in flight.** §7 only ever mounted them during a _swipe_, when no drag is running.

1. **A global side effect in a component-scoped teardown now has three owners.** `useSelectionGuard`'s `release` removes `body.wp-dragging` and runs from an unmount cleanup — so a preview pane going away took the class the _real_ drag was using, and the lean's stylesheet keys off exactly that class. The probe read it present at the arm and **gone one move later**. Both that hook and `useSpringLoadedDay` now stand down inside a preview, which is `state/day-preview.tsx`'s existing rule reaching two more places. The second guard matters independently: without it every mounted pane arms a dwell of its own against the shared `overDate`.
2. **`:not([data-preview])` on an ancestor does not exclude preview descendants.** The panes live _inside_ the non-preview host, so `closest('.day-swipe:not([data-preview])')` succeeds from a pane. A `[data-shelf-drop="pool"]` query matched three strips; `.first()` resolved to the pane parked off the far edge, and the finger it placed there walked the day back to the trip's first day. `:not(.day-peek *)` is the scope that holds. This is §7's own warning, one level sharper — and it cost two specs that looked green.
3. **The mount condition is `live || leaning`.** The pager's `live` cannot serve, because the pager stands down for a drag by design — its flag is false in exactly the case that needs a pane to animate. That one line is the whole reason the shipped step was silent.

And a test-shaped trap worth keeping: **an unregistered custom property computes to its token stream**, so `--peek-lean` reads back as `calc(24px + 24px)`, `parseFloat` gives `NaN`, and a `|| 0` turns the assertion into `0 === 0`. Resolving it through a probe element's `width` makes it a number the browser computed rather than one the spec parsed — and unlike reading the transform mid-transition, it needs no timing at all.

**What the build asserts:** the pane exists (the half that was missing), the host names it, its target equals gutter + reveal read from the stylesheet, the transition is the dwell and `linear`, the day still commits, and leaving the band stops the lean without turning the day. Nothing samples a frame.

---

## And then it was rejected, in one sentence that named the fix

> _"OK no you got this all wrong. Your design is very ugly, no I don't like the static 'peek' into the next/prev day."_
>
> _"We should maybe get a peek but in a more fluent way, like it starts dragging to the next day and stops and then if your finger stays then it completes the motion."_

Drawn again in [`mockups/a-day-turns-under-a-held-card-v2.html`](../../mockups/a-day-turns-under-a-held-card-v2.html), promoted into [ADR-0116 §2d](../decisions/0116-day-aware-shelf-and-idea-target-day.md), built and shipped the same day.

**The number I had and did not interrogate: 1.1px per frame.** v1's lean travels 48px over the 700ms dwell. I checked that the duration matched the dwell — which was the interesting argument, and which I got right — and never checked whether 48px spread over 700ms is a motion a person can see. It is not: 0.069px/ms is 1.1px per 16ms frame, which is a static offset with a timer attached. _"Static peek"_ was a description, not a preference. The unit that would have caught it is **px per frame**, and it is now printed for every phase in the file, in the table, where the next session cannot avoid reading it.

**The other correction is mine to record: v1's §3 was over-weighted.** It measured the whole-strip model at a 48px displacement of the row under the finger and rejected it on that number alone. The number is right and the reading was wrong — the displacement exists only while the finger is inside the band, and leaving the band unwinds it, so it is never present at the moment anyone is aiming at a chip. A cost that is absent whenever it would matter is not the cost it looks like. v2 prints both readings (48px held · 0px left) rather than one.

**A filmstrip cannot answer "is this fluent", and that is how v1 got approved.** Four still frames of a linear lean look like a motion; the motion was a creep. v2's `הרץ את התנועה` runs the real transitions on the real stylesheet, and every later mockup about motion should have one — the control is cheaper than a rejected merge.

## What the build was, and why it was small

Phase ③ was already written. `useSwipePager` owns the offset channel, both settle attributes, the timer and ADR-0200 §8's wait-for-the-arriving-page, so the work was giving it a **commanded** API — `hold(step, px)` and `turn(step)` — and having the edge call it. "A page turn can be _commanded_, not only dragged" is an extraction; the alternative was a second turn beside the first, which is the ADR-0078/0094/0095 shape this repo keeps having to undo. It also deletes v1's `--peek-lean` and the extra `transform` term it added.

Two things the build found:

1. **`useEffect(() => stop, [stop])` is an unmount cleanup only while `stop` never changes identity.** The moment it depended on the caller's command callback, it ran on **every render** and gave the lift back the instant it was taken. The evidence was a log that made no sense until it did: one `resolve` and five commands, ending on "let go". The app survived it by luck — the pager's `hold` happens to be stable — and the unit harness, which passes an inline arrow, did not. The command is read through a latest-ref now, which removes the luck rather than the symptom.
2. **An e2e that waits for a stepped day has to poll faster than the step.** §2d puts `--t-base` between a turn being _commanded_ and its day arriving, so the repeat cadence is 940ms and the next turn is already committed 240ms before the previous day appears. `expect.poll`'s default ladder (0, 100, 250, 500, 1000ms) reported 2026-08-23 at **1850ms**, with 2026-08-24 landing at **1880** — so the spec moved out of the band on the strength of a day that was already stale, and asserted the wrong one at the end. A flat 50ms interval hands the caller the whole dwell. Worth generalising: **any assertion about a repeating state has to sample faster than the repeat**, and the default ladder is tuned for states that settle.

## Still open, unchanged

`DRAG_DAY_EDGE_PX` (36) and whether the band wants a mark of its own, plus the lift distance — `DRAG_DAY_LIFT_PX` ships at 48 because that is the smallest lift that clears the 24px gutter and shows any of tomorrow, and 40/48/64/80 are wired as controls for a device pass.

---

## And then five reports at once, which were two bugs

> _"It doesn't work as expected at all: 1. After moving to a day it no longer is under the finger 2. Doesn't always move to the next or prev day 3. Hard to go back 4. The ghost disappears sometimes 5. There's a weird stutter animation where it sort of looks like it tries to complete the swipe but out of place"_

Five symptoms, two causes, and grouping them was the whole of the diagnosis: **1, 3 and 4 are the drag ghost's containing block; 2 and 5 are the turn being cancelled by jitter.** Both are written up in [ADR-0116 §2d](../decisions/0116-day-aware-shelf-and-idea-target-day.md)'s repair block, and both are now entries in `frontend/CLAUDE.md` because neither is specific to this gesture.

**The ghost's containing block, measured before it was explained.** The clone is `position: fixed` and renders inside `.day-page`, which is the element §2d translates — and a transform makes its element the containing block for every fixed descendant. So `offsetParent` went from `null` to `day-page` at the lift, and the clone left the finger: 117px down the screen, then 156px after the next turn, with the finger never moving off `y=353`. What makes this worth a note rather than a line in a changelog is that **`useSwipePager`'s own docblock had already written the trap down** — `enabled: !dragging` exists for exactly this ghost — and §2d then drove the transform from a channel `enabled` does not gate. Reading the comment is not the same as counting what is inside the box.

**The jitter, also measured.** `dx 382px` / `settling=turn`, one 1px touch move, `dx 48px`, and the day never changed. The edge re-issues its lift on every move it sees and on every auto-scroll frame, and `hold` cleared the turn's timer each time. So a re-lift is now ignored while a turn is travelling, `hold(null)` still cancels one (letting go must not leave a day arriving after the drop), and the channel is idempotent about a state it already holds.

## Two forks put to the owner about cancelling, both answered

The reports also exposed something neither the mockup nor the ADR had specified: **what cancelling costs and what it looks like.** Three moments turned out to be three different questions — withdrawing before the dwell (handled since §2c), withdrawing during the turn's 240ms (the bug above), and cancelling the whole drag after it had walked days (handled since §2b). What was genuinely missing:

- **The band had one threshold.** Enter at 36px, leave the instant depth read zero — so a finger near the boundary chattered. Now it leaves at 36 + 16, reusing the release distance the latch already spends on this axis. Not a fork; just missing.
- **Reversing cost a fresh 940ms.** Put to the owner as three options (half dwell inside a window · symmetric · instant), answered **half dwell**: `DRAG_DAY_REVERSE_DWELL_MS`, derived from the dwell, inside `DRAG_DAY_REVERSE_MS` of a step. Only the hold shortens — the lift and the turn are identical, so the two directions still look the same.
- **Whether an aborted turn should say anything.** Answered **no**: the 140ms unwind is the statement. A drag crosses the band many times in normal use, so a beat per crossing is noise — §2c's reason for refusing `BEAT.REBUFF`, which survives the change of what moves.

---

## A third round, and the diagnosis was a list of events

> _"1. After landing on the new day, there's like a second animation for switching days (that happens right around the time that the day strip changes days). 2. Moving multiple days by holding on the edge is not looking good. I'm not sure why, perhaps related to the first issue."_

They were the same issue, and the owner's hunch was right. **What made this quick was not reading the code — it was recording it.** A `transitionrun`/`animationstart` listener over a hold that stepped two days printed the whole cycle:

```
 946ms  transform on .day-page                 ← the lift
1677ms  transform on .day-page + both peeks    ← the turn
1904ms  URL ?day=2026-08-23                    ← lands
1995ms  transform on .day-page + both peeks    ← a THIRD run, 91ms later
```

That third run is the re-lift, and the log also **ruled out** the theory I would otherwise have spent an hour on: `selectDay` pushes a same-pathname URL, and `frontend/CLAUDE.md` already records a case where that restarted the shell's route animation. Nothing of the sort appears in the log — no shell transition, no beat, nothing but three transforms. A list of what actually ran costs one probe and answers "which animation" definitively, where reasoning about it produces a plausible suspect per reader.

**The fix is one sentence: a turn that began at a detent lands back at the detent.** The travel is `page + gutter + detent`, the commit rebases to the detent instead of to zero, and because that rebase is a one-page jump over a page that was swapped in the same paint, nothing moves. Holding at the edge is one motion per day now, and the surface never returns to level until the drag lets go.

**What I would not have guessed without writing it down:** the landing offset should be _read off the element_ rather than passed in. `turn()` asks what it is currently holding, which means a dragged turn still lands level with no branch and no flag — the absence of a detent is the answer. Passing it as an argument would have been a second copy of something the caller had already said, and the two would disagree the first time the lift distance moved.

## Two tests I wrote badly first, and the repo's own notes say why

Both new e2e cases passed alone and failed under two workers, and neither failure was about the app:

- The multi-day case **sampled `--swipe-dx` one frame after each landing**. That is a magnitude at a moment — the exact class this repo has three flake entries for. Rewritten to count `transitionrun` events instead: three for two days (the lift, then a turn each), where the old behaviour ran five. A count is what the owner's report is actually about, and it does not care how loaded the machine is.
- The abort case read a `boundingBox` **inside** the 240ms window it was racing, which can spend the whole of it. Every measurement moved before the window, and the poll inside it tightened to 20ms, so what is left in there is one CDP dispatch.

---

## A fourth round: the jitter was in the clock

> _"There's still some jittering happening sometimes when dragging from day to day, I think but not sure that when dragging to the next day and then moving the finger quickly to not drag to the next day again then this jitter is happening."_

The hunch was exact, and the recording of that precise gesture — land on a day, then straight out of the band — shows why:

```
2031  hold(null): dx → 0px, the lift released      painted=48
2061  transitionrun                                 painted=47   ← 30ms after we asked
2164  the surface given back                        painted=12   ← 103ms into a 140ms unwind
2178  transitioncancel, then a SECOND transitionrun  painted=12
2311  transitionend                                 painted=0
```

**`setTimeout(duration)` measures from the moment we ask; a transition measures from the frame the browser starts it.** Here that was 30ms apart — a style flush behind a main thread that had just swapped a day — so the wait expired inside the unwind, dropped the rule mid-flight, and a second transition carried the last 12px. One 140ms motion became two totalling 250ms with a velocity break at the seam.

Two things worth keeping from this:

- **The previous repair is what made it visible.** Landing at the detent means every withdrawal now unwinds from 48px, where before the surface was usually already at level. A fix that removes one motion can promote a latent race in the motion it leaves behind, and the only reason this was found in one pass is that the owner described the gesture rather than the symptom.
- **Anchor a wait to the clock the thing you are waiting for runs on.** `requestAnimationFrame` then the duration: the transition is created in the same rendering pass, so a late frame takes the wait with it, and the slack constant only covers the timer's own imprecision. All three waits in the pager moved onto it, because they are one statement — _do this once the motion has finished_. Zero duration still defers by a task rather than running inline; six unit cases exist precisely because the inline version is a different contract.

The same recording caught a **phantom animation** that had nothing to do with the jitter: the quick-unwind rule was not scoped to `[data-swiping]`, so after the pager gave the surface back, `transform` went `translateX(0px)` → none _with a transition declared_ — 140ms of animation over zero distance, after every gesture. Invisible, real, and now gone. Reading a full event log finds the things you were not looking for, which is the argument for logging over sampling.

---

## A fifth round, which undid two of my own decisions

> _"The fix didn't work. Dragging to another day and then backing away still does this weird 'going back' animation, but stays on the same day, and it comes across as super confusing."_

The previous round fixed how _smoothly_ that motion ran. The motion itself was the problem, which the report says plainly and my fix had not asked. Sampling every frame at two withdrawal timings:

| backing away                       | the page travels | the day   |
| ---------------------------------- | ---------------- | --------- |
| just after a landing               | 48 → 0           | unchanged |
| ~800ms later, inside the next turn | **247 → 0**      | unchanged |

**Two scales of one wrongness: there was an offset to give back, and giving it back looks like a page turn in reverse.** Both offsets came from decisions I had made in the two repairs before, and both are now withdrawn — the lift is spent once per stay in the band rather than once per day, and a committed turn is never rewound.

Three things worth keeping from this round:

- **I fixed the jitter in a motion that should not have existed.** The third repair's measurement was right (the wait was cut mid-transition) and its target was wrong: nobody should have been watching that unwind at all. When a report says a motion is _confusing_ rather than _rough_, the question is what the motion means, not how it runs. I read "jittering" and went to the clock.
- **The abort rule I added in the second repair was protecting a case that cannot happen.** It cancelled a committed turn so a day could not arrive after a drop had landed on the day before it — but the edge is deliberately not a drop target, so a release inside the band resolves to nothing and §2b takes the whole walk back anyway. A guard written from reasoning rather than from a reachable sequence, and it cost the loudest symptom in the whole feature.
- **Each of the four repairs removed a motion whose meaning did not match its appearance:** a lift too slow to read as motion, a clone that walked away from the finger, a second animation with no cause, a reverse with no consequence. The generalisation is not about the numbers — **a horizontal slide of a day surface resembles exactly one thing**, so every offset held between days is a promise to move it back. Hold one only while a finger is asking for it.

---

## A sixth round, and the fourth repair had fixed the wrong reverse

> _"Are you kidding? The problem still exists! What did you fix? The problem is that we 'turn back' during the animation, then it does a full animation of going back, but stays in the new day."_

Fair. The previous round removed a reverse that ended on the **same** day; the report says **new** day, and I had read past that word twice. What settled it in one pass was logging the pager's commands rather than the pixels:

```
6229  turn(1)                       the forward turn is commanded
6260  hold(-1, 48) turning=true     the finger reaches the OPPOSITE band mid-travel
6501  COMMIT step=1                 the new day arrives, correctly
7300  turn(-1)                      a full page backwards, unasked
8372  turn(-1)                      and again
```

**The hand retreating from the edge it just used is not a request to go back**, and the edge was reading the far band as exactly that. The fix is `gateEdgeStep` at a third moment: latch the band the pointer is in when a page lands, unless it is the band that produced the turn.

Three things to take from this round rather than from the diff:

- **Read the report's nouns.** "Stays in the new day" and "stays on the same day" are different bugs, and I fixed the second one twice. The frame-by-frame recording I trusted was of _my_ gesture — out of the band — not of theirs, which was back across it. When a report describes a gesture, replay the gesture, including the part that sounds incidental.
- **A command log beats a pixel log for questions of intent.** Frames tell you what moved; `turn(-1)` at 7300 tells you the app _decided_ to move, which is the thing that was wrong. Two rounds of this feature were diagnosed from pixels and one of them was diagnosed wrong.
- **The last two repairs are one class:** the drag's geometry changing without the hand doing anything — the surface sliding under a finger, then a day arriving under one. Every rule that reads a position should ask whether the position was chosen. This ADR now answers that question three times, written at three different moments, which is the tell that it should have been asked once as a principle.

---

## A seventh round: the probe was wrong, not just the code

> _"Merged and still nothing! What have you done?! Do you understand the issue?"_

A fair question after three merged PRs that did not fix what they were aimed at. What broke the loop was not a better hypothesis — it was noticing that **every probe I had written sampled `--swipe-dx`**, which is a transition's destination rather than the picture. It reads `0px` while the compositor is still carrying the page a full page away from there. Four rounds of "measured, clean" were measuring the wrong number.

Sampling the computed transform instead found it immediately:

```
6229  paint=382  says=יום 4  day=08-23     the day has committed
6248  paint=347  says=יום 4                …the page is animating BACK
6271  paint=312  says=יום 5                …now showing the day it arrived at
```

The mechanism: `hold(null)` writes the offset to 0, and the unwind rule — written to give back a **48px detent** — animates whatever distance it is handed. After a committed turn that distance is a page. So the rule is now "a page is not a detent": a release from further than the detent is the §8 swap, not an unwind.

**What this round is honest about.** The owner's own gesture is _fast, even a little, every time_, and a fast reverse does **not** reproduce this defect — it leaves the band while the turn is still travelling, where the command channel correctly does nothing. I checked that with the fix and without it, on a desktop runner and again throttled 6× to phone speed, across eight variants (both edges, card and row, one day and two). All clean. So this fixes a real full-page reverse that produces exactly the reported words, and it is not established that it is _their_ reverse.

Three process notes, and they are the point of this note:

- **Ask what the instrument measures before trusting a clean result.** A green probe against the wrong property is worse than no probe: it retires a hypothesis that was correct.
- **A count of transitions and a series of painted values are the honest assertions for a motion.** Both survive a loaded machine; a magnitude at a moment does not, and a variable does not describe the screen at all.
- **A guard that cannot fail is not a guard.** Reverting the fix and re-running is one command, and it turned an assertion I believed into 4 failures in 6 — which is also how I learned the window is timing-dependent and that the owner's timing sits outside it.

## An eighth round: the spec, the recording, and an undo nobody asked for

> _"OK not fixed, but I can explain what I want to happen. Once the moving animation starts for dragging, moving the opposite direction shouldn't cancel the operation, undo, or do any other animation. It should complete the day move and animation. Only after you're on the next day you should be able to go back, ok?"_

And then, when I said I could not reproduce it, a screen recording. Read at 12fps and then frame by frame on the day pill: **2/12 → 3/12 → 2/12.** The day goes forward and then comes back. Every sweep in the seventh round was hunting a reverse _animation_ on the day the drag had just landed on — and the defect was the wrong thing moving **correctly**: a genuine page turn, in the right direction for a request that was never made.

That is why eight variants came back clean. The instrument was looking at the offset; the answer was in the URL.

### Two consecutive windows, and the sixth repair had covered a slice of the first

- **While the page travels.** The pager has refused offset commands mid-turn since the second repair, but `useEdgeDayStep` kept resolving underneath it: a hand crossing to the far band named the day behind, and the dwell armed on it at **half** rest — the third repair's cheaper undo — so the reverse fired barely after the step landed. _Fast_ in the report is exactly "reached the far band inside 240ms".
- **After the day arrives.** The far band was live. The sixth repair latched a band the drag had drifted into, but said it **once, at the arrival**; a hand crossing a frame later read as a fresh request.

### The fix is the sentence the rest of the app already says

The first time a drag reaches the band opposite the one that just turned, while that step is still on screen, the band is latched — as if the drag had been lifted there. `gateEdgeStep`, at a fourth moment. Being there does nothing; leaving or pushing deeper means it.

Two things fell out of writing it that way rather than as a new rule:

- **The window is `DRAG_DAY_REVERSE_MS`, which already existed** to price an undo at half a dwell. It now also says an undo must be asked for — one window, two consequences — so nothing new is tunable, and outside it the far band is ordinary again. A retreat two seconds later was never this defect, and gating it would be the _"hard to go back"_ the third repair answered.
- **The sixth repair's special case is deleted.** It was this rule made at one moment instead of for as long as it holds, and its own e2e cases now pass through the general one.

### Two mechanisms I wrote and then removed

`busy` on the edge's return value, and a gate on the pill's dwell in `PlanDay` reading it — my first answer to the owner's first sentence. Both are dead on inspection: `busy` is derived from a ref, `turning()` is called from an event handler and changes no state, so nothing re-renders and every read of it at render time is `false`. Kept as written, it would have looked like a guard in every future reading of that file.

What survived from that attempt is the one line that does something: `track` records the pointer but names nothing while a turn is in flight. Removing it fails a unit case, which is how I know the difference.

### Measured both ways, and this time in the browser

`e2e/shelf-drag.spec.ts`, _"crossing to the far edge after a landing does not walk back"_: with the gate removed, the same gesture fires **two** reverse page turns in three dwells and ends two days behind where the drag put it. With it, zero, and the day stays. Eight unit cases in `useEdgeDayStep.test.tsx` fail without it too.

The process note, which is the mirror of the last round's: **when a report says a step came undone, assert the step.** Four rounds of animation probes could not see a defect whose entire signature was one `?day=` going backwards.
