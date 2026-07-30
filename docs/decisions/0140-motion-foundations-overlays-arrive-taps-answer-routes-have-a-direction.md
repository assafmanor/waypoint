# ADR-0140 — Motion foundations: overlays arrive and leave, taps answer, routes have a direction

**Status:** Accepted (designed + built 2026-07-31, session 190)
**Design reference:** [`mockups/motion-primitives-v1.html`](../../mockups/motion-primitives-v1.html) — each gap drawn as a faithful BEFORE beside the proposal, because these are only legible by comparison.
**Brief:** [`planning/2026-07-31-session-189-motion-and-first-run-brief.md`](../planning/2026-07-31-session-189-motion-and-first-run-brief.md) (the mapping pass, G1/G2/G3).
**Amends:** [`design-language.md`](../design/design-language.md)'s "Motion & designed transitions" (two token additions, the press rule, the route transition) and [ADR-0079](0079-single-modal-primitive.md) (`Modal` gains an enter/exit contract).
**Builds on:** [ADR-0103](0103-escape-is-a-back-trigger-with-one-owner.md) §2's one-owner rule — the exit hangs off the close path that already exists rather than adding a second.
**Defers:** the receding half of the route transition (§3), and the two set-piece journeys (trip birth, the invite join) to their own ADRs.

## Context

The owner asked for the app to feel better, naming trip creation, the invite join,
and screen/overlay transitions. The mapping pass found that the premise needed
correcting: the app is **not** short of motion vocabulary. `tokens.css` carries a
real ramp, and the shipped motion is good — the Plan⇄Trip switch, the board's
power-on, the shared reveal and FLIP re-order (ADR-0120), the boot weights
(ADR-0105), the Map camera (ADR-0129).

**All of it lives inside a trip.** The five first-run surfaces — `/login`, the zero
state, `/new`, the born screen, `/join/:token` — have exactly **one** animation
between them: a single fluttering flap cell. Motion arrived with the trip surfaces;
the shell was built first and never got the pass.

So the work is not sprinkling micro-animations on a finished app. It is finishing the
shell, and fixing the primitives whose absence is felt everywhere. This ADR is the
foundations; the two set pieces build on them.

## Decision

### 1. Overlays arrive and leave (G1)

`modal.css` animated `opacity` on `.modal-overlay`, which is the **card's ancestor** —
so the scrim and the card cross-faded as one flat image and the card never travelled.
A bottom sheet that fades in place has no direction and no physics; it reads as a
screenshot swap rather than as something that came from the bottom of the screen.

And there was no exit **at all**: `Modal.tsx` unmounted its portal on the frame
`onClose` ran, so every sheet, dialog, confirm, picker and the whole search overlay
**snapped** shut. Enter-slowly / exit-instantly is the loudest "unfinished" tell an
app can have, and it was app-wide across ~20 call sites.

- The scrim moves to a **pseudo-element**, so its opacity is independent of the card's
  transform. The backdrop click stays on `.modal-overlay`, so hit-testing is unchanged.
- Each variant arrives the way its **shape** implies — which is the point of splitting
  the channels, since a single shared fade had nothing shape-specific to say:
  **sheet** rises from the edge it came from; **dialog** has no edge, so it is summoned
  in place (scale 0.96→1); **full** replaces a screen, so it arrives like one, from the
  inline-end edge on the same `--dir` sign as §3.
- **One keyframe pair per channel**, played forwards to enter and `reverse` to leave, so
  an exit cannot drift out of sync with its entrance by being written twice.
- Exit is deliberately **brisker** than entrance (`--t-quick` vs `--t-base`): you have
  already decided to leave, and matching them makes dismissal feel sluggish.
- `animation`, not `transition` — an animation fires on mount without painting a closed
  state first and flipping it a frame later, so there is no double-rAF and no
  first-frame flash.

**The exit hangs off the close path that already exists.** `onClose` was _already_ the
one owner of leaving: the backdrop calls it, the overlay stack calls it on a back, and
since ADR-0103 §2 Escape is a back trigger resolving through that same stack. `Modal`
therefore **wraps** it — plays the exit, then tells the caller — adding no second close
route. Adding one would re-create exactly the divergence ADR-0103 §2 removed.

The overlay-stack layer is peeled the moment back fires; only the pixels linger. So a
back is never delayed or swallowed by an animation, and a second back during the exit
reaches what is behind. The leaving overlay takes `pointer-events: none`.

**Children may take the wrapped close as a function.** An in-card `✕` / `ביטול` calling
the caller's `onClose` directly would bypass the exit and snap — and that control is the
most-used way out of a sheet, so leaving it un-animated would have made this half-true.
`children` accepts `(close) => ReactNode`; a function rather than a context so no call
site has to extract an inner component just to read one. `ConfirmDialog`'s cancel and
`SearchOverlay`'s back control use it. **Confirming is deliberately not wrapped** — it is
a different outcome, and its own consequence is the feedback.

### 2. Taps answer, in one press language (G3)

`tokens.css` kills the mobile tap-flash app-wide, justified **in its own comment** by
"every tappable surface has its own `:active`". That was the intent, not the state:
there were **16** `:active` rules in the entire frontend, spread across **seven**
different values (`translateY(1px)`, `scale` at .9/.92/.93/.94/.95/.97). So most
controls acknowledged a tap with nothing, and where they did, they disagreed.

Phone-primary (ADR-0017) makes this **correctness, not polish**: there is no hover state
to fall back on, so for the frame before the target appears the app had said nothing.

- One **element-level** rule, placed beside the line it makes true, so reach is
  automatic and a new button cannot forget to opt in. `:disabled` and
  `[aria-disabled='true']` are excluded; inputs are untouched.
- **Two steps**, because the **ratio** is what should read as constant, not the
  transform: `--press-scale` (0.97) for controls, `--press-scale-lg` (0.985) for card-
  and full-width-sized surfaces. A 44px icon button at 0.985 is invisible; a full-width
  card at 0.97 reads as collapsing. A large surface **overrides the var** rather than
  writing its own transform.
- All seven bespoke values converge onto the two. None is left.
- **Scale, not colour.** The app presses on a dark glowing board, paper cards, amber
  tints and violet chrome, so a colour press-state needs a per-surface table _and_ would
  spend from the semantic budget (amber = time, teal = location, violet = plan) on
  chrome. Scale composes with every surface and needs no table.
- **No global `transition`.** It is a shorthand and would clobber the per-component ones
  (`.trip-name-btn`'s background melt, among others). The press is instant both ways —
  which is what the native highlight it replaced did, and what makes a tap read as
  answered rather than eased into.

### 3. The shell's routes arrive with a direction (G2)

`.body`'s `fade` covers in-trip **tab content** only. Every full-screen `.app` surface
rendered with no entrance: `/login`, the zero state, `/new`, the born screen, `/join`,
`/trips`, both settings screens. Every transition in the two journeys the owner named
was one of these hard cuts.

- **Direction is a fact, and it comes from the navigation.** Forward and back looking
  the same carries no information, so direction rides `location.state`, stamped by
  `runStructural` on a back that moves. Never from history — ADR-0090 forbids it and
  lint blocks it. Carrying the stamp on the entry rather than in a ref is what makes it
  survive a re-render and Strict Mode's double-invoke, both of which drop a
  consume-once flag. An **unstamped navigation reads as forward**, which is the correct
  default and is why no existing call site changed.
- This gives `backSlides` its first production consumer. It was built for the ADR-0035
  return gesture and had been used only by its own tests.
- **Keyed on `pathname`**, not the whole location: a query-only change is an in-trip tab
  switch, which already has `.body`'s fade and must not get a second animation over it.
  The same key that replays the animation is what scopes it to shell navigation — no
  route list to keep in sync.
- **RTL rides the one `--dir` sign.** `translateX` has no logical form, and in RTL the
  inline-end edge is the **left** one, so a forward arrival travels negative. Forward
  comes from inline-end (the platform push, mirrored), back from inline-start.

**It is an offset and a fade, not the full-width push the brief drew — and that is a
constraint, not a taste call.** A full-width travel needs the **outgoing** screen to stay
mounted and recede under the arriving one, and React has already unmounted it by the
time the transition runs. Keeping it would mean a transition group holding two route
subtrees at once, which for this app means two trip shells alive together: two WS
subscriptions, two clocks, two snapshot fetches. Not worth one animation. Without the
outgoing node a full-width travel would reveal empty background, so the arrival is a
short offset (`--route-offset`, 28px) that fades — the same idiom as `.body`'s existing
fade + 6px, scaled up and given a direction.

`--t-base`, not the `--t-deliberate` the brief guessed: 400ms is right for a full-width
travel and sluggish for a 28px one.

**The receding half is deferred**, with its cost stated above. Revisit if a transition
group ever becomes cheap — most likely if the trip shell stops being remounted by route
changes.

### 4. Two token additions, and only two

- `--ease-arrive: cubic-bezier(0.22, 1.16, 0.36, 1)` — the only **overshooting** easing.
  The three shipped easings are monotone, so an object that should _settle_ had nothing
  to settle with and stopped dead. Mild on purpose: a nudge past the mark, not a bounce.
  Entrances of real objects only; never an exit, never a colour or opacity ramp.
- `--stagger-step: 40ms` — one unit for a staggered entrance. Cap the multiplier at the
  call site (~5) so a long list never drags, which is the ADR-0120 reveal's own rule.

Plus two support tokens that are values rather than vocabulary: `--press-scale`/`-lg`
(§2), `--route-offset` (§3), and `--dir` (the direction sign, §3).

Anything beyond these is scope creep against the ramp discipline. The budget rule stands
unchanged: exactly one `--t-cinematic` moment, the Plan→Trip switch.

### 5. Reduced motion is a correctness case

`App.css` kills every `animation`/`transition` under `prefers-reduced-motion` with
`!important`. Any state that exists only **during** an animation must therefore resolve
when there is none, or it outlives its own reason — a dismissed sheet waiting out a
140ms animation nobody is playing is a sheet still covering the screen and still holding
focus.

`lib/motion.ts` owns this. `readDurationMs` is generalized out of `App.tsx` (it was a
private one-off serving the mode switch; rule 8) and joined by **`motionDurationMs`**,
which returns **0** in two cases:

- **reduced motion** — reading the same condition that kills the CSS is what makes the
  two impossible to disagree;
- **the token cannot be read at all** (no stylesheet). `readDurationMs` answers 400
  there, which is right for its caller and wrong for this one: not knowing a duration
  means not knowing an animation is running, and guessing 400ms of held-open overlay is
  strictly worse than closing now.

When the wait is 0 the close is **synchronous**, not a 0ms timer — a dismissal landing a
macrotask later is a frame of a sheet the user already closed. This is also why the
entire existing suite still asserts a synchronous close: in jsdom there is no
stylesheet, so tests exercise the zero branch without stubbing a clock, and the animated
branch is tested by making the token readable.

## Consequences

- Every overlay in the app inherits arrival and departure from one primitive. The legacy
  families still outside it (`.sheet-overlay`, `.doc-viewer`, `.confirm-overlay` in
  `screens.css`) keep their own `fade` until they fold onto `Modal` in ADR-0079's Wave 2
  — they should ride this rather than growing private motion.
- A new tappable gets press feedback with no opt-in. A new **large** surface must set
  `--press-scale: var(--press-scale-lg)` beside its own rules; the default is the
  control step.
- A new shell screen gets its entrance from being a route. A new back action that
  navigates must stamp the direction — `runStructural` is the one place, and it is
  already exhaustive over `BackAction`.
- Motion timed from JS goes through `motionDurationMs`, not a literal and not
  `readDurationMs`.

## What this ADR does not settle

- **How it feels under a thumb.** Every number here was judged on a desktop with a
  mouse and verified by sampling computed styles mid-flight in Chromium. The durations
  are starting points and the device pass is owed.
- **The full in-app pass on the trip surfaces.** The build environment had no Docker
  daemon and no local Postgres, so the stack could not run; `/login` and a route change
  were driven in the built app, which is what confirmed the wrapper does not break
  layout and the token layer still resolves. The trip-mode surfaces, the creation
  journey and the join were **not** seen running.
- **The receding half** of §3, and whether `--ease-arrive`'s 1.16 is the right amount of
  overshoot on real hardware.

### 6. Journey 4 — the small beats, added 2026-07-31 (session 191)

Extensions of the rules above rather than new decisions, which is why they amend this ADR
instead of getting one of their own. Each answers a **transition** the app was making
silently:

- **`SyncBadge` resolves.** An optimistic write settling is a moment the user is trusting —
  they made a change, the app said "pending", the server agreed — and it was a silent glyph
  swap. One settle on `synced`, never a loop. Deliberately **not** on `pending` (a pulse
  there reads as the app straining, and ADR-0080 keeps sync state non-colour-coded on
  purpose) and **not** on `failed` (a failure needs the eye, not a flourish; the review
  sheet is what asks for action).
- **`StatusBanner` arrives.** It blinked into existence, which on a surface usually about
  connectivity reads as an alarm. It settles in from the top edge instead.
- **A chip's selection settles.** `ToggleChip` and `ChoiceGrid`. Note this is a _different
  fact_ from §2's press feedback: the press answers the **tap**, this answers the
  **outcome**, and a chip can be pressed without becoming selected (tapping the one already
  on). The card takes the gentler amount, because §2's ratio rule applies to any scale on a
  large surface, not only to presses.
- **A value that changes is seen to change** — `lib/useCountUp.ts`, introduced by
  [ADR-0143](0143-the-invite-pass-arrives-and-gets-stamped.md) §6 for the invite countdown
  and shared from the start for the rest of this class (day and member counts, Home's
  glance figures).

## Build log

**Session 190 (2026-07-31)** — built in the order the brief set out (G1 → G3 → G2), each
verified in Chromium before the next.

Two defects this session found in its own work, both worth recording because neither
would have failed a test:

1. **The `--dir` token was added by splitting the `:root` block**, which left the fonts,
   spacing, type ramp, radius, elevation, breakpoint, safe-area, sync **and** press
   tokens inside an `[dir='ltr']` selector — silently unset across an RTL app. Caught
   only because `scale(var(--press-scale))` resolved to nothing under a real cursor. The
   `[dir='ltr']` override now sits outside the block, with a comment saying why it must.
2. **`motionDurationMs`'s missing-token behaviour** started as `readDurationMs`'s 400ms
   fallback, which made 14 existing tests fail by turning every close asynchronous. The
   fix was in the source, not the tests: a duration you cannot read is not a duration to
   wait for. 1770 tests green with no test churn.

Verified by sampling computed styles mid-animation rather than by screenshotting an end
state: per-variant transforms (`sheet` translateY, `dialog` scale, `full` translateX),
the scrim animating on its own channel, `pointer-events` off while leaving, press
feedback at both steps with `:disabled`/`[aria-disabled]`/inputs excluded, the RTL/LTR
mirror off the single sign (rtl −884px, ltr +882px), and — in the built app — `.app` at
exactly viewport height with no scrollbar, the whole token layer resolving, and **no
transform left behind** after the route animation, which would otherwise have made the
wrapper a containing block for every `position: fixed` descendant.
