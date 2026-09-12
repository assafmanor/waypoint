# 2026-09-12 — Two defects from a plane

**ADRs amended:** [0133 §13](../decisions/0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) (the Google photo is copied; a failed LOAD falls back too) · [0206 §AC1](../decisions/0206-a-travel-time-belongs-between-two-points.md) (the amber leg's third source)

## The ask

Two reports, both with screenshots taken mid-flight on the TLV → Vienna → Keflavík leg:

> 1. Avatar is missing when offline (Google account profile picture). If it's possible to save it somehow, then please do.
> 2. After a layover, i.e. on the second flight, the map doesn't show the route and it looks like we're still on the layover, even though the flight has already took off.

## Report 1 turned out to be two defects, and only one of them was the backlog item

The backlog already scoped the fix — _"copy the Google photo into our own storage at sign-in"_, an
ADR-0133 alternative refused in Phase 1 and marked **now cheap** once Phase 4 brought `storage.ts`,
the sniffer and the content route in. That is built (ADR-0133 §13a), with the two questions the
backlog left open answered there.

**But the screenshot showed broken-image glyphs, not initials** — and that is a different bug.
ADR-0133 §4 says _"never render a broken image"_, and `Avatar` enforced it by checking whether the
URL was **absent**. A URL that resolves and then fails to load was never handled at all, which makes
offline the ordinary case rather than the exotic one, and which no amount of copying bytes fixes for
the window before a person's next sign-in. The `onError` fallback (§13b) is the half that makes the
report's own screenshot impossible; the copy is the half that puts the face back.

Worth keeping: **a rule enforced at the wrong altitude reads as implemented.** Five tests asserted
§4's fallback and all five passed — every one of them on a `null` URL.

## Report 2 was one defect with two symptoms, and the rule already existed

The Map's `עכשיו` cue and its amber leg both read `currentDestination`, which resolves the
in-progress event through ADR-0048's authority rule — and that rule answers a transport booking's
**origin**, which mid-flight is the airport you have already left. Hence both halves of the report
at once: the layover pin wore `עכשיו`, and the amber leg (spent on `selected → next`) had no stop to
go to, because everything upcoming was past the landing.

The board settled this exact question in session 215 — `heroHorizon`'s `midSpanEventId` flips a span
you are INSIDE to its destination, which is why Home read `כרגע · בדרך` correctly in the same
screenshot. So the fix is a second surface reading the rule that exists, not a new one:
`currentDestination` now reports `inTransit` and resolves to the destination, and `amberLegIndex`
takes that stop between `selected` and `next`.

Two things fell out of reading it rather than from the report:

- **The ambient filter dropped a red-eye.** `currentDestination` filtered `!isAmbient(e)` to keep a
  three-day hotel out of the now slot — and an overnight flight carries an `endDate`, so it is
  multi-day and therefore ambient too. Home's `scheduleEvents` already exempts a journey for this
  reason, with the exemption written out in a comment; this copy did not. Now it does.
- **One shipped spec asserted the defect.** `Map.embedded.test.tsx` pinned the `now` cue to the
  ORIGIN pin mid-flight. Updated, with the reason in place, rather than worked around.

## Verification

`pnpm typecheck`, `pnpm build`, the frontend suite and the backend suite, all green. The two map
fixes and the amber leg each have a test that fails without them (checked by reverting the change,
not by inspection); the Google copy has its own spec covering the refresh policy, the retirement of
replaced bytes, and all three ways the fetch can refuse without failing a sign-in.
