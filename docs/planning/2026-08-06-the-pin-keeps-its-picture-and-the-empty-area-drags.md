# 2026-08-06 — A pin keeps its picture at every size, and the sheet's empty area drags (built)

Second round of the day, after `2026-08-06-the-search-answers-on-the-canvas-built.md` shipped. Two
owner reports, both amended into the ADRs they belong to rather than given a new one
([ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) §18,
[ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md)'s 2026-08-06 amendment). This
note is only what the build found.

## Reversing a measurement's conclusion is not reversing the measurement

The thumbnail report is the interesting one to record, because §16's number was **right** and the
decision built on it was wrong. 48px of pin is genuinely where a head clears ~30px of picture; at
`half` a 34px pin genuinely carries ~21px, and the mockup genuinely read that as a texture rather
than a subject. Every step holds.

What it could not see is that it was weighing **one pin at one size**. The cost it missed is a
property of the surface over time: a pin that shows a photograph at one sheet stop and a glyph at
the next is the same object changing what kind of thing it is, on a drag. That is not a thing a
mockup of a pin can contain, and it is exactly what the owner's _"after playing with that"_ found.

Worth keeping as a shape: **a measured threshold is only as good as the question it was measured
against.** §16 asked "can this be read?", got a defensible answer, and shipped it as if the answer
to "should this be drawn?" were the same. The fix is not a better number — it is one fewer
threshold, reusing the one the canvas already had.

## The flex column nearly took the scroll with it

The empty-area drag is one flex spacer, which is a pleasingly small mechanism — and making a
**scroller** a flex column has a trap in it that would have shipped silently. Flex items default to
`flex-shrink: 1`, so a list taller than the sheet gets **compressed to fit** rather than
overflowing: the scroll stops existing, on the one scroll region this component has. Nothing in the
unit suite can see it, because jsdom lays nothing out.

`.wp-snapsheet-body > :not(.wp-snapsheet-slack) { flex-shrink: 0 }` is the guard, written as a
`:not()` and not `> *` so it cannot end up in an equal-specificity tie with the slack's own `flex`
shorthand — the two agree today, and a tie resolved only by source order is what ADR-0167 §9
records losing a measured layout to once.

**And the gate needed a real engine to assert at all.** `flex: 1 0 0` versus a long list's zero is
the entire design, and it is a layout fact:
[`e2e/snap-sheet-slack.spec.ts`](../../frontend/e2e/snap-sheet-slack.spec.ts) is a new spec in the
same shape `map-pin-photo.spec.ts` uses — the app's own stylesheet over markup mirroring the
component, in Chromium. `SnapSheet.test.tsx` says in as many words which half it cannot reach.

One thing that spec got wrong first and is worth passing on: it loaded the stylesheets with
`<link href="file://…">`, and `setContent` leaves the document on `about:blank`, which **blocks a
file subresource**. So no CSS applied at all and four of five assertions failed against the
browser's defaults. `page.addStyleTag({ path })` is the idiom, which is what the existing spec
already used.

## What is left

Whether a photograph reads at all at `--pin-base`'s 34px floor on a real screen is now the only
thing between "consistent" and "noise", and it is a device question. If the answer is no, the lever
is ADR-0123's floor — not a new gate on the pin. And a **full** list still has no empty area to drag
from, which is the half of the second report this deliberately does not build: that one needs
overscroll chaining, and it is the case where a drag and the list's scroll genuinely do compete.
