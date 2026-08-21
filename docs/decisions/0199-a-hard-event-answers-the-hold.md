# 0199 — A hard event answers the hold, and a day row is a gesture rather than a document

**Status:** Accepted (design) — not yet built
**Date:** 2026-08-21
**Design exploration:** [`mockups/a-hard-event-answers-the-hold-v1.html`](../../mockups/a-hard-event-answers-the-hold-v1.html) — the three candidate beats on identical rows, the lock pulse on and off, and the `user-select` value of every row type read live off the page. The amplitude and the duration are controls, and every row on the page takes the real 500 ms hold, because neither number is settleable in a screenshot.
**Builds on:** [0011](0011-hard-soft-event-model.md) (hard = never auto-moved), [0116](0116-day-aware-shelf-and-idea-target-day.md) session-119 + session-124 (one press-and-hold gesture for everything in the builder; `DRAG_HOLD_MS` = the platform's own long-press), [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §7/§9/§Q (the beat family and why a rebuff is not a nudge), [0150](0150-a-form-refuses-at-the-field.md) (a refusal is made where it can be answered, and it is felt on a repeat attempt), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget), [0017](0017-mobile-first-device-targets.md) (no hover-only affordance)
**Amends:** [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 — the time chip is now also the destination a refusal points at, which is a job the chip did not have. [0178](0178-a-day-row-says-what-then-when.md) §4 — the lock the when line carries gains one state (it pulses with the beat); its vocabulary is otherwise untouched.

## Context

Owner report, quoted: _"Plan day soft events are draggable, and the text is non selectable. Hard events are (rightfully so) non draggable, and the text is selectable. I want hard events to stay non draggable but it should do some animation for letting the user know that it's not. And hard events text should be non selectable like soft events. In trip day the text should also be non selectable."_

Two requests that read as separate, and reading the code makes them one.

**The selection is not a gap. It is the app's current answer to the drag.** A soft row gets `dragProps`, and with them three things at once: `user-select: none` (via `screens.css`'s `.bld.draggable`), the `selectstart` cancel in `useHoldToDrag`'s `selection.suppress()` — which is what actually stops the iOS callout, since `user-select` alone does not stop a long press _asking_ to select — and the `contextmenu` prevent. A hard row gets `dragProps: undefined` (`PlanDay.tsx`'s `soft && !ctx.readOnly`), so it gets none of them. What answers a press-and-hold on a hard event today is the platform's text-selection UI.

**And the key on the rule is wrong, not missing.** Both shipped `user-select: none` declarations (`.bld.draggable`, `.wp-maybecard.draggable`) are keyed on _draggable_. What makes selection wrong on a day row is not that the row drags — it is that a press on it is a **gesture**. Keying on `.draggable` is exactly what left the two rows that never drag selecting: a hard `.bld`, and every `.wp-event` in Trip mode, which has no drag in any mode.

Three further facts from the code shape the decision:

- **`BEAT` is the mechanism and it is explicitly open.** `lib/one-shot.ts` owns the remove-reflow-add that makes an animation replay, the token-derived duration and the removal by timer; its own comment says the axis and the meaning are the per-case part and that a beat's keyframes live beside its surface. `frontend/CLAUDE.md` calls the family "four members and counting". So the question is _which_ beat, not whether to build a mechanism.
- **The lock is inside the control that does work.** `PlanDay`'s `hardLock` renders **inside** `button.bld-time` — the day-position picker (ADR-0161 §7), which moves a hard event through `applyGuardedUpdate` and asks first.
- **There is nothing left on these rows worth selecting.** ADR-0174 §8 took the place name and the confirmation code off both day rows ("glyphs only"); a code is read one tap away. The Trip card's expanded body is a row of verb buttons, not prose.

## Decision

### 1. The hold is answered on every row. On a hard one the answer is "anchored", and the finger comes straight back

A hard row takes the same `useHoldToDrag`, in a **refusal** mode. The hold completes at `DRAG_HOLD_MS` (500 ms, unchanged — it is the platform's long-press, ADR-0116 session-124), the beat plays, and **the gesture ends there**: no `selection.lock()`, no armed `touchmove` suppression, no drag state. The page is handed back the instant the answer is given, because there is nothing to carry.

The hook gains one branch at its arm site, not a sibling hook — a `useHoldToRefuse` beside `useHoldToDrag` would be the second one-off root rule 8 exists to prevent. The handler set becomes a union: a drag host passes `onArm`/`onMove`/`onDrop`/`onCancel` as today, a refusing host passes `onRefuse`, and `arm()` takes the refusal path and calls `end()` immediately.

Three things the refusal path keeps from the drag path, each a bug if dropped:

- **`selection.suppress()` at pointer-down** — the reason the hard row stops selecting _during the press_, which `user-select: none` (§4) does not do on its own.
- **`onContextMenu`'s prevent while the hold is live** — otherwise the platform callout opens on top of the beat.
- **`swallowNextClick()`** — a released hold otherwise fires a click and opens the row's read. The user pressed to move the event, not to read it.

**A mouse waits for the hold too, in refusal mode only.** `useHoldToDrag` arms a mouse immediately (a mouse has no scroll/drag ambiguity), and inheriting that here would play the beat on every single click of a hard row — including the tap that opens its read.

### 2. `BEAT.PINNED` — a fifth member, and neither of the two that exist

The row strains on the axis it was being dragged on and is pulled straight back onto its anchor: a rise that is **arrested** and returns _past_ level before settling. Vertical, because day reorder is vertical. `linear`, symmetric, one shot, duration from a token — the family's four properties, unchanged. Keyframes in `screens.css` beside `.bld.draggable`, which is where the file says a beat's keyframes belong.

**Not `NUDGE`.** Its own comment, and `beats.css`'s restatement of it, define that beat as _something is wrong_. Trying to drag a hard event is not an error: ADR-0011 guards a commitment on edit, it does not forbid it, and the event does move — through the time chip. A beat that says "you did something wrong" teaches a false thing about the model.

**Not `REBUFF`.** It means _there is nothing above this to open_, and a hard row has a read, a `⋯` and a time. Its arc is also **completed** (7 px up and back), which is the opposite of the statement here.

Defaults, and they are recommendations rather than answers: **4 px** and **`--t-base` (240 ms)**. The amplitude's ceiling is measured rather than guessed — the row's own `margin-bottom` is 9 px, so 4 px is 44 % of the gap and the row below is never touched.

### 3. The lock pulses with the beat, and that makes the refusal a redirection

The beat says "not this way". What says **why** is already on the row: the lock on the when line (ADR-0178 §4). It pulses with the beat — opacity to 1 and a 1.35 scale, no new hue, nothing added to `HardLock`'s vocabulary but emphasis.

This is not the refusal drawn twice. The lock sits **inside** `button.bld-time`, so the pulse sends the eye to the control that answers exactly what the finger was trying to do. The rule is keyed on the beat class (`.is-pinned .hard-lock`), surface-agnostic exactly as `.is-nudging` and `.is-rebuffing` are, and lives in `ui/when-line.css` beside the glyph — so `when-line.css` never learns who its hosts are.

**No words.** ADR-0150's own reasoning: a refusal is made where it can be answered, and the row carries its reason. Words would also arrive _after_ the gesture and cover the list they were about.

### 4. One `user-select` rule, keyed on the gesture rather than on the drag

One declaration in `styles/tokens.css`, immediately under the `body.wp-dragging` block that already owns the other half of this subject (its comment even names this one: _"The card's own `user-select: none` handles the press itself"_):

```css
.bld,
.wp-event,
.wp-maybecard {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

It **deletes** the two copies in `screens.css` and `maybe-card.css`. A fourth row joins by being added to the list — the one-line shape root rule 8 asks for, and a selector list cannot drift the way three declarations can (ADR-0139's four axes).

Measured on the mockup, at both widths and in both themes: a hard `.bld` goes `auto` → `none`, a `.wp-event` goes `auto` → `none`, and a soft `.bld` reads `none` before and after — that row already worked and loses nothing.

## Consequences

- **`useHoldToDrag`'s handler type becomes a union**, and every existing call site is on the drag arm of it. The three refusal-path keeps in §1 are the test surface: a refusal that forgets `swallowNextClick` opens the read, and that failure is invisible to jsdom, so it belongs in `e2e/`.
- **Trip mode gets no beat.** `EventCard` is not draggable in any mode, so there is no drag attempt to answer; it takes §4 only. If a Trip-mode reorder ever ships, the beat is already surface-agnostic and joins by playing.
- **A shelf `MaybeCard` is unaffected** beyond §4 folding its copy in — it has no hard variant. Folding it in is strictly more correct: a read-only shelf card should not select either.
- **Reduced motion is a correctness case, not a courtesy.** `playBeat` reads its duration through `motionDurationMs`, which answers 0 under reduced motion and when the token is unreadable, so the class is never left on an element whose animation never ran. Under reduced motion the hold is still answered — by the gesture ending and the click being swallowed — it is simply not animated. That is the honest degradation: the refusal is behavioural, the beat is its presentation.
- **A shipped defect the render exposed, and it is not this design's.** The control §3 points at misses ADR-0017's floor: `button.bld-time` renders 27 px tall and its touch target is the `::after` overlay at `inset: -8px 0` — **43 px, one short of 44**. ADR-0161 §7 chose the overlay deliberately (a `min-height: 44px` on the chip took the row from 58 px to 75 px) but never measured what the overlay came to. Widening the inset to `-8.5px` closes it at no cost to the row, since the overlay reaches into padding no other control occupies. Backlogged, not fixed here.

## Alternatives considered

- **Reuse `NUDGE`; add nothing.** Rejected on meaning, not geometry — §2. It is the cheapest option and it is the one that teaches the wrong thing about hard/soft.
- **Reuse `REBUFF`.** Rejected on meaning from the other side, and on the shape of its arc — §2.
- **A toast, or a caption on the row.** Rejected on ADR-0150's reasoning: a refusal belongs where it can be answered, the reason is already on the row, and words arrive after the gesture and cover the list.
- **An amber ring around the row for the beat's duration.** Drawn as a control in the mockup so the rejection is measured. Rejected: the row's border already carries hard-vs-soft (solid against soft's dashed, ADR-0178 §4), so a ring is a second statement about the same fact — the third drawing of `kind` that ADR-0178 removed.
- **`cursor: not-allowed` on hover.** Rejected twice over: a hover-only affordance in a phone-first app (ADR-0017), and it says "broken" rather than "anchored".
- **Let a hard row drag and ask on drop**, the way a drag onto the day strip already asks. Rejected: a reorder drag has no destination to ask about — it is a request for a _position in the list_, which is the definition of what a hard event does not have. The day-strip drag asks because a specific day was aimed at (ADR-0116 session-119). The difference is in the target, not in how firm the event is.
- **A sibling `useHoldToRefuse` hook.** Rejected — root rule 8. It is the same gesture with nothing behind it, and two hooks would drift on the three keeps in §1.
- **Three separate `user-select` declarations, one per component.** Rejected: it is the shape ADR-0139 already paid for once, and it is how the current bug happened — two copies, one key, and the rows nobody thought to add.
