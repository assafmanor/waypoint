# The countdown climbs to tomorrow, and the first morning lights up

**2026-09-09.** Design session, no build. Mockup:
[`mockups/the-countdown-climbs-to-tomorrow-v1.html`](../../mockups/the-countdown-climbs-to-tomorrow-v1.html)
(catalog entry in [`design/mockups.md`](../design/mockups.md)). No ADR yet: the owner has
not picked, and the file carries two levels for exactly that reason.

## What was asked

Owner, from a device, two days before a trip, with a screenshot of the prep hero reading
`היציאה` over a 15px `מחרתיים`:

> "The מחרתיים is really small and underwhelming. I want the countdown to be more exciting
> where the climax is on the מחר of course. […] Also try to think if this also applies to
> other stuff and how we could hype an upcoming trip. Do we want an exciting animation for
> when a user opens a trip for the first time after it flipped to trip mode? I think that we
> do."

And on the first draft, before anything was committed: _"Is this flashy enough though?"_

## What reading the code found

1. **The type ramp inverts at the climax, by construction.** `countdownParts` (`lib/time.ts`)
   returns a numeral plus unit from three days out and a bare word for the last two.
   `PlanHome` prints the numeral in the headline style and the unit in the small dim one, so
   `מחר` and `מחרתיים` are the only countdowns rendered entirely in the card's smallest
   style. Measured in the mockup: 34px at 47 days, 15px at 1 day. Not a taste call.
2. **The one cinematic moment never plays for the automatic flip.** `App.tsx` arms the
   `to-trip` switch only when the mode changes while the shell is mounted ("not armed on
   first mount"), and the mode flips at trip-local midnight. What every open in trip mode
   does play is the board's `wp-board-power` ramp, the same on day 1 and day 9. The first
   morning has no signature.
3. **The celebration vocabulary was settled in session 189** (`motion-trip-birth-v1`):
   confetti rejected, the board's power-on is the one asset, played at "the two moments a
   trip changes state". This is the second moment and it was never wired.
4. **The eve's sentence exists on the backend.** `trip.tomorrow` pushes the trip name and
   the first timed thing on day 1 at 19:00. The hero on the same evening says nothing but
   the small word.
5. **A shipped defect, found by rendering:** `proseTripRange` returns `11–22 בספטמבר`
   without an isolate, and the RTL `.prep-dates` line draws it `22–11`. It is in the owner's
   own screenshot. Four call sites (`PlanHome` three times, `TripSettings`). The mockup's
   first probe deduced the visual order backwards and the render corrected it, which is the
   pitfall the skill warns about and the reason the table reads x-positions rather than
   asserting.

## What was drawn

**Level one, the disciplined answer (§1–§5).** `data-tier` on the hero keyed on
`daysUntilStart`: far 34px, last week 44px, מחרתיים 46px, מחר 58px; a standalone word rides
in the value slot (one JSX line). The eve gains the first timed thing and a running
`בעוד 14:22 שעות` as an amber fill (7:1; amber as text on the violet is 3.4:1). The first
open persists the last mode _seen_ per trip (`waypoint:mode-seen:<tripId>`), mounts in plan
chrome, holds, then arms the shipped `to-trip` switch. Zero new keyframes.

**Level two, the recommendation (§6–§7).** The board warms up on the plan hero one day
early: numerals flip in as split flaps inside the last week, seven discrete runway pips, and
on the eve the headline itself is a ticking `HH:MM:SS` in flap cells cut from the zero
state's `.cell` recipe. The first open is a transformation: the violet card fades into the
board underneath it over `--t-cinematic` while the chrome warms, `היום` turns on the way
out, and the board's shipped power-on is delayed to the end of the fade so ignition is the
climax. 1720ms at the 400ms hold, once per trip, one tap skips, nothing under reduced
motion.

**Level three, now the default skin (§8).** The owner, on seeing §6–§7: _"Make everything
more flashy, more colorful, exciting! It should be beautiful and professional at the same
time."_ The colour is the mode switch's own temperature ramp (violet → indigo + amber)
spread across the last week: the hero's top deepens to night, an amber horizon line glows at
its foot (faint in the last week, dawn on the eve), the runway pips become lamps that light in
sequence, the flap digits take the board's amber countdown ink, the readiness bar goes `--ok`
at 100%, the eve card arrives on `--ease-arrive`, and the first morning's ignition blooms with
a highlight sweep. No new hue anywhere. The first cut mixed amber into the card's ground and
the file's own contrast probe rejected it (3.6:1 under the tasks row in light), which is how
the dawn became a horizon line whose glow dies 14px from the foot while the text ends 16px
above it. The `עוצמה` control drops every frame back to the quiet skin for comparison.

## Forks for the owner

- **The vivid skin (§8) as the default.** Recommendation: yes. It is the mode switch's
  colour story told early, every element of it is in the budget, and every contrast in it is
  measured on the page. The quiet skin remains one toggle away in the file.

- **The ration exception (§6).** The flap clock spends board grammar in Plan mode, which
  design-language rations to one surface per screen. The file argues a narrow exception
  (cells, not a surface: no dark ground, glow, pulse or `עכשיו`). Refused, the eve falls
  back to §3. **Recommendation: take it.** It is the whole story the evening has to tell.
- **Amber on the plan hero (§3/§6).** `screens.css` says the prep hero is never amber. The
  clock is the one element rule 4 files under amber. Recommendation: the fill, on the clock
  only; the control keeps violet alive for a device pass.
- **The runway pips (§6).** ADR-0193 §2 rejected a second bar over the readiness track.
  Seven 4px pips are not a bar, but that is the device's call, so it is a control.
- **The hold (§4/§7).** 400ms drawn; 0 and 250 are in the control. Too short and the violet
  is never seen; too long and it reads as a stall.
- **The automatic-switch line in design-language.** "A flip the user didn't ask for
  shouldn't perform" was written about a flip under your hands at midnight. A first open on
  departure day is a moment the user comes to, and the only time the automatic switch can be
  seen at all. The proposal amends that line rather than breaking it.

## What is next

- The owner's pick, then an ADR promoting the chosen level, amending ADR-0193 §5's
  `--prep-collapsed-h` (must follow the tier), design-language's automatic-switch line, and
  `screens.css`'s "never amber" comment.
- The `proseTripRange` isolate is a bug fix independent of the design and should not wait.
- Build order if adopted: the ramp and the isolate (small), the eve line and clock, the
  `mode-seen` trigger and hold, then the morph.
