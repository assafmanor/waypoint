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
