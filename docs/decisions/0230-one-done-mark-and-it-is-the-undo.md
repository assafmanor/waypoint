# 0230 — One done mark, and it is the undo

**Status:** **ACCEPTED AND BUILT** (2026-09-15) — owner: _"Build it"_. Both forks are resolved at the foot; the measurements below are the drawn ones, corrected against the running app where they differed.
**Date:** 2026-09-15
**Session note:** [`planning/2026-09-15-one-done-mark.md`](../planning/2026-09-15-one-done-mark.md)
**Mockup:** [`mockups/one-done-mark-and-it-is-the-undo-v1.html`](../../mockups/one-done-mark-and-it-is-the-undo-v1.html)

**Amends in place:** [0043](0043-day-view-now-line-phases-and-archive-chrome.md)'s 2026-07-16 revision — _"`שחזר` remains in the expanded strip as the discoverable twin"_ — which this replaces rather than deletes: the discoverable twin becomes the mark itself.
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

**Measured.** The mockup's column is the drawn fixture (360×640 and 390×844, both themes, off its rendered DOM); the app's is a settled soft row at 390 in Chromium, read from the running app before and after the change rather than restated (`e2e/done-chip-undo.spec.ts`, with the before-figures taken by stashing the diff under the same probe).

|                    | drawn           | **measured in the app** |
| ------------------ | --------------- | ----------------------- |
| the open card      | ⁦309⁩ → ⁦233px⁩ | **⁦313⁩ → ⁦256px⁩**     |
| the closed row     | ⁦91⁩ → ⁦72px⁩   | **⁦72⁩ → ⁦72px⁩**       |
| the chip's tap box | ⁦45px⁩          | **⁦45px⁩**              |
| the title line     | ⁦19px⁩          | **⁦19px⁩**              |

**The closed row does not shrink, and the drawn table said it would.** Corrected here rather than left as the headline it was published as: the ⁦−19px⁩ belonged to the mockup's own fixture, whose chip wrapped under the title. In the app the closed row measures ⁦72px⁩ before and after with a short title, and ⁦115px⁩ before and after with a title long enough to wrap. Freeing the `check` track hands the title ⁦34px⁩ of width back (the circle's ⁦22px⁩ and its ⁦12px⁩ gutter) — real, and worth having — but nothing in the app's type scale was spending a LINE on that chip, so there was no line to save. The open card's ⁦−57px⁩ is the whole of what this buys in height.

### 3. What the chip says when it is a control — the one feel call

Three treatments drawn, and **א ships**: leave the words alone. `היינו` already says what happened; what was missing is that you can touch it.

- **א · as-is** — `היינו ✓`, and what makes it tappable is its size and position.
- **ב · the word changes on press** — `ביטול` on `:active` only. Never a hover rule: on a touch device that is a latched state (ADR-0195 §4).
- **ג · a quiet undo glyph beside the check** — always visible, and it costs the chip its width.

### 4. The cross-surface cost, which is a decision and not a detail

ADR-0044 chose the same circle-that-morphs for **Plan's archive row** (④). Changing the Trip card alone opens a gap between two surfaces that today agree — the exact drift ADR-0139 is a retraction of. Two exits, and the owner picks:

- **Apply it to the archive row too** — one vocabulary, one change, more diff.
- **Diverge deliberately** — the day card is a surface that _opens_ and has room for a word; the archive row is a narrow row that does not. Then say so in ADR-0044, so the next reader finds the reason rather than the difference.

## What building it found

**The drawn tap box was right; what it costs was not drawn at all.** ⁦45px⁩ reproduces exactly — but the overlay reaching that number **contains the face's own geometric centre**, so a tap aimed at the middle of the card presses the chip. It is not avoidable by tuning: the title line's centre sits ⁦11px⁩ from the card's on a ⁦69px⁩ face, so _any_ title-line control that reaches ⁦44px⁩ covers it. What IS avoidable is spending more than the floor needs — the drawn inline inset of ⁦-8px⁩ became `ValueToken`'s own ⁦-2px⁩, since the chip is ⁦42px⁩ wide and already clears the floor on that axis, so the extra was ⁦12px⁩ of the card's toggle taken for nothing.

The condition that decides is the one `frontend/CLAUDE.md` states — an expanded target may own its own neighbourhood and may **not** cover a neighbouring control — and it holds: the badge, the `⋯` and the chevron all sit at the face's two edges, and the only things under the block reach are the meta line's read-only marks. Both halves are asserted by asking the document what is under each control (`e2e/done-chip-undo.spec.ts`).

**And only an e2e spec could find it**, which is the reusable part: the mockup measured the target and structurally could not measure what the target takes, because what it takes from is the app's own toggle. Ten lines of `elementFromPoint` answered both, and the same file carries the ⁦45px⁩ so the number stops being a constant nobody re-measures.

## What rendering it found

**The chip cannot be a `<button>`, and the first render proved it in the loudest possible way.** The face is a `<button>`; a nested one is invalid HTML, so the parser **closes the outer button and reparents everything after it** — badge, title, chip, time and `⋯` each collapsed onto their own line, and the card grew ⁦+64px⁩ instead of shrinking. `frontend/CLAUDE.md` names this failure and it is why `.wp-event-check` and `PlaceBadge` are spans with a role. A `role="button"` span costs one `tabIndex` and a key handler.

**The overlay's first number was under the floor.** `-12px` reached ⁦41px⁩ against a ⁦44px⁩ floor, because this chip renders ⁦17px⁩ where a `ValueToken` is ⁦26px⁩ — so the inset is measured for this element rather than copied from that one. ⁦14 + 17 + 14 = 45⁩.

**And the file's own captions were wrong before they were measured.** The numbered pips marking the four affordances were hand-placed and landed ① on the title and ② on the badge; they are positioned from each element's own rect now. A caption pointing at the wrong control is worse than no caption — and it is the same "measure, don't estimate" the table obeys.

## Consequences

- `EventCard`'s `tag` is a control on the done arm **when a host wires `onRestore`**, and the plain label it always was otherwise; the `check` grid track and `.wp-event-check`'s ~⁦70⁩ lines of CSS are deleted rather than emptied; `EVENT_ACTION.RESTORE` leaves `event-actions.ts`, and with it the last entry that was not gated on `live()` — so every verb that band can hold is now a verb about today, exactly.
- **A settled row's verb band becomes empty and does not render** — which is ADR-0228's amendment applying itself: a band holding one item was the shape it deleted for the `⋯`.
- ADR-0043's revision is amended, not contradicted: the discoverable twin survives as the mark.
- Restore stays reachable on a past day and on a finished trip (ADR-0043 §4 / ADR-0044), because the chip renders wherever the done state does — it is the record.

## The forks, resolved

1. **The chip's treatment — א**, as drawn. `היינו` already says what happened.
2. **Plan's archive row does not change; §4's second exit is taken** — and the divergence is declared in [ADR-0044](0044-settling-a-finished-trip.md) rather than left as a difference. What makes that the cheap answer rather than the lazy one is what removing ② does to the count: with the Trip card's circle gone, `.bld-settle.done` is the app's **only** morphing settle circle, so there is no second copy left to drift and ADR-0139's shape is retired by a deletion rather than by a second rewrite. And Plan's slot is not this control: it holds **three** states in one square — done ✓, skipped ↩, and an unresolved ○ that opens a chooser — and only the first two have a chip beside them to promote. Collapsing that slot is a second decision, undrawn and unmeasured, not this one's tail.

## Rejected

- **Removing `שחזור` alone**, which is what was asked. It saves ⁦19px⁩ less than the proposal and leaves undo behind a control whose meaning is invisible on a phone — the thing ADR-0043's revision wrote the twin to prevent. Drawn in §5 so the difference is visible: it is not pixels, it is whether a word remains on the control.
- **Keeping all four.** The status quo: four affordances for one verb, two of them the same control twice, on the surface whose whole claim is that it is glanceable.
- **`min-height: 44px` on the chip.** The obvious fix, and it grows the title line — the number is already recorded in `value-token.css`, which is why the overlay is the rule.
- **Making the circle a permanent undo arrow.** The ✓ is the _record_: ADR-0044 treats `done` as a positive state, not a mark waiting to be cleared. Somebody who settled a row wants to see that it is settled.
