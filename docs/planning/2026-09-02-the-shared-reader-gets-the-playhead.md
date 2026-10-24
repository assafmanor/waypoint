# 2026-09-02 — The shared reader gets the playhead

**Task:** design, then build, the now-line for the live sharing page — the follow-up the owner
named when ADR-0217's marker was first built. **Shipped:**
[`mockups/the-shared-reader-gets-the-playhead-v1.html`](../../mockups/the-shared-reader-gets-the-playhead-v1.html),
ADR-0217's second 2026-09-02 amendment, and the build.

## The file had already written the design down

`lib/share-now-line.ts` deviates from `nowLinePlacement` on purpose and argues the deviation at
the line where it happens — and its last sentence is _"unify it with the app's when
`nowLinePlacement` grows its `inside` shape"_. That is a design note left for a future session,
in the place the future session would be standing. It made this a build with a decision already
taken rather than a design starting from a blank page.

## What reading it found that the note did not

**The deviation was a choice between two wrong answers, and only one of them was documented.**
End-based dragged the boundary to the top of any day whose first row is an all-day container —
that is the half the file records. Start-based puts the marker _below_ every row that has begun,
so at ⁦14:30⁩ on a day with a ⁦10:00–16:00⁩ tour and a ⁦14:00–15:00⁩ shrine, the page says two
things happening right now are behind you. Nobody wrote that half down, because from inside the
choice it is not a defect — it is the price of the other one. `inside` is what makes it visible
as a price.

## The fork the render decided

§6 was drafted recommending that the **mark** carry the clock on this page: `.sh-event` has no
`עכשיו` chip, so ADR-0217 §1's reason for the mark being a wordless shape is simply absent here
— the same reasoning that gave the boundary form its clock a week earlier. Drawn, it is
unusable. The gutter is ⁦11px⁩, so a chip at the arrow's height lands on the row's own title and
clock, which is the defect the owner rejected twice during ADR-0217's own design.

So the **row** says the word instead, exactly as `EventCard` does. That is the better answer for
a reason beyond the collision: it makes §1's premise true on every surface rather than adding an
exception to it. **The rule that survives is one sentence** — the mark is a shape wherever the
row it is in says the word, and says the time itself only where no row is involved.

Two things to carry forward:

- **A recommendation written before rendering is a hypothesis.** This is the second file in two
  days where the drawn version of the recommended arm was refused by its own picture. Both times
  the refusing measurement was a number already in the sheet (⁦11px⁩ of padding here; a ⁦12%⁩
  translucent fill last time).
- **A deviation is worth documenting at the deviation, and worth documenting as a PRICE.** The
  half this file recorded got fixed the moment the third option existed. The half it did not
  record survived until something was drawn at an instant inside a row.
