# Session 129 — the filter reveal becomes infrastructure, and the Map inherits it

**Date:** 2026-07-26
**Branch:** `claude/search-filter-animation-pattern-8g6syz`
**ADR:** [0120](../decisions/0120-filter-reveal-is-shared-infrastructure.md)

Owner report: "Booking search filtering by category has a subtle animation when typing.
I want this to be used for search and filters as a given and not a one off, so that map
places search inherits this too automatically."

## What was there

ADR-0098 §4 chose motion as the Index's polish layer and shipped two things: the
past-bookings collapse and the per-row filter reveal. Only the **collapse** was
generalized at build time (`ui/primitives/Collapsible`, on the ADR's own instruction).
The **reveal** stayed a one-off in three pieces, all Index-shaped:

- `lib/index-bookings.ts`'s `visibleRows` — typed to `BookingRow`, welded to the
  bookings' category/query predicate;
- `screens.css`'s `.index .idx-row` — scoped to the Index, `max-height: 140px`;
- the wrapper markup (`'idx-row' + (visible ? '' : ' hidden')` + inline
  `transitionDelay`), copy-pasted at each of the screen's three lists.

The Map was built to reuse the Index's filter grammar (ADR-0109 §2): same chip row,
same `SearchOverlay`, same `--idx-accent`. It reused everything **except** the motion,
because the motion wasn't reusable — so its chips and its search `.filter()`ed rows out
of the array and the list jumped.

## What shipped

- **`lib/filter-reveal.ts`** — `revealRows(items, matches, startIndex?)` plus
  `countVisible`/`visibleItems`. Generic; the predicate stays with the caller.
  `index-bookings.ts`'s `visibleRows` is now that one predicate over it, name and
  signature unchanged, so the bookings screen and its tests read as before.
- **`ui/primitives/RevealList`** (+ `RevealRow`, `reveal-list.css`) — the wrapper
  markup, once. `renderBefore` emits group headers **outside** the collapsing wrapper,
  which is what let the Map keep `מה שלפנינו`/`מה שמאחורינו`.
- **`.wp-reveal`** — the CSS out of `screens.css`, unscoped, durations off the motion
  ramp. `screens.css` keeps only the Index's row-separator rules on top of it.
- **The Map wired through it** — type chips, the `אולי` toggle, and both search halves.
  `כל הימים` deliberately stays a hard scope change (see the ADR §4).

Two things the one-off never had, now impossible to forget at a call site:

- **A hidden row is `inert`.** It stays mounted to animate out, so it was focusable and
  read aloud while visually gone.
- **No height cap.** The collapse is a `0fr`/`1fr` grid track, not `max-height: 140px`
  — a shared reveal can't ask each surface for its tallest-row number, and the Index's
  would have clipped a wrapped row.

## The two things the browser had to settle

Both were assumptions worth checking rather than shipping:

1. **`0fr` doesn't collapse a padded row.** With the row itself as the grid item, the
   track resolved to its padding + border + margin (measured 33px, not 0) — a "hidden"
   row would have kept a third of its height. The fix is one inner wrapper carrying no
   padding of its own (`overflow: hidden; min-height: 0`), which is why `RevealRow`
   renders `.wp-reveal-inner`.
2. **Clipping tight would shear the rings.** The collapse needs clipping, but the Map's
   single amber next-stop ring (ADR-0109 §6), row shadows, and focus outlines are
   painted _outside_ the row's border box. `--reveal-bleed` is a layout-neutral
   padding/negative-margin pair that widens the clip box without moving the row.

Verified in Chromium against the running app (`DEV_AUTH=1` + the seeded demo trip),
both surfaces: collapsed rows measure exactly 0px with no leftover gaps, the amber ring
renders whole, a three-line row isn't clipped, and the Map's search now collapses seven
rows to zero while the match stays put.

## Consequence to remember

A filtered-out row is now **in the DOM, hidden** — not absent. Tests that asserted
absence assert the hidden state (`Map.test.tsx`'s `filteredOut` helper), and anything
counting rendered rows counts `countVisible`, not `rows.length`.
