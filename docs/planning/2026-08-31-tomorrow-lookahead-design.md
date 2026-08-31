# What Home says about tomorrow when today is done — five options and a recommendation

**Date:** 2026-08-31
**Mockup:** [`mockups/tomorrow-lookahead-v1.html`](../../mockups/tomorrow-lookahead-v1.html)
**Status:** drawn, rendered and measured; **nothing decided and nothing built** — this note exists so
the owner can pick. It answers the ask with one recommendation (א׳ + ב׳ on the board, ו׳ in the lift)
and four rejections, each with a reason a future reader could not recover from the diff.
**Reads:** [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) (the lift, §4/§5/§8/§12/§M/§C),
[ADR-0211](../decisions/0211-a-gap-has-a-character.md) (the gap's five characters, §3/§4/§6),
[ADR-0064](../decisions/0064-day-transition-entries-and-home-band-trim.md) (the Home band trim),
[ADR-0209](../decisions/0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) (a stay is named once),
[ADR-0045](../decisions/0045-trip-home-real-data-only.md) (real data only),
[ADR-0050](../decisions/0050-home-quick-access-deep-links-and-empty-states.md) (the quick tiles' deep links).

## What was asked

> adding some "tomorrow lookahead" for the home screen when during the trip, after all of the day's
> planned events and bookings are done. What I mean is, after the day is over, users might want to
> see what's planned for tomorrow, and I feel like if they opened the app and instantly got the idea
> at a glance of where they're headed, what's planned, it would be perfect. I'm not sure what's the
> design. I want something fresh, interesting, quick (but maybe could be interacted for more info).
> The natural choice is the hero, and maybe that's the direction we should go for, but we should
> explore more options and get creative here.

and, in a second message: **"It should also look friendly and inviting of course."**

## The finding the whole thing turns on

**The lookahead already exists, and it already says `מחר`.** `deriveNow` (`lib/time.ts:312`) carries
no date filter, so at ⁦22:40⁩ on a finished day `הבא בתור` is already tomorrow's ⁦07:12⁩ train, and
since ADR-0211 §6 `BoardNext.day` prints `מחר` beside the time it qualifies. ADR-0211 had to
withdraw this same claim once already — its own first draft, a session note, a backlog line and a
PR description all said the lookahead was missing, and a throwaway `vitest` against the real
derivations is what disproved it.

So the ask is not "add a lookahead". It is: **the lookahead is a POINT, and what is missing is a
SHAPE** — how full tomorrow is, when it really starts, and where you end up. Everything drawn is
measured against that baseline (§1 of the mockup), not against a blank board.

## Four more things the probe and the render turned up

Same method as ADR-0211 §6: a throwaway `vitest` against the shipped derivations rather than a
second reading. Deleted before the commit; the assertions are listed here so a build can pin them.

1. **The day rail is still measuring a day that is over.** `gapDrawsDayRail('day-done')` returns
   `true`, so at ⁦22:40⁩ the board draws a knob at ~⁦98%⁩ under the word `עכשיו`. ADR-0211 §4 took the
   rail off for `at-the-stay` and `empty-day` on exactly this reasoning ("absence beats a pinned
   lie") and nobody asked `day-done`. That is the slot the recommendation spends.

2. **Tomorrow already derives, with no new field anywhere.**
   `buildDayGlance(events, tomorrow, …)` answers ⁦3⁩ segments · ⁦3⁩ anchors · `remaining ⁦5⁩` · window
   ⁦07:00–23:00⁩ · **`nowFrac: null`** (it already knows a future day has no now), and
   `dayBookendStays(events, tomorrow)` answers `{woke: Ryokan Yoshida, sleeps: Hotel Kanra}`. A
   lookahead is one new derivation CALL, not one new field, and nothing here needs the backend.

3. **`glance.empty` is the wrong emptiness test for a lookahead.** A tomorrow nobody has planned, on
   a trip with a hotel booked, probes as `empty: false · segs: 0 · anchors: 2 · remaining: 2` — the
   stay's own two edges. Gate an empty state on `glance.empty` and you draw a rail with no blocks
   under the words `⁦2⁩ נותרו היום` about a day nobody has filled in. The test is `segs.length === 0`.

4. **A third slot is still missing the day token, and drawing §3 is what found it.** `heroTravel`
   hangs off `horizon.next`, which crosses midnight, so the lifted hero's journey line prints
   `t.travel.leaveAt` = `צאו ב־06:40` (`i18n/he.ts:2030`) — a bare clock, ⁦40px⁩ under a meta row
   that says `07:12 · מחר`. One card, two clocks, one of them qualified. ADR-0160 §M named this
   ambiguity ("a red-eye landing at ⁦06:00⁩ reads as this morning") and fixed it for the landing;
   ADR-0211 §6 then fixed it for `הבא בתור`. This is the same shape a third time, and it is a COPY
   change — one argument, no new mechanism.

## The five options, and what each costs

Measured at ⁦360×640⁩, light, on a ⁦273px⁩ baseline board. Body room is ⁦497px⁩ (⁦640⁩ − ⁦72px⁩ chrome
− ⁦71px⁩ nav), which is why "above the fold" is a number here and not an opinion.

|                    | what it is                                                                                                     | cost                                                             | verdict                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| **א׳ הסרט של מחר** | the day rail's own tree (track · three-slot ends) with **tomorrow's** data in it, in the slot the rail vacates | ⁦+30px⁩ plain, ⁦+50px⁩ with the events' emoji; zero new surfaces | **recommended**          |
| **ב׳ לוח הלילה**   | the title slot stops saying `סוף היום` and says where you are tonight                                          | ⁦+20px⁩, **zero new CSS**                                        | **recommended, with א׳** |
| **ג׳ מחר במבט**    | the shipped `GlanceCard`, re-derived for tomorrow                                                              | cheapest reuse — and lands ⁦212px⁩ **below the fold**            | rejected                 |
| **ד׳ הלוח מתהפך**  | the board flips to a tomorrow face                                                                             | collides with the lift three ways                                | rejected                 |
| **ה׳ שורה אחת**    | one warm sentence in a band under the board                                                                    | ⁦37px⁩ band, the friendliest words                               | rejected as a band       |
| **ו׳ העומק**       | the lift's foot carries the ribbon + `ליום של מחר`                                                             | ⁦617px⁩ against a ⁦622px⁩ cap                                    | **recommended**          |

### Why א׳ is the answer, in one paragraph

The board's two slots already answer "what now" and "what next". What neither can answer is "what
KIND of day is tomorrow", because a point is a title and a time and a shape is not. The rail at the
board's foot is the app's existing organ for exactly that question — proportional occupancy on a
⁦07:00–23:00⁩ window — and on a finished day it is measuring nothing. So the recommendation is not a
new component: it is the same element, with tomorrow's `buildDayGlance` in it. It reads as
**friendly** for one reason worth naming: the marks over the track are the events' own emoji, which
are content the group chose (design-language: _"emoji are content, icons are UI"_), so the one
channel on that surface that is not amber is the trip's own voice.

**And the ribbon deliberately does not NAME tomorrow's first thing** — `הבא בתור` already does,
⁦40px⁩ higher. It points at it with a hollow ring instead. Naming it twice is the duplication
ADR-0211 rejected for `בדרך ל־X` (the destination twice, ⁦28px⁩ apart), one slot down.

### Why the other four are rejected

- **ג׳** is the cheapest reuse in the file and that is not the problem: the card sits two section
  headings below the board and is **⁦212px⁩ under the fold at ⁦360×640⁩** (⁦8px⁩ at ⁦390×844⁩) — against
  an ask whose words are _"opened the app and instantly got the idea at a glance"_. Two further
  traps, both probed: the lead word is `נותרו היום`, i.e. the COPY is date-bound and not just the
  now-marker; and the empty test is `segs.length === 0`, per finding 3.
- **ד׳** collides with the lift three ways, none of them taste: the board's tap already belongs to
  the promotion (ADR-0160 §1); a rotated box breaks the FLIP's origin measurement, since
  `getBoundingClientRect` on a rotated element is the rotation's bounding box and `useLiftFlight`
  measures exactly that; and under `prefers-reduced-motion` a flip has no form — it degrades to a
  face swap, i.e. an overlay. What it does prove is that a full-board tomorrow is worth having, and
  the lift is where that already exists.
- **ה׳** is `.stay-strip` at a second density in amber, and it is the friendliest wording of the
  five. It is rejected as a **band**: ADR-0064 removed a band of exactly this shape from exactly
  this position, with the argument that Home does not need a fourth always-on strip competing with
  what-now/what-next. Its sentence survives inside the ribbon's head row.
- **A tomorrow tile in the quick-access grid** (not drawn as a frame): ADR-0050's tiles are
  deep-links to data that exists, and "tomorrow" is a day rather than a datum; it would also be the
  fifth tile in a grid whose column count is derived from the visible count.

## Two things the drawing had to fix about itself

Both are in the mockup's notes panel, and both were invisible until something was rendered.

- **The bed is named only when it CHANGES.** Drawn first as an always-on `לינה · X` in the ribbon's
  middle slot; on an ordinary tomorrow at the same hotel, the render showed one ryokan printed three
  times on one screen (the stay strip, the WiFi tile, the ribbon). That is the duplication ADR-0209
  removed, and its fix was a subtraction, so this one is too.
- **The file broke the rule it cites.** ד׳'s back face was drawn as `.tl-flip-face.back`, and
  `.back` is a GLOBAL class in the app (`App.css:1012` — the ⁦34×34⁩ chrome back button,
  `display: grid`), so the face rendered at ⁦36px⁩ beside a ⁦273px⁩ front. That is ADR-0160 §C's own
  defect, and its own remedy applies: `data-face`, an attribute, cannot collide with a class.

## The forks for the owner

1. **The recommendation as a whole** — א׳ + ב׳ + ו׳, or א׳ alone? ב׳ costs no CSS and makes the
   night board say something true instead of `סוף היום`, but it is a change to a shipped character
   set (`gapCharacter`'s order), so it is a decision and not a tune.
2. **The ribbon's character** — plain marks (⁦53px⁩) or the events' own emoji (⁦73px⁩)? The default in
   the file is emoji, because that is the answer to "friendly and inviting"; ⁦20px⁩ is the price.
3. **The `מוקדם` tag.** It stands on tomorrow's first leave-by being before a new constant
   (`EARLY_START_HOUR`), which is a claim about the clock and therefore inside ADR-0208. It is the
   one genuinely NEW fact in the drawing, and the one most likely to be judged noise.
4. **`עצירות` as the count's noun** — `⁦5⁩ עצירות`, or `דברים`, or no count at all (the ribbon shows
   the blocks; the number may be redundant).
5. **`סוף הטיול` for the trip's last night**, which is the open backlog line: the second slot stops
   saying `סוף היום` a second time. New copy key, no CSS.
6. **Whether the day token joins the travel line** (finding 4). Independent of everything above and
   worth doing regardless of which option is picked.

## Deliberately not proposed

- **Weather.** The first instinct for a lookahead card, and the app has no weather pipe; ADR-0045
  makes Home real-data-only, and ADR-0180 §4 already records that weather returns "as its own glance
  card" when a pipe lands. A tomorrow ribbon must not become the reason to fake one.
- **Suggestions on an empty tomorrow.** ADR-0211 §8's rule, unchanged: `GlanceCard` is Home's "what
  could we do" surface, and a hero growing into it competes with something shipped. The empty arm is
  a readout plus, one elevation up, a hand-off to the day the group would fill in.
- **A tappable ribbon on the collapsed board.** The board is a `<button>` and ADR-0160 §4 is the
  record of what a nested one does to it — Chrome closes the board at the inner button and reparents
  everything after it (⁦1 of 4⁩ children left inside, measured). The way in lives in the lift, which
  is not a button. This is the same split `ועוד N עכשיו` already took: a readout below, the rows
  above.
- **Plan mode.** The parallel question there is "is the trip ready", which is `PlanHome`'s readiness
  hero (ADR-0193). Nothing here touches it.
