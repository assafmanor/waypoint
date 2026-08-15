# Tasks phase 2 — automatic tasks, built

**Date:** 2026-08-16
**ADR:** [0190](../decisions/0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md)
**Preceded by:** [the six open questions](2026-08-16-tasks-phase-2-open-questions.md) + [`mockups/tasks-open-questions-before-phase-2-v1.html`](../../mockups/tasks-open-questions-before-phase-2-v1.html)
**Follows:** [phase 1b](2026-08-15-tasks-editor-built.md). **Precedes:** phase 3 (the Trip Home band).

## How this session went, which is the part worth keeping

Phase 2 was picked up to be built. Reading its design first found **five questions it never answers**; a **sixth** arrived from the owner's phone mid-session. The build stopped, drew and measured them, and the owner answered — then **revised §2 after seeing the answer written down**, which is exactly what the pause was for.

The revision is the interesting one. Offered "automatics first" or "pure urgency", the owner said neither: _"Not all tasks are made the same and prioritized or due, overdue tasks should be on top"_, then _"First but also important above them"_. That is a **third order the mockup did not draw** — and it is better than both, because it is the only one that lets a person's own judgement (`important`, or a deadline they set and missed) outrank a derivation.

It also simplified the build: the two-card layout collapsed into **one list**, which is what brief §2's "one noun, one list" always meant.

## What shipped

- **`lib/automatic-tasks.ts`** — the overlay predicate (`status` is the derivation's answer unless the row says `dismissed`), the copy table lifted out of `PlanHome.rowFor`, `CHECK_ICON`, and the five action ids. `computeReadiness` untouched, as brief §3 requires.
- **`useAutomaticTasks`** — one assembly of the eight-field readiness input for both hosts, plus `applyVerb`.
- **`AutomaticTaskRow`** — one row component, both surfaces.
- **The convergence**: `.chk-row`/`-ic`/`-main`/`-t`/`-m`/`-cta`/`-ppl` **deleted**; `.chk-ok` survives inside `ListRow`'s trailing slot. `HomeSkeleton` follows, since it pre-draws Home through the real classes.
- **The assignee as a person** on the row (ADR-0190 §6), amending ADR-0188 §3.

## Four decisions taken during the build

1. **`createTaskSchema` gained `status`.** Dismissing a check that has no row is a **create**, not an update — brief §4's core case. Without it, one press would be a create followed by a patch, with the second orphaned if the first failed.

2. **Opening the `⋯` on an untouched check writes nothing, and the first draft got this wrong.** It created the overlay row on menu-open, which makes a _read_ a write. Brief §4 is explicit that the row is minted by the verb — dismissing, assigning or flagging. Fixed with a never-written `Task` (`draftOverlay`/`isUnwritten`) and `applyVerb`, which creates or patches. **A spec now pins it**, because the wrong version looked identical on screen.

3. **A check's verb goes where the thing lives, and that is three different places.** Only flights and lodging need Home; an empty day is the day tab, a passport is the Index's own documents screen, and an invite is settings. The deep-link reuses ADR-0050's `FOCUS_PARAM` pointed at a second tab (`HOME_FOCUS`) rather than inventing a channel.

4. **`CHECK_ICON` and the row copy moved out of `PlanHome`** rather than being copied into the screen. `PlanHome.rowFor` is gone.

## Verified in the running app (360px, live backend)

|                           |                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Index tile order          | `הזמנות · משימות · מסמכים · פתקים`                                                                                               |
| tile count                | **1** — the checks do not inflate it                                                                                             |
| the list                  | **one card**, five checks + the manual task                                                                                      |
| flagging a task important | it **jumps above all five checks**                                                                                               |
| Plan Home                 | 5 `ListRow`s, **0** `.chk-row` / `.chk-cta` / `.chk-ppl`, row height **61px**                                                    |
| the `⋯` on a check        | subject `מתעדכנת מהנתונים של הטיול`; actions `טיסות · סימון כחשוב · הסרה מהרשימה` — **no** עריכה, **no** מחיקה, nothing disabled |
| console                   | no errors                                                                                                                        |

The 61px is ADR-0188 §7's own number after the CTA deletion, reproduced in the built screen rather than only in the mockup.

## Verification

- `pnpm typecheck` · `pnpm lint` · `pnpm build` green.
- Frontend suite **225 files / 3837 tests**, including 12 new specs for the overlay predicate and 8 for the screen's new rules.
- **e2e not run** — wants its own pass.

## Owed next

- **Phase 3 — the Trip Home band.** Manual tasks only, capped at 3, absent when nothing is due. Unblocked.
- **The device pass**, still three questions (ADR-0188/0189).
- **A copy defect noticed and NOT fixed**, because fixing it means writing new copy and that is a decision: the Index tile can read **count 1** beside the subtitle **"אין משימות פתוחות"**. `taskPreview.next` only considers _dated_ tasks, so a trip whose only open task is undated gets the empty subtitle beside a non-zero count. Pre-existing since phase 1, unrelated to this change, and on the backlog.
