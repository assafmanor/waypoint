# 2026-08-26 — the board counts to the leaving, for real (M6b)

**Milestone:** M6b of the routes & travel-time epic ·
[board](2026-08-24-routes-epic-milestone-board.md) ·
**Decides:** [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) **§AE**
(amended in place) · **Extends:** [ADR-0184](../decisions/0184-an-edge-can-be-a-window.md) §6's
mechanism, [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) §U0's rule
**Branch:** `claude/m6b-hero-read-routes-wlxj67`

> Orientation only. The decisions are ADR-0206 §AE and the status is the board (root `CLAUDE.md`,
> _durable vs. scratch_). Nothing here is authoritative.

## What shipped

**§V1.2 — the third of the app's three questions, answered.** The lifted hero's horizon carries
`~23 דק׳ · צאו ב־18:37` in the slot that was already between two points: a `.hero-trv` block under
`.wp-board-divider`, before `הבא בתור`. That placement is the whole of §D2 — a journey is a property
of neither point, so putting it there **answers** ADR-0160 §U0's admission rule instead of spending
it on a fifth point-depth item.

**§Z1 — the board's one countdown changes what it counts to.**

| condition                               | the tile                |
| --------------------------------------- | ----------------------- |
| leaving is not yet the live question    | `45 · דקות`, as before  |
| time-to-leave ≤ `LEAVE_BY_SWAP_MINUTES` | `10 · ליציאה`           |
| the leave-by has passed                 | `7 · מהיציאה`, `--miss` |

One tile, three referents, and a third arm on the ternary `Home.tsx` already had for ADR-0184 §6's
shutting window — the card budgeted one line and one line is what it took, plus one optional
`missed` field on `Board`/`HeroLift`'s countdown prop and four CSS rules.

## One regression against the drawing, caught by re-reading it

**The mode word.** The first build shipped `~23 דק׳ · צאו ב־18:37` — the sentence §V1.2 names — while
the M3 mockup's §1d had drawn **`הליכה · ~40 דק׳ · צאו ב־18:37`**. Restored: it is §D10's own dodge
(`~23 דקות הליכה` disagrees, `הליכה · ~23 דק׳` has nothing to agree), and it is what makes the number
mean anything, since forty minutes is a different fact walking and driving. Measured at 360 and it
costs **zero lines** in all five states — what makes the `--miss` row two lines is the `בדרך` button,
with or without the word.

The lesson is small and repeatable: the brief quoted the sentence without the mode and I built the
quote. **The drawing is the spec; a brief quoting it is not.**

## Five things this session decided that the mockup had not

All five are in §AE, and none went back to a mockup — the owner's instruction was to draw only what
is not trivial, and the precedent is the board's own: _a word in an existing slot spends no new axis,
where a mark would have spent one_ (M7c's second field report).

1. **The passed arm's word is `מהיציאה`** — the same noun as `ליציאה` with the preposition flipped,
   so the minutes are counted _from_ the leave-by rather than _to_ it. v1 drew `באיחור`; v2 §3
   refused that copy and **never redrew the board tile**, so this was a real hole. Measured at 74px.
2. **`בדרך` writes state, and it is a device mark.** `lib/on-way.ts`. The toast no longer says
   `שותף לקבוצה` over a verb that writes nothing — it was the one false confirmation in the app.
   **This is the one that is not a drawing question**, and it is flagged for the owner rather than
   settled: whether a device-only mark is the right floor.
3. **The teal `בדרך` line and its control on the hero.** v2 draws both on the day's journey block;
   the hero's block is that block one elevation up, which is ADR-0160's thesis, not a new surface.
4. **The journey's origin is the previous scheduled stop**, never a guess about where anybody is —
   the primary now point, else the latest stop that has already started on the clock's own day.
5. **The collision falls out of the arithmetic**, and **the hedge is one function**
   (`approxDuration`, which M6a needs too). Neither has a drawing to make.

## Two things measured rather than read

Both in Chromium at 360px, because neither is answerable from the diff.

**The `~` must sit inside the bidi isolate.** With it, `~` renders at x`314` and the `2` at x`326` —
reads `~23`. Without it, `~` is at x`336`, to the **right** of both digits — reads `23~`. ADR-0206
§Z5 had already reported this defect and it still reached the second mockup, which is why it is now
inside a function no caller can bypass.

**The tile is `74px` under every word and `76.58px` under `H:MM`.** All four unit words fit unchanged
(`דקות`, `לסגירה`, `ליציאה`, `מהיציאה`), confirming §Z5's measurement for the new one. But the
**value** widens it, and a long `הבא בתור` title then wraps (`21px` → `41px`) — which happens today,
on `main`, for any next event an hour or more out. **Not this milestone's, and backlogged rather than
folded in.** Recording it is the point: the obvious reading of §AA1 is about `H:MM` contradicting a
unit that means minutes, and nobody had measured the width half of the same fact.

## What was deliberately not built

- **Own-device position** earning or withdrawing the mark. Available (ADR-0006 puts it in v1,
  `lib/useGeolocation.ts` ships), drawn in the v2 mockup §3d, and it wants its own ADR — the board
  says so and this session took it at its word. Backlogged.
- **§V1.1/§V1.3/§V1.4's day row.** M6a's, and the M6a/M6b card's first exit criterion belongs to it.
- **A group-visible `בדרך`.** A stored field plus a migration plus a cache mirror. Backlogged.

## Board housekeeping done in the same change

- **M7b (#708) and M7c (#709) flipped 🔵 → ✅**, verified against `origin/main` rather than assumed.
- **M7's row dropped `(+ follow-up 🔵)`** — #707 merged on 2026-08-25.
- **#710 and #711 now have a place on the board**, as M7c's field reports rather than milestones of
  their own. The important half is that **#711 replaced #710's rule** — `startsAt` on a lodging span
  is a floor, not an arrival, so the first fix moved nothing on the day it was written for — and that
  is only legible if both are on the page. Its finding is a testing one and is worth stealing: the
  fixture was built from the rule, so it proved the rule; **take the shape from the report.**

## Checks

`pnpm format`, `pnpm lint`, `pnpm typecheck` and `pnpm build` clean. Unit suites green:
**frontend 266 files / 4559 tests**, **shared 18 / 371**. **41 of those specs are new**, in three new
files (`hero-travel` 12, `on-way` 6, `Home.leave-by` 9) and three extended ones (`duration` +4,
`Board` +2, `HeroLift` +8). `Home.leave-by.test.tsx` exists for the seam neither half's unit tests
can see: `lib/hero-travel.ts` is tested pure and the two components with hand-built props, so
nothing else asserts that Home connects one to the other — or that the collision resolves both ways.
