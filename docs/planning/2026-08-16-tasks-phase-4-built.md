---
date: 2026-08-16
topic: Tasks — phase 4 (hosts) and phase 3r (the Homes catch up), built
---

# Tasks phase 4 + 3r — built

**Scope:** the last two items owed before phase 5. Phase 4 puts a task on its host — a mark on the host's row and a section on the host's surface, across all five hosts — and phase 4 is where the build plan parked the **host-cascade generalisation** rule 8 flagged. Phase 3r is the three gaps the owner found on a device, grouped because they have one cause.

**Decision record:** [ADR-0191](../decisions/0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md), promoting [`mockups/a-third-mark-on-a-host-row-v1.html`](../../mockups/a-third-mark-on-a-host-row-v1.html). Phase 3r gets **no ADR** — it decided nothing; the screen had already decided each of the three, and these were the surfaces that had not followed.

**Owner's instruction for this session:** _"act independently, test thoroughly so that includes actually running it and screenshoting to make sure that the behavior and look are precise"_. So every claim below that has a number came out of the **running app** (`DEV_AUTH=1`, trip `trip-japan-26`, 360px), not out of the unit suite and not out of the mockup.

---

## What shipped

**Phase 4.** `TaskMark` (`NoteMark`'s exact box, the new `checkbox` glyph, counting **open only**) on all four host row shapes; `TaskSection` + `HostTasks` on all five host surfaces, above the notes section and below the documents one; `tasksForHost` / `taskHostInput` / `openTaskCountsByHost` / `dropTasksForHostChange` in `lib/tasks.ts`; the cascade registered in both mirrors (`trip-state.tsx`'s memory channel and `cache.ts`'s new `dropCachedTasksForHost`).

**Phase 3r.** Trip Home's band orders through `orderTaskRows`, the same function the Index runs. Plan Home's completed collapse counts and renders **manual** completed tasks beside the automatic ones.

---

## The rule-8 obligation, and where the generalisation stops

The plan's words were _"generalise the three host-cascade appliers — ask if it is not a small extraction"_. It was a small extraction, so it was taken without asking, and the honest result is that it generalises **two** of the four, not three:

- `isHostedBy` + `dropHostedForHostChange` in `lib/notes.ts` now serve notes **and** tasks, and `noteCountForContext` became `hostCountForContext` (the old name kept as an alias — it was always generic over the tally it was handed).
- **`dropAttachmentsForHostChange` was deliberately left alone.** It reads a different, two-member table _and_ carries an extra case: a deleted **document** drops its own links, not only links pointing at it. Folding it in needs a flag argument whose whole job is "behave differently", which is the copy wearing a costume.
- **`clearPlaceRefsForChange` likewise.** It clears a **field** rather than dropping a row, and it is already generic over its own shape.

Written into ADR-0191 §5 rather than left as a judgement call in a diff, because the next person to read "generalise the appliers" will otherwise finish the job wrongly.

---

## What the running app changed about the build

Four things, in the order they were found.

**1. A shared root class made a shipped selector mean something new.** `TaskSection` started as `className="note-sec"` — one section shape per host surface, which is the right geometry decision. But tasks read **above** notes, so `document.querySelector('.note-sec')` began returning the tasks section on every surface that has both. **Four shipped specs caught it** before any of it reached the app, which is the argument for the extra class rather than against it: the root is `.note-sec.tsk-sec`, and the four specs now say `.note-sec:not(.tsk-sec)` where they mean notes.

**2. The mark's open-only count, verified end to end rather than in a unit.** A booking carrying three tasks read **3**; ticking one from its section dropped the row's mark to **2**, and the ticked task stayed in the section, struck. That is ADR-0191 §2 and §5 both, and neither is provable in jsdom (the first needs the tally to survive a real state round trip, the second is a class on a real row).

**3. The three-mark line does not crowd.** Measured on the shipped booking row at 360px: **0.6px** of baseline spread across the note, document and task marks — the same number the shipped note/doc pair alone produces — in a **60px** row that does not wrap. This is the number §F asked for and it says the third mark is free on this shape.

**4. The host actually rides the create.** Adding `לבקש מיטה נוספת` from a booking's section persisted with `bookingId: "bk-hotel"` — not as a general task with the section filtering it in, which is the failure mode `taskHostInput` exists to prevent.

Phase 3r verified the same way: the Trip Home band ordered `["לאשר את הטיסה הפנימית" (important, due in 3 days), "לאסוף כביסה" (due today)]`, which is the Index's relative order and the **opposite** of what the band showed before; Plan Home's collapse read `הצג שהושלמו (2)` with both rows being completed **manual** tasks, where the old count could only ever have been checks.

---

## Build-time calls worth knowing

- **`HostTasks` renders `ListRow`s, not `.note-item`s**, which the drawing found and the build confirmed: `.note-item` has no lead slot because a note has no completion control, and a 44px `.tsk-tick` inside one is an oversized circle floating beside the words. The cost — two sections on one surface with two row shapes — is stated in ADR-0191 §5 rather than smoothed.
- **Settled tasks stay in a host's section**, struck, where the tasks _screen_ collapses them. The section is where you see what was **done** about this booking; there is no second place that says so.
- **`useHostTaskCount` exists beside `openTaskCountsByHost`** and is not a duplicate of it: a list screen tallies a whole screen in one pass, a delete confirm asks about one host. Same derivation, two arities.
- **The empty section states its absence rather than vanishing.** ADR-0045's no-empty-shell rule does not reach here, because the section is also the **only** way to add the first one.

## The cost that showed up as red

Nineteen test mocks gained `tasks`/`taskVerbs` and twenty-one gained `trip`/`zoneCrossings`/`users`. It surfaced as **460 failing tests in one run** rather than as a subtle wrong answer, which is the good version of this. Worth naming for the next phase that widens what `useTrip()` returns: the blast radius of a new trip-state field is every screen mock in the suite, and the fix is mechanical but not small.

---

## Verified green

`pnpm test` (frontend + backend + shared), `pnpm typecheck`, `pnpm lint`, `pnpm build` — all clean before the PR. Screenshots taken at 360px for the bookings list, the booking detail sheet, Plan Home and the day view.

## Left for phase 5

Nothing new. §E (the hero slot) is still owed as design before phase 5, and it lands as an **amendment in place** to ADR-0160 §3/§13 rather than a new ADR beside them.
