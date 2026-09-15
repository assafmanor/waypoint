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
