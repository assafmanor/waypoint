# 0141 — The pin says which transition is next there, and the row already had the word

**Status:** Accepted (design + build)
**Date:** 2026-07-30
**Refines:** [0121](0121-embedded-map-phase-6-design.md) §6 (the `.pin-tag` slot and its two amber cues gain a third content and a second hue; the ladder gains no tier), [0063](0063-category-time-behaviour-profile.md) (its transition vocabulary reaches the canvas — the sixth surface, and the first that is not a list), [0028](0028-plan-violet-color-budget-dark-ready.md)/[0105](0105-loading-states-design.md) (the amber budget: "an accent, not a ground" is what forces the second hue), [0137](0137-the-pin-says-what-happened.md) (its shape, applied to a word instead of a mark — one derivation, two renderings), [0119](0119-map-maybes-facet-is-the-shelf.md) (its "a pencil mark is stated in a **neutral** tag" is the precedent the neutral hue rests on)

Mockup: [`mockups/map-pin-phase-v1.html`](../../mockups/map-pin-phase-v1.html) — six sections, three of them measurements. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail, including the two claims the measurements refuted.

## Context

Phase 11 of the map panel's third pass (#22), and the owner's report is one sentence: the pin says the hour and nothing else. Standing in front of it you cannot tell a check-in from a check-out, or a take-off from a landing.

**Everything mechanical already existed, which is what made this a vocabulary decision.** `.pin-tag` is the element (two users: `עכשיו`, `היעד הבא`). ADR-0063's `transitionLabel`/`eventTransitionKeys` own the words and already serve the hero, the glance markers and the Index. `MAP_PIN.TAG_RISE` already reserves the room above a pin for exactly this ink.

And one of those parts is already **on this screen**, which is the fact that decided the design. `Map.tsx`'s `dayMeta` calls `eventEdgeTransition(event, usageDay.edge)`, and its result — `what` — is the **first** thing a place row's meta line says, ahead of the address and the category. So the list under the canvas reads `צ׳ק-אאוט` while the pin above it reads `היעד הבא`:

> A row's meta line says which end of a bracketed booking this is. The pin says only that something is next.

That is the same split ADR-0137 closed for outcomes, one object over — two halves of one surface making different-quality claims about one place, off a derivation that already existed on the richer side.

Three things were genuinely open, and two of them were measurements rather than opinions: the tag slot is **occupied**; the **amber budget** breaks if every booking gets one; and **tags overlap sooner than pins do** (`constants.ts` excludes the tag from the camera's horizontal inset for exactly that reason).

## Decision

### 1. The tag's content is the row's own word, and never the row's fallback

The `.pin-tag` slot holds **one** line. Its content, in order: the bracketed transition word if the place's day has one, else today's `עכשיו`/`היעד הבא`, else nothing. `pinTransition` in `lib/map-pins.ts` resolves it — a pure function beside `pinOutcome`, reading the same index the chips, the colour, the number and the row read.

It takes the transition word and **not** `dayMeta`'s `shortTitleText(event.title)` fallback, and that asymmetry is the design rather than an oversight. A title is a name, and the pin's name is already its accessible name and its `title` tooltip; a name in a ~10px pill over map tiles is unreadable, and it is not a phase. Where there is no transition word there is no phase word — see §5.

**Nothing new is derived and no new words are minted.** `CATEGORY_TIME_PROFILE` + `ICON_TRANSITION_KEYS` are the source, so a flight reads `המראה`/`נחיתה`, a train `יציאה`/`הגעה`, a stay `צ׳ק-אין`/`צ׳ק-אאוט` — and adding a mode with distinct wording stays one line in `ICON_TRANSITION_KEYS`, as ADR-0063's amendment promised.

### 2. Which end it names IS the pre/during distinction, so there is no prefix

The owner asked for "pre/during flight, pre/during check-in and check-out". The transition word already carries it, because a bracketed event's two ends are two different moments at two different times:

| you are                          | the word   |
| -------------------------------- | ---------- |
| heading to a stay                | `צ׳ק-אין`  |
| inside the stay, on its last day | `צ׳ק-אאוט` |
| at the airport, not yet boarded  | `המראה`    |
| in the air                       | `נחיתה`    |

`צ׳ק-אין` **is** "the check-in hasn't happened"; `צ׳ק-אאוט` **is** "you're in, and the exit is what's ahead". A `לפני` prefix would restate what the word says, and the mockup priced it: **+39%** tag width at every pin size, on the one axis that collides (§A). Rejected with a number rather than an argument.

This falls out of `DayUsage.edge` with no new logic: a check-in day carries `edge: 'start'`, a check-out day `edge: 'end'`, and a strictly-middle stay night carries **neither** — so a mid-span night is silent by construction, exactly as the row is silent there.

### 3. Two hues, one geometry — and the neutral one is what lets the population grow

Amber cannot be the tag's only hue. It is the accent ADR-0105 refused to make a ground, and ADR-0137 §3 had already paid a full render for the same mistake in another coat ("the tokens were right and the **amount** was not"). The mockup's §C draws it: five amber tags against one.

- **The amber tag is the population it already was** — the one `nowStop`, the one `nextStop`, Trip mode only, never on an aside tier. It now says something more specific. **The budget does not move at all.**
- **Every other phase tag is neutral**: `--muted` ink, `--line` border, same card ground, same geometry. Amber is what a **live** claim costs; a check-out three hours out is a fact about the plan.

The precedent is ADR-0119's, verbatim one surface over: a day a place was only **pencilled** into is stated in a neutral tag "because amber is time & commitment". A planned edge is the same kind of claim. No new hue is spent, and no amount of neutral tags spends the amber budget.

### 4. The neutral tag is DAY-SCOPED, and the mockup is what narrowed it

The design that walked into §B2 rationed by vocabulary: `bracketed` is 2 of ADR-0063's 9 categories, so a day of nine stops has at most a handful of edges and the rest are ineligible. **That is true of one day and false of a whole trip**, and the measurement said so: in all-days scope every stay's two ends and every flight across nine days are on the canvas at once — 9 tag-to-tag collisions and one tag off the frame, at both 360 and 390.

So the neutral tag **exists in day scope only**, which is not a display patch but the narrowing [ADR-0121 §6](0121-embedded-map-phase-6-design.md) already made for the **number** in session 146, for a reason that transfers exactly. All-days there is nothing on the pin saying which day the word belongs to, so two hotels from two different days both read `צ׳ק-אין` — the same ambiguity that killed all-days renumbering ("two pins both reading `1` on one canvas, with nothing on either saying which day it belongs to"). The density is the proof, not the argument. And it is not a loss for the same reason it was not one there: an all-days **row** states its day in words (`relativeDayLabel`, ADR-0085) exactly where the pin cannot.

**An amber pin is exempt and keeps its word in every scope**, and not as a courtesy: the ambiguity the gate exists to prevent cannot arise on it. It is by definition the one place that is happening now or next, so there is no question which day its word belongs to — and a live claim is about the clock, never about which day you happen to be looking at. So all-days shows exactly one phase word, on the pin that is the answer to "what now".

Measured, day-scoped, at 40px pins: the changing day is **0 collisions** at both widths; a deliberately heavy day (five bracketed edges in one district — two flights, a train, two stays) is **0** tag-to-tag at both widths. All-days drops to the one amber tag. §B1's threshold says why: the widest pair needs a 65px gap at a 40px pin (1.64× pin height) and **five such tags fit across 360** before touching, so the day-scoped ceiling sits at the width's ceiling rather than past it.

### 5. Silence everywhere else, and each silence is a consequence rather than a rule

- **`behind`** — the transition happened. A word that names a moment now past is a lie, and that tier's one badge is already spent on the outcome (ADR-0137 §2).
- **`ambient` mid-span, day-scoped** — `edge` is undefined on a strictly-middle night, so there is nothing to name and the pin is silent exactly as the row is. All-days is where the two could have diverged, and §7 is why they do not: `placeMetaDay` walks a mid-span night to the stay's next **edge**, so a mid-stay hotel that is the live pin says `צ׳ק-אאוט` there, which is the word its row says.
- **`ghost` / `shelf` / `idea`** — no tag today and none now: an aside pin is not what you are looking at, and ADR-0130 §3's whole mechanism is that a subordinate rung stays subordinate.
- **A restaurant reservation** — and this is the owner's third named case, answered with **no change, on purpose.** A reservation has one moment, not two ends, so `CATEGORY_TIME_PROFILE` gives `food` no transition keys at all. Its phase genuinely is "coming up", which is what the amber `היעד הבא` already says. The vocabulary being closed at 2 of 9 categories is not a gap here — it is the thing that keeps the canvas from filling up, decided long before this phase.
- **The dot tier** needs no new entry: `map-pane.css` already hides `.pin-tag` on non-amber pins at `data-pins='dot'`, so the zoom backstop is shipped.

**Plan mode keeps the neutral tag.** Both amber cues are Trip-only (a live "now" says nothing while you are arranging), but a check-out is a fact about the **plan**, and a day you are rearranging is exactly where knowing which end is which pays. The same reading ADR-0137 §4 applied to ghosts: it is about the plan, whichever mode you are in.

### 6. What replaces the word that left: the dot, which the row already has

Moving the transition word into the slot takes `עכשיו` and `היעד הבא` off the screen, and they were carrying a distinction the paint does not: `.map-pin.nowstop` differs from `.nextstop` by **4.4%** of pin height in ring spread and 6% in alpha, and the **pulse** that actually separates them is killed globally by `prefers-reduced-motion` (`App.css`, `!important`). `map-pane.css` says the resting state must carry the cue — it does carry _an_ amber cue, it just never had to distinguish the two, because the words did.

So the tag gains a **leading amber dot when the pin is live**. This is not an invention and not scope creep — it is the debt the replacement incurs, paid with the object already shipped for it: `.map-tag.now::before`, the row's own dot, itself Home's board blip (`.wp-board-live .blip`). `map.css` already claims the idiom is "one idiom, three surfaces"; the canvas's share of it was the pulse, and now it is the pulse **and** the dot, solid at rest with the ring layered on by the animation.

Three carriers, one fact, exactly as ADR-0137 §3 arranged it for the outcome: the dot, the pulse, and the accessible name — which composes the words back in full (`שם · עכשיו · צ׳ק-אאוט`), so nothing that was readable is now only visible.

### 7. Which day the word reports on

The one place this could go quietly wrong, so it is stated — and the answer differs from ADR-0137 §5's on purpose.

**The word reads `placeMetaDay`, the same day the row's meta line describes**, not `placeDay`. ADR-0137 chose `placeDay` so the grey and the mark could not describe two different days; here the requirement is the opposite and stronger: the pin's word and the row's word must be the **same word**, and `placeMetaDay` is the function whose docstring is "the day a row's `<what happens here>` line describes". The two differ in exactly one case — all-days, on an ambient night, where `placeMetaDay` walks to the stay's next edge — and that case is the one where a pin reading nothing while its row reads `צ׳ק-אאוט` would be the defect this ADR exists to remove.

The tier gate (§5) is still resolved with `placePinTier`, so a `behind` pin is silent whichever day the wording function would have picked.

## Consequences

- **The canvas and the list say the same word about a place**, off one call to one resolver — the outcome half of this was ADR-0137, and this is the wording half.
- **ADR-0063's vocabulary reaches its sixth surface, and its first non-list one.** A new bracketed category, or a transport mode with its own wording, now lands on the canvas for free too.
- **The amber population is unchanged.** Two pins carry amber before this change and two after; what grew is the neutral population, which the budget does not meter.
- **The hotel-changing day, viewed ahead of time, is answered** — the follow-up hanging off Phase 4, now pruned from the backlog. Two same-hue, same-glyph, same-tier pins that differed only by a chronological number now read `צ׳ק-אאוט` and `צ׳ק-אין`, with none of the three things that item ruled out: no lock returning to the shoulder, no glyph slot spent, no hue off the budget. And the live day still works the way that item described — the arriving stay's tag goes amber, the departed one drops to `behind` and loses the tag entirely.
- **A number in `constants.ts` is corrected as a side effect.** Its `INK_REACH` note reports the amber tag reaching **1.10×** the pin's height per side, measured on `התחנה הבאה` — copy the app does not ship. Measured on the shipped `היעד הבא` it is **0.88×**, and the widest transition word (`צ׳ק-אאוט`) is **0.90×** — 102% of today's, i.e. the same width in practice. So **the camera's horizontal inset does not move**, and the exclusion it documents stays correct on a number that is now the one the app renders.
- **One residual cost, and it is the device pass's** — a neutral tag can sit on top of a **neighbouring** pin's body, which is worse than two tags touching because it hides a pin. On the deliberately heavy day it happens 3 times across 360+390. What orders it is the ladder: the tag lives inside the marker, so `pinZIndex` carries it, and "the one that matters most is the one you can see and tap" (ADR-0121 §6) still holds. The changing day and every ordinary day measure zero. Flagged rather than smuggled — the fallback, if a real district reads badly, is `title`-only for the subordinate rungs of a day's edges.
- **No schema change, no new tier, no new hue, no new words.** One optional field on `MapPin`, one pure function, two CSS rules.
- **The animations stay deferred.** The owner's "next phase maybe small cute specific animations" is its own call under design-language's reduced-motion rule, and session 189's motion brief now owns it. The dot in §6 is not that work: it is a **resting** mark that exists precisely so the canvas stops depending on motion.

## Alternatives considered

- **Two stacked tags** — `עכשיו` above, `צ׳ק-אאוט` below. Doubles the collision axis §B measured, and pushes amber past the room `TAG_RISE` reserves. The same conclusion ADR-0137 §2 reached about the shoulder: one slot, not a pair. Drawn in the mockup's §F.
- **A `לפני` prefix for the pre phase** (`לפני צ׳ק-אאוט`). +39% tag width, on the colliding axis, to restate what §2 shows the word already says. Drawn and measured.
- **A filled amber tag** to separate "during" from "pre" in the paint instead of the dot. Rejected twice before on this canvas: `map-pane.css` states the pin's tag is amber **ink** on a card ground and not a fill, and a filled amber pill was `map-embedded-v1.html`'s own first-pass mistake. Drawn.
- **Returning the 🔒 to the pin** to say a reservation is a commitment. ADR-0121 §6 removed it to free that corner for the number, and ADR-0137 then spent the same slot on the outcome. The row keeps the lock.
- **A countdown in the tag** (`בעוד 40 ד׳`). That is the hour again rather than the phase, and it would be the only text on a pin that the **clock** rewrites — on a surface whose whole marker design exists so a per-second tick reconciles to a no-op diff (ADR-0121 §4/§6).
- **Rationing by vocabulary alone, in every scope** (this ADR's own first pass). Refuted by its own mockup in §B2 — see §4. Kept as an arm in the file so the refutation stays reproducible rather than described.
- **Rationing by hard/soft** — a tag only on `hard` commitments. Amber is time **and** commitment (ADR-0028), so it is on-budget, but it cuts the wrong set: a manually-added `lodging` event with no booking still has a check-in, and ADR-0063 §4 exists precisely so the behaviour follows the semantic type rather than the presence of a Booking.
- **The tag replaces `עכשיו`/`היעד הבא` with no replacement carrier.** Cheapest, and it silently costs reduced-motion users the "am I here or heading there" distinction — §D draws that specimen next to the dot so the loss is visible rather than argued.

## Build log

- **A design session's own measurement can flatter it, and this one did twice.** §B2's first scenes were laid out across the frame and returned **zero** collisions under every arm including "tag every booking" — a result about the layout, not about the design. Redrawn as a genuine district (pins inside one pin-height of a neighbour), the same arm returns 4. And the first pass counted only tag-to-tag intersections, which said nothing about the failure the redraw made obvious: a tag sitting on the **neighbouring pin**. Both are now columns in the table.
- **A measurement taken during a CSS transition is the same class of lie as a selector matching nothing.** `.map-pin` ships `transition: --pin-u var(--t-base)`, so §A's table at the 56px stop came back with the 34px stop's numbers — every read was one stop behind, and the ratios looked reassuringly size-invariant for the wrong reason. The transition is cut inside measured stages, as a labelled mockup-only override. `map-place-becomes-v1.html` recorded this exact trap about the sheet; it is worth knowing that it applies to the **pins** too.
- **Verify a derivation in both directions or it is an assertion.** §B1 derives the clearance threshold from two measured tag widths, then renders at threshold+2 (must clear) and threshold−6 (must clash) and reads both back. The first version rendered at exactly the threshold, where the two boxes abut and `a.left < b.right` on subpixel rects is a coin toss — it reported "still touching" for two of three pairs and nothing was wrong with the derivation.
