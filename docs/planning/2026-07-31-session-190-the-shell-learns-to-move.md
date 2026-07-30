# Session 190 — the shell learns to move (2026-07-31)

[ADR-0140](../decisions/0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md),
designed and built. Mockup: [`motion-primitives-v1.html`](../../mockups/motion-primitives-v1.html).
Mapping pass: the [session-189 brief](2026-07-31-session-189-motion-and-first-run-brief.md).

Session 189 mapped the motion pass and shipped the brief plus three mockups. This is the
first build phase: the three systemic foundations (G1 → G3 → G2), in that order, because
the two set pieces then assemble from parts that already move correctly.

## The premise needed correcting before anything could be built

The owner asked for micro-animations and a grander first run. The obvious reading is
"the app has no motion". It has a lot, and it is good — the Plan⇄Trip switch, the board's
power-on, the shared reveal and FLIP re-order, the boot weights, the Map camera.

**All of it is inside a trip.** The five first-run surfaces have one animation between
them. Motion arrived with the trip surfaces; the shell was built first and never got the
pass. That reframing is what turned a vague polish request into three primitives.

## Three things the build learned that the design pass could not

**1. The exit had nowhere to live until #365 gave it one.** The brief assumed a per-`Modal`
close handler. Between writing the brief and building it, #365 made Escape a back trigger
with one owner and removed `onClose` from `useDialogFocus`. That turned out to be the
answer rather than an obstacle: `onClose` was _already_ the single owner of leaving, so
the exit **wraps** it and adds no second path. Had the brief been built as written, it
would have re-created the divergence #365 had just removed.

**2. A duration you cannot read is not a duration to wait for.** Deferring `onClose`
broke 14 existing tests by making every close asynchronous — jsdom has no stylesheet, so
the token fell back to 400ms. The tempting fix is a global `matchMedia` mock or 14
rewritten tests. The right fix was in the source: `motionDurationMs` returns **0** when
the token is unreadable, because not knowing a duration means not knowing an animation is
running, and holding a dismissed overlay open for a guessed 400ms is strictly worse than
closing now. That is correct in production (a failed stylesheet must still let a sheet
close) _and_ it means the whole suite still asserts a synchronous close — 1770 green,
zero test churn, with the animated branch tested by making the token readable.

**3. The full-width push cannot be built, and the reason is worth writing down.** The
brief drew the arriving screen travelling 100% while the outgoing one recedes 22% and
dims. React has already unmounted the outgoing screen by the time the transition runs.
Keeping it means a transition group holding two route subtrees — for this app, two trip
shells with two WS subscriptions, two clocks and two snapshot fetches. And without the
outgoing node a full-width travel reveals empty background, so it is not merely
degraded, it is broken. The arrival is a 28px offset that fades. The receding half is
deferred, not forgotten.

## Two defects this session introduced and caught

Both are recorded because neither would have failed a test, and one of them is now a
rule in `frontend/CLAUDE.md`.

**The `:root` split.** Adding `--dir` by closing `:root` early and opening `[dir='ltr']`
left the fonts, spacing, type ramp, radius, elevation, breakpoint, safe-area, sync **and**
press tokens inside the LTR selector. The app is RTL, so half the token layer was
silently unset. Nothing in 1770 tests could see it — jsdom loads no CSS. It surfaced
because a browser probe of the press feedback reported `scale=1` on every element:
`scale(var(--press-scale))` with an undefined var is an invalid transform, so nothing
moved. **A variant block goes after the `:root` block, never inside it.**

**The press value that read as collapsing.** `.wp-idx-tile` shipped at `scale(0.97)`,
which the two-step rule classifies as the _control_ value. A full-width card-shaped
button at 0.97 does not read as pressed, it reads as collapsing — so it moved to
`--press-scale-lg`. The ratio is what should stay constant, not the transform, and that
is the whole reason there are two steps rather than one.

## What the seven values say about the codebase

G3 was mapped as "taps acknowledge nothing". The build found the sharper version: there
were 16 `:active` rules across **seven** different values — `translateY(1px)` in the
feedback family and the sync sheet, and `scale` at .9, .92, .93, .94, .95 and .97
elsewhere. So press feedback was not merely missing, it was _inconsistent where it
existed_, which is the ADR-0078/0079/0094/0095 pattern again: a shared need served by
per-call-site copies that drift. All seven converge onto two tokens; none is left.

## Verification, and what is still owed

Verified by sampling computed styles **mid-animation** in Chromium rather than
screenshotting end states — an end state proves nothing about whether an animation ran.
Per-variant transforms, the scrim on its own channel, `pointer-events` off while
leaving, both press steps with `:disabled`/`[aria-disabled]`/inputs excluded, the RTL/LTR
mirror off the single sign (rtl −884px, ltr +882px), and in the built app: `.app` at
exactly viewport height with no scrollbar, the whole token layer resolving, and no
transform left behind after the route animation.

**Still owed, and stated plainly:** the build environment has no Docker daemon and no
local Postgres, so the stack could not run. `/login` and a route change were driven in
the built app; the **trip-mode surfaces, the creation journey and the join were not seen
running**. And no probe can answer how any of this feels under a thumb — the durations
are starting points.

## Next

Journey 1 (trip birth) and Journey 2 (the invite join), each with its own ADR, on
`motion-trip-birth-v1.html` and `motion-join-v1.html`. Both now have working overlay
motion and a route transition to build on, which is why they were ordered last.
