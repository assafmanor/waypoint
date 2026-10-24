---
date: 2026-08-17
kind: design session
surface: tasks — the completion control
status: designed, not built
mockup: mockups/a-tick-that-is-seen-v1.html
---

# A task's tick gets a beat, and the row waits for it

The owner's ask, in two rounds:

> please design a nice tick animation for the task rows (in the tasks and the home
> screens). Lets mockup some options

and then, after the first render:

> I want more exciting animations! You're an expert designer. I want some playing
> with the tick sign

Deliverable: [`mockups/a-tick-that-is-seen-v1.html`](../../mockups/a-tick-that-is-seen-v1.html),
Proposed. Nothing is built. No ADR yet — the options want an answer first, and the
mockup is what the answer is given against.

## What reading the code changed, before anything was drawn

**The tick has no motion at all today**, and not by a decision that was taken:
`ui/tasks.css` swaps `::before`'s background to `--ok` and flips the ✓ from
`opacity: 0` to `1` on `[aria-pressed='true']` — no `transition`, no `animation`,
no token. So there was nothing to tune, only something to write.

**And on every surface the ask names, the row leaves in the same frame.** This is
the finding that reordered the work, because it makes "which flourish" the second
question:

- **The tasks screen** — `taskMatchesFacet` (`lib/tasks.ts:169`) returns `false`
  for a settled task under _both_ open facets, so `RevealList` collapses the row
  over `--t-base` — the same 240ms a beat would take, on the same easing, in the
  opposite direction.
- **Trip Home's band** — `TripHomeTaskBand` maps an open-only list and neither
  Home band goes through `RevealList`. The row does not collapse; it **unmounts**.
- **Plan Home** — the same row moves into the collapsed `הושלמו` drawer.

The only surface where a ticked row stays put is a **host section**
(`HostTasks`), which keeps it with `.tsk-settled`. That is the one place today's
instant swap is even seen.

So the deliverable is a **pair**: a beat, and a **hold**.

**The hold already exists.** `lib/one-shot.ts`'s `playBeat(el, beat, token)`
returns _"the duration it will take, in ms — 0 when nothing will animate, which is
what lets a caller sequence something after it without asking twice"_. That is the
hold, already written, already 0 under reduced motion, already keyed to the token
the CSS reads. The proposal is a **fourth `BEAT`**, not a mechanism (root rule 8).

**And it has to be `playBeat` rather than a CSS rule on the state.** A rule keyed
on `[aria-pressed='true']` cannot tell "just ticked" from "arrived already done",
so the `הושלמו` facet, the Plan drawer and every host section would play the beat
on _every_ settled row at mount. That is ADR-0140 §6 ("a transition is answered, a
status is not decorated") and §7 ("reading a per-arrival fact live instead of
latching it"), one control over. §3 of the mockup renders the failure beside the
latched version.

## The method, because a still image cannot judge motion

Every option is drawn twice: a live tick, and a **filmstrip** — the same control
frozen at seven sampled times through `animation-play-state: paused` plus a
negative `animation-delay`. The browser samples the real curve at that instant, so
the strip _is_ the animation rather than a drawing of it. That is also what made
the next two findings possible.

## The two measurements that produced the loud half

The first render answered the second round of the ask with numbers rather than
taste — the quiet options could not have delivered "exciting", rather than merely
being modest:

- **The ✓ under `--ease-standard` is 61% drawn at 60ms of 240**, and spends its
  last 120ms crawling through the final 12%. `cubic-bezier(.2,0,0,1)` is a
  decelerate: right for an object arriving, wrong for watching a pen move. A
  draw's timing therefore belongs in `linear` with keyframe offsets — which is
  `lib/one-shot.ts`'s own rule 2, for the same reason.
- **`--ease-arrive`'s overshoot peaks at scale 1.0028 — 0.073px on a 26px disc**,
  a fifth of a device pixel. The app's only overshooting curve is deliberately "a
  nudge past the mark, not a bounce"; that reads on a sheet and is not measurable
  on a tick. **Liveliness cannot be bought with an easing at this size.** Every
  loud candidate is therefore `linear` with real interior stops, exactly how
  `.is-nudging` and `.is-rebuffing` are already written.

Both are in the mockup's measurement table, sampled off off-frame probes on every
control change, so they stay readings rather than sentences.

## The options

Three quiet, four that play with the mark. All on the shipped 26px ink, all from
the time ramp, none adding a colour, none growing the row or the 44px target,
none looping.

|              |                               |                                                                                                                                              |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **ב** המשיכה | the ✓ is drawn                | the honest reading of a stroked path with round caps                                                                                         |
| **ג** החתימה | disc + mark settle            | the one that uses `--ease-arrive`, and the one the 0.073px measurement undercuts                                                             |
| **ד** המילוי | `--ok` floods from the centre | the flood layer exists only during the beat                                                                                                  |
| **ה** הקפיצה | **the recommendation**        | squash in, overshoot **3.408px** measured, settle; ✓ draws through it. One keyframe, no extra element, peaks at 29.6px inside the 44px box   |
| **ו** ההיפוך | the ink turns like a coin     | the fill switches as a **step** at the halfway point, and the mark deliberately does not ride the rotation — at 180° a ✓ is a mirrored glyph |
| **ז** הזריקה | lands askew, straightens      | the overshoot is an **angle**, the one channel legible at 15px                                                                               |
| **ח** הרפאים | a ghost of the ✓ flies off    | the loudest, and the only permanent cost: a second `<Icon name="check">` at every tick forever                                               |

**Rejected and drawn nowhere: the expanding ring / ripple.** A ring out of a
control is the "pulse means live" vocabulary (design-language), and even one-shot
it reads as "something is still happening" at the moment something _finished_. A
ghost of the glyph is the glyph's own vocabulary; a ring is the board's.

**Rejected: the beat on the `<button>`.** A CSS animation outranks author normal
declarations, so a `transform` there would beat `tokens.css`'s app-wide
`:active { transform: scale(var(--press-scale)) }` and take the press
acknowledgement away for the beat's whole duration — with the finger still down.
The beat sits on `::before` and the mark.

**Rejected: `animationend` as what removes the class.** Already rejected once
inside `lib/one-shot.ts`; quoted in the mockup so it is not written a second time.

## Round two — the owner took ה, and corrected two things

> Looks very good and I take your recommendation. Two issues: Unticking shouldn't
> use the same animation if any, it should be much more minimal I think.
> Ticking/unticking still leaves the checkbox selected (with a small outline) — we
> should get rid of it

Both correct, and the second closes a report the app had already failed to
reproduce once.

### Un-ticking gets no beat at all

The first draft had it exactly wrong: it reused `is-ticking`, which on an open
control plays the **open state's entrance** — the pop, in reverse. Un-ticking is a
**correction, not an achievement**. It now gets no beat, no hold and no keyframe:
the fill drains and the mark fades over `--t-quick` on `--ease-exit`, the curve the
app already uses for a glow extinguishing.

**And the asymmetry is one rule rather than a flag, because a transition is read
from the DESTINATION state's computed style.** Declared on the _open_ state, it
governs done→open and is simply absent on open→done, where the beat's keyframes do
the work — so nothing has to know which direction it is going, and the beat stays a
pure entrance. Measured: **0.14s on the open state's disc, 0s on the pressed
state's**. (First measured wrong, worth knowing: reading `transition-duration` off
the _button_ reports `0s` for both, because the transition is declared on
`::before` — the rule looked broken and was not.)

### The lingering outline is `:hover`, and `:focus-visible` is innocent

Two candidates, so it was **probed in a real browser** rather than reasoned about:

- `:focus-visible` is matched by **neither** a mouse click **nor** a tap. The focus
  ring is not involved and stays exactly as it is — a keyboard user needs it.
- `:hover` **persists after a tap**: true after the first, still true after the
  second, cleared only by tapping something else.

And the shipped rules make that stuck state say something **false**:
`.tsk-tick:hover .icon` is `opacity: 0.4` and `:hover::before` borrows `--ok`, so an
**open** tick sits there wearing a ghost ✓ inside a green ring. §6 renders it beside
two untouched rows in the same card and it is indistinguishable from done at a
glance.

**This is the 2026-08-16 report that "did not reproduce"** — _"when clicking again
it still stays marked (not ticked, just an outline)"_. That session drove taps and
read `aria-pressed` and the fill, both of which were correct the whole time, which
is precisely why it found nothing. **The general lesson, since it will recur: a
report about a control's appearance after an interaction is not answered by
asserting its state.** The state was right and the paint was lying.

Repair, two parts:

1. The hover stops borrowing the done state — a ring that lifts towards the ink,
   never `--ok`, and never the mark. On a phone there is no hover to acknowledge
   anything, so that hint was always mouse-only (ADR-0017).
2. Gated on `@media (hover: hover) and (pointer: fine)` so it cannot stick at all.
   **This is the app's first such query**: ~40 unguarded `:hover` rules, zero
   `@media (hover:`. The sweep is a separate backlogged pass — not a thing to take
   silently inside a motion change (rule 8's "ask before the larger change"). The
   tick is done here because its hover is the one that borrows a **status** colour
   and the state's own glyph; most others lift a background a few percent, so a
   latched one merely lingers as a highlight.

One specificity trap recorded, because the obvious spelling of the fix is wrong:
`.tsk-tick:hover .icon` and the shipped `.tsk-tick[aria-pressed='true'] .icon` are
**both (0,3,0)**, so an unscoped override sitting later in the sheet wins on a
hovered **done** tick and takes its ✓ away. Hence the two `:not([aria-pressed='true'])`s.

## A shipped defect the render exposed, and it is not about motion

**The OPEN tick's ring measures 1.21:1 in light and 1.33:1 in dark** against the
3:1 floor a graphic control owes. It is `1.5px solid var(--line)` on `var(--card)`
— a 10%-alpha hairline on the surface it sits on, composited before measuring
(reading the rgba directly is how a hairline measures as if it were opaque).

That is a **measured answer to ADR-0188's own open device-pass question**,
_"whether a 26px ring reads as pressable under a thumb"_: at 1.2:1 it barely reads
as anything. It is also the standing candidate cause of the two tick reports that
did not reproduce (backlog, 2026-08-16 — _"when you click on the circle the first
time it does nothing"_): a control you cannot see is a control you aim at badly,
and the session that chased those reports fixed a 3px gap without ever measuring
the ring itself.

**Not fixed here.** The repair is a token decision rather than a motion one, and
`--line` has ~200 consumers that are genuinely hairlines; the same question also
applies to `SettleControl` and every other outlined control, so it wants one pass
rather than a one-off at the tick. On the backlog with the number attached. A beat
cannot rescue it: motion is seen once, the resting state is seen on every row of
every list.

## Owed at build time, recorded rather than decided

- **Extract `TaskTick`.** The tick's `<button>` is hand-copied at three call sites
  (`IndexTasksView.tsx:474`, `TaskBandRow.tsx:48`, `AutomaticTaskRow.tsx:65`) —
  same eight lines. A beat added at one of them is a beat two surfaces do not
  have, which is the shape this feature has already paid for twice
  (`.chk-toggle`'s font, `.tsk-who-row`'s assignee).
- **The dash LENGTH goes in the beat's rule and the OFFSET in the keyframe.**
  Reversed, `prefers-reduced-motion` (which kills `animation` app-wide) renders a
  done task with **no ✓ at all**, permanently, and nothing can fail — jsdom loads
  no stylesheet. §5 draws the trap beside its safe twin.
- **The un-tick is the same class, not a reverse draw.** The fill drains at
  `--t-quick` and the mark fades; un-drawing a ✓ is an achievement played
  backwards, and un-ticking only hands the question back to the list.

## Left to a device pass — controls in the file, not decisions

Three numbers are feel and are therefore buttons: the **hold** (240ms default — is
it read as a response or as a lag), the **pop's 14%** (where "alive" turns into
"bouncy"), and whether a **drawn ✓ on a 26px disc** reads at all or only flickers.
The file also carries a ×3 slow motion for desktop judging, which moves the two
tokens themselves so the measurement table reports the slowed values rather than
hiding a multiplier.

And the second tester is not a thumb but a trip: a to-do list is pressed dozens of
times, and the beat that delights on the third press is the beat that is noticed
on the thirtieth.

## Built, same day — [ADR-0195](../decisions/0195-a-tick-is-answered-once-and-the-row-waits-for-it.md)

> I approve, write the ADR and build it, same pr

Shipped: `BEAT.TICK` in `lib/one-shot.ts`; the keyframes, the un-tick transition and the
hover deletion in `ui/tasks.css`; `ui/TaskTick.tsx` replacing four hand-copied buttons;
`TaskTick.test.tsx`. 235 files / 3961 tests green.

**Four call sites, not three.** The design note said three; `TaskSection`'s
`.tsk-tick-sec` is the fourth, and it is the one that would have been forgotten — it is the
only one that is not a `ListRow` lead. Counting them again at build time is what found it.

**The one thing the build changed about the design, and it is a deletion.** §6 drew the
hover repair as a quieter hint gated on `@media (hover: hover) and (pointer: fine)`. It
shipped as **no hover rule at all**, because it could not be verified as cheaply as it could
be dropped: the rule parsed, the media query matched, `el.matches()` confirmed the selector,
and the computed `::before` colour under `:hover` kept reporting the base value across six
probes (an isolated reproduction of the same selector pair _did_ update, so the disagreement
was never resolved). A rule nobody can measure is the same risk as a `className` with no rule
behind it, which this repo has shipped twice. It was mouse-only on a phone-primary app
anyway, so the tick loses nothing a phone ever had.

What was verified instead, in a real touch context and in the shipped sheet: an open tick
paints **identically** at rest, under a mouse hover, and after a real tap with `:hover`
latched — ring `--line`, mark `opacity: 0`. That is the report, closed and measured.

**And two readings from the shipped sheet worth keeping**, both of which looked like bugs and
were not:

- The beat's disc reads `--card` **while the animation runs** — `wp-tick-land`'s own `from`.
  It settles to `--ok`. A computed style read during an animation is the animation's value,
  not the rule's.
- `transition-duration` on the **button** is `0s` in both states, because the un-tick
  transition lives on `::before`. Read the pseudo, or a working rule looks dead.

**Left as it was:** the resting ring's 1.21:1 / 1.33:1, on the backlog. The beat cannot help
it, and it is now the most valuable thing left in this area.
