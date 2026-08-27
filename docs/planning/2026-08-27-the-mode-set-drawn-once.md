# M8a — the mode set drawn once, as a set (2026-08-27)

**Milestone:** M8a of the routes epic ([board](2026-08-24-routes-epic-milestone-board.md)).
**Branch:** `routes/m8a-draw` · **PR:** [#726](https://github.com/assafmanor/waypoint/pull/726).
**Deliverable:** [`mockups/the-mode-set-and-transit-declared-v1.html`](../../mockups/the-mode-set-and-transit-declared-v1.html).
**Decisions:** amended in place into [ADR-0206 §AL](../decisions/0206-a-travel-time-belongs-between-two-points.md).
**Scope:** `mockups/` + `docs/` only. No app code, so M9/M10/M11 were never blocked.

**Status: with the owner, round 3.** §M forbids coding what has not been drawn, and M8b may not
start until this drawing is signed off. Round 1's review asked for RTL variants of the directional
glyphs; that is §5 below, and [ADR-0138 §10](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md)
is its decision record.

## Why one file rather than three

Three cards had each asked for part of one icon set — §AA3's walk/car/bicycle glyphs, §AA4's תחב״צ
mark and suppressed-duration row (plus, since 2026-08-27, the declared leg's own straight segment on
the canvas), and §AK's composited warning mark — and M6e's card already said the set "gets drawn
once". ADR-0139 is the precedent for what happens otherwise: three settle affordances drifted on
**four** axes while every test stayed green, because the drift was in the **vocabulary** and not in
the geometry.

## What reading the code changed, before anything was drawn

Five things, and the first reframes the milestone. All five are in §AL; they are listed here because
this is where a reader looking for "what did the session find" will look.

1. **§AA3 has been half-satisfied since M6a.** `ui/Icon.tsx:238-245` already carries `walking`,
   `cycling` and `driving` — coded from the v2 mockup's own **proposal** frame, the one thing that
   file labelled as not from the code. §AA3 said "draw them at 24px before coding" and the order came
   out reversed. Nothing about them needs changing, which is the useful half; the cost is that §1 of
   this file is a confirmation pass, and §Z5 §M5's word chips had to be **drawn back by hand** to
   have a baseline at all.
2. **`ticket` was never free.** `constants.ts:1520` is `booking: 'ticket'` and four screens spend it
   on that meaning. Standing it in for a mode is the `sync`/`swap` drift ADR-0138 exists to end —
   which `Icon.tsx`'s own comment states in as many words, two dozen lines above the entry that does
   it.
3. **`warn` is not free either, once §AK claims it.** The v2 mockup drew the transit "no estimate"
   line with `icon('warn')`; both meanings would have landed on one block in one release.
4. **§AK2's stated precedent does not exist.** There is no avatar badge in
   `ui/primitives/avatar.css`, and ADR-0133 §6/§12 are the picture page's states and the upload's
   trust class. `PlaceBadge`'s corner mark is the idiom, and a better one.
5. **The un-routed fallback and the declared segment are the same geometry by construction** —
   `MapDayLeg.path` is documented as either, and both take the connector's paint. Only the paint can
   separate them, which is what the canvas section had to measure.

## What the render decided that reading could not

- **The composited mark costs no height.** 58px with it and 58px without, and `.day-trv`'s
  `overflow: hidden` does **not** clip the overhang (4.2px of slack) — ADR-0167 §11.2's trap,
  checked rather than assumed.
- **`line-cap: round` eats the dash gap.** Half the stroke width at each end of every dash: 3.5px
  off a 4.2px gap, so the declared segment would have read nearly solid — asserting the path it
  exists to disclaim. Butt caps, deliberately unlike `ROUTE`.
- **transit × warning mark is unreachable.** A declared leg has no duration, so no arm that earns
  the mark can occur. §AK2's "8 with תחב״צ" is 7.
- **A declared leg's free-time strip states the raw hole**, because there is no duration to net out.
  A cost to state, not a bug to fix.

## Two of this file's own measurements were wrong, and both are recorded

Neither was caught by reading, and one of them is a mistake this ADR had already made.

- **An intersection computed one-sided reported 180% of the mark** inside a box it overhangs — a
  number that cannot exceed 100% by construction, which is the tell. In RTL the inline end is on the
  **left**, so a one-sided subtraction measures the tile's whole width.
- **The mode row's chips were compared against the row's border box**, which includes 12px of inline
  padding on each side. That overstates the space by 24px and reports a row that fits while it
  visibly clips a control — and **it is §AA4's own error**, whose "four chips fit one row at 360
  (239px of 312px)" was measured in the same wrong box. Against the real inner box, glyph+word is
  327px of 308px and does not fit; glyph-only is 194px of 308px and is the only shape that reaches
  ADR-0017's 44px floor.

The second one also exposed a defect in the proposal rather than only in the measurement: a row that
does not fit inside `.day-trv` **disappears** rather than growing, because `.wp-chip` is
`flex: 0 0 auto`/`nowrap` under an `overflow: hidden`. The row now declares `flex-wrap: wrap` as a
guard.

## Forks put to the owner

Everything below is drawn, defaulted to the recommendation, and switchable in the file.

| #   | fork                                             | recommendation                                                                                                                                                              | where             |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | The תחב״צ mark: a new glyph, `ticket`, or a word | **A new glyph** — a front-facing bus. `ticket` means "a booking" in four screens; a lone word inside a row of three glyphs is ADR-0138's own inconsistency                  | §1c · §AL2        |
| 2   | The composited mark's halo                       | **A drop-shadow ring** in `--card` — the bare mark and a `--card` disc are both drawn beside it                                                                             | §2a · §AL4        |
| 3   | Which corner the mark hangs on                   | **Bottom-inline-end**, `PlaceBadge`'s own corner                                                                                                                            | §2a               |
| 4   | The mark's size                                  | **15px** on the 38px tile (39%) — 13px loses the bang inside the triangle, 17px starts taking from the mode glyph. **A control, not a decision: this one wants real glass** | §2a · §AL4        |
| 5   | The mode row's shape                             | **Glyph only**, at 44px, word in `aria-label` — the only shape that fits AND meets the touch floor                                                                          | §3b · §AL7        |
| 6   | The declared segment's dash rhythm               | **`[3, 1.2]`** → 10.5px on / 4.2px off at weight 3.5                                                                                                                        | §4 · §AL6         |
| 7   | Its line-cap                                     | **Butt** — round eats the gap and the line reads as the route                                                                                                               | §4 · §AL6         |
| 8   | Which glyphs mirror in RTL                       | **`walking` + `cycling` only** — a named allowlist, not "everything asymmetric" (`clock` mirrored reads a different time). The other 7 candidates are a backlog line        | §5 · ADR-0138 §10 |
| 9   | The mode row: always-on or a disclosure          | **A disclosure**, caret from `.wp-event-chev` — 55px/block and 452px on a four-hole day otherwise                                                                           | §6 · §AL10        |
| 10  | An in-progress indicator on a switch             | **None** — a switch issues no request. A per-leg spinner was already rejected, and that file still awaits your sign-off, so it is open                                      | §7 · §AL11        |
| 11  | What a gate-refused mode says                    | **`אין הערכה ל<מצב> כאן`** — `רחוק מדי` reads better and is false for a point in no cluster                                                                                 | §7b · §AL11       |

## Round 2 — the owner's review of the drawing (2026-08-27)

> _"All glyphs that have a direction should have RTL variants. For example the person should be
> facing left and not right if the app is in Hebrew. The bike as well."_

Right, and the app already owns the mechanism — which is what makes this cheap. The decision is
recorded in **[ADR-0138 §10](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md)**,
not in ADR-0206: §AA3 is only what made it _visible_ (a walker and a bicycle are the app's first
`Icon` entries depicting a person moving), but the rule is about the icon vocabulary, and that is
ADR-0138's subject. Drawn as the mockup's §5, with a direction toggle over the whole page.

- **One declaration.** `scaleX(var(--dir))`, off the token `tokens.css` already calls "the one place
  a direction is named", with `NavArrow` as the precedent one layer down. Verified off the computed
  matrix rather than the custom property: `scaleX -1` in RTL, `scaleX 1` in LTR.
- **The sign lands opposite to `NavArrow`'s, deliberately.** That file authors RTL-first; an icon set
  authors right-facing, and these paths already ship that way. Reading the token instead of writing
  `-1` is what keeps the rule from caring which is which.
- **A named `MIRRORED` allowlist, and `clock` is why it cannot be a rule of thumb** — mirrored it
  reads a different time, in an app whose whole subject is time. `check` is the second case.

### What the measurement changed about the answer

Symmetry is read off the rendered path (240 samples via `getPointAtLength`, matched
nearest-neighbour against the set mirrored about `x=12` — nearest-neighbour because mirroring
reverses every subpath's traversal order, so an index comparison reports a huge error for a
perfectly symmetric glyph).

- **Only 2 of the 4 mode glyphs need the rule.** `driving` and the new `transit` are symmetric — and
  **the front view §1c chose for legibility is what makes `transit` need no RTL variant either.** One
  decision paid twice, and worth knowing before someone later "fixes" the bus into a side view.
- **"Asymmetric" and "has a direction" are different sets: 30 against 9.** That gap is the entire
  reason the list is explicit rather than derived.
- **The threshold is not a judgement call.** Symmetric glyphs top out at 0.33 (`calendar`),
  asymmetric ones start at 1.74 (`members`) — an empty band, so any value inside gives the same 58
  answers.
- **The audit had to be app-wide, so the file now carries all 57 shipped paths**, extracted
  mechanically rather than by hand. The first pass audited the 11 glyphs the drawing happens to use
  while claiming to cover the set — an audit that reports on 11 and says 57.

### What was deliberately not done

Seven further glyphs have a facing and do not mirror: `exit`, `undo`, `external`, `navigate`,
`search`, `bracket`, `ticket`. Two are the same class as `NavArrow`, two are a genuine argument
rather than an oversight. **They are a backlog line.** Seven glyphs across eight screens is the quiet
widening rule 8 forbids, and the arguable ones deserve their own look rather than riding in on a mode
set's coat-tails.

## Round 3 — the owner's two follow-ups (2026-08-27)

### "Does the transit line expand? Then it should have a caret like events, no?"

**Yes, and the question found a hole rather than stating a preference.** §3 drew the mode row as
always visible, never said when it appears, and never measured what it costs. It costs **55px** per
block (58 → 113), so a four-hole day pays **452px** against 232px collapsed — most of a 640px screen,
on the surface the ADR calls the densest in the app, for a control most days never touch.

§Z5 §M5's existing answer — "the selected or next leg only" — does not work here either: the day
**list** has no leg selection (that is the Map's model, §AC2), so every leg but the next would have no
way to change its mode, while the override is keyed on a place **pair** and is the sort of thing set
while planning.

**And almost all of it already exists.** `button.day-trv-face` is in `day-join.css` _now_ and is
**dead code** — nothing renders it, and `DayJoinRow.test.tsx:171` asserts its absence as "is a
statement and not a control". The component's own docblock says why the acts row is a _sibling_ of the
face rather than a child: "the `בדרך` control is a button too and one inside the other is invalid."
The face becoming a button is the shape that comment was holding open. The caret is `.wp-event-chev`
re-pointed; the container is `ui/primitives/Collapsible`; it registers no back layer (a pane _of_ the
row, the `SnapSheet` distinction). Collapsed measures 58px — identical to a statement block.

Two things change deliberately: that spec falls (§AH3's rule cuts the _other_ way here, because the
mode is about the leg), and `Collapsible`'s `0.32s` literal is visibly out of step with the caret's
`--t-base`, which the primitive owns rather than the host.

### "Does switching re-trigger the fetch? Maybe an in-progress indication?"

**No, and that is the design.** `useDayTravel` defaults to `modes = TRAVEL_MODES`, so one matrix per
day carries all three and a switch is a cache read — its docblock says exactly that, and M8b asserts
it with a network spy.

**There is a cold window, but it belongs to the day, not the switch:** a warming answer (ADR-0187), a
peek (which must not reach out), offline. There §D4 already answers — the distance, no duration.

**A spinner is refused, and was already refused once:** `where-a-route-shows-up-v1.html` — "on a day
with five holes that is the loudest thing on the screen" — with ADR-0140 §6 rationing loops
independently. **Flagged as an open call**, since that file still awaits sign-off.

**What the question did surface:** "no number yet" and "the gate refused this pair" render
identically — §AA4's polyline confusion, one surface over. Split by where they are said: the chip
carries availability only (dashed, still tappable at 44px), and the absence is said on the block.

**And the obvious copy is false.** `רחוק מדי להליכה` reads best, but `sameTravelCluster`'s docblock
says "a point in no cluster at all answers `false`" — so an isolated place refuses walking at _any_
distance, and a 2 km stroll would be told it is too far. Recommendation: `אין הערכה ל<מצב> כאן`.

### A process note

An edit dropped the `>` from the face tag and swallowed every block's children. The renderer reported
**no console errors** and the measurement table filled in — with numbers off malformed boxes, one of
which I wrote up as a finding before the screenshots caught it. A clean console and a full table are
not evidence the page is the page.

## What M8b inherits

The board's M8a card carries the handoff list. In one line: **read §AL, not the card** — one new
asset (`transit`), `Icon.tsx:63`'s comment to correct, `warn` reserved for the mark, the mode control
as four squared `.wp-chip.touch` chips, `.wp-placebadge-mark` as the geometry to start from, and
ADR-0138 §10's `MIRRORED` set for the two mode glyphs that have a facing. Plus §AL10's disclosure —
which is mostly rendering CSS that already ships — and §AL11's two rules: no request on a switch, and
the chip carries availability while the block carries the absence.
