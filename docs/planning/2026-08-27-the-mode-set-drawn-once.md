# M8a — the mode set drawn once, as a set (2026-08-27)

**Milestone:** M8a of the routes epic ([board](2026-08-24-routes-epic-milestone-board.md)).
**Branch:** `routes/m8a-draw` · **PR:** [#726](https://github.com/assafmanor/waypoint/pull/726).
**Deliverable:** [`mockups/the-mode-set-and-transit-declared-v1.html`](../../mockups/the-mode-set-and-transit-declared-v1.html).
**Decisions:** amended in place into [ADR-0206 §AL](../decisions/0206-a-travel-time-belongs-between-two-points.md).
**Scope:** `mockups/` + `docs/` only. No app code, so M9/M10/M11 were never blocked.

**Status: with the owner.** §M forbids coding what has not been drawn, and M8b may not start until
this drawing is signed off.

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

| #   | fork                                             | recommendation                                                                                                                                                              | where      |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | The תחב״צ mark: a new glyph, `ticket`, or a word | **A new glyph** — a front-facing bus. `ticket` means "a booking" in four screens; a lone word inside a row of three glyphs is ADR-0138's own inconsistency                  | §1c · §AL2 |
| 2   | The composited mark's halo                       | **A drop-shadow ring** in `--card` — the bare mark and a `--card` disc are both drawn beside it                                                                             | §2a · §AL4 |
| 3   | Which corner the mark hangs on                   | **Bottom-inline-end**, `PlaceBadge`'s own corner                                                                                                                            | §2a        |
| 4   | The mark's size                                  | **15px** on the 38px tile (39%) — 13px loses the bang inside the triangle, 17px starts taking from the mode glyph. **A control, not a decision: this one wants real glass** | §2a · §AL4 |
| 5   | The mode row's shape                             | **Glyph only**, at 44px, word in `aria-label` — the only shape that fits AND meets the touch floor                                                                          | §3b · §AL7 |
| 6   | The declared segment's dash rhythm               | **`[3, 1.2]`** → 10.5px on / 4.2px off at weight 3.5                                                                                                                        | §4 · §AL6  |
| 7   | Its line-cap                                     | **Butt** — round eats the gap and the line reads as the route                                                                                                               | §4 · §AL6  |

## What M8b inherits

The board's M8a card carries the handoff list. In one line: **read §AL, not the card** — one new
asset (`transit`), `Icon.tsx:63`'s comment to correct, `warn` reserved for the mark, the mode control
as four squared `.wp-chip.touch` chips, and `.wp-placebadge-mark` as the geometry to start from.
