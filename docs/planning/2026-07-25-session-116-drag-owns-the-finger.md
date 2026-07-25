# Session 116 — the drag finally owns the finger (and an e2e to keep it that way)

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-116 amendment)

Fourth round on the same reported symptom: on a phone, an armed drag and the edge
auto-scroll move the list in opposite directions, the card never settles over a
target, and "the drag activates, but only by holding specific areas of the card."

Sessions 113, 114 and 115 each fixed a real defect and left the symptom standing.
That is the signal that the causes were being **guessed** rather than observed — so
this round inverted the order: write the browser-contract test first, let it name
the causes, then fix them.

## The test came first

`frontend/e2e/shelf-drag.spec.ts` — five cases on a 390×660 touch viewport, driven
through CDP `Input.dispatchTouchEvent` (Playwright's `page.touchscreen` can only
tap, and everything here happens _between_ touchstart and touchend):

1. a hold arms from four places a thumb actually lands on the card;
2. an armed drag does not let the finger scroll the page;
3. a flick without a hold still scrolls, and never arms;
4. holding in the top band auto-scrolls the **page**, not the shelf strip;
5. the drop indicator keeps up while the page scrolls under a still finger.

Getting the harness to the Plan day builder took two fixes of its own, both worth
keeping: a live trip lands in **Trip** mode, so the mode toggle comes before the day
tab; and the shared fixture's deliberately huge trip range (2020→2035) makes the
header render ~5,800 day buttons, on which Playwright's own locator queries time
out. `bootIntoTrip` now takes a `dates` override, and `shortLiveTripDates()` gives a
week-long trip that is still live whatever the box clock reads.

## Three causes, none of them the one being fixed

**1. A re-render during the hold cancelled the drag.** `useHoldToDrag`'s teardown was
`useEffect(() => reset, [reset])`, and `reset` closed over the object
`useSelectionGuard()` returns — a fresh literal every render. So the cleanup ran on
every re-render of the builder, clearing the hold timer. The builder re-renders once
a second (the now-line reads `useClock`), so a 280 ms hold armed by luck. **That is
the "only some areas of the card" report** — the card was never the variable, and
that is exactly why a jsdom probe of all four regions passed. Fixed by memoising the
guard and making the teardown unmount-only through a ref.

**2. The auto-scroll measured its bands against the wrong box.** It fed a _viewport_
`clientY` into a computation against the _scroller's_ height. `.body` starts below
the header, so both bands sat about a header's height too high, and a finger resting
mid-list read as "past the bottom edge" — the list ran away under it at full speed.
Most of what the report called "the two scrolls fighting" was this, not native
scrolling. Now read against the scroller's own `getBoundingClientRect()`, which is
what pure `edgeScrollStep` was always documented to take.

**3. The click a drop fires retargets.** Session 113 swallowed it with
`onClickCapture` on the card — but session 115 made the dragged card
`pointer-events: none` so the drop hit-test could see what is _under_ the finger.
The click therefore lands on that other element and never passes through the card:
releasing a drag over a gap chip opened the new-event sheet. Now one document-level
capture listener, armed for exactly one click after a drop.

## Two dead ends removed

The mount-time non-passive `touchmove` guard is the thing that actually suppresses
native scrolling, and the e2e proves it by measuring `.body`'s `scrollTop` across an
armed drag through the middle of the scroller. The two CSS guards added beside it
are gone, with the reasons recorded in `styles/tokens.css`:

- `touch-action: none` while dragging — `touch-action` is read when the touch
  **starts**, so a mid-gesture change does nothing;
- `overflow-y: hidden` on `.body` while dragging — it does stop native scrolling,
  and it also stops the container reporting as a scroller, so `nearestScroller`
  finds nothing and the edge auto-scroll dies with it. The two guards were
  cancelling each other out.

With the freeze gone, the `wp-dragging-touch` class had no consumer, so it and
`lock(touch)`'s parameter went with it.

## Testing

`format` / `lint` / `typecheck` / `build` green. **971 unit tests / 90 files** (+3:
a re-render mid-hold, native suppression surviving a re-render mid-drag, and a
retargeted click) — all three verified to **fail** against the pre-fix code, so they
pin the regressions rather than merely passing. **13 e2e / 3 files**, run twice
through (`--repeat-each=2`, 26/26) since the last one was originally flaky: the gap
chip _sweeps past_ a held finger, so that case records the transition with a
`MutationObserver` instead of polling for it.

Backend suite still can't run in this sandbox (no Postgres: no Docker daemon, and
`initdb` refuses to run as root) — unchanged from previous sessions, and CI covers
it. Nothing in this change touches the backend.

**Still wants a real-device pass** (ADR-0017): Chromium is not the engine the
reports came from, and feel is not testable.
