# Session 188 — the Map can answer its own question now (2026-07-31)

[ADR-0139](../decisions/0139-settling-an-event-from-the-map.md), designed and built.
Mockups: [`map-settle-from-canvas-v2.html`](../../mockups/map-settle-from-canvas-v2.html) is the
design, [`v1`](../../mockups/map-settle-from-canvas-v1.html) holds the rejected alternative and
the measurement that shaped v2.

Session 187 gave the canvas outcome marks and backlogged the gap they exposed: a pin could now
say `עבר · לא סומן` on a surface with no way to answer it. This closes that loop.

## The hard question was already answered, and I nearly designed around it

"Mark this place done" is not well-formed — a place can carry several events on one day, and
ADR-0117 §5 says an outcome belongs to **all** of a day's references rather than the one that
won the clock. I went in expecting to design a disambiguator.

The **way-in block** already is one. It enumerates the references, one row per entity, each
labelled in its own words. Hang the verb there and there is nothing to resolve: one event per
row, one outcome per event. That turned a new surface into a cluster on an existing row.

Worth keeping as a habit rather than a fact: **before designing a chooser, check whether the
surface already enumerates the thing you were about to make the user choose.** The block had
been on screen for six sessions.

## Two of the owner's questions changed my answers, and one changed a "no" into a "why"

**Settling from the pin** — I said no, and the useful part was finding the _principled_ reason
instead of the convenient one. My first instinct was geometry (a 34px teardrop, a ladder with no
free axis, a 15px badge against a 44px floor). All true and all secondary: a pin is a **place**,
an outcome belongs to an **event**, and a pin cannot say which. That is the same argument that
put the verb on the reference row, so the no is a consequence of the design rather than a
limitation of it. A reason that generalises beats a reason that merely holds.

**Aligning the day view** — I looked before answering and the answer changed. I expected one
existing settle affordance to align with; there are **two**, `EventCard`'s `.wp-event-settle-*`
and `PlanDay`'s own `.settle-choose`. So the Map's is the **third**, and rule 8's "generalise the
existing one-off rather than adding a second beside it" was already overdue before I arrived.
Backlogged with its scope stated (vocabulary, not geometry — a full-width prompt and a 40px row
are not the same widget), deliberately separate so a day-view regression cannot be mistaken for a
Map bug.

## The mockup refuted my own recommendation, twice

I had recommended dropping the words `היינו שם?` from the cluster and letting an amber tint carry
the emphasis. Drawn at 9% with a hairline, the "emphasised" row was **indistinguishable** from a
row deliberately not emphasised — §B caught it only because it drew the two side by side. Those
words had been carrying more than they looked like. Fixed at 16% with a 2px ring.

The lesson is narrower than "test your work": **a demo that cannot fail is not evidence.** §B
exists to show a difference, so a §B in which both frames look the same is a finding, not a
formatting problem. The same shape as session 187's flattering pin specimens, one session later.

## Three wrong measurements before a right one

Recorded because each looked like a result:

1. The place card is `position: absolute` against `.map-split`, so in a page with no sheet it
   escaped every frame and stacked at the document's foot — every card rendered as an empty strip.
2. Its entrance keyframe starts at `opacity: 0` with no fill-mode, so a static capture samples
   frame 0 and the cards were invisible even once confined.
3. My first metric was the label's **own** width, which is content-sized and therefore identical
   at 390 and 360. **A number that cannot move is not a measurement.** Then `scrollWidth` claimed
   a 30-character label fits in 116px — it lies about shrunk flex items that ellipsise, so the
   natural width now comes off an unconstrained clone.

With that fixed the finding is a **cost**, not a confirmation: the label wants 199px and gets 146
at 390 / 116 at 360, so a long title truncates at both widths. Dropping the ask-words returns
51px and does not cure it. Stated in the ADR rather than smoothed — ellipsising a long title is
what the row already does, and dropping the verb to save it would drop the feature.

## Two build notes

- **`.map-ref .icon` was scoped to the row** while the row _was_ the button and nothing else in it
  had an icon. The cluster's icons matched it, so `margin-inline-start: auto` pushed them to the
  far edge and `--faint` greyed them. The rule now travels with the caret it was written for. The
  general shape: a selector scoped to a container is a bet that nothing else will ever live there.
- **The test harness stubs the verb layer, not the reducer**, so the assertable seam is "the right
  verb was called with the right event" rather than a rendered status change. My first tests
  asserted the latter and failed for the right reason — the write's own behaviour (optimistic
  dispatch, outbox, undo toast) is `verbs`' to test and is already tested there. A settled row is
  seeded as settled instead.
