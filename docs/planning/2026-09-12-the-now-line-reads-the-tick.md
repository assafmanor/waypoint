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

1. ~~**A skip is usually about the future.**~~ **Wrong, and reported out four hours later — see
   the second session below.** The first build required the row to have _begun_ as well as been
   settled, on the theory that "we're not doing the 18:30 waterfall" said at 17:18 must not drag
   the mark below an 18:30 card. The count that would have killed it was one `grep` away and was
   left half-done: `DayView.tsx:581` drops a skipped row from the day entirely, and
   `PlanDay.tsx:414` does too except on a finished trip's archive — a past day, which has no "now"
   at all. The index can never see a skipped row, so the guard defended nothing and broke the early
   tick.
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

---

## Second session, same evening — "we're already headed to the hotel"

A second screenshot at 20:39: a 20:45 waterfall already marked `היינו`, the playhead still standing
in the 15-minute drive **into** it under a `בדרך` chip, and the owner on the road to the hotel.

> It seems like it still sometimes doesn't do it well, for example now we're already headed to the hotel

Two defects behind one symptom, and the first is the struck-through clause above:

1. **The "and has begun" guard is withdrawn.** Settled is behind us, full stop — which is what
   ADR-0117 §2 said all along, and what the owner asked for the first time.
2. **`nowInHole` was still answering for a hole the placement had left.** It is a pure clock test
   over ONE hole, consulted at every join, so once a settled row could hand the mark down early the
   hole _above_ that row kept claiming the moment — and the day drew **two** marks, which nothing
   guarded. The join now asks only at the boundary entry (`index === nowLineIndex`). That is not a
   new rule beside the placement; it is the placement's own index reaching the one derivation still
   answering without it, and it retires a latent double-mark that predates this whole thread (a
   settled all-day container could already produce one).

The lesson is the one root `CLAUDE.md` already writes down: _count the call sites before claiming
what a derivation does._ The guard was written from the shape of `EventStatus` rather than from who
renders it. And per the same file: a correction is not a fork — the guard was removed, not drawn
back beside the fix.
