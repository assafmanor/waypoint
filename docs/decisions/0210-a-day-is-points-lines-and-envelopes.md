# 0210 — A day is points, lines and envelopes

**Status:** Accepted 2026-08-28, on the owner's approval of the mockup. **Built** the same day —
see the build log at the foot, which records four things the build changed or added.
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
- **~~The hire is named twice, one row apart, with the same clock~~ — ANSWERED 2026-08-28, and
  built.** The owner: _"for consistency I'm voting no — same as hotel check in/check out days,
  right?"_ Right about the hotel, and the code confirms the mechanism: `DayView`'s strip already
  carries `.filter((e) => !stayRowIds.has(e.id))` — _"a stay named by its own row is not also named
  in the strip"_ (ADR-0209 §1).

  **But the hire is not given the hotel's treatment, and the difference is the point.** A bookend
  stay leaves the strip _entirely_ because its row carries the hotel's NAME, so nothing is lost. A
  hire's row carries the **place** and the strip carries the **company** (`Iceland Car Rental`,
  ADR-0163 §3) — dropping the strip row would delete the company from that day. So the row stays
  and **the clock gives way**: the strip prints `ambientSpanLabel`'s span count, the row keeps the
  edge. Named once, timed once.

  **What this amends:** the 2026-08-13 call that made the strip _borrow_ the row's placed clock so
  the two could not disagree. That solved consistency; the owner's answer is that they should not
  both print it at all. `placedEdgeOf` had exactly one production consumer on each day surface —
  this branch — so removing it leaves the helper used only by its own unit test, noted rather than
  deleted because the derivation is sound and a future surface may want it.

  **It generalises past hires.** The replaced branch fired for any ambient span whose edge holds its
  own row — a red-eye's departure/landing takes the same subtraction.

- **The bracket has nothing to bracket at a list edge.** A day whose first row is a drive overshoots
  into nothing and the track shows a short tail. Measured, and deliberately not special-cased — a
  day that starts in motion is a day that starts in motion.

## Build log (2026-08-28)

Built as drawn, with **four changes the drawing could not have caught** — three of them the same
class of defect this ADR is about (a rule that reads correct and paints wrong), found by rendering
the shipped sheets back through the mockup's own layout trees and by driving the real app.

1. **A block with more than a line in it gets its card back**, and the mockup never drew that: it
   drew the collapsed statement only. An open mode disclosure, or an arm carrying the acts row, is
   no longer one line — it is an object with contents, and its contents need a container or they sit
   loose on the day's ground. The condition is `.day-trv.open` and `:has(.day-trv-acts)`, chosen over
   a third class because the acts row's presence is a render decision in `DayJoinRow`, not a state
   the block is told about; `:has()` already ships in `tasks.css` and `map-pane.css`.

   This **amends §3's `on-way` arm in place**: that arm loses its box when it is a bare line and
   keeps it when it has grown a row. What §3 actually decided — that `on-way` is quiet, the hue
   rides the mark, the prose stays `--muted` — is unchanged; what decides the box is structure, not
   which arm it is on.

2. **`.day-trv.on-way`'s fill was still painting on the line arm.** Its shipped rule sets
   `border-color` and `background`; with the base rule now at `border: 0`, the `border-color` half
   is inert and says nothing, while the `background` half drew a **square-cornered teal band**
   across the list where a strand should be. Scoped to the carded case. Nothing in the diff showed
   it — only the render did.

3. **The `warn` corner mark was anchored to a tile that no longer exists.** `.day-trv-flag`'s
   `/-2.6` overhang was measured against a ⁦38×38⁩ tile (ADR-0206 §AK2); against the new invisible
   stretched column it dropped the triangle into the gutter, pointing at nothing. Re-anchored to the
   **glyph** on the line arm (`50% - 15.3px`: the ⁦19px⁩ glyph's corner plus the same overhang), with
   the carded arms taking the shipped offset back. Measured on both arms: the mark's centre lands
   within ⁦2–4px⁩ of the glyph's trailing-bottom corner, inside the column.

4. **`StayRow`'s `edge` is required, not defaulted.** A bookend is always one end or the other, and
   a default would silently draw every stay as a wake row on the day a caller forgot — the failure
   would be a bracket pointing the wrong way, which nothing would report. The type refused all seven
   existing test call sites, which is the check working.

**Verified:** `pnpm typecheck`, `pnpm lint` and `pnpm build` green; the full frontend suite (275
files, 4903 tests) green, including two new `StayRow` cases — one asserting the two ends differ
(a single-arm assertion passes a build where both ends draw the same bracket), one asserting the
row keeps `.transition-row`'s tree while dropping its commitment paint. Rendered in the running app
against the seeded trip in both themes: the wake bookend brackets down and the sleep bookend up,
both with `background: transparent`.

**Do not re-run `inline-app-css.mjs` on the mockup.** Its inlined block is the sheet **as it stood
before this build**, which is what makes its before/after columns mean anything; refreshing it would
make both columns draw the fix and the file would silently report a win it never measured — the
"grades its own homework" trap in `pitfalls.md`. The file is the dated record of the proposal, and
this build log is the record of what shipped.

## 2026-08-28 amendment — there is no carded arm, and §3's build log was wrong about it

**Owner, against the shipped build on a real day:** _"I think that the rows for being late (not
enough time) should be adapted to the same style now as well no? … Also when on the way / should
take off. Basically all leftovers."_

**They are right, and the build log's reasoning was backwards.** Item 1 above kept the box for
`miss`, for an open disclosure, and for any arm carrying the acts row, on the grounds that a block
with contents needs a container. On a real day that reads as the opposite of what this ADR decided:
the two late legs were the **only cards in a list of tracks**, so the one shape the eye uses to tell
a leg from a stop was spent on a **state** instead. A state may change a row's tone; it may not
change what kind of row it is. That is §1's whole argument, and the build spent it in the first
place it was tested.

So **every arm is the line.** `miss` takes `--miss` on the track, the glyph and the words and keeps
its `warn` mark — which is the shape doing the work the box was doing. `on-way` takes teal the same
way, with the sentence beside it still `--muted` (§3's measured split, unchanged).

**What made the card seem necessary, and what actually fixes it.** The track hung off
`.day-trv-ic::before`, which lives inside the _face_ — so on a block with a modes or acts row the
line stopped at the face's foot and the rest of the block hung off nothing, which is what read as
"loose on the day's ground". Moving the track to `.day-trv::before` makes it span every row the leg
owns, and the extra rows indent to the **text** column so they sit beside the line rather than on
it. The offset is stated once as the face's own arithmetic (`--trv-track`: ⁦12px⁩ of inline padding
plus half the ⁦38px⁩ badge column) rather than repeated as a literal.

**Measured on the case the mockup could not draw** (an `on-way` leg with a real acts row grafted
onto the rendered shipped CSS): the track spans past the face into the acts row, the acts row's
inline start lands on the text column exactly (⁦762px⁩ against ⁦762px⁩), the `עדיין כאן` mark clears
the track, and the block reports `background: rgba(0,0,0,0)` with `border-width: 0`.

**Two comments in the sheet were left describing arms that no longer exist** and have been
corrected in place — the `overflow: visible` note and the face's padding note both explained
themselves by contrast with a carded arm. A comment that survives the rule it describes is the
same defect class as the specificity ties above, one layer up.

**`:has(.day-trv-acts)` is gone with them**, so the sheet no longer branches on whether a block grew
a row: `.day-trv` has one silhouette and three tones.
