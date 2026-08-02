# ADR-0144 — The anchored panels arrive and leave, and the exit machine is shared

**Status:** Accepted (built 2026-07-31, session 191)
**Builds on:** [ADR-0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) §1 — this closes the two surfaces its overlay work could not reach.
**Related:** [ADR-0103](0103-escape-is-a-back-trigger-with-one-owner.md) §2's one-owner rule, which is why each panel's exit wraps its existing close rather than adding a second.

## Context

ADR-0140 gave every overlay an arrival and a departure through the one `Modal`
primitive. Two surfaces were left snapping shut, and they are exactly the two that
**deliberately do not go through `Modal`**: `IconPicker` and `TimePicker`.

That is not an oversight in their design. They are **popovers anchored to their trigger
inside a form**, not layers over the screen — the same distinction ADR-0121 §5 draws for
`SnapSheet`, which is a pane _of_ a screen rather than a layer _over_ it. Routing them
through `Modal` would take them out of the flow they belong in and give them a scrim they
should not have. `frontend/CLAUDE.md` already names them as the shapes that need a
deliberate `useBackLayer` for the same reason.

So the fix is not "fold them onto `Modal`". It is to share the **mechanism** without
sharing the shape.

## Decision

### 1. The exit state machine is a hook

`useExitTransition(onClose)` — extracted from `Modal`, now used by all three. It holds the
node, plays the exit, then hands back to the caller. Three consumers of one behaviour is
what a hook is for, rather than a third copy of the timer (rule 8).

Each panel wraps **its own existing close**: `IconPicker`'s three exits (the back layer,
an outside tap, picking a glyph) and `TimePicker`'s `close`, which the backdrop, the back
layer and a commit all already called. No second close path is introduced anywhere, which
is what ADR-0103 §2 exists to protect.

### 2. An anchored panel unfolds from its edge

It neither rises like a sheet nor scales uniformly like a dialog — **both would lie about
where it came from**. A sheet's rise says "I came from the bottom of the screen"; a
dialog's scale says "I have no location". An anchored panel has a very specific location:
the control it is attached to.

So it is a **Y-axis scale from `transform-origin: top center`** — it unfolds from the edge
it hangs off. The time panel scales rather than animating `height`, because animating
height would reflow the form on every frame.

Exit is briefer than entrance (`--t-quick` / `--t-base`), as everywhere else.

## Consequences

- Every dismissible surface in the app now animates out. The legacy families still outside
  `Modal` (`.sheet-overlay`, `.doc-viewer`, `.confirm-overlay`) remain the exception and
  should ride `Modal` when they fold on in ADR-0079's Wave 2.
- A new anchored panel takes `useExitTransition` and the `panel-open` keyframe; a new
  overlay gets its motion from `Modal` and needs nothing.

## Amended 2026-08-02 — the panels' exits never ran either

`IconPicker` and `TimePicker` share `panel-open`, played `reverse` on `.is-closing`.
That does not animate: the same `animation-name` retargets the running animation rather
than starting a new one, so it keeps its current time, is already past the new duration
by the time a panel closes, and `fill: both` paints the reversed end state on the first
frame. Both rules now use a `panel-close` of their own.

Nothing about this ADR's **design** changes — an anchored panel still unfolds from its
edge, and it still shares `useExitTransition` with `Modal` rather than folding onto it.
What changes is that the fold-away now happens. Full measurements, the two reasons it
survived review, and the contract test that guards it are in
[ADR-0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md)
§8, which is where the same defect is recorded for the four `modal.css` rules.

Note the shape of it against this ADR's own Consequences, which recorded that the
extraction _"had a latent bug that only a second kind of consumer could expose"_. This is
the same lesson one level down: the bug was in the CSS technique both consumers copied,
and it took a **third** consumer — one that happened to name an exit keyframe
differently — to expose it.

## Build log

**The extraction had a bug, and putting it on a second kind of consumer is what exposed
it.** `useExitTransition` came out of `Modal`, which **unmounts** on close — so it never
needed to reset, and `closing` stayed true with the idempotence guard latched forever
after the first close. Harmless for a Modal; on a panel that persists and re-opens it
means the panel opens once and can then **never be shut again**.

It resets before handing back now. The test is named for the symptom rather than the
mechanism, because the symptom is what a future reader will be looking for.

The general lesson is worth keeping: code extracted from one consumer carries that
consumer's assumptions invisibly, and the second consumer is where they surface. This is
the second time in the motion pass that generalising something found a latent defect
rather than merely moving code.
