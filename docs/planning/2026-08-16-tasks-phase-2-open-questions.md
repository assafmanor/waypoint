# Tasks phase 2 — six decisions it needs first

**Date:** 2026-08-16
**Mockup:** [`mockups/tasks-open-questions-before-phase-2-v1.html`](../../mockups/tasks-open-questions-before-phase-2-v1.html) — **Open questions; nothing decided.**
**Blocks:** phase 2 (automatic tasks), [build plan](2026-08-15-tasks-build-plan.md).
**Follows:** [phase 1b](2026-08-15-tasks-editor-built.md) / [ADR-0189](../decisions/0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md).

## Why this session exists

Phase 2 was picked up to be built. Reading its design first — ADR-0188 §4–§7, brief §3/§4/§13, the build plan — turned up **five questions none of them answers**, and a **sixth** arrived from the owner's phone mid-session. The build stopped there rather than deciding them in a commit.

**The standing instruction that produced this note (owner, 2026-08-16):** _"if you recognize missing things, such as design or decisions, stop and tell me we need to decide, or mockup the undecided stuff."_ A design decision taken mid-build is invisible — it lands in a diff nobody reviewed as a design, and then the ADRs describe an app that does not exist.

## What is NOT in question

Settled, and it builds without asking: the automatic row leads with the derivation's badge rather than a tick (ADR-0188 §4), the two verbs that cannot work are **absences** in the `⋯` with the subject line stating why (§5), there is no CTA button and no reserved sync column (§7), and `.chk-row`/`-ic`/`-t`/`-m`/`-cta`/`-ppl` retire while `.chk-ok` survives.

## The six

### 1. Does the tasks SCREEN carry automatic rows at all?

The sources disagree. Brief §3: the checks "render in the task row's shape **on the tasks surface**, and Plan Home's _what's missing_ becomes one list." Brief §13 and ADR-0188 §6 name **only Plan Home**.

If the screen carries them, three shipped things break with no designed answer, and all three are the same cause — **an untouched check has no `Task` row at all** (brief §4):

- **`שלי`** is `task.assigneeUserId === meId`. No row, no assignee, so it can never match.
- **`הושלמו`** is `isSettled`, which reads `task.status`. A derived-done check has no status.
- **The Index tile** counts `preview.open`. Measured in the mockup: **7 against 3**. A brand-new trip would read _"4 משימות פתוחות"_ before anyone wrote one.

### 2. The order — and ADR-0188 already ruled the opposite way on the other surface

An automatic task has no `dueAt`, so `taskBand` puts it in `UNDATED`: the bottom, under even the undated manual tasks.

**ADR-0188 §6 refused pure urgency on Plan Home for exactly this reason** — "it buries the readiness checks under every dated manual task" — and drew the alternative under a toggle so the burial was visible rather than argued. The screen's order is settled as pure urgency (brief §13). **Same burial, opposite rulings, nobody reconciled them.**

Measured at three manual tasks: the first check sits **183px** down the card under pure urgency, **0px** under automatic-first. At **zero** manual tasks the two orders are identical — so this is a decision about behaviour at volume, which is why the mockup makes the manual count a control rather than a fixture.

### 3. What an automatic row's tap does _from the Index_

ADR-0061 §1: the CTA does the thing. ADR-0188 §7 deleted the button because "the row's own tap does it" — **written about Plan Home**, where all five actions are closures over PlanHome's own state (`setSheetSeed`, `setActiveDate` + `onNavigate`, `navigate(settings)`, `setUploadingDoc`). **Three of the five are cross-screen.**

Three readings drawn: navigate away to Home's seeded form (what Plan Home does today, and back returns through `resolveBack`) · a sheet over the Index (stays in the list, registers a back layer, but the Index must host a form that lives on Home) · the row **opens in place** with the verb in the foot (reuses ADR-0189's shipped idiom, navigates nowhere — and is the only one that contradicts ADR-0188 §7's "a derived row has nothing to read").

### 4. The completed-collapse would exist twice

Plan Home has `CollapseToggle` + `.chk-done-sum` + `Collapsible`. The screen has the `הושלמו` facet chip, which brief §13 calls **the same** count-in-label toggle from ADR-0061. ADR-0188's retirement list covers the `.chk-*` row parts and says nothing about either. Measured: **245px** with the collapse (four open) against **306px** flat (all five).

### 5. `.chk-ppl` retires with nowhere to go

The documents row's per-traveller passport pips are on the retirement list, `ListRow` has no dots slot, and the meta already says `2 מתוך 5 העלו דרכון` in words. Deleting a shipped affordance is a legitimate answer — it is just an answer rather than a side effect. Three readings drawn and measured; the trailing-slot variant costs the row nothing in height.

### 6. Who owes it — the owner's report, and an expired premise

**Owner, 2026-08-16:** _"See how the members are prominent in the creation form but you can barely see it in the main tasks view."_

Correct, and it is a **decision** rather than a slip. ADR-0188 §3 says it outright: _"The assignee is a name in the meta line, not an avatar"_ — on the ground that an avatar would be **"a second identity system per row"**, borrowing ADR-0153 §4's rule.

**That ground expired when phase 1b shipped.** ADR-0189 put `Avatar` into the editor for this exact field, so a row drawing the same circle is **reusing the identity system this feature already established**, not adding a second one. The premise lapsed and the conclusion was never re-checked.

Worth naming precisely what the screenshot shows: the assignee is text at `--muted` **immediately after** a deadline at `--amber-deep` **bold**. It is not merely small — it is the quietest thing on a line whose loudest thing is beside it.

Four readings, with the cost landing in the title column: name only **201px** (today) · mini avatar + name **201px**, i.e. free · avatar in the trailing slot **167px**, which visibly wraps a long title in the frame itself · avatar only **201px**.

## Three things the render found that reading did not

1. **This file's own CSS comment was wrong before it was measured.** The first draft asserted that a mini avatar in the meta line costs no height. An 18px circle inside an 11.5px line box **stretches the line**: the row went 61px → **68.5px**, a tax on every row in the list including ones with no assignee. Two passes of negative block margin landed it at **61.5px against 61px** — half a pixel, recorded as measured rather than rounded down to the original claim.

2. **§6ג's number is confirmed by a wrap.** The 167px title column breaks a long task title onto two lines inside the frame, so the measurement and the drawing agree.

3. **The mini-avatar reading fixes something nobody reported.** Today an **unassigned** task's meta line says _nothing at all_ — indistinguishable from "assigned to someone whose name did not fit". With the editor's own glyph it says `לא משויך` explicitly.

## Owed next

The owner's six answers. Then: an ADR (or an in-place amendment to ADR-0188 §3 and §6, which is where four of the six land), and phase 2's build — which is otherwise ready, since everything it does not ask about is already decided.
