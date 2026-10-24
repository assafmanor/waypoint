# 2026-08-21 — Notifications phase C, first half: the readiness nudge

**Built.** ADR-0198's `readiness.nudge` — 10:00 local at T-14 / T-7 / T-2, naming only what is still missing. Seven kinds registered. Amendment: [ADR-0198's phase-C note](../decisions/0198-we-notify-what-you-can-still-miss.md).

**Not built, and not an oversight:** the flight check-in task. §C describes it in one paragraph two different ways, and the difference is a schema decision — see the fork at the end.

## The move, which is the actual work

`computeReadiness` lived in `frontend/src/lib/readiness.ts`. The nudge needs it, so it moved to `packages/shared`.

This is the third time this epic has moved a derivation into `shared` for the same reason (phase 2: the zone model; phase B: `notifyLeadMinutes`' reader; now this), and the reason is worth restating because it is not "code reuse". ADR-0197 §5 requires that a send time and a printed time be **one derivation**. The same argument covers a fact: a nudge saying lodging is missing while the tasks screen shows it satisfied does not merely look inconsistent — it teaches the person that the channel is unreliable, which is the failure the whole epic is trying to avoid.

What travelled with it:

- `addDays`, `tripDates`, `zonedIso` → a new `packages/shared/src/trip-dates.ts`, re-exported from `lib/time.ts`. Twenty-two files import `zonedIso` from there; churning them would have made the diff about paths instead of about the move. Same shape phase 2 used for `todayInTz`.
- `offsetAt` is now **one** function (`zoneOffsetAt`) rather than a private copy on each side — `zoneOffsetMinutes` in `lib/time.ts` parses the same string, and two DST-correct offset probes is the duplication root rule 8 exists to stop.
- The night-window constants, whose only reader was this module. Their docstrings came too: the 22:00–08:00 window's "wider than anyone sleeps" reasoning and the five-hour floor's two worked examples are the part a reader cannot recover from `'22:00'`.
- `zonedIso`'s full docstring, including the precondition tied to field report #38 (an empty date builds an Invalid Date whose offset probe throws `RangeError`, in a render path). A condensed version was written first and then replaced — a docstring naming a real incident is not summarisable.

**The arithmetic is the proof the move was clean**: shared went 276 → 306 tests and frontend 4133 → 4103. The same thirty, relocated. A move that silently dropped a file would have shown as a smaller frontend count and no shared increase.

## Two decisions inside the kind

**It rides `notifyTasks`, not a third switch.** ADR-0190 settled that a readiness check _is_ a task row, so the switch that governs task notifications governs these. The alternative was a `notifyReadiness` column for something the person already has a control for, and §6's "three switches" would have become four while the ADR was busy arguing them down to two.

**Its query starts from `Trip`, and that does not break the inverted loop.** Every other kind scans a candidate table, because every other kind is about a row somebody wrote. This one is about an **absence** — no bed, no passport, no plan for day 4 — so there is nothing to scan. A trip has exactly one start date, so "starts in 14, 7 or 2 days" is a tiny indexed set, and the per-trip loads (`events`, `bookings`, `places`, `documents`) run only for the handful the range returned. A spec asserts that a trip outside every window costs one query and no loads.

## Hebrew duals, again

`שבועיים לטיול` (14 days) and `יומיים לטיול` (2) are duals; `שבוע לטיול` (7) is singular. No `${n} ימים` template produces any of them, so the labels are a `Record<number, string>` and a fourth milestone has to supply its own words rather than getting a wrong one generated. Phase B hit exactly this with `בעוד שעתיים` — it is now twice, which is enough to call it the rule for this language rather than a special case.

## The test that needed a fixture nobody had built

"Says nothing when every check is satisfied" is the branch that keeps the nudge from becoming congratulation, and reaching it needs a trip where **all five** checks pass: both flight legs, a bed for every night, an event on every day, a passport per traveller, and more than one member. That fixture did not exist anywhere in the repo, so it is written out with one comment per check saying which field answers which.

It passed on the first run, which is exactly when a test is least trustworthy — so the guard was mutated away to confirm the fixture really does satisfy all five rather than the assertion being vacuous. It failed, as it should.

Two more mutations: dropping the milestone gate fires on non-milestone days (T-13/T-10/T-3 are tested for silence), and reading the destination zone instead of home shifts the hour.

## What is still owed, and the fork

**The flight check-in.** §C says a flight booking "mints an automatic task … which then rides `task.due` for free" — stored. The next sentence calls it "ADR-0190's rule applied one row further" — and ADR-0190's rule is derived-with-an-overlay. One paragraph, two mechanisms:

|                     | stored row                                                            | derived overlay                                                                              |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| where it comes from | `bookings.create`'s `mutateMany`, beside the auto-`Event`             | resolved at read time, no row until a human touches it                                       |
| staleness           | `dueAt` must cascade at the **three** sites that can move a departure | cannot go stale                                                                              |
| `task.due`          | works, no new kind                                                    | cannot see it — no `dueAt` in SQL, so it needs the `flight.checkin` kind §C rejected         |
| cost                | three cascade sites, the ADR-0152 §2 / ADR-0157 §3 hole               | `TaskDerivedKey` is a closed five-value enum and per-**trip**; a check-in is per-**booking** |

Recommended: **stored**, with the cascade extracted as one shared util called from all three sites rather than three inline copies. It keeps `task.due` untouched, and it makes the reminder tickable, offline-cacheable and visible in Plan/Index like any other task — which was the whole reason §C chose a task over a notification. Raised rather than chosen quietly, because it touches the schema either way.

Also still owed from phase A: **the lock-screen device pass** on both platforms, which no sandbox can do.
