---
date: 2026-08-19
kind: build session
surface: tasks — sub-tasks, two reports against the built screen
status: built
adr: docs/decisions/0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md
---

# The parent's tick, and where the checklist hangs

Two owner reports in one message, the morning after [ADR-0196](../decisions/0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md) shipped. Both are amendments **in place** in that ADR (§3 reversed, §5 corrected) plus a build-log addendum; this note is the shape of the session and the one thing worth saying about how each was decided.

## 1 · "You should be able to tick the parent task to mark all as complete"

§3 had drawn the parent's lead as a read, and the ADR's Alternatives refused a bulk tick **on harm**: everything is LWW, so a bulk un-tick erases ticks four other people wrote.

The harm was real and the conclusion was not. The app already ships the answer — a multi-write verb goes behind **one toast and one undo** — so the reversal is not "the objection was wrong", it is "the objection had a fix already in the building". `taskVerbs.tickTask` is now the single verb: a leaf settles itself, a parent settles every open step and reopens them once they are all settled, a `dismissed` step is untouched in both directions, and the parent's own row is still never written. Six surfaces call it and none of them knows a parent is different, which is the part that matters — the alternative was a "unless it holds a checklist" clause at six call sites, and [ADR-0193 §2](../decisions/0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) exists because one surface forgot the last clause of that shape.

One thing is genuinely lost and is written down rather than smoothed over: `updateTask` sends `{ status }` and the server stamps the settlement, so an **undone** reopen comes back settled by whoever pressed undo. Statuses are restored, attributions are not. Nothing reads a step's `settledBy` today.

## 2 · "Is the line difference between the title and the first sub task good? The tab before the sub tasks?"

No, and the file said so itself. `.tsk-kids`' own comment claimed _"a step's tick starts where the parent's TITLE starts"_ and set `58px`, derived as "14px of card inset plus the 44px lead" — where `.wp-listrow-lead` is flush to the card and **is** the 44px, `.wp-listrow-open` adds its own 10px, and the tick's paint sits 3px inside its cell. Measured in the running app at 390: the title starts at x=319 and the step's tick painted to x=312. Seven pixels, aligned to nothing.

The indent is now `calc(var(--kid-title-x) - var(--sec-lead))`, which puts a **step's text** exactly where the parent's title starts. Four candidates were rendered at phone width in dark and read off the images before choosing; the one that looked most "tidy" in the abstract — flush to the card, ticks under the parent's ring — turned out to put a child's text **outboard** of its parent's title, which inverts the hierarchy. That is a fact about the render rather than a taste, and it took less time to see than to argue.

**Why an alignment bug shipped at all:** jsdom reports every rect as zero, so the unit suite is blind to this class by construction, and the design's measurement had been taken from the mockup rather than the app. The e2e spec now asserts the two edges against each other.

## Verified

`pnpm format:check`, `pnpm typecheck`, `pnpm build` and `pnpm lint` clean (one pre-existing warning in `e2e/note-way-in.spec.ts`). Tests: frontend **4015**, backend **685** +1 skipped against a real local Postgres, shared **248**. The full Playwright suite passes (**211**), including three new cases in `e2e/subtask-ring.spec.ts` — the ring's press settling the checklist and confirming it, and the step-text/title alignment that only a browser can see.
