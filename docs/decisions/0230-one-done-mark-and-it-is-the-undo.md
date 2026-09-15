# 0230 — One done mark, and it is the undo

**Status:** **PROPOSED** — drawn and measured, not built. Two forks are the owner's and are named at the foot.
**Date:** 2026-09-15
**Session note:** [`planning/2026-09-15-one-done-mark.md`](../planning/2026-09-15-one-done-mark.md)
**Mockup:** [`mockups/one-done-mark-and-it-is-the-undo-v1.html`](../../mockups/one-done-mark-and-it-is-the-undo-v1.html)

**Amends in place (if accepted):** [0043](0043-day-view-now-line-phases-and-archive-chrome.md)'s 2026-07-16 revision — _"`שחזר` remains in the expanded strip as the discoverable twin"_ — which this replaces rather than deletes: the discoverable twin becomes the mark itself.
**Relates:** [0044](0044-settling-a-finished-trip.md) (Plan's archive row, which carries the second copy of the same control — §4), [0139](0139-settling-an-event-from-the-map.md) (the ADR that collected three hand-rolled settle affordances; this is the fourth and fifth), [0177](0177-a-when-reads-as-a-sentence.md) (`ValueToken`'s `::after` overlay, reused for the touch floor), [0017](0017-mobile-first-device-targets.md) (the 44px floor, and "no hover-only affordances"), [0228](0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) (the verb band this empties on a settled row)

## Context

The owner, on the deployed ADR-0229 build, against a settled row:

> Do we need the `שחזור` button? I think not. Maybe remove it.

**Counting them is what changes the question.** One verb — restore a settled event to `planned` — is spelled four ways:

|                          | where                     | what it is                                    |
| ------------------------ | ------------------------- | --------------------------------------------- |
| ① `.wp-event-tag-done`   | Trip day card, title line | a plain `<span>`. **A label, not a control.** |
| ② `.wp-event-check.btn`  | Trip day card, face       | `role="button"` → `onRestore`                 |
| ③ `EventActions` RESTORE | Trip day card, verb band  | a labelled `<button>`                         |
| ④ `.bld-settle.done`     | **Plan's** archive row    | `role="button"` → `onRestore`                 |

**② and ④ are the same control written twice** — the same `aria-label` (`ביטול הסימון · שחזור`), the same `.mark`/`.undo` two-span morph, the same `--ok` circle, in two stylesheets at two sizes (⁦22px⁩ / ⁦32px⁩). That is ADR-0139's own shape recurring: it collected three hand-rolled settle affordances into `SettleControl` precisely so this vocabulary could not drift, and these two sit outside it.

**And the obvious deletion is the wrong one.** ADR-0043's 2026-07-16 revision keeps ③ deliberately, as _"the discoverable twin"_ of ②, because ②'s morph lives inside `@media (hover: hover) and (pointer: fine)` and `:focus-visible` — **neither of which a phone tap produces.** Delete ③ alone and undo is reachable only through a green tick whose meaning is invisible on the device the app is built for (ADR-0017: phone-primary, no hover-only affordances). The remaining hint is a ⁦1.5px⁩ ring at 35% alpha.

## Decision

### 1. The rule

**A settled row carries one done mark, and that mark is also how you undo.**

The chip already carries the word. `היינו ✓` explains itself with no hover, which is the one thing the circle cannot do — so **the chip becomes the control, and ② and ③ both go.**

### 2. What it costs, and what it gives back

The chip stops being a `<span>` and becomes a `role="button"` span — **not a `<button>`**, because the card's face is itself a `<button>` and a nested one is invalid HTML (see "What rendering it found"). Everything visual is inherited; what is added is a press step (`--press-scale`, ADR-0140) and a target.

**The touch floor is met without growing the line**, by `ValueToken`'s own `::after` overlay (ADR-0177) — a rule written for exactly this problem, whose comment records that `min-height: 44px` took a form row from ⁦58px⁩ to ⁦75px⁩. The overlay costs 0.

**Measured** (360×640 and 390×844, both themes, off the rendered DOM):

|                    | today   | proposed                                 |
| ------------------ | ------- | ---------------------------------------- |
| the open card      | ⁦309px⁩ | **⁦233px⁩** (⁦−76px⁩)                    |
| the closed row     | ⁦91px⁩  | **⁦72px⁩** (⁦−19px⁩)                     |
| the chip's tap box | —       | **⁦45px⁩** (floor ⁦44px⁩)                |
| the chip itself    | ⁦17px⁩  | ⁦17px⁩                                   |
| the title line     | ⁦19px⁩  | ⁦19px⁩ — the chip does not push the name |

The closed row shrinks too, which was not the point and is the nicer half: freeing the face's `check` track lets the chip sit **beside** the title instead of wrapping under it.

### 3. What the chip says when it is a control — the one feel call

Three treatments drawn, and **א is proposed**: leave the words alone. `היינו` already says what happened; what was missing is that you can touch it.

- **א · as-is** — `היינו ✓`, and what makes it tappable is its size and position.
- **ב · the word changes on press** — `ביטול` on `:active` only. Never a hover rule: on a touch device that is a latched state (ADR-0195 §4).
- **ג · a quiet undo glyph beside the check** — always visible, and it costs the chip its width.

### 4. The cross-surface cost, which is a decision and not a detail

ADR-0044 chose the same circle-that-morphs for **Plan's archive row** (④). Changing the Trip card alone opens a gap between two surfaces that today agree — the exact drift ADR-0139 is a retraction of. Two exits, and the owner picks:

- **Apply it to the archive row too** — one vocabulary, one change, more diff.
- **Diverge deliberately** — the day card is a surface that _opens_ and has room for a word; the archive row is a narrow row that does not. Then say so in ADR-0044, so the next reader finds the reason rather than the difference.

## What rendering it found

**The chip cannot be a `<button>`, and the first render proved it in the loudest possible way.** The face is a `<button>`; a nested one is invalid HTML, so the parser **closes the outer button and reparents everything after it** — badge, title, chip, time and `⋯` each collapsed onto their own line, and the card grew ⁦+64px⁩ instead of shrinking. `frontend/CLAUDE.md` names this failure and it is why `.wp-event-check` and `PlaceBadge` are spans with a role. A `role="button"` span costs one `tabIndex` and a key handler.

**The overlay's first number was under the floor.** `-12px` reached ⁦41px⁩ against a ⁦44px⁩ floor, because this chip renders ⁦17px⁩ where a `ValueToken` is ⁦26px⁩ — so the inset is measured for this element rather than copied from that one. ⁦14 + 17 + 14 = 45⁩.

**And the file's own captions were wrong before they were measured.** The numbered pips marking the four affordances were hand-placed and landed ① on the title and ② on the badge; they are positioned from each element's own rect now. A caption pointing at the wrong control is worse than no caption — and it is the same "measure, don't estimate" the table obeys.

## Consequences

- `EventCard`'s `tag` becomes a control on the done arm only; the `check` grid track loses its only occupant on that arm; `EVENT_ACTION.RESTORE` leaves `event-actions.ts`, and with it the last entry that was not gated on `live()`.
- **A settled row's verb band becomes empty and does not render** — which is ADR-0228's amendment applying itself: a band holding one item was the shape it deleted for the `⋯`.
- ADR-0043's revision is amended, not contradicted: the discoverable twin survives as the mark.
- Restore stays reachable on a past day and on a finished trip (ADR-0043 §4 / ADR-0044), because the chip renders wherever the done state does — it is the record.

## The forks for the owner

1. **The chip's treatment** — א / ב / ג, shipped in the mockup as **א**.
2. **Whether Plan's archive row changes with it** (§4), or the divergence is declared.

## Rejected

- **Removing `שחזור` alone**, which is what was asked. It saves ⁦19px⁩ less than the proposal and leaves undo behind a control whose meaning is invisible on a phone — the thing ADR-0043's revision wrote the twin to prevent. Drawn in §5 so the difference is visible: it is not pixels, it is whether a word remains on the control.
- **Keeping all four.** The status quo: four affordances for one verb, two of them the same control twice, on the surface whose whole claim is that it is glanceable.
- **`min-height: 44px` on the chip.** The obvious fix, and it grows the title line — the number is already recorded in `value-token.css`, which is why the overlay is the rule.
- **Making the circle a permanent undo arrow.** The ✓ is the _record_: ADR-0044 treats `done` as a positive state, not a mark waiting to be cleared. Somebody who settled a row wants to see that it is settled.
