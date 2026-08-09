# Session 235 — a "when" reads as a sentence

**Date:** 2026-08-09
**Outcome:** [ADR-0177](../decisions/0177-a-when-reads-as-a-sentence.md) **Proposed**, with [`mockups/when-field-drawing-v1.html`](../../mockups/when-field-drawing-v1.html) drawn, rendered and measured. [ADR-0083](../decisions/0083-whenfield-datetime-standard.md) stands and is extended, not replaced. Two shipped defects found and logged to the backlog.
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

## Left open

Two calls are controls in the mockup rather than decisions taken here, both legible-on-a-phone questions a desktop screenshot cannot settle: **how loud the token's affordance is** (hairline / underline / tint — hairline is ADR-0161 §7's shipped answer and the default), and **named vs numeric dates** per host (settings wants the year; a form inside a trip does not).
