# 0206 — A travel time belongs **between** two points, and the day owes you the truth about it

**Status:** **Accepted 2026-08-25** on the owner's M0 answers, and **amended by them** — read §Z before §M1 or §V1.6, which both changed. **Built so far: the arithmetic only** — §V1.1's, §V1.2's and §V1.7's derivations landed in `@waypoint/shared` with M2 on 2026-08-25 (see §V1's amendment). **Nothing renders yet, and nothing here ships without a mockup** (§M).
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
