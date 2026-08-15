# 0188 — A task's tick is a sibling, and the row's leading element says who owns the outcome

**Status:** Accepted. **§1–§3 are built** (2026-08-15, tasks phase 1 — [session note](../planning/2026-08-15-tasks-phase-1-built.md)); **§4–§7 are still design**, and land with phases 2 and 3. Nothing the build found contradicted any of it, and the one number it was measured against — a 26px ring reading as pressable under a thumb — is still owed to the device pass (§8).
**Date:** 2026-08-15
**Build plan:** [`planning/2026-08-15-tasks-build-plan.md`](../planning/2026-08-15-tasks-build-plan.md) — the six phases, their status, and the decisions taken while building them.
**Session note:** [`planning/2026-08-15-session-271-the-tasks-design-session.md`](../planning/2026-08-15-session-271-the-tasks-design-session.md)
**Design reference:** [`mockups/tasks-row-and-refusals-v1.html`](../../mockups/tasks-row-and-refusals-v1.html) — §1 the three placements · §2 the hit-area probe · §3 the two readings of the brief's §2 and the two manage sheets · §4 the row's nine states · §5 the band on both Homes. Every number quoted below is read off that file's rendered DOM, in a run that loaded Assistant.
**Prerequisite brief:** [`planning/2026-08-15-tasks-design-brief.md`](../planning/2026-08-15-tasks-design-brief.md), whose **§A, §B and §D** this ADR closes. Its **§C** (an `everyone` task partially complete), **§E** (the hero slot) and **§F** (the mark on a host row) are deliberately **not** closed here — see §8.

**Implements:** the brief's Part 1 — one noun, derived-not-stored automatics, `derivedKey`, three assignment states, one `important` flag, no day-rail draw, no mode gate, the flat urgency-ordered screen, and the phase order. Nothing here re-opens any of it **except** §2, which §4 below amends with the reason.
**Builds on:** [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) (the sibling feature this one is shaped like, and the row it settled), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) (the row menu, its named subject, and the danger partition), [0061](0061-plan-home-readiness-rework.md) (the five checks, the CTA-does-the-thing rule, the completed-collapse), [0017](0017-mobile-first-device-targets.md) (the 44px floor every number here is measured against), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget §3 spends nothing from)
**Relates:** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §4 (the nested-button finding, reproduced rather than quoted), [0139](0139-settling-an-event-from-the-map.md) (`SettleControl`, and why this is not a fifth density of it), [0091](0091-sync-badge-cloud-and-silent-when-synced.md) (the reserved sync column an automatic row does not take), [0092](0092-unsynced-treatment-and-change-groups.md) (the row's two write states), [0150](0150-a-form-refuses-at-the-field.md) §8 (a control is disabled only when a press could not work)

## Context

The brief split the tasks feature into a settled Part 1 and six open design questions, and named two of them load-bearing: **§A**, where a completion control can sit on a `ListRow`, and **§B**, whether an automatic task can refuse edit and delete on a row that looks like every other row. It called §B "the sharpest risk in the feature and the thing a mockup settles and prose cannot", and it was right — but not about the thing it expected.

Four findings from reading the code and rendering the result shape everything below.

- **The brief's premise for §A is false, and its conclusion is still correct.** §A says a task row would be "the first managed list row in the app with an interactive element that is not the `⋯`". `PlaceBadge` already is one: `ListRow` has shipped an `onShowOnMap` prop since ADR-0121 §8, and it makes the row's **leading** badge interactive. So the app answered this question once already, and not with a sibling — it used a `role="button"` **span inside** the trigger, with the reason in a comment at `PlaceBadge.tsx:112`. That is a third option §A does not list.
- **ADR-0160 §4's parser finding reproduces exactly, and it binds less than it is usually quoted as binding.** Rendered live in §1a of the mockup, Chrome closes `.wp-listrow-open` at a nested `<button>` and reparents everything after it: the row ends with **4 children instead of 3** and the inner button is no longer inside the trigger. What it binds is a real nested `<button>`. A `role="button"` span parses fine — so the sibling is the right answer for **traffic and ARIA**, not for the parser.
- **`.chk-row` is `ListRow` written a second time.** Plan Home's checklist row (`screens.css:1319`) is badge + title + meta + trailing control, inside a `.checklist` card that is `.index .listcard` under another name. The brief's §D says "neither Home should grow a bespoke list"; the finding is that one already is one.
- **The brief's §2 and its §4 cannot both survive §A.** §2 says a manual and an automatic task look the same; §4 says an automatic task's done-ness is derived. Put a button at the leading edge, as §A requires, and "look the same" means a button that cannot be pressed in the most prominent position on the row. Rendered side by side (§3), the literal reading produces five identical circles of which three are inert — which is not a behaviour, it is the definition of reading as a bug.

## Decision

### 1. The completion control is a SIBLING of the row's trigger, at the LEADING edge, and `ListRow` grows exactly one slot

`ListRow` gains a `lead` prop rendered **before** `.wp-listrow-open`, mirroring the kebab rendered after it. One new slot, one new CSS rule, no new component. The row keeps its flex axis and every other consumer is untouched.

**Leading, not trailing** — and the render says the reason is not width. Measured at 360px, the title block gets **221px** with the control leading and **223px** with it trailing: a 2px difference, i.e. none. So the decision rests on the two things that are not pixels. Two 44px targets sitting adjacent at the trailing edge is a mis-tap the row cannot recover from; and the completion control is the row's **primary verb**, where the kebab is the leftovers menu — filing the primary verb beside the leftovers inverts the division this repo already writes down ("the menu holds verbs, the row holds content", ADR-0153 §8). A checklist also reads as a column of state, and the column has to be at the edge the eye starts from.

**The lead slot is narrower than the badge it replaces.** 44px against `ListRow`'s badge inset of 61px (14 + 36 + 11), because the brief's §5 is right that a task has no icon slot to fill. A task row is therefore not a tighter row than a booking row — it is a slightly roomier one.

**Why not a nested `<button>`, and why not `PlaceBadge`'s span.** The first is ADR-0160 §4, reproduced live rather than cited (see Context). The second parses, and fails on two other things: a `<button>` may not contain a focusable descendant, and the inner control has to `stopPropagation` on **every** press. `PlaceBadge` can afford that because "show me this on the map" is occasional; the verb pressed on every row in a to-do list cannot be a control that swallows the row's own tap.

**Why not `SettleControl` at a fifth density.** Root rule 8 makes this a refusal that has to be argued rather than assumed. `SettleControl` is a symmetric **pair**, asked retrospectively of a slot the group occupied, and `settle-control.css` states its own premise: _"skipping is not the absence of an outcome, it is the other one"_. A task is discharged, not adjudicated — `done` is the point and `dismissed` is a rare escape that belongs on the `⋯` with the other low-frequency verbs. Drawn anyway (§1e) and measured: the pair takes an **82px** lead slot against 44px, leaves the title **183px** against 221px, and at 360px pushes the row from **60px to 78px** because the title wraps. It also asks a question nobody asked.

### 2. The hit area is a rounded SQUARE, and this is a render finding rather than a style choice

`border-radius` clips the hit region, not only the paint. The first draft drew the 44px control as `border-radius: 50%`, and the probe in §2 — a 2px grid of `elementFromPoint` calls across the control's own box — reported it answering **83% of the square**, with the four corners falling through to `.wp-listrow-open` underneath. A corner tap therefore **opened the task instead of completing it**: a wrong action, not a dead one, and invisible in source.

`.wp-listrow-kebab` already ships the right answer — a 44px box at `border-radius: 12px` with the visible ink drawn inside it. Adopted unchanged; the circle a checklist needs is a `::before`. After the change the probe reads **95%**.

**And the slot needs `z-index: 1`.** The control uses the kebab's negative-margin recipe (44px box, 30px layout), so it overhangs its slot by 7px — and unlike the kebab it is **first** in DOM order, so without a stacking context the trigger paints over the overhang and takes those taps. The kebab never needed this because it is last. Same recipe, opposite end, different consequence.

### 3. The row shows four facts and spends no colour it does not owe

Lead = the tick. Title line = the task's own words, with a **star** when `important`. Meta = the deadline, then the host chip, then the assignee. Trailing = the reserved sync column and the kebab.

- **The deadline is the only thing taking a hue, and it takes two.** `--amber-deep` for a due time, because a deadline is time and commitment and `--amber-deep` is amber's paper variant; `--miss-deep` when overdue, because overdue is a **status** and not a priority. Rule 4 holds with no exception. The word is ADR-0171's shipped `עד`, reused rather than re-invented.
- **`important` spends nothing.** A star glyph in `--ink` and the title at weight 800 — the brief's §7 is right that the palette has nothing left, and shape-and-weight is also what lets the flag become a scale later as a column rather than a redesign.
- **The assignee is a name in the meta line, not an avatar.** ADR-0153 §4 dropped the author's avatar as "a second identity system per row, serving no decision the reader is making here". For a task the reader **is** making that decision — but the `שלי` chip on the facet axis answers it in one press and without an identity system, so the name stays text.
- Pending dims the row, failed deliberately does not (ADR-0092), unchanged.

### 4. The LEADING ELEMENT says who owns the outcome — and this amends the brief's §2

**The brief's §2 holds everywhere except the one element that is a verb.** One noun, one list, one sort, one row shape, no separate section, no second word — all of it survives. What cannot survive is pixel-identity at the leading edge, because §4 of the brief gives an automatic task's done-ness to the derivation and §A puts a button there.

So: **a manual task leads with a control; an automatic task leads with the derivation's own badge** — `ListRow`'s ordinary badge slot, carrying the check's glyph from PlanHome's existing `CHECK_ICON` map. Nothing new is drawn. Done-ness trails as `.chk-ok`, the exact element PlanHome's completed checklist row already renders.

**What the render settled, and it is not what the mockup was drawn to test.** The two cards measure **364px against 364px** at 360px and **306 against 306** at 390 — identical, so this was never a pixel decision and pretending otherwise would be dishonest. The decision is what happens when somebody does the first thing anybody does with a task list: taps the circle. Under the literal reading that fails silently on three of five rows. Under this one there is no circle to tap, and the row's tap opens the thing that will close the check.

**The claim that one difference does not break "one noun" is measured, not asserted.** The title column shifts by **7px** between the two row kinds (54px against 61px of leading inset), and the automatic row's title block is **215px** against the manual row's **195px** — the same noun at the same scale in one list.

### 5. A refusal is answered where it is asked, which is the menu — and nothing is disabled

The row carries no "you cannot edit this" mark, because a mark on a row says "this is different" and cannot say "you may not delete this". The question is asked in the `⋯` sheet, so that is where it is answered.

**The two verbs that cannot work are ABSENT, and `RowManageSheet`'s existing subject slot states the reason once, above them** (ADR-0138 §3): `מתעדכנת מהנתונים של הטיול`. No disabled item, no grey, no partition — an automatic task has no destructive verb, so it has no danger group either. **An absence with a reason over it is a behaviour; an absence with none is a bug**, and that sentence is the whole of §B.

Rejected: a disabled menu item. A disabled control promises that something will one day enable it, and nothing will, so the promise is false — ADR-0150 §8 already settled the same point one surface over.

The automatic sheet's **first** action is the same verb the row's tap fires. Deliberate: a tap that does something non-obvious needs a named twin, and that is what a menu is for.

### 6. Both Homes are the SAME card and the SAME row, and neither grows a list

`.checklist` — the bare, unscoped card PlanHome already uses — holding task rows, under an ordinary `.sec-title`. That is the whole of the brief's §D on both surfaces, and the only net-new CSS is a `.tsk-more` overflow row.

**Trip Home carries manual tasks only.** Due today and overdue, capped at **3** with an overflow row into the tasks screen, and absent entirely when nothing is due (ADR-0045's no-empty-shell rule). Measured at **242px** for three rows, against 76px for a single quick-access tile — one section's worth of space, not a second screen's.

The exclusion has a reason worth stating, because the obvious alternative is worse: an automatic task's deadline is the **departure**, and during the trip the departure has passed, so every unmet check would sit in the band permanently overdue and in `--miss` for the rest of the trip.

**Plan Home carries the converged list**, automatic first and manual after, each half in urgency order. The alternative — the screen's own pure-urgency order applied unchanged — puts every undated derivation below every dated manual task, which buries the thing Plan Home exists to answer; it is drawn under a toggle in §5 so the burial is visible rather than argued.

### 7. The convergence DELETES the CTA button, and ADR-0061 §1 survives it

This is the section the render wrote. The first draft carried `.chk-cta` in the trailing slot, copying the shipped checklist row faithfully. At 360px it left the automatic row's title **101.8px** against the manual row's **195px** directly above it, and grew the row from 61px to 94px — the same noun rendered at half the width of its neighbour, which is a worse violation of the brief's §2 than anything §3 was drawn to test.

The cause is the convergence itself. `.chk-row` is a `<div>` with no tap of its own, so it **needs** an explicit button, and it pays for neither a kebab nor a sync column. `ListRow` has a tap, and now has to pay for both. So the button goes:

- **ADR-0061 §1's rule is untouched — the CTA still does the thing.** The row's own tap does it, exactly as every other `ListRow` in the app already behaves. A derived row has nothing to _read_ either: its title and state are printed whole, with no body, no url and no author, so a read-open would be an empty sheet. The tap has nothing better to do than the verb.
- **The reserved sync column goes too**, for a reason from the model rather than from width: until somebody dismisses, assigns or flags it, an automatic task **has no row at all** (brief §4), so there is nothing in flight to badge.

Measured after: title **215px**, row height **61px** — level with the manual row beside it. The rejected variant stays measured off-frame in the mockup's own table, because without the number "the CTA does not fit" is a claim.

### 8. What this ADR does not decide

- **The brief's §C** — an `everyone` task partially complete (phase 6). Cheap to build and it wants drawing first; nothing here forecloses it.
- **The brief's §E** — the hero slot (phase 5). It depends on hosts, and it lands as an amendment to ADR-0160 §3 and §13 rather than slipping past them.
- **The brief's §F** — the mark on a host row (phase 4), including whether a task and a note can mark the same already-full line.
- **The Index tile and the screen's facet axis**, which the brief's §13 settled as product decisions and this session had no reason to reopen.
- **Three things a desktop render cannot settle**, listed in the mockup's last panel: whether a 26px ring reads as pressable under a thumb, whether the control-versus-badge difference reads as "who owns this" without being explained, and the final cap on the Trip Home band.

## Consequences

- **`ListRow` gains one prop (`lead`) and `list-row.css` two rules.** Nothing else about it changes and no other consumer is touched. `ListRowProps.icon` becomes optional, since a manual task row has no badge.
- **`.chk-row`, `.chk-ic`, `.chk-t`, `.chk-m`, `.chk-cta` and `.chk-ppl` retire** when phase 2 lands, replaced by `ListRow` inside the `.checklist` card they already sit in. `.chk-ok` survives as the automatic row's trailing state. This is a deletion, not an addition — and it is the reuse-audit item the brief flagged, arriving one layer up from where it expected it.
- **`.checklist` and `.index .listcard` are the same card under two names.** Noticed here, not fixed here: folding them is a rename across four screens and belongs to whoever next touches the Index, not to this feature. On the backlog.
- **New CSS is small on purpose** — one `ListRow` slot plus `.tsk-tick`, `.tsk-due`, `.tsk-star`, `.tsk-settled`, `.tsk-why` and `.tsk-more`. If it grows much past that during the build, a primitive went unused.
- **A behaviour difference between adjacent rows in one list:** a manual task's tap opens the task, an automatic task's tap opens its host form. Consistent with ADR-0153 §8's "the tap goes where the thing lives", and stated here so the build does not treat it as an inconsistency to iron out.
- **New `he.ts` copy** for the tick's accessible name, the deadline phrasing, the automatic subject line, the Trip Home section title and the overflow row.
- **The brief's §A, §B and §D are closed**; §C, §E and §F stay open as stated hand-offs.

## Alternatives considered

- **A nested `<button>` inside the row's trigger.** Rejected on ADR-0160 §4, reproduced live: the row ends with 4 children instead of 3.
- **`PlaceBadge`'s `role="button"` span inside the trigger.** Rejected (§1): it parses, but a button may not contain a focusable descendant, and a control that swallows the row's tap on every press is affordable only for an occasional verb.
- **The control at the trailing edge beside the kebab.** Rejected (§1) on adjacency and on filing the primary verb with the leftovers — not on width, which measured at a 2px difference.
- **`SettleControl` at a fifth density.** Rejected (§1) on meaning and measured at 82px of lead, 38px off the title, and +18px of row height at 360.
- **`border-radius: 50%` on the hit box.** Rejected (§2) — 83% of the square, with corner taps opening the row instead.
- **Rows identical between manual and automatic.** Rejected (§4), and this is the amendment to the brief's §2: identical means an inert button in the row's most prominent position.
- **A disabled `ערוך`/`מחק` in the automatic menu.** Rejected (§5): a disabled control promises an enabling that will never come.
- **`.chk-cta` on the converged row.** Rejected (§7) on 101.8px of title against 195px, measured, with the variant kept off-frame so the number survives.
- **A reserved sync column on an automatic row.** Rejected (§7): a task with no row has no write to badge.
- **Automatic tasks in the Trip Home band.** Rejected (§6): their deadline is departure, so mid-trip they are permanently overdue.
- **Pure urgency order on Plan Home.** Rejected (§6) and drawn under a toggle: it buries the readiness checks under every dated manual task.
