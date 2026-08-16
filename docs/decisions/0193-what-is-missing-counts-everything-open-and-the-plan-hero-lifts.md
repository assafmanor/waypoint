# 0193 — "What is missing" counts everything open, and the plan hero lifts

**Status:** Accepted and **BUILT** (2026-08-16), then **§2, §3 and §4 amended the same day** across three rounds of owner reports against the built screen — read the banner at the head of each before it. §3 has been placed twice: the toggle went to the section head, then to the section's foot. §5 was separately corrected by the running app; see "What the running app changed" at the end before touching the ramp. Every contrast figure below is measured: first off the mockup's rendered DOM, then again in the real app, and where the two disagreed the app won.
**Date:** 2026-08-16
**Design reference:** [`mockups/the-plan-hero-lifts-and-the-checklist-counts-everything-v1.html`](../../mockups/the-plan-hero-lifts-and-the-checklist-counts-everything-v1.html) — §1 the sentence that lies · §2 the hero's second number · §3 the inline list and its collapse · §4 what the lift opens onto · §5 the skin. **Promoted by this ADR.**

**Amends:** [0160 §H](0160-the-hero-lifts-and-shows-a-horizon.md) — the plan hero **does** lift now, on §H's own stated revisit condition rather than against it (§4 below).
**Builds on:** [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) §6 (Plan Home carries the converged list), [0190](0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md) §2 (urgent → checks → the rest), [0061](0061-plan-home-readiness-rework.md) (the five derived checks), [0158](0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md) §4/§15 (a surface's ink is a token; an inverted surface is the limit), [0028](0028-plan-violet-color-budget-dark-ready.md) (plan violet is mode identity), [0017](0017-mobile-first-device-targets.md) (44px), [0045](0045-trip-home-real-data-only.md) (no reassuring empty card), [0148](0148-the-place-form-has-the-room-it-needs.md) §1 (the bounded card with one scroller).

## Context

One owner message, two reports:

> _"The home readiness should also show non automatic tasks. Maybe tasks that aren't due soon could be collapsed idk, but at least show something, because right now it says all done where it isn't true - that's misleading."_

> _"Also we should create a lifted plan hero for upcoming tasks."_

Reading the code before drawing anything moved four of the five sections.

- **Plan Home already renders manual tasks. The WINDOW is the bug.** `PlanHome.tsx` builds its converged list from `tasksDueSoon(...)`, whose predicate requires `task.dueAt` and admits only overdue or within `TASK_BAND_LOOKAHEAD_DAYS` (7). So two classes of task are invisible on that screen: an **undated** one, and anything due more than a week out. `tasks.ts` states the window's own justification in its docstring — _"the right rule for a band you read ON the day"_ — and Plan Home, whose countdown routinely reads `בעוד 47 ימים`, is not that band. The seven days were argued for Trip Home and inherited by Plan Home without ever being argued for it.
- **The open half and the completed half already disagree, silently.** `completedManual` filters `isManual && isSettled` with **no date window at all**. An undated task is therefore invisible while it is open and appears under `הושלמו` the instant it is ticked — the section announces the completion of something it never once showed. This is what makes "widen the window" the only internally consistent repair rather than one option among several: the two halves have to ask the same question.
- **`הכול מוכן 🎉` is gated on `converged.length === 0`,** which is precisely the reported condition. Five satisfied checks plus four undated open tasks prints it. Measured in the mockup's default state: the sentence renders, above five open tasks, with **no checklist card on screen at all**.
- **`.tsk-more` has no CSS rule.** `TripHomeTaskBand.tsx` renders `<button className="tsk-more">` as the band's overflow row; `grep -rn '\.tsk-more\b' frontend/src --include=*.css` returns only the unrelated `.tsk-more-mark`, and `App.css` has no global `button` reset. Trip Home's `עוד N משימות` row is a **bare UA button** — measured at **19px** against the 44px floor. Unrelated to the report, found on the way to reusing its geometry, and fixed here because §3 needs that row to exist.
- **ADR-0160 §H's "no lift" is not being overturned.** §H refused it because _"what it summarises — the readiness percent — is the checklist rendered immediately beneath it"_, and named the condition for revisiting: _"when Plan's hero summarises something it does not show inline"_. §3 creates exactly that condition. The lift is a **consequence** of the first report, not a second feature beside it.

## Decision

### 1. The list counts everything open, and the sentence survives

`tasksDueSoon` stays as it is and stays Trip Home's. Plan Home reads **every open manual task** instead — no date window, matching what its own completed half has always done.

`הכול מוכן 🎉` is then gated on there being nothing open **at all**: no live check, no open task, dated or not. It is deliberately **not deleted**. The mockup carries a third trip state (`באמת סגור`) for one reason — to make the deletion visible as what it would be, giving up the only moment the screen says something good. The sentence was never wrong; it was said in the wrong place.

### 2. Two numbers with two names, and a second bar is rejected

> **AMENDED 2026-08-16 — the second number counts the CHECKS too** (owner: _"in the hero it
> says משימות פתוחות X which doesn't include the automatic tasks"_). It was `openTasks.length`,
> i.e. manual only. ADR-0190 §1 as amended settled that a readiness check **is** an open task,
> and `taskPreview` has counted them for the Index tile ever since — so the hero was answering
> "how many are open" with a different number than the tile, which is the disagreement that
> rule exists to prevent.
>
> The repair is to **reuse `taskPreview`**, not to add `+ liveChecks.length` beside it: one
> derivation, two surfaces, and they cannot drift. `overdue` stays manual **by construction
> rather than by choice** — a check carries no `dueAt`, so nothing about it can have passed.
>
> The bar and the line now overlap (a check is in both), and that is correct: they answer
> different questions. The bar is _how ready is the trip_ across five fixed dimensions; the
> line is _how many things do you still owe_.

`מוכנות הטיול` is `resolvedReadinessPct` over the five checks, and it stays that. A hero reading **100%** above eight open tasks is the same lie one line up, so the hero gains a second readout in `.prep-ready-top`'s own shape — a label at the start, the value at the end:

```
מוכנות הטיול                    100%
[==============================]
משימות פתוחות     ⟨2 באיחור⟩       8
```

Giving the second number **its own noun** is what does the work. Once a line says `משימות פתוחות` in as many words, the percentage above it stops implying it covers them, and neither number has to be adjusted to protect the other.

**Rejected: one denominator.** Counting tasks into the readiness percentage sounds the most honest and behaves the worst — the denominator grows every time somebody writes a task, so **recording what you have to do reads as losing ground**, and on a trip with forty tasks each check is worth 2%.

**Rejected: a second progress bar.** Drawn in the mockup as §2ג. A bar needs a fixed denominator and an open-ended list is the one thing that has none; two stacked bars also read as one measurement broken in half.

**It is a readout, never a control.** The same rule that turned `.wp-board-also-toggle` into `.wp-board-also-read` in ADR-0160 §4, and here it is forced by the same mechanism: §4 makes the hero a `<button>`, and Chrome reparents everything after a nested `<button>` inside one. The mockup counts interactive descendants of `.prep` and the number is **0**.

### 3. Urgent and the checks inline, the rest behind toggles at the section's FOOT

> **AMENDED AGAIN 2026-08-16** (owner: _"maybe fit better on the bottom instead of the top"_).
> The toggle moved to the head one round earlier, and with the completed toggle already there
> the head held a title, a status and two controls — which is a toolbar, not a section title.
> Both `.chk-toggle`s now sit in a `.chk-foot` row under the card. Nothing about how they LOOK
> changed; `הכול מוכן 🎉` stays in the head, because it is a statement rather than a control
> and it is the one thing that line was always for.
>
> **And `.chk-done-sum` is DELETED** (owner: _"the ✅ הושלמו shows only automatic tasks, maybe
> we should change it (remove? Add the and X more tasks? not sure)"_). Removed rather than
> extended, on its own stated reason: the code comment says it existed "so the count-in-label
> toggle always has something legible to point at while collapsed", and that premise expired
> when the toggle became `הצג 3 שהושלמו` — which carries the count and the noun itself. It was
> redundant _and_ wrong, listing the automatic checks only, so a completed manual task was
> invisible in a strip claiming to summarise what was done. Adding "+X more" would have made a
> duplicate accurate instead of removing it.
>
> The deletion cascaded, which is the argument that it was dead weight: `CHECK_ICON`,
> `t.planHome.checklist.summaryLabels` and `completedSummary` had **no other consumer** and go
> with it, along with three CSS rules and two orphaned imports.

> **AMENDED 2026-08-16, same day, on the owner's report against the built screen.** The
> collapse was shipped as a full-width row at the foot of the `.checklist` card (`.chk-more`)
> and was reported as _"really ugly (what's this font? Sizing?)"_ with the instruction that it
> _"should replace the 'you're ready 🎉' in placing and look like the הצג/כווץ שהושלמו"_. It
> now sits in `.sec-title-end`, in `allDone`'s own slot, wearing `.chk-toggle` — the class the
> completed toggle already wears. The two can never collide: far tasks existing is exactly
> what makes `allDone` false. Measured at 360px with both toggles present, the head is
> **24px** and does not wrap.
>
> **The ugliness had a cause worth recording, because it is a trap for every future caller of
> `CollapseToggle`.** `.wp-collapse-toggle` sets the `font` **shorthand** to `inherit`, which
> resets `font-size` and `font-weight` at equal specificity — and `tasks.css` loads _before_
> `collapsible.css`, so the primitive won and the row rendered at the inherited **16px / 400 /
> `--ink`** instead of 13px / 700 / `--cta`. `.chk-toggle` escapes it only by re-declaring
> `font: inherit` inside its own rule before setting its size. A caller that does not know to
> do that gets a silently wrong control. `.chk-more` is deleted; `.tsk-more` (Trip Home's
> overflow row, a plain `<button>`) keeps the geometry.
>
> **And the Hebrew on both toggles is reworked**, since the owner called it bad on the one it
> was asked to match. `הצג` ⇄ `כווץ` was not a pair — one names the content, the other the
> mechanism — so both directions are `הצג`/`הסתר` now, the pair `Collapsible`'s own docstring
> already uses. `(3)` in brackets is a UI convention rather than Hebrew, so the count reads
> inline where Hebrew puts it: `הצג 3 שהושלמו`, and `הצג אחת שהושלמה` at one. The far group
> stops being `רחוקות` — it stopped being about distance the moment §4 dropped its date bands,
> and an undated task was never "far", merely not urgent — so it is `הצג עוד N`.

The order is not invented here: it is `orderTaskRows` exactly as the tasks screen already runs it (ADR-0190 §2) — urgent (`important` or overdue) → the live checks → the rest. What changes is that "the rest" now contains the far and undated tasks, and they sit behind **one row at the foot of the same `.checklist` card**, not a second control beside it.

That row is `CollapseToggle` at a second density (`.chk-toggle` is the first), reusing the shipped `Collapsible` the completed half already animates through. Measured at **44px**, which is the floor `.tsk-more` has been missing.

**`.tsk-more` points at that rule when this ships.** Trip Home's overflow row is the same row in a different card, and it currently has no geometry at all.

### 4. The lift opens onto the run-up — ONE list, in the tasks screen's order

> **AMENDED 2026-08-16, same day.** The five date-keyed bands below are **retired**. The owner:
> _"in the lifted no need to show the during the trip section"_, _"limit the tasks to the top 5
> and show and X more"_, _"no need to separate with and without date, just sort by the same
> priority order as in the tasks screen"_.
>
> So the card shows `orderTaskRows` — urgent → the live checks → the rest, which is ADR-0190
> §2 and already existed — capped at `PLAN_LIFT_TASK_CAP` (**5**) with the remainder stated as
> `ועוד N`. `planRunUp` and its `PlanRunUp` type are **deleted** rather than left unused, and
> the four band labels leave `i18n/he.ts` with them; `t.planHome.lift` keeps only `title`, the
> accessible name a `Modal` requires. The card now carries no headings at all.
>
> **What the original section argued, and why the owner is right anyway.** Cutting the bands
> against the departure is a true statement no other surface can make, and it cost more than it
> paid: a task with no date is not a different KIND of thing from one with a date, and the
> bands put `ללא תאריך` last regardless of `important` — so a flagged undated task fell below
> every check, which is the ladder ADR-0190 §2 set being quietly bent by a second ordering.
> One order for both surfaces is the rule; the bands were the exception.
>
> The cap is **5** and not `HERO_TASK_CAP`'s 3, because that cap is per STOP on the trip hero
> ("what do I still owe here") while this is the whole run-up to a departure.

The prep hero becomes liftable, through the shipped path and nothing new: `Modal` variant `lift`, `useLiftFlight` off the measured collapsed box, the `Board`/`HeroLift` split where the screen owns every derivation and the card is presentational. `.prep` takes `.wp-board.is-tappable`'s five declarations.

What it opens onto is the horizon in five bands:

```
דחוף  →  מה חסר להשלמה  →  לפני היציאה  →  בזמן הטיול  →  ללא תאריך
```

The first two are `orderTaskRows`' own first two groups, so the lift and the screen behind it cannot teach a different order. The last three split the remainder **by the departure**.

**That split is the reason this hero is worth lifting rather than being a second tasks screen.** The countdown sits 40px above the bands and is the exact line they are cut on; `לפני היציאה` is a statement about the number the hero is already showing. No other surface in the app can say it.

**Rejected: banding by the week.** Drawn as §4's left frame. It is Trip Home's seven-day window returning through the back door to the one screen §1 has just established it is wrong for.

**Every row is `.hero-task` as ADR-0160 §U ships it** — the empty checkbox, the star, the assignee face, the deadline on its own line. Zero new row rules. And it is a **read**: no tick, no menu, nothing pressable, which is what §U settled for the trip hero (the owner was offered the tickable version and declined) and what pays §4's nested-button constraint for free.

The card is **content-sized and bounded**, one scroller between a pinned head and no foot — ADR-0148 §1's shape, third consumer. Measured at **543.8px** against a 640px screen, so the common case scrolls inside its own box rather than becoming a screen.

### 5. Violet all the way through, on ONE gradual ramp — which costs a surface token and a NAME for the ink that surface already had

Owner's call in two steps, and the second is what shaped this section: _"Definitely all violet. Maybe add some gradient that makes it become darker or something."_ Then, against the first drawing: _"Much much much more gradual, and like violet to dark violet"_ · _"the gradient should be much more subtle, much more gradual."_

**There is no seam.** The first drawing resolved the darkening inside 44px at the top of the body, which put a visible edge exactly where the card has to read as one object — a band, not a gradient. So the ramp is not the body's, it is the **card's**: one `linear-gradient` over the whole lifted surface, head and body both transparent.

```
--plan-surface-2  0   → --plan-surface  110px  → --plan-surface-3  330px
```

**The stops are in PIXELS, and that is a correction the mockup could not have made** — it shipped `16%`/`100%` and the running app is what caught it. A percentage stretches the ramp with the card, so where any row sits on it depends on how much content there is, and so does its contrast. The mockup's six-row card measured the top band label at 4.8:1; the real 828px card with eleven rows measured the same label at **4.28:1** and the overdue deadline at **2.93:1**, both having moved up into brighter violet. A design whose legibility is a function of list length is not a design. In px the ground under a row is fixed, the darkening resolves above the first band in every case, and a longer list simply gets more of the deep end.

Note which card is the worst case afterwards, because it inverts: with px stops the **shortest** card is the dangerous one, since its rows sit nearest the bright top.

It opens on `.prep`'s own two stops in `.prep`'s own order, which is what keeps the top of the lifted card the violet the collapsed hero already was — the FLIP has nothing to cross-fade — and then falls away across the remaining ~84%.

**`--plan-surface-3` is the one new surface token** (`#2b2069` light, `#1a1442` dark): third in the family `--plan-surface`/`-2` already established, obeying ADR-0158 §4's rule that made those two exist — **a surface must not brighten on dark**, so the dark value is deeper rather than lifted the way an accent (`--plan-deep`) is. It is a dark _violet_, not a near-black; that was the owner's word and it is also what keeps ADR-0028's mode identity legible at the bottom of the card.

**A gradual ramp is what settles the ink question, and it settles it the other way from a flat one.** On a single flat deep ground the shipped `--on-dark-*` ramp would have worked untouched — that was the previous draft, measured and true. A ramp cannot use it: the ramp's top _is_ bright violet, and there `--on-dark-faint` is **1.45:1** and `--on-dark-dim` **2.02:1**. Any ramp gentle enough to read as one violet surface is a ramp whose upper half no cool grey survives.

What does survive is white-alpha, because it composites _toward_ the ground instead of fighting it — which is exactly why `.prep` was written that way in the first place. So the second addition is **not a new ink family; it is a name for the one this surface has always had.** `.prep` inks itself in six white-alpha literals scattered through `screens.css` (`.72` for the kicker, `.8` for the countdown unit, `.82` for the dates, `.88` for the readiness row, `#f2effc` for the card, `.18` for the track). ADR-0158 §3's rule is that the ink a surface carries is a **token**; this surface's ink has simply never been one. Collecting them into `--on-plan-strong` / `--on-plan` / `--on-plan-dim` / `--on-plan-faint` is the reuse move, and it retires six literals rather than adding four.

**The rungs' alphas are set from the measurement, not from taste.** The binding case is the **first** band label — highest in the ramp, therefore on the brightest ground any row sits on. Because the ground varies down the card, every rung has two numbers:

Measured **in the running app**, light mode, on a real 828px card (dark clears everything by roughly 2x):

| ink                             | worst row  | best row |
| ------------------------------- | ---------- | -------- |
| `--on-plan-faint` — band labels | **5.65:1** | 9.36:1   |
| `--on-plan` — task titles       | **7.85:1** | —        |
| `--on-plan-dim` — deadlines     | **4.59:1** | 9.15:1   |

`--on-plan-faint` is `0.80`, not the `0.76` first drawn: at `0.76` the top band label measured **exactly 4.5:1**, and a rung sitting on the floor is one that fails the first time anyone nudges a stop position.

**The overdue deadline needed its own value too, and the board's does not travel.** `#f0a09b` is `.wp-settle.board`'s ink at 7.82:1 on `--board`; on this ramp's upper half it measures **3.75:1** at the shortest card the lift can draw. Lightened to `#ffc4be` — the same move `--on-plan-*` makes against `--on-dark-*`, for the same reason — and measured at **5.75:1** on that worst row.

**The dark-mode trap, for the third time in this area.** The same two `--on-dark-*` rungs on the _undarkened_ `--plan-surface` measure **4.04** and **5.63** in dark mode — they pass. A dark screenshot of the naive violet card looks entirely healthy, and only the light one is broken (ADR-0160 §U's deadline inks, ADR-0158 §15). This is why the mockup computes ratios from resolved, composited colours rather than from screenshots.

**The overdue pill inverts, for the same reason and by the same token's own rule.** On the head's bright violet a tinted chip with red ink measures **1.94:1**; `#f0a09b`, borrowed from `.wp-settle.board`, is 7.82:1 on the board and does not travel. `tokens.css` already prescribes the answer — **`--miss` is a FILL**, `--miss-deep` is the ink — so the pill is solid `--miss` with white ink: **5.17:1** light, **14.41:1** dark.

**Rejected: a violet head over the board's ground.** Drawn as §5's left frame and it _measures fine_ (5.02:1), which is exactly why it is worth recording: a passing number is not an argument. The card stops being one object halfway down, and plan violet — the app's one always-violet surface — becomes a hat on a trip-coloured card.

**Rejected: a short ramp with a flat ground below it.** The previous draft, and cheaper on paper — a flat deep ground needs no ink work at all. Rejected on the owner's report against the drawing: resolved in 44px it is an edge, and an edge at the head/body join is the one place this card cannot afford one.

## Consequences

- Plan Home's list grows with the trip. The collapse in §3 is what bounds it, and the cap is a **collapse, not a truncation** — nothing is dropped, so no count can lie.
- `--plan-surface-3` and the four `--on-plan-*` rungs join `tokens.css` in `:root` **and** in the `[data-theme='dark']` block **after** it, never inside it (`frontend/CLAUDE.md`'s rule, which silently un-set the entire type scale once).
- **`.prep`'s six white-alpha literals in `screens.css` should be converted to the `--on-plan-*` rungs in the same change.** Not a drive-by: the ramp is being introduced precisely because that surface's ink was never named, and leaving the literals beside the tokens is how a seventh gets written. The values are chosen to preserve what `.prep` renders today, so this is a no-op refactor — check it as one.
- The prep hero becomes a `<button>` and therefore inherits ADR-0160 §4's constraint permanently: **no interactive descendant, ever**. It has none today; a build-time guard in the shape of §4's existing detached-tree test is owed, because no snapshot can see this failure.
- `BEAT.REBUFF` on `.prep` (ADR-0160 §H) is **retired** — the press now opens something, so the rebuff has no condition left on that surface. **The beat itself stays**: counted at build time, the Trip board is still a claimant (`Home.tsx` passes it whenever `liftable` is false), which is the surface §9 wrote it for in the first place.
- The lifted plan hero is a `Modal`, so back / Escape / backdrop / the Android gesture all reach one handler (ADR-0103, ADR-0090). Nothing here is exempt.
- The mockup's contrast harness composites alpha and reads gradient stops. Both were added because the naive version was **wrong in this file three times** — reporting 1:1 for a tinted pill, 3.36:1 for a card measured against the page behind it, and 1.06:1 for ink on a gradient with no `background-color`. Any future file measuring a ratio should copy that function rather than the idea of it.

## What the running app changed

Four things, and two of them are corrections to this ADR rather than notes on it. All four were invisible to the unit suite (jsdom has no stylesheet and reports every rect as zero) and to the mockup (which chooses its own fixture).

1. **§5's gradient stops were percentages, and that made legibility a function of list length.** A `%` stop stretches the ramp with the card, so a row's ground depends on how much content is above it. The mockup's six-row card put the top band label at 4.8:1; the real 828px card with eleven rows put the same label at **4.28:1** and the overdue deadline at **2.93:1**. Now in px — corrected in §5, with the worst case inverted: it is the **shortest** card, not the longest.
2. **The overdue ink had to be lightened again.** `#f0a09b` is the board's, and this ramp is brighter than the board everywhere. `#ffc4be`, measured.
3. **A readiness check rendered a CLOCK beside its meta line.** The first build mapped a check's `meta` onto `HeroLiftTask.due` because they occupy the same line — and `due` draws a clock, so every check read as though `חסרות טיסת הלוך וטיסת חזור` were a deadline. A check has no `dueAt` and never can, which is the very thing ADR-0190 §2 turns on, so the glyph asserted what the model forbids. `HeroLiftTask` gained a `meta` field; a spec now pins the absence of that icon.
4. **A board ink leaked into the violet card, and listing rungs is how the next one is missed.** `.hero-task-more` — the `ועוד N` line — kept `--on-dark-faint` and measured **3.89:1** on the ramp. It surfaced only when §4's amendment made that line load-bearing and deleted the band labels that had carried the override. The repair is not the one rule: `hero-lift.spec.ts` now **sweeps every text-bearing node in the lifted card**, composites its ink over the gradient at that node's own height, and asserts the AA floor — verified to fail (3.89 against 4.5) by putting the leak back.
5. **The three things that held exactly as designed**, checked in the real DOM rather than assumed: `.prep` is a `<button>` with **0** interactive descendants (ADR-0160 §4), the collapse row measures **44px**, and the lifted card is **828px** capped by `--lift-max-h` with its body scrolling inside — content-sized within the cap, as ADR-0148 §1 requires.

## Alternatives considered

- **Counting tasks into the readiness percentage.** Rejected (§2): the denominator grows when you write things down.
- **A second progress bar for tasks.** Rejected (§2), drawn as §2ג: no fixed denominator, and it reads as one measurement split in two.
- **Deleting `הכול מוכן 🎉`.** Rejected (§1), with the `באמת סגור` state kept in the mockup so the deletion is visible as a loss rather than a tidy-up.
- **Widening the window to 30 days instead of 7.** Rejected (§1): swaps one arbitrary number for another and leaves an undated task — the commonest kind in the planning phase — invisible forever. The window is not the wrong size, it is the wrong mechanism for this screen.
- **Banding the lift by the week.** Rejected (§4), drawn as its left frame: Trip Home's window returning to the screen it is wrong for.
- **The first day's shape in the lift, under the bands.** Rejected: that is the Days tab, which is the trap ADR-0160 §12 named for the trip hero.
- **Tickable rows in the lift.** Rejected (§4): already settled for the trip hero in ADR-0160 §U, and structurally forbidden by §4's nested-button finding.
- **A violet head over the board's ground.** Rejected (§5) at 5.02:1 — a passing measurement, rejected on identity.
- **A violet ink ramp for the lifted body.** Rejected (§5): the owner's darkening removes all four overrides and leaves one surface token.
