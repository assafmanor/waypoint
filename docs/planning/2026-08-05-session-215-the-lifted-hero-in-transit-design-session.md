# Session 215 — the lifted hero in transit (design session)

**Date:** 2026-08-05 · **Mockup:** [`mockups/hero-in-transit-v1.html`](../../mockups/hero-in-transit-v1.html) · **Amends when built:** [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) §10, [ADR-0059](../decisions/0059-booking-presentation-on-home-and-index.md) §2 · **Status:** designed and BUILT in the same session — the owner accepted every recommendation, and the shipped behaviour is recorded in those two ADR amendments. This note keeps the reports, the measurements and the options that were rejected.

## What came in

Four reports from the owner off a real device, mid-flight (FRA → TLV, 20:36, landing 22:15), against the hero ADR-0160 shipped days earlier:

1. `ניווט` was pushed to a new line, "this shouldn't happen".
2. The line below is confusing — "users may think that it relates to the next event instead of the currently happening flight".
3. "The least we can do is give the expanded hero more transit info such as estimated time till arrival."
4. "The hero for in flight **not expanded** looks different and better in my opinion, so we should think how to build on it."

Plus two widenings, same session: **the same must hold for a train, a bus, a ferry — but not for a rental car, which is a different thing**, and one content idea: say the clock jump in words (`מזיזים את השעון שעה קדימה`), "endless possibilities".

## The finding that made it one bug

Reports 2 and 4 are the same defect, and it is structural: **`HeroLift` has no `in-transit` variant.** Read against the code —

- the head prints `t.common.now` (`עכשיו`) with the amber blip; the collapsed board prints `t.board.inTransitLive` (`בטיסה`) with the teal one;
- the lead point prints the ordinary now-grammar (`קשיח` + `עד 22:15`); the collapsed board prints `כרגע · בדרך` + a teal `נחיתה` chip;
- `Home.tsx` passes `TransitProgress` as `foot`, and the foot is pinned at the bottom of the card — **below** the `הבא בתור` block.

So the lifted state is a generic hard now-event with the flight's own rail orphaned under someone else's heading. Report 2 is what that misplacement reads as on a phone; report 4 is the owner noticing that the promotion threw away grammar the collapsed state kept. The fix is therefore not new grammar — it is ADR-0160's own thesis (one object, one elevation up) applied to the variant that missed it.

## What measurement changed

- **The `ניווט` wrap is not a near miss, and not about that button.** `.hero-row` is `flex-wrap: wrap`, and flex line-breaking uses each item's _hypothetical_ size — the decision is made before `flex-shrink` runs, so the name's `min-width: 0` and `text-overflow: ellipsis` are unreachable code in that row. Measured: the name wants **247px**, the two chips **153px** (77 + 68 + 8), the row has **308px** (360px phone) / **338px** (390px) — 70–100px short. The failure also looks like two different bugs by width: at 390px the name and `במפה` share line 1 and `ניווט` drops alone (row 76px); at 360px the name takes line 1 and **both** chips drop (row 62px). `להזמנה` is a separate `hero-part` on top of that, so the screenshot's three stacked chip lines are two defects.
- **The same measurement hands you the answer:** the three chips _together_ are 247px against 308px, so one action row under the name fits the small phone with 61px spare.
- **The rail's distance from its subject:** 258px below the route as shipped, 36px when it moves inside the point.
- **The rail prints `22:15` twice.** `showCountdown` puts `עד 22:15` in the middle of `.tp-ends` while the end slot already prints `22:15`. The middle is the only place on that rail that can say something the ends cannot.
- **Fit:** the whole recommended composition is **590px** — 71% of the 826px a 390×844 leaves, 32px inside a 360×640's 622px. Nothing proposed turns the content-sized hero (ADR-0160 §8) into a scroller.
- **A note about the measuring, not the measured:** the first wrap detector grouped a row's children by rounded `top`, which counts a 15px name beside a 34px chip as two lines — it reported 3 lines where there were 2, and 2 where there was 1. Items on one flex line share a line _box_, not a top edge. The wrong version's note is kept in the mockup's script, because it is the same class of error as the finding above: reasoning about a flex row is unreliable, including when the reasoning is the measurement.

## Two defects nobody reported

- **`בטיסה` and the plane are hardcoded.** `t.board.inTransitLive` is a literal and `TransitProgress` renders `Icon name="flight"` for every mode — but `in-transit` fires for any bracketed transport whose clock is between its ends, so a **train reads `בטיסה` with a plane crossing its rail**, and a **same-day car hire** reaches the same state (a multi-day one is ambient and goes to the stay strip). This is ADR-0163 §4's bug one surface over: the verb and the unit belong to the span's own mode. The fix needs no new table and no new SVG — the travelling mark is the event's **own glyph** (the board already holds it as `nowIcon`; the app has no `train`/`bus` icon anyway, and the user may re-badge), and the live word comes off the same `ICON_TIME_PROFILE` that already gives a flight `המראה`/`נחיתה` and a hire `איסוף הרכב`/`החזרת הרכב`.
- **`איפה` points backwards in transit.** It resolves to the flight's _own_ place — the airport you took off from — so today's lifted hero offers `ניווט` to where you left. Mid-journey the only useful pin is the destination.

## What was recommended, and accepted

| §   | subject                        | recommendation                                                                                                                               |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | the wrapping `איפה` row        | **ג׳** — name on its own line, one action row of `במפה`/`ניווט`/`להזמנה`                                                                     |
| 2   | the orphaned rail              | **א׳** — the rail moves inside the flight's point; the foot is for what belongs to the whole card                                            |
| 3   | transit depth                  | the rail's middle slot says `נותרו X` (free, helps the collapsed board), and the lifted meta row carries `· בעוד 1:39 שע׳`                   |
| 3   | the clock, in words            | **ב׳** — `מזיזים את השעון שעה קדימה` + the destination's clock now, **in the lift only**; the pill stays on the collapsed board              |
| 4   | building on the collapsed hero | the lifted in-transit hero is the collapsed one **plus** depth, in that order                                                                |
| 5   | modes                          | glyph + profile-keyed word for flight/train/bus/ferry; a same-day hire leaves the journey grammar for a held resource with a return deadline |

Every fact proposed is derived from `startsAt`/`endsAt` and the two ends' zones — **no network**. Gate, seat, baggage belt, delay, route, weather are marked OUT rather than deferred: they are not in `bookingSchema` or they need a live feed, and a hero that quietly needs the network is the one surface that lies on a plane (rule 5).

Two build constraints worth carrying forward: the clock sentence is **direction-signed** (`+` is `קדימה`, `−` is `אחורה`, and getting it backwards is worse than the pill it replaces), and a **fractional** zone has no hour word, so it falls back to the ladder's `2:30 שע׳` inside the same sentence rather than inventing `וחצי`.

## Left open on purpose

`הבא בתור`'s countdown counts from the clock, so mid-flight it counts **through** the landing, when the traveller's question is "how long after we land". That is a decision about what the board's countdown _means_ — possibly per variant — not a layout change to this hero, so it is recorded in `backlog.md` rather than answered here.

## Built (same session)

All seven changes shipped, smallest-first, each with its own commit: the rail's middle slot (`נותרו X`, which also fixed the collapsed board); `midSpan` on the shared time profile, so the live word and the travelling mark come from the mode; `איפה` as a name line plus one action row; the lifted hero's in-transit grammar with the rail inside the point and an empty foot; the destination as `איפה` mid-journey; the clock sentence plus the destination's clock; and the held-resource shape for a same-day hire. Gate, seat, belt, delay and weather stayed out.

Two things the build itself taught, both recorded in ADR-0160's amendment: the glyph is load-bearing (wording resolves per mode off the event's icon, so a fixture without one is a generic carrier — which is the correct answer for a manual transport event, and is now asserted as such), and the first wrap detector in the mockup was wrong in the same way the CSS was, by grouping a flex row's children by top edge instead of by line box.

## Two follow-ups the shipped hero earned

Both from the owner, on the built surface, and both recorded where they belong rather than here: a journey that crosses midnight is still happening (ADR-0054's session-215 amendment for the cause, ADR-0160 §R for the consequence), and — unblocked by the red-eye fixture that fix produced — the **arrival day** beside the arrival time, on the owner's answer that the day and the countdown are both wanted because they answer different questions (ADR-0160 §M's last bullet).
