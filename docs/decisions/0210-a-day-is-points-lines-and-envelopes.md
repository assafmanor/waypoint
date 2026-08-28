# 0210 — A day is points, lines and envelopes

**Status:** Proposed 2026-08-28. **Nothing built** — the owner's instruction was to mock it up and
recommend, and to build after approving.
**Date:** 2026-08-28
**Reported:** the owner, against a real Iceland day on a phone — _"I feel like the car pick up, check
in/out, drive... They all look very similar visually. I want you to brainstorm and try to make them
more unique looking while keeping to the design language and principles."_
**Drawn in:** [`mockups/a-day-has-three-shapes-v1.html`](../../mockups/a-day-has-three-shapes-v1.html)
**Session note:** [2026-08-28](../planning/2026-08-28-a-day-has-three-shapes.md)
**Refines:** [0064](0064-day-transition-entries-and-home-band-trim.md) §B (the transition row's box),
[0206](0206-a-travel-time-belongs-between-two-points.md) §V1.1/§V1.3 (the journey block's box and
its tone arms), [0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) §1 (the stay row that
reuses the transition row's geometry), [0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) (the
floor/ceiling distinction this makes visible), [0184](0184-an-edge-can-be-a-window.md) (the window
as its fourth value). **Constrained by** [0028](0028-plan-violet-color-budget-dark-ready.md) rule 4,
which is what makes this a shape decision rather than a colour one.

## Context

### 1. The sameness was decided on purpose, three times, and each time it was right

This is not a row somebody drew carelessly. Each of the three components says, in its own comment,
that it copied its neighbour deliberately:

- `StayRow` — _"It reuses `.transition-row`'s geometry deliberately … because it is the same kind of
  row."_
- `.day-trv` — _"Deliberately the same shape language as `.journey` above."_
- `.day-trv-ic` — _"the day has ONE leading edge for icons and this joins it rather than starting a
  second."_

Three locally-correct reuse decisions, taken in three separate sessions, whose **sum nobody drew**.
That matters for the shape of the fix: the defect is invisible in every diff that produced it,
because each diff added one row to a list it could not see. So the answer cannot be "make row X look
different" — a fourth local decision is how a fourth near-identical box gets built. It has to be a
rule about what **kinds** of row a day has.

Measured off the rendered shipped CSS at ⁦360px⁩ (mockup §1): the transition row and the stay row
report **byte-identical** radius, background and badge (`12px` · the same `color-mix` result ·
⁦32×32⁩), because they are literally the same class; the journey block is `15px` and ⁦38×38⁩ and the
event card `15px` and ⁦40×40⁩. **Five of the day's six rows** are a rounded, amber-tinted,
badge-led box. The three-to-eight-pixel badge differences are exactly the kind of distinction that
needs a ruler.

### 2. Hue is not available — and it is not the missing axis either

Rule 4 / ADR-0028: amber is the clock and the commitment, teal is the place, violet is Plan. A car
pick-up, a check-out and a drive are all bound to time, so all three legitimately hold amber, and
there is no fourth colour to hand one of them. Worse, teal is already **spent inside the journey
block itself**, on the `on-way` arm — so a permanently-teal drive would erase the one state the
traveller switches on by hand.

What is unspent is **silhouette**, and the app already has a precedent for spending it.
`.day-ambient .day-total`'s own comment: _"The one row in this strip that is NOT a card, and that is
the decision."_ Dropping the box is already how this codebase says "a different kind of fact".

### 3. The app already computes the one distinction it does not draw

`edgeMeaning` (`packages/shared/src/icons.ts:448`) returns `exact | not-before | not-after |
window`. A flight departure is `exact` — a moment you can miss. A car **pick-up** is `not-before`
and its **return** `not-after`; a **check-in** is `not-before` and a **check-out** `not-after`.

So two of the three things the report names are, to the model, the same thing — and the third, a
flight, is categorically different and renders identically anyway. The difference is currently drawn
as **one Hebrew word** (`מ-` / `עד`) and nothing else.

## Decision

**A day is made of points, lines and envelopes, and each gets its own silhouette.** No new hue, no
new component, no new mechanism; every rule either removes paint from an existing box or re-points a
property on a node that already renders.

### §1 · The point keeps the box

A moment you must be somewhere — a pick-up, a check-in, a landing — stays `.transition-row` as it
is: the amber tint, the amber border, the ⁦3px⁩ amber spine. Once the other two families give theirs
up it becomes the **only** committed mark in the list, which is what it always meant.

Its badge becomes a **circle** (`border-radius: 50%`, one property). A point is a dot; a place you
spend time at keeps `.wp-event-badge`'s rounded square; a movement has no tile at all. Three marks on
**one** leading edge — which keeps `.day-trv-ic`'s stated rule rather than breaking it.

### §2 · The bound becomes visible

The mono clock gains a hairline box that is **open on the side time runs free**:

| `edgeMeaning` | reads         | drawn                                               |
| ------------- | ------------- | --------------------------------------------------- |
| `exact`       | `06:30`       | no box — a moment needs no bound                    |
| `not-before`  | `מ-00:00`     | open at the inline-**end** — time runs on from here |
| `not-after`   | `עד 11:00`    | open at the inline-**start** — time runs up to here |
| `window`      | `10:15–11:15` | closed on both                                      |

Logical properties throughout, so the openness follows the direction time runs in the list rather
than a hard-coded side. `.vt`'s geometry (ADR-0177 §2) as a **read-out** — same hairline, same radius
family, no press, no target, no `cursor` — and deliberately **not** `.vt`'s class: that primitive
means "a value you can change" and this is not one.

Measured cost: ⁦2px⁩ of row height, at `padding-block: 1px`. At `2px` it was ⁦4px⁩, charged to every
transition row in the app; the clock line already paid ~⁦20px⁩ when it moved under the title on
2026-08-13 and must not be re-charged for it.

ADR-0028's non-colour-redundancy rule runs the other way here for once: the word (`מ-` / `עד`) is
already in the row and is the redundancy **for** the shape, so the shape can be quiet.

### §3 · The line loses the box

The journey block stops being a card. Everything the box carried moves onto a **track** in the same
⁦38px⁩ column `.day-trv-ic` already occupies — the mark stays in the column, it stops being a tile —
and the track **overshoots its own box by the gutter** so it physically reaches the card above and
the card below.

**This is not ADR-0159 §3's rail.** That rail floated because it kept the list's rhythm and
therefore touched neither of the two cards it connected. Measured here: the gutter is ⁦10px⁩ and the
overshoot is ⁦10px⁩, so the track crosses it. A connector that touches is a connector; one that floats
is a decoration, which is why the first one was removed.

Height: **⁦58px⁩ → ⁦40px⁩**, against the ⁦70px⁩ event card it sits between — which also fixes an
inverted hierarchy nobody had named, the connector being nearly as tall as the thing connected. The
disclosure's touch target is held at ⁦48px⁩ by a ⁦4px⁩ `::after` overlay — `button.day-gap::after`'s
trick, for `button.day-gap`'s reason, reused rather than re-invented.

**The two tone arms split**, and the render is what made the case:

- **`miss` keeps its box, and its tile, and loses the track.** A leg whose leave-by has gone has
  stopped carrying you between two things, so it stops being drawn as the line between them — and a
  box is how this list says "look here". (The first pass kept the box by **accident**, on a
  specificity tie; looking at it settled the question instead of exposing a bug.)
- **`on-way` loses its box.** A state the traveller switched on themselves, about a leg going fine,
  needs to be legible and not loud. Teal rides the track and the glyph, the sentence stays `--muted`
  — `.day-trv-here`'s own split and its own measurement (teal is 3.35:1 on `--card`: enough for a
  graphic, not for prose).

### §4 · The envelope loses the box and the amber

**The code already says this twice and then draws the opposite.** `StayRow` carries no clock at all
(_"where in the day you actually walked through the door is not something the app knows"_) and
`.tr-bound` is deliberately `--muted` rather than amber — and both facts are then drawn inside the
loudest commitment mark in the list.

The bookend becomes a **bracket** whose open side points into the day: the row you woke in brackets
downward, the row you sleep in brackets upward. `dayBookendStays` already returns `{woke, sleeps}`
(ADR-0209 §1), so the direction is data the app holds, not a new prop. No fill, no border, no amber —
rule 4 has no colour to spend on a condition, and that is the finding rather than a compromise.
Height ⁦60px⁩ → ⁦52px⁩.

## Alternatives, and the measurements that killed them

Four candidates were drawn per family and all eight stay in the mockup, because for three of them
the measurement **is** the argument.

- **A hue for the drive.** Rule 4, in one line — and teal is already taken by `on-way` inside that
  very block.
- **Re-tuning the badge sizes.** That is what has already happened three times: ⁦32⁩ / ⁦38⁩ / ⁦40px⁩ are
  the three components' badges today, and that spread is precisely what does not read at arm's
  length. A difference that needs a ruler is not a difference.
- **The notch (drive, ב).** The most distinctive drawing in the file and the most expensive:
  `mask-composite` is unevenly supported, it clips the border too, and it makes any future
  background change a clipped-or-not question. More importantly it **keeps** the box — so it answers
  "looks different" without answering "still reads as an item rather than a connection".
- **The low line (drive, ג).** Cheap, improves the hierarchy, does not answer the report: a shorter
  box with the same tile is the same silhouette. Its **height was adopted into א**.
- **The inset (drive, ד).** A different width reads well in a two-row list and vanishes in an
  eight-row one — the eye reads the indent as spacing. Also spends ⁦44px⁩ of width at ⁦360⁩.
- **The band (stay, ב).** Renders strongly and is the closest runner-up: full-bleed bookends read
  as the day's floor and ceiling. Rejected because it answers a box with another box, and the
  full-bleed fights the ⁦16px⁩ inline padding every other row in the list keeps.
- **The horizon (stay, ג).** Clips the name at ⁦205px⁩ on the stress case below.
- **The ambient box (stay, ד)** — **kept as the live cheap alternative.** Zero new CSS: it is
  exactly the box the stay wore before ADR-0209 moved it into the list, and teal-for-a-place is
  legitimate under rule 4. What it does not do is differentiate by **silhouette**, so a busy day
  returns to being a run of boxes in two colours instead of one. It also gives the name the least
  room of any candidate — ⁦147px⁩ against א's ⁦267px⁩, because `.an` protects its read-out and lets
  the name give way — and it **clips** the stress-case name (`Gistihúsið Egilsstöðum við
Urriðavatn`, ⁦202px⁩) where א and ב do not.

## Consequences

- **The whole day gets shorter, which was not the goal and is worth stating.** ⁦499px⁩ → ⁦441px⁩ on
  the reported day; **⁦1154px⁩ → ⁦1058px⁩** on a fifteen-row day with six legs. The saving is per-leg,
  so it grows with exactly the days that hurt most.
- **`.day-trv`'s tone arms are re-specified**, and a build must state them rather than inherit them:
  the accidental specificity tie that kept `miss`'s box is the shape of bug this ADR is otherwise
  removing.
- **Trip and Plan both change**, from one set of rules — they render the same components off the
  same derivation and differ only in posture (ADR-0159 §1). Drawn in the mockup's §5.
- **Nothing in the data model moves.** No field, no prop, no migration. Every distinction drawn here
  is read from a derivation that already exists and already has consumers.

## Open, and the owner's call

- **`מ-00:00`.** In the reported screenshot the pick-up time is midnight — i.e. **no time was
  entered**. §2's open bracket makes that newly conspicuous: a floor drawn around a clock that says
  nothing. This is not §2's bug, it is §2 declining to hide it; whether an edge with no authored
  time should print a clock at all belongs to ADR-0171.
- **The hire is named twice, one row apart, with the same clock** — the ambient band says
  `Iceland Car Rental · איסוף הרכב · מ-00:00` and the row below says
  `איסוף הרכב · קפלאוויק · מ-00:00`. ADR-0209 §1 removed exactly this duplication for **stays**
  eight weeks ago; the hire never got the pass. It is a subtraction of one line and it is drawn as a
  third frame in the mockup's §5, deliberately **not** claimed as part of the shape rule: the
  question of which of the two gives way (the band's sentence, or the row) is a real choice and
  ADR-0209's reasoning does not settle it here.
- **The bracket has nothing to bracket at a list edge.** A day whose first row is a drive overshoots
  into nothing and the track shows a short tail. Measured, and deliberately not special-cased — a
  day that starts in motion is a day that starts in motion.
