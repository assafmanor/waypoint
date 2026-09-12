# 2026-09-12 — The now line reads the tick

**ADR amended:** [0217](../decisions/0217-the-now-marker-points-it-does-not-separate.md) §4 + a new amendment (a row a human has settled is behind us, and the index has to say so too)

## The ask

A screenshot of a live Iceland day at 17:18 — two `16:45–17:30` cards in a `בו-זמנית` cluster, each
carrying its own `✓ היינו`, with the amber playhead floating **above** both of them — and one line:

> The now line location doesn't take visited/skipped into account. And it should be

## The finding: half of it was decided, built, and tested two weeks ago

`nowLinePlacement` answers two things (ADR-0217 §1/§2) and only one of them knew about a tick:

- `inside` — right since the first build. `NowSpan.settled` drops a settled row out of the
  "which row holds the moment" question, with a green test asserting it.
- `index` — `entryEndMs(entry) > nowMs`, and nothing else. The clock, alone, forever.

So on the reported day the mark correctly stopped being _nailed_ to the pair and then fell to the
boundary the index named, which was **above** them. The fix is one predicate (`entryIsBehind`), and
the rule is not new in this repo: ADR-0117 §2's _"a human outranks the clock"_ is how
`isDayUsagePast` has sorted a place into `כבר היינו` since July.

**What made it invisible for two weeks is a sentence in §4**: _"the arrow drops to the boundary
below the row, **which is where it already was**"_. It was not. A doc that says a thing is already
true is the one kind of doc nobody re-reads, so the clause is corrected in place and not merely
superseded by the amendment under it.

## What the audit changed about the fix

Root `CLAUDE.md`'s _count the call sites_ rule, and this time the count moved the design twice:

1. **A skip is usually about the future.** `git grep` over `EVENT_STATUS.SKIPPED` says Trip mode
   drops a skipped row from the day list entirely (`DayView.tsx:581`) — but Plan and the pure
   derivation keep it, and "we're not doing the 18:30 waterfall" said at 17:18 would have dragged a
   mark reading `17:18` below an `18:30` card. Hence the second half of the rule: settled **and
   begun**. Settling answers what is done _with_ a row; the mark's position is the day's.
2. **Moving the index opened a case the host had never seen.** `DayView` draws the boundary form
   _under_ the join on purpose, and that was safe only because the index could never land at an
   entry whose hole had not opened yet. A settled row hands the mark down early — and the join
   below it is then a free hour nobody has had and a drive nobody has taken. `holeIsAhead` puts the
   mark above such a hole, which is where Plan's static reference has always drawn it.

The shared reader is untouched by construction: the public projection ships no status at all
(`sharing.ts`), so a stranger's copy cannot answer this question and must not guess.

## Tests

Both red on `main`, which is the only reason to believe either of them:

- `lib/now-line.test.ts` — the drop, the reported pair (both ticked vs. one still running), and the
  two guards: a row settled before it starts, and a settled container with a child still ahead.
- `screens/DayView.travel.test.tsx` — "against a row a human has already settled", in document
  order. The join case is only visible at this altitude; jsdom sees no geometry but it sees order.
