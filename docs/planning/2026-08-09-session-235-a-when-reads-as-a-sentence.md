# Session 235 — a "when" reads as a sentence

**Date:** 2026-08-09
**Outcome:** [ADR-0177](../decisions/0177-a-when-reads-as-a-sentence.md) **Accepted and built** (PR #540 shipped the design; the build followed on a fresh branch off it), with [`mockups/when-field-drawing-v1.html`](../../mockups/when-field-drawing-v1.html) drawn, rendered and measured. [ADR-0083](../decisions/0083-whenfield-datetime-standard.md) stands and is extended, not replaced. Two shipped defects found and logged to the backlog.
**Branch:** `claude/date-time-form-standard-jzqxjd`.

## What the owner reported

Three screenshots — the event form, the booking form, trip settings:

> "The date and time in forms is all over the place, it's unaligned and is looking really bad. See example screenshots from event creation form, booking form, and trip settings, but not limited to them. Lets mockup a standard for this."

And, against the same screenshots:

> "the overflowing/overlapping מ and ל in the trip settings"

## The fork the owner settled, and it is the whole session

The first draft of the mockup answered the report literally: keep the four bordered boxes, give them one cap position, one fixed value line, equal grid tracks. Every measured number improved — ink asymmetry 4px → 0px, the settings overflow 21px → 0px, no growth in height.

The owner rejected it:

> "Don't stick to amateur design. You're a ux ui expert and your suggestions are subpar. Try again"

That was correct, and the reason is worth keeping. **A when is one fact drawn as four controls.** "September 11th, 15:00, for one night" is a single statement a person says in one breath, and the booking form renders it as six bordered boxes each carrying its own 11px caption. Regularising them makes a tidier database row; it does not make the form say anything. The structural point that follows: _four boxes can be misaligned, one sentence cannot_ — so the alignment complaint is a symptom, and fixing the symptom is what the first draft did.

The redraw keeps every panel and every bound (the `TimeField` list, the native `<input type="date">`, the auto-close, the trip-range floors) and changes only that the form stops drawing a box around each atom. The rejected draft is **kept in the file as §6**, drawn and measured beside the proposal, because an alternative nobody drew is an alternative nobody rejected. It costs 207.9px against the sentence's 144.5px for the same event.

## What reading the code changed

- **The token already exists as a one-off.** [ADR-0161](../decisions/0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 turned the Plan builder's row time into a button and wrote the grammar down — _"a hairline chip, which is `.tp-field`'s grammar (the app's existing 'a time you can change') at its faintest: no hue is spent"_ — and solved the hard part, `::after { inset: -8px 0 }`, because a real `min-height: 44px` took that row from 58px to 75px. Rule 8 says generalise that, not draw a second one beside it.
- **The app already rejected cramped rows, in writing.** `route-field.css`: _"The two pickers, stacked — phone-first, never a cramped inline row."_ The span's legs are stacked correctly already; the error is that each leg is split into two boxes one level down.
- **ADR-0176 is what makes an inline token possible at all.** Its native input is `position: absolute`, so it contributes no intrinsic width — otherwise a native date's ~110px minimum would set the floor for every date token in the app.
- **One atom, five chromes.** `DateField` is one component painted four ways by four hosts, and the time beside it is a fifth. §1 of the mockup measures all five off their own rendered boxes rather than asserting them.

## Two shipped defects the render found

Neither is reachable by reading a single file, and no unit test can see either.

| What                                           | Why it is invisible                                                                                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App.css`'s `.field .df` mono rule never lands | `field.css`'s `.field .df` is in a **lazy chunk**, injected after the entry css, and its `font: inherit` shorthand resets the family too. The creation form's dates render Assistant 14.5px; only `text-align: center` survives, by accident. |
| `.wf-date-cell { flex: 1.3 }` is a workaround  | At the shipped 19px, a ten-character date does not fit half a row at 360px — measured −0.8px. The 1.3 buys the overflow back; it reads as a design weighting.                                                                                 |

**And the cascade lesson behind the first one.** The order these sheets apply in is decided by **chunk load order**, not by the import graph. Reasoning from ES-module evaluation order (component imports at `App.tsx` lines 1–93 run before the CSS imports at 94+) gives the _opposite_ answer, and the mockup's manifest was briefly built on it. What settles it is a real `pnpm --filter @waypoint/frontend build`: `index.html` links six sheets with `index-*.css` last, and `field.css` / `date-field.css` / `when-field.css` are not entry-linked at all. Verify against `dist/`, never by reading imports.

## The owner's second report, measured

Nothing is squeezed and nothing is clipped by a shrink. `.set-fld .df` is `width: 100%`, so **caption + gap + box is 21px wider than its grid track** — `.subfld` overflows the card and `עד` lands past the edge as `ד`. Both date boxes come out the same width (144px / 144px); the row is simply bigger than the space. Under the proposal `מ־` and `עד` become words in a flowing sentence, which cannot overflow an edge: measured 21px → 0px with 50px of slack.

Two earlier metrics in the table measured the wrong thing before this one landed — first "are the boxes unequal" (they are not), then "is the caption crushed" (it is not, it sits at its natural 12px/14px). Both were wrong in the mockup's favour, which is the direction that matters.

## Measured, off the mockup's own DOM at 360px

|                                 | today | proposed                    |
| ------------------------------- | ----- | --------------------------- |
| event when-block                | 223px | **144.5px**                 |
| booking span when-block         | 289px | **181.5px**                 |
| ink spread within one subject   | 3px   | **0px**                     |
| settings overflow past the card | 21px  | **0px** (50px slack)        |
| micro-captions, booking form    | 6     | **2**                       |
| amber objects, event form       | 2     | **1**                       |
| touch target / line height      | —     | **45.8px on a 31.8px line** |

## Things the render caught that reading did not

- The proposed token stretched to 248px inside a `Field` and wrapped every span leg, making the booking form **4px taller** than the boxes it replaces. Cause: `App.css`'s `.field input, .field .df { width: 100% }` — correct for the box the token stops being. It is the same lesson ADR-0176 §3 wrote once ("the box is the wrapper, not the input"), arriving from the other side.
- The measurement table ran before webfonts settled and reported fallback metrics — a date's fit read 3.7px free against a settled 5.3px, which is the gap between two different recommendations. `measure()` now re-runs on `document.fonts.ready`.
- A box-centre metric reported 0.5px on the shipped event row and so proved nothing; the misalignment lives in the ink, not the boxes.

## Settled on acceptance

The owner accepted both recommended defaults rather than sending them to a device pass first: **the hairline chip** for the token's affordance (ADR-0161 §7's shipped answer), and **named dates** — with the numeric form kept for trip settings and trip creation, where the year is load-bearing and the trip cannot supply it. Underline and tint stay drawn in the mockup as the rejected settings. A real-device pass on the built screens is still worth doing; it no longer blocks the build.

## The build, same day

Shipped after the design PR merged. `ValueToken` + `value-token.css` is the new primitive; `WhenField` (both variants), `TimePicker`, `TimeField`, `TripSettings` and `CreateTrip` adopt it, and §5's chrome is **deleted** rather than overridden — `.tp-field`/`.tp-cap`/`.tp-val`/`.tp-fields`/`.tp-placeholder`, `.wf-date`/`.wf-date-cell`/`.wf-date-val`, `.set-fld .subfld`, `.date-row`, and `App.css`'s dead `.field .df` mono rule. Confirmed gone from `dist/`, not just from the source.

`DateField` grew a `format` prop: `numeric` stays the default (every existing caller untouched, ADR-0176's face), `named` is what a date wears inside a trip. Trip settings and trip creation keep numeric, because they run where nothing else on screen supplies the year.

**Three things the build learned that the drawing did not:**

- The leg label had to move **above** its sentence. Beside means one grid spanning both legs, which can only cross the per-leg `Field` shells via `display: contents` — and that erases the box ADR-0150's nudge animates and scrolls to. Costs ~7px a leg; keeps the refusal machinery whole.
- The date token **stretched to full width** on first render, wrapping every span leg and making the booking form _taller_ than the boxes it replaces. `App.css`'s `.field .df { width: 100% }` — right for the box a token stops being. Deleted, and `inline-size: auto` stated in the primitive anyway.
- `button.bld-time` was **not** converted, and that is a rule-8 "ask rather than take it on silently" call. The two share the vocabulary and almost no values (12.5px vs body size, plan violet vs amber, composite two-line content, an `empty` variant with an icon). Sharing a component would mean an option per difference or Plan mode overriding nearly all of it. On the backlog; both files name the lineage.

Measured off the built components at 360px: event when-block **223px → 154.5px**, booking span **289px → 188.5px**, settings row overflow **21px → 0px** (31px slack), touch target **45.8px on a 31.8px line**, amber objects on the event form **2 → 1**. The two heights land ~7–10px above the mockup's prediction — the label-above trade plus a `Field` label the mockup's after-frame did not carry — and are reported as measured rather than re-quoted.

3175 unit tests green (14 selector-only updates where tests named the deleted chrome, plus new `ValueToken` and `DateField` cases). `pnpm lint`, `typecheck`, `build` clean.

## Three defects after merge, and what they have in common

Owner reported against the shipped build: the clear link looked like a bug, **the date fields could not be edited at all**, and the day sat too far from the clock. All three are mine; all three are in [ADR-0177's amendment](../decisions/0177-a-when-reads-as-a-sentence.md) in full.

- The `::after` touch overlay swallowed every tap on a date — fine over a `<button>`, fatal over a native `<input>`. A date now grows the input itself instead.
- A regex deleting the retired chrome matched `.tp-val {` inside `.tp-dur .tp-val {` and left `.tp-clear`'s rule as `.tp-dur .tp-clear`, so the button fell back to the UA stylesheet.
- `.wf`'s `gap` and `.field`'s `margin-top` both spaced the same seam: 30px where the two halves of one subject should sit at 12px.

**What they have in common is the useful part.** Every one is a cascade or hit-testing fact — invisible to TypeScript, invisible to 3178 unit tests, and invisible to an e2e suite that only ever `.fill()`s a date instead of clicking it. The change's whole point was deleting shared CSS, which is precisely the kind of work where a green test run means least. `e2e/when-field.spec.ts` now asserts the three things a browser alone knows: that a tap reaches the control, that the target clears 44px, and that the clear link's computed style is ours rather than the user agent's.

Also worth recording: the ordering and auto-fill rules were checked rather than assumed after the refactor — the span's arrival defaulting to the departure day, `minDate={startDay}`, the `minTime` floor while both legs share a day, the settings and creation date floors, and the event's duration clamp are all unchanged, with 160 tests over them green and a new e2e assertion that the end date's `min` reaches the native control.
