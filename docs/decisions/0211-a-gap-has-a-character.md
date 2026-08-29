# 0211 — A gap has a character, and `זמן חופשי` was an `else`

**Status:** Accepted 2026-08-29, on the owner's "let's build this". **Built the same day.**
**Date:** 2026-08-29
**Reported:** the owner, from a device, with a screenshot — _"not always we want to show that we have
free time, for example on this screenshot we're on the way, so this isn't free time. It should look
different. Also at night or early in the morning it should show different messages. On the empty
state (no upcoming events), etc."_ Then, on the drawing — _"I think that at night when the day is
over (no more plans for today) the hero should also have some kind of a lookahead. Like what's
coming up tomorrow. Should it be on the lifted hero? I'm not sure."_
**Drawn in:** [`mockups/the-gap-is-not-free-time-v1.html`](../../mockups/the-gap-is-not-free-time-v1.html)
**Session note:** [2026-08-29](../planning/2026-08-29-the-gap-is-not-free-time.md)
**Applies:** [0208](0208-a-claim-needs-something-to-stand-on.md) and
[0207](0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) to the one statement on the board
that had never taken their test.
**Refines:** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §S (which repaired this `else` from
the other side) and §M (whose day token this extends to the sibling meta row);
[0059](0059-booking-presentation-on-home-and-index.md) §2 (whose rail gate this generalises).
**Constrained by** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §12 — no third slot — and
[0028](0028-plan-violet-color-budget-dark-ready.md) rule 4.

## Context

The board's now-slot printed `זמן חופשי` in a gap. It was not a claim anybody decided to make: it
was `Board`'s final `else`, reached when the `in-transit`, `group-split` and `now` questions had all
answered "no" (`Board.tsx:929-936`, rendered at `:441-446`).

So it printed on a bus, in bed at ⁦02:40⁩, at ⁦06:40⁩ before the day had started, and on a day nobody
had planned. The owner's screenshot is the sharpest form: the lifted hero saying `זמן חופשי` in its
title while its own journey line, 40px below, said `נסיעה · בדרך` — one card, two contradictory
statements about one minute, and the wrong one is the one nobody asserted.

Two things make this an ADR rather than a copy fix.

**§S already described this shape, from the other side.** It fixed the _silence_ the same `else`
caused when the hero lifted in a gap, and wrote the general form down: _"a variant that is an `else`
on one surface is an empty array on the other."_ This is that `else` producing a falsehood instead,
which §S's own sentence predicts.

**The repo already had the rule it breaks.** ADR-0208 is titled "a claim needs something to stand
on"; ADR-0207 is "a fix may withdraw a claim, it may not make one". `travel.leavePassed` says
`זמן היציאה עבר` and never `אתם באיחור` precisely because the app has no sensor and a settle mark is
not one. Every sentence on this surface has been through that test. The title slot never had.

## Decision

### 1. The gap is derived, not fallen into

`lib/gap-character.ts` answers one question — what kind of gap is this — from inputs the screen
already holds for other reasons. `Board` and `HeroLift` render its answer. Neither decides.

Pure and clock-injected, like `hero-travel.ts` beside it. `gapWords` is the one function in it that
reads `i18n/he.ts`, and it is there rather than at the two render sites for `lib/transitions.ts`'
own reason: two components each mapping a discriminant to a phrase is two places for the phrase to
drift.

### 2. One answer, both elevations

ADR-0160 §1 is that the board and the lifted hero are one object at two elevations. So the screen
derives the character **once** and hands the same `BoardGap` to both; `BoardGapSlot` is exported
from `Board.tsx` and imported by `HeroLift`, the same path `DayRail` and `BoardCountdown` already
take. A second copy of these two lines is exactly how §S's defect comes back.

### 3. The closed set — five characters, first match wins

Each stands on something already in the code. Nothing here is a guess about a person, and nothing
needs a field the app does not store.

| character     | stands on                                                      | label · title                     |
| ------------- | -------------------------------------------------------------- | --------------------------------- |
| `on-the-way`  | the `בדרך` device mark (`lib/on-way.ts`)                       | `כרגע` · `בדרך`                   |
| `at-the-stay` | `travelOrigin → wokeIn` **and** the clock outside `DAY_WINDOW` | `לילה` / `בוקר` · the stay's name |
| `day-done`    | no `next` **on today's date**, on a day that had events        | `היום` · `סוף היום`               |
| `empty-day`   | the clock's day holds no timed event at all                    | `היום` · `יום פנוי`               |
| `open`        | `next` is today — the honest gap                               | `פנוי` · `זמן חופשי` · `עד HH:MM` |

**The order is the decision.** A person's own assertion outranks the plan's position, which is why
`on-the-way` is first: somebody up and out at ⁦06:20⁩ is moving, not at a hotel.

**`at-the-stay` says a PLACE, never `ישנים`.** That would be a claim about a person and the app has
no sensor for it (ADR-0207 §2). What it may say is where the plan puts you, and what hour it is.

**Night and early morning are one member.** Only which side of `DAY_WINDOW` you are on differs, and
that is a claim about the **clock**, which keeps it inside ADR-0208. The band needs one number the
app did not have — `NIGHT_ENDS_HOUR = 5` — and it is the only number this ADR adds; it is named in
`constants.ts` beside `DAY_WINDOW` with its reasoning, and it wants a device pass on a real early
start. **The band is not one comparison**: the night wraps midnight, so morning is the narrow slice
from `NIGHT_ENDS_HOUR` to the window opening and everything else outside the window is night. The
first implementation used a single `<` and read ⁦23:30⁩ as morning; the spec caught it.

**`on-the-way` wears teal, and nothing else does.** The board already paints `כרגע · בדרך` teal for
a bracketed transport in motion (`midSpan.transitLabel`, `.wp-board-now-label.loc`). A journey a
person asserted is the same fact as one the plan brackets, so it takes the same costume — badge and
label — rather than reading amber over a teal line two rows down, which is this ADR's own
contradiction one register over. `לילה` and `בוקר` stay amber: the clock is amber's (rule 4).

### 4. `wokeIn` needs a bound, and `DAY_WINDOW` is it

`travelOrigin` falls through to the bed when nothing has started today (ADR-0206 §AD) — but that
answer survives all day, so at ⁦11:00⁩ on an empty day the bed is still the plan's last position and
you are out. Requiring the clock to be outside the waking window is what stops a stale claim being
made, and it costs no new constant: `DAY_WINDOW` is the rail's own window, already there.

**And the rail comes off in the same states.** `dayProgress` clamps to `[0,1]`, so at ⁦02:40⁩ the
board drew a knob at ⁦0%⁩ under a label reading `עכשיו` — telling somebody in bed they were standing
at ⁦07:00⁩. That is `in-transit`'s gate from the other end (ADR-0059 §2: the flight IS the day's
current activity), so it is **one** boolean both callers feed (`showRail`), not a second condition
beside the first. Absence beats a pinned lie.

### 5. The gap that really is a gap finally says how much

The `now` variant renders `.wp-board-now-meta`; the `free` branch rendered none — while `GlanceCard`
printed `פנוי עד ⁦11:45⁩` two inches lower, which is visible in the owner's own screenshot. `open`
now fills the slot the branch always had, in the board's own words (`עד`). No new markup.

### 6. The lookahead already existed, and was silent about which day it meant

This is the owner's follow-up, and answering it **withdrew a claim the drawing had already made**.

`deriveNow` (`lib/time.ts:312`) is handed the whole _trip's_ events and carries no date filter, so
`הבא בתור` has always crossed midnight: at ⁦22:40⁩ on day 3 the board was already showing tomorrow's
⁦07:00⁩ flight. `סוף היום` fires only when the trip has no timed event left at all. The first draft
of the mockup, the session note, a backlog line and a PR description all said it fired on any
unplanned day; reading `Board.tsx` alone is what produced that, and a throwaway `vitest` against
the real `deriveNow`/`heroHorizon` is what disproved it.

So what was missing is not a lookahead but the **day token**: `07:00` with nothing saying tomorrow.
ADR-0160 §M named that exact ambiguity for the in-transit landing — _"a red-eye landing at 06:00
reads as this morning"_ — and solved it with `BoardTransit.endDay`. `BoardNext` now carries the
same field, from the same `relativeDayLabel`, rendered **with the time it qualifies** and never on
the countdown, which is §M's own rule for §M's own reason.

### 7. `אחר כך` stops stopping at midnight

`thenAfter` filtered `heroHorizon`'s `events`, which Home passed as `dayEvents` — so at ⁦22:40⁩ the
lifted hero showed tomorrow's flight and then nothing, while the same function handed the whole trip
finds the stop after it. Home now passes `events`. `thenAfter` is the **only** consumer of that
field (grepped, not assumed) and it keys off `nextAll[0].startsAt` rather than the clock, so
widening the pool cannot pull in anything earlier than the point it follows.

**This is the answer to "should it be on the lifted hero?": both, and §1 already made the split.**
The collapsed board carries the point; the lifted hero carries the depth on it, and it already
resolved place, note, file and tasks for a cross-day next. §12 is not strained — no third slot, no
new way in. `אחר כך` stays one quiet line that has stopped stopping at midnight.

### 8. What this does not do

- **No suggestions on an empty day.** `GlanceCard` is Home's "what could we do" surface (§10); a
  hero growing into it competes with something already shipped.
- **No separate "about to leave" state.** The countdown already swaps to the leave-by (ADR-0206
  §Z1). A title state would say it twice, and would turn a passed clock into a claim about a person.
- **`סוף היום` in both slots on the trip's last day** stays as it is — two ways of saying one
  nothing, and the only place that phrase now appears. Backlogged rather than fixed here.

## Consequences

- One derivation, two elevations, five characters. `Board` has one caller, so `gap` is an explicit
  prop rather than a defaulted one — an unwired gap renders nothing, which fails a spec loudly
  rather than silently reprinting the old `else`.
- `t.board.gap` is a keyed record, so a sixth character has to say what it prints or the build
  stops. `open` and `day-done` reuse `freeLabel`/`freeTitle` and `endOfDay` rather than restating
  them, which is rule 8 applied to copy.
- **Height:** the recommended `on-the-way` draw is words only; `open` gains a ⁦17px⁩ meta line in a
  slot that already existed; the night board nets ⁦+3px⁩ (a ⁦23px⁩ rail off, a meta line on);
  `אחר כך` reaching tomorrow is ⁦30px⁩ against §12's stated ⁦28px⁩ — the difference is the loaded
  webfont. **Zero new controls**, so nothing to measure against ADR-0017's ⁦44px⁩ floor. One new CSS
  declaration.

## Alternatives considered

- **The destination becomes the now point, `הבא בתור` moving on to what follows it** (the mockup's
  §1 option א׳). The richest read, and `in-transit`'s shape exactly. Rejected on cost: ⁦+20px⁩, it
  takes the countdown tile off the screen, and it pulls `אחר כך` into the second slot — which is
  §12's Day-tab competition. If it is ever wanted it needs its own ADR section.
- **`בדרך ל־<destination>` as the title** (option ב׳). Reads best. Rejected because it names the
  destination twice ⁦28px⁩ apart and `ל־` breaks agreement before a definite article. **Not** for
  the reason the draft gave: it was rejected as ADR-0118's bidi trap, and probing the rendered
  title character by character says the order is fine — a Latin run at the _end_ of a Hebrew line
  reads LTR within itself, and ADR-0118 is about a run in the _middle_. The probe ships as a
  measurement row in the mockup.
- **`ישנים` as the night title.** A claim about a person with no sensor behind it.
- **A separate member for "about to leave".** §8.
- **Two `at-the-stay` members** instead of one with a band. The stay is the same fact at ⁦02:40⁩ and
  ⁦06:40⁩; only the hour differs, and an hour is not a character.

## Build log (2026-08-29)

Three things the build changed from the drawing, each recorded rather than quietly done:

1. **The live badge stays `עכשיו` except on `on-the-way`.** The mockup drew `לילה` / `בוקר` /
   `היום` in the badge _and_ in the label — the same word twice, ⁦20px⁩ apart. The label is the slot
   that carries meaning; the badge is the live indicator. Only `on-the-way` swaps it, because there
   the swap is the shipped transit costume rather than a repetition.
2. **The stay is named by its own title**, not by a resolved place name. `.stay-strip` one surface
   down renders `<b>{stayNow.title}</b>`, and two names for one bed is what ADR-0138 is about.
3. **The band's comparison was wrong and a spec caught it** — §3.

Verified: `pnpm typecheck` and the full unit suite green (4953 tests, 276 files), with 14 new specs
on the derivation, 7 on the two components, and 4 at the Home seam where the wiring is the only
thing under test.
