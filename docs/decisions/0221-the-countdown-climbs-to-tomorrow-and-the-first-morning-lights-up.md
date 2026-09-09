# 0221 — The countdown climbs to tomorrow, and the first morning lights up

**Status:** Accepted and **BUILT** (2026-09-09), in one session with the design.
**Date:** 2026-09-09
**Design references:** [`mockups/the-countdown-climbs-to-tomorrow-v1.html`](../../mockups/the-countdown-climbs-to-tomorrow-v1.html) (§1–§8; every number in it is read off its own DOM), session note [`planning/2026-09-09-the-countdown-climbs-to-tomorrow.md`](../planning/2026-09-09-the-countdown-climbs-to-tomorrow.md).

**Amends:** [0193 §5](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) (`--prep-collapsed-h` is measured, not 190px); [`design-language.md`](../design/design-language.md)'s automatic-switch line and its board ration (a narrow exception for the eve's flap cells); [0118](0118-numbers-in-hebrew-bidi.md) gains a call site (`proseTripRange`).
**Builds on:** [0016](0016-plan-trip-modes-one-surface.md) (mode is derived), [0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (motion tokens, reduced motion resolves every animation-only state), [0142](0142-trip-birth-is-the-boards-first-departure.md) (the board's power-on is the one celebration asset, played at the two moments a trip changes state), [0193](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) (the hero's two numbers, the lift), [0198](0198-we-notify-what-you-can-still-miss.md) §2 (`trip.tomorrow` names the first timed thing on day 1).

## Context

Owner, from a device, two days before a trip, with a screenshot of the prep hero reading `היציאה` over a 15px `מחרתיים`:

> _"The מחרתיים is really small and underwhelming. I want the countdown to be more exciting where the climax is on the מחר of course. […] Do we want an exciting animation for when a user opens a trip for the first time after it flipped to trip mode? I think that we do."_

Then, on the first draft: _"Is this flashy enough though?"_ Then: _"Make everything more flashy, more colorful, exciting! It should be beautiful and professional at the same time."_ Then, on a device: the morph's board _"stays the same size even if the plan hero is much bigger"_. Then: build it, and choose what is most natural for the day the trip arrives.

Reading the code before drawing moved most of the design:

- **The hero's type ramp inverted at the climax, by construction.** `countdownParts` returns `{ value: '47', unit: 'ימים', prefix: 'בעוד' }` from three days out and `{ value: '', unit: 'מחר' }` for the last two; `PlanHome` printed `value` in the 34px headline and `unit` in the 15px dim rung, so the two days that matter were the smallest countdown the card ever showed. Measured: 34px at 47 days, 15px at 1 day.
- **The product's one cinematic moment had never played for the automatic flip.** `App.tsx` armed `data-switching='to-trip'` only when the mode changed while the shell was mounted, and `deriveMode` flips on the trip-local calendar day — at midnight. What every open in trip mode played instead was `board.css`'s `wp-board-power`, identically on day 1 and day 9.
- **The celebration vocabulary was already decided.** [0142](0142-trip-birth-is-the-boards-first-departure.md) rejected confetti and settled that the board's power-on is the one asset, played _"at the two moments a trip changes state: it is born; it goes live"_. This is the second moment, and it was never wired.
- **The eve already had its sentence, one layer down.** `trip.tomorrow` pushes `נוסעים מחר · <trip> · <first timed thing> ב-06:40` at 19:00 (ADR-0198 §2). The hero on the same evening said the small word and nothing else.
- **A shipped defect, found by rendering:** `proseTripRange` returned `11–22 בספטמבר` with no isolate, and the RTL line drew it `22–11`. It is in the owner's own screenshot. The mockup's first probe deduced the visual order backwards and the render corrected it.

## Decision

### §1 The hero's energy is a function of the distance to departure

`data-tier` on `.prep`, from `daysUntilStart` (`lib/prep-tier.ts`): `far` (more than a week: the shipped card), `week` (44px numeral, the runway), `eve2` (`מחרתיים` takes the headline at 46px), `eve` (`מחר`, and day 1 itself: the clock is the headline). **A standalone word rides in the value slot** — one JSX rule in `PrepHero`: `countdownParts` returns `מחר`/`מחרתיים` as a unit with no value, and a unit with no value is the value.

Inside the last week the card travels **the mode switch's own temperature ramp** rather than a new hue: night deepens at its top, and an **amber horizon line** at its foot goes from faint to dawn on the eve. The word carries a light ink ramp, a numeral arrives as a flap (`steps()`, because a split-flap is discrete), and the eve card arrives on `--ease-arrive`. The card itself stays violet, glowless and pulseless.

**The dawn is a horizon, not a band.** The first cut mixed amber into the ground under the tasks row and white ink there measured 3.6:1 in light; no mix above ~18% passes. So the glow dies within 14px of the foot while the tasks row's text ends 16px above it — both read live in the mockup, and both to re-check on any change to `.prep`'s padding.

### §2 The runway

Seven lamps under the dates inside the last week, one lit amber per day behind you, lighting in order on mount. Discrete lamps and never a bar: ADR-0193 §2 rejected a second bar over the readiness track, and two bars read as one measurement split in half. Seven whatever the count, so the strip never changes width from one morning to the next.

### §3 The eve's headline is a departure-board clock, and it counts to the first timed thing

On the eve the headline is `HH:MM:SS` in split-flap cells (`FlapClock`, cut from the zero state's `.cell` recipe) with the board's own countdown ink (`.wp-board-countdown .t` is `--amber`), ticking; the word drops to the kicker (`היציאה מחר`); and a line under the dates names what the clock counts to, with the event's own icon and time in its own zone — the fact `trip.tomorrow` pushes, derived client-side from the same events the board reads, so the hero and the push say one sentence.

**What it counts to: the first timed thing on day 1**, falling back to the trip-local midnight that starts day 1 only when nothing on day 1 carries a time. Midnight is when the mode flips, but nobody feels midnight; the departure is the commitment. The day words (`מחר`, `בעוד 5 ימים`) stay calendar-day based.

**This spends board grammar in Plan mode**, which the design language rations to one surface per screen. The exception is narrow and is written into the ration: cells, not a surface — no dark ground under the card, no glow, no pulse, no `עכשיו`. It is the board's flaps warming up one day early on the plan hero. And `screens.css`'s "the prep hero is never amber" was written when the hero carried no clock: amber here is the clock's ink and the horizon's, the card is not amber.

**And on the morning of departure the clock migrates.** Until the first timed thing starts, the board's countdown tile is the same `FlapClock`, sized down, in the board's amber — one component, so the clock hands over from one hero to the other without a gap, and there are never two countdowns on screen. A leave-by or a shutting window keeps the tile's words (ADR-0206 §Z1 / ADR-0184 §6); the flaps replace only the plain time-to-next.

### §4 The first morning: the plan face becomes the board

The install remembers the mode each trip was last **seen** in (`waypoint:mode-seen:<tripId>`, `lib/mode-seen.ts`, the same per-trip shape as `waypoint:map-download-prompt:<tripId>`). On the first open of a live trip — including someone joining mid-trip — `ModeProvider` reports `mode: 'trip'` from the first render (Home is the board) but holds **`chromeMode`** at plan for `GOING_LIVE.HOLD_MS` (400ms, the mockup's recommendation; a device pass owns the value), then flips it. The Shell keys `data-switching` on `chromeMode`, so the **shipped** switch plays for real: the chrome warms violet → indigo, the drafting grid dissolves, and the board ignites.

On Trip Home, `GoingLiveMorph` holds both faces in one grid cell: the prep hero (rendered from the same `prepHeroFacts` the plan screen uses, so the face the board grows out of is the card the evening before showed — same tier, same clock, `היום` in the kicker) over the board. On the flip the face fades **and shrinks to the board's measured height** over `--t-cinematic` (`.prep` already clips), the board's shipped power-on is delayed to the end of the fade so the ignition is the climax, and then it **blooms**: the amber glow swells past the card and settles, one highlight sweeps the face, and `יום 1/12` in the header lights once in the clock's ink. Both heights are read off the DOM at play time, never constants (ADR-0193 §4's rule for the lift) — the owner caught the first cut keeping the plan hero's height.

Sequence: 400ms hold, 600ms fade and chrome, ignition at +120ms for 600ms, ~1.7s in all. **A tap anywhere on it ends it at once, quietly** (the chrome flips without arming the switch). **Under `prefers-reduced-motion` it never starts**: the mode is trip from the first frame (ADR-0140 §5). It plays once per trip per install; a trip seen in plan again re-arms it for its own first day. The wrapper stays for the life of that Home mount once played, so the board is never remounted (a remount replays its power-on).

**This amends design-language's automatic-switch line.** _"A flip the user didn't ask for shouldn't perform"_ was written about a flip under your hands at midnight. A first open on departure day is a moment the user comes to, and the only time the automatic switch can be seen at all — so it does perform, once. A flip that happens while the app is open is untouched.

### §5 The date range is an isolated island

`proseTripRange`'s same-month shape wraps **only the numeric range** in `ltrIsolate`: `⁦11–22⁩ בספטמבר`. Never the sentence holding it — that is how ADR-0220's link preview flipped a cross-month range the other way. Four consumers get the fix at once (`PlanHome` ×3, `TripSettings`).

### §6 Readiness at 100% is a status

The bar fills `--ok` only when it is full (rule 4: statuses take `--ok`); at 99% it stays the plan ink, or the green would be a colour step and not a fact.

## Rejected

- **Confetti, a toast, a greeting sentence** — 0142's rejection stands: the board's first departure is the sentence, and a second surface speaking at once is the duplication.
- **A second cinematic moment** — the budget is one, and this asks for none: it fixes the trigger of the one that exists and adds a hold.
- **Amber as text on the violet** (3.4:1 light), **amber mixed into the ground under ink** (3.6:1), **a warm sheen on the whole card** (decorative amber, rule 4), **a pulse or glow on the eve** (pulse means live now).
- **A count-up on the numeral** (`useCountUp` exists): on a countdown it reads as the trip getting farther.
- **A second bar** for the runway (ADR-0193 §2) and **a new hue** for the colour (rule 4, mode identity).
- **Counting the eve clock to midnight** when a first timed thing exists: the boundary nobody feels.
- **A separate day-1 countdown on the board** beside its tile: the tile already counts to the first thing; the flaps replace its face, they do not add one.

## Consequences

- New: `lib/prep-tier.ts`, `lib/prep-hero-facts.ts`, `lib/mode-seen.ts`, `ui/domain/PrepHero.tsx` (the hero has two hosts and one face), `ui/domain/FlapClock.tsx` (two hosts), `ui/domain/GoingLiveMorph.tsx`; `ModeProvider` gains `chromeMode`, `goingLive`, `skipGoingLive`; `BoardCountdown` gains `flap`; `PlanLift` takes a measured `collapsedHeight`; `GOING_LIVE` in `constants.ts`.
- The Shell and the Header paint `chromeMode`; `Screen` keeps `mode`. The `ModeToggle` is unchanged.
- The hero's `<button>` constraint (ADR-0160 §4) now binds `FlapClock` too: a `role="timer"` read, never a control. `PrepHero.test.tsx` asserts it.
- `mockups/the-countdown-climbs-to-tomorrow-v1.html` is the record of the three rounds and is not retrofitted.
- A device pass owns three numbers: `GOING_LIVE.HOLD_MS`, the horizon's 14px against the tasks row's 16px, and whether seven lamps read as a bar.
