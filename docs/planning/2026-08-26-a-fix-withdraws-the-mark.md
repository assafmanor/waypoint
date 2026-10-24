# 2026-08-26 — a fix withdraws the mark (M6c)

**Milestone:** M6c of the routes & travel-time epic ·
[board](2026-08-24-routes-epic-milestone-board.md) ·
**Decides:** [ADR-0207](../decisions/0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) ·
**Extends:** [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) §V1.4 / §Z5 §M4
**Branch:** `claude/m6b-hero-read-routes-wlxj67`

> Orientation only. The decision is ADR-0207 and the status is the board (root `CLAUDE.md`,
> _durable vs. scratch_).

## The report, and why it is not an arithmetic bug

M6b shipped in the morning. On its first real day it told the owner the leave-by had passed while they
stood ⁦200m⁩ from the door of the next stop — **and the Map tab, one tab over, was drawing their blue
dot beside that stop's pin at the same moment.**

Nothing in M6b was wrong on its own terms: ADR-0206 §AE3 measures the leg between two **scheduled
stops**, so the number described the plan, and the leave-by was correctly derived from a walk the
traveller had in fact already made. **The defect is the silence.** The app had a position, was already
using it fifty pixels away, and did not let the one surface making a claim about the traveller consult
it.

**The design already existed and had never been built.** The v2 mockup's §3d drew all three tiers —
`עדיין כאן` when the fix says you really are still at the previous stop, and the moving tier answering
`בדרך` by itself — under a heading that translates as _"correction: the app DOES have a position, and
it is already using it"_. M6b took the board at its word that this "wants its own ADR" and left it.
The report is what says the gate should be walked through rather than stood at.

## The thesis, which is what keeps it small

**A fix decides what we may CLAIM. It is never an input to an estimate.** No route request is ever
issued from a device position, so ADR-0205 §4's place-keyed cache is untouched and there is no request
per fix. And withdrawal needs no estimate at all: the report was never _"your number is imprecise"_,
it was _"you are calling me late when you can see I am not"_.

Four stances, and `unknown` is the default rather than the error — no permission, a refusal, a stale
fix, or a position that settles nothing all leave the surface reading exactly as it did yesterday.
`at-origin` is the only arm that makes the app **louder**, and it is the one that earns it.

## Three bugs the arithmetic hid

None of these was visible in the diff. Each came from writing the spec or rendering the row.

1. **The radius was a minimum where it had to be a maximum.** I wrote
   `min(accuracy, ARRIVAL_FRACTION × leg)`, which lets the leg's fraction cap the radius **below the
   fix's own error bar** — a ±⁦300m⁩ fix resolving a ⁦180m⁩ circle, which is precisely the noise the
   rule exists to refuse. It reads as correct, which is why it is now two specs and a paragraph in
   the ADR rather than a fix.
2. **`en-route` was twice as strict as it read.** _"Closer to the destination than to the origin"_
   only fires past the **midpoint**, so a traveller a third of the way along a walk still read
   `unknown` and kept a mark they had plainly answered. One radius of real progress is the honest bar,
   and the wrong-way case still falls through to `unknown`.
3. **The `en-route` line printed the duration twice** — `~12 דק׳ · בדרך · נותרו ~12 דק׳` — because I
   filled both the duration slot and the labelled remaining. The bare number is the exact ambiguity
   §6 exists to remove, so the labelled one survives.

**And one fixture bug worth the same note as #711's:** the Home spec's `between()` kept another spec's
longitude, putting the "fix" ⁦1700km⁩ from both stops — so every stance was correctly `unknown` and
three assertions failed for the right reason. It is derived from the `places` fixture now, because a
hand-typed coordinate that drifts reads as `unknown` and would have made the whole suite pass for the
wrong reason.

## Measured

At 360 in Chromium. Every action row is 2 lines at ⁦46px⁩, and **`עדיין כאן` costs zero extra lines** —
the `--miss` row was already two because of the `בדרך` button. No horizontal overflow in any state.

## Also fixed, because it was the same surface and the same report

**`בדרך` had no way back.** `markOnWay` only ever set, and the verb toasted **without** an undo
callback while `done`, `skip` and `restore` all pass one — so the app's one device-local mark was also
its only state-writing verb you could not undo. ADR-0019 makes the toast's undo button _the_ way undo
surfaces. `clearOnWay` exists, the toast offers it, and the row carries `ביטול סימון` (the word
`SettleControl` already uses) because a toast is transient and a mark is not.

## Left open, deliberately

- **Two numbers are judgements**: `ARRIVAL_FRACTION` (0.12) and `ARRIVAL_RADIUS_MAX_M` (⁦2km⁩). On the
  backlog beside §D5's buffer, which is where the owner's "tolerance relative to the total distance"
  actually belongs as an **estimate-error** question.
- **The group still learns nothing from a sensor.** ADR-0006 §8 untouched: never persisted, never
  sent, so what the group sees still comes only from a person pressing `בדרך`.
- **No prompt on Home.** It reads a fix only where consent already exists. Asking would need its own
  reason-first card and its own decision.

## Checks

`pnpm format` / `lint` / `typecheck` / `build` clean. **Frontend 267 files / 4583 tests**, shared
18 / 371, all green — **24 new specs**: `travel-position` 13 (the four stances, the expiry, the radius
in both directions, the midpoint rule), `on-way` +3 (the reversal), `HeroLift` +2, `Home.leave-by` +6
(the reported case end to end, including that no consent means no request and no change).
