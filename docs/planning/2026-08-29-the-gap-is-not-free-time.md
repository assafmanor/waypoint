# The gap is not free time — a brainstorm on what the hero says when nothing is running

**Date:** 2026-08-29
**Mockup:** [`mockups/the-gap-is-not-free-time-v1.html`](../../mockups/the-gap-is-not-free-time-v1.html)
**Status:** brainstormed and drawn. Nothing built, no ADR yet — §1 and §5 have real forks and they're the owner's to call.

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

4. **The same disease is in the next slot.** `סוף היום` is `next`'s `else` (`Board.tsx:459`), so a day with nothing planned at 11:00 reads `זמן חופשי` over `סוף היום` — two fall-throughs stacked, the second announcing the end of a day that hasn't happened.

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

**2 — where `הבא בתור` points when the day is done.** At 22:40 the useful read is tomorrow's first thing (and by extension when you'd have to be up). Against it: ADR-0160 §12. The slot isn't new, it's just aimed at another day — so it's a real fork rather than an expansion.

## One claim this file made and then withdrew

The draft rejected option ב׳ as "ADR-0118's bidi trap". Probing the rendered title character by character — each one's own client rect, sorted right to left — says the order is fine: a Latin run at the _end_ of a Hebrew line reads LTR inside itself and doesn't disturb its neighbours. ADR-0118 is about a run in the _middle_, and there isn't one here. ב׳ is still rejected, on the two grounds that survived the check. The probe now ships as a row in the mockup's measurement table so the next reader gets the fact instead of the guess.

## Deliberately not proposed

- **No suggestions on an empty day.** `GlanceCard` is Home's "what could we do" surface (ADR-0160 §10), and a hero growing into it competes with something already shipped.
- **No `ישנים` as the night title.** That's a claim about a person and there's no sensor. What's allowed is a _place_.
- **No separate "about to leave" state.** The countdown already swaps to the leave-by (ADR-0206 §Z1); a title state would say it twice, and would turn a passed clock into a claim about a person.
- **No third slot.** All five characters fit the two slots that exist plus the meta row the branch should have been drawing anyway.
