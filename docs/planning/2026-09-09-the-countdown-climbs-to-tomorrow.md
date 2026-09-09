# The countdown climbs to tomorrow, and the first morning lights up

**2026-09-09.** Design session, then the build, in one day. Mockup:
[`mockups/the-countdown-climbs-to-tomorrow-v1.html`](../../mockups/the-countdown-climbs-to-tomorrow-v1.html)
(catalog entry in [`design/mockups.md`](../design/mockups.md)). Decision record:
[ADR-0221](../decisions/0221-the-countdown-climbs-to-tomorrow-and-the-first-morning-lights-up.md).

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
board underneath it over `--t-cinematic` while the chrome warms **and shrinks to the board's
height** (both heights read off the DOM at play time, as the lift's flight does; the owner
caught the first cut keeping the plan hero's height on a device), `היום` turns on the way
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

## What was built (the same day)

The owner: _"OK looks great. You can start building on the same pr."_ Everything in the file,
§8 as the default skin, with two calls the build made where the file left them open:

- **The eve clock counts to the trip's start** (trip-local midnight, the instant the mode
  flips), with the first timed thing named under it. The first build counted to the first
  timed thing (asked as _"the countdown is to the first event or to the start of the first
  day?"_); a fourth round reversed it — see below.
- **On the morning of departure the clock migrates.** Asked what happens when the day arrives
  (_"we have to add the countdown on both heroes?"_) and told to choose _"what is most natural
  and exciting"_: no second countdown — the board's own tile becomes the same `FlapClock`,
  sized down, in the board's amber, until the first timed thing starts. One component, two
  hosts, no gap.

`lib/prep-tier.ts` · `lib/prep-hero-facts.ts` · `lib/mode-seen.ts` · `ui/domain/PrepHero.tsx`
(the hero's one face, two hosts) · `ui/domain/FlapClock.tsx` · `ui/domain/GoingLiveMorph.tsx` ·
`ModeProvider`'s `chromeMode`/`goingLive` · the Shell keyed on `chromeMode` · `BoardCountdown.flap`
· `PlanLift.collapsedHeight` (measured) · `proseTripRange`'s isolate · `GOING_LIVE` in
`constants.ts`. Tests: `prep-tier`, `mode-seen`, `PrepHero`, `mode-state.going-live`, and the
`time` expectations now carry the isolate.

## The fourth round: the countdown and the flip are one moment

On the built first draft: _"until the countdown is over we stay on the plan mode … are we
counting down to what? … the mode flip should be something exciting … maybe it should happen
after the countdown finishes … whether we should have a dedicated animation for the countdown
over."_ Half right: the two moments had to be one. But flipping _at_ the first event is too
late — the departure morning is the board's morning (leave-by, the shutting check-in, the
journey block, ADR-0206), and a plan hero cannot carry that without becoming a second board.
So the moment was unified the other way: **the clock counts to the trip's start**, the
instant `deriveMode` flips. If the app is open at the zero (a group awake for it), the flaps
land on `00:00:00`, the kicker turns `מחר` → `היום`, the zeros breathe `ZERO_HOLD_MS` (1200),
and the same morph plays live — a second trigger on one mechanism. Everyone else sees the
first-open face over `00:00:00`. Drawn as §9 in the mockup, §7's face redrawn; the owner:
_"I agree with you, let's go with that."_ Rejected on the way: running the flaps to zero during
a first-open morph while the real clock reads `02:40` (dishonest content).

## The fifth round: the lifted card inherits

Merged and deployed, the owner opened the lift two days out and sent two screenshots: the
collapsed card at the tier's 46px `מחרתיים` over a horizon, the lifted card at the old 15px
rung over a plain white bar. _"The expanded hero should also inherit the same looks, or gain new
ones. Do we need a mockup here?"_ Inherit — ADR-0193 §5's rule was already "the same markup" —
and no design round: `PlanLift` had copied the hero's head rather than rendering it, so every
ADR-0221 change missed it by construction. `PrepHero` is now split into `PrepHeroCount` and
`PrepHeroNumbers`, the lift composes both and carries `data-tier`, and the two things the lift
owns are its one-size-down headline (34 · 36 · 40px, smaller flap cells: the lift owes its
space to the list) and a horizon on an `::after` at the card's real foot, since the sheen's
`::before` is pinned to the collapsed height. §10 in the mockup is the one render, measuring the
last row's ink 16px above the foot against the 14px glow. `PlanHome.lift.test.tsx` asserts the
two cards agree as a relation. Recorded as ADR-0221 §7; shipped on its own branch from `main`.

## What is next

- A device pass on four numbers: `GOING_LIVE.HOLD_MS` (400), `GOING_LIVE.ZERO_HOLD_MS` (1200),
  the horizon's 14px against the tasks row's 16px, and whether seven lamps read as a bar
  (ADR-0193 §2).
- The mockup is the dated record of the three rounds and is not retrofitted to the two build
  decisions above.
