---
date: 2026-08-13
session: 261
subject: The Map's stop-track device pass — the card's height, its reach, and its way out
adrs:
  - 0182
---

# Session 261 — the card over the map

The device pass [`docs/backlog.md`](../backlog.md)'s item **J** has owed ADR-0182 since the stop track shipped on 2026-08-11. It happened on the owner's handset, and the record is [ADR-0182's 2026-08-13 amendment](../decisions/0182-a-day-is-a-sequence-you-can-step-through.md) — this note is the _what happened_ beside it.

## What the pass was owed, and what it actually returned

The two questions the ADR could not answer from a desktop render were whether a horizontal snap on a card sitting over a pannable canvas fights the map's own pan, and whether a selection landing on snap-settle reads as responsive or late. **Both came back unraised.** The gesture design — `scroll-snap-type: x mandatory` and no pointer recogniser at all — held on real glass.

Three defects came back instead, none of them about the gesture:

1. the swipe was reachable only from the top of the card,
2. the card took 85% of the canvas, most of the excess empty,
3. the card had no visible way to close it.

## 1 · Two unqualified one-axis properties

The interesting part is that this was never a gesture problem, so no amount of tuning the snap or the settle would have found it. `.note-sec-list` (and `.map-sum` in the expanded state) carried `overscroll-behavior: contain` — correct in intent, wrong in reach: an `overflow-y: auto` element is a **scrollport on both axes**, because a neighbouring `overflow-x: visible` computes to `auto`, so `contain` also refused to chain the horizontal gesture out to the track above. The card was swipeable from the title and dead from the notes.

Its twin is worth recording for the reason it survived review: the track's `touch-action: pan-x` is **intersected down the ancestor chain**, so naming one axis on the track took the vertical pan away from every scroller inside the slide. The comment beside it said the opposite — _"the slide's own content keeps the vertical one"_ — and the comment was the plausible one. Both are now two-axis: `overscroll-behavior-y: contain`, `touch-action: pan-x pan-y`.

## 2 · The height, and the one thing that was NOT a defect

Measured on the handset: **~535pt of a ~629pt canvas, ~218pt of it empty**, on a stop with enrichment and no notes.

`map-stop-traversal-v2.html` was re-inlined (it had drifted past three `map.css` amendments) and used to separate the two causes, which was the whole value of rendering rather than reading:

| measured                                          | value                 |
| ------------------------------------------------- | --------------------- |
| loaded slide, three slides all carrying notes     | 315px                 |
| the same slide with its note list **emptied**     | **315px — unchanged** |
| its note-list track, then                         | 0px                   |
| neighbour slide width vs the selected slide's     | 286px vs 286px        |
| `.map-cardclose`'s 44px target overlapping `נווט` | 3px                   |

So the empty space is the **equal-density decision** (ADR-0182's 2026-08-10 amendment, the owner's own call: _"I want them all to be expanded the same way… that makes it look more balanced"_) working as designed — every slide stretches to the tallest — and not the bound misbehaving. It is deliberately left in place: the peek is a 20px-wide strip of the neighbour's _full height_, so short neighbours would bring back the _"sliver, not a card edge"_ that amendment was written to end.

What ships is the cheap half of the trade: a second bound, `--map-card-max: 420px`, applied through `min()` so it can only ever bind **lower** than the existing guarantee. A 360×640 phone (arithmetic ~320px) is byte-identical; a tall phone loses ~115pt of card and the note list becomes the thing that scrolls, which is ADR-0148 §1's shrink order finally exercised rather than merely promised.

## 3 · Three dismissals, none of them visible

The card could already be closed by a tap on blank canvas, by system back, and by selecting something else — and none of those is drawn on it, because its body is deliberately inert there (ADR-0122 §7) where a list row answers a second tap. `.map-cardclose` is the identity row's **fourth column** rather than a corner overlay, and that is the only real decision in it: the card becomes a scroller once its pinned rows alone exceed the cap, so an absolute corner control would scroll out of reach at exactly the card's tallest. A column costs ~28px of the row's width and **0px** of its height — the axis this session was about. It runs `clearSelection` itself, per ADR-0103's rule that a close and a system back are one function.

The grid column is declared on `:has(> .map-cardclose)` and not in the template, which two near-misses earned: an implicit fourth track would have silently broken every `grid-column: 1 / -1` block below it (`-1` names the last **explicit** line), and a fourth `auto` in the template would have given every neighbour slide an 11px column gap it has no control to hold — the 286px-vs-286px row in the table above is that check.

## Left open

- `--map-peek` (20px) and `MAP_TRACK_SETTLE_MS` (120ms) were not reported on either way, so they stay recommendations rather than settled numbers.
- If 420px still reads tall, the next lever is **not** the notes: it is `.map-refs-foot`, measured at 44 → 82px on a slide narrower than the card. 38px of pinned height in the row that holds delete.
- Nothing here is a gesture change, so the pass's own two questions stay answered by one sitting on one handset.
