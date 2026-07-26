# Session 130 — every list change moves, re-orders included

**Date:** 2026-07-26
**Branch:** `claude/search-filter-animation-pattern-8g6syz`
**ADR:** [0120](../decisions/0120-filter-reveal-is-shared-infrastructure.md) (session-130 amendment, superseding its §4)

Owner call, straight after session 129 merged: "the animation should be added for the all
days and closeby filters/orders. It should be for every list change."

## What §4 got wrong

Session 129 drew a line: a **filter** reveals, a **scope change** doesn't — a scope swap
isn't the same list, so animating it would claim it was. That reads fine on paper and
wrong in the hand: `כל הימים` is the Map's most-used control, and it was the one that
jumped. The line is withdrawn. There is no category of list control that rearranges rows
without motion.

## Two kinds of change, two mechanisms

**A scope change is a reveal.** `כל הימים` (and the day strip's own day) is now a
predicate over the whole trip's places rather than a different array — rows leave and
arrive in place, and the row nodes are reused across the toggle instead of the list being
rebuilt (asserted directly: the same DOM node un-hides). The chip counts still read the
scoped set, so nothing a chip claims changed.

**A re-order is a move, and the reveal can't do it.** `קרוב עכשיו` changes nothing but
positions, so there was nothing to collapse or expand and the rows teleported.
`lib/useFlipRows.ts` is the missing half — measure, re-layout, play each moved row from
its old offset — living inside `RevealList`, so a list gets it by being a list. Near-me,
a re-sorting scope change, and any ordering control after them are covered by
construction.

Three details keep it quiet: the animation runs through the **Web Animations API** (the
rows already transition `transform` and carry an inline `transition-delay`, and an inline
transform would fight both and leave styles for React to diff); it measures **only when
the row order or visibility changed**, so the Map's per-second clock re-render costs no
layout read; and a row with **no previous position isn't moved** — an arriving row is the
reveal's job, not a slide from nowhere.

## The bug the verification found

`קרוב עכשיו` never resolved in dev, so there was no re-order to watch. Cause:
`lib/useGeolocation.ts` cleared its `alive` ref on unmount and never re-armed it, so
StrictMode's double-invoke (or any real remount) left the hook permanently "dead" and it
discarded every fix the browser handed back — the chip sat on `מאתר…` forever. One line,
plus a regression test that fails without it.

Worth naming: **a liveness ref belongs to a mount, not to an instance.** Set it in the
effect body, don't only clear it in the cleanup.

## Verified

Chromium against the running app (`DEV_AUTH=1`, seeded trip, coordinates injected into
the seeded places so near-me has something to sort): the scope toggle reuses all 8 row
nodes and reveals in place; near-me re-orders nearest-first with 8 move animations
running mid-flight and the rows caught between positions. Frontend suite 1083 passing.
