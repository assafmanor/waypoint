# Session 122 — the mount-time guard outlives the gesture, not the other way round

**Date:** 2026-07-25
**Branch:** `claude/shelf-drag-second-gesture-guard`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-122 amendment)

Reported right after session 120 shipped: "shelf behavior is deteriorated. After
starting the drag operation and starting the move it cancels briefly after, and also
the auto scroll on this isn't working as well."

## The bug

Session 120 moved the touch-scroll guard onto the dragged element and made the ref
cleanup deliberately skip removing it when that element unmounts mid-drag — correct,
and the reason a drag now survives the day switch. But its teardown then removed the
guard **from the element** at the end of every gesture:

```ts
el.removeEventListener('touchmove', suppressTouchScroll); // ← every gesture
```

That listener is the one attached at **mount**, before any touch exists, which is the
entire reason an armed drag can call `preventDefault` on a cancellable `touchmove` at
all (session 116: attach it on arm, 280 ms in, and the gesture is already on the
compositor). The ref callback is stable, so nothing re-attaches it.

So the **first** gesture on a card — a completed drag, a tap, even a scroll that never
armed — stripped that card's permanent guard. Every gesture after it on the same card
had nothing suppressing the native pan: the browser started panning a moment after the
finger moved and cancelled the pointer, which is the reported "cancels briefly after".
The auto-scroll was the same bug from the other end — the drag was already dead before
the finger could reach an edge band.

## The fix

One line: the gesture removes the guard only when the element is **no longer in the
tree** — the orphan case the escape hatch exists for, where the ref cleanup skipped
removal and the teardown is the only other chance.

```ts
if (!el.isConnected) el.removeEventListener('touchmove', suppressTouchScroll);
```

A still-mounted element keeps its mount-time listener, so gesture number two is as
suppressible as gesture number one.

## The class of miss

Worth naming, because this is the third session in a row where the gesture broke in a
way every test agreed was fine: **every e2e in `shelf-drag.spec.ts` booted cold and
touched its target exactly once.** A real session never does that. Two tests now cover
the second gesture — a shelf card (the native pan must still be suppressed, and the
drag must still be alive after the moves) and a builder row (the auto-scroll must still
run) — and they fail on session 120's code, pass on this one.

The e2e suite is 27 tests; unit tests 1017; both green.
