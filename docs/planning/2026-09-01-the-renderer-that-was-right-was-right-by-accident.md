# The renderer that was right was right by accident — ADR-0213 §15

**Date:** 2026-09-01
**Subject:** one owner report on the PDF's journey header, the audit its last three words asked for, and the worse defect that audit found.

## What came in

> _"The pdf shows on the title row the flight times wrong, it only shows the first flight and not
> the overall journey. The live sharing page shows this correctly"_

Two screenshots, same trip, same journey: `02:20–15:25` on the reader page, `02:20–05:50` on paper.
And a preface: _"I found another bug, possibly leading to more"_.

## The inversion that located the bug

The obvious reading is "paper is wrong, fix paper". What the code says is stranger: **paper was the
renderer obeying the contract.**

`SharedEvent.time` was introduced by the twelfth amendment as the single authority on what a row's
clock says, precisely so no renderer would derive a range for itself. `chainJourneys` builds a
journey row from the first leg (`...head`) and overrides its identity, its `journeyTo`, its
`endLabel` and its `travelFacts` — and not its `time`. So paper spelled the field it was told to
spell, and got leg one. The reader page was still composing `startLabel`–`endLabel` in `Trek`, which
happened to be the journey's real span.

So the surface that looked broken was the compliant one, and the surface that looked correct was the
one ignoring the contract. That is the tell that the defect is upstream of both templates — and it
is a better signal than "which output is wrong", because it points at a single field instead of a
template.

Two small changes: the projection sets `time` beside the `endLabel` it already sets, and `Trek`
reads `event.time` like every other clock on the page.

## Why it shipped: nothing in the repo had a chained journey

`legRows` — the whole `.pdf-trek` block — was rendered by **no fixture**. Not the reference trip,
not the dense one, so not the template spec and not the container smoke either. Worse, the spec that
looks like it covers the block,

```ts
for (const trek of html.match(/<div class="pdf-trek">.../gs) ?? []) { … }
```

matched **nothing** and had been reporting green over zero blocks since the ninth amendment. That is
the second vacuous guard in two days in this one file — the thirteenth amendment found the mono
guard iterating only `.pdf-num` — so the class is now a backlog line with a grep behind it, not just
a repaired instance.

## The audit, and the thing worth more than the reported bug

_"Possibly leading to more"_ is a request, so every field a journey inherits from leg one got
checked rather than just the clock. Most are genuinely fine (`startLabel` **is** the first
departure; the travel-time line **is** the drive to the first airport; `placeName`/`address`/`mapUrl`
are read by neither renderer for this row shape, so they are dead rather than wrong).

The attachments are not fine. `eventRow` did

```ts
if (event.legs?.length) return journey + legRows(event);
```

and stopped — so `event.caption` and `opsLines(event.ops)`, which the non-chained branch renders
eight lines below, were unreachable for a chain. **A printed connecting flight carried no
confirmation number.** On a document whose entire purpose is being useful without a phone, that is
worse than the reported defect.

The comment directly above that early return already said the attachments _"ride inside"_ the
container. It was true of the reader page and had never been true of paper. Both defects in this
amendment live in the same four lines, and the one that mattered more is the one the comment said
was handled — so: **a prose claim beside an early return is the easiest place in a file for intent
and code to part company**, and it is worth reading those two together rather than trusting the
sentence.

## The mockup had the right answer and it still shipped

`mockups/a-journey-is-a-flight-plan-v1.html` draws `14:30–23:20` on **both** its reader and paper
columns, from one `JOURNEY.span` constant feeding both — so the two could not disagree there, and
the drawing was right while the build drifted.

That is worth recording because the mockups are usually defended as what catches this class of thing
before the build. Here one had the answer for a week and the defect shipped anyway: a mockup is a
drawing, not an assertion, and nothing compared the two because there was no fixture to compare
with. What closed the gap was a fixture. So this amendment adds no mockup, deliberately.
