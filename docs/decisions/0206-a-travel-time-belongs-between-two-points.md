# 0206 — A travel time belongs **between** two points, and the day owes you the truth about it

**Status:** **Accepted 2026-08-25** on the owner's M0 answers, and **amended by them** — read §Z before §M1 or §V1.6, which both changed. **Built so far:** the arithmetic (M2), the map's polyline and how it reads (§AB–§AD, M7/M7b/M7c), and **§V1.2 + §Z1 — the hero read and the board's countdown swap (§AE, M6b, 2026-08-26)**. §V1.1/§V1.3/§V1.4's day row is M6a's and is not built. **Nothing here ships without a mockup** (§M).
**Date:** 2026-08-24
**Companion:** [ADR-0205](0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) decides where a route comes from. This one decides **what it says, what v1 answers, and what v2 waits for.**
**Research:** [`planning/2026-08-24-routes-and-travel-time-what-is-actually-possible.md`](../planning/2026-08-24-routes-and-travel-time-what-is-actually-possible.md)
**Plan:** [`planning/2026-08-24-routes-epic-milestone-board.md`](../planning/2026-08-24-routes-epic-milestone-board.md)

**Corrects** [0159](0159-the-day-says-what-is-between-two-events.md) §1 — `פנוי · 2:40 שע׳` counts travel as free time, and has since it shipped.
**Extends** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) (§D2 answers its §U0 rule rather than spending it), [0121](0121-embedded-map-phase-6-design.md) §10 / `DayConnector` (its reserved **solid + amber** is spent here), [0114](0114-elapsed-duration-ladder.md) (one duration ladder, a second reader), [0151](0151-a-suggestion-has-a-source-and-a-reason.md) (`near-the-day` gains a better metric).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (a travel time **never** moves a hard event, and never moves anything in v1 — it is a read), [0017](0017-mobile-first-device-targets.md), [0028](0028-plan-violet-color-budget-dark-ready.md) / root rule 4 (no new hue), [0158](0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md).

## Context

`CLAUDE.md` says what this app is for: _"what now / what next / what do I need in the next 30
minutes."_ The third question has never been answered, because answering it needs one number the app
does not have — **how long it takes to get to the next thing.** ADR-0205 makes that number
available. This decides what to do with it.

**And one thing the app says today is wrong.** ADR-0159 §1 renders a gap as `פנוי · 2:40 שע׳`. If
forty of those minutes are the walk to the next stop, the app is telling you about time you do not
have — on the surface that exists precisely to be a **statement** rather than an affordance, in an
ADR whose own words are _"a statement has to be a measurement"_. That is not a missing feature. It
is a correction, and it is why §V1.1 is first.

## Decision

### D1–D10. The principles, before the list

Every feature below is measured against these, and a design session that wants to break one needs a
reason in writing.

**D1. A travel time is time, so it is amber.** Root rule 4, and `DayConnector`'s own comment already
reserved the grammar: _"Dashed because a straight segment is not the route you will walk — drawing
it solid would claim it is — which also leaves **solid + amber** unspent for a real Routes polyline
later."_ This is what spends it. **No new hue is minted for routing.**

**D2. It belongs BETWEEN two points, never ON one.** ADR-0160 §U0 set the rule for what may join the
hero's horizon, and a travel time does not need it: the horizon is a sequence of **points**
(`עכשיו → ועוד עכשיו → הבא בתור → אחר כך`), and a journey between them is not a property of either.
This is the shape ADR-0159 already established for the day — _"the slot between two rows is the same
slot, and what differs is what is true of it"_ — and travel time is simply a third thing that can be
true of it, beside free time and a connection. **One slot, three meanings. Not a fifth point-depth
item.**

**D3. Round to the ladder we already have.** ADR-0114's one elapsed-duration ladder, read a second
way. Never seconds. A route that returns 1,268 s is `21 דק׳`, and 4,355 s is not `72 דק׳` but
`1:13 שע׳`.

**D4. Crow-flies is the floor, and never an error.** No route — offline, out of cluster, over the
ceiling, provider down — leaves `formatDistance`'s existing chip standing. ADR-0186 §6 rule 5,
restated: _"a missing archive falls back… never an error state."_ The user must not be able to tell
the difference between "we have not computed this" and "this is not computable".

**D5. Never state a confidence we do not have.** An OSM pedestrian estimate is an estimate. So:
`~23 דק׳`, not `23 דק׳`; a leave-by is a **suggestion with a buffer**, not a promise. The app must
never render an arrival clock time it cannot stand behind — this is the principle that keeps
ADR-0205's "we can now be wrong in a way that costs someone a booking" survivable.

**D6. The app has one live mark, and it already has it.** `.nowline` is it (ADR-0159 §2). Urgency
here is carried by **ink and word**, never by a second pulse, glow or countdown.

**D7. Risk is status, so risk is `--miss`.** A leave-by already past is not "very amber", it is a
negative status, and the status mini-palette owns that. As text, `--miss-deep` (design-language: the
fill fails AA as ink).

**D8. At most one route line drawn at a time.** Five solid amber polylines on a phone is exactly the
fight ADR-0121 §9 called _"quiet base, loud pins"_, and the pins must win it. The **selected or next**
leg is solid; every other leg keeps today's dashed connector. Non-negotiable without a mockup that
disproves it.

**D9. Absent, not disabled.** v1 has no transit _routing_, so the mode control offers no transit
**estimate** — and never a greyed control implying one is coming. ADR-0160 §H's own words:
announcing a control and then doing nothing when it is activated is the failure. A promise we cannot
keep is worse than a silence. **Amended by §AA4 (2026-08-25): this rule is about what the APP
claims, not about what a PERSON may tell it.** A traveller declaring "we are taking the train here"
is not a promise we made and cannot keep; it is a fact we were given, and it makes the app quieter
rather than louder. Read §AA4 before applying D9 to the transit mark.

**D10. Copy rules apply, and Hebrew agreement is the trap.** No em dashes (root `CLAUDE.md`); `·` is
the separator. And `20 דקות הליכה` / `שעה הליכה` disagree in a way the phrase does not expose —
ADR-0159 §1 dodged the identical problem by leading with the noun, and the same dodge applies here.

### V1 — what ships, ranked

Ranked by **usefulness first, cost second**, and each line names where it lands.

| #       | feature                                                    | why it ranks here                                                                                                                                                                                                       | where                                  |
| ------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **1.1** | **Gap minus travel** — `פנוי · 2:00 שע׳ · אחרי 40 דק׳ דרך` | **A correction, not a feature.** The app currently overstates free time. Nothing else on this list is a bug fix.                                                                                                        | `DayJoinRow`, ADR-0159's slot          |
| **1.2** | **Time-to-next + leave-by** — `~23 דק׳ · צאו ב־18:37`      | The U-06 payoff and the sentence the backlog has carried since ADR-0106. Answers the third of the app's three questions.                                                                                                | hero horizon, between two points (D2)  |
| **1.3** | **Per-leg travel in the day**                              | Makes 1.1 legible: the day reads as _place · journey · place_ rather than as holes.                                                                                                                                     | `DayJoinRow`                           |
| **1.4** | **Late-risk mark**                                         | A leave-by already past is the single most actionable thing this data can say. Costs one derivation on top of 1.2.                                                                                                      | wherever 1.2/1.3 render, `--miss` (D7) |
| **1.5** | **The real polyline**                                      | The visualisation the owner asked for. Cheap — `DayConnector` already draws a line.                                                                                                                                     | `MapPane`, solid + amber (D1, D8)      |
| **1.6** | **Mode per leg, inferred default, instant switch**         | A car trip in Iceland and a metro trip in Tokyo want different defaults, and every number above is wrong under the wrong mode. **The default is derived from the trip's bookings and the switch is instant** — see §Z2. | leg-level, default derived (§Z2)       |
| **1.7** | **Plan-mode day feasibility** — "this day does not fit"    | Plan mode's whole job is building a day that works, and it currently builds days that cannot be walked. Same matrix, no new fetch.                                                                                      | `PlanDay`                              |
| **1.8** | **Offline route pack**                                     | Our stops are known in advance, so routes are precomputable at ~410 bytes each and ride ADR-0186 §5/§6's existing download, budget and eviction machinery. **This is what makes it work on the plane.**                 | `MapService` extract pipeline          |
| **1.9** | **Day travel total** — `3.2 ק״מ · 48 דק׳ הליכה`            | One line, free from data 1.3 already fetched, and it is the day-shape read a planner actually wants.                                                                                                                    | day header or Plan summary             |

**1.1 through 1.5 are the product.** 1.6–1.9 are what make it not feel like a demo, and each is
cheap **only because** the ones before it exist. That ordering is the milestone board's, too.

**Amended by M2 (2026-08-25), which built §V1.1's and §V1.7's arithmetic: an absent estimate is not
a small estimate, and it is not a verdict either.** Both rules follow from §D4 and both are the kind
of thing a later implementation would get subtly wrong, so they are written down rather than left to
the code:

- **With no estimate, the slot reads exactly as it reads today** — the whole gap, free. Never a
  pessimistic guess: §D4 says the reader must not be able to tell "not computed" from "not
  computable", and inventing a walk we did not measure fails that in the direction that costs
  someone their afternoon. So the correction §V1.1 makes is applied **only where there is a
  measurement**, and everywhere else ADR-0159's line survives untouched.
- **"We cannot tell" is a third answer, so the fit is a discriminant and not a boolean** — `fits`,
  `overruns`, `unknown`. §V1.7's day therefore says no **only on evidence**: a day whose stops have
  no times, or whose legs have no estimates, fits. Plan mode refusing a day it cannot measure would
  land as refusal rather than help, which is precisely what this ADR's Consequences warn against.

One smaller decision in the same place: the derivations take and return **instants and seconds**,
never formatted strings, and they take `now` from the caller — so `leaveBy` is allowed to answer an
instant already in the past, because that fact is §V1.4's whole mark and clamping it would delete
it.

### V1 — the driving exception, which is not a detail

ADR-0205 §3's routing gate is **per-mode** — walking and cycling within one of ADR-0186 §4's
clusters, driving by distance alone. That is a substrate rule, and it is repeated here because it is
a **product** boundary too: it is the difference between a car-hire trip (ADR-0162) that works and
one where every leg of the ring road reads as unavailable. Reykjavík→Vík is two clusters apart and
is exactly what a road trip is.

**What follows for the product:** a driving leg may cross clusters and a walking one may not, so the
same two places can have a travel time under one mode and a crow-flies chip under another. D4 makes
that survivable — the fallback is never an error — but §M5's mode control has to make the active
mode obvious, because it silently changes what the day is able to say.

### V2 — deferred, with the reason each one waits

Deferred on **complexity or dependency**, never on value — several of these are more valuable than
the bottom of V1.

| feature                           | why it waits                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transit routing**               | The largest single gap: Senso-ji→Tokyo Station is **73 min walking, 25 min by train**. Nothing free is usable — FOSSGIS has no GTFS, Transitous bars non-open-source use. The un-blocked path is self-hosting MOTIS (MIT), a second service and a per-region feed pipeline. **Its own ADR, on its own evidence.** |
| **"Leave now" notification**      | Blocked, not deferred: ADR-0197/0198 are designed and **nothing is built**. The moment the sweep exists this is one derived obligation, and ADR-0198's own frame — _we notify what you can still miss_ — already describes it exactly.                                                                            |
| **Ripple gains travel**           | Touches ADR-0011's core primitive. Today ripple moves soft events on clock arithmetic; adding travel changes what a "conflict" is. Deserves its own ADR, and V1's reads must be trusted before anything is allowed to move on them.                                                                               |
| **Optimised day ordering**        | Valhalla answers it (`optimized_route`), so it is nearly free technically and expensive **as a product decision**: an app that reorders your day is a different app. Needs a design session, not an implementation one.                                                                                           |
| **Isochrones / reachability**     | "What is within a 15-minute walk" would improve both the Map's near-me sort and ADR-0151's `near-the-day` suggestion strategy. Waits because V1.7 must prove the matrix is trustworthy first.                                                                                                                     |
| **Elevation & step-free routing** | Valhalla exposes both. Real accessibility value, and a genuine promise to keep properly rather than approximately.                                                                                                                                                                                                |
| **Live traffic**                  | Needs a paid vendor **and** it breaks ADR-0205 §4's "never expires", which is where most of the value is. If it returns it is a separate cache with a clock.                                                                                                                                                      |
| **Turn-by-turn**                  | Refused, not deferred. The `ניווט` hand-off stays. We estimate; we do not guide.                                                                                                                                                                                                                                  |

### M. What a mockup must settle before any of §V1 is coded

Per ADR-0175 / the `design-mockups` skill, in `mockups/`, RTL, phone-first, both themes:

1. **Where the leave-by lives when it is urgent.** D2 puts it between two points in the horizon.
   The collapsed board is the glance surface and its budget is spent (ADR-0160 §3) — so does an
   imminent leave-by earn a place there anyway, or does D6 hold and the board stay as it is?
   **Recommendation: the board stays. The horizon carries it, and urgency is v2's notification.**
2. **The gap slot with three meanings.** ADR-0159 built free time and a connection into one slot;
   travel is the third. Drawn together at 390×844 and 360×640, because that is where a three-part
   line breaks.
3. **The amber line against the pins.** D8's claim needs measuring, not asserting — solid amber at
   `MAP_CONNECTOR.WEIGHT` against ADR-0125's ground and ADR-0123's pin hues, in both themes.
4. **The late-risk mark**, and that it reads as status rather than as a second live mark (D6/D7).
5. **The mode control.** Where it lives, and that it is three entries and not four (D9).

## Consequences

- **The day view gains a line between rows that was empty.** It is the densest surface in the app,
  and this adds to it. §M2 is where that gets paid for.
- **A wrong number is now possible where only a silence was.** D4/D5 are the mitigation, and they
  are why the estimate is hedged rather than precise.
- **Plan mode gains the ability to say no** (§V1.7). That is a change in its character — from a
  builder to a builder with an opinion — and it should be felt as help, not as refusal.
- **`DayConnector`'s reserved grammar is now spent.** A future line on the map has no unclaimed
  treatment waiting; it will have to earn one.

## Alternatives considered

- **Put the travel time on the point** (a fifth horizon block, per ADR-0160 §U0's rule). Rejected by
  D2: it is not a property of a point, and the app already has the right slot for a between.
- **A precise arrival clock** (`מגיעים ב־18:42`). Rejected by D5 — the precision is not real, and it
  is the exact false promise that makes a wrong estimate cost a booking.
- **Draw every leg solid.** Rejected by D8, and by ADR-0121 §9's whole posture.
- **Ship walking-only and add modes later.** Rejected: under the wrong mode every number on this
  list is wrong, and a car trip would read as absurd. §V1.6 is not a nice-to-have.
- **Wait for transit and ship it all at once.** Rejected: transit needs a self-hosted service, and
  holding nine features behind it trades a year of value for one. The honest cost is D9 — say
  nothing about transit rather than half-say it.

## Z. Amendment (2026-08-25) — the owner's M0 answers, and the two they changed

M0 is answered. Two answers **reverse or extend what this ADR proposed**, so they are recorded here
rather than edited invisibly into the sections above.

### Z1. The board DOES carry an urgent leave-by — and it does it by **replacing the countdown**

§M1 recommended the horizon alone, on the grounds that the collapsed board's budget is spent
(ADR-0160 §3). The owner's answer: _"if something is urgent, then it should be on the board and not
only the Horizon, right?"_ **That is right, and §M1's recommendation is withdrawn.** The board is
the glance surface, "what do I need in the next 30 minutes" is the question it exists to answer, and
putting the single most actionable fact in the app behind a tap is hiding it.

**But it is not an addition, and this is the part that makes it affordable.** The collapsed board
already carries a **countdown** — and a leave-by is the same kind of fact, pointed one step earlier:
time-to-act instead of time-to-start. So the board's one countdown **changes what it counts to**:

| condition                                   | the board's countdown says                 |
| ------------------------------------------- | ------------------------------------------ |
| leaving is not yet the live question        | `עוד 45 דק׳` — time to the event, as today |
| the leave-by is the nearer, actionable fact | `צאו עוד 10 דק׳` — time to leave           |
| the leave-by has passed                     | the late-risk mark, `--miss` (§D7)         |

Three things follow, and they are why this is the right shape rather than a compromise:

- **It costs no space and adds no element.** ADR-0160 §4 left the collapsed board with no
  interactive children and a spent budget; a swap spends nothing further.
- **`עוד 45 דק׳` is not merely less useful when you should already be leaving — it is wrong.** It
  says you have 45 minutes. Showing the two side by side would state a contradiction and make the
  reader resolve it.
- **§D6 survives untouched.** One live mark, and re-pointing it is not a second one. The owner's ask
  turned out to fit _inside_ a principle rather than against one — which is the test that says take
  it.

**What §M1 now has to settle** is no longer _whether_ but **when the swap fires** — the threshold at
which leaving becomes the live question. It is a number to measure on a real day, not to pick here,
and it interacts with the buffer §D5 already requires. The horizon keeps the full read either way
(`~23 דק׳ · צאו ב־18:37`); the board carries only the one urgent phrase.

### Z2. The default mode is **derived, not stored** — and switching must be instant

The owner: _"default could be inferred per trip, but it should be easy to switch between modes and
immediately get the results."_ Both halves change §V1.6.

**Derived.** The trip already knows what kind of trip it is: a car hire (ADR-0162) is a driving trip,
a trip whose transport is all rail and flights is a walking-and-transit trip. So the default is
**computed from the trip's bookings**, not a column someone sets — which is ADR-0018/0027's own rule
(derived state, not stored) applying cleanly. A per-leg override is the only thing persisted, and
only when someone actually sets one.

**Built early, in M7 rather than M8, because M7 shipped without it and that was a defect
(2026-08-25).** `derivedTravelMode(bookings)` in `packages/shared/src/routing.ts`: a trip with a
`car` booking drives, every other trip walks. M7 drew its first polylines with a hardcoded
`walking`, which reaches Valhalla as `pedestrian` costing — and the owner reported it from a leg
they knew: _"I've added a route that I'm kind of familiar with and it gave me a weird route… unless
the route that I got was for pedestrians, but it doesn't make sense to default to it."_ That is the
correct reading. A footpath route over a leg the trip drives is not an imprecise answer, it is a
**wrong** one, and a default parameter is what made it invisible. `useLegShape`'s `mode` is
therefore **required**, so no future caller can fall into a default again.

**Its two limits, stated rather than discovered.** It is per **trip**: a hire held Tuesday to
Friday makes a two-week trip's every day drive, and a single walk inside a driving trip still reads
as a drive. Both are the **per-leg override**'s job — still M8's, still the only thing persisted —
and neither is a reason to keep guessing pedestrian for everyone in the meantime.

**Instant.** This is a real technical requirement and it was under-specified. If a mode switch costs
a network round-trip, "immediately" is a ~1 s wait per switch, and the control feels broken. So
**every mode the gate admits for a leg is fetched together, up front**, and a switch is a read from
cache with no request at all. The arithmetic makes this free: a day matrix is 2.3 KB, three modes is
~7 KB, and the cache means it happens once per place-pair ever. **ADR-0205 §6's batch endpoint
therefore takes a set of modes, not one** — amended there.

Note what this does _not_ buy: a mode the gate refuses for that leg (a 9 km walk, a cross-cluster
bike ride) has no answer to switch to, and §D4's crow-flies chip is what the switch lands on. §M5's
control has to make that read as "not this way" rather than as a failure.

### Z3. Transit stays out of V1, confirmed

_"I can live without transit on V1."_ §V2's first row stands, and §D9 with it — the mode control has
three entries and says nothing about transit at all.

### Z4. The provider is still open

M0's second question came back as a question (community server versus self-host). It is a substrate
matter, so the pros, the cons and the standing default live in
[ADR-0205 §2's own 2026-08-25 amendment](0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md),
not here. Nothing in this ADR depends on the answer.

### Z5. What the mockup settled (2026-08-25)

Measured in [`mockups/a-travel-time-between-two-points-v1.html`](../../mockups/a-travel-time-between-two-points-v1.html),
at 390×844 and 360×640, in both themes. Session note:
[2026-08-25](../planning/2026-08-25-the-board-counts-to-the-leaving.md).

- **§M1 — the swap threshold is `LEAVE_BY_SWAP_MINUTES = 30`**, measured on **time-to-leave**,
  not time-to-event. Above 60 the tile is forced into `H:MM` under a unit that means minutes,
  which is a contradiction; below ~20 a long leg is lost before the board says anything. 30 is
  also the number root `CLAUDE.md` already states. The tile's unit becomes `ליציאה`, following
  ADR-0184 §6's `לסגירה` in both grammar and mechanism — this is a **third arm on
  `Home.tsx`'s existing countdown ternary**, not a new element, and all three candidate words
  fit the 74px tile unchanged.
- **§M1 also — the collision this ADR did not name.** A shutting check-in window (ADR-0184 §6)
  and a live leave-by can both be true in one minute. There is one tile, so the **nearer number
  wins**; drawing both costs 11px of the `הבא בתור` title and a second line at 360.
- **§M2 — the journey is an OBJECT in the day, not an annotation on a hole** (owner's review,
  round 1). A block between the two cards: the mode mark in the day's own badge column, the
  duration, the leave-by, **the distance**, and the mode chips on it. **The route's shape is NOT
  in the day list** (round 2, measured): at 46×26 the geometry survives but two of four real legs
  differ by 3.1px in a 46px box, so the thumbnail carries one bit — "this is a path" — at every
  hole of the densest surface in the app. The same pixels carry `formatDistance`, which a reader
  can act on, plus `PlaceBadge`'s existing "show on map" affordance one tap from the shape. The day then reads `place · journey · place`, which is
  §V1.3's own sentence. It **absorbs** the free-time statement rather than sitting beside it, so
  the slot still holds one object (ADR-0159's rule): measured at 58px against 87px for a
  strip-plus-block, with both of `freeAfterTravel`'s numbers still said. It **ignores
  `GAP_MIN_MINUTES`** for ADR-0159's own reason, or a 45-minute hole holding a 40-minute walk
  stays silent. Three **new** `ui/Icon.tsx` glyphs — walking, cycling, driving — are part of the
  proposal; transit reuses `ticket`.
- **§M3 — §D1's "solid + amber" cannot be one value.** `--amber` measures **1.72:1** on the day
  map ground (`earth #eee8dc`), under the 3:1 floor a graphic owes what it crosses, and 7.01:1
  on the night ground. The route line is therefore a **per-theme pair, in TypeScript, switched
  in JS** exactly as `MAP_CONNECTOR.COLOR` is: `--amber-deep` (4.5:1) light, `--amber` dark. No
  new hue — `--amber-deep` is amber's paper variant (ADR-0158 §6).
- **§M3 also — every leg draws its REAL path; §D8 rations the SOLID AMBER, not the truth of the
  line** (owner's review). A straight segment is both a weaker drawing and a wrong number — it
  under-reports distance by construction. All-solid puts **3.7×** the amber on the canvas, so §D8
  stands. And hue cannot separate the line from a pin (1.02–1.28:1 against every category hue in
  dark); what does is the 2px `--card` ring the pin already carries.
- **§M5 also — the mode control appears on the map too**, in the Map tab's `SnapSheet`, as the
  _same_ block the day list renders. One component, two hosts; a switch redraws the polyline from
  cache with no request (§Z2).
- **§M4 — the late-risk mark is ink and word only, and by default it may not say "you are
  late."** A settle mark is a record written when convenient, not a sensor, so from the clock
  alone the only supportable claim is that **the leave-by has passed**:
  `זמן היציאה עבר ב-17:15`, never `אתם באיחור`. **This is the floor, and it is what ships**, because
  the position below can be refused or absent. Same `--miss`,
  same place, a claim we can stand behind (§D5's rule applied to a sentence rather than a number).
  Paint: `--miss-deep` on paper (6.59:1), the board's brightened `#f0a0a0`/`rgba(198,40,40,.18)`
  recipe on the board (8.73:1) — the one `.tlabel.missed` already uses. No fill, no glow, no
  pulse, so §D6 is untouched.
- **§M4 also — own-device position may STRENGTHEN it, and that is a separate ADR.** ADR-0006
  puts own-device location **in v1** (`useGeolocation` ships and feeds the Map's `קרוב עכשיו`);
  only member-to-member sharing is deferred, which is what ADR-0205 §8's "Not member GPS" means.
  With a fix the mark can be **earned** (`עדיין כאן`) or **withdrawn** (already on the route, no
  mark at all) — the second being the real prize, since it deletes a wrong nudge. Three code
  facts bound it: the hook is **one-shot, not `watchPosition`** (a battery decision), the fix is
  **never persisted or sent**, and iOS PWAs have no background position — so this is "the app
  knows when you open it", never "the app watches you". Using it here is a **new capability for
  this surface and wants its own ADR**; §V1.4 builds the floor.
- **§M4 also — the user answers it with a verb the app already ships.** `בדרך`
  (`t.actions.onWay`, on the day row since ADR-0161) is the only thing in the app that knows what
  GPS would, because a person says it; on the leg it clears the mark and turns the block teal
  (ADR-0141's journey grammar). **It writes nothing today** — `verbs.ts:1361` is a toast — and
  this is its first consumer with a reason to be state.
- **§D9/§Z3 amended — transit is DECLARABLE, never estimated.** §D9 refuses a control that
  announces a mode and answers nothing; this one announces up front that it _has_ no answer, and
  its value is silencing a wrong one (Senso-ji → Tokyo Station: 73 min walking against 25 by
  train — on a transit leg the walking number is harmful, not merely imprecise). It takes the
  existing `ticket` icon and `.wp-chip.provisional`'s dashed off-state, and four chips still fit
  one row at 360 (239px of 312px). **The cost, stated here so it is not found in the build:** a
  declared leg carries no duration and therefore no leave-by, so the board's swap does not fire
  for it and the day travel total skips it. It is **not** a fourth member of `travelModeSchema` —
  that schema is what the server is asked for, and no provider can route it; the declaration
  lives on the leg (`legMode = TravelMode | 'transit'`).
- **§M5 — three word chips in `ToggleChip`**, not icons: `ui/Icon.tsx` has no walking, cycling or
  driving glyph and this is not the place to mint three. 29px painted, 51px target via an
  `::after` overlay (the trick `button.day-gap` already uses), one row at 360. It appears on the
  **selected or next leg only** — §D8's rule, generalised from the polyline to the control. A
  mode the gate refuses keeps its chip in `.wp-chip.provisional`'s dashed state and the tap lands
  on §D4's crow-flies chip, which is §Z2's "not this way" rather than a failure.
- **Two bidi defects found by rendering**, both ADR-0118's fix and both reaching the build:
  `~40` renders `40~` without `ltrIsolate`, and `§` is neutral so `§D8` renders `D8§` inside
  Hebrew copy.

## AA. Amendment (2026-08-25) — the four open owner decisions, closed

The **Owner decisions outstanding** table on the milestone board is now empty. Three answers took the
recommendation; the fourth reverses a position this ADR held, and §AA4 is the one to read.

### AA1. The swap threshold is 30 minutes of time-to-leave

`LEAVE_BY_SWAP_MINUTES = 30`, exactly as §Z5 measured it. Confirmed rather than changed, and the
three grounds stand: it is the number root `CLAUDE.md` already states in prose, anything ≥60 forces
the tile into `H:MM` under a unit that means minutes, and at 45 the board spends more of a 40-minute
walk counting to the departure than to the event. **M6b builds it as a third arm on `Home.tsx`'s
existing ternary.**

### AA2. The tile's unit word is `ליציאה`

Following ADR-0184 §6's `לסגירה` in grammar and in mechanism — the unit slot says what the minutes
are left **of**. Measured to fit the 74px tile unchanged (§Z5). `לצאת` was the alternative and reads
as an instruction where this is a measurement.

### AA3. The mode control gets three real icons

`ui/Icon.tsx` gains **walk, car and bicycle**. §Z5 drew the control as word chips, and that was a
consequence of the icon set not having them rather than a judgement that words read better — the
session note says so in as many words.

Three reasons to mint them, and the first is this repo's own decision: **ADR-0138 §4 already settled
that "icons are UI"** and replaced the nav's emoji with `Icon` SVGs, so three glyphs here follow the
grammar rather than bending it. Second, three word chips eat real width at 360px on the app's
densest surface. Third, walk/car/bicycle are about as universally legible as glyphs get — this is
not a case where an icon needs a label to mean anything.

**What this obliges:** they are `Icon` entries like every other, and ADR-0138's rule that a glyph
carries a content rule applies — a bare bicycle is not a mode until it reads as one at the control's
size. **M6a and M8 own this, and it wants drawing at 24px before it is coded.**

### AA4. A person may declare תחב״צ, and doing so **suppresses** the estimate

**This reverses §V2's "say nothing about transit" for the declaration only, and §D9 is amended
above.** The owner asked for it; I argued against it on §D9 and was wrong, and the reason is worth
writing down because it is the kind of mistake that repeats.

**§D9 is about what the app claims.** A greyed transit control promising routing we do not have is
the failure it names. **A traveller marking a leg תחב״צ is the opposite move** — it is a fact the
app was given, and what it buys is _silence where we would otherwise have lied_. In Tokyo the
unmarked leg reads `~73 דק׳ הליכה` for a journey nobody will walk; marked, it reads as transit with
no estimate. **The app becomes quieter and more honest, not louder and more promising.** I had this
filed as a fourth entry in a picker; it is not that.

**The shape, and it costs almost nothing because M8 already built the mechanism:**

- **A fourth stored mode value with no provider.** It rides M8's per-leg override — the same column,
  the same control — and `TRAVEL_GATE` never sees it, because there is nothing to gate. No request
  is made, ever. It is not a `RouteProvider` concern and must not become one.
- **It suppresses the duration and keeps the distance.** §D4's crow-flies floor is unaffected: `2.7
ק״מ` is still true and still useful. What disappears is the walking number that was wrong.
- **It is never inferred.** Only a person sets it. The app must not guess that a leg is transit
  from its length, because a 9 km leg might equally be a taxi or a genuine long walk (§Z8 — the
  owner raised the walking ceiling precisely because people do choose long walks).
- **It says what it does not know.** The read carries the mark and no estimate; it must not imply a
  transit ETA is coming. This is the one place §D9's original caution still bites, and it lands on
  the _copy_, not on the control.

**Not yet drawn.** §Z5 raised this as a question and did not resolve it into a state, so **M8 needs
the mockup extended before it codes this** — the mark, the suppressed-duration row, and the copy
that says "no estimate" without promising one. It is a small addition to an existing file, not a new
design session.

**What V2's transit row now means:** transit _routing_ — a real ETA from a real feed — is still
deferred, still needs self-hosted MOTIS, and still gets its own ADR. This changes only who may
assert the mode.

## AB. Amendment (2026-08-25) — what M7 settled by drawing the line

§Z5 §M3 measured the polyline and §D8 rationed it; building it took four decisions the measurement
did not cover. All four are small, and all four are the kind that a later reader would otherwise
have to guess at from the code.

### AB1. The route is NOT gated on Plan mode, though the dashed connector is

ADR-0121 §10 draws the day's order in **Plan mode + day scope only**, on the reasoning that
revealing a day's shape is a planning question while Trip mode wants "where is next" and a quieter
canvas. **The route inverts the second half of that**: it _is_ "where is next", drawn between the
two points §D2 says it belongs between, so Trip mode is where it earns most. It draws in both
modes.

**Day scope still gates it**, because §D8's "the selected or next leg" has no referent without one:
all-days is a trip's worth of legs with no day to pick from.

The consequence is a Trip-mode canvas with one solid amber line and **no dashed connector under
it** — which is correct rather than incomplete: the order is not what Trip mode is asking about.

### AB2. The leg is the one arriving AT the stop you asked about — and the fallback is the first leg

"Selected or next" names a **stop**; a line needs two. The leg drawn is the journey **into** that
stop — the selected pin's, or the next stop's when nothing is selected — because that is the
question both reads answer (§V1.2's `~23 דק׳ · צאו ב־18:37` is the travel _to_ where you are
going). The day's first stop is the one place with no such leg, so it takes the leg **departing**
it instead.

**Amended 2026-08-25: the rule is `selected → next → the day's FIRST leg`.** As first built it
stopped at the second arm and drew nothing when neither answered — which meant **Plan mode drew
nothing at all** unless you tapped a pin, because `nextStopId` is Trip-mode only by design (a live
"next" says nothing while you are planning). Reported by the owner: _"I'd like to be able to see
the polyline for plan mode as well."_ A plan opens on the journey it starts with, so the first leg
is the honest default; in Trip mode the third arm can only fire before the day begins or after it
ends, where the first leg is the right answer too. §AB1 already put the line in both modes — this
is what makes that true in practice rather than only in principle.

### AB3. The day buys one mode's geometry, for every leg

§Z2 fetches every mode's **duration** up front so the mode control answers from cache with no
request. A **shape** is not free the same way: it costs an upstream route call per leg per mode
(`routing.service.ts`), so geometry is bought only for the mode on screen. A mode switch re-asks
for that mode's lines once.

**§Z5 §M5's "a switch redraws the polyline from cache with no request" is therefore M8's to
finish** — after the first switch to a mode, its lines are cached and every switch back is free.
Recorded here because the two statements otherwise read as a contradiction rather than as a
sequence.

**Corrected 2026-08-25 — this first read "one line drawn buys one mode's geometry for ONE leg",
and that was a misreading of §M3.** See §AB5.

### AB5. Every leg draws its real path — the routed lines REPLACE the straight dashes

**§Z5 §M3 already decided this and M7 shipped it wrong.** Its words are unambiguous — _"every leg
draws its REAL path; §D8 rations the SOLID AMBER, not the truth of the line"_ (owner's review) —
and M7 read them as aspirational, drew the focused leg's real path, and left every other leg as
ADR-0121 §10's **straight** dashed segment. The owner reported it: _"Aren't we going to render
polylines for all two places that are one after another? … they should replace all straight dashed
lines between stops."_

**The board is what led M7 astray, and the rule for that is already written.** The M7 card said
"dashed neutral for the rest", which reads as "keep the straight dash"; §M3 says the dash keeps its
_treatment_ and loses its _straightness_. Root `CLAUDE.md`: if the board and an ADR disagree about a
**decision**, the ADR wins and the board is stale. It did, and it was.

**What the dash means now changes, and that is the substantive part.** ADR-0121 §10 chose the dash
to say _"this is the order, not the route"_ — honest, because there was no geometry to be had. Now
there is, and a straight segment is both a weaker drawing and a wrong distance (§M3). So the dash's
job becomes **"this leg is not the one you are looking at"**, and §D8's ration is unaffected: one
leg solid amber, every other dashed, all of them true. A leg whose shape has not arrived still
draws its straight segment — §D4's floor, and it reads as a line that has not snapped to the road
yet rather than as an error.

**And the tripwire survives on its own terms, which is why this is affordable.** The M7 card warns
that _"a day of N legs issuing N shape calls means it was done wrong"_ — N calls **from the
device**. `routableLegs` pairs stops **consecutively** (`i → i+1`), so an N-stop day is N-1 legs
carried in **one** batch request; the per-leg `/route` calls are the server's, paced at
`SHAPE_CALLS_PER_PASS = 8` and cached for good, with anything unreached returned in `pendingModes`
for the next ask. One `useDayShapes` hook replaces `useLegShape`, and it stays **separate from
`useDayTravel`**: the day LIST draws nothing, so it must never buy geometry.

### AB4. A shapeless answer is "ask again", never "never" — and the mirror stays last-write-wins

The matrix returns no geometry (ADR-0205 §4), so `useDayTravel`'s day-wide answer **overwrites** the
shape the map just bought for one of its legs. Two places could hold the line against that, and the
first one is wrong:

- **Read-modify-write in `cacheTravelEstimates`** — carry a held shape forward. **Rejected, and
  measured:** reading first lands the write one IndexedDB transaction later than a caller can
  observe it, and M5's own "does not re-ask a day it already answered in full" spec then fails
  intermittently, because the next mount's Dexie read wins the race and the day comes up empty
  forever. That is a race on the DAY's hot path bought for one saved request on the map's.
- **`useLegShape` not treating a shapeless answer as final.** Only a leg that came back with **no
  estimate at all** — refused by the gate, over the ceiling, provider down — is remembered as
  unaskable. A leg that answered without a shape stays askable, so the overwrite heals itself with
  one request the next time that leg is drawn.

The cost is stated rather than hidden: **one extra shape request per day-visit cycle** for a leg you
return to. The server pays it from its own cache in most cases (it re-fetches only when `withShapes`
finds no shape stored), and §D8's tripwire is untouched — one line drawn is still one shape asked
for.

### The paint, for the record

`MAP_CONNECTOR.ROUTE` in `frontend/src/constants.ts`: `#915e1e` light (`--amber-deep`, **4.50:1**
on `earth #eee8dc`) and `#f0b254` dark (dark-theme `--amber`, **7.01:1** on `earth #343027`), at
**3.5px** with round caps and joins — heavier than the 2.5px dash because it makes the opposite
claim, and round-jointed because a many-vertex line on mitre joins spikes at every turn.

## AC. Amendment (2026-08-25) — the design session on how the lines READ

Four reports off the shipped canvas, drawn and measured in
[`mockups/the-days-lines-read-as-a-route-v1.html`](../../mockups/the-days-lines-read-as-a-route-v1.html).
Session note: [2026-08-25](../planning/2026-08-25-the-days-lines-read-as-a-route.md). **Nothing here
is built** — §M's rule applies to this pass as it did to the first: the mockup comes before the code.

### AC1. Plan mode spends no amber by default — §AB2's third arm is DELETED

The owner: _"in plan mode it still shows an amber poly line for the first leg of the day which is
not needed, I would much rather have all lines render the same in plan mode."_

**He is asking for §D8 as it was already written.** §D8 says the **selected or next** leg is solid;
§AB2 added `→ the day's first leg` for one reason, recorded on the M7 card — Plan mode drew
**nothing** otherwise, because `nextStopId` is Trip-only. **That reason expired in the same PR that
introduced it:** §AB5 made every leg draw its real path, so a Plan day is full of lines with or
without the fallback. Deleting the third arm restores §D8 verbatim and needs no new rule.

The general form, worth keeping because it will recur: **a fallback that exists to stop a surface
being empty must be re-examined the moment something else fills that surface.** Nothing failed here
— the workaround simply outlived its reason by one commit.

### AC2. A selected stop marks the leg ARRIVING at it, and dims the rest

Three candidates drawn. **Recommended: the arriving leg takes the amber, the departing leg takes
weight only, every other leg drops to `line-opacity` 0.45.**

- Two amber legs (drawn, rejected) is **twice what §D8 rations**, and the render makes the reason
  visible rather than theoretical: two solid legs read as _a highlighted route_, not as _a marked
  stop_. §Z5 §M3 measured all-solid at **3.7×** the amber on the canvas; this is the same failure in
  miniature.
- **Arriving rather than departing** is not a fresh choice — §AB2 already took it for "which leg
  belongs to a stop", so answering differently here would make the two disagree.
- Prominence is **weight and opacity, never a second hue** (root rule 4).

### AC3. A leg ends in a DOT, because a collar is invisible — and the render is what proved it

_"a way to easily distinguish what line connects to what stops."_ Two legs meeting under a pin read
as one long line.

**The obvious candidate was drawn and it does not work.** A "collar" — a constant gap before the pin
— is invisible on a line that is **already made of gaps**: the shipped dash is `[2, 2]` at
`WEIGHT` 2.5, i.e. **5px on, 5px off**, so a 9px collar is **1.8×** a gap the eye is already
discarding. The two frames are indistinguishable on screen. A collar would have to exceed ~3× the
dash gap to read, which starts eating the short legs.

**A solid dot is the one mark a dashed line cannot accidentally produce**, so the leg's endpoint
takes one. **Stated cost:** this is a **third source/layer pair** in `DayConnector` — a `circle`
layer over a point source of the legs' trimmed endpoints. That is the honest price, and it is the
reason this is an ADR entry rather than a tweak.

### AC4. The legs are NOT numbered — ADR-0121 §6 already answered it

The owner asked for it and doubted it in the same sentence: _"maybe but not sure… Probably not the
best approach."_ **The doubt is right.** ADR-0121 §6 put the order **on the pins** precisely because
_"a line between two stops is symmetric and never said which end you reach first"_. A label on the
line is the **second** place the app states the day's order, and two places can disagree.

Drawn anyway, and measured: **all three labels land on the drawn line itself**, because a leg's
midpoint is on its own path. What the owner actually asked for — _"some visual aid to help us
understand the route better at a glance"_ — is answered by §AC3's endpoint dots plus the numbers
already on the pins.

### AC5. An off-network stop gets an APPROACH STUB, not a stitch

The owner: _"when the stop doesn't sit exactly on a path the line just stops beside it and doesn't
lead directly to it, which looks kind of awkward and could even be confusing."_

**The cause is the router, not the drawing.** Valhalla snaps each endpoint to the nearest routable
edge, so a returned shape **always** begins and ends somewhere other than the stop — usually within
a metre, occasionally hundreds. The gap is a permanent property of routing, not a defect that
appeared.

- **Stitching straight to the pin (rejected)** draws a solid, confident line across ground nobody
  walks — the same false claim §Z5 §M3 rejected when it refused straight segments.
- **Recommended: an approach stub** — the unrouted remainder in the leg's own hue, thinner, dotted
  rather than dashed, ending at the endpoint dot so it never touches the pin. It says _"this part we
  do not know"_, which is true, and it is the only line on the canvas that is deliberately not a
  route.
- Below a threshold the stub is invisible anyway, so the threshold is a **feel call handed to the
  device pass**; the mockup ships 16px as its default and makes it a control.

**One stub per STOP, not one per leg end** (the owner's correction on the first draft: _"you rendered
two lines that connect to the two separated lines for before and after, which looks a little off… you
should render only one line"_). Drawn per leg end it appears **twice** at an interior stop — a tail
from the arriving leg and another from the departing one, meeting near the pin in a V. That is not
merely untidy: **a stop meets the network in one place, so two tails are the same fact drawn twice.**
The stub therefore belongs to the stop and runs to the **arriving** leg's endpoint — §AB2 already
makes the arriving leg a stop's canonical one, so the two answers cannot disagree — falling back to
the departing leg only for the day's first stop, which has no arrival. Where a one-way restriction
snaps arrival and departure to different edges the choice is visible; ordinarily both snap to the
same edge and it is moot.

**§AC3 and §AC5 are one mechanism at two scales** — the endpoint dot marks where a leg ends, and the
stub is what fills an unusually large distance between that dot and the stop.

### AC6. Build log (2026-08-25) — what §AC cost once it was code

Built in the same PR as the mockup, on the owner's approval. Three things the drawing could not
say:

- **The collar makes the drawn geometry a function of the CAMERA.** §AC3's dot has to sit back from
  the stop so the pin's own tip does not cover it, and that setback is a **screen** distance. A
  constant in metres was the alternative and it is wrong in both directions — invisible at country
  zoom, enormous at street zoom — so `DayConnector` projects, trims in pixels, and unprojects, and
  re-derives on **`zoomend`**. Not on `zoom`: re-running it every frame of a pinch is exactly the
  churn ADR-0121 §9 keeps off this canvas. **The stored shape is never trimmed — only what is
  painted.**
- **It is 2 sources and 4 layers, not the "third source/layer pair" §AC3 predicted.** The three line
  treatments — dashed legs, the one amber leg, the stubs — share **one** source and split by
  `filter`, so they are one piece of data with three renderings rather than three parallel copies
  (rule 8). Only the dots need a second source, because a `circle` layer cannot read a line source.
  Prominence rides on each feature's own `emphasis` via data-driven `match` expressions, which is
  what lets a single layer draw legs of different weight and opacity.
- **The prop consolidated rather than grew.** `connector` and `route` became one
  `readonly MapDayLeg[]` — path, its two stops, and an optional `emphasis`. Two props describing one
  set of lines could disagree about which leg was which; one cannot. The stops travel with the leg
  because §AC5's stub is measured against them, which is what makes "the leg **arriving** at a stop"
  expressible without an index into anything.

**And two costs that only CI could find, both measured by bisection rather than guessed.** The
first build of §AC3's collar re-derived the trimmed geometry on every `zoomend`, which mutates the
map's style **exactly as the app is settling after a camera fit**. On a software-rendered canvas
that starves the frame: `e2e/place-know.spec.ts` went from **⁦38s⁩ and green** to **⁦1.1m⁩ with its
scroll and stability assertions failing** — the DOM never held still long enough to be clicked. The
work itself was never the problem (the whole redraw measures **⁦12ms⁩** across four draws); _when_ it
landed was. Two changes fix it and both are worth keeping:

- **The redraw is deferred and thresholded.** Off the settling frame via `requestAnimationFrame`,
  and only when the zoom has moved at least `COLLAR_REDRAW_ZOOM` (0.5 of a level) since the geometry
  was built — under half a level a ⁦9px⁩ setback is still visually a ⁦9px⁩ setback.
- **A layer is added only when something in the data belongs to it**, and removed when nothing
  does. A Trip-mode day draws one leg; the other three layers sat there empty and were composited
  every frame.

The bisection is worth recording because four plausible suspects were wrong first: the dot's circle
layer, the two dashed layers, the near-zero stub dash, and the number of layers. Each was tested and
exonerated; the listener was the only thing that mattered. **A performance claim about a canvas is a
measurement, not a reading of the diff.**

**And the spec that asserted the bug is now the spec that forbids it.** `Plan mode with nothing
selected draws the day's FIRST leg` — written three hours earlier, and a faithful record of §AB2's
third arm — is inverted to `spends NO amber, and still draws every leg`. That is the shape a
deletion takes in a suite: the test does not disappear, it changes sides.

## AD. Amendment (2026-08-25) — the route's stops are the day's SEQUENCE, not the day's NUMBERS

Owner, off the shipped canvas: _"Now that we have real paths, I'm starting to feel the absence of
some stops from the day schedule (the numbered stops), mostly the hotels."_

§AB5 made every leg draw its real path, and doing so quietly changed what the stop list **is**. It
had been the day's numbered schedule, which is a claim about what you committed to; it is now the
spine of a drawn route, which is a claim about where you were. `screens/Map.tsx` was still gating it
on `pin.order != null` — the **visible number** — so the two stops nobody schedules and everybody
makes, the hotel you woke in and the one you are sleeping in, were the two the line could never
reach. A car collected "from 09:00" was drawn nowhere at all for the same reason.

The decision belongs to [ADR-0054](0054-ambient-span-events-off-the-day-schedule.md)'s 2026-08-25
amendment (a stay is off the day's schedule and **on** its route, first and/or last, unnumbered) and
[ADR-0182](0182-a-day-is-a-sequence-you-can-step-through.md) §3's (the sequence orders on the
instant, the list still orders on `knowsMoment`). What this ADR records is the consequence for
everything §AB–§AC built:

- **The polyline, `mapsDayRouteUrl` and the selection card's traversal all read
  `buildDayStopSequence`** rather than the pin numbers. One derivation still, one step earlier.
- **§D8's ration is untouched.** A bookend can be selected like any other stop and then owns the
  amber leg arriving at it (§AC2); with nothing selected, Plan mode still spends no amber (§AC1).
- **The leg count grows by up to two per day**, which is where the shape budget lands: `routableLegs`
  still pairs consecutively, so it is still **one** `withShapes` request per day (§Z5 §M3), just a
  slightly longer one. A day whose only stops are the two ends of one stay collapses to a single
  stop and asks for nothing.

## AE. Amendment (2026-08-26) — what M6b settled by building the hero read

§V1.2 and §Z1 are built. Seven notes, each recorded here rather than left in the code for a later
reader to reconstruct. **Nothing in §D or §V changed**: six are gaps in the record being filled, and
§AE6 is a regression against the M3 drawing being undone.

**On the mockup gate (§M).** Four of these are decisions the drawing did not make, and none of them
was taken back to a mockup — a judgement call, on the owner's instruction to draw only what is not
trivial, and the precedent is the board's own: _"a word in an existing slot spends no new axis, where
a mark would have spent one"_ (M7c's second field report). §AE1 is a word in a slot §Z5 already
measured; §AE2's teal line and its `בדרך` control are the v2 journey block one elevation up, which is
ADR-0160's whole thesis rather than a new surface; §AE3 and §AE4 are arithmetic with no drawing to
make. **§AE2's other half is not a drawing question at all** and is the one flagged for the owner:
whether a device-only mark is the right floor.

### AE1. The passed arm's unit word is `מהיציאה` — the same noun, the preposition flipped

> **SUPERSEDED 2026-08-26 by [ADR-0208](0208-a-claim-needs-something-to-stand-on.md) §1.** The word
> is `באיחור`. The owner reported `מהיציאה` as unclear in as many words — `מ־` reads as _measured
> from_, so the tile said "15, counted from the departure" — and the refusal below no longer holds:
> by the time the arm can print, `בדרך` (§AE2), a device fix (ADR-0207 §2) and the plan's own claim
> about where you are (ADR-0208 §2) have each had a chance to withdraw it. The reasoning below is
> kept because the **distinction** it draws is what survives: `אתם באיחור` is still refused
> everywhere, and what the unit slot carries is a measurement rather than an accusation.

§Z5 §M1 measured `ליציאה` for the live arm and §AA2 confirmed it. **Neither answered what the tile
says once the leave-by has gone by**, and the two mockups disagree: v1 drew `7 · באיחור`, and v2 §3
refused exactly that — _"How will the app know whether you're on time or late?"_ It cannot, so
`באיחור` is a claim about a person over data that is only about a clock.

**`מהיציאה` is the answer, and the mechanism is why.** ADR-0184 §6 made the unit slot say what the
minutes are left **of**; `ליציאה` follows it; this flips the preposition so the minutes are counted
**from** the leave-by instead of **to** it. It states that the time passed and by how much — both
facts about the clock — and claims nothing about where anybody is. The `--miss` paint carries the
urgency (§D7), which is why the word does not have to.

Rejected: `באיחור` (above — and reversed the same day; see the note at the head of this section); a
bare `עבר` (a verb where the slot holds a noun phrase, and it reads as an event rather than a
measurement); and dropping the number to fit a longer sentence, which throws away the difference
between two minutes past and forty.

### AE2. `בדרך` writes state, and it is a DEVICE mark — the group-visible one is deferred

§Z5 §M4 named `בדרך` as the mark's own answer and recorded that `verbs.ts:1361` was a toast with no
write. It writes now, into `frontend/src/lib/on-way.ts`: a `localStorage` map keyed by trip and
event, pruned by a 24-hour window on read, read through `useSyncExternalStore` so the board, the
horizon and the day row cannot hold different answers.

**What it buys is the whole of what the mark needs** — the person who pressed it stops being nudged,
on both elevations, and the leave read disappears rather than turning into a second claim.

**What it does not buy is the share, and the copy no longer claims one.** `t.toast.onWayShared` read
`שותף לקבוצה · בדרך` over a verb that wrote nothing at all, which made it the one confirmation in the
app that was false; it is now `בדרך · לא שותף לקבוצה עדיין`. A group-visible mark is a stored field,
a Prisma migration and a `CACHE_CHANNELS` mirror — a milestone rather than a line, and on the
backlog. **A device mark is the honest floor, not a placeholder for the real one:** what the group
sees still comes only from a verb a person pressed (§M4's rule), and this is that verb finally
keeping its own record.

### AE3. The journey's ORIGIN is the previous SCHEDULED stop, never a guess about where anyone is

> **Superseded in part by [ADR-0207](0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md)
> (2026-08-26), on a field report the next morning.** Everything below still describes how the leg is
> MEASURED — between two scheduled stops, which is a fact about the plan. What changed is what the
> surface may then CLAIM about it: with a device position the mark can be withdrawn (`en-route`,
> `arrived`) or earned (`at-origin`), and without one this section's behaviour is exactly what still
> ships. The owner stood ⁦200m⁩ from the door while the board called the leave-by passed, and the Map
> tab was drawing their blue dot beside that stop's pin at the same moment: **the arithmetic here was
> right and the silence was the defect.**

The ADR says the travel time belongs between two points (§D2) and never says which two when nothing
is in progress — and a gap is most of a real day, so the question is not an edge case.

**The origin is the primary now point when there is one, and otherwise the latest stop that has
already started.** That makes the leg a fact about the **plan**: during an event the schedule itself
says you are at that event's place, and in a gap it says the last thing that started is where it left
you. It is deliberately the same leg `DayJoinRow` measures its hole with (§V1.1), so the day row's
leave-by and the board's cannot differ about one journey.

**It does not walk further back when that stop has no coordinates.** The stop before it is somewhere
you have already left, and offering it would invent a position — the same refusal §M4 makes about the
clock, applied to place. No coordinates is §D4's absence, like every other missing estimate.

**Two limits, stated rather than discovered.** It is scoped to the **clock's own day**, so swiping
the day strip does not change where the journey the board draws starts from — and a morning before
anything has started therefore has no origin and no read. And it does **not** reach for §AD's
bookends: the stay you woke in is the honest origin for that morning, but finding it needs
`buildDayStopSequence` and the place-usage index the Map holds, which is a widening of this surface
rather than a line in it. **That is the first thing M6a or M11 should reconcile**, because whichever
of them derives an origin differently makes the two surfaces state different leave-bys for one
journey.

### AE4. The collision is decided in code, and a passed leave-by is negative for that reason

§Z5 §M1 named the collision — a shutting check-in window (ADR-0184 §6) and a live leave-by, both true
in one minute, one tile — and said the nearer number wins. The implementation detail worth recording:
`heroLeaveBy` returns **signed** minutes, so a passed leave-by is below zero and therefore nearer
than any window that has not shut yet. That ordering is not a separate rule; it falls out of not
clamping, which `leaveBy` already refuses to do for §V1.4's sake.

### AE5. The tile widens on `H:MM`, and that is arm 1's shipped behaviour rather than the swap's

Measured in Chromium at 360px. All four unit words — `דקות`, `לסגירה`, `ליציאה`, `מהיציאה` — fit the
`74px` tile unchanged, confirming §Z5's measurement for the new word. **What widens the tile is the
VALUE:** `2:00 · שעות`, which arm 1 shows today for any next event an hour or more out, measures
`76.58px` and breaks a long `הבא בתור` title onto a second line (`21px` → `41px`). A leave-by passed
by more than an hour reaches the same rung, so the swap inherits the behaviour and does not cause it.

Recorded here because the obvious reading of §AA1 — _"anything ≥60 forces the tile into `H:MM`"_ — is
about the contradiction between `H:MM` and a unit meaning minutes, and this is the **width** half of
the same fact, which nobody had measured. Left unfixed on purpose: it is a `.wp-board-next-row`
question, not a routes one, and it is on the backlog.

### AE6. The mode leads the line, and dropping it was a regression against the drawing

The first build of this shipped `~23 דק׳ · צאו ב־18:37` — the sentence §V1.2 names — and **the M3
mockup's §1d had drawn `הליכה · ~40 דק׳ · צאו ב־18:37`**, with the mode. Restored, because the mode
was carrying two things and neither is decoration:

- **It is §D10's dodge.** `~23 דקות הליכה` and `שעה הליכה` disagree, which is the trap §D10 names and
  ADR-0159 §1 already solved by leading with the noun. `הליכה · ~23 דק׳` has no adjective to agree.
- **It is what makes the number mean anything.** Forty minutes is a different fact walking and
  driving, and §Z2 makes the mode a **derived** fact — so naming it claims nothing a control has to
  stand behind. §AA3's three icons belong to the mode CONTROL, which is M8's; these are the words.

`t.travelMode` is a `Record<TravelMode, string>` at the top level of `he.ts` rather than under
`hero`, because M6a's journey block and M8's control name the same three things (root rule 8).

**Measured at 360px, and it costs nothing:** every state stays exactly the height it was without the
word — `time` and `on-way` one line at `30px`, the `--miss` row two lines at `46px` **with or
without** it, because what takes that width is the `בדרך` button rather than the copy. No horizontal
overflow in any state.

### AE7. The hedge is one function, because two would disagree

`~` + ADR-0114's ladder is `approxDuration` in `lib/duration.ts`, beside `hoursPhrase` and
`formatDuration` rather than in either surface. **M6a needs the identical token**, and a second copy
is how the hero and the day row start saying `~40 דק׳` and `40 דק׳` about one leg.

Two things it decides that the ADR left implicit:

- **The `~` goes inside the bidi isolate, with the digits** — verified by measurement rather than by
  reading, because §Z5's own report of this defect did not stop it reaching the second mockup. In
  Chromium at 360px, with the isolate the `~` renders at x`314` and the `2` at x`326`, so it reads
  `~23`; without it the `~` is at x`336`, to the **right** of both digits, and reads `23~`.
- **The exact-hour rungs are words, so they take `כ` instead**: `שעה` hedged is `כשעה`. A tilde in
  front of a Hebrew word means nothing and is a second neutral character in an RTL run.
