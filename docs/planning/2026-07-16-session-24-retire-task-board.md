# Session 24 — Remote-cloud catch-up + retiring the task board

**Date:** 2026-07-16
**Outcome:** ADR-0046 (retire the task board), `docs/backlog.md`, the board deleted.

## Why this session happened

Assaf: "since we've last talked i've worked extensively on remote cloud… i noticed that i don't have to manage my tasks, especially since it's just extra work. writing ADRs, decisions, sessions etc. is more effective to me." The question on the table was whether to drop the task system entirely, and if not, at least stop keeping it in the gitignored private area, so it's reachable from a remote session.

## The catch-up (what the audit found)

The board was last generated **2026-07-14**. Since then: ~30 PRs (#85–#115) and ten ADRs (0036–0045) — event time-setter, overnight events, icons + canonical category, trip settings, trip-mode access window / past-trip archive, parallel-overlapping events, offline-syncable shared state, day-view now-line + phases + archive chrome, settling a finished trip, real-data-only Home. Twelve dated session notes (16–23) cover them. The board records none of it.

Nine of sixteen open tasks were wrong:

| Task                                  | Reality                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| T-044 trip settings ("Ready")         | Shipped #97, ADR-0039                                     |
| T-061 past-day visual + edit lock     | Shipped #108/#111, ADR-0043/0044                          |
| T-049 quick-access trim, quiet budget | Shipped #113, ADR-0045                                    |
| T-054 trip-ended mode state           | Decided + shipped, ADR-0040                               |
| T-055 Plan-mode prep dashboard        | Shipped — `PlanHome.tsx`, `lib/readiness.ts` (+test)      |
| T-056 Plan-mode day builder           | Shipped — `PlanDay.tsx`, `lib/gaps.ts`, `lib/reorder.ts`  |
| T-052 soft-item lifecycle             | Largely shipped via ADR-0043's derived phases + the shelf |
| T-064 live weather/FX glance data     | **Decided against** — ADR-0045 deleted that row           |
| T-020, T-025                          | Marked Done, still sitting in `open/`                     |

T-057's register of _deferred_ items listed drag-reorder and gap-fill — both already shipped (sessions 09–12).

**The diagnosis:** not a discipline failure, a structural one. The board lived in the gitignored private area (ADR-0010), so remote cloud sessions — where the work now happens — can't see the board, can't set a `Status`, can't regenerate it. Meanwhile the ADRs and session notes stayed correct the whole time, because they live next to the code and get written as a by-product of the work. The board was a second, worse copy of a record that already existed, and the only copy that could rot.

## Decision

Retire it (ADR-0046). Considered and rejected: moving the board into the repo as-is (makes the stale thing reachable — keeps the `Status` protocol and generator that caused the rot) and GitHub issues (genuinely the strongest alternative — `gh`-readable, PRs auto-close, staleness self-corrects — but it's a second surface to maintain, which is the thing we're removing; reconsider if the flat list gets ignored rather than edited).

Kept: the one thing ADRs/notes/git don't give — a list of decided-but-unbuilt work. That's `docs/backlog.md`, flat, one line per item, no status/priority/ID/generator, committed so remote sessions can edit it.

The backlog was rebuilt **from the code, not from the board** — every item verified present or absent in the tree. What survived: Index tab (still `Placeholder` in `App.tsx`), documents UI (backend done, no frontend), Map tab + navigate-to-next (blocked on Google Cloud), archive presentation (ADR-0044 follow-up), calendar sync + its lazy OAuth consent, revocable invite tokens (`trips.service.ts` still signs stateless HMAC tokens, no `Invite` model), minor-unit currency, e2e smoke (no Playwright), the live `ponytail:` shortcuts, and the blank-end-events open question.

This partially revises ADR-0010 — the private-material boundary still holds for everything else that lives there (scratch, PM notes, handoffs), as do both of its rules. A list of features to build isn't private material, so it gets promoted into `docs/` per 0010's own promotion rule. Kept the committed tree free of any mention of the private area's path while writing this.

## Follow-ups

- Local gitignored config lost its task-system section; it now points at `docs/backlog.md`.
- Dangling `T-NNN` references remain in older ADRs, docs, and code comments. Left alone — they're historical, and rewriting them would be churn.
