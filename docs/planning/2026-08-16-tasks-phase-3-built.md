# Tasks phase 3 — the Trip Home band, built

**Date:** 2026-08-16
**Frame:** [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) §6 + tasks brief §11/§13. Design reference [`mockups/tasks-row-and-refusals-v1.html`](../../mockups/tasks-row-and-refusals-v1.html) §5, which is the build spec.
**Follows:** [phase 2](2026-08-16-tasks-phase-2-built.md).

**No ADR.** Nothing here decides anything ADR-0188 §6 had not already settled — the card, the row, the manual-only rule, the cap, the overflow row and the absence rule are all its. This note records the build and the two judgement calls it did contain.

## What shipped

`tasksDueNow` + `TripHomeTaskBand` + `.tsk-more`, rendered on Trip Home between the board and `גישה מהירה`.

- **`.checklist` holding the same `ListRow`**, under an ordinary `.sec-title`. No new list, no new row, no new card.
- **Manual tasks only.** An automatic check's deadline is the **departure**, so mid-trip every unmet one would sit in the band permanently overdue and in `--miss` for the rest of the trip. `tasksDueNow` owns that exclusion, with the reason on it.
- **Due today and overdue**, straight off `taskBand` — not re-derived. That predicate already measures "passed" against the instant and "today" against the reader's calendar day, deliberately in different zones.
- **Capped at `TRIP_HOME_TASK_BAND_CAP` (3)** with an overflow row **inside the same card**, not a control beside it.
- **Absent entirely when nothing is due** — the component returns `null`, so there is no empty shell (ADR-0045).

## The two judgement calls

1. **Where on the page.** ADR-0188 §6 settles what the band is and brief §11 settles that it exists; neither says where it sits among Home's sections. It went **above `גישה מהירה`**, directly under the board — the band answers "what do I owe today", which belongs with the board's what-now/what-next rather than beside a WiFi code, and §11's whole argument is prominence ("a missed task costs the thing it was guarding"). Brief §11's one hard constraint is honoured: **nothing goes on the collapsed board**, and nothing does. One line to move if that reads wrong on a phone.

2. **Where a band row's tap goes.** The overflow row's destination is specified (the tasks screen); a row's own tap is not. Both go to the **tasks screen**, through the `focus` deep-link the quick tiles already use (ADR-0050) rather than a bare tab switch — so it lands on the screen instead of the Index landing, and back resolves exactly as it does from every other tile. `INDEX_FOCUS` gains `TASKS`; nothing new was invented.

## Measured in the running app (360px, live backend)

|                 |                                                             |
| --------------- | ----------------------------------------------------------- |
| section title   | `משימות להיום` · `אחת באיחור` (only when something is late) |
| rows            | **3** — the cap — overdue first, then the starred one       |
| overflow row    | `עוד משימה אחת`, **inside** the card                        |
| band height     | **226px** — 183.7px of rows plus the overflow row           |
| row height      | **61px**, level with every other task row                   |
| assignee avatar | **18px** — the row class, not the editor's                  |
| nothing due     | the section is **absent**, not empty                        |

**A zone check fell out of the fixtures, and it is worth recording because it looked like a bug.** Three tasks seeded at "20:00 browser-local" did **not** appear in the band. They were correct to be missing: the browser was ~6 hours behind the trip's zone, so 20:00 local is the next calendar day for the reader, and `taskBand` filed them as `LATER`. Re-seeded relative to the app's own clock, all three appeared. The band's zone handling is `taskBand`'s, and this is the first surface that exercised it against a real cross-zone fixture.

## Verification

- `pnpm typecheck` · `pnpm lint` · `pnpm build` green.
- Frontend suite **228 files / 3852 tests**, including 5 for `tasksDueNow` and 7 for the band (the cap, the overflow row, the absence, the counts, the verbs, and that it uses `.tsk-assignee` rather than the editor's `.tsk-who`).
- One console warning in the dev run — a WebSocket reconnect from a hot reload, present before this change.
- **e2e not run** — wants its own pass.

## Corrected 2026-08-16, same day, by the owner

Two things this note got wrong, both now built:

**The window is a WEEK, not a day.** "Due today and overdue" is ADR-0188 §6's and brief §13's
rule, and it is the right one for a band you read _on_ the day — but wrong for anything that
needs preparing: a task due Friday is not actionable on Friday, it is actionable now.
`tasksDueNow` became `tasksDueSoon` with `TASK_BAND_LOOKAHEAD_DAYS = 7`; overdue is always in
regardless. The section title went with it — `משימות להיום` is simply false once the window is
a week, so it reads `משימות קרובות`.

**Plan Home was under-built in phase 2, and this note did not notice.** ADR-0188 §6 says
_"Plan Home carries the converged list, automatic first and manual after"_ — phase 2 shipped
the automatic half only, and phase 3 then put the manual half on Trip Home alone. Plan Home's
"what is missing" card is now genuinely converged, ordered by the same `orderTaskRows` the
tasks screen uses, so the two surfaces cannot disagree about what leads. The row is shared
(`TaskBandRow`) rather than drawn twice.

## Owed next

- **Phase 4 — hosts.** The expensive one: five hosts × (create, read), and it owes the brief's **§F** designed first (the mark on a host row, on lines ADR-0152 §6c already measured as full). It also carries the **host-cascade generalisation** — the family is already four with `dropAttachmentsForHostChange`, so generalise rather than copy, and **ask** if it is not a small extraction.
- **The device pass**, now four questions: the 26px ring, the 38px avatar in a pill, the selection ring beside a strong hue, and **the band's cap of 3** — two characters in `constants.ts`.
