# The board counts to the leaving — M3 of the routes epic, designed

**Date:** 2026-08-25 · **Milestone:** [M3](2026-08-24-routes-epic-milestone-board.md#m3--design-session--mockups) of the routes & travel-time epic
**Mockup:** [`mockups/a-travel-time-between-two-points-v1.html`](../../mockups/a-travel-time-between-two-points-v1.html) · catalogued in [`design/mockups.md`](../design/mockups.md)
**Decisions this serves:** [ADR-0205](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) · [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) (§M is what this session had to settle; §Z1 is what changed under it)

> Orientation note, not a decision record. Nothing here is authoritative until it lands in
> ADR-0206 (root `CLAUDE.md`, _durable vs. scratch_). §7 below is the amendment text, written
> to be pasted in unchanged.

## 1. What the session was asked to settle

ADR-0206 §M names five things a mockup must decide before any of §V1 is coded. The owner's M0
answers reversed §M1's recommendation — the collapsed board **does** carry an urgent leave-by,
as a **swap** of the countdown it already has (§Z1) — so the open question was no longer
_whether_ but **at what threshold the swap fires**, and how the passed-leave-by state reads as
`--miss` without minting a second live mark.

All five are drawn on one scenario with one set of numbers, so the sections cannot disagree:
lunch ends 15:20, the kabuki theatre (hard, `KZ-4471`) starts 18:00, the walk is ~40 minutes —
§V1.1's own example, a 2:40 hole with 2:00 free after the walk.

## 2. The five answers

| §   | question                               | answer                                                                                                                                        |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | where an urgent leave-by lives         | The board's one countdown swaps its **unit**: `55 · דקות` → `10 · ליציאה` → `7 · באיחור`. **Threshold: 30 minutes of time-to-leave.**         |
| M2  | the gap slot's third meaning           | A second **run inside the existing label**, amber-deep, in `.day-gap` — not a second strip, and it ignores `GAP_MIN_MINUTES`.                 |
| M3  | the amber line against ground and pins | Solid, but **not one value**: `--amber-deep` on the day ground, `--amber` on the night one. §D8 holds, measured at 4.2× the amber area.       |
| M4  | the late-risk mark                     | Ink and word only — `--miss-deep` on paper, the board's brightened `#f0a0a0` recipe on the board. Live marks on screen stay at one per board. |
| M5  | the mode control                       | Three **word** chips in the existing `ToggleChip`, on the one leg that is solid on the map. A gate-refused mode goes `.provisional`.          |

## 3. Why the threshold is 30

It is a threshold on **time-to-leave**, not on time-to-event — otherwise the length of the walk
would move it. Three things picked the number, and only the first is an opinion:

- It is the number in the sentence that defines the product (root `CLAUDE.md`: _"what do I need
  in the next 30 minutes"_). A threshold the app already states in prose is not an arbitrary one.
- **Anything ≥ 60 is refused by the box.** `formatCountdown` steps to `H:MM` at an hour, and
  `1:05 · ליציאה` is a contradiction in a tile whose value is minutes. Measured in §1b.
- **10 is too late and 45 too early on a real leg.** At 45 the board spends longer counting to
  the leaving than to the event on a 40-minute walk; at 10 a long leg is already lost.

Rejected, with reasons the mockup's notes panel carries in full: swapping **whenever** a
leave-by exists (the board then stops saying when the thing starts, and puts a §D5 estimate in
the loudest slot all day); and a **relative** threshold such as "when time-to-leave < travel
time" (unit-free, so it behaves backwards at both ends — 3 minutes' notice on a 3-minute walk,
70 minutes' notice on a 70-minute drive).

## 4. What reading the code changed

Four of the five sections got **smaller** on reading, which is the point of reading first.

1. **The swap is not new machinery.** `Home.tsx:452` already swaps that tile: ADR-0184 §6's
   shutting window takes it with `{...formatCountdown(mins), unit: t.board.closesIn}`, because
   the unit slot says what the minutes are left **of**. The leave-by is a third arm on that
   ternary. `לסגירה` also settles the word: `ליציאה` is the same grammar, and the measurement
   says all three candidate words fit the 74px tile anyway (the cliff is `דקות ליציאה`, 79.8px).
2. **The two urgent countdowns can collide** — a shutting check-in window and a live leave-by in
   the same minute — and ADR-0206 does not mention it. One tile, so the **nearer number wins**,
   on §Z1's own argument against showing both. Drawing the rejected two-tile version costs 11px
   of the `הבא בתור` title and breaks it to two lines at 360 (it fits at 390).
3. **`GAP_MIN_MINUTES = 60`** (`lib/gaps.ts:30`): a 45-minute hole renders nothing today, so a
   40-minute walk inside it is invisible. The travel line therefore **ignores the floor** — not
   a new rule, `ConnectionBand` already ignores it for ADR-0159's stated reason.
4. **There is no walk/bike/car icon in `ui/Icon.tsx`.** An icon control would mint three; the
   control is words in `ToggleChip`.
5. **`MAP_CONNECTOR.COLOR` is a per-theme TypeScript constant**, with a comment recording that
   it once sat out a dark-mode remap at 1.01:1. A solid amber polyline is the same shape of
   problem — which §5 below turned out to be, exactly.

## 5. What only the render could say

- **`--amber` solid measures 1.72:1 on the day map ground** (`earth #eee8dc`) — under the 3:1 a
  graphic owes what it crosses. The night ground is fine (7.01:1). `--amber-deep` on the day
  ground measures 4.5:1, and it is amber's paper variant (ADR-0158 §6), so the fix mints no hue:
  a **per-theme pair**, exactly the shape `MAP_CONNECTOR.COLOR` already has.
- **Hue does not separate the line from a pin** — 1.02:1 to 1.28:1 against all five category
  hues in dark. What separates them is the 2px `--card` ring every pin already carries, which is
  a second argument for §D8: a day of solid legs leans on a separation that is not there.
- **`~40` without `ltrIsolate` renders `40~`**, measured as the tilde's x against the digits'.
- **`§` is Bidi-neutral, so `§D8` renders `D8§`** in Hebrew prose. Found in this file's own frame
  label. Every ADR reference inside a Hebrew string has this; both fixes are ADR-0118's.

## 6. Open for the owner

1. **The threshold** — 30 minutes, per §3. A device pass is the right place to disagree: the
   file ships the control.
2. **The buffer** in the leave-by (§D5's hedge) is drawn as a control at 0/5/10/15 and is **not
   this session's to pick** — it is a measured number and belongs with M1's.
3. **`ליציאה` vs `לצאת`** — the tile fits both; the recommendation follows `לסגירה`'s grammar.

## 7. The ADR-0206 amendment, ready to paste

**This session could not write it.** M3's declared conflict surface is `mockups/**`,
`docs/design/mockups.md` and `docs/planning/**` (M1 and M2 were running in parallel and
`docs/decisions/` is not M3's to touch), so the amendment its exit criteria call for is recorded
here instead, verbatim, for whoever holds that file next. The board's M3 card says the same.

---

### Z5. What the mockup settled (2026-08-25)

Measured in [`mockups/a-travel-time-between-two-points-v1.html`](../../mockups/a-travel-time-between-two-points-v1.html),
at 390×844 and 360×640, in both themes. Session note:
[2026-08-25](../planning/2026-08-25-the-board-counts-to-the-leaving.md).

- **§M1 — the swap threshold is `LEAVE_BY_SWAP_MINUTES = 30`**, measured on **time-to-leave**,
  not time-to-event. Above 60 the tile is forced into `H:MM` under a unit that means minutes,
  which is a contradiction; below ~20 a long leg is lost before the board says anything. 30 is
  also the number root `CLAUDE.md` already states. The tile's unit becomes `ליציאה`, following
  ADR-0184 §6's `לסגירה` in both grammar and mechanism — this is a **third arm on
  `Home.tsx`'s existing countdown ternary**, not a new element, and all three candidate words
  fit the 74px tile unchanged.
- **§M1 also — the collision this ADR did not name.** A shutting check-in window (ADR-0184 §6)
  and a live leave-by can both be true in one minute. There is one tile, so the **nearer number
  wins**; drawing both costs 11px of the `הבא בתור` title and a second line at 360.
- **§M2 — the travel is a run inside `.day-gap`'s existing label**, amber-deep, never a second
  strip: a strip is a statement and may float between two cards, which is why `ConnectionBand`
  had to be a band and this does not. It **ignores `GAP_MIN_MINUTES`** for ADR-0159's own reason,
  or a 45-minute hole holding a 40-minute walk stays silent. Width chooses nothing here — all
  four drawn candidates keep ≥54px of dashed rule at the worst case — so the choice is grammar
  (§D10's noun-lead) and ink; the two-strip candidate is rejected on rhythm, 58px per hole
  against 29px.
- **§M3 — §D1's "solid + amber" cannot be one value.** `--amber` measures **1.72:1** on the day
  map ground (`earth #eee8dc`), under the 3:1 floor a graphic owes what it crosses, and 7.01:1
  on the night ground. The route line is therefore a **per-theme pair, in TypeScript, switched
  in JS** exactly as `MAP_CONNECTOR.COLOR` is: `--amber-deep` (4.5:1) light, `--amber` dark. No
  new hue — `--amber-deep` is amber's paper variant (ADR-0158 §6).
- **§M3 also — §D8 stands, and gains a second reason.** All-solid puts **4.2×** the amber on the
  canvas. And hue cannot separate the line from a pin (1.02–1.28:1 against every category hue in
  dark); what does is the 2px `--card` ring the pin already carries.
- **§M4 — the late-risk mark is ink and word only.** `--miss-deep` on paper (6.59:1), the board's
  brightened `#f0a0a0`/`rgba(198,40,40,.18)` recipe on the board (8.73:1) — the one
  `.tlabel.missed` already uses. No fill, no glow, no pulse: the animated-element count across
  the drawn frames stays at one per board surface, so §D6 is untouched.
- **§M5 — three word chips in `ToggleChip`**, not icons: `ui/Icon.tsx` has no walking, cycling or
  driving glyph and this is not the place to mint three. 29px painted, 51px target via an
  `::after` overlay (the trick `button.day-gap` already uses), one row at 360. It appears on the
  **selected or next leg only** — §D8's rule, generalised from the polyline to the control. A
  mode the gate refuses keeps its chip in `.wp-chip.provisional`'s dashed state and the tap lands
  on §D4's crow-flies chip, which is §Z2's "not this way" rather than a failure.
- **Two bidi defects found by rendering**, both ADR-0118's fix and both reaching the build:
  `~40` renders `40~` without `ltrIsolate`, and `§` is neutral so `§D8` renders `D8§` inside
  Hebrew copy.
