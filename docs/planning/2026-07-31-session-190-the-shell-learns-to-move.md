# Session 190 — the shell learns to move, a trip gets born, and a pass gets stamped (2026-07-31)

[ADR-0140](../decisions/0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md)
(the foundations) and
[ADR-0142](../decisions/0142-trip-birth-is-the-boards-first-departure.md) (Journey 1),
designed session 189 and built here. Mockups:
[`motion-primitives-v1.html`](../../mockups/motion-primitives-v1.html),
[`motion-trip-birth-v1.html`](../../mockups/motion-trip-birth-v1.html).
Mapping pass: the [session-189 brief](2026-07-31-session-189-motion-and-first-run-brief.md).

Session 189 mapped the motion pass and shipped the brief plus three mockups. This
session built the three systemic foundations (G1 → G3 → G2) and then the first set
piece, in that order because the set piece assembles from parts that already move.

## The premise needed correcting before anything could be built

The owner asked for micro-animations and a grander first run. The obvious reading is
"the app has no motion". It has a lot, and it is good — the Plan⇄Trip switch, the
board's power-on, the shared reveal and FLIP re-order, the boot weights, the Map camera.

**All of it is inside a trip.** The five first-run surfaces have one animation between
them. Motion arrived with the trip surfaces; the shell was built first and never got
the pass. That reframing is what turned a vague polish request into three primitives
plus one set piece.

## Four things the build learned that the design pass could not

**1. The exit had nowhere to live until #365 gave it one.** The brief assumed a
per-`Modal` close handler. Between the brief and the build, #365 made Escape a back
trigger with one owner and removed `onClose` from `useDialogFocus`. That turned out to
be the answer rather than an obstacle: `onClose` was _already_ the single owner of
leaving, so the exit **wraps** it. Built as written, the brief would have re-created
the divergence #365 had just removed.

**2. A duration you cannot read is not a duration to wait for.** Deferring `onClose`
broke 14 tests by making every close asynchronous — jsdom has no stylesheet, so the
token fell back to 400ms. The tempting fixes were a global `matchMedia` mock or 14
rewrites. The right fix was in the source: `motionDurationMs` returns **0** when the
token is unreadable, because not knowing a duration means not knowing an animation is
running. Correct in production (a failed stylesheet must still let a sheet close), and
it means the whole suite still asserts a synchronous close with zero churn.

**3. The full-width route push cannot be built.** The brief drew the arriving screen
travelling 100% while the outgoing one recedes and dims. React has already unmounted
the outgoing screen. Keeping it means a transition group holding two route subtrees —
for this app, two trip shells with two WS subscriptions and two clocks. And without the
outgoing node a full-width travel reveals empty background, so it is not degraded, it
is broken. Shipped as a 28px directional offset + fade; the receding half is deferred
with that cost written down.

**4. The shared card only needed one axis.** The mockup positioned it with
`top`/`inset-inline-start`/`width` transitions — animating layout. Measuring that both
bodies carry the same 20px horizontal padding turned it into a single-axis transform:
cheaper, on the compositor, and the width interpolation disappeared entirely.

## Two defects this session introduced and caught

Both are recorded because neither would have failed a test, and one is now a rule in
`frontend/CLAUDE.md`.

**The `:root` split.** Adding `--dir` by closing `:root` early and opening `[dir='ltr']`
left the fonts, spacing, type ramp, radius, elevation, breakpoint, safe-area, sync
**and** press tokens inside the LTR selector. The app is RTL, so half the token layer
was silently unset. Nothing in 1770 tests could see it — jsdom loads no CSS. It
surfaced because a browser probe of the press feedback reported `scale=1` on every
element: `scale(var(--press-scale))` with an undefined var is an invalid transform.
**A variant block goes after the `:root` block, never inside it.**

**The press value that read as collapsing.** `.wp-idx-tile` shipped at `scale(0.97)`,
which the two-step rule classifies as the _control_ value. A full-width card-shaped
button at 0.97 does not read as pressed, it reads as collapsing — so it moved to
`--press-scale-lg`. The ratio is what should stay constant, not the transform, and
that is the whole reason there are two steps.

## What the seven values say about the codebase

G3 was mapped as "taps acknowledge nothing". The build found the sharper version:
16 `:active` rules across **seven** different values — `translateY(1px)` in the
feedback family and the sync sheet, and `scale` at .9, .92, .93, .94, .95 and .97
elsewhere. Press feedback was not merely missing, it was _inconsistent where it
existed_ — the ADR-0078/0079/0094/0095 pattern again. All seven converge onto two
tokens; none is left. Ten now-dead `.draft`/`.born-card` rules went with Journey 1 for
the same reason.

## Verification, and what is still owed

Verified by sampling computed styles **mid-animation** in Chromium rather than
screenshotting end states — an end state proves nothing about whether an animation ran.
Per-variant overlay transforms, the scrim on its own channel, `pointer-events` off
while leaving, both press steps with `:disabled`/`[aria-disabled]`/inputs excluded, the
RTL/LTR mirror off the single sign (rtl −884px, ltr +882px), and in the built app:
`.app` at exactly viewport height with no scrollbar, the whole token layer resolving,
and no transform left behind after the route animation.

**Journey 1's sequence has NOT been watched.** No Docker daemon and no local Postgres,
and stubbing auth well enough to reach `/new` in a real browser was not achieved inside
the session — several attempts are in the transcript. The choreography is covered by
nine component tests (beat order and their own offsets, the skip landing every beat,
the skip unmounting so it cannot swallow the copy tap, reduced motion reaching the same
outcome, the flaps carrying the trip's real departure, the in-place copy confirm, and
that exactly one card exists rather than two cross-fading) — but nobody has seen it run,
and no test answers how it feels. **That is the next thing owed, and it is the one that
can still find a defect the tests cannot**, as ADR-0121's build log kept proving.

## Journey 2, and two more findings (same session)

The invite join shipped too ([ADR-0143](../decisions/0143-the-invite-pass-arrives-and-gets-stamped.md)),
and it produced the sharpest lesson of the session twice over.

**The tests found a real bug in the mechanism they were written for.** `JoinTrip` had no
test file at all — the same gap session 186 found on `CreateTrip`, on the _other_
first-run surface. Its first tests immediately caught that arming the tear and the
handoff timers together stranded the user on a torn pass forever: advancing to `torn`
re-runs the effect, and its cleanup cancelled the pending navigation. That is twice in
one session that writing the test for a new state machine found the defect rather than
confirming its absence.

**And my own mockup was wrong twice, in ways only the build could see.** It stamped the
pass in **teal**, which ADR-0028 reserves for location — being admitted is a _status_, so
`--ok`/`--miss`. And it drew the refused trip struck through, which assumes a preview the
API does not return for a dead code: `fetchInvitePreview` is what failed, so there is
nothing to draw. A motion mockup can be right about every beat and still be wrong about
what data exists.

## Then the device pass landed, and it was worth every word spent predicting it

The owner opened `/new` on a real phone. **The shared card was floating over the
destination and date fields.** The cause was mine and it was lazy: the card is absolutely
positioned, so its resting `top` must be measured — but the born slot does not exist
during the form phase, so rather than solve that, the build invented
`--birth-card-top: 118px` and never set it.

**1803 tests passed with the card in the wrong place**, because jsdom reports every rect
as zero. No unit test on this codebase can see a layout defect. Everything above about
"the sequence has not been watched" was not modesty — it was the actual risk, and one
screenshot cashed it in.

Fixed by measuring the position every phase from whichever slot that phase owns, and
making the travel a WAAPI FLIP. Recorded in ADR-0142's build log, where the defect was.

## Next

Journey 4's micro-beats — `SyncBadge` resolving, `ToggleChip`/`ChoiceGrid` selection,
`StatusBanner` arrival, and the remaining value counts now that `useCountUp` exists. Plus
two named follow-ups: the **removed-member** refusal must not reuse the expiry stamp, and
Journey 3's `IconPicker`/`TimePicker`/`ZonePicker` still bypass `Modal`, so they missed
G1's enter/exit.
