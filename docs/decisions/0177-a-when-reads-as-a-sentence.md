# 0177 — A "when" reads as a **sentence**, not a grid of boxes

**Status:** Accepted (2026-08-09) — **built** the same day; see the build log at the foot for the two places the build diverged from the drawing, and why
**Date:** 2026-08-09
**Session note:** [`planning/2026-08-09-session-235-a-when-reads-as-a-sentence.md`](../planning/2026-08-09-session-235-a-when-reads-as-a-sentence.md)
**Mockup:** [`mockups/when-field-drawing-v1.html`](../../mockups/when-field-drawing-v1.html)

**Extends:** [0083](0083-whenfield-datetime-standard.md) — which stands. It standardised _which primitive_ collects a when; this standardises _how one is drawn_, which it never said.
**Relates:** [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 (`button.bld-time` — the token this generalises, and the touch-target trick it already solved), [0176](0176-a-date-reads-day-first-wherever-you-open-it.md) (the `DateField` this keeps, and whose absolute input is what makes an inline token possible), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget this finally spends correctly), [0017](0017-mobile-first-device-targets.md) (the 44px floor), [0150](0150-a-form-refuses-at-the-field.md) (the refusal now lands on the value, not on a box holding two), [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §3 (`RouteField`'s "never a cramped inline row", one level up), [0096](0096-per-domain-claude-md-guides.md) (rule 8 — a one-off generalised rather than copied)

## Context

Owner report, with three screenshots — the event form, the booking form and trip settings: _"The date and time in forms is all over the place, it's unaligned and is looking really bad… not limited to them. Lets mockup a standard for this."_ Then a second report against the same screenshots: the `מ־` / `עד` captions in trip settings **overflow and overlap**.

Reading the code first found that the reported surfaces are not the problem's edges. `DateField` is **one** component and four hosts paint it four different ways — `.field .df` (mono 13.5px, centred, 1.5px border, radius 13), `.set-fld .df` (body 14px, start, `--soft-line`, radius 10), `.wf-date` (body, `--line`, radius 12), `.tp-val.wf-date-val` (mono 19px, no border of its own) — and the fifth chrome is the time beside it, `.tp-val` mono 19px against `.tp-dur .tp-val` body 15px. Nobody chose five; each host chose one, four times, in four sessions. §1 of the mockup measures all five off their own rendered boxes.

Two shipped defects surfaced on the way, both invisible to the test suite and to reading either file alone:

- **`App.css`'s `.field .df` mono rule is dead.** It asks for the creation form's two dates in mono 13.5px and comments the intent. `field.css`'s `.field .df` is bundled into a **lazy chunk**, injected after the entry css, and its `font: inherit` shorthand resets the family as well as the size — the boxes render Assistant 14.5px. Only `text-align: center` survives, because `field.css` happens not to set that one property. The cascade here is decided by **chunk load order**, which is not readable from the import graph: reasoning from ES-module evaluation order gives the opposite (and wrong) answer, and the first pass of the mockup was built on it. Verified against a real `dist/`.
- **`.wf-date-cell { flex: 1.3 }` is a workaround, not a weighting.** At the shipped `.tp-val` size of 19px, a ten-character date **does not fit** half a row at 360px — measured at −0.8px. The 1.3 buys the overflow back. It is live (that chunk also loads after the entry css, so it does beat `.tp-field { flex: 1 }`).

And the second report, measured: nothing is "squeezed". `.set-fld .df` is `width: 100%`, so caption + gap + box is **21px wider than its grid track**; `.subfld` simply overflows the card and `עד` is clipped to `ד` against the edge. The row is bigger than the space it was given.

## Decision

### 1. The defect is the shape, and alignment is its symptom

"September 11th, 15:00, for one night" is **one fact**, said in one breath. The booking form renders it as six bordered boxes, each with its own 11px caption, each competing for the same attention. There is no primary. Nothing is being said; four things are being collected.

That is why the first attempt at this ADR failed and is kept in the mockup as §6, drawn and measured: it regularised the boxes (one cap position, one line box, equal grid tracks), improved every number, and left the screen looking like a database row. **Tidying is not designing.** The reason to change the shape rather than the metrics is structural: four boxes can be misaligned; one sentence cannot.

So a when is drawn as **a line of prose whose values are tappable**. The panels behind them do not change at all — the same `TimeField` list, the same native `<input type="date">`, the same auto-close, the same bounds. What changes is that the form stops drawing a box around every atom.

### 2. The token is a generalisation, not a new mechanism

[ADR-0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 already built this and wrote the grammar down: _"a hairline chip, which is `.tp-field`'s grammar (the app's existing 'a time you can change') at its faintest: no hue is spent"_. It also already solved the hard part — `button.bld-time::after { inset: -8px 0 }`, because a real `min-height: 44px` took that row from 58px to 75px. **The target grows, the row does not.**

That is a one-off with one call site today. What the primitive takes from it is the **grammar and the target trick**, both cited in `value-token.css` so the debt is visible from the code. Measured in the built app: the token's touch target is 45.8px on a line only 31.8px tall — the floor met without a single block growing.

**What the build did NOT do, deliberately: convert `button.bld-time` itself.** Rule 8 also says that if generalising a one-off means a substantial refactor rather than a small extraction, ask rather than take it on silently. Lining the two up, they share the vocabulary and almost no values: the Plan row's chip is 12.5px against the form's inherited body size, `4px 7px` against `4px 8px`, carries a `margin-inline-end: -3px` for its row, spends **plan violet** on hover and focus where the form spends amber, holds composite two-line content (a time range, a duration, a `ZoneShiftPill`), and has an `empty` variant in `--plan-deep` with an icon. Sharing a component would mean the primitive growing an option for each of those, or Plan mode overriding nearly all of it — either way buying little and risking a mode-wide regression for no user-visible gain. Left as a follow-up on the backlog, with the grammar's origin recorded in both files so the next person sees one lineage rather than two inventions.

`RouteField` supplies the layout rule one level up, already in writing (`route-field.css`): _"The two pickers, stacked — phone-first, never a cramped inline row."_ The span's legs are already stacked correctly; the error was splitting each leg into two boxes again below that. One subject per row, and the leg label is a real grid column so both sentences start on one line without anything aligning them.

### 3. Amber finally means something

The colour budget (ADR-0028) gives amber to time and commitment. Today the event form spends it on two of its three values, so it marks nothing. Under this decision **only the clock is amber**; a calendar date is a calendar fact and stays ink. That is already the call the span leg makes today — it deliberately overrides the `--amber-deep` it inherits from `.tp-val` — so this promotes an existing exception to the rule.

### 4. A date reads by name

The token renders `formatDayDate` (`יום ו׳, 11 בספט׳`) rather than `formatDayMonthYear` (`11.09.2026`). This is **not** a departure from ADR-0176: that ADR fought for day-first ordering so `08/09` could not be read backwards, and a named month cannot be read backwards at all. Same goal, held harder. The numeric form stays available and is a control in the mockup, because trip settings wants the year and a form inside a trip does not.

The native `<input type="date">` remains the real control underneath, exactly as ADR-0176 built it — and the reason a token can be exactly as wide as its text is that ADR-0176 made the input `position: absolute`, so it contributes **no intrinsic width**. A native date's ~110px minimum would otherwise have set the floor for every date token in the app.

### 5. What the host stylesheets lose

The cell chrome goes: `.wf-date`, `.wf-date-cell`, `.wf-date-val`, `.set-fld .subfld`, `.tp-field`'s cap/value box for every date and time, `.tp-dur`'s second type ramp, and `App.css`'s dead `.field .df` mono rule. **These are deleted, not overridden** — a token is not a field box, so there is nothing left for them to paint. The mockup carries neutralising overrides only because it renders before and after side by side with the shipped rules live on both; they are marked "do not port".

### 6. The two calls, settled

Both were left as controls in the mockup rather than decided from a desktop screenshot, and the owner accepted the recommended defaults on 2026-08-09:

- **The token's affordance is the hairline chip** — ADR-0161 §7's shipped answer, unchanged. Underline and tint stay in the mockup as the rejected settings; a future session that wants to revisit has them drawn.
- **A date reads by name** (`formatDayDate`), with the **numeric form (`formatDayMonthYear`) kept for trip settings and trip creation**, where the year is load-bearing and the trip cannot supply it. Inside a trip the year is implied, so the named form carries it.

Both remain controls in `when-field-drawing-v1.html`, which is now the record of what was rejected rather than an open question. A real-device pass on the built screens is still worth doing — it just no longer blocks the build.

## Alternatives considered

- **Regularise the boxes** (the first draft; drawn as the mockup's §6 so it could be rejected on evidence rather than described). One cap position, one fixed line box, equal grid tracks. It genuinely fixes the alignment (ink spread 3px → 0px) and the overflow, and it costs height: 207.9px against the sentence's 144.5px for the same event. Rejected because it answers "unaligned" literally and leaves the screen collecting four fields to state one fact.
- **A token with no visual affordance** — bold text that happens to open a panel. Cleanest in a static screenshot, and the trap: `PlaceBadge` already established in this codebase that a tappable thing inside a row has to look tappable. Hence a hairline default and a control for the loudness.
- **One font for every value.** The obvious answer to "unaligned" is mono everywhere. JetBrains Mono has no Hebrew, so `שעה` and `לילה אחד` fall to a fallback with different metrics and the baseline breaks exactly where it was being fixed. On one line the question does not arise.
- **A custom date panel** (rejected once in ADR-0083, again in ADR-0176 §Alternatives). Still rejected and this stays clear of it: the native calendar is better for a far-off date and is untouched.

## Consequences

Measured off the mockup's own DOM at 360px, light and dark:

- The event's when block: **223px → 144.5px**. The booking span's: **289px → 181.5px**.
- Ink spread within one subject: **3px → 0px** — by construction, not by tuning.
- The settings row's overflow past the card: **21px → 0px**, with 50px of slack.
- Micro-captions on the booking form: **6 → 2**. Amber objects on the event form: **2 → 1**.
- Touch target 45.8px on a 31.8px line, so the floor is met without inflating any form.
- The five chromes become one token, which is what stops the sixth from being written.

Two follow-ups belong to the fix, not to the standard, and are on the backlog separately: App.css's dead mono rule, and `.wf-date-cell`'s `flex: 1.3` workaround.

## Build log (2026-08-09)

Built the same day it was accepted. Two divergences from the drawing, both found by rendering rather than by reading:

- **The leg label sits ABOVE its sentence, not beside it.** The mockup drew a label column, which is the only way two legs' sentences share a starting edge — but one grid spanning both legs can only reach across the per-leg `Field` shells via `display: contents`, and that erases the very box ADR-0150's nudge animates and scrolls to. Above costs about 7px a leg and makes the alignment exact by construction instead of by a shared track, so the refusal machinery stays whole. The trade is recorded in `WhenField.tsx` at the point of the decision.
- **The date token stretched to full width the first time it rendered.** `App.css`'s `.field input, .field .df { width: 100% }` is correct for the box a token stops being, so every span leg wrapped and the booking form measured _taller_ than the boxes it replaces. That rule is now deleted with the rest of §5's chrome, and `value-token.css` states `inline-size: auto` anyway — a stretched token is invisible in review and obvious only once drawn.

Measured off the built components at 360px, against the mockup's predictions:

|                                 | before | mockup        | built                |
| ------------------------------- | ------ | ------------- | -------------------- |
| event when-block                | 223px  | 144.5px       | **154.5px**          |
| booking span when-block         | 289px  | 181.5px       | **188.5px**          |
| settings row past the card edge | 21px   | 0px           | **0px** (31px slack) |
| touch target / line height      | —      | 45.8 / 31.8px | **45.8 / 31.8px**    |
| amber objects, event form       | 2      | 1             | **1**                |

The two height figures land ~7–10px above the drawing, which is the label-above trade plus the `Field` label the mockup's after-frame did not carry. Reported as measured rather than re-quoting the mockup.

## Amendment — three defects found after merge (2026-08-09)

Owner report against the shipped build, with a screenshot: _"ללא שעה is very ugly and bad color choice! Looks like a bug"_ and _"The date fields are not editable! We can't change them"_, then _"why is the line between the date and the time so high?"_. All three were mine, and each is worth keeping because none was reachable by reading the diff.

- **The date was untappable, everywhere.** The token's touch target is an `::after` overlay — ADR-0161 §7's trick for meeting the 44px floor without growing the line. A pseudo-element is painted after its siblings and takes pointer events, which is harmless over a `<button>` (the button under it handles the press anyway) and **fatal over a date**, whose real control is the native `<input>` inside the token. The overlay swallowed every tap. So a date now drops the pseudo-element and reaches the same 44px by growing **the input itself**: same target, and it is the control rather than a decoration sitting on one. Written `.df.vt-date .df-input`, one class heavier than `date-field.css`'s `.df .df-input { inset: 0 }`, because both sheets are lazy chunks and neither's order is knowable from the source.

  **Why no test caught it:** jsdom cannot hit-test, and every e2e spec that touches a date uses `.fill()`, which sets the value programmatically. The new `e2e/when-field.spec.ts` **clicks**.

- **"ללא שעה" rendered as a browser-default button** — a light box in a dark form. A regex deleting §5's retired chrome matched `.tp-val {` **inside** `.tp-dur .tp-val {`, leaving `.tp-dur ` glued to the next selector; `.tp-clear`'s rule became `.tp-dur .tp-clear`, which matches nothing. The lesson is not "be careful with regex" but that **a class name in the markup is not evidence that a rule applies to it** — the spec now asserts the computed style, not the class.

- **The day sat 30px from the clock.** `.wf` spaces its lines with `gap`, and each `Field` shell also carries App.css's `margin-top: 18px`; the two stacked. That read as separation between two labelled groups while each half had a caption, and as one subject falling apart once the captions were gone — the spacing was carrying meaning it no longer had. `.wf > .field + .field` drops the second owner, leaving 12px; the first child keeps its margin, which is what separates the whole block from the field above it.

The through-line: all three are **cascade or hit-testing facts, invisible to the type system and to the unit suite**, on a change whose whole point was deleting shared chrome. A sweep that deletes CSS needs a browser in the loop, not just a green test run.
