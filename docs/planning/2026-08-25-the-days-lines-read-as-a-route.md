# The day's lines read as a route — a design session on the map's polylines

**Date:** 2026-08-25
**Kind:** design session **and the build it was approved into** (M7b of the routes epic)
**Mockup:** [`mockups/the-days-lines-read-as-a-route-v1.html`](../../mockups/the-days-lines-read-as-a-route-v1.html)
**Decides:** [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) §AC (amended in place)
**Board:** [routes epic](2026-08-24-routes-epic-milestone-board.md) — M7b

## What prompted it

M7 (#706) and its follow-up (#707) shipped, and the owner ran the real app on a real trip in
Iceland. Four things came back, in two messages, with screenshots:

> in plan mode it still shows an amber poly line for the first leg of the day which is not needed, I
> would much rather have all lines render the same in plan mode but: a selected stop somehow marks
> their legs differently so that they stand out more · a way to easily distinguish what line connects
> to what stops · maybe but not sure, a numbering for the lines. Probably not the best approach but
> it would be great if we had some visual aid to help us understand the route better at a glance

> when the stop doesn't sit exactly on a path the line just stops beside it and doesn't lead directly
> to it, which looks kind of awkward and could even be confusing at times.

And the instruction that shaped the session: **"We'll have to mockup all of these before building."**

## What reading the code changed, before anything was drawn

**Two of the four turned out to be deletions rather than features.**

- **The amber first leg is an orphaned workaround.** §AB2's third arm (`→ the day's first leg`)
  exists only because Plan mode drew nothing at all, and §AB5 — in the _same PR_ — made every leg
  draw its real path. The reason expired one commit after it was written. Deleting the arm restores
  §D8's own wording.
- **Numbering is already answered.** ADR-0121 §6 put the order on the pins for exactly the reason
  the owner is reaching for, and said so: _"a line between two stops is symmetric and never said
  which end you reach first."_ The owner's own doubt (_"probably not the best approach"_) is correct.

**And two of the four are one problem.** "Which line connects what" and "the line stops beside the
stop" are both about what happens at a leg's **end**. The router snaps every endpoint to the nearest
routable edge, so a leg _always_ has a gap there — usually sub-metre, occasionally hundreds. Give
that gap a mark of its own and the same mechanism answers both.

## What the render found that reading could not

**The obvious answer to "tell the legs apart" is wrong, and only the screenshot says so.** A
"collar" — a constant gap before each pin — is invisible on a line that is **already made of gaps**.
The shipped dash is `[2, 2]` at weight 2.5, i.e. 5px on and 5px off; a 9px collar is 1.8× a gap the
eye already discards, and the two frames are indistinguishable. The file keeps the failed candidate
drawn, beside the measurement that kills it, because that is cheaper than someone re-proposing it.

The answer that does work is a **solid dot** at each leg end — the one mark a dashed line cannot
accidentally produce. Its cost is stated rather than buried: a third source/layer pair in
`DayConnector` (a `circle` layer over the legs' trimmed endpoints).

**Two more, both mine, both invisible in source:**

- **The pins and the lines were in mirrored coordinate spaces.** `inset-inline-start` resolves to the
  _right_ edge under `dir="rtl"`, while SVG `x` is always measured from the left — so no pin sat on
  its own route. **A map canvas is the one surface in this RTL app that is not RTL**: north is up and
  east is right whatever the text direction, so its markers and its geometry must share one
  _physical_ coordinate space. (`map-split-v2.html` has the same mirroring; harmless there, because
  its connector is decorative.)
- **`§D8` rendered as `D8§` in my own captions** — `§` is Bidi-neutral, exactly as §Z5 recorded when
  the same thing happened in the first routes mockup. Fixed with ADR-0118's isolate. Worth noting
  that a documented trap still shipped into a new file: the fix has to be applied when the string is
  _written_, not remembered.

## What was put to the owner, and what this session recommends

The table below is how the session ended: recommendations, drawn but unbuilt. **The owner approved
them the same evening and the build landed in the same PR** — see _What the build cost_ at the foot,
and §AC6 for the two things only CI could tell us. The pick on §AC2 was the one that could
reasonably have gone another way; it went as recommended.

| #    | question                      | recommended                                                             | rejected, and why                                                                                                          |
| ---- | ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| §AC1 | Plan mode's default           | **no amber at all** — delete §AB2's third arm                           | keeping the arm and painting it neutral: leaves a concept in the code with no expression on screen                         |
| §AC2 | what a selected stop does     | **the arriving leg amber, the departing one weighted, the rest dimmed** | both legs amber — 2× §D8's ration, and it reads as a highlighted route rather than a marked stop                           |
| §AC3 | telling one leg from the next | **a solid dot at each leg end**                                         | the collar (invisible, measured); alternating hue (root rule 4 — the hues are all spent)                                   |
| §AC4 | numbering the legs            | **no** — the pins already carry the order                               | a midpoint label: a second place for one fact, and all three land on the line itself                                       |
| §AC5 | a stop off the network        | **an approach stub** — thinner, dotted, ending at the dot               | stitching straight to the pin (claims a path nobody walks); dropping the leg (deletes a correct route for an unknown tail) |

## The owner's review of the mockup — one correction

> the "we don't know this" dotted lines for where the stop doesn't sit on the a road — I like this,
> but you rendered two lines that connect to the two separated lines for before and after, which
> looks a little off. I think that you should render only one line

Accepted, and it exposes a modelling error rather than a styling one. The first draft drew the stub
**per leg end**, so an interior off-network stop got **two** — one tail from the arriving leg, one
from the departing leg, meeting near the pin in a V. **A stop meets the network in one place**, so
the two tails were the same fact drawn twice: a double claim, not just a busy picture.

The stub now belongs to the **stop**. It runs to the **arriving** leg's endpoint (§AB2 already makes
that a stop's canonical leg, so the two answers cannot disagree), falling back to the departing leg
only for the day's first stop. §AC5 records it; the rejected two-tail version is in the mockup's
notes panel so it is not re-proposed.

## What the build cost, once it happened

Approved and built in the same PR. What the session predicted, and what it got wrong:

- **Right:** `MAP_CONNECTOR` grew the dot and the stub as named constants, per-theme where they
  carry colour (ADR-0158 §16 — a colour computed in JS cannot join a CSS remap). The stub threshold
  and the dot radius remain **feel calls** on the mockup's defaults (⁦16px⁩, r≈⁦3⁩), still owed a device
  pass.
- **Wrong, and by more than a little:** the session costed this at "a third source/layer pair". It
  is **2 sources and 4 layers** — the three line treatments share one source and split by `filter`,
  but only the dots could not. §AC6 corrects the estimate rather than leaving it standing.
- **Not predicted at all, and the expensive one:** §AC3's collar is a screen distance, so the drawn
  geometry became a function of the camera — and re-deriving it on `zoomend` mutates the map's style
  exactly as the app settles after a camera fit. That took `e2e/place-know.spec.ts` from **⁦38s⁩ and
  green** to **⁦1.1m⁩ with its stability assertions failing**, on both e2e jobs. The redraw itself is
  ⁦12ms⁩; _when_ it landed was the whole problem. Deferred off the settling frame and thresholded at
  half a zoom level, it is green and slightly faster than before.

**The lesson worth carrying, because four confident guesses came first:** the circle layer, the two
dashed layers, the near-zero stub dash and the layer count were each blamed, tested against `main`,
and exonerated. A performance claim about a canvas is a **measurement**, not a reading of the diff —
and bisecting against the merge base is what actually answered it.
