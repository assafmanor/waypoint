# ADR-0142 — Trip birth is the board's first departure

**Status:** Accepted (designed 2026-07-31 session 189, built session 190)
**Design reference:** [`mockups/motion-trip-birth-v1.html`](../../mockups/motion-trip-birth-v1.html) — two candidates drawn side by side, with confetti as the rejected alternative.
**Builds on:** [ADR-0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (the motion foundations — this is Journey 1 on top of them).
**Amends:** [ADR-0032](0032-minimal-trip-creation.md) (the two screens become one component) and [`design-language.md`](../design/design-language.md)'s cinematic budget — by **not** spending a second cinematic moment, which is the point of §2.
**Defers:** Journey 2 (the invite join) to its own ADR.

## Context

`submit()` succeeding was a React state swap: indigo shell chrome became plan-violet
`.born-*` chrome, a static 🎉 and an `<h1>` appeared, and nothing moved. The least
animated moment in the product, and the most significant one — the frame a trip
starts existing.

The owner asked for it to feel "much grander". The obvious route is a celebration
vocabulary: confetti, sparkles, a burst. That is the wrong answer here for three
reasons, and the mockup draws it in order to reject it: it bolts a **second metaphor**
onto an app that already has one; it spends the one-loud-element ration **twice**,
because the thing it would sit on top of is already the loudest surface the app owns;
and it reads as generic where the app's own vocabulary reads as this product.

## Decision

### 1. The two screens are one component, so the moment is a transition

`CreateTrip` and its `Created` screen become a single `.app` root with one header,
one card and two bodies. This is not a tidy-up — three things are impossible without
it:

- **The shared element.** The draft card (`.draft`, previously an `aria-hidden`
  decoration that silently swapped text) is **one node** that travels from its slot
  in the form to the born card's position. Not two cards cross-fading: the card you
  were looking at _is_ the card you end up with.
- **Dashed → solid, meaning what it says.** ADR-0011's soft/hard grammar means
  "provisional → committed". The card goes solid, gains real elevation and drops its
  `טיוטה` tag on the exact frame the trip stops being a draft. The motion is stating
  the one true thing about the moment, which is the test for whether a set piece has
  earned its length.
- **The chrome warms** indigo → plan-violet on one header, rather than one header
  replacing another. The drafting grid draws in and the mode pill arrives with it,
  because the born screen is already _inside_ the trip, in Plan mode.

The flight is a **single-axis transform**. Both bodies carry the same 20px horizontal
padding, so the card's width never changes — no animation of `top`/`width`, nothing
off the compositor. Two invisible slots reserve the space and are measured for the
delta; the card is never inside either, so nothing reflows mid-flight. A
`ResizeObserver` re-measures, because the form's height changes as fields fill in (a
date error appears, a timezone note shows) and a stale measurement would start the
travel from the wrong place.

### 2. The board's first departure — and no second cinematic moment

The zero state already renders the departure board **unpowered** (ADR-0024 §2) and
Trip Home renders it live, glowing and pulsing. Creation sat between them rendering no
board at all. So the payoff was never something to invent: it was a **gap to close**.
Trip birth is the board being switched on.

Its first row is **honest content**. A brand-new trip's first departure is the trip
itself, so the flaps settle into its start date, its name and its length — nothing
decorative is being spelled out. The flaps turn with `steps()` because a split-flap is
**discrete**; a smooth `scaleY` reads as a sliding blind rather than flaps.

**This does not ask for a second `--t-cinematic` moment.** design-language allows
exactly one, the Plan→Trip switch, and that budget stands. The cinematic _asset_ is
the board's power-on, and this is that same asset on a second trigger — one signature
played at the two moments a trip changes state: it is born, and it goes live. Every
other beat is `--t-deliberate` or below.

The **sequence** is what makes it read as grand, not the length. Beat offsets live in
`constants.ts` (`TRIP_BIRTH`) because they are choreography, not ramp values — each
beat's own duration still comes from the ramp — and they deliberately **overlap**, so
the screen reads as one event resolving rather than four things taking turns.

### 3. The smaller beats

- **The form assembles** on `--stagger-step`, one step per group. Short by design: it
  finishes before a fast typist reaches the first field, because the point is that the
  screen was built, not that you waited.
- **The CTA arms** when the form completes. U-13 already made it always-visible and
  disabled-with-a-reason; this gives the disabled→enabled flip a beat, because it is
  the app telling a first-timer they are done. One pulse, not a persistent glow.
- **Copying the invite confirms in place** as well as in the toast — the clipboard
  glyph becomes a check and the box's border goes solid green. The toast says it
  happened; the box you tapped should say that you tapped it.

### 4. Skippable by a tap, and only while it runs

Someone who just wants to start planning must be able to land the whole thing
immediately: **a celebration you cannot interrupt is a modal dialog wearing a
costume.** A tap anywhere lands every beat at once.

The skip layer is mounted **only while the sequence is running**. Left up, it would sit
over the invite box swallowing the tap that copies the link — the affordance the whole
screen exists to present.

Reduced motion lands the same end state immediately (ADR-0140 §5): the board still
ends up _on_, the card still ends up committed, the invite still appears. A user who
asked for less motion did not ask for a different outcome.

### 5. Candidate A over candidate B

The mockup drew **A** (staged, ~1450ms, with the board) beside **B** (~650ms, no
board), because this should be picked on a device. A ships, on the reasoning above:
B leaves the gap in the board's sequence open, and closing that gap is the whole idea.

## Consequences

- `CreateTrip` is now one component owning both screens. A change to either has to
  respect the shared card and the one header — adding a second header or a second card
  would silently undo §1.
- The `.draft` / `.born-card` CSS families collapse into one `.birth-card`.
- The board appears on a third surface. If a fourth wants it, it is now clearly a
  candidate for a `ui/domain/` component rather than a third copy of the markup —
  worth doing at that point, not before (two consumers is not yet a pattern).

## What this ADR does not settle

- **How it feels, and whether it wears.** The mockup named the open question and it is
  still open: 1450ms is a gift the first time and possibly a tax on your third trip. A
  set piece is judged on the repeat. If it wears, the fix is rarity rather than speed —
  play the full sequence on a person's **first** trip and the short version after,
  which is one condition and no new design. **Do not tune this without a device.**
- **The full in-app pass.** The build environment had no Docker daemon and no local
  Postgres, and stubbing auth well enough to reach `/new` in a real browser was not
  achieved within the session. The choreography is covered by nine component tests
  (beat order and offsets, the skip landing everything, the skip unmounting, reduced
  motion, the flaps' content, the in-place copy confirm, and that exactly one card
  exists); **the sequence has not been watched.** That is the next thing owed, and it
  is the one that can still find a defect the tests cannot — as ADR-0121's own
  build-log entries kept proving.

## Build log

**Session 190 (2026-07-31).** Built after ADR-0140's foundations, which is why the
route into `/new` and the born screen's own overlays already move correctly.

One thing the build changed about the design: the mockup positioned the shared card
with `top`/`inset-inline-start`/`width` transitions, which animate layout. Measuring
that both bodies share their horizontal padding turned it into a one-axis transform —
cheaper, smoother, and it removed the width interpolation entirely.

One graceful-absence fix: `ResizeObserver` is absent in jsdom, so it is guarded rather
than shimmed in tests. The one-shot measurement is what correctness depends on; the
observer only keeps it fresh.
