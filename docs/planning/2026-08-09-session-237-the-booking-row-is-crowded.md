# 2026-08-09 · session 237 — the booking row is crowded, and the question underneath it

**Outcome:** [ADR-0179](../decisions/0179-a-booking-row-says-what-then-when-and-the-code-is-a-read.md), mockup [`booking-row-crowding-v1.html`](../../mockups/booking-row-crowding-v1.html). Designed and drawn; **not built**.

## What was asked

The owner, hours after ADR-0178 shipped the day row's what-then-when split, with three screenshots of the Index bookings screen (flights / lodging / activity filters):

> Now I'm worried that the booking rows are too crowded as well. See screenshots. […] design and mockup the booking row. It should have a similar style and approach to the event row. Lets also try to think if all information is necessary to be on the card row itself instead of only being on the booking preview only

Two questions, and mid-session the owner pushed back on the answer drifting toward only the first:

> Have you considered what belongs in the card row and what should be only on the booking details?

That push is what turned the session. The layout work had reached a point where the measurement was **forcing** the content question — the when line was 36px over budget at 360px — and the right move was to answer the audit rather than keep tuning flex properties. Everything after that point is the second question.

And, once decisions started removing visible facts:

> I need you to visually show these decisions in the mockup to make sure we're not making a mistake

Which caught four real errors, none of which reading the CSS would have produced. See "What rendering changed" below.

## Forks put to the owner, and the answers

Both were drawn in the mockup before being asked, with all arms live.

| Fork                                                                | Answer                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| The confirmation code: off the row / onto the when line / kept      | **Off the row.** Detail only. Title 43px → 184px at 360px.                                                    |
| The transition verb: always / only on a span's closing edge / never | **Only on a closing edge** — where it is the one thing that can say _which_ end of a span the time refers to. |

Both were the recommended arm, and both were recommended on precedent rather than taste: the event row already deleted the code (ADR-0174 §8), and the verb's redundancy on a start edge is the same 1:1 type→verb map the badge already draws.

## What reading the code changed

Four things, none of which survive the screenshots alone, and all of them in the ADR's Context:

1. **The code is this row's `.bld-time`.** `.wp-listrow-right` is `flex: 0 0 auto`, so the trailing slot is sized by its own widest content. Identical cause to ADR-0178's, one screen over, at 43px of 330 against its 48px of 302.
2. **`ListRow` is not what is wrong.** Three call sites; documents pass a byte size, notes pass a glyph, **bookings alone pass an unbounded string.** So the fix is a composition change and nothing forks the shared component.
3. **The event row already made this call and wrote it down** — `.wp-event-m`'s "GLYPHS ONLY […] no place name, no confirmation code". This made §2c a consistency argument rather than a taste one, which is much cheaper to accept.
4. **The type chip is drawn four times**, not once: badge glyph, badge tint, transition verb, and the active filter chip above the list.

And one check that mattered for the whole audit: **the detail sheet already carries every fact the row draws**, most of them more precisely (both span edges as full day-times with labels, duration, code, IATA, location, provider, room, wifi, journey, round-trip pair). Verified in `BookingDetail.tsx`, not assumed. Nothing removed is lost.

## What rendering changed — the part reading could not have given

The owner's "show me visually" is what produced all four of these. Each was a correct-looking proposal that the render disproved.

1. **`flex-wrap: wrap` stacked instead of wrapping.** Drawn on the reading that ADR-0178 §3 lets the day card's when line wrap. But flex distributes negative free space only _within_ a line, so a container permitted to wrap never asks its shrinkable child to shrink — the two rows carrying marks went to **four bands** at 360px. `event-card.css` states this verbatim (ADR-0152 §6c); the app had already paid for the sentence and the first draft did not apply it. The distinction from 0178 is real: what wraps there is a fixed-width **zone pill** with nowhere to shrink to.
2. **The ellipsis ate the day, not the verb.** With `verb · day` as one shrinkable span the fold takes the _tail_: the check-out row rendered `צ׳ק-אאוט …` and lost `מחר`. Split into two items so the priority is asserted rather than left to source order.
3. **One annotation, not two.** Verb + duration still overflowed by 23px, and the verb gave way to `צ׳ק-...` — no longer distinguishing check-out from check-in, on the single row it was kept for. The slot holds one. On a closing edge this is also a **correctness** fix: `formatBookingDuration` returns the whole stay's length, so `11:00 · 5 לילות` on a check-out row reads as five nights still to come.
4. **The marks had to leave the meta line.** ~21px each and rightly unshrinkable, taken from a line already in deficit. Moved to the title line, which has slack — and which returns the row to agreement with the day card, where the marks have never competed with the when line.

Final state, measured across ten rows, both themes, both widths: **no ellipsis, every row exactly two bands, sweep clean.**

## An instrument correction worth carrying forward

ADR-0178's build log made a two-dimensional collision sweep mandatory for any row-layout mockup. **That version reports a false positive on flowing text.** It reads `getBoundingClientRect`, and a wrapped **inline** element's bounding box is the union of its fragments — it claims the ragged space beside each line, where the element paints nothing. Run here it reported `9×10 · .bk-dur ↔ .icon` on the **shipped** row: exactly the "passes beneath" vs "collides with" confusion the sweep exists to prevent, now committed by the sweep itself.

It never met the case because it swept the direct children of a **grid**, all block-level. This file's version reads `getClientRects()` — one rect per fragment, the bounding box for a block — and skips same-element pairs. That is the shape the next row mockup should copy.

A second, smaller one: the first line-counter divided a height by a guessed line-height and reported "10 lines" on a 96px row; the second deduped `getClientRects()` by `top`, which counts a 11.5px clock and 10.5px prose on one baseline as two lines; and the third — counting overlapping y-intervals over per-text-node rects — is the one that agrees with what is on screen. Worth noting because the second version **flattered the proposal**: `.wp-listrow-meta`'s only child is a flex box, so a Range over its contents returned one rect for two wrapped lines, while the control frame's inline `.link-cue` fragmented honestly. ADR-0178's "measure the element you moved" trap, in the measuring apparatus rather than the design.

## Deliberately left open

- **Is `עוד 33 ימים` the right fact for an index at all?** A countdown is Home's language; an index is a reference, and "when is my flight" may read better as a date (ADR-0176). That is a change to the fact rather than to the crowding — next thing worth measuring, not folded in here.
- **Device pass** (ADR-0017): whether a muted day beside a full-ink clock reads as hierarchy or as something switched off, and whether losing the verb on start edges is felt on a screen full of ✈️ rows where it never disambiguated anything.
