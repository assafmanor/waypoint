# 2026-08-16 — Tasks phase 5: the hero slot, designed then built

**What shipped:** the tasks brief's **§E** answered, and phase 5 of the
[build plan](2026-08-15-tasks-build-plan.md) built behind it — a hosted task in the lifted
hero's horizon, beside `איפה` / `פתק` / `הסדרה`.

**The record is elsewhere and this note does not repeat it.** The decision is
[ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md)'s **§U**, an amendment in
place to §3 and §13 as brief §11 required by name — never a new ADR beside them. The drawing is
[`mockups/a-task-in-the-hero-horizon-v1.html`](../../mockups/a-task-in-the-hero-horizon-v1.html).
What is here is the sequence, the forks put to the owner, and the things the build learned that
the drawing could not.

## The sequence, and why it was not a commit

§E was one of the three questions the design brief left open, and the standing instruction is to
stop at an undecided design rather than settle it quietly. So: **mockup → owner sign-off → ADR
amendment → build → PR**, in that order, with nothing built until the three open forks had
answers.

## The three forks, and the answers

All three were drawn as controls in the mockup rather than as prose, and all three came back as
the file's own recommendation.

| fork                 | answer             | the argument against, kept                                                                                                               |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **§3** the mark      | the **checkbox**   | a checkbox on a read-only surface can read as pressable, and this is a surface where the user has learnt elsewhere that a checkbox ticks |
| **§4b** the assignee | **yes**, a face    | ADR-0153 §4 dropped the note's author face to avoid a second identity system per row                                                     |
| **§5** how many      | **one** + `ועוד N` | a small list would put the whole obligation on screen                                                                                    |

**§3's risk is not designed away, it is scheduled.** It joins the tasks feature's three existing
feel questions on the device pass. The fallback is drawn (mockup §3ב, a bare `✓`) and is a
one-word change.

## What reading the code changed, before anything was drawn

Two premises in the brief turned out to be stale, and both changed a section:

- **§3 has admitted FOUR things since 2026-08-08, not three.** ADR-0160 §T added an attached
  document and did not renumber §3. So this is the _second_ fourth-thing, and §T's answer — a
  **chip** in `hero-acts` — is the precedent to argue against rather than inherit. §U0 replaces
  the list with a rule: content is a block, a way **out** of the point is a chip.
- **§13's "no note on the next event" was false in the shipped app.** `HeroLift.tsx` has rendered
  `<Note point={next} />` since commit `9b284e57` (phase 1, #449) — the bullet that said it
  "cannot arrive quietly" describes something that arrived on day one. §T then built on top of it
  without noticing. §U7 withdraws the bullet.

## What the RENDER found, in the mockup's own first draft

Three, and this is the part prose could not have produced:

- **The assignee's face wrapped onto a line of its own** at 360px. One `flex-wrap: wrap` line
  with `margin-inline-start: auto` on the face; a long title took the line and the avatar landed
  alone underneath. That is ADR-0160 **§O's own finding recurring inside the file §O was written
  in** — flex breaks lines by _hypothetical_ size, so `min-width: 0` and the ellipsis never run.
  The repair is not new: **the deadline on its own line**, which is what ADR-0191 §8 already ships
  for the identical crowding. Costs 13.1px against the one-line version, which truncates the title.
- **18px of "drift" that is not drift.** The first measurement compared the note's text edge
  against the task's **title** edge. The 18px is the `important` star, and the shipped section row
  insets its title by exactly the same thing. The two are separate rows in the table now.
- **The face costs 0px.** It rides the title line's own height.

## What the ink measurement found, and why looking was not enough

`.tsk-due` is `var(--amber-deep)` and `.tsk-due.late` is `var(--miss-deep)` — paper inks. On the
board:

| ink            | light    | dark  |
| -------------- | -------- | ----- |
| `--amber-deep` | **2.93** | 6.31  |
| `--miss-deep`  | **2.44** | 6.15  |
| `#f0c785`      | 10.13    | 10.82 |
| `#f0a09b`      | 7.82     | 8.36  |

The first is under WCAG AA's 4.5 for 11px text; the second is under even 3.0. **In dark the same
tokens are lifted and both are fine** — so the dark screenshot read healthy and the light one read
as merely dim, and only the ratio settled it. ADR-0158 §15, exactly as ADR-0160 §11 found it for
`SettleControl`. Both replacements were already shipped values.

## What the BUILD learned, in the running app

Driven headless against the real backend (`DEV_AUTH=1`, `trip-japan-26`, the now event
`ev-ichiran` and its booking `bk-ichiran`), with the numbers read off the live DOM.

- **§U8 is not a formality, and the running app is what proved it.** The fixture task was written
  on the **booking**, and it rendered on the hero's now point — which it does only because tasks
  resolve through the same `resolveHostContext` the notes and documents already go through. A
  `tasksForHost(event)` call would have read empty there, on the one surface built for standing at
  a gate. `tasksForContext` is one line over the generic `inContext` that `notesForContext`
  already runs on.
- **The line-start delta is 0px live.** That is the number ADR-0191 §5 shipped wrong at 40px and
  reversed on the owner's first look; here it was measured before the build, and then again in the
  app.
- **Live geometry:** the block is **87.1px** of card including its label and the `ועוד N` line,
  the task line **36.1px**, the star inset **18px**, the face **19×19** and `aria-hidden`, the
  title line **one** line, and **0** interactive descendants. At 360×640 the card caps at 622 and
  scrolls 151px with a note and two task blocks; at 390×844 it is 719.3px and does not scroll.
- **The `--miss` ink lands as `rgb(240, 160, 155)`** — the board's, not the paper token's.

## Two things the e2e found

- **Do not read an x before the flight lands.** §5's swing is a `rotateX`, and a 3D rotation under
  perspective projects x as a function of y — so mid-flight two blocks at different heights sit at
  different horizontal offsets. The alignment assertion measured **1.24px** of false drift until it
  waited for `getAnimations()` to empty. This is `references/pitfalls.md`'s "measure after the
  transition" with a cause specific to this surface, and it is worth knowing for anything else
  measured on this card.
- **The ink is asserted as an EQUALITY**, against `.wp-settle.board .wp-settle-btn.skip`'s own
  colour rather than a hex literal — §P's precedent. What must stay true is that the deadline
  paints in the ink this surface already uses for that meaning, not what that ink currently is.

`e2e/boot.ts` gained a `tasks` option, following the `notes` one beside it.

## One thing found and NOT fixed here

**`createTaskSchema`'s `assigneeUserId` rejects the seeded dev user.** The id regex is
`^[a-z0-9-]{8,64}$` and `prisma/seed.mjs`'s ME user is `u-assaf` — seven characters. So assigning a
task through the API under `DEV_AUTH=1` returns a 400 that a real cuid-keyed user never sees. It is
a **fixture-versus-schema** mismatch reachable only in dev, it blocks nothing in the product, and
repairing it is either a seed change or a regex change — a decision about which is authoritative,
not a defect repair. Worked around here by setting the column directly for the measurement pass; on
the backlog.

## Gates

`pnpm typecheck` · `pnpm lint` · `pnpm build` green. `pnpm test` **232 files / 3920 tests**
(3904 before). Local `npx playwright test`: **207 passed, 1 skipped** — including
`hero-in-transit`'s glow test, which flakes under full local parallelism and did not here.
