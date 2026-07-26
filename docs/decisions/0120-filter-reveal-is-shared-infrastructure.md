# 0120 — Filtering a list is a reveal, everywhere: the stagger motion becomes shared infrastructure

**Status:** Accepted (build)
**Date:** 2026-07-26
**Refines:** [0098](0098-index-landing-and-dedicated-screens.md) §4 (its per-row filter stagger, invented for the Index bookings screen, is now the app's — the ADR's own "generalize alongside, don't add a second copy" instruction applied to the other half of its motion pass), [0101](0101-index-search-mode-and-header-titles.md) (the `SearchOverlay` shell became shared infrastructure the same way; this is its motion counterpart), [0109](0109-map-tab-design.md) §2 (the Map reuses the Index's filter grammar — until now everything about it _except_ the motion)
**Relates:** [0096](0096-per-domain-claude-md-guides.md) (reuse existing infrastructure before adding new)

## Context

ADR-0098 §4 chose motion, not more color, as the Index's polish layer. One half of that pass — the past-bookings collapse — was explicitly generalized at build time into `ui/primitives/Collapsible`, on the reasoning the ADR spelled out: building a second copy beside `PlanHome`'s toggle would be exactly the pattern root `CLAUDE.md` forbids.

The other half wasn't. The **filter reveal** — a filtered-out row shrinking and fading in place while newly-matching rows come back with a small per-row stagger — shipped as a one-off:

- the derivation lived in `lib/index-bookings.ts`'s `visibleRows`, typed to `BookingRow` and to the bookings' own category/query predicate;
- the motion lived in `screens.css` as `.index .idx-row`, scoped to the Index and capped at `max-height: 140px`;
- the wrapper markup (`className={'idx-row' + (visible ? '' : ' hidden')}`, `style={{ transitionDelay }}`) was copy-pasted at each of the screen's three lists.

So the Map tab — which ADR-0109 §2 built to reuse the Index's filter grammar, and which has the same chip row, the same `SearchOverlay`, the same `--idx-accent` — got none of it. Its chips and its search `.filter()` rows out of the array: they blink out of existence and the list jumps. Two surfaces with the same grammar, and only one of them moves. Any third filterable list (a documents search, the shelf's deferred filter row, a "what's left" outcome facet) would have faced the same choice: copy the three pieces, or ship the jump.

## Decision

**Filtering or searching a list is a reveal, and the reveal is infrastructure — not a per-screen decision.** A surface supplies rows and a predicate; the motion comes with it.

### 1. `lib/filter-reveal.ts` — the derivation, generic

`revealRows(items, matches, startIndex?)` marks each item `{ item, visible, delayMs }`, where only **visible** rows advance the stagger and the delay is capped (`FILTER_STAGGER_MS` / `FILTER_STAGGER_MAX_MS`, unchanged). `startIndex`/`nextIndex` chain two lists into one continuous stagger (what the Index's upcoming → past needs). `countVisible` and `visibleItems` answer "what's actually on screen" — the questions a mounted-but-hidden row makes non-obvious: an empty state keys off the count, and group headers must be derived from the visible rows only, or a header attaches to a row that's collapsing.

The predicate stays with the caller. `index-bookings.ts`'s `visibleRows` is now that one predicate (category + query) over this derivation, keeping its name and signature so the bookings screen and its tests read unchanged.

### 2. `ui/primitives/RevealList` — the renderer

`RevealList` (a list) and `RevealRow` (one row, for a caller assembling its own container) own the wrapper markup, so no call site hand-writes the class toggle or the inline `transitionDelay` again. `renderBefore` emits non-row content — a group header — **outside** the collapsing wrapper, which is what lets the Map keep its `מה שלפנינו` / `מה שמאחורינו` headers.

**A hidden row is `inert`.** It stays mounted (that is what lets it animate out), so without this it stays focusable and still read aloud — visually gone, present to everyone else. This is a correctness fix the one-off never had, and it is now impossible to forget at a call site.

### 3. `.wp-reveal` — the motion, unscoped

The CSS moves out of `screens.css` into `ui/primitives/reveal-list.css` under the app's `wp-` primitive prefix, with the durations picked from the motion ramp (`--t-base`/`--ease-standard`) instead of the literal `0.22s ease` — design-language.md's "new motion picks from the ramp" applied to motion that is now the app's, not one screen's.

The collapse is a **`0fr`/`1fr` grid track** rather than the old `max-height: 140px`. A shared reveal cannot ask each surface to declare how tall its tallest row might be: the Index's cap would have clipped a wrapped two-line row, and every new call site would have needed a number of its own. The grid track needs the row to be able to contribute nothing to its own height, which is why `RevealRow` renders one inner wrapper (`.wp-reveal-inner`, `overflow: hidden; min-height: 0`, no padding of its own — a padded element still contributes its padding, so a "hidden" row would keep that much height).

The clip box gets a small **bleed** (`--reveal-bleed`, a layout-neutral padding/negative-margin pair): clipping is what makes the collapse true, but clipping tight to the row would shear off a row's shadow, its focus ring, and the Map's single amber next-stop ring (ADR-0109 §6). Verified in a browser, not assumed — collapsed rows measure exactly 0px, the ring renders whole, and a three-line row is not clipped.

### 4. Which controls animate, and which don't

A filter reveals; a **scope change** doesn't. On the Map the type chips, the `אולי` toggle, and the search query ride the reveal — they narrow the list you're looking at. `כל הימים` does not: it swaps in a different set of places, the way the Index's upcoming/past split does, and animating one row out while another's row appears in its place would say they were the same list. Near-me is a re-sort, untouched here.

## Consequences

- **The Map inherits the motion with no new mechanism** — chips, the `אולי` toggle, and both search halves (Trip's filter and Plan's research view of the trip's own places) now collapse and reveal exactly like the Index's. That was the point of the change.
- **A filtered-out row is now in the DOM, hidden**, on every surface that adopts this — not absent. Tests that asserted absence assert the hidden state instead (`Map.test.tsx`'s `filteredOut` helper). Anything that counts rendered rows must count `countVisible`, not `rows.length`.
- **`.idx-row` is gone**; the class is `.wp-reveal` everywhere, and `screens.css` keeps only the Index's own row-separator rules on top of it.
- **The next filterable list is a two-line adoption** — `revealRows` + `RevealList` — which is the standing answer for the documents search (ADR-0101's deferred one), the shelf's deferred filter row (ADR-0116), and an outcome facet (ADR-0117's deferred "what's left"). None of them gets to decide whether filtering animates.
- **Reduced motion is unchanged**: App.css's global rule disables the transition, and the visible/hidden result is identical.
