# Drawn before built — ADR-0213's ninth pass

**Date:** 2026-08-31
**Subject:** three owner reports on the shared itinerary, put to two mockups instead of straight to code. One of them is a correction of a fix that shipped eight hours earlier.

## What came in

> 1. _"The download indication still bad - still as it was. Still the same bad looking מוריד etc instead of a spinner or something, and it still doesn't pop up the Google chrome saving, though maybe that'll be fine as long as we have a good looking animation - be the ux ui expert that you are and give me a nice looking animation and behavior."_
> 2. _"The flights with connecting flights still show both the full journey and the separate flights in a confusing way, also doesn't show journey leg durations (flights)."_
> 3. _"Another thing, the live sharing page should have a button to export to pdf."_
>
> _"Lets mock up everything"_

Two files, both rendered: [`a-journey-is-a-flight-plan-v1.html`](../../mockups/a-journey-is-a-flight-plan-v1.html) and [`the-reader-hands-you-a-file-v1.html`](../../mockups/the-reader-hands-you-a-file-v1.html). The decisions are in [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s ninth amendment, §1–§6. This note records what the session is worth reading for.

## The expensive lesson: I fixed the wrong axis, and the report said so

Report 2 is the second time the owner has raised the connecting flight. The eighth amendment, that morning, read "confusing" as **duplicated numbers** — a two-leg journey printed four durations and three zone shifts — and removed the legs' own duration and zone shift. Measured before and after, and the numbers genuinely fell from 4/3 to 2/1.

The owner came back with the same complaint plus a new one: the durations were now **missing**.

Reading the code with the second report in hand takes about four minutes to find what the first pass never looked for:

- the journey renders through `article.sh-event` — the same element, class and type scale as a museum visit — and `.sh-legs` indents its children by **30px**. The entire claim "these two are inside that one" rests on 30px of white space in a 360px column;
- the frame's title is `routeTitle(first.booking.fromPlaceId, last.booking.toPlaceId)`: the legs' own endpoints concatenated. `נתב"ג ← קפלאוויק` above `נתב"ג ← וינה` and `וינה ← קפלאוויק` is the same two airports three times.

**The repetition a reader trips over is the places, not the durations.** Which is exactly why counting durations found nothing: I had measured a quantity the report did not mention and then trusted the measurement because it moved.

The generalisable form, and it is not "measure more" — I measured plenty:

> A measurement only tests the hypothesis you brought to it. When a report is qualitative ("confusing", "bad looking", "doesn't work"), the first job is to find the _structure_ the word is about, and only then pick something to count. A number that moves is not evidence that it was the right number.

This is the fourth consecutive round where a fix was verified at the level it was written against a report living one level up. The previous three are in the seventh and eighth amendments. What is different here is that the owner's second report **named the missing fact**, which is what made the wrong axis visible at all.

## Two rules the app had already written down, again

Report 1 needed almost no design work, because the answer was in the repo:

- `ui/Spinner.tsx`'s docblock: _"The one shared spinner (ADR-0052 §4) … so every async surface has a motion cue, **not a static word**."_
- ADR-0052 §4 names the composition: a busy control shows its label **plus** a spinner, with a determinate bar "where the transport allows it".

The row I shipped has the bar and the word and no spinner — two thirds of a four-month-old rule, missing the third, which is the third the owner noticed. This is the same shape as the eighth pass's bidi sweep, where `bidi.ts`'s header named the exact defect and ten call sites violated it anyway. **Two consecutive rounds where the headline finding was a documented rule with a call site that had not read it.**

Worth saying plainly: in both cases I wrote the violating code _after_ the rule existed, and in the download's case I wrote a long docblock about feedback while omitting the app's one feedback primitive.

And the mechanism half is the same story. `lib/system-share.ts`'s `shareFileOrDownload` tries `navigator.share({ files })` and falls back to an anchor click; `FileOp` contains **those fallback six lines verbatim** and never tries the share branch — the branch that, on Android, opens the system sheet and _is_ the visible confirmation the owner has now asked for twice. The shared helper meanwhile carries the same-tick `revokeObjectURL` bug that `FileOp` had already fixed with `requestAnimationFrame`. Two implementations, half an answer each: rule 8's exact shape, and the reason the repair folds inward rather than adding a third.

## What rendering bought, four times

The two files were opened, not just written, and each found something invisible in the source:

1. **`.icon` is sized per context in this app.** Unsized in a new context, the journey header's flight glyph drew at its own 24px box: the header measured **131px** instead of 34.
2. **`.sh-page` now carries `min-height: 100dvh`** — my own change from this morning, so the reader's document scrolls. Any mockup wearing that class for its type scale now gets a screenful of empty ground per frame.
3. **A control in `.sh-public-bar` must take the `--on-dark-*` ramp** (ADR-0158 §3). Drawn with `--ink`/`--line`, the PDF button rendered navy on navy — invisible on the page, entirely reasonable in the CSS. The catalog records the same class of miss for `map-embedded-v1`'s hand-copied amber.
4. **The live file row is 42px**, under ADR-0017's 44px floor. The whole download argument had been happening on top of an illegal touch target.

Only the fourth is a shipped defect, but all four would have been build-time surprises.

## The fork the owner closed mid-file

While the mockups were being rendered the owner reviewed §3 of the journey file and said _"The pdf should also show the wait durations"_ — because my paper preview drew the legs with `span · duration` and dropped the layover line the live column had. That is the format working exactly as intended: a missing fact caught in a drawing rather than in a released PDF. Both paper columns now run through one leg renderer so they cannot disagree about which facts a leg carries.

## Open, and deliberately

Placement of the PDF button is a control in the file, not a decision: the masthead is always reachable and spends 36px of a 42px bar, the foot reads as "take this with you" and costs a twelve-day scroll. Same for whether the journey header carries `2 טיסות` and whether the legs sit on tint-plus-rail or rail alone. Those want a phone, and the defaults shipped in the files are the recommendation.
