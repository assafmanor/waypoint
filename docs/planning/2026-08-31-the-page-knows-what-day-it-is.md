# The page knows what day it is — the shared reader's opening day (2026-08-31)

Session on one owner report about the public `/s/<code>` reader. Drawn, not built:
[`mockups/a-shared-itinerary-knows-what-day-it-is-v1.html`](../../mockups/a-shared-itinerary-knows-what-day-it-is-v1.html),
promoted as [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
eleventh amendment.

## The report

> _"I noticed that the live sharing page opens with the first day expanded. First of all -
> why? Second, i think that during the trip, i.e. while it's happening, the live sharing page
> should scroll to and expand the current day. Maybe we should also add an indication to
> whether it's in the future, is happening right now, or has already happened."_

## The answer to "why", because it was the first question

Nobody decided it. `SharedItinerary.tsx` holds `useState(0)`; the three reader mockups the
page was built from (`…is-read-v1`, `…feels-like-an-invitation-v2`, `…is-organized-by-the-day-v3`)
all shipped `open: 1` — the second day — as a **demo state**, so a screenshot would show one
card's insides. The accordion itself is a real decision (ADR-0213 §1's day spine, one card
open at a time). Which card is open was a hole, not a choice, which is why the amendment
reads as filling one.

## What reading the code changed, before anything was drawn

Four of these moved a decision, and three of them made the change smaller:

- **`DayView` had already decided the scroll**, comment and all: _"Land on now: scroll the
  now-line into view once per day-open (today only), a passed event or two left peeking
  above. Keyed on the viewed day — never on the clock tick — so it doesn't fight a manual
  scroll. Instant under reduced-motion."_ The reader page proposes **no new scroll rule**;
  it applies that one at day altitude.
- **The page already spends amber on the open card and says why it may** — and the target is
  the wrong one. `.open` is disclosure, already carried three ways. That turned "add an
  indication" into "move the hue you already spend", which costs two CSS rules instead of a
  new visual language.
- **A state badge per card was tried and deleted once already**, in `App.css`, with the
  reason recorded: a chip every card in a run carries repeats the heading above it and tells
  no two cards apart. That is the whole argument for marking the exception.
- **`type DayScope = 'past' | 'today' | 'future'` already exists twice** — declared local to
  `DayView`, computed inline there and again in a second spelling in `DayStrip`. The share
  page is the third host; the derivation is lifted into `lib/time.ts` rather than copied.

## Forks put to the owner

1. **`today` from the server or from the client?** Recommended and drawn: the projection
   ships `trip.timezone` and the client runs `todayInTz`. A server-stamped answer goes stale
   in the reader's hand on a page that never refetches.
2. **The peek above the landed card** — 0 / 26 / 76px, a control in the mockup. 26px shipped
   as the drawing's default; it is a device call.
3. **`.nowline` inside today's card.** Recommended but its own pass: the marker is free (the
   app's own component, one margin rule), the derivation is not — `nowLinePlacement` reads
   instants and the projection ships labels by design.

## What the renders found that reading could not

- The `עכשיו` mark, drawn with `.chip.soon`'s tinted-ground recipe, measured **4.53:1**
  against AA's 4.5 floor — passing by 0.03. Dropping its ground (the column is already
  amber) gives 5.09:1. The tint was decoration wearing a rationed hue anyway.
- The now-line placed above a daypart **section** put an afternoon that had already begun on
  the future side of 14:05. It belongs under the heading, among the rows.
- Phase computed from day **ordinals** rendered a finished trip as an unstarted one — with
  no "today", all twelve days read `future`. Dates answer all three trip phases with no
  special case.
- Three defects in the mockup's own instrumentation, each of which had produced a
  plausible-looking wrong number: `offsetTop` against an unpositioned ancestor (every frame
  below the first landed hundreds of pixels off), a computed `color-mix()` read as
  `rgb()` (Chromium returns `color(srgb …)`; a canvas silently refuses it), and a `:not()`
  missing from the proposal's revert rule, which quietly repainted the "before" half of two
  comparisons.

## Not done

The build. The backlog carries it as one line for the shipping half and one for the deferred
now-line.
