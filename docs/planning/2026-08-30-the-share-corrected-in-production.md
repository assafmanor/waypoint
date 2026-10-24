# The share, corrected in production (2026-08-30, session 258e)

The fourth pass merged and deployed. The owner opened it on their own trip and sent seven
reports across two messages. One of them means an amendment I wrote the same evening is
wrong about what it did.

The decisions are in
[ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
fifth 2026-08-30 amendment. This note is about how the session went.

## The correction that matters

I wrote, in the fourth amendment and in the PR body, that the notes-linkage privacy defect
was "fixed as a side effect" of dissolving the appendix. **It was not.** `loadOps` filters by
linkage; `buildAppendix` was left sitting beside it running `where: { tripId }` with no join.
Every note in the trip went on being published under a toggle that promises
`רק תוכן שמחובר למסלול`, and every attached note printed twice.

Three things about this are worth keeping.

**It is ADR-0096's anti-pattern, introduced by the change that existed to remove it.** Two
mechanisms answering one question, one of them linkage-aware. I deleted the appendix's
per-family shapes and left the queries that fed them.

**The test could not fail.** The spec asserted that the _unattached_ note appears in the
appendix. It never asserted that the _attached_ one does not. A one-directional assertion
passes identically whether the filter exists or not — so the suite was green the whole way,
and I read that green as confirmation of a claim it was not making.

**I claimed it in an ADR.** The ADR is where this repo says what is true, and a
fix-that-did-not-land written into one is worse than no entry: the next session reads it and
does not look. The correction is written into the same document rather than appended
somewhere quieter.

## What the owner's reports were actually about

Seven, and they resolved to six causes — several of which were invisible to every test:

- The appendix wall of text was **not a formatting problem**. It was the whole trip's notes.
- The bed glyph had `gap: 5px` and no gap, because `.sh-day-copy span` is one point more
  specific and sets `display: block`. The element was never a flex container. Measured 0px.
- The caption clamp described in a code comment **did not exist in the stylesheet**, so a
  description got one line however short it was.
- The English descriptions were right-aligned because my own §8 fix over-corrected: I
  replaced `dir="auto"` with `autoIsolate` on prose as well as on values, and an isolate
  inherits its container's direction.
- Layovers were missed across midnight because `withJourneys` walked one day's events. The
  chain condition never involved the calendar; the loop did.
- The bookings block teleported because every row was an `#day-N` anchor.

## The pattern under three of them

A declaration that silently loses — to specificity, to a missing rule, to a second query —
**looks exactly like one that was never written**. The stay's `gap`, the caption's clamp and
the appendix's linkage filter are the same failure in three different materials, and none of
them could be seen by reading the source that "had" them. What separated them was a
computed-style read and a query count.

That is the third time in this ADR's history: the print CSS block lost at equal specificity
and the smoke verifier passed throughout, and `frontend/CLAUDE.md` already carries the
hover-vs-pressed version of it.

## Method note

I stopped guessing at the document-link report this round and measured instead — curl against
production for the route, a Playwright probe against the real component for the render. The
route is provably fine; the symptom could not be reproduced because the owner's share had been
switched back to `full`, which carries no documents. It is recorded as open. Claiming that one
fixed without a reproduction is precisely the mistake this note opens with.

## Left open

- The owner's document-link symptom, unreproduced.
- `frontend/e2e/` still typechecked by nothing (18 pre-existing errors behind that one line).
- The `dir="auto"`-on-a-value-block sweep beyond sharing.
