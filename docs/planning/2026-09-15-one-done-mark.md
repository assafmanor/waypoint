# 2026-09-15 — One verb, four affordances: the settled row's undo

**Outcome:** [ADR-0230](../decisions/0230-one-done-mark-and-it-is-the-undo.md) (**Proposed**, drawn and measured, not built) · mockup [`mockups/one-done-mark-and-it-is-the-undo-v1.html`](../../mockups/one-done-mark-and-it-is-the-undo-v1.html) · catalog + backlog + README updated.

## What was asked

The owner, on the deployed ADR-0229 build, against a settled row:

> Do we need the `שחזור` button? I think not. Maybe remove it.

## What counting them found

The report names one button. There are **four** affordances for that one verb, and two of them are the same control written twice:

|                          | where                  | what                           |
| ------------------------ | ---------------------- | ------------------------------ |
| ① `.wp-event-tag-done`   | Trip card, title line  | a plain `<span>` — a **label** |
| ② `.wp-event-check.btn`  | Trip card, face        | `role="button"` → `onRestore`  |
| ③ `EventActions` RESTORE | Trip card, verb band   | a labelled `<button>`          |
| ④ `.bld-settle.done`     | **Plan's** archive row | `role="button"` → `onRestore`  |

② and ④ share an `aria-label`, a `.mark`/`.undo` morph and a `--ok` circle, in two stylesheets at two sizes. `frontend/CLAUDE.md` describes exactly this: _"three hand-rolled settle affordances, which drifted on four axes before `SettleControl` collected them"_ — these two never joined it.

## Why the asked-for deletion is the wrong one

ADR-0043's 2026-07-16 revision is explicit that ③ is **the discoverable twin** of ②, because ②'s morph lives inside `@media (hover: hover) and (pointer: fine)` and `:focus-visible`. A phone tap produces neither. Delete ③ alone and the undo lives behind a green tick that reads as a status label, on a phone-primary app (ADR-0017).

**This is the second time in two days that the answer came from reading an ADR rather than the screen.** The first was ADR-0223's mitigation on the Trip day; this is ADR-0043's twin. The pattern worth keeping: when a control looks redundant, find the decision that put it there before removing it — the redundancy is sometimes the repair for something invisible in a screenshot.

## What is proposed instead

Collapse ①+②+③ into one: **the chip becomes the control.** `היינו ✓` explains itself with no hover, which is precisely what the circle cannot do. The ⁦44px⁩ floor comes from `ValueToken`'s `::after` overlay (ADR-0177) — a rule written for this exact problem, whose own comment records that a `min-height` took a form row from ⁦58px⁩ to ⁦75px⁩.

Measured: the open card ⁦309⁩ → ⁦233px⁩, the closed row ⁦91⁩ → ⁦72px⁩, the tap box ⁦45px⁩, the title line unchanged at ⁦19px⁩. The closed-row saving was not the point and is the nicer half: freeing the face's `check` track lets the chip sit **beside** the title instead of wrapping under it.

## What rendering it found

1. **The chip cannot be a `<button>`.** The face is one, and a nested button makes the parser close the outer and reparent everything after it — badge, title, chip, time and `⋯` each on their own line, and the card **grew ⁦+64px⁩** instead of shrinking. `frontend/CLAUDE.md` names this failure; it is why `.wp-event-check` and `PlaceBadge` are spans with a role. Caught in the first render, invisible in the source.
2. **The overlay's first inset was under the floor** — ⁦41px⁩ against ⁦44px⁩, because this chip renders ⁦17px⁩ where a `ValueToken` is ⁦26px⁩. The number is measured for this element now rather than copied from that one.
3. **The file's own captions were wrong before they were measured.** The numbered pips marking the four affordances were hand-placed and landed ① on the title and ② on the badge. They are positioned from each element's rect now — the same rule the measurement table already obeys, applied to the annotations.

## The forks put to the owner

1. The chip's treatment — as-is (proposed), the word changing on press, or a quiet undo glyph.
2. **Whether Plan's archive row changes with it**, and this is the real scope question: changing the day card alone reopens a two-surface divergence ADR-0044 closed. Either it moves too, or the divergence is declared in ADR-0044 so the next reader finds a reason rather than a difference.

---

## Built the same day — _"Build it"_

Treatment **א** as drawn; the circle, its ~⁦70⁩ lines of CSS and the face's `check` grid track deleted; `EVENT_ACTION.RESTORE` out of `event-actions.ts`, taking with it the last entry `live()` never gated. **Fork 2 answered by declaring the divergence in ADR-0044** rather than moving Plan's row: with ② gone, `.bld-settle.done` is the app's only morphing settle circle — the duplication ADR-0139 exists to prevent is retired by a **deletion** rather than a second rewrite — and that slot carries three states in one square where the chip answers one.

### What the build corrected in the drawing

**The closed row does not shrink.** The drawn ⁦−19px⁩ was published as half the headline and is wrong: measured in the running app, before and after the diff under the same probe, the closed row is ⁦72px⁩ → ⁦72px⁩ with a short title and ⁦115px⁩ → ⁦115px⁩ with one long enough to wrap. The mockup's fixture had a chip wrapping under its title; the app's does not, so there was no line to save. The open card is the whole saving — ⁦313⁩ → ⁦256px⁩, against a drawn ⁦−76px⁩.

**The lesson is narrower than "the mockup was wrong":** a saving drawn against ONE fixture, whose size depends on that fixture's text length, is the kind of number to distrust. The tap box and the title line — which depend on the type scale rather than the content — both reproduced exactly.

### What only the running app could find

**The overlay that reaches ⁦44px⁩ contains the card face's geometric centre**, so a tap aimed at the middle of the card presses the chip rather than opening the row. Not tunable: the title line's centre sits ⁦11px⁩ from the card's on a ⁦69px⁩ face, so any title-line control that meets the floor covers it. Two things followed.

1. The drawn inline inset of ⁦-8px⁩ became `ValueToken`'s own ⁦-2px⁩ — the chip is ⁦42px⁩ wide and already clears the floor on that axis, so the extra ⁦12px⁩ was taken from the card's own toggle for nothing.
2. The condition that actually decides is `frontend/CLAUDE.md`'s — an expanded target may own its neighbourhood and may not cover a neighbouring **control** — and it holds: the badge, the `⋯` and the chevron are at the face's two edges, and the only things under the block reach are read-only marks.

**A mockup cannot find this, structurally**, and that is the part worth keeping: it can measure a target, but not what the target takes, because what it takes from is the app's own behaviour. `frontend/e2e/done-chip-undo.spec.ts` measures both with `elementFromPoint` — the reach walked out from the chip's centre until the document stops answering with it, and each other control on the face asked what is above it. Four specs, ~⁦110⁩ lines, and the ⁦45px⁩ now lives in a test rather than in a sentence nobody re-runs.

### One thing the first e2e run got wrong about itself

`getByRole('button', { name: t.actions.undoDone })` resolved **two** elements on a row with one control: an `aria-label` on a descendant feeds its ancestor's name-from-content, so the face `<button>` answers to `שחזור` too. It did with the ✓ circle as well — nothing regressed — but a count assertion that reads two where one control exists is not measuring what it claims. Counted by the label attribute instead.

## And, on the way: the read no longer closes the card (ADR-0229 §4)

Owner, on the same deployed build: _"when you click on it, it opens the event/booking details. It also closes the event card, and it shouldn't do it."_ §4 shipped the day before with the card closing, to stop documents/tasks/notes rendering twice — one copy per layer. That duplication is **behind the scrim and off one shared state**, i.e. invisible; what it cost is not: you go one level in to read a fact about the row you are looking at, and come back to a collapsed row. `onOpenRead` now opens the sheet and touches nothing else, and §4 is rewritten in place rather than annotated — it was also that ADR's own third fork, left open for the owner, and this answers it.
