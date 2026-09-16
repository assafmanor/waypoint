# 2026-09-16 — Last-minute changes on the ground: product and design

**Outcome:** [ADR-0231](../decisions/0231-the-day-is-changed-where-you-stand.md) (**Proposed**, drawn and measured, not built) · mockup [`mockups/the-day-is-changed-where-you-stand-v1.html`](../../mockups/the-day-is-changed-where-you-stand-v1.html) · catalog + backlog + README + INDEX updated · the [handoff](2026-09-16-handoff-last-minute-changes.md) points here. **The build phase waits on the owner's answers to the ADR's nine forks.**

## What was asked

The owner, after ADR-0228 §6 shipped the cancelled-boat-tour fix:

> I want to do a product, design, then building session on handling last minute schedule changes — how we make this as easy as possible for users to do these kinds of things, thinking what's inconvenient and is holding people back, what's taking too many steps etc. The journey should be as easy as possible, and adding things, canceling, moving things around etc. should be seamless.

Three phases, each closing before the next: product (journeys named, steps counted on the running app, "seamless" decided per journey, a Proposed ADR with forks), design (mockups on the real CSS, both themes, 360 and 390, measured), build (only after the forks are picked).

## Phase 1 · product — what counting found

Counted on the running app, not from memory: `DEV_AUTH=1`, the seeded Tokyo trip, `localStorage['waypoint:dev-now']` pinned to today ⁦13:51⁩ Asia/Tokyo, Chromium at 390×844 driven by a Playwright script that logged every tap and reseeded between journeys (the seed upserts by id, so rows the journeys **created** survived it and had to be swept first — worth knowing for the next session that drives the seed).

| journey                     |                      today | steps | the finding                                                                                                                                            |
| --------------------------- | -------------------------: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cancel a booking (upcoming) |              `⋯` → `דילוג` |     2 | Count is right; consequence is silent — no strip for the freed ⁦2h⁩ before a cluster, `דילגתם` on a tour the operator cancelled, a tap **restores** it |
| move a soft stop ⁦+60⁩      |         expand → `+` → `+` |     3 | One nudge per ⁦30⁩; nothing else moves a Trip row in place                                                                                             |
| move to a **named** time    |   `⋯` → `עריכה` → … → save |     6 | The whole `EventForm`; **ADR-0161 §7 says the Trip card's time is a button — it is a `<span>`**                                                        |
| move a booking ⁦+30⁩        |        expand → `+` → `כן` |     3 | Right shape; one gate per ⁦30⁩                                                                                                                         |
| add something **now**       |     `＋` → type → … → save |     6 | Prefilled **⁦23:15⁩ for ⁦44⁩ min** at ⁦13:51⁩; **ADR-0043 §3's quick-add shipped as the full builder**                                                 |
| add via a gap `+`           |                          — |     0 | **No `+` on the day**: the done tour still holds ⁦10:00–16:00⁩                                                                                         |
| add from the shelf          |   tile → `שיבוץ` → `שיבוץ` |     3 | **Prefilled ⁦09:00⁩ — this morning — and wrote it.** A defect, not a fork                                                                              |
| swap                        |       `⋯` → `החלפה` → pick |     3 | Right; unchanged                                                                                                                                       |
| running late, evening       | expand → `+` → ripple `כן` |     3 | Works only because there was an overlap to close                                                                                                       |
| running late, afternoon     |               expand → `+` |     2 | Lands the free time on the booking, silently; **ADR-0161 §10 deferred the day control**                                                                |

The shape under all of it is the handoff's own: **decided things that never met on one surface.** Four decisions were written and not built (0161 §7, 0043 §3, 0027 §1's Do-it-now, 0161 §10's delay), and two defaults were read without a clock on the one mode that has one.

The `⋯` sheets, verbs and toasts seen along the way matched ADR-0228 §6 exactly: `סיימנו · דילוג · עריכה · מחיקה` on a hard row, `החלפה · העבר למדף` added on a soft one, no gate on a skip, the parked booking on the shelf as `דילגתם`.

## Phase 2 · design — what rendering found

One file, four sections, one per journey (swap is left alone), the app as it is beside the proposal, on the shipped stylesheets. Everything below is off the rendered DOM at 360 and 390, both themes, real webfonts.

- **The chip on the when line cost the row ⁦+10px⁩ on the first render.** The face is sized by its ⁦40px⁩ badge, so the chip paints ⁦5px⁩ into the face's own padding and the row is ⁦69⁩ → ⁦69px⁩ — the trade `button.bld-time` already made in Plan.
- **The overlay needs ⁦8.5px⁩**: ⁦8⁩ reaches ⁦43⁩, the shortfall ADR-0199 measured on the identical Plan overlay and backlogged.
- **`DaySlotPicker` is Plan-violet on every host**, and Trip mode may not wear it (rule 4). Drawn side by side; the accent becomes a variable re-pointed by `data-mode`, `SlotFillSheet`'s own answer from ADR-0161 §6.
- **The quick add's sentence wrapped at 360 because it said `היום` twice.** One `היום` (the sheet's title): ⁦31.8px⁩, one line.
- **Five delay chips as `15 דק׳ … 90 דק׳` scrolled `+90` off the sheet at 360.** As `+15 … +90` with the unit in the sentence: ⁦5 / 5⁩ inside the width, ⁦54×44px⁩ each. `.choice-pill` ships at ⁦36px⁩ (ADR-0052 §6); the chooser lifts its own consumer to the floor.
- **The second head button costs the facts ⁦77px⁩** at 360 and the footer stays one line.
- **F6b (the now marker) drew its own refusal**: the control lands under the rule, and the marker's whole box is ⁦21px⁩.
- **Three primitives are under the floor at every host** and this design inherits them without causing them: `.new-event-btn` ⁦26px⁩, `.field input` ⁦37px⁩, `.sched-confirm` ⁦42px⁩. Recorded in the ADR and the backlog so the build does not fix one host.

The Trip time control is a `role="button"` span, not a `<button>`: the face is a `<button>`, and ADR-0230's first render is what a nested one does.

## The forks put to the owner

The ADR's foot lists nine, each with a recommendation. The ones that change what gets built most: **F2** (a parked card opens a sheet rather than restoring on tap — amends ADR-0116 §5a), **F3** (the picker's exact-time escape is a scoped `ScheduleSheet`, not `EventForm`), **F6** (`מאחרים` in the head's footer), **F8** (a done event does not free its remainder yet). **F1**'s word and **F7**'s chooser are controls in the mockup. A correction is not a fork: if the owner says a default is wrong, the default changes.

## Out of scope, said explicitly

The change feed (a change made by one member reaching the others), the hero as a place to change the day, a `canceled` status, a task written by a cancel. Each is named in the ADR with the decision it belongs to.

## For the next session

- **The counting script** lived at `frontend/.journeys.mjs` during the session and was not committed; its shape is worth keeping — boot, pin the clock, `tap()` that logs and screenshots, reseed **after sweeping the journeys' own UUID rows**. If the build wants the "after" counts in the ADR verified the same way, that is the tool.
- **Environment recipe that worked here** with no Docker: `pg_ctlcluster 16 main start`, a `waypoint`/`waypoint` role and database, `pnpm --filter @waypoint/shared build` before the backend watcher (it cannot resolve `@waypoint/shared` otherwise and reports ⁦304⁩ errors), `backend/.env` as a copy of the root `.env` for `prisma:seed`, Playwright launched with `executablePath: '/opt/pw-browsers/chromium'` because the repo pins a newer Playwright than the preinstalled browser.
