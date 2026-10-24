# 2026-08-28 — The day's rows all look the same, and the fix is a shape rule

**Ask:** the owner, against a real Iceland day on a phone, with a screenshot — _"I feel like the car
pick up, check in/out, drive... They all look very similar visually. I want you to brainstorm (by
yourself) and try to make them more unique looking while keeping to the design language and
principles. Mockup ideas for each, come up with recommendations. Don't hesitate to think outside the
box and even come up with new shapes and original ideas. Try to not be generic."_ Build after
approving.

**Produced:** [ADR-0210](../decisions/0210-a-day-is-points-lines-and-envelopes.md) (**Proposed**,
nothing built) and [`mockups/a-day-has-three-shapes-v1.html`](../../mockups/a-day-has-three-shapes-v1.html).

## What reading the code changed about the ask

**The sameness was decided on purpose, three times, and each time it was right.** All three
components say so in their own comments — `StayRow` reuses `.transition-row`'s geometry
_"deliberately … because it is the same kind of row"_, `.day-trv` is _"deliberately the same shape
language as `.journey`"_, and `.day-trv-ic` joins the day's _"ONE leading edge for icons"_ rather
than starting a second. Three locally-correct decisions from three sessions (ADR-0064, ADR-0206,
ADR-0209) whose sum nobody drew.

That changed the shape of the answer. A fourth local decision — "make the drive look different" — is
how a fourth near-identical box gets built. What the file proposes instead is a rule about the
_kinds_ of row a day has, so the next row that arrives has a family to join.

**Hue was ruled out in one line, and it was not the missing axis anyway.** Rule 4 / ADR-0028: all
three are bound to time, so all three legitimately hold amber, and there is no fourth colour. Teal is
worse than unavailable — it is already spent _inside the journey block_ on the `on-way` arm, so a
teal drive would erase the one state the traveller switches on by hand. What is unspent is
silhouette, and `.day-total`'s own comment is the precedent: _"the one row in this strip that is NOT
a card, and that is the decision."_

**`edgeMeaning` already computes the distinction the row does not draw.** A pick-up is `not-before`
and a check-in is `not-before` — **two of the three things reported are the same thing to the
model** — while a flight is `exact` and renders identically anyway. The difference is drawn today as
one Hebrew word and nothing else.

## What the render paid for, four times

1. **The census is byte-identical, not merely similar.** The transition row and the stay row report
   the same radius, the same resolved background and the same ⁦32×32⁩ badge, because they are the
   same class. Five of the day's six rows are a rounded amber-tinted badge-led box.
2. **The bracket had to move from the badge to the row.** Drawn around the ⁦34px⁩ badge it read as a
   stray corner beside the hotel glyph; at the row's own height it embraces the row and the
   direction becomes legible. Same idea, wrong host — only visible drawn.
3. **A false finding, caught and reversed.** The first pass reported candidate ד as _truncating_ a
   long hotel name, off a screenshot that plainly showed it clipped. That screenshot had **no
   webfont**, so every glyph was the fallback's wider one; under the real Assistant the name fits.
   `pitfalls.md` warns about exactly this and it still landed. The row now reports the **box** each
   candidate gives the name — a structural fact that holds whatever name you type — plus a genuine
   stress case (`Gistihúsið Egilsstöðum við Urriðavatn`) where ג and ד do clip and א and ב do not.
4. **A specificity tie decided a design question.** `.day-trv.miss` is (0,2,0) and the proposal's
   `.bld-trv` is (0,1,0), so a missed leg kept its box by accident — a pink card in a frame whose
   prose said the box was gone. Looking at it settled the question rather than exposing a bug: a leg
   whose leave-by has passed has stopped carrying you between two things, so it stops being drawn as
   the line between them, keeps the box _and_ the tile, and drops the track. `on-way` goes the other
   way and loses its box. Both are now stated explicitly, because inheriting that tie is the shape
   of bug this ADR is otherwise removing.

## The forks put to the owner

1. **א · the strand** for the drive (recommended), against the notch / the low line / the inset. All
   four stay drawn; the notch is the prettiest and the measurement is the argument against it.
2. **א · the bracket** for the stay (recommended), against the band / the horizon / the ambient box.
   **ד · the ambient box is the live cheap alternative** — zero new CSS, the shape the stay wore
   before ADR-0209 — and it is kept in the file because if the owner wants the cheap answer, that is
   it. Its cost is measured: it differentiates by hue, not silhouette, and it gives the name the
   least room of the five.
3. **The bound mark** — box / rule / none, with the box recommended at a measured ⁦2px⁩ of row height.
4. **Three feel numbers as controls**, defaults shipped as the recommendation: the track's weight
   (⁦2px⁩), its overshoot into the gutter (⁦10px⁩ — the number that decides whether it touches), and
   the bracket's corner radius (⁦9px⁩). A device pass owns the final values.
5. **Open, and not claimed:** `מ-00:00` is an unset pick-up time that §2 stops hiding (ADR-0171's
   question, not this one), and **the hire is named twice one row apart with the same clock** — the
   duplication ADR-0209 §1 removed for stays and never applied to hires. Drawn as a third frame,
   deliberately not folded into the shape rule: which of the two gives way is a real choice.

## Approved and built, the same day

The owner approved the recommended defaults — drive **א** (the strand), stay **א** (the bracket),
the bound box, the circular badge — and asked for the build on the same PR. ADR-0210 is **Accepted**
and its build log records what shipped.

**The build found four things the drawing could not**, and three are the same class of defect this
ADR is about — a rule that reads correct and paints wrong:

1. **A block with more than a line in it needs its card back.** The mockup drew the collapsed
   statement only; an open disclosure or an acts row has contents, and contents need a container.
   This **amends §3's `on-way` arm in place**: structure decides the box, not which arm it is on.
2. **`.day-trv.on-way`'s fill was still painting on the borderless arm** — a square-cornered teal
   band across the list. Its `border-color` half had gone inert against `border: 0`, so nothing
   said the `background` half was still live.
3. **The `warn` corner mark was anchored to a tile that no longer exists**, and dropped into the
   gutter pointing at nothing. Re-anchored to the glyph, measured on both arms.
4. **`StayRow`'s `edge` was made required rather than defaulted** — a default draws every stay as a
   wake row on the day a caller forgets, and nothing would report it.

Both (2) and (3) were found by **rendering the shipped sheets back through the mockup's own layout
trees** with the proposal block stripped — if the "today" column draws the new design from shipped
CSS alone, the build carries it. Worth keeping as a technique: it is the mockup format run
backwards, and it cost one scratch copy.

## Still open, and deliberately not built

Both were flagged in the mockup as needing an owner call and neither was answered, so neither
shipped: whether an edge with no authored time should print a clock at all (`מ-00:00`), and the
hire being named twice one row apart with the same clock.
