# The gap is not free time — a brainstorm on what the hero says when nothing is running

**Date:** 2026-08-29
**Mockup:** [`mockups/the-gap-is-not-free-time-v1.html`](../../mockups/the-gap-is-not-free-time-v1.html)
**Status:** brainstormed, drawn, and **built the same day** — [ADR-0211](../decisions/0211-a-gap-has-a-character.md). The owner answered with "let's build this"; §1 shipped as the recommended option ג׳, and the build log at the foot of the ADR records the three places the code deviates from the drawing.

## What was asked

Owner, with a screenshot of the lifted hero:

> not always we want to show that we have free time, for example on this screenshot we're on the way, so this isn't free time. It should look different. Also at night or early in the morning it should show different messages. On the empty state (no upcoming events), etc. We should think of the many places where the hero could be enhanced to other texts and stuff, that's especially true for the trip hero

## What the screenshot actually shows

The card contradicts itself. Its title says `זמן חופשי`; forty pixels lower its own journey line says `נסיעה · בדרך`. Both are on screen at once, and the one that's wrong is the one nobody asserted — somebody pressed `בדרך`, and the title never asked.

## The one finding everything else follows from

`זמן חופשי` isn't a state the app derives. It's `Board`'s final `else`.

`Board.tsx:929-936` picks the variant `in-transit → group-split → now → 'free'`, and `:441-446` renders `free` as the branch nothing else caught. So the words aren't a claim anybody decided to make — they're what gets printed when three questions all came back "no".

Two things make that worth an ADR rather than a copy fix:

- **ADR-0160 §S already described this exact shape**, from the other side. It fixed the _silence_ the same `else` caused when the hero lifted in a gap, and wrote down the general form: _"a variant that is an `else` on one surface is an empty array on the other."_ This is the same `else` producing a _falsehood_ instead, which §S's own sentence predicts.
- **The repo already has the rule it breaks.** ADR-0208 is called "a claim needs something to stand on"; ADR-0207 is "a fix may withdraw a claim, it may not make one". `זמן חופשי` is a positive claim — _the time is yours_ — resting on an absence. Every other sentence on this surface has been through that test; `travel.leavePassed` says `זמן היציאה עבר` precisely because `אתם באיחור` couldn't be supported. The title slot is the one statement on the board that never took it.

So the proposal isn't "add more strings". It's: the gap gets a **character**, derived once from evidence the app already holds, and the two slots the board already has say it.

## Four more things reading the code turned up

1. **"Night" needs no new number, and the board already has one that lies.** `DAY_WINDOW = { START_HOUR: 7, END_HOUR: 23 }` (`constants.ts:355`) is the rail's window, and `dayProgress` (`lib/time.ts:448`) clamps to `[0,1]`. At 02:40 the knob pins at 0% under a label reading `עכשיו` — the board telling somebody in bed that they're standing at 07:00. The night is just the eight hours the rail refuses to draw, and the fix is to stop it claiming them.

2. **The position the night/morning title needs is already derived, for something else.** `travelOrigin` (`lib/hero-travel.ts:170`) falls through to `wokeIn` — the bed — when nothing has started yet today (ADR-0206 §AD). That's the app's own answer to "where does the plan say you are", built for the leave-by. And it's also the _bound_: at 11:00 on an empty day the bed is still `travelOrigin` and the claim has gone stale, so the state needs the clock to be outside `DAY_WINDOW` as well. One constant does both jobs.

3. **The `free` branch renders no meta row, and `now` does.** `now` prints `.wp-board-now-meta` (`עד HH:MM`); `free` prints label + title and stops. Meanwhile `GlanceCard` prints `פנוי עד 11:45 · מסתיים ~12:45` two inches lower — it's in the owner's screenshot. The board owns a slot for the fact and leaves it empty while another card carries it.

4. **The next slot already crosses midnight, and says nothing about it.** `סוף היום` is `next`'s `else` (`Board.tsx:459`) — but `deriveNow` is handed the whole _trip's_ events and carries no date filter, so at 22:40 on day 3 the board is already showing tomorrow's 07:00 flight. `07:00` with no day token reads as this morning. See the correction below.

And one thing worth stating because it's the cheap part: `freeLabel`/`freeTitle` are read at `Board.tsx:444-445` and `HeroLift.tsx:668-669` and nowhere else (grepped). A derivation feeding both is one line at each.

## The set

Five characters, first match wins. Nothing here needs a new field, a new constant, a sensor or a guess.

| character   | what it stands on                                          | label · title                     |
| ----------- | ---------------------------------------------------------- | --------------------------------- |
| on the way  | the `בדרך` device mark (`lib/on-way.ts`)                   | `כרגע` · `בדרך`                   |
| at the stay | `travelOrigin → wokeIn` **and** clock outside `DAY_WINDOW` | `לילה` / `בוקר` · the stay's name |
| day's done  | no `next`, but the day had events                          | `היום` · `סוף היום`               |
| empty day   | the day holds no timed event at all                        | `היום` · `יום פנוי`               |
| open        | there is a `next` — the honest gap                         | `פנוי` · `זמן חופשי` · `עד HH:MM` |

Night and early morning are the **same** member. The only difference is which side of `DAY_WINDOW` you're on, and that's a statement about the clock, not about the person — which is what keeps it inside ADR-0208.

## What the render cost

Measured off the page's own DOM, 360px:

- The recommended on-the-way draw is **+0px**. Only words change.
- The night board is **+3px** — the rail (23px) comes off, the meta line goes on.
- The gap's new meta line is **17px**, in a slot that already exists.
- **Zero** new controls, so nothing to measure against ADR-0017's 44px floor.

## The forks for the owner

**1 — how `בדרך` is drawn.** Three options in §1 of the mockup:

- **א׳** the destination becomes the now point and `הבא בתור` moves on to what follows it. This is `in-transit`'s shape exactly, and it's the richest read. It costs +20px, takes the countdown tile off the screen, and pulls `אחר כך` into the second slot — which is the Day-tab competition ADR-0160 §12 forbids. If it's wanted it needs its own ADR section.
- **ב׳** `בדרך ל־BBQ Mirage` as the title. Reads best. Names the destination twice 28px apart, and `ל־` breaks agreement before a definite article.
- **ג׳ (recommended)** just `כרגע` / `בדרך`. Says only what was asserted, the destination is already sitting right below it, and the countdown doesn't move.

**2 — ~~where `הבא בתור` points when the day is done~~.** Withdrawn: it already points at tomorrow. See the correction below — what's left of it is the day token and `אחר כך`'s scope, neither of which is a fork.

## One claim this file made and then withdrew

The draft rejected option ב׳ as "ADR-0118's bidi trap". Probing the rendered title character by character — each one's own client rect, sorted right to left — says the order is fine: a Latin run at the _end_ of a Hebrew line reads LTR inside itself and doesn't disturb its neighbours. ADR-0118 is about a run in the _middle_, and there isn't one here. ב׳ is still rejected, on the two grounds that survived the check. The probe now ships as a row in the mockup's measurement table so the next reader gets the fact instead of the guess.

## Deliberately not proposed

- **No suggestions on an empty day.** `GlanceCard` is Home's "what could we do" surface (ADR-0160 §10), and a hero growing into it competes with something already shipped.
- **No `ישנים` as the night title.** That's a claim about a person and there's no sensor. What's allowed is a _place_.
- **No separate "about to leave" state.** The countdown already swaps to the leave-by (ADR-0206 §Z1); a title state would say it twice, and would turn a passed clock into a claim about a person.
- **No third slot.** All five characters fit the two slots that exist plus the meta row the branch should have been drawing anyway.

## Correction (same session) — the evening lookahead already exists

The owner asked a follow-up: _"I think that at night when the day is over (no more plans for today) the hero should also have some kind of a lookahead. Like what's coming up tomorrow. Should it be on the lifted hero? I'm not sure."_

Answering it turned up a claim above that was wrong, and it's worth recording how rather than just fixing it. The draft said `סוף היום` is `next`'s `else`, so an unplanned day at 11:00 stacks two fall-throughs. The `else` is real. The **scenario** was wrong, and reading `Board.tsx` alone is what produced it.

`deriveNow` (`lib/time.ts:312`) is handed `scheduleEvents` — the whole trip's events — and carries **no date filter**:

```ts
const future = timed.filter((e) => Date.parse(e.startsAt!) > t).sort(…);
```

So `הבא בתור` already crosses midnight, on both elevations (`heroHorizon` is passed `shownNext` itself). `סוף היום` fires only when the trip has no timed event left at all.

Proved with a throwaway `vitest` file against the real `deriveNow` and `heroHorizon` rather than by reading a second time. Six assertions, all passing — these are what the build should pin:

1. At 22:40 on day 3, `deriveNow` returns tomorrow's 07:00 flight as `next`; `now` is undefined.
2. So `next` is defined and `Board`'s `next?.title ?? endOfDay` never reaches its `??`.
3. `minsToNext` is 500 — under `MINUTES_PER_DAY`, so the countdown stays `formatCountdown` and never reaches `countdownParts`' `מחר`.
4. The lifted hero gets the same cross-day next point.
5. `אחר כך` is **empty**, because `thenAfter` filters `input.events` = `dayEvents`. Handed the whole trip, the same function finds tomorrow's second stop.
6. `dayProgress` returns exactly 1 at 23:30 and exactly 0 at 02:40 — the §2 clamp, confirmed.

The test was deleted (nothing is built for it to guard); it's listed here so the build carries it.

### So the answer to the question is better than "add a lookahead"

**It's already there, on both elevations, and it's silent about which day it's pointing at.** Three concrete gaps, none of them a new slot:

- **No day token on the next slot.** `07:00` doesn't say tomorrow. The app already ships the fix for exactly this ambiguity — `endDay` on the in-transit meta row (ADR-0160 §M: _"a red-eye landing at 06:00 reads as this morning"_), through `relativeDayLabel`. `.wp-board-next-meta` never got it.
- **`אחר כך` stops at midnight.** The one place the lift genuinely has less than it could. Same function, wider scope.
- **`סוף היום` in both slots on the trip's last day.** Two ways of saying one nothing — still open, and now the only place that phrase appears.

### And on "should it be on the lifted hero?"

Both, and ADR-0160 §1 already made the split: one object at two elevations. The collapsed board carries the **point** — it already does, it just needs the day token. The lifted hero carries the **depth** on that point — place, note, file, tasks — and it already resolves all of them for a cross-day next.

§12 isn't strained by this. No third slot, no new way in: `אחר כך` stays one quiet line, it just stops stopping at midnight. Measured at **30px** on the rendered page (§12 priced the third point at 28px; the difference is the loaded webfont, not a design change), and the lifted card goes 369px → 399px with nothing else added.

## Built (same day)

The owner said "let's build this", so ג׳ shipped as recommended. What the build added beyond the drawing, and what it changed:

- **`lib/gap-character.ts`** — the derivation plus `gapWords`, which resolves the phrase from the discriminant so the two components cannot drift (`lib/transitions.ts`' own reason for existing).
- **`BoardGapSlot`**, exported from `Board` and imported by `HeroLift` — the same path `DayRail` and `BoardCountdown` already take.
- **`NIGHT_ENDS_HOUR = 5`** in `constants.ts`, the one number this feature adds. Flagged in its own docblock as a feel call wanting a device pass on a real early start.
- **A bug the spec caught before the code shipped:** the band was one comparison (`hour < NIGHT_ENDS_HOUR`), which reads 23:30 as morning because the night wraps midnight. Morning is the narrow slice from `NIGHT_ENDS_HOUR` to the window opening.
- **A fixture bug the same suite caught:** the first Home-level tests set the UTC hour to the local one they meant, and the fixture trip is `Europe/Rome` (+2 in August) — so 22:40 landed on the following calendar day and the evening case read as `open`. The derivation was right and the test was in the wrong day.

Three deviations from the drawing, all in the ADR's build log: the live badge stays `עכשיו` except on `on-the-way` (the drawing said the same word twice, 20px apart); the stay is named by its own title, matching `.stay-strip`; and §5's `יום 3 מתוך 12` is not built, because a trip-position read is a separate question.

Green: `pnpm typecheck`, and the full unit suite at 4953 tests across 276 files, with 25 new specs.
