# 0190 — A readiness check is a task row, and the checks sit inside the urgency ladder

**Status:** Accepted, and **built** (2026-08-16, tasks phase 2 — [session note](../planning/2026-08-16-tasks-phase-2-built.md)). Every number below is measured, first off the mockup's rendered DOM and then off the **running app**.
**Date:** 2026-08-16
**Design reference:** [`mockups/tasks-open-questions-before-phase-2-v1.html`](../../mockups/tasks-open-questions-before-phase-2-v1.html) — the decision pack this ADR answers. It draws only what was **open**; §2's answer here is a **third** order that file did not draw, and the file is left as the record of what was asked rather than retrofitted.
**Session notes:** [the questions](../planning/2026-08-16-tasks-phase-2-open-questions.md) · [the build](../planning/2026-08-16-tasks-phase-2-built.md)
**Build plan:** [`planning/2026-08-15-tasks-build-plan.md`](../planning/2026-08-15-tasks-build-plan.md) — phase 2.

**Builds on:** [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) §4/§5/§6/§7 (the automatic row, the two refusals, the convergence, the CTA deletion — all built here), [0189](0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md) (whose `Avatar`-in-the-editor is what expires §6 below), [0061](0061-plan-home-readiness-rework.md) (the five checks and the CTA-does-the-thing rule), [0120](0120-filter-reveal-is-shared-infrastructure.md) (the reveal every list control animates through)
**Amends:** [0188 §3](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) — the assignee is no longer a bare name (§6).

## Context

Phase 2 was picked up to be built. **Reading its design first turned up five questions none of ADR-0188, the brief or the build plan answers, and a sixth arrived from the owner's phone.** The build stopped and drew them instead — the decision pack above — because a design decision taken mid-build lands in a diff nobody reviewed as a design.

What was never in question, and is built here unchanged: the automatic row leads with the derivation's badge rather than a tick (ADR-0188 §4), the two verbs that cannot work are **absences** in the `⋯` with the subject line stating why (§5), there is no CTA button and no reserved sync column (§7), and `.chk-row` and its parts retire (§6).

## Decision

### 1. The tasks SCREEN carries the checks, and they sit out both other facets

> **AMENDED 2026-08-16 by the owner, and the amendment is the interesting half.** The checks
> now **count toward the Index tile** and **appear under `הושלמו`** once satisfied or
> dismissed. What follows is the original reasoning, kept because the measurement is still
> real; what changed is which way it cuts.
>
> The objection below was that a brand-new trip would announce _"5 משימות פתוחות"_ before
> anyone had written one. The owner's reading is that such a trip **has five things to do**,
> and the tile exists to say how many — so the number was never wrong, only surprising. Same
> for `הושלמו`: a check the data has closed is something you are finished with, which is
> exactly what that chip asks.
>
> **`שלי` is unchanged, and by construction rather than by rule** — it reads
> `assigneeUserId`, and an untouched check has no row to carry one. Delegate a check and it
> appears there like anything else, which is the point of `derivedKey` being an overlay
> rather than a second table.
>
> One behaviour worth naming: `done` is **derived**, so a satisfied check can _leave_ the
> settled facet on its own the moment a booking is deleted. A manual task never does that.
> It is the honest consequence of not storing done-ness, not a wrinkle.

Brief §3 says the checks render "on the tasks surface"; brief §13 and ADR-0188 §6 name only Plan Home. **Both surfaces carry them** — and the screen's two other chips do not.

The reason is one fact with three consequences: **an untouched check has no `Task` row at all** (brief §4). So `שלי` (`assigneeUserId === meId`) can never match one, `הושלמו` (`status`) can never find one, and the Index tile's `preview.open` would count things nobody wrote. Rather than invent a second meaning for each chip, the checks appear under **`הכל` alone**, and `taskPreview` counts only tasks a person wrote (`isManual`).

**Measured, and it is what makes this concrete:** with the checks counted the tile read **7 against 3**, so a brand-new trip would have announced _"5 משימות פתוחות"_ before anyone had written one.

**A satisfied check drops out**, the same way a done task does — both surfaces list what is still **missing**, which is what Plan Home's section title literally says.

**Consequence stated because it is a behaviour change:** the screen's empty state now means "nothing at all to do" rather than "nobody has typed yet", and a fresh trip opens on its readiness checks with the ordinary `+` button rather than on an empty shell.

### 2. The checks sit INSIDE the urgency ladder: urgent → checks → the rest

The mockup drew two orders — automatics-first, and the screen's settled pure urgency — and measured **183px** of burial for the second at three manual tasks, the same burial ADR-0188 §6 rejected on Plan Home.

**The owner rejected both** (2026-08-16): _"Not all tasks are made the same and prioritized or due, overdue tasks should be on top"_, then _"First but also important above them"_. So:

**Anything a person has already marked urgent outranks a readiness check; the checks outrank the ordinary remainder.** Urgent means the two things the feature already models — the `important` flag, or a deadline that has passed.

The checks are **not** a band on the urgency ladder and could not be: they carry no deadline, so `taskBand` has nothing to say about them. They are spliced between the two halves of the manual list.

**And this makes it ONE list, in one card** — which the two-card draft was not. Brief §2's "one noun, one list" now holds on screen rather than only in the model, and `revealRows`/`RevealList` animate the whole thing as one (ADR-0120), which a second card outside the reveal did not.

**Rejected: the departure as the checks' implicit deadline**, which ADR-0188 §6 already calls their deadline and which would let them sort naturally and rise as departure nears. It has a cliff the ADR itself names one surface over: once the trip starts the departure has passed, so every unmet check would read permanently **overdue** and pin to the top — exactly why §6 kept them off the Trip Home band.

### 3. A check's verb goes where the thing lives, and for three of five that is not Home

ADR-0061 §1's "the CTA does the thing" was written about Plan Home, where all five actions close over that screen's own state. From the tasks screen **three of the five are cross-screen**.

The rule is **navigate to where the thing lives**, which is not one destination:

| check             | from Plan Home                | from the tasks screen                        |
| ----------------- | ----------------------------- | -------------------------------------------- |
| flights · lodging | its own seeded `BookingSheet` | deep-link to Home, which opens it on arrival |
| itinerary         | the day builder               | the day tab, same seeding                    |
| documents         | its own upload sheet          | the Index's **own** documents screen         |
| group             | trip settings                 | trip settings                                |

The deep-link is the convention the app already has (ADR-0050's `FOCUS_PARAM`), pointed at a second tab: `HOME_FOCUS`. Nothing new was invented, and back returns through `resolveBack` unchanged.

**This is why the copy moved to `lib/automatic-tasks.ts` and the action is an ID rather than a closure.** Two hosts render one vocabulary; only the destination differs.

**Rejected: a sheet over the Index** (the Index would have to host forms that belong to Home) and **open-in-place with the verb in the foot** (it reuses ADR-0189's idiom and navigates nowhere, but contradicts ADR-0188 §7's "a derived row has nothing to read" — a check's title and meta _are_ its whole content).

### 4. Plan Home keeps its own completed-collapse

Two collapses in one feature is not one mechanism twice: the `הושלמו` facet chip is the **screen's**, and this is Plan Home's. Measured **245px** collapsed against **306px** flat — and without it the section titled "what is missing" starts listing what is not.

### 5. `.chk-ppl` is DELETED, not rehomed

The per-traveller passport pips retire with the rest of `.chk-*`. The meta line already says `2 מתוך 5 העלו דרכון` **in words**, and the dots only ever appeared on one row of five. The trailing-slot variant was drawn and measured (it costs no row height) and still rejected: it adds a third element to a row already carrying a badge and a kebab, to restate a sentence that is right there.

### 6. The row shows WHO OWES IT as a person — and this amends ADR-0188 §3

**Owner, from a device:** _"See how the members are prominent in the creation form but you can barely see it in the main tasks view."_

ADR-0188 §3 decided that deliberately: _"The assignee is a name in the meta line, not an avatar"_, because an avatar would be **"a second identity system per row"** (ADR-0153 §4's rule, borrowed).

**That ground expired when ADR-0189 shipped.** It put `Avatar` into the **editor** for this exact field, so a row drawing the same circle **reuses the identity system this feature already established** rather than adding a second one. The premise lapsed; the conclusion was never re-checked. This is the amendment.

An 18px `Avatar` leads the assignee in the meta line, sized to that line rather than to the form. Measured: the title column is **unchanged at 201px** and the row stays **61px**.

**And it fixes something nobody reported:** an **unassigned** task's meta said _nothing at all_, which is indistinguishable from "assigned to someone whose name did not fit". It now says `לא משויך` with the editor's own glyph.

**Rejected:** the avatar in the trailing slot (**167px** of title against 201, and it visibly wraps a long title) and avatar-only, which asks the reader to identify five people from one letter and a hue.

## Consequences

- **`lib/automatic-tasks.ts` is new and is the whole model**: the overlay predicate, the copy table, `CHECK_ICON`, and the action ids. `computeReadiness` is **untouched**, exactly as brief §3 requires.
- **`PlanHome.rowFor` and its private `CHECK_ICON` are gone**, generalised rather than copied when the screen became a second reader. `useAutomaticTasks` assembles the eight-field readiness input once for both hosts — the two-screens-two-copies shape that drifted the day surfaces for a release.
- **`.chk-row`, `.chk-ic`, `.chk-main`, `.chk-t`, `.chk-m`, `.chk-cta` and `.chk-ppl` are deleted.** `.chk-ok` survives inside `ListRow`'s trailing slot. `HomeSkeleton` follows — it pre-draws Home through the real classes, so it now pre-draws `ListRow`.
- **`createTaskSchema` gains `status`.** Dismissing a check that has no row is a **create**, and without it that one press would be a create followed by a patch, with the second orphaned if the first failed.
- **Opening the `⋯` on an untouched check writes NOTHING.** The first build created the row on menu-open, which made a _read_ a write; brief §4 says the row is minted by the verb. The sheet is handed a never-written `Task` (`draftOverlay`/`isUnwritten`) and `applyVerb` creates or patches.
- **The row's tap means "do the verb" on a check and "open in place" on a manual task**, in one list. Stated so a later phase does not iron it out: the leading element is what says which, which is ADR-0188 §4's whole point.
- **`taskPreview` counts only manual tasks**, so the Index tile is stable against readiness.
- **New `he.ts` copy:** one string, `tasks.subject.derived`.
- **The mockup is left un-retrofitted.** §2's answer is a third order it did not draw; the file records what was asked, not what was chosen.

## Alternatives considered

- **Checks on Plan Home only.** Rejected (§1): brief §3 puts them on the tasks surface, and the facet/tile problems are solvable rather than blocking.
- **Checks under `שלי`/`הושלמו` too.** Rejected (§1): both chips read a row that does not exist, so each would need a second meaning invented for it.
- **Automatics first, unconditionally.** Rejected (§2, owner): an overdue or flagged task is something a person has already said is urgent, and a readiness check should not outrank it.
- **Pure urgency, the settled order.** Rejected (§2) and measured at **183px** of burial — the same burial ADR-0188 §6 refused on the other surface.
- **The departure as the checks' deadline.** Rejected (§2): elegant before departure, permanently overdue after it.
- **A separate card above the list.** Rejected (§2) once the order changed: two cards imply two sorts, and one card is what makes "one noun, one list" true on screen.
- **A sheet over the Index / open-in-place** for a check's verb. Rejected (§3).
- **Dropping Plan Home's collapse.** Rejected (§4): 245px against 306px, and the section stops being about what is missing.
- **The passport pips in the trailing slot.** Rejected (§5): a third element to restate the words beside it.
- **The assignee as a bare name** (ADR-0188 §3). Amended (§6): the premise expired with ADR-0189.
- **The avatar in the trailing slot, or avatar-only.** Rejected (§6) at **167px** of title and a visible wrap.
