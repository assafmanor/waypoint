# Session 119 — one gesture for everything, and the day strip joins the drag

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-119 amendment)

Two owner requests, and together they finish the drag model: every draggable thing in
the builder uses the same gesture, and a drag can reach days that aren't on screen.

## 1. The grip and the arrows are gone

A soft row needed its ⠿ handle for exactly one reason: the drag armed **on contact**,
so making the whole row draggable would have eaten the row's tap. A press-and-hold
doesn't have that problem — it's the same gesture the shelf card already uses, through
the same hook — so the handle and the ▲/▼ stack beside it are retired and the row gets
that width back.

**Reorder keeps a non-pointer path**: `הקדם`/`אחר` moved into the row's ⋯ sheet, which
is where row actions belong anyway and is reachable by keyboard and screen reader.
Retiring the arrows without that would have removed reordering entirely for anyone not
using a pointer — dragging is now the primary way, not the only one.

## 2. The day strip is part of the drag

While a drag is live, the strip's pills become drop targets, and **resting on one
switches to that day** (spring-loaded folders) so you can carry a card or a row into
another day and drop it on a gap there. Releasing on a pill puts the thing on that day
directly: an idea gets its target day, a row is _moved_ there keeping its own clock
time (guarded — a hard event changing days is a commitment change). A **skipped** card
isn't accepted: it belongs to the day it was skipped on.

The dwell is the substance of it. A drag crosses several pills on the way anywhere, so
opening each one passed over would be unusable.

### Cancelling puts the day back

Asked about explicitly, and the codebase answered it: `setActiveDate` navigates with
`replace`, and back from a day resolves to Home rather than walking the days you
tapped (ADR-0035/0090). The app deliberately treats "which day am I on" as lateral
view state with **no back step** — so a day switch left behind by an abandoned gesture
would have no reverse gear.

So the day switch is scaffolding for the drag: a committed drop keeps the new day (you
just put something there), and a drop on nothing — or a cancel — returns to the day
the drag was lifted from, however many days it dwelled through.

## Three things this required

**The drag has to outlive its source.** Switching the day unmounts the row being
dragged. `setPointerCapture` releases when the captured element goes away, and React
handlers on the element unmount with it — either way the gesture freezes mid-air. So
`useHoldToDrag` listens on the **window** with no pointer capture, and its touch-scroll
guard gains a document-level copy at arm time (the element's own is what keeps the
gesture cancellable in the first place, but it dies with the element).

**A drop has to read live state.** The window listeners hold the handlers from the
render at touch-down — before any drag existed, so `drag`/`ideaDrag` were `null` in the
closure and the first version of this dropped nothing at all. Everything a release
needs now comes from a ref updated each render. That also closes something latent since
the drag shipped: a collaborator's change arriving mid-gesture used to be dropped onto
a stale list.

**The pills can't detect the pointer themselves.** My first attempt put the dwell on
the pill's own `onPointerEnter`, and nothing ever lit up: a touch pointer is
_implicitly captured_ by the element the touch started on, so enter/leave never fire on
anything the finger travels over. Only `elementFromPoint` knows. The builder
hit-tests and publishes what it found; the strip renders it. Hence
`state/drag-state.tsx`, shaped exactly like `map-scope-state` — it carries only what
the strip has to _render_, never what is being dragged or what a drop means.

One more from the same round: the hit-tests used to call `setOverDate` **inside** a
`setState` updater, which React runs during the render phase — a real "setState while
rendering another component" warning. They're plain functions now, reading the live ref
for their previous value.

## Testing

`format` / `lint` / `typecheck` / `build` green. **1007 unit tests / 93 files** (+13:
the spring-load dwell in isolation — including that it fires once and not once per
clock tick — the strip's render contract, the day-pill drop cases in both tables, and
the drag surviving its source unmounting). **23 e2e / 3 files**, run through twice
(`--repeat-each=2`, 46/46) — three new: the row arms from anywhere and carries no
handle or arrows, dwelling switches the day mid-drag while the drag survives it, and a
drop on nothing returns to the day it started on.

Backend untouched. **Still wants a real-device pass** (ADR-0017) — and this round adds
a specific thing to feel: whether 450 ms is the right dwell.
