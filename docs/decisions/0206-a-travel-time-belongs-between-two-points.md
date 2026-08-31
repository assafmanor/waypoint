# 0206 — A travel time belongs **between** two points, and the day owes you the truth about it

**Status:** **Accepted 2026-08-25** on the owner's M0 answers, and **amended by them** — read §Z before §M1 or §V1.6, which both changed. **Built so far:** the arithmetic (M2), the map's polyline and how it reads (§AB–§AD, M7/M7b/M7c), and **§V1.2 + §Z1 — the hero read and the board's countdown swap (§AE, M6b, 2026-08-26)**. §V1.1/§V1.3/§V1.4's day row (M6a, 2026-08-26) with §AH/§AI's field rounds on top of it. **Nothing here ships without a mockup** (§M).
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

**Amended 2026-08-28 (§AT), by two field reports that are the same defect at both of this rule's
edges.** It says absence must be indistinguishable, and M6a/M11 made absence **structural** — a
journey row and the day's total APPEAR rather than fill in — which turns a third state into a
visible event. So: **"we have not read our own cache yet" is not absence** and the day holds its
first paint for it (§AT1), because a day that paints without it and again with it has told the
reader something twice. And **a total that silently omits a hole nobody could measure is not
absence either** (§AT2) — the reader is not being asked to tell one state from another, they are
being handed a number that looks complete and is not, which is the failure this rule exists to
prevent rather than an instance of the rule.

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

| #       | feature                                                    | why it ranks here                                                                                                                                                                                                                                                                                                                                                      | where                                      |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **1.1** | **Gap minus travel** — `פנוי · 2:00 שע׳ · אחרי 40 דק׳ דרך` | **A correction, not a feature.** The app currently overstates free time. Nothing else on this list is a bug fix.                                                                                                                                                                                                                                                       | `DayJoinRow`, ADR-0159's slot              |
| **1.2** | **Time-to-next + leave-by** — `~23 דק׳ · צאו ב־18:37`      | The U-06 payoff and the sentence the backlog has carried since ADR-0106. Answers the third of the app's three questions.                                                                                                                                                                                                                                               | hero horizon, between two points (D2)      |
| **1.3** | **Per-leg travel in the day**                              | Makes 1.1 legible: the day reads as _place · journey · place_ rather than as holes.                                                                                                                                                                                                                                                                                    | `DayJoinRow`                               |
| **1.4** | **Late-risk mark**                                         | A leave-by already past is the single most actionable thing this data can say. Costs one derivation on top of 1.2.                                                                                                                                                                                                                                                     | wherever 1.2/1.3 render, `--miss` (D7)     |
| **1.5** | **The real polyline**                                      | The visualisation the owner asked for. Cheap — `DayConnector` already draws a line.                                                                                                                                                                                                                                                                                    | `MapPane`, solid + amber (D1, D8)          |
| **1.6** | **Mode per leg, inferred default, instant switch**         | A car trip in Iceland and a metro trip in Tokyo want different defaults, and every number above is wrong under the wrong mode. **The default is derived from the trip's bookings and the switch is instant** — see §Z2.                                                                                                                                                | leg-level, default derived (§Z2)           |
| **1.7** | **Plan-mode day feasibility** — "this day does not fit"    | Plan mode's whole job is building a day that works, and it currently builds days that cannot be walked. Same matrix, no new fetch.                                                                                                                                                                                                                                     | `PlanDay`                                  |
| **1.8** | **Offline route pack**                                     | Our stops are known in advance, so routes are precomputable at ~410 bytes each and ride ADR-0186 §5/§6's existing download, budget and eviction machinery. **This is what makes it work on the plane.**                                                                                                                                                                | `MapService` extract pipeline              |
| **1.9** | **Day travel total** — `3.2 ק״מ · ~48 דק׳`                 | One line, free from data 1.3 already fetched, and it is the day-shape read a planner actually wants. **The mode name is dropped and the minutes hedged — owner, 2026-08-27: the row predates the per-leg mode, so `הליכה` names one leg of a mixed day and is false about the rest. See §AP. And it leads with `לפחות` where a hole had an end nobody placed — §AT2.** | the `day-ambient` strip, BOTH day surfaces |

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

> **§AM (2026-08-27) says what "a per-leg override" is a row ABOUT**, which this section left open and
> M8b could not be built without: the **place pair**, `(tripId, fromPlaceId, toPlaceId)` with the ids
> sorted. §AM5 also records why the compile trap this section set never fires — `travelModeSchema`
> keeps its three routable members and a leg stores `LegTravelMode` instead.

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

> **Superseded in part by §AL1/§AL2/§AL7 (2026-08-27).** The three glyphs were coded before they were
> drawn; the drawing confirms them, mints a **fourth** (`transit` — `ticket` was never free, §AL2),
> and settles the control's shape as glyph-only chips at the touch floor (§AL7).

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

> **Drawn, and amended, in §AL (2026-08-27).** The mark is its own glyph and not `ticket` (§AL2), the
> read carries no `warn` (§AL3), the segment's styling is §AL6, the mode row is §AL7 — whose table
> corrects this section's own "four chips fit one row at 360 (239px of 312px)", measured in the wrong
> box — a fourth stated cost is in §AL9, and §AL8 mirrors the two mode glyphs that have a facing.

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

- **And it draws a STRAIGHT segment, not a road route and not nothing** (owner, 2026-08-27, closing
  the question M8's card was told to settle before coding). The suppression is about the estimate;
  the LINE had never been decided, and the map was left drawing a road route between a declared
  leg's two ends whenever the pair sat under the mode's ceiling — §Z5's own worked example, `73 דק׳
הליכה` against 25 by train, rendered as geometry. **A road polyline for a rail journey is a false
  claim about the PATH**, which is the same failure as the false number one line up, so it goes.
  **Drawing nothing is also wrong**: a declared leg is a journey that genuinely happens, and the
  un-routed dashed connector the map already has means "we could not route this", which is a
  different statement from "this is not a road journey". So the transit leg gets its **own straight
  segment with its own styling** — it asserts the connection and asserts nothing about the route.
  This is more drawing than the fallback would have been, and §M applies to it.

**Not yet drawn.** §Z5 raised this as a question and did not resolve it into a state, so **M8 needs
the mockup extended before it codes this** — the mark, the suppressed-duration row, the copy that
says "no estimate" without promising one, and now the straight segment's own styling on the canvas
(it must not read as the un-routed fallback, which is the one thing it could be confused with).

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

### AC7. Amendment (2026-08-27) — the collar may shorten a straight, and it may not delete a turn

Three field reports off the shipped canvas, with screenshots: _"sometimes the lines simply don't
appear … you click a stop, the route to it should become amber, instead it sometimes doesn't render
at all"_, and _"when zoomed out it simply erases the last turn"_ — one of them ending a block short
of its pin. Two causes, both in §AC6's own mechanisms, and both are the same mistake in different
clothes: **a screen-space idea allowed to decide something it does not get to decide.**

- **The readiness gate lost the line.** `DayConnector` drew when `map.isStyleLoaded()` said so and
  otherwise deferred to `map.once('load')`. `isStyleLoaded()` is false while **any tile is in
  flight** — which is exactly the state tapping a stop creates, because the tap moves the camera —
  and `load` fires **once per map instance**, so every draw deferred after the first paint was
  deferred for ever. The effect's own teardown had already removed the layers, so the amber route
  to the stop you just tapped did not come back until something else changed the key. What adding
  a layer needs is the style **spec**, not loaded tiles: the draw is attempted immediately (a spec
  that has not parsed refuses before mutating anything), and retried on `styledata` — which is also
  what a theme flip's new style fires — with `idle` as the backstop.
- **The collar was allowed to delete vertices.** §AC3's trim spent its ⁦9px⁩ by popping points off
  each end until the budget ran out. At street zoom that is a setback; at trip zoom ⁦9px⁩ is hundreds
  of metres of real road, so it ate the route's **last turn** — and on a leg shorter than two
  collars it returned fewer than two points and ate the **leg**, which is the second half of the
  first report. The trim now shortens the leg's final **segment** and never reaches the vertex
  behind it (`COLLAR_MAX_SEGMENT`, half of that segment, so a very short leg still reads as a line
  rather than collapsing to a dot). The point count out is the point count in. **The collar is
  cosmetic and the path is a claim** — where they disagree, the claim wins.

Two smaller things fell out of the same reading, both of which could have produced the same class
of wrong line:

- **`builtAt` is recorded inside the draw, not beside the call**, and the threshold is also checked
  on `idle`. A draw the style refused used to be remembered as one that happened, which leaves a
  collar measured at one camera while the map moves to another — with no second event to correct
  it, since the threshold is measured from that same stale number.
- **`tolerance: 0` on both GeoJSON sources.** MapLibre's default (`0.375`) is a Douglas-Peucker
  budget applied **per tile zoom**, i.e. the further out the camera the more of the route it is
  allowed to straighten. On a line whose whole job is to be the provider's own geometry (§AB5),
  that is the one thing it must never do; a handful of features costs nothing to tile exactly.
- **`layer()` adds at its place in the paint order**, via a `beforeId` off `PAINT_ORDER`. A
  `draw()` off a zoom does not tear the set down first, so a layer that only now has something to
  draw would land on top of the stack — the neutral tail or dash painting over the amber leg it is
  the background for.

**What did NOT change:** the collar is still a screen distance re-derived on a zoom (§AC6's first
bullet stands), the redraw is still deferred and thresholded (the `place-know.spec.ts` measurement
stands), and a layer is still added only when something belongs to it.

### AC8. Amendment (2026-08-27) — a selection is about its LEG, not the dot at the end of it

Third of the three reports in §AC7, and the one that turned out not to be a rendering bug at all:
_"clicking on a stop highlights the route to it (or from it), but the place details pops up and
hides most of the path."_

The tempting fix is to make the card smaller. **The camera was framing the wrong object.** A pin tap
called `focus(point)` — a pan that centres the selected stop in the band above the card
([ADR-0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §2's `bottomReserve`). So the camera
has always known the card is there, and never knew that §AC2 makes the amber leg the leg **arriving
at** that stop: centre one end of a line and the other end goes under whatever is at the bottom of
the screen. The card was where you noticed it; it was not what caused it.

- **`framePath` frames the leg**, through the ordinary fit path — so it inherits the controls-row
  inset, the card's reserve, the `MAX_FIT` cap and the ease, all of it unchanged. The stop is one of
  the leg's two ends, so framing the leg shows you the stop **and** the road to it.
- **The two stops go in with the path**, because the drawn path is trimmed by the collar and may be
  snapped short of either end (§AC5): the thing you tapped has to be in frame whatever the router
  did with it.
- **The floor is `MAP_ZOOM.DOT_BELOW`, reused rather than minted** (rule 8). That is already the
  zoom at which every pin degrades to a dot, so a leg that cannot be framed above it is one you
  could not read after the move either — and being pulled to country zoom for a declared train
  journey is worse than not framing at all. Below the floor `framePath` **moves nothing** and
  answers `false`, and the caller falls back to the pan it always did. A leg needs no separate
  km ceiling: the zoom the fit resolves to already is the readability question.
- **A selection with no leg is untouched** — a day's first stop, a shelf idea, an all-days scope.
  This is a new branch, not a changed one.

**And `keepCentred` is handed the leg's centre, not the stop's.** ADR-0122 §7's 2026-08-06
amendment re-centres the selection when the band changes underneath it — a card raised over it, an
enrichment growing it, and now a card **folded** away from it. Left reading the stop, that effect
would undo the framing the fold was asked for, one commit after the fold made room for it. It takes
`centreOfPoints(leg)` — the middle of the leg's **extent**, which is what the fit centred, so the
two agree by construction. Still a tolerance-guarded pan and not a second fit: a sheet drag emits a
continuous stream of canvas heights, and a fit per frame is the camera thrash ADR-0129 §3 exists to
forbid.

The pane takes the day's legs as one prop and hands the same array to `DayConnector` and to the
camera, so the line the canvas paints amber and the line the camera frames cannot be different legs.

> **Corrected 2026-08-27, same day, off a screenshot of the result — the two effects each derived
> the subject for themselves, and on a refused leg they disagreed.** `framePath` is allowed to say
> **no** (the floor above), and the band effect did not know that: it took the leg's centre
> whenever a leg **existed**. So on a leg the floor refuses — long ones, which on an Iceland day is
> most of them — the selection effect panned correctly to the stop and the band effect then dragged
> the camera straight off it to the middle of a ⁦40 km⁩ leg, at street zoom. `recentreInBand` pans
> the whole offset and does not care that the point is off screen, so what the owner got was an
> empty hillside reading `אין מקומות באזור`.
>
> The fix is not a guard, it is the fact: **the selection effect records what it actually put the
> camera on, and the band effect reads that** — the leg's centre where the leg was framed, the stop
> where it was not. It closes a second case for free: a leg's **shape arriving from the network** is
> not a selection, and under the derivation it silently changed what the camera was keeping in
> view.
>
> **And the first regression test written for it passed against the defect**, which is worth more
> than the fix: it asserted on **longitude**, and `keepCentred` pans **vertically only**. An
> assertion on an axis the code cannot move is not a test. The one that stands asserts latitude,
> and was checked red against the merged commit before being kept.

> **Corrected again 2026-08-28 — a refusal is not a licence to keep the previous leg's zoom.**
> Owner, on the shipped framing: _"it does it very well. It even zooms in when the stops are close
> to each other. The small issue that after moving from close stops to more far stops, the zoom
> stays instead of zooming out."_ Both halves are this amendment's own doing. A fit sets the zoom,
> so close stops zoom in — and the refusal above fell back to `focus`, **a pan, which keeps the
> zoom you are on**. That inheritance was harmless while the only thing that ever set a tight zoom
> was the user's own fingers ([ADR-0129](0129-the-camera-moves-when-you-ask-it-to.md) §1's rule,
> and "a manual zoom wins" is why the pan reads it). Once the CAMERA sets one per leg, it is
> inheriting **its own** decision about a different leg: walk a day from two stops on one street to
> two an hour apart and you stay at street zoom, looking at a leg that leaves the canvas.
>
> So the floor now caps the fallback instead of merely declining: `framePath` takes the **stop** as
> a second argument and owns both outcomes — the fit when the leg clears the floor, and otherwise
> the pan to the stop at `zoomNoTighterThan(current, DOT_BELOW)`. The caller keeps exactly one
> question ("which subject did the camera end up on"), which is what the correction above made it
> for.
>
> **It only ever pulls back**, and that is the same "nothing owed, nothing moved" the re-fit guard
> runs one level up: a view already wider than the floor keeps its zoom, because zooming IN on a
> leg the camera has just admitted it cannot frame is movement nobody asked for. And the floor
> stays one number — a leg refused at ⁦11⁩ is shown from ⁦11⁩, so crossing the threshold changes the
> **subject** (leg centre → stop) rather than the scale.

### AM10. Amendment (2026-08-27) — a mode the gate refuses is an ANSWER, and §D4 does not cover it

Field report off the shipped mode control: _"I changed a drive to a walk and the route simply
disappeared from the plan day (and day view too probably). On the map it drew a straight line. I'm
guessing that maybe a walk wasn't a legitimate option so it sort of crashed it."_

Nothing crashed, and the guess was exactly right. The pair is past walking's ⁦15 km⁩ ceiling
([ADR-0205](0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) §3's gate), so no
estimate exists or ever will — and every surface renders that as **absence**, per §D4's "absent is
absent, never an error".

**§D4 is right about a mode the APP picked and wrong about one a PERSON picked**, and that is the
whole of this amendment. A mode nobody chose having no estimate is a gap in what we know. A mode
somebody just chose having no estimate is an **answer to what they asked**, and rendering it as a
gap costs the one thing that must not be lost: **the block is the only thing carrying the mode
control**, so the hole vanished and the change could not be undone on the surface that made it.

**That is not a new failure — it is §AM6's, in the sibling case nobody covered.** The declaration
hit it first (_"suppressing the estimate made the block disappear, and with it the control that had
just declared the leg"_), and `DAY_JOURNEY_ARM.DECLARED` was added for exactly this reason. A
refused mode is the second way to have no estimate by nature, and it needed the same treatment.

1. **`DAY_JOURNEY_ARM.TOO_FAR`**, ranked directly below `DECLARED` — a declared leg is never asked
   about and so can never be refused. Like the declaration it keeps the distance and states no
   duration; **unlike** it, it is a problem with the PLAN rather than a silence we chose, so it
   takes the miss tone and the warning mark alongside `OVERRUNS`, which is the same family of fact.
2. **The words are its own.** `בלי הערכת זמן` is a statement about us; `רחוק מדי להליכה` is a
   statement about the leg, and names the mode because a hole showing four chips has to say which
   one it means.
3. **The distance falls back to the crow, as a declared leg's does** — and deliberately **not** for
   a mode still _warming_, which is the distinction that keeps §D4 intact: there we genuinely do
   not know yet, and a crow-flies number that later becomes a routed one is a figure that changes
   under the reader. Here no routed number is ever coming, and the distance is the very fact that
   explains the refusal.
4. **`exceedsTravelCeiling` is the gate's ceiling asked on its own** — no clusters, no network, so
   the answer is instant on a mode switch and available offline. The ceiling and not the whole
   gate, deliberately: `sameClusterOnly` can no longer _reject_ anything, and what is left of it is
   a false negative when a point is missing from the cluster input — a gap in our data, not a
   statement about the journey. `admitsTravelMode` is its only other caller, so the two cannot
   drift.
5. **One derivation, both day surfaces**: `DayTravelReads.refusedFor`, beside `modeFor` and
   `distanceFor`, for the reason `frontend/CLAUDE.md` gives — "changing a day-surface derivation in
   `DayView` only" has cost a release twice, and a leg that reads impossible in Plan and blank in
   Trip is that failure again.

**And the map stops drawing a claim it cannot support.** `pathFor` answers `null` for a refused leg
exactly as it does for one still warming, and the two must not be painted the same way: a warming
leg gets its road in a moment, while a ⁦40 km⁩ walk never will — so the solid amber straight segment
between its ends asserted a road journey nobody can make. It takes §AL6's disclaiming treatment
instead, and `MapDayLeg.declared` is renamed **`unrouted`** to say what the renderer is actually
being told: two causes, one treatment, one flag, named for what the line may assert rather than for
one of the two reasons it may not (rule 8).

### AJ3. Amendment (2026-08-27) — §AJ2's clamp belongs to `heroLeaveBy`, not to `dayJourney`

Field report, two screenshots one minute apart. The day view: `יציאה 00:30 · הגעה ~01:03`, above a
⁦01:00⁩ stop, out of an event running ⁦00:00–00:30⁩. The board, at ⁦00:27⁩: **`6 דקות באיחור ליציאה`**.
One trip, one estimate, two answers ⁦9⁩ minutes apart.

Both are §AJ2's arithmetic, and only one surface finished it. The buffered departure is
⁦01:00 − 34 − 5 = 00:21⁩; the earliest departure that **exists** is ⁦00:30⁩, the end of the event
the traveller is sitting in. §AJ2 decided that the clamp is what makes a late mark defensible —
_"what makes it printable is that the clamp is a departure you could make"_ — and implemented it
**inside `dayJourney`**, right down to a local `departurePassed` whose own comment says
`leave.phase` "is keyed to the buffered one and would mark a clamped leg late at once". That
comment describes the board exactly. The board reads `heroLeaveBy` directly and got the unclamped
answer, so it marked a traveller late for a departure nobody could have made — §AJ2's own
`באיחור`-for-nothing, reached by the one route it had not closed.

- **The clamp moves into `heroLeaveBy`**, which both elevations already call. `dayJourney` loses
  its local copy and behaves identically; the board gains the rule by asking the same question.
  ADR-0159 §1 allows the two to differ in **posture** and forbids a difference about a **fact**,
  and when to leave is a fact.
- **`legDepartAfterMs` is the floor, and it was written out three times** (`DayView`, `PlanDay`,
  and not at all on the board). Three rules in one function now: the leg's own placed instant where
  it has one (§AS), **no floor out of a bed** (§AF3 — a middle night's `endsAt` is a check-out days
  away), otherwise the origin row's end. The board never had it because it built its leg as
  `{ from, to }` and nothing else, so it could not have applied the clamp even had it tried —
  which is why the fix is a shared derivation rather than a second copy of the ternary.
- **Two existing board specs changed their numbers and both were fixture artefacts, not the rule.**
  Their origin ended ⁦30⁩ minutes before `now`, so the clamp bit and the lateness they asserted
  shrank; they measure the buffer's arithmetic, so they take an origin that ends early enough for
  the buffer to be what is under test. Nothing about the ladder or the mode they exist for moved.

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

## AF. Amendment (2026-08-26) — what M6a settled by building the day read

§V1.1, §V1.3 and §V1.4 are built, in the ADR-0159 slot that already existed. **Nothing in §D or §V
changed.** Seven notes: five are decisions the ADR left open and the build had to take, one is a
gap in §AD closed, and one is a defect the render found in this milestone's own first draft.

**On the mockup gate (§M).** None of these went back to a drawing, on the same ground §AE recorded:
the block itself IS drawn — [`a-travel-time-between-two-points-v2.html`](../../mockups/a-travel-time-between-two-points-v2.html)
§1, and this build follows it including round 2's choice of the distance over the route thumbnail —
so what is below is either arithmetic with no drawing to make (§AF1, §AF2, §AF3) or the drawing's
own answer being confirmed by measurement (§AF4, §AF5). §AF6 and §AF7 are measurements.

### AF1. A hole that is BEHIND you says the measurement and nothing else — a fourth arm

§V1.4 says a passed leave-by is the most actionable thing this data can say, and §Z1's three rows
are about the ONE journey the board is counting to. **Neither answers what a hole says once the row
below it has already started**, and on a list that is most of a day: every leave-by of a finished
day has gone by, so read literally §V1.4 prints `זמן היציאה עבר` on every hole of the afternoon.
That is true and useless, and four wrong nudges before breakfast is how a surface stops being read.

So `dayJourney` answers a **four-way** discriminant, and `past` is checked first — a leg that ran
long is still behind you:

| arm      | when                                             | what the block says                                                        |
| -------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `past`   | the row below has started                        | mode · `~40 דק׳` · the distance · what was free. **No leave-by, no mark.** |
| `ahead`  | otherwise                                        | + `יציאה 17:15`                                                            |
| `passed` | the leave-by has gone by and nothing withdrew it | `--miss`, `זמן היציאה עבר ב־17:15`, `בדרך`                                 |
| `on-way` | `בדרך`, or a fix along the leg (ADR-0207 §2)     | teal, `בדרך · נותרו ~12 דק׳`, `ביטול סימון`                                |

**The measurement is not advice, and that split is what the arms are for.** §V1.1's correction is a
fact about the plan — the hole is that long and the walk is in it — so it survives on every arm.
What the quiet arms drop is the _instruction_.

### AF2. This surface gates the CLAIM where the hero gates the REQUEST — and a skip reaches it structurally

ADR-0208 §2 puts the gate on the request: `useDayTravel` is handed no stops, so "the estimate, the
tile and the horizon row cannot disagree." **The day cannot do that and should not.** Its matrix is
one call for every hole of the day, so gating one leg out buys no request back; and the day's
duration, distance and free time are statements about the plan rather than claims about the
traveller. So a denied claim withdraws the **leave-by and the mark** and leaves the measurement
standing. Same thesis, one surface's worth of difference in where it lands.

**And the skip arrives here without going through `travelOrigin` at all**, which is the part worth
recording because the first build of this got it wrong. A skipped event leaves the day list
entirely (ADR-0027's parking lot), so `dayBlocks` measures the hole from the previous
**non-skipped** row — which is exactly the repair §2 refuses in as many words: _"it swaps a wrong
claim for a staler one, and errs toward a louder app, since a longer leg is an earlier leave-by is
a more confident late mark."_ The list does it structurally rather than deliberately. The first
draft compared the claim's own stop against the hole's origin, the two ids therefore never matched
when a skip intervened, and the denial could never fire; it now reads `travelOrigin`'s verdict
directly. **Found by a spec, and only after its first fixture was rebuilt from the report rather
than from the rule** — with two events, skipping one leaves a single row and no hole at all, so the
spec passed while proving nothing.

### AF3. The day's first leg reports no free time, because there is no window to report

§AD said the stay you woke in is the honest origin for a morning and that reaching it needed
`buildDayStopSequence` plus the place-usage index. **It needs neither.** The question is which
ambient night-counting span covers the previous night, which is `ambientEventsOnDate` and
`countsNights` — both already exported, both already the rule `map-pins.ts`'s `stayEnds` encodes
per place. `dayBookendStays(events, date)` in `lib/glance.ts` is that, and it serves both consumers:
the day list's first leg and `travelOrigin`'s `wokeIn`, so **the hero's quiet morning is answered by
the same change** rather than waiting for its own.

The two functions are deliberately **not** merged: `stayEnds` asks the inverse question (does THIS
place's stay bookend the day) over a place's moments, for a sequence; this asks which stay does, for
a leg. What holds them together is a spec in `map-pins.test.ts` asserting the stay one names is the
stay the other puts first — a cheaper guard than refactoring a function two field reports have
already been fixed inside (M7c).

**What that leg may not say is what is free before it.** A middle night has no check-out instant, so
there is no `departAfter` to measure a window from — and the day window's dawn would claim you could
have left at 07:00. It carries the journey, the distance and the leave-by; the free-time run is
absent, which is §D4's absence in the one place it is structural rather than incidental. **The first
build read the stay's own `endsAt` instead and reported `פנוי לפני 0 דק׳`** — a window measured from
next Wednesday's check-out. The bookend-ness is a property of the LEG now, not of its event.

**AMENDED 2026-08-26 — Plan mode never applied this, and a check-out day is where it shows.** Owner,
off the ADR-0209 deploy: _"check out before the day's first stop is treated like you don't have
enough time and not like we've agreed it should behave."_ `PlanDay`'s `planJourney` passed
`departAfterMs: from.endsAt ?? from.startsAt` **unconditionally**, so an 11:00 check-out became the
earliest departure for a 07:15 waterfall, the hole measured −3:45, and the row said `אין זמן לדרך`
about a drive you make at dawn with three hours to spare.

Three things are worth keeping about how it got there:

- **A check-out is a CEILING, so it is not a floor on anything.** "Be out by 11:00" says you may
  leave any time before it, and the arithmetic read it as "you cannot leave before it" — the same
  confusion between the two directions of a bound that ADR-0171 §10b was written for, one axis
  over. On a middle night the same line reads next Wednesday, which is the paragraph above.
- **The fix is not a new input, it is the rule this section already states.** Trip mode has omitted
  `departAfterMs` on a bookend leg since §AD; the repair is Plan asking the same question it
  already had the answer to (`stayRowIds.has(from.id)`), derived rather than a flag a call site can
  forget.
- **The docblock above the drifted line cited the rule it was breaking.** `planJourney`'s comment
  names `frontend/CLAUDE.md`'s _"changing a day-surface derivation in `DayView` only"_ — for
  `flexibleArrival`, added in the same session, one line below the departure that had never been
  ported. Citing a rule beside one line does not apply it to the others: **when a shared
  derivation gets a new input on one surface, diff the whole call, not the line you are adding.**

### AF4. The free time rides the QUIET arms only, and the render is what insisted

The drawing carries the mark alone on both urgent states, and the measurement says why it has to:
`זמן היציאה עבר ב־17:15 · פנוי לפני שעתיים` is ⁦219.70px⁩ of ink in the meta line's ⁦180.75px⁩ box at
360, so `text-overflow: ellipsis` was eating the free time on **exactly the arm that matters** and
pushing `עדיין כאן` ⁦6px⁩ past the block's own edge. Three reasons and they agree: on a passed
leave-by "what is free before the walk" is a number about a departure already missed, the drawing
says so, and it does not fit.

### AF5. `עדיין כאן` sits on the ACTS row, and the hue rides the glyph

At ⁦187.09px⁩ in a ⁦180.75px⁩ box it clipped on the meta line even with the free time gone. On the
acts row it costs **zero** extra height — that row exists on every arm that can earn the mark — and
it is where the mark belongs: the app saying it checked, beside the verb that answers it, which is
the pairing the hero's own row already makes.

The paint follows §Z5 §M4's own argument rather than restating it: `--teal` as ink on this block's
tinted ground measures **3.08:1**, over the 3:1 a graphic owes and under the 4.5 a sentence does. So
the pin carries the location semantics and the words take `--muted` (**5.12:1**). The mode word on
the `on-way` arm keeps teal — it is one word there, which is the two-word-label case
`.wp-event-act.go` already spends teal on.

### AF6. Measured at 360, in Chromium, both themes

`scrollWidth` is exactly ⁦360⁩ and no run paints outside the column in either theme. Heights: the
quiet arms are ⁦58px⁩ — the number the mockup measured for the absorbed block against ⁦87px⁩ for a
strip plus a block — and the arms carrying a control are ⁦96px⁩. Every ink clears AA against the
block's own ground: the amber head/leave ⁦5.15⁩ light / ⁦4.92⁩ dark, `--miss-deep` ⁦6.03⁩ / ⁦5.20⁩, the
distance ⁦5.23⁩ / ⁦4.76⁩.

**One number does not, and it is the app's and not this milestone's:** `--faint` on the free-time
run is ⁦3.42:1⁩ here, against **⁦3.03:1⁩ for the shipped `.day-gap-lbl`** it replaces — so the block
improves it and the ⁦4.5⁩ floor is still missed. Same for the `בדרך` chip's teal at ⁦3.07⁩, which is
`.wp-event-act.go`'s own shipped value. Both are the backlogged app-wide contrast sweep; changing
either here would make the block disagree with the row beside it.

**And the `~` inside the isolate is proven rather than asserted**, with a control: shipped, the tilde
paints at x⁦337.94⁩ and the first digit at x⁦345.52⁩, so it reads `~40`; with the isolate stripped from
the same string the tilde is at x⁦352.41⁩, to the right of both digits, and reads `40~`. §AE7's own
measurement, re-run against the shipped block.

### AF7. The block's arrival IS a layout shift, and it is the design's own trade

A hole with no estimate is ⁦20px⁩ of strip; with one it is a ⁦58px⁩ block. The estimate arrives from a
request, so the rows below a hole move once per cold day-open — ⁦38px⁩ per hole. It cannot be reserved:
§D4 requires absence to cost nothing, so an empty ⁦58px⁩ hole in every gap of every day is the one
outcome that is worse. Cached after the first visit, so a revisit does not shift. **Recorded rather
than fixed**, and on the backlog.

## AG. Amendment (2026-08-26) — five field reports on M6a, and four of them are one mistake

M6a deployed and came back with five things in three messages. **Four are the same failure and it is
worth naming before the individual fixes:** the design for all of it already existed — §Z5 §M2, §AF's
own drawings, and `where-a-route-shows-up-v1.html` §2 — and M6a **built the drawings' numbers and
skipped their states and their stated exceptions.** That is §AE6's lesson (_"the drawing is the spec;
a brief quoting the drawing is not"_) arriving one milestone later, from a session that had read
§AE6 and written it into the board.

**No new mockup was drawn, and that is the point rather than a shortcut.** Three of the five are
drawn states being built for the first time; one is arithmetic; one is a copy word the owner
overrode. A mockup here would be re-deciding what is decided.

### AG1. `overruns` was never rendered, so a journey nobody can make read as nought free minutes

`freeAfterTravel` has answered a **three-way** `fit` since M2 — `fits` / `overruns` / `unknown` —
and §V1.1's own amendment says why (_"the fit is a discriminant and not a boolean"_). M6a carried
`TravelWindow` through `DayJourney` and then rendered only `freeSeconds`, which is clamped at zero.
So a 78-minute walk into a 60-minute gap printed `פנוי לפני 0 דק׳` on the day and `פער של 0 דק׳` on
Plan's chip: not a small amount of free time, a journey nobody can make.

**It is a fifth arm, `OVERRUNS`, and it is checked before every clock arm.** An infeasible leg's
leave-by is behind the previous stop's own end, so `PASSED` fires on it almost at once and would say
`זמן היציאה עבר` for ever — advice about a departure that was never possible. The shortfall does not
decay. `PAST` still leads it: a gap behind you is a record however impossible it was.

Drawn already, in `where-a-route-shows-up-v1.html` §2's `tight` state, and built as drawn: the
`warn` glyph **replaces** the mode mark in the badge column (that column is where the day says what
kind of thing a row is, and what this row is is a problem), `--miss` for §D7's reason, no leave-by
and no `בדרך` — the answer to an impossible leg is to move something.

### AG2. With no gap at all, the shortfall is the wrong thing to say

Owner, on the first fix: _"when there's no gap at all don't say that the way is longer than the gap
by X minutes."_ Right on two counts. Two rows that touch have no gap for the journey to be longer
**than**, so the sentence is arithmetically true and reads as nonsense; and with a zero gap the
shortfall **is** the journey's own duration, which the head one line up already states — printing
one number in two places is the ambiguity ADR-0207 §6 removed from the `בדרך` line.

So the arm splits on `availableSeconds`, which `freeAfterTravel` deliberately does not clamp: at or
below zero the line is `אין זמן לדרך`, and it covers an overlap as truthfully as a touch.

### AG3. `פער`, not `חור` — and the drawing is not the authority on a word

Owner's call. The app already calls this slot `פער` (`t.planDay.gap`: `פער של שעתיים · שבץ`), so
this is one name for one thing rather than a third; `חלון` was the other candidate and is refused
because the app spends "window" on a check-in's own (ADR-0184 §6's `לסגירה`) and two windows would
be worse than two gaps. **The drawing says `חור`**, mockups are never retrofitted, and `he.ts`
carries a note at the string so nobody restores it from there.

### AG4. Plan mode draws the BLOCK, not just a smaller number

Reported as _"I don't see the transit times in the plan day"_, and the drawing had answered it:
`where-a-route-shows-up-v1.html` §2's Plan column is literally `trvBlock() + planSlot(…)` — the
block **and** the chip. M6a shipped only the chip's corrected number, so Plan had no travel time
anywhere and no way at all to learn that a leg was infeasible (its chip simply vanishes below the
threshold).

Both surfaces now render one `JourneyRow` off one `dayJourney`, which is ADR-0159 §1 as written.
**What Plan does not get is the block's controls** — `בדרך` and `עדיין כאן` — because Plan has no
inline settle pair (ADR-0171 §10e) and the drawing's Plan column has no action row for that reason.
That is a difference in posture, which §1 allows; the numbers are a fact, which it does not.

**And the chip's own note line was drawn and skipped too**: `מתוך 160 דק׳ · 40 דק׳ מהם דרך`
beneath it. Shipping a smaller offer with no account of itself is what made the correction read as
an unexplained number. Both values take `gapLabel`'s ladder rather than the drawing's raw `דק׳`, so
a note cannot be in a different unit from the chip it explains.

### AG5. The chip threshold asks the CORRECTED number — the drawing had already decided it

`planSlot`'s drawn condition is `if (left >= 60)`, with the consequence written beside it:
_"Below the chip threshold there is simply no chip — exactly as today. The seam is NOT given a
second job."_ M6a left `earnsChip` on the raw hole and recorded in §AF and on M9's card that moving
it "belongs to M9". **That was wrong twice over** — the drawing had settled it, and leaving it
produced a chip advertising `פער של 0 דק׳`, an offer nobody can take. `earnsChipAt` is the same
threshold in the shape the corrected number can ask it. The **position** is untouched: below the
threshold it is the drag-only seam it has always been, sized by the raw hole, because a drop target
is about where a row may land and not about how much of the slot is free.

### AG6. A hole too short for a `gap` join still has a journey in it — §Z5 §M2, unbuilt

§Z5 §M2 says the journey block _"**ignores** `GAP_MIN_MINUTES` for ADR-0159's own reason, or a
45-minute hole holding a 40-minute walk stays silent."_ M6a gated the leg on
`join?.kind === 'gap'` — and `gapBetween` is **floored** by that very constant, so the block only
appeared where a `שבץ` chip would have. Every hole under an hour, a zero-length one included, said
nothing about travel at all: exactly the silence that sentence forbids, reached by building the
gate on the floored gap.

`DayBlockEntry.from` is now recorded on every adjacency rather than only where a join survived. The
floor decides whether **free time** is worth stating; it has never had anything to say about travel.

### AG7. A place visited twice is two stops and one pin — the map drew the wrong leg

The only report that is not M6a's. Owner: _"instead of stretching a line from #4 to #5 which is what
it was supposed to do, it stretched from #1."_ `screens/Map.tsx` resolved the selection with
`orderedPins.findIndex((pin) => pin.selected)`, and `orderedPins` mapped stops **to pins** — one pin
per place — so a place with two events in a day appeared twice as the same object and `findIndex`
answered the first occurrence.

**M7c's bookends made this the ordinary case rather than an edge one:** on a middle night the stay
is the day's first stop _and_ its last, so the duplicate is there on most days.

No new rule was needed. {@link relevantMoment} already decides which visit a place is about, and
`buildPinOrderIndex` already uses it to pick the **number** the pin wears — so reading it here is
what makes the amber line agree with the badge, which is precisely what the report was checking.
The decision moved out of a `useMemo` into `lib/map-pins.ts`'s `amberLegIndex`, per
`frontend/CLAUDE.md`'s rule that what the canvas draws belongs in a pure function: it was untestable
where it was, which is why it shipped wrong.

### AG8. Measured at 360, in Chromium, both themes

Every new arm fits: the shortfall line is ⁦153.03px⁩ of ink in its ⁦207.75px⁩ box and ⁦165.42px⁩ at the
`H:MM` rung; `אין זמן לדרך` is ⁦63.16px⁩. Nothing clipped, no run outside the column, `scrollWidth`
exactly ⁦360⁩ in both themes, and every arm stays the ⁦58px⁩ the quiet arms already were.

## AH. M6a's second round of field reports — the Hebrew, the tolerance, and where free time belongs (2026-08-26)

The owner read the deployed rows and sent four reports plus two questions. Only one is a defect in
the sense §AG's were: the rest are the app **saying** things badly, and the owner's framing is the
entry worth keeping — _"let's give a huge emphasis on sounding natural with our Hebrew."_

Three of the four were mine to get right the first time and one was a decision M6a took and
recorded, with measurements, in the wrong direction. That last one is the interesting entry.

### AH1. `פנוי לפני X דקות` was not Hebrew, and the phrase it hid was the arithmetic

Owner: _"`פנוי לפני X דקות` is bad Hebrew · I'm not even sure what you meant to say."_ It meant "of
this hole, X is actually yours; the rest is the walk", and it reached for `לפני` because the journey
sits at the **end** of the hole — which is a fact about the shape of the slot that no reader asked
for, wrapped in a phrase that reads as "free 46 minutes ago".

`46 דק׳ פנויות` replaces it, and the agreement is **composed** rather than dodged
(`freeTimePhrase`, `lib/duration.ts`): the ladder has exactly two singular rungs, so agreeing costs
three lines and buys `שעה פנויה` instead of `שעה פנויות`. Every other length in the app is noun-led
precisely to avoid that (`פנוי · 2:40 שע׳`), and the plain gap strip now reads the same phrase — one
fact said one way, whether or not the hole has a journey in it.

**And `פנוי לפני 0 דק׳` was a real defect underneath the phrasing.** `dayJourney` checks `PAST`
before `OVERRUNS` on purpose — advice about a departure is useless once the next row has started —
but `freeSeconds` is **clamped at zero**, so the record a past hole kept was the one number that is
not true. The shortfall is stated there now, in the live arm's own words, and the **tone** stays
`PAST`'s quiet: a finished day painted in `--miss` warns about something nobody can act on, which is
the opposite of §D7's reason to exist.

Two floors follow from the same report, and they answer different questions:

- **`statesFreeTime` = ⁦15⁩ minutes** (`lib/gaps.ts`, owner's number). `GAP_MIN_MINUTES` asks whether
  a hole is worth **offering** as a slot; this asks whether it is worth **stating** as free. Sixty
  for the offer and fifteen for the statement is not a contradiction. It also repairs a silence M6a
  broke: a 45-minute hole earns no `gap` join, so Trip mode said nothing about it, and the block —
  which ignores that floor on purpose (§Z5 §M2) — carried the free-time run in with it and started
  reporting `5 דק׳ פנויות`. The walk is still stated. The five minutes are not.
- **A journey the ladder cannot name is not a journey.** `ROUTE_MIN_CROW_M` is ⁦10m⁩, so a ⁦20m⁩ hop
  is routed, answers ⁦24⁩ seconds, and drew a whole block reading `~0 דק׳`. `approxDuration` now
  answers `null` below half a minute — its existing guard only caught a non-positive input — and
  `dayJourney` returns `null` there, so the block does not exist rather than existing empty.

### AH2. The tolerance is the buffer, and the grace is on the time

Owner: _"for a 20m distance it says that we don't have enough time · for any distance that takes a
really short time we must add some tolerance"_, then, of a ⁦1.2km⁩ minute-long drive between two
touching stops: _"you're handling this right? giving a grace based on the time and not the
distance?"_

`freeAfterTravel` had no slack at all, so any shortfall was `OVERRUNS`. It now tolerates
`TRAVEL_FIT_TOLERANCE_SECONDS`, and **the number is derived rather than chosen**: it is
`TRAVEL_BUFFER_SECONDS`. The first attempt was a hand-picked two minutes, and the owner's _"only 2
minutes? is this enough time to give?"_ is what found the better argument — the buffer is padding
this app adds to **every** leave-by because it does not trust an OSM estimate to the minute, so it
is the error bar we have already admitted to. A shortfall inside that bar is indistinguishable from
zero given what we know, and calling it a broken plan reads one uncertainty two ways: generous when
recommending a departure, strict when assigning blame. Derived, so the device pass retunes both at
once.

The grace is **seconds against seconds**. A ⁦1.2km⁩ drive that takes a minute is inside it and a
⁦1.2km⁩ walk that takes twenty is not, which is the point: distance is what a leg looks like, time is
what it costs you. The backlog's "proportional half" line still stands and this does not close it.

### AH3. Free time does not belong on the journey row — reversing M6a's absorption

The entry worth reading. Owner: _"do we really want to state on this row that we have free time, or
should it be written in a quiet way and not in the row?"_

M6a **absorbed** the free-time strip into the journey block on purpose, and §Z5 §M2 and the v2
mockup's §1 both drew it that way: one object per hole (ADR-0159), measured at ⁦58px⁩ against ⁦87px⁩
for a strip plus a block, with both of `freeAfterTravel`'s numbers still said. The reasoning was
about **space**, and it was answering the wrong question. The block is about the **leg** — mode,
distance, when to leave. What is free is about the **hole**. Two subjects on one ⁦180px⁩ line.

**M6a's own measurements were the argument against it and were read as a layout problem instead.**
§AF's build log records the two runs together at ⁦219.70px⁩ of ink in a ⁦180.75px⁩ box, with
`text-overflow: ellipsis` eating the free time on exactly the arm that mattered — and the fix taken
was to hide the free time on half the arms (`quiet` gating the free run). A line that can only hold
both facts sometimes is a line holding two subjects; the gate was the evidence, dressed as the
repair.

So the strip is back, below the block, carrying the corrected number — and the fill affordance
(ADR-0161 §9) went with it, because the thing that states the free time is the thing that offers
it, and keeping both would draw two `＋` marks for one hole. `JourneyBlock` lost its `free` prop,
its `onFill`, and the `.day-trv-free` / `.day-trv-add` rules with them.

**The cost, measured rather than asserted:** a hole with a journey and free time worth stating is
⁦88px⁩ where the absorbed version was ⁦58px⁩ — which is, to a pixel, the ⁦87px⁩ M6a rejected. What pays
part of it back is §AH1's floor: a hole whose remainder is under ⁦15⁩ minutes renders no strip at all
and stays at ⁦58px⁩, and those are exactly the holes where the absorbed line had least to say.

`narrowGapForTravel` had to be fixed to make this true. It spread `...free` and rewrote only
`fill.end`, so a narrowed slot still reported the whole hole's `minutes` — an object contradicting
itself, and the strip that asks a `Gap` how long it is duly stated a length the walk had eaten.

### AH4. `הדרך ארוכה מהפער ב־X` → `חסרות X לדרך`, and the modes are activities now

Owner: _"`הדרך ארוכה מהפער ב X דקות` is also bad phrasing · maybe `הדרך ארוכה ב-X דקות מהזמן שיש
לנו`"_. Their version is right about what was wrong — `ארוכה מהפער ב־` stacks two prepositions and
asks the reader to hold `פער` in their head to parse it — and it is **41 characters** where the meta
line has ⁦180px⁩ of box. `חסרות 18 דק׳ לדרך` says the same thing in ⁦101.89px⁩ where the shipped line
took ⁦153.03px⁩, leads with the number you act on, and is the sibling of `אין זמן לדרך` rather than a
third way of talking about one hole. The word `פער` leaves the sentence and nothing is lost: what
the journey is longer than is the hole it is drawn inside.

And `t.travelMode` was mixing categories. Owner: _"it says `רכב`/`הליכה` · maybe it should be
changed to `נסיעה`?"_ — `הליכה` is the activity, `רכב` is the vehicle and `אופניים` are the objects,
so of the three only the walk read as a length of time. Every call site uses these as the noun
leading a duration (§D10's agreement dodge), so all three are gerunds now: `הליכה` · `רכיבה` ·
`נסיעה`. A fourth mode joins as a gerund or the set reads as an inventory.

### AH5. Measured at 360, in Chromium, both themes

`scrollWidth` exactly ⁦360⁩, no run outside the column, nothing clipped, in light and dark. Every
meta line got shorter: the shortfall arm ⁦101.89px⁩ of ink in its ⁦207.75px⁩ box (⁦153.03px⁩ before),
⁦114.28px⁩ at the `H:MM` rung, `אין זמן לדרך` ⁦63.16px⁩, the leave-by alone ⁦62.19px⁩. Heights: every
quiet arm ⁦58px⁩, the two arms carrying an acts row ⁦96px⁩, the strip ⁦20px⁩ as a control and ⁦16px⁩ as a
statement — and the whole hole ⁦88px⁩ / ⁦58px⁩ per §AH3.

### AH6. Deferred, with the decision already taken

Owner: _"should leave by's be rounded to the closest 5 minute divisible time?"_ Yes — `יציאה 14:11`
is false precision, and §D5 is the principle: the duration it derives from is hedged (`~44 דק׳`) and
the instant printed from it is not, so the hedge evaporates where it matters most.

Two things make it more than a formatter change, and are why it is a backlog line rather than part
of this round. **Direction:** rounding to nearest can round **later** (14:13 → 14:15), telling you
to leave after the honest instant and quietly eating the buffer — so it floors, which only ever
gives time back. **Where:** the board's countdown tile, the lifted hero and the day row all read one
`heroLeaveBy` so they cannot name three minutes for one departure, which means the rounding belongs
there and therefore also moves **when the late mark fires** (§V1.4), up to four minutes earlier.
That is a §V1.4 change wearing a copy change's clothes.

## AI. Two defects in M6a's leave-by, found by drawing it (2026-08-26)

Neither was reported off the app. Both were read off
[`mockups/a-day-starts-and-ends-at-a-hotel-v1.html`](../../mockups/a-day-starts-and-ends-at-a-hotel-v1.html)
by the owner while reviewing ADR-0209's proposal — the format doing exactly what
`.claude/skills/design-mockups` claims for it, on shipped code the drawing merely reproduced
faithfully. Owner: _"on check in day, in the mockup it says that you're suggesting to leave before the
previous stop is finished and ahead of time, getting to the hotel even before check in starts, even
though you have enough time to just arrive later."_

### AI1. A leave-by may only be counted back from a DEADLINE, and a window's opening is not one

`dayJourney` reads `arriveByMs: Date.parse(leg.to.startsAt ?? '')` **unconditionally**. For an
ordinary event that is right: the start is the moment you have to be there. For a **held** span it is
not — `edgeMeaning` answers `not-before` for a check-in's start, and `window` once its other bound is
authored (ADR-0184) — so the block counted back from `17:00`, which is the hour the door **opens**,
and printed `יציאה 16:18`: leave now to arrive the instant the hotel will take you, when nothing was
due until `20:00`.

**The fix is a gate, not a formula.** Where the destination's start edge is not `exact`, there is no
deadline to count back from, so the leg states **no departure** — and what replaces it is ADR-0209
§4's derived arrival, which is a statement the app can stand behind: `הגעה ~17:02`, with `--miss` ink
only when it lands after the window **closes**.

**And the gate is on the LEAVE-BY, not on the sentence** — owner, immediately, and it is the half that
would have shipped broken: _"on drives/walks to a flexible event like a check in, we must make sure
that if you haven't left by the time that the app suggests (16:40 in your example) the app doesn't
show you as being late."_ Withholding the printed departure is not enough. `dayJourney` still derives
`heroLeaveBy` and sets `arm: PASSED` from its phase, so the block would turn `--miss` the minute that
invented deadline passed; the board's countdown tile, reading the same function, would put `באיחור` in
its unit slot (ADR-0208 §1). A late mark against a deadline the app made up is the exact thing
ADR-0207 and ADR-0208 are both about: **a claim needs something to stand on.**

So a flexible destination licenses **no leave-by at all** — no clock, no `PASSED` arm, no late mark,
on any surface that reads it. **This needs no new arm**: it is the shape ADR-0208's denied claim
already has, `{ ...measurement, arm: AHEAD, leaveByMs: null }` — the measurement stands and the advice
is withheld. One predicate over `edgeMeaning(to, 'start') === 'exact'`, asked by every surface that
derives a leave-by (the day's two, the lifted hero, the board), rather than a check at each place a
string is printed.

This is §D5 one level up. The buffer exists because the app must not state a confidence it does not
have about a _duration_; this is the same refusal about a _deadline_ the app invented.

### AI2. A leave-by may not be earlier than the row it leaves from

`leaveBy` is `arriveByMs − (travelSeconds + buffer)`, with no clamp against `departAfterMs`. So the
same block advised leaving at `16:18` from a stop that runs to `16:40` — a departure from inside an
event you are still in.

**And §AH2's tolerance makes this MORE reachable, which is worth stating plainly.** With a 20-minute
window and a 22-minute drive the shortfall is 2 minutes, now inside `TRAVEL_FIT_TOLERANCE_SECONDS`,
so the leg reads as fitting — and the leave-by it hands back is behind its own origin. Before the
tolerance this case was `OVERRUNS` and printed no leave-by at all, so widening the grace uncovered
it. The tolerance is still right (§AH2's argument is unaffected); it needs the clamp beside it.

The clamp is the honest one: a leave-by at or before the origin's end is **not** a leave-by, it is
"as soon as you are done here". Options for the build, and this is deliberately left open — the
number is not the question, the sentence is: state nothing, or state the arrival (as AI1 does), or
say the departure is the previous row's own end.

**ANSWERED 2026-08-26 in §AJ2, by the third of the three options** — and the build took the first
one, which the owner then reported as an inconsistency. See §AJ.

### AI3. What this does not change

`heroLeaveBy`'s arms, the buffer, §Z1's swap threshold and §V1.4's late mark are all untouched: a
leave-by that exists is still computed and rendered exactly as it is today. Both fixes are about
**when the app may state one at all**, which is the same shape as §AF2's claim-denied arm — the
measurement stands, the advice is withheld.

**BUILT 2026-08-26.** `dayJourney` takes instants, not events, so the gate is asked at each caller
that holds the `TripEvent` — both day surfaces and `Home` (the board and the lifted hero read the
same `heroLeaveBy`) — over `isExactEdge`, which already existed. `flexibleArrival` and
`windowClosesMs` go in; `arriveAtMs` and `arrivesAfterClose` come out; the `PASSED` arm cannot fire
without a leave-by.

**And the build found a third face of the same mistake, which no amount of reading had.** The
**fit** was measured to the window's OPENING too, so `אין זמן לדרך` fired about a check-in you had
three more hours to make — and "arrives after it closes" was unreachable, because `OVERRUNS` got
there first. The fit now measures to the last moment that still works, which on a window is its
close; missing the close and not fitting the window are then one fact, riding the `OVERRUNS` arm
with a sentence you can act on (`הגעה ~20:32 · אחרי סגירת החלון`) rather than the generic shortfall.

**A fourth thing fell out of the same specs, and it belongs to §AG6 rather than here.** That section
recorded the sub-hour hole as fixed by setting `DayBlockEntry.from` on every adjacency. It was half
fixed: the leg was derived and then **not rendered**, because `DayView`'s list read
`{join && <JoinRow/>}` and `gapBetween` is floored at `GAP_MIN_MINUTES`. So §Z5 §M2's own example —
a 45-minute hole holding a 40-minute walk — was still silent in Trip mode, while **Plan gates on
`prevEnd` and had been drawing it all along**: the two day surfaces disagreeing about a fact, which
ADR-0159 §1 forbids and ADR-0171 §10e already repaired once. `JoinRow` takes a nullable join now, and
a journey renders whether or not the hole earned a join.

## AJ. §AI's third round — a floor is not a deadline, and a clamped departure is one the app may state (2026-08-26)

Three reports off the §AI/ADR-0209 deploy. The first is a defect §AI shipped; the second closes the
question §AI2 deliberately left open, and closes it the other way from how the build guessed; the
third un-refuses a row ADR-0054 had refused the same morning, because §AJ1 removes its reason.

### AJ1. An open floor is a deadline the app does not have

> _"It shipped but with a bug on the day prior to the car rental … we're checking in technically the
> day after check in day, at like 2am and also after the car rental at 00:00."_

Day 1 of the trip: the last flight lands at `23:20` and the hotel checked into that night opens
`מ-15:00`. The fit measured the 1:42 drive against **15:00 the same morning** — a deadline eight
hours behind its own origin — so the one leg of the day nobody can be late for read `אין זמן לדרך`.

**§AI got the leave-by right and left the FIT keyed on the opening whenever there was no close.** The
line was written down at the time as _"a floor with no close keeps the opening, which is all the app
knows about it"_, and the opening is precisely the half a floor says you may arrive **after**. The
same sentence in `windowClosesMs`' own docblock — _"absent on an open floor, which can be missed by
nothing"_ — was already the counter-argument, one function away.

So the two ideas are separated, and naming them apart is the whole fix:

| the destination's start          | fits against  | advises a departure |
| -------------------------------- | ------------- | ------------------- |
| exact (`15:00`)                  | that moment   | yes                 |
| a window that shuts (`15–19:30`) | the **close** | no (§AJ2)           |
| an open floor (`מ-15:00`)        | **nothing**   | no                  |

`deadlineMs` is that column; `undefined` means the journey cannot fail to fit, so there is no
free-time half either — the same structural absence the day's first leg out of a bed reports (§AF3).

**And the floor's own hour must not retire the row.** `PAST` was keyed on `arriveByMs`, so at 20:00
— airborne — the block went quiet because the hotel's desk had opened at 15:00, dropping `הגעה ~01:02`
exactly where somebody wants it most. It is keyed on the deadline now, and on the predicted
**arrival** where there is none.

### AJ2. §AI2's open question, answered: the departure is the origin's own end, and both are said

§AI2 listed three options and the build took the first (state nothing). The owner read the result as
an inconsistency:

> _"Why does it sometimes say יציאה ב and some other times הגעה ב? Don't we prefer consistency? Maybe
> we should show both?"_

**They were reading three situations wearing two sentences.** `הגעה` was serving a genuinely flexible
destination ("come when you like"), a window, **and** a leg with no slack — and the last of those is a
warning that looked exactly like the first, which is reassurance. The reported row is the third: a
60-minute hole, a 59-minute drive, a hard `15:00` start. The **drive** fits; the **buffer** does not
(`15:00 − 59 = 14:01`, and `15:00 − 59 − 5 = 13:56` is inside the stop that runs to 14:00). So the app
had a deadline, had advice, and said nothing about going.

So: **the departure is pulled forward to the earliest one that exists — the origin's own end — and the
arrival rides beside it.** `יציאה 14:00 · הגעה ~14:58`. Two nouns, the day row's own voice, the app's
own `·`. `יציאה` now means "there is a deadline to advise against" and `הגעה` **alone** means "there
is none", which is a difference a reader can act on.

**What makes the clock printable is that the clamp is a departure you could make**, so the late mark
it licenses is defensible — and `PASSED` is therefore measured against the **clamped** instant, never
the buffered one. Firing it off `13:56` is exactly the `באיחור`-for-nothing §AI2 removed. The owner's
constraint — _"if you haven't left by the time that the app suggests the app doesn't show you as
being late"_ — was about a **flexible** destination, which still states no departure at all.

**A closed window still gets no departure**, deliberately, though it now has a deadline for the fit:
`יציאה 18:26` for a lagoon open from 15:00 is arithmetically true and nobody plans against it.

**Measured before the sentence was chosen, and the measurement corrected a claim made from memory.**
The meta line's box is **206.95px** at 360 (237px at 390), not the 180.75px §AF4 recorded — that
figure was measured with the free-time run and the acts mark in the same line. Every candidate fits:
the combined sentence is **140.06px** of ink and the widest already shipping in that slot
(`הגעה ~20:40 · אחרי סגירת החלון`) is **171px**. Width was the argument against "show both" and it
was not a real argument.

### AJ3. The leg from the pickup into the bed exists

> _"And btw it should also show the way from the car rental to the hotel, right?"_

Yes. [ADR-0054](0054-ambient-span-events-off-the-day-schedule.md)'s amendment refused this leg the
same morning, on the reasoning that a stay has no per-day arrival instant and the only bound on offer
is its check-in floor from _yesterday_. That reasoning was **correct about §AI's code and wrong as a
decision**: what it was avoiding is precisely the `אין זמן לדרך` §AJ1 has now removed. With a floor a
non-deadline, the leg says the one thing it can — `הגעה ~00:31` — which is what somebody landing at
midnight actually wants to know.

Two things the leg needs that no other leg did, both now on `DayLeg`:

- **`departAfterMs`.** The origin is a span **edge**, and a span's `endsAt` is its RETURN — nine days
  out on a car hire — so `endsAt ?? startsAt` measures the drive to the hotel from next week. The leg
  carries the edge's own placed instant.
- **`fromEdge`.** `endpointPlaceId(from, 'leaving')` answers "where did this row leave you", which for
  transport is the **destination**: right for a flight you got off, wrong for a hire you just picked
  up, whose place is its origin. A pickup and a return at the same counter hides this completely —
  which is exactly the trip it was found on, so it is written down rather than discovered twice.

## AK. An infeasible leg is still a JOURNEY — the warn glyph keeps its mode (2026-08-26)

> **§AK3's four questions are answered in §AL4/§AL5 (2026-08-27), off the drawing.** Two corrections
> to this section land there too: §AK2's stated precedent (the avatar badge) **does not exist in the
> code**, and the idiom to start from is `PlaceBadge`'s corner mark (§AL4); and its matrix count is
> seven rather than eight, because transit × mark is unreachable (§AL5).

Owner, off the shipped day: _"we should create specific icons for not enough time, so that instead
of showing a warning glyph, it should show a car with a warning, and for walking a person with a
warning… That way it's clearer that they're of the same class of rows."_

**Agreed, and it reverses a decision this ADR shipped one PR ago.** `DayJoinRow.tsx` swaps the mode
mark out entirely — `icon={overrunning ? 'warn' : travelMode}` — with a comment giving its reason:
_"the badge column is where the day says what kind of thing this row is, and what this row is is a
problem."_ **Nothing here is built** — §M's rule holds, the mockup comes before the code.

### AK1. Why the swap is wrong, and it is not a matter of taste

**The container already says "problem", so the glyph is spending its slot on a repeat.** Measured in
the shipped code: an overrunning journey takes `tone: 'miss'` (`DayJoinRow.tsx:254`), which paints
the block and its text in §D7's `--miss`. The row is _already_ unmistakably negative before the
glyph is chosen. Swapping the glyph adds no state information and costs the only thing the glyph was
carrying.

**And what it costs is the row's class.** The shipped comment's own premise is right — the badge
column says what kind of thing a row is — but the conclusion inverts it: two journey rows that
differ only in feasibility end up in **different visual classes**, one reading "journey" and one
reading "error". A day of five stops with two tight legs reads as three journeys and two failures
rather than as five journeys, two of which are tight. That is the owner's "same class of rows", and
it is a fact about the drawing rather than a preference.

**"The mode is still named in the head" is true and does not answer it.** The head is what you get
when you _read_ a row; the glyph is what you get when you _scan_ a day. The scan loses the mode
exactly on the rows where it matters most — 49 minutes short **driving** is a different problem from
49 minutes short **walking**, and the ladder ADR-0206 §D3 rounds to cannot tell you which.

### AK2. Compose the mark; do not mint the matrix

**The obvious build is the wrong one.** A glyph per mode per state is 3 × 2 = **six**, eight once
§AA4's תחב״צ has one, and every future mode doubles its own row. That is a combinatorial mint of
hand-drawn SVGs, all of which must stay consistent with each other.

**One mode glyph plus one composited warning mark** is four assets — walk, car, bicycle, mark — and a
fourth mode costs **one** glyph rather than two. The repo already has this idiom rather than needing
a new one: `ui/Icon.tsx` composites the avatar-hero badge (ADR-0133 §6/§12), and
[ADR-0167](0167-the-badge-is-the-thumbnails-frame.md) is the frame-and-badge rule. **Start from
those, not from a blank canvas** (rule 8).

### AK3. What the mockup has to settle, because none of it is decidable from here

1. **How loud the mark is when the block is already `--miss`.** Two full-strength negative cues on
   one row is the failure §D8 exists to prevent in a different register. The mark and the tint have
   to be measured together, in both themes, or the row shouts.
2. **Where the mark sits, at the badge column's real size**, and whether it survives there — a
   corner mark on a small glyph is exactly the sort of thing §AC3's collar turned out not to be.
3. **Whether `PASS`-armed rows take the mark at all.** `DayJoinRow.tsx:292` already refuses `--miss`
   on a finished day, on the grounds that _"a finished day painted in `--miss` warns about something
   nobody can act on, which is the opposite of §D7's reason to exist."_ The same argument may refuse
   the mark; it is not automatic that the two follow each other.
4. **The `ON_WAY` and `arrivesAfterClose` arms** take `miss` too and are not overruns. Whether they
   read the mark, the plain mode glyph, or something else is a question this amendment deliberately
   does not answer.

**Whose it is:** the icon work §AA3 opened — `ui/Icon.tsx` gains walk, car and bicycle — is the same
work, so this rides with it rather than beside it. Its home is a **follow-up to M6a** (which shipped
the swap) and it must land before or with §AA3's glyphs, so that the set is drawn once as a set.

## AL. Amendment (2026-08-27) — what M8a settled by drawing the set

**Drawn in [`mockups/the-mode-set-and-transit-declared-v1.html`](../../mockups/the-mode-set-and-transit-declared-v1.html).**
§AA3, §AA4 and §AK each asked for part of one icon set and none of them could answer the questions
the other two raised, which is why M8a drew all of it in one pass. **Nothing below is built** — §M
still holds, and the file is awaiting the owner. Ten sections in, this amendment is the one place a
later reader should look for the marks themselves.

Two of the amendments below **correct this ADR** rather than extending it. Both were found by
rendering, and both are recorded with the mistake rather than quietly fixed.

### AL1. The three mode glyphs were already coded, so §AA3 has been half-satisfied since M6a

`ui/Icon.tsx:238-245` carries `walking`, `cycling` and `driving`, minted by M6a from the v2 mockup's
own **proposal** frame — the one thing that file labelled as not from the code. §AA3's instruction
was "draw them at 24px **before** coding", and the order came out reversed.

**Nothing about them needs changing**, which is the useful half of the finding: on the real 24 grid
at the real stroke weight they hold, and the set reads as a set. What it costs is that M8a's §1 is a
**confirmation pass on shipped assets**, so §Z5 §M5's word chips had to be drawn back by hand to
have a baseline at all — the mockup's `.msq-was`. A mockup written after its change otherwise draws
the fix in both columns and reports a win it never measured.

### AL2. תחב״צ gets its OWN glyph, and `ticket` was never free

**§AA4's shape and `Icon.tsx`'s own comment both stand `ticket` in for a declared leg. That is
wrong, and by this repo's own rule.** `constants.ts:1520` is `booking: 'ticket'`, and four screens
already spend the glyph on exactly that meaning — `Index.tsx:234`, `Home.tsx:1107`,
`IndexBookingsView.tsx:246`, `HeroLift.tsx:308` (`t.hero.toBooking`). Two meanings behind one glyph
is the drift [ADR-0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) was written to end,
and `Icon.tsx`'s own `sync` comment states it: _"Two meanings behind one emoji is exactly the drift
this sweep exists to end."_ A mode is not a booking.

**So `transit` is minted — a vehicle from the FRONT:** body, windscreen band, two headlights, two
mirrors, on the same 24 grid at the same `stroke-width: 2` with the same round caps.

- **Front-facing is the decision, not a style.** Every other member of the set is a side view, so a
  side-view bus differs from `driving` only by a cabin arch against a wheel box — ~3px at the 21px
  the tile paints. A front is the one silhouette in this set that cannot be confused with another
  member of it.
- **The mirrors cost two segments and are what make it a bus rather than a train.** תחב״צ is buses
  **and** trains; a train front declares rail, which is the narrower claim.

**The set is therefore FOUR glyphs and ONE new asset**, because §AK's mark is `warn`, which already
exists.

### AL3. `warn` may not also say "no estimate" — §AK takes it

The v2 mockup's §4 drew the declared leg's line as `icon('warn') אין לנו מידע על קווים`. **§AK now
makes `warn` mean "this journey does not fit", so both meanings would land on the same block, on the
same surface, in the same release** — §AL2's rule one line up, arriving from the other direction.

It was also wrong on its own: **an absent estimate is a fact, not a warning.** So the declared read
carries no mark at all. What states the absence is the **missing continuation of the head** — no
`·`, no number — and the meta line names it so it does not read as data that failed to load:
**`בלי הערכת זמן`**. It says exactly what is not there and promises nothing (no `עדיין`, no `טרם`),
which is the one place §D9's original caution still bites.

### AL4. The mark composites on `PlaceBadge`'s corner geometry — §AK2's stated precedent does not exist

**§AK2 says to start from "`ui/Icon.tsx` composites the avatar-hero badge (ADR-0133 §6/§12)".
There is no such thing.** `ui/primitives/avatar.css` has no badge, no pseudo-element and no overlay,
and ADR-0133 §6/§12 are the avatar picture page's two states and the uploaded avatar's trust class.

**The idiom that ships is `PlaceBadge`'s corner mark** — `.wp-placebadge-mark`,
[ADR-0167](0167-the-badge-is-the-thumbnails-frame.md) §1 with §11.2/§12 — and it is the better
precedent anyway: a corner mark on a **32–40px rounded badge**, which is `.day-trv-ic`'s box
exactly, and its own owner review already answered §AK3.1 (_"a bare teal pin, not a pin in a teal
disc"_ — the disc was doing two jobs and paid for them in size).

Measured at 360 and 390, both themes:

| what                                | value                              | against                                             |
| ----------------------------------- | ---------------------------------- | --------------------------------------------------- |
| the tile the mark hangs on          | `.day-trv-ic` **38×38**, radius 12 | the glyph inside it is 21px                         |
| the mark                            | **15px** · 39% of the tile         | `PlaceBadge`'s 17px on 32–40px · 42–53%             |
| its overhang                        | **5.8px** per axis (`size / -2.6`) | `.wp-placebadge-mark`'s own ratio                   |
| clipped by `.day-trv`'s `overflow`? | **no**, 4.2px of slack             | ADR-0167 §11.2 — the one trap this geometry carries |
| it covers of the mode glyph's tile  | **38%** of the mark's own area     | most of the mark is outside the tile                |
| block height with / without         | **58px / 58px**                    | §AK2's whole claim, checked                         |

**And it takes no hue of its own, which is §AK3.1's answer.** The tile is already tinted by the
block's tone and the glyph in it already carries that tone's ink, so the mark inherits
`currentColor`: the **shape** is new, the colour is not. A `--miss` triangle on a `--miss` tile
inside a `--miss` bordered block is the third statement of one fact.

### AL5. §AK3.3 and §AK3.4, answered by one rule rather than a table

**The mark says the JOURNEY does not work; it does not say the clock moved.**

| arm                               | mark | why                                                                           |
| --------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `OVERRUNS`                        | yes  | the leg does not fit the hole — a fact about the journey                      |
| `arrivesAfterClose`               | yes  | you reach it after it shuts — the same class of fact (§AK3.4)                 |
| `PASSED`                          | no   | the leg is fine, the hour moved, and the block already says so in words       |
| `ON_WAY`                          | no   | somebody is moving; a warning contradicts what the state asserts              |
| a day that has ended, overrunning | yes  | the record stands; the **tone** carries the quiet, not a second rule (§AK3.3) |

That last row is what §AL4's `currentColor` buys: the finished day's own quiet ink takes the same
mark with no extra rule, so `DayJoinRow.tsx:292`'s refusal of `--miss` on a finished day and this
mark are no longer coupled the way §AK3.3 worried they might be.

**And the render found a cell §AK2 counted that cannot be reached: transit × mark.** A declared leg
carries no duration, so `freeAfterTravel` has nothing to subtract — it can never overrun, never
arrive after a close, and never pass a leave-by it does not have. The mockup draws the mark over the
bus **labelled as a demonstration** that the composition is glyph-agnostic (which a fifth
_routable_ mode will need), not as a state. §AK2's "eight with תחב״צ" is really **seven**; the
conclusion is unchanged and the count in the ADR should be right.

### AL6. The declared leg's segment: amber, route weight, long dash, BUTT caps

§AA4's 2026-08-27 amendment said the declared leg draws its own straight segment and left the
styling to the drawing. Here it is, as `MAP_CONNECTOR` values:

| line                           | colour                              | weight | dash (line-widths → px) | caps  | end dot |
| ------------------------------ | ----------------------------------- | ------ | ----------------------- | ----- | ------- |
| routed (`ROUTE`)               | `#915e1e` / `#f0b254`               | 3.5    | solid                   | round | 3.4     |
| **declared תחב״צ**             | the **same** amber pair             | 3.5    | `[3, 1.2]` → 10.5 / 4.2 | butt  | 3.4     |
| day order / un-routed (`DASH`) | ink `rgba(22,35,61,.5)` / light .42 | 2.5    | `[2, 2]` → 5 / 5        | round | 3.0     |

**Three channels separate it from the fallback, and that is the point** — being mistaken for "we
could not route this" is its one real failure mode, and the shape cannot help, because
`MapPane.tsx`'s `MapDayLeg.path` is documented as _"the routed path, or the straight segment where
none has arrived yet"_ and both take the connector's paint. **The two are the same geometry by
construction.** So: hue (amber is time and commitment — the budget already owns this, and it is the
strongest channel: 4.50:1 light / 7.01:1 dark on the real `earth` ground against the connector's
3.01:1 / 3.25:1), weight (3.5 against 2.5), and rhythm (a long dash against a 5/5 stipple). Against
the **routed** line one channel is enough and is the right one: solid says "this is the path",
dashed says "there is a journey, we are not drawing its path".

**The weight and the rhythm do NOT ride §D8's amber ration.** If the structure depended on the
ration, a declared leg that is not the asked-about one would fall straight back to reading as the
fallback. So the ration governs **hue and opacity**; the rhythm and the weight are the leg's own.

**And a rendering trap worth more than the values:** `line-cap: round` adds half the stroke width at
each end of **every dash**, so at weight 3.5 it eats 3.5px — a 4.2px gap becomes 0.7px and the line
reads nearly solid, i.e. it asserts the very path it exists to disclaim. The declared segment takes
**butt** caps, deliberately unlike `ROUTE`, whose own comment explains why it is round.

### AL7. The mode row is `.wp-chip.touch` squared — and the box it was measured in was wrong twice

**§AA4's own sentence is the error, and I repeated it before the render caught me.** §AA4 states
_"four chips still fit one row at 360 (239px of 312px)"_. The chips were compared against the row's
`getBoundingClientRect().width`, **which includes its 12px inline padding on each side** — so the
space is overstated by 24px and a row that visibly clips a control reports as fitting. M8a's first
draft made the identical comparison and concluded the opposite of the truth, twice in two
directions, before measuring the row's **content** box.

Against the real inner box, at 360:

| shape               | chips            | chip height | verdict                                            |
| ------------------- | ---------------- | ----------- | -------------------------------------------------- |
| glyph + word        | **327px** of 308 | 31px        | wraps, and **clipped outright** before the guard   |
| word only (§Z5 §M5) | 243px of 308     | 29px        | fits, never met ADR-0017's floor                   |
| **glyph only**      | **194px** of 308 | **44px**    | fits with 114px spare · on the touch floor exactly |

**So the mode control is four glyph-only `.wp-chip.touch` chips**, squared, with the mode word
moving to `aria-label` — it stops drawing, it does not disappear. Two measured reasons, and the
second is the decisive one: 114px of headroom means a fifth mode cannot break the row, and it is the
**only** shape that reaches 44px on a control that is its surface's primary one.

**Plus one guard, and the clip is why it exists:** `.wp-chip` is `flex: 0 0 auto` with
`white-space: nowrap` inside a `.day-trv` that carries `overflow: hidden`, so a row that does not fit
**disappears** rather than growing — a control cut in half, silently, with the measurement table
still saying "fits". The row therefore declares `flex-wrap: wrap`. It should never fire; what it buys
is that an overflow costs height instead of eating a control.

### AL8. A glyph with a facing mirrors with the reading direction — and it lives in ADR-0138 §10

Owner, on the drawing: _"All glyphs that have a direction should have RTL variants. For example the
person should be facing left and not right if the app is in Hebrew. The bike as well."_

**Agreed, and the decision is recorded in [ADR-0138 §10](0138-the-row-menu-is-one-surface-and-icons-are-ui.md)
rather than here** — §AA3 is what made it visible, because a walker and a bicycle are the app's first
`Icon` entries that depict a person moving, but the rule is about the icon vocabulary and that is
ADR-0138's subject. Drawn in the mockup's §5. Three results this ADR needs to carry:

- **Only 2 of the 4 mode glyphs have a facing.** `driving` and §AL2's new `transit` are symmetric, so
  the rule reaches `walking` and `cycling` and stops. **The front view §AL2 chose for legibility is
  what makes `transit` need no RTL variant either** — one decision paying twice, and worth knowing
  before a later session "fixes" the bus into a side view.
- **It is one declaration, not a mechanism**: `scaleX(var(--dir))`, off the token `tokens.css`
  already calls the one place a direction is named. `NavArrow` is the precedent.
- **The list is an allowlist and `clock` is why** — mirrored, it reads a different time. 30 of 58
  entries are asymmetric and only 9 have a facing; the other 7 are a backlogged sweep, not this
  card.

### AL9. What a declared leg costs, stated so the build does not discover it

§AA4 already named three: no duration, therefore no leave-by, therefore the board's countdown swap
does not fire for it and the day travel total skips it. **The drawing adds a fourth.**

**The free-time strip below a declared leg states the RAW hole.** §AH3 moved free time off the block
and onto the strip, and the strip's number is the hole minus the journey — so with no journey
duration there is nothing to net out and the strip says the whole 2:40. That is honest and it is the
price of silence; it is not a defect to be fixed by inventing a number.

**The distance stays**, and this is what the declaration buys rather than what it costs: `2.7 ק״מ`
is true and useful (§D4's crow-flies floor is untouched). What disappears is the walking number that
was wrong.

**And the block keeps amber, undashed.** A dashed border was considered and rejected: that is the
hard/soft grammar, and a declared leg is not provisional — it is a fact a person gave. Its quiet
comes from carrying **one** fact where the estimating block carries three, not from a different hue.
Measured: 58px for the block itself either way; the declared block is 111px only because it is the
one carrying the mode row.

### AL10. The mode row is a DISCLOSURE, and the caret is the day's own

Owner, on the drawing: _"Does the transit line expand to enable choosing which transit? (walking,
driving, cycling, public transit) if so then it should have a small downward facing arrow like we
already use for events no?"_

**Yes — and the question found a hole in the drawing rather than a preference.** §AL7 settled what
the mode row looks like and never said **when it appears**. The mockup drew it always-visible, which
is a decision nobody took: measured, the row adds **55px** to a block (58 → 113), so a four-hole day
pays **452px** against 232px collapsed — most of a 640px screen, on the surface this ADR itself calls
the densest in the app, for a control most days never touch.

**§Z5 §M5's answer does not work here either.** It said the control appears "on the selected or next
leg only" — but the day LIST has no leg selection; that is the Map's model (§AC2). So every leg but
the next would have no way to change its mode, while the override is keyed on a **place pair** and is
exactly the sort of thing set while planning rather than while standing in it.

**So: a disclosure, and almost all of it already exists.**

- **The caret is `.wp-event-chev` re-pointed** — trailing edge, `rotate(180deg)` when open,
  `transition: transform var(--t-base)`. The day already has one disclosure mark and the journey
  block joins it rather than inventing a second.
- **`button.day-trv-face` IS ALREADY IN `day-join.css`, AND IT IS DEAD CODE.** Nothing renders it —
  `DayJoinRow.tsx:184` is unconditionally a `<div>` — and `DayJoinRow.test.tsx:171` asserts its
  absence under the name _"is a statement and not a control"_. The rules were written for exactly
  this, and the component's own docblock explains why the acts row is a **sibling** of the face
  rather than a child: _"the `בדרך` control is a button too and one inside the other is invalid."_
  The face becoming a button is the shape that comment was holding open.
- **The container is `ui/primitives/Collapsible`** (rule 8) — max-height + opacity, children always
  rendered, reduced motion handled globally by `App.css`'s wildcard.
- **It registers no back layer.** This is a pane _of_ the row, not a layer _over_ it — the
  `SnapSheet` distinction in `frontend/CLAUDE.md`. Back navigates; it does not close a disclosure.

**Measured: the collapsed block is 58px, byte-identical to the statement block that has no mode row
at all** — the caret rides the existing flex line and costs nothing.

**Two things this changes, both deliberate and both needing to be said rather than discovered:**

1. **`DayJoinRow.test.tsx`'s "is a statement and not a control" falls.** §AH3 took the free-time `＋`
   off the block on the grounds that _"the block is about the leg and free time is about the hole"_ —
   and the mode is emphatically **about the leg**, so it belongs here by that same rule rather than in
   spite of it.

   **Corrected in the build (M8b, 2026-08-27): it did not fall, and the reason matters.** The
   disclosure is **opt-in per host** — `modes` is an optional prop, absent on a read-only archive
   (ADR-0029) and on any leg whose two ends do not both resolve to a place — so a block given no
   `modes` is still exactly the statement that spec describes, and it still renders a `<div>`. The
   spec now covers the posture rather than the component: what M8b added beside it is the disclosure's
   own describe block, so both shapes are asserted. **The prediction was drawn from the mockup, where
   the row is always visible; the mockup could not see the prop.**

2. **`Collapsible`'s transition is a `0.32s` literal while the caret rides `--t-base` (240ms)**, so
   the two halves of one gesture are visibly out of step. The primitive is where that gets fixed
   (ADR-0140's "waits are `motionDurationMs`, timings come from the ramp"), not the host.

### AL11. Switching a mode issues NO request — and the two absences are not the same

Owner: _"When you switch to a different transit mode, say from walking to driving, does it retrigger
the route path and time estimates so that it shows up as soon as we have it? (and maybe adding an in
progress indication or something?)"_

**No, and by design.** `useDayTravel` (`lib/travel.ts:184`) takes `modes = TRAVEL_MODES` as its
default, and its own docblock states the reason: _"which is what makes ADR-0206 §Z2's mode switch a
read from what the client already holds rather than a fetch."_ **One matrix per day carries all three
modes**, so a switch is a Dexie/memory read with zero requests. That is already M8b's exit criterion
and it is asserted with a network spy, not eyeballed: **if a switch fetches, M4 is wrong, not M8.**

**There is a cold window, but it belongs to the DAY, not to the switch.** The same docblock names
three: a **warming** answer (ADR-0187 — the server returns what it has plus how long to wait; the
client re-asks once and lets go), a **peek** (`DayPeek` mounts the neighbouring days as real surfaces
and must not reach out, so it draws whatever Dexie holds), and **offline**. In that window the mode
you pick may carry no number, and the shipped answer is §D4's absence: **the distance, and no
duration.**

**A progress indicator is refused, and it was already refused once.**
`where-a-route-shows-up-v1.html`'s notes: _"Rejected: a spinner per leg while loading. On a day with
five holes that is the loudest thing on the screen. The 'not yet loaded' state is simply §D4's state
— a crow-flies chip with no duration."_ ADR-0140 §6 rations it independently — a looping animation
claims "this is still happening", which is why `pending` sync deliberately stays still, since "a
spinner on pending reads as strain". **Noted for the owner: that file is still awaiting sign-off, so
this is an open call rather than a closed one.**

**What the question did surface: "no number yet" and "the gate refused this pair" render
identically.** One is transient and one is permanent, and that is precisely the confusion §AA4 fixed
for the polyline — the declared segment against the un-routed connector — arriving one surface over.
**The resolution splits them by WHERE they are said:**

- **The chip carries availability only.** The chips are glyphs with no numbers (§AL7), so they have
  nothing to lose; the gate is a permanent fact about the pair, so it is the chip's to state —
  `.wp-chip.provisional`'s dashed off-state, **still tappable**, the tap landing on §D4's chip
  (§Z5 §M5). Measured at 44px, so the refused chip is a control and not a disabled button.
- **The absence is said on the BLOCK**, where §D4 already answers it. A transient absence therefore
  never touches the chip row, and the two can never be mistaken for each other.
- **`0 דק׳` never appears.** `ROUTE_MIN_CROW_M` already makes a sub-10m pair read as absence.

**And the copy for a refused mode may claim only what the app knows — the obvious wording is
false.** `רחוק מדי להליכה` reads best, and `TRAVEL_GATE.walking.maxMeters` would justify it, but the
gate has a second clause: `sameClusterOnly`, and `sameTravelCluster`'s own docblock says **"A point in
no cluster at all answers `false`"** — so an isolated place refuses walking **at any distance**, and a
2 km stroll would be told it is too far. The recommendation is **`אין הערכה ל<מצב> כאן`**: one
template composed from `t.travelMode`, true in every refusal case, and separated from the declared
leg's `בלי הערכת זמן` by `כאן` — the pair rather than the mode. Drawn beside both alternatives.

## AM. Amendment (2026-08-27) — the per-leg override keys on the PLACE PAIR, and §V1.6/§Z2 say what it is

§V1.6 as amended by §Z2 settled that the default is derived and only an **override** is persisted.
It did not say what an override is a row _about_, and M8b cannot be built without that: **there is no
`travelMode` column anywhere in `schema.prisma` today, and `DayJourney` (`lib/day-joins.ts`) carries
no leg identity at all** — no `fromId`, no `toId`. It takes two instants and a duration. So
"per-leg override" did not yet name a row.

**Decided: `(tripId, fromPlaceId, toPlaceId)`, with the two place ids CANONICALISED (sorted), so one
row serves the pair in both directions.**

### AM1. Why the place pair, and the strongest argument is from the code

1. **The app already resolves exactly this pair, in exactly one place.**
   `useDayTravelReads` (`lib/day-travel.ts`) turns each hole into
   `endpointPlaceId(leg.from, …, 'leaving')` and `endpointPlaceId(leg.to, …, 'arriving')` — the
   place-authority rule, including the transport inversion (you leave a flight where it _lands_).
   That derivation exists, is memoised, and is the one thing both day surfaces share. Keying the
   override on the pair means it needs **no new identity and no new derivation**: it is read where
   both ends are already known.
2. **It sits at the same granularity as the thing it overrides.** The estimate is cached by the
   **rounded coordinate pair**, not by an event — `estimateFor(from, to, mode)` takes `LatLng`s. An
   event-keyed override would be _finer_ than the cache it modifies, so two events between the same
   two places could disagree about the mode while sharing one cached estimate. That is incoherent
   rather than merely awkward.
3. **It survives reordering, deleting and re-adding.** An override keyed on the arriving `Event`
   dies the moment the day is reordered (a different event now arrives) or the event is deleted and
   re-created — so the traveller re-declares it after every edit. The pair does not move.
4. **It matches the fact being recorded.** "Senso-ji ↔ Tokyo Station is a train" is a claim about the
   world, not about this itinerary. §AG7 already established that a place visited twice is two stops
   and one pin; both occurrences of the pair are the same journey and take the same mode, which is
   right.

### AM2. Why UNORDERED, and what that costs

The owner's own phrasing is the pair rather than the direction — _"however you get from A to B on
this trip, it's transit"_ — and a rail corridor is a rail corridor both ways.

**The deciding argument is which failure is worse.** Ordered is strictly more expressive, and the
cost is silent: you declare תחב״צ on A→B, and the return leg keeps printing the wrong walking number
because it is a different row. That is the common case. Unordered's cost is that a genuinely
asymmetric pair — a funicular up and a walk down — **cannot be expressed at all**. That is the rare
case, and it is loud rather than silent: the mode reads wrong on one leg and the traveller can see
that it does.

So: sorted ids, and the `@@unique([tripId, fromPlaceId, toPlaceId])` constraint enforces one row per
pair. **If the owner wants ordered instead it is a one-line change** — drop the canonicalisation and
let both rows exist; nothing else in this design depends on the symmetry.

**Revisit trigger:** a real trip where one pair genuinely takes two different modes by direction.

### AM3. Rejected

- **Key on the arriving `Event`.** §AM1.3 and §AM1.2 — it dies on reorder and it is finer than the
  cache it modifies. This is what "per-leg" would have meant if nobody had checked what a leg is.
- **Key on the `Booking`.** A declared transit leg most often has **no booking at all** — that is
  rather the point, you buy the ticket at the station. An override that requires a booking cannot
  express the case it exists for.
- **A `defaultTravelMode` column on `Trip`.** Forbidden by §Z2 and unnecessary:
  `derivedTravelMode(bookings)` already ships (M7's follow-up) and is read identically by the day,
  the hero and the Map.

### AM4. Two consequences worth stating before the build finds them

- **An override on a pair with no coordinates is inert, not broken.** `useDayTravelReads` skips a leg
  whose either end is a Place-lite row (ADR-0147), so the override simply has nothing to apply to —
  and it starts applying if that place is later enriched. Nothing to guard.
- **A deleted place takes its overrides with it** (`onDelete: Cascade`), because the row's whole
  meaning is the pair. A dangling override would be a mode for a journey that no longer has two ends.

### AM5. `travelModeSchema` does NOT gain a fourth member, so the compile trap never fires

M8b's card anticipated the build breaking on purpose: `TRAVEL_GATE` is
`as const satisfies Record<TravelMode, TravelGateRule>`, so widening `travelModeSchema` would stop it
compiling until somebody answered what transit costs as. **§AA4 forbids widening it**, so the trap is
never sprung — and that is worth writing down, because a later reader working from the card will go
looking for a compile error that is not there.

The shape instead: **`TravelMode` stays the three ROUTABLE modes** (what the server is asked for) and
a new **`LegTravelMode = TravelMode | 'transit'`** is what a leg stores. Counted, there are exactly
three `Record<TravelMode, …>` sites and the split lands cleanly across them:

| site                               | gains transit? | why                                                     |
| ---------------------------------- | -------------- | ------------------------------------------------------- |
| `routing.ts`'s `TRAVEL_GATE`       | **no**         | §AA4 — the gate never sees it; there is nothing to gate |
| `valhalla.provider.ts`'s `COSTING` | **no**         | a transit mode reaching a provider IS the bug           |
| `he.ts`'s `travelMode`             | **yes**        | it is the one that needs a word for it                  |

`isRoutableMode(m): m is TravelMode` is the single narrowing at that boundary, so "no request is ever
made for transit" is one function rather than a condition repeated at each call site.

### AM6. What the build found: a declared leg is a journey with NO duration, not an absent journey

Suppressing the estimate at the reads layer was the whole of the plan, and it was wrong in a way only
the screen spec could see. `dayJourney` answers `null` when there is no `travelSeconds` — §D4's
absence, correctly — so a declared leg produced **no block at all**. Two things follow, and the
second is the serious one:

- §AA4 says the declaration _"suppresses the duration and keeps the distance"_. A hole that renders
  nothing keeps neither.
- **The block is the only thing carrying the mode control.** So declaring תחב״צ removed the control
  that declared it: a one-way door, on the surface that opened it.

**So `DAY_JOURNEY_ARM` gains a fifth member, `DECLARED`**, and `DayJourney.travelSeconds` widens to
`number | null` with that arm as the one place it is null. Counted before changing it: exactly **one**
consumer outside `day-joins.ts` reads `travelSeconds`, and it was already inside the `declared` guard.
Every arm consumer is a positive `=== ARM` test, so a new arm reaches none of them — a declared leg
offers no `בדרך`, takes the neutral tone, and carries no warning mark, all by falling through.

**And the distance is one derivation, not a rule each surface applies.** `useDayTravelReads` gained
`distanceFor`: the ROUTED distance where there is an estimate, the **crow-flies floor** on a declared
leg. That is the same claim the canvas already makes for such a leg — a straight segment, because we
do not know the road it takes — so the block and the map state one thing. It is also the one place
`DayJourney.distanceMeters` is not routed, which its own docblock now says.

The price, stated in the mockup and now asserted: **the free-time strip below a declared leg states
the raw hole again.** There is no duration to subtract, and §V1.1 is explicit that absence leaves
ADR-0159's line exactly as it read before any of this existed — never a pessimistic guess.

### AM7. Three smaller findings from the build, each written where it will be looked for

- **The override cascade is the FIFTH member of a family this codebase documents four times.**
  Postgres removes a declaration with either of its places and writes no `Change` for it (the service
  spec asserts that cascade), so the cache and the in-memory list need the same drop the notes, tasks,
  attachments and place-FK cascades already have. It **deletes** rather than nulls, because the pair
  IS the row's identity (§AM1) — which is why it is `dropOverridesForPlace` beside `clearPlaceRefs`
  rather than a `PLACE_FK` entry, whose whole shape is emptying a field.
- **`useDayTravelReads`' `overrides` is REQUIRED**, for the reason `useLegShape`'s `mode` is. An
  optional list with an empty default reads as harmless and is not: a surface that forgets to wire it
  silently ignores every declaration on the trip, which is indistinguishable from nobody having made
  one. Making it required turned two stale test fixtures into failures immediately, which is the
  point.
- **Two consumers were left reading the mode in the SINGULAR**, and both were reported off the
  deploy: the canvas's geometry (§AM8) and Plan mode's control (§AM9). Read those two before
  touching either surface.
- **A glyph with a facing mirrors with the reading direction, and the two transform channels are
  disjoint** — ADR-0138 §10 owns the rule; what M8b added is the spec. `MIRRORED` (the `--dir` scaleX)
  and `dir` (an inline `rotate`) would collide silently, so `ui/icon-mirroring.contract.test.ts`
  asserts over the source that no `MIRRORED` member is ever passed a `dir`, and that the mirror is
  declared exactly once.

## AM8. Amendment (2026-08-27) — the drawn LINE is per leg too, and this is the second time it took the wrong mode

Reported off the M8b deploy, from a leg the owner knows better than any fixture: _"I changed a walk
to a drive to my home and I know for certain that the drive route is wrong because it enters my
street (which is one way only) from the wrong direction."_

**The diagnosis, and it is one line of code.** `Map.tsx` asked `useDayShapes` for **one** mode — the
trip's derivation — while §AM had just made the mode per leg. So the overridden leg was drawn with
the **walk's** geometry. A footpath route legitimately goes the wrong way up a one-way street; a car
following it does not. The duration and the distance were both correct, which is why only the canvas
showed it: §AM made `estimateFor` per leg and left the geometry behind.

**`useDayShapes`' own docblock asserted the falsified premise in as many words** — _"One mode,
because one day is drawn in one mode"_ — and M8b did not revisit it. That is the lesson worth more
than the fix: **a hook's docblock is a claim about its callers, and a change to the callers can make
it false without touching the hook.** When a fact becomes per-leg, grep the things that consume it in
the singular.

**And it is the second time the drawn line took the wrong mode.** §Z5's build made
`useLegShape`'s `mode` optional and drew `pedestrian` routes on every trip; the repair then was to
make the parameter **required**, so no caller could fall into a default. The parameter stayed
required — and the bug came back one level up, because the _set_ of modes was the thing that had
become plural. `pathFor(from, to, mode)` now takes the mode too, so the leg's own mode has to be
named at the point of the draw, not inherited from the day.

**The shape of the fix:**

- `useDayShapes({ stops, modes })` takes the modes the day's legs are actually drawn in, deduped.
  **Still one request** — which is what keeps §D8's tripwire satisfied — and on a trip nobody has
  overridden it is byte-identical to before: one mode.
- `DayShapes.pathFor(from, to, mode)` requires the mode. A mode nobody asked for answers `null`
  rather than falling back to another mode's line: the failure here was a silent substitution, so
  the absence is asserted too.
- Declared legs are filtered out of the ask: `TRAVEL_GATE` has no rule for `transit` and no provider
  has a costing (§AM5), and the leg draws its straight segment (§AA4).
- Geometry is still bought only for the modes actually drawn, never for all three. The union is one
  mode on the common day and two on a day holding an override.

## AM9. Amendment (2026-08-27) — the mode control belongs to BOTH day surfaces

Reported in the same message: _"Right now you can only change the mode on the day view and not on
plan day!"_

M8b wired the **reads** on both surfaces and the **control** on one. That is
`frontend/CLAUDE.md`'s named anti-pattern — _"changing a day-surface derivation in `DayView` only"_ —
for the third recorded time, and it is worse than the average instance of it, because §AL10's own
argument for keying the override on the place pair is that the declaration _"is exactly the sort of
thing set while planning rather than while standing in it"_. **Plan mode is the surface that needed
it most and the one that did not get it.**

ADR-0159 §1 is the rule that decides this and it decides it cleanly: the two surfaces may differ in
**posture** and not about a **fact**. Plan has no inline settle pair and its gap is a `שבץ` control
where Trip's is a statement — those are postures. Which mode a leg is travelled in is a **fact**, and
being able to state it is not Trip mode's privilege.

**The fix is a shared hook rather than a second copy** (`useLegModeControl`, in `lib/day-travel.ts`
beside `useDayTravelReads`, whose subject it is the write half of). Writing Plan its own
`modeControl` would have been the second one-off root rule 8 forbids, and it would have put three
decisions in two places: that the **open state is the day's** (two holes must not both be open, and
a per-block `useState` forgets on every clock re-render), that **picking the derived mode clears the
row** rather than storing one that agrees with the derivation, and that there is **no control on a
read-only day or on a leg whose ends do not both resolve to a place**. `DayView` now calls the hook
too, so its copy is gone rather than duplicated.

**What the two reports have in common** is worth stating, because it is the same mistake twice in one
milestone: M8b changed a fact from per-trip to per-leg, then updated the consumers it was thinking
about — the day list's numbers — and not the ones it was not: the canvas's geometry, and Plan's
control. **The audit is the deliverable.** Both fixes here were found by asking "what else reads this
in the singular", which is the question the milestone should have closed with.

## AN. Amendment (2026-08-27) — what M9 settled by building the day's own verdict

§V1.7 is the last unbuilt read on §V1, and the last one **§M never gated**: the five things a mockup
had to settle before any of §V1 was coded do not include a day-level verdict, so it had never been
drawn. M9 drew it (`a-travel-time-between-two-points-v2.html` §5, round 3) and built it. Four things
came out of the drawing and the code, and the first is the one that matters.

### AN1. `daySequenceFits` is NOT the source of the verdict, and the milestone card was wrong to say it was

M9's card names `daySequenceFits` — built in M2, eight test references, **zero consumers** — and
treats wiring it as the work. It is the wrong source, and the reason is not style: it measures raw
stop times, and every rule about whether a leg _can_ be infeasible has since accumulated in
`dayJourney` (`lib/day-joins.ts`) and nowhere else.

| the gate                               | where it was decided | what raw stops would do                          |
| -------------------------------------- | -------------------- | ------------------------------------------------ |
| A flexible arrival has no **deadline** | §AI1 / §AJ1          | measure to a window's **opening**, or to nothing |
| A declared תחב״צ leg has no estimate   | §AA4                 | read the suppressed walking number               |
| A leg out of a bed has no window       | §AF3                 | measure from a check-out days away               |
| A sub-minute hop is not a journey      | 2026-08-26           | draw a verdict on a ⁦24⁩-second walk             |
| A hole behind you is a **record**      | §AF1 / the PAST arm  | warn about a day nobody can still change         |

A verdict rebuilt from stops therefore re-commits **§AJ1's own bug one scope up** — it calls a day
impossible over the single leg nobody can be late for, which is the exact field report §AJ1 exists
for. So `dayFeasibility(journeys)` takes the `DayJourney` arms **the rows already render**, and
`PlanDay` derives them once into a map both the rows and the verdict read. Agreement is then
structural rather than careful: the day and its rows are describing the same objects.

**`daySequenceFits` stays unconsumed, and that is now a recorded state rather than an oversight.** It
is the pure-arithmetic form and it is correct for a caller that holds nothing but stops and seconds —
a server surface, or §V2's notification sweep. It is wrong for a day surface that has already gated
its legs. Do not "finish" M2 by wiring it in.

### AN2. There is no positive arm, and that is §D4 rather than a saving

A day that fits and a day nothing could be measured on **render identically: nothing at all.** §D4
says the reader must not be able to tell "not computed" from "not computable", and a `✓` on a day
whose legs were all gated out is precisely that tell — in the direction that costs somebody their
afternoon. Measured on the drawing as a DOM fact: both silent, and the unmeasured day carries **0**
journey blocks against the other two's **3**, so it reads exactly as the app read before this epic.

**The fit is still a three-way discriminant in code** (`TRAVEL_FIT.FITS` / `OVERRUNS` / `UNKNOWN`)
even though one arm draws, and `dayFeasibility` answers `UNKNOWN` rather than `FITS` for a day with
nothing measurable. A boolean would render the same and be a lie in the second case, and the moment
it collapses somebody draws the tick. `FITS` additionally requires a leg measured **against a
window** — a journey with a duration and no window (a bed's leg, an open floor) was never asked the
question and cannot answer it either way.

### AN3. Help, not refusal, is bought with the COUNT — and `--miss` on the day is refused

The row says two things: **how many** journeys do not fit, and **the sum** of what has to move.
Only the second is a number a leg's own block can also state, so without the count the row is an
echo of the block below it — and then it really is only a telling-off. `שתי דרכים לא נכנסות ·
חסרות 35 דק׳`, subject the **journeys** and never the planner.

**Amber, not `--miss`.** What is missing is time (rule 4), and §D7's status colour stays where it
earns its keep — the one leg that cannot be made. Drawn and measured: `--miss` on the day puts a
**third** `--miss` box on a screen that already has two, without adding a fact, which is this ADR's
own Consequence arriving as colour. The ink is `--amber-deep` (⁦5.49:1⁩ light, ⁦5.84:1⁩ dark) because
plain `--amber` is ⁦2.1:1⁩ on `--card` in light — it passes in dark, and the **failing theme picks the
token**.

The row is **`.day-ambient .ambient` at a second density**, not a new region: that strip already
stacks one-line facts true of the whole day and already protects its read-out while the name gives
way, which is the same trade here. Eighteen declarations, ⁦35px⁩.

**Two words were drawn and cut.** `שתי דרכים לא נכנסות ביום · חסרות 35 דק׳ בסך הכול` measures
⁦314.9px⁩ of ink in a ⁦308px⁩ box at 360 and loses the end of the count; both are recoverable from
context (the row is inside the day; a count beside a duration is already a sum) and what they cost
is the measurement. The trim lands at ⁦233.9px⁩.

**Plan-only, deliberately.** ADR-0159 §1 forbids the two day surfaces differing about a **fact** and
allows a difference in **posture**: a day-level verdict in Trip mode is a verdict on a day you are
already living, where each leg's own row is the useful scope. Do not mirror it into `DayView`.

**ADR-0011 is untouched.** It is a read: nothing moves, nothing is guarded, and the verdict names no
row at all — which is the strongest form of "a hard event is never implicated", and the reason it
says a count rather than a title.

### AN4. The slot picker was the last surface stating the raw hole

§V1.1's correction reached the chip, the seam and the between-row label in M6a and stopped there.
`PlanDay`'s slot **picker** — the sheet behind a row's own time button, off `dayPositions` — still
offered ⁦3⁩ hours in the hole its own chip offered two in, which is ADR-0159 §1's forbidden
disagreement about a fact, one tap deeper than anything that had been reported.

It is a lookup rather than a second derivation: a `DayPosition` names the rows either side of it,
which is exactly the pair `useDayTravelReads` is keyed on. `earnsChipAt` asks the **corrected**
number (§AG5), so a hole a walk eats loses its offer entirely instead of advertising nought.

**Two positions keep the raw hole, and both are §D4 rather than a compromise:** the day's two edges
have a row on one side only, and a position joined around the row being **moved** has two rows that
are not adjacent on the day as it stands. Neither has a leg to ask about, and the app does not invent
a walk it did not measure.

### AN5. The distance is the way to the leg on the map — §1e's unbuilt half, on the owner's call

Owner, on §5 (2026-08-27): _"No shape on the day row · I prefer מרחק, ומגע אל המפה, and it's what we
mostly have today (minus the touch for map)."_ This **confirms** §1e's recommendation (the route
thumbnail stays out of the day list: four real legs read as four wiggly lines at ⁦46×26⁩, one bit
repeated at every hole of the densest surface in the app) and **adds the half that was drawn and
never built** — the distance shipped, the touch did not.

It lands on `.day-trv-dist` itself in `PlaceBadge`'s grammar: the hue rides the **mark** and the
words stay `--muted`, ADR-0017's 44px is an `::after` overlay so meeting it never grows the line
(ADR-0177), and it shows the leg's **destination**, because §AB2/§AC2 have the map mark the leg
_arriving_ at the stop you ask about.

**A `role="button"` span and not a `<button>`, for a reason already written down once:** the block's
face is a `<button>` whenever the mode disclosure is offered (§AL10), and nested buttons are invalid
HTML. `PlaceBadge` solved exactly this problem and its solution is reused rather than a second one
invented — including the propagation stop, so a tap reaches the map instead of expanding the mode
row underneath it.

**It is on BOTH day surfaces**, and that is not a posture question: ADR-0159 §1 forbids them
differing about a fact, and where a leg is on the ground is one. `legShowOnMap` is the fourth peer of
`eventShowOnMap`/`bookingShowOnMap`/`ideaShowOnMap`, collapsing the same two absences so no call site
remembers either.

**It widened M9 past its card's conflict surface** (`ui/domain/DayJoinRow.tsx`, `day-join.css`,
`lib/places.ts`, `screens/DayView.tsx`), which the board's protocol says to declare rather than do
quietly. Declared here and on M9's card.

### AN6. Two ways the mockup's own measurement harness under-reported a line that clipped

Both looked comfortable, and neither failed loudly. Worth carrying because every mockup in this repo
measures this way.

- **`scrollWidth` on an ellipsised child reports the CLIPPED width.** This is §1's own trap one level
  down — there the flex CONTAINER reported its own width, here the child with `overflow: hidden`
  does — so a row visibly ending in `…` measured as fitting. A `Range` over the text node is **not**
  a reliable fix inside `overflow: hidden`; an off-screen span carrying the element's computed font
  is.
- **Summing only the text halves drops the glyph and one gap** — ⁦24px⁩ of a ⁦308px⁩ box, which is most
  of the margin a too-long line appears to have. Sum every child and every gap, or do not sum.

And one about the tooling rather than the file: **`render.mjs`'s `measurements.md` is snapshotted
before `document.fonts.ready` re-measures**, so its numbers are the fallback font's and ran ~⁦35px⁩
narrow here. Read the live page's table, not the artefact.

---

## AO. Amendment (2026-08-27) — what M10 settled by building the offline pack

§V1.8 is one table row and a promise: _"our stops are known in advance, so routes are precomputable
at ~410 bytes each and ride ADR-0186 §5/§6's existing download, budget and eviction machinery. This
is what makes it work on the plane."_ Building it kept the promise and moved four things the row did
not say. None of them is a new mechanism; three are the opposite.

### AO1. The pack is a slice of `RouteLeg`, served live — not a file cut beside the archive

The card places this in `MapService`'s extract pipeline, and the obvious reading is a fourth
artefact in the byte sink: `map_<trip>_<sig>.routes.json`, cut by `readyOrWarm`, keyed by
`mapExtractKey`'s sibling. **Rejected, and the reason is that a pack has no bytes of its own.** An
extract exists because slicing 42.7 MB of planet takes ten seconds and the result cannot be
recomputed per request; a pack is one indexed `WHERE key IN (…)` over rows that are already stored,
and the JSON is assembled in single-digit milliseconds. Cutting it would buy nothing and cost three
things: a second copy that goes stale the moment a leg is warmed, a storage key to invalidate, and
an eviction rule M12 does not have.

So the artefact is a **response**, and everything ADR-0186 §5/§6 governs still governs it — because
what those rules bound is what sits on the **device**, and there the pack is an ordinary byte-cache
entry (`kind: 'routes'`) beside the archives.

### AO2. Which legs it carries: every ordered pair within a day, and the day is a SET

Two decisions, and the second is the one worth reading.

**The server does not re-derive the day's ORDER.** `lib/day-travel.ts` owns which stop follows
which, with the place-authority rule and the transport inversion (`endpointPlaceId`) inside it — a
flight leaves you at its destination, a car hire at its origin. A server-side second answer to that
question is precisely the divergence rule 8 exists to prevent, and it would fail silently: a pack
built on a different adjacency is a pack full of keys nothing ever looks up.

**So a day contributes a SET of coordinates and the pack carries every ordered pair among them.** A
multi-day stay contributes its place to every date it covers (§AD's bookend — the stay you woke in),
and a booking contributes **both** its endpoints, so either resolution is covered. This is ADR-0205
§Z4's own argument applied to the device: _"cache every cell the matrix returned, not just the
consecutive pairs — the others are already paid for, so a reorder or an inserted stop costs nothing
later."_ On a plane that reasoning is stronger, not weaker: a reorder mid-flight has nothing to
re-ask.

**Measured on the dev seed:** Tokyo is **108 legs / 16.6 KB**, Iceland **16 legs / 2.5 KB**. A
fortnight of six-stop days is ~1,260 legs, ~170 KB — under 1% of the 22.7 MB city extract it rides
with. `ROUTE_PACK_MAX_LEGS = 4000` bounds it and **logs what it dropped**, because a silent
truncation reads as "covered everything".

**The warm is `RoutingService.batch`, once per day** — the same call a person opening that day makes,
through the same gate, the same §Z9 batching and the same politeness limiter. Nothing in
`route-pack.service.ts` speaks to a provider. One consequence to know: a **cold** trip's day merges
into one matrix request, so every pair of that day is cached and carried; an **incremental** change
(a stop added later) warms only the newly-pending consecutive legs, so the pairs across it arrive
only if a merged batch happened to cover them. Missing pairs are §D4's absence, never an error.

### AO3. No geometry in the pack, and the number is why

A shapeless leg is **138 bytes** of JSON (157–162 measured on the seed, where coordinates carry
signs and mode names differ in length). The same leg carrying a city walk's polyline is **~1,375** —
**ten times the artefact** for a line §D8 draws one of at a time. So the pack carries durations and
distances only. What a device already fetched a shape for it still holds (`useDayShapes` writes
them); what it has not falls back to the straight segment the map drew before M7, which is §D4's
floor and is unchanged by this milestone.

This has a client-side consequence that is not obvious and is the one bug this design could have
shipped: **hydrating a pack must never overwrite a leg the device already holds.** `travel.ts`'s own
note says a `bulkPut` costs a shape and that `useDayShapes` simply asks again — which is exactly
what a device on a plane cannot do. `fillCachedRouteLegs` writes only the keys Dexie is missing. A
pack is a **floor** under what is known, never an update to it.

### AO4. `202`, not `503`, and what makes it terminate

The archive routes answer `503` because they have nothing to send until the cut lands. The pack
always has a body — whatever is stored now — so it answers **`202` with `Retry-After`** while more
legs are coming and `200` when they are not, which is `routeBatchSchema`'s flow rather than a new
one. `map-archive-cache.ts` now reads both statuses as "preparing" and stores neither: a `202` pack
frozen onto a device is a half-warm trip that never completes.

**What stops the client polling for ever** is that "complete" means _the warm pass has settled_, not
_every key has a row_. `RoutePackService` remembers the region signature it last warmed for; once a
pass finishes, the pack answers `200` with its holes. That matters because some holes are permanent:
ADR-0205 §Z4's `error_code 154` is terminal, and a client waiting on it would poll a leg nobody can
ever compute.

### AO5. Where the code lives, and it is a dependency fact rather than a preference

M10's card names `backend/src/map/**` as the conflict surface. The service is in
`backend/src/routing/` instead, because a `RoutePackService` in `MapModule` would need
`RoutingService`, and `RoutingModule` already imports `MapModule` for the trip's clusters (ADR-0205
§3) — a module cycle. It sits on the side that already imports the other; the endpoint is
`GET /trips/:tripId/routes/pack` on the controller that is already trip-scoped and guarded. The
region signature is still `map-region.ts`'s, read through `MapService.regionFor`.

**The client refresh is the archive's, and inherits its one gap.** A pack is wanted when it is
missing or a vintage behind — the same `wanted()` the extract uses — so a places change rebuilds the
pack on the **server** off the existing signature (M10's third exit criterion, and the mechanism the
card asked for) but does not by itself pull a fresh copy to a device that already holds one. That is
the extract's own behaviour today, not something this milestone introduced: no client reads
`/trips/:id/map/region`, so nothing on the device knows the signature moved. Fixing it is one
mechanism for both artefacts and belongs with the backlog line about a map's age, not here.

---

## AP. Amendment (2026-08-27) — the day's total drops the mode name and hedges the minutes

**§V1.9's line was stale before it was ever built, and that is amended in its own row above rather
than restated here.** The row was written 2026-08-24 as `3.2 ק״מ · 48 דק׳ הליכה`, when a trip had
one mode. §AM shipped the per-leg mode three days later, so on a real day — a walk to the station, a
declared תחב״צ leg to the next town, a drive for the last stretch — `הליכה` names one leg of three
and is false about the other two. There is no true word to put there, because the day has no single
mode. **Owner, 2026-08-27: drop the mode name, hedge the minutes.** The line is `3.2 ק״מ · ~48 דק׳`.

### AP1. The two halves do not cover the same legs, and a naive build gets it wrong in both directions

This is the whole derivation, and it follows from §AA4 as §AM6 sharpened it — a declared leg is _"a
journey with NO duration, not an absent journey"_. So:

- **The kilometres cover every leg, declared ones included.** §AA4 is explicit that the declaration
  _"suppresses the duration and keeps the distance … `2.7 ק״מ` is still true and still useful"_, and
  `distanceFor` has answered the crow-flies floor for such a leg since §AM6. Dropping it here would
  understate a day somebody is genuinely crossing, on the one read whose job is the day's shape.
- **The minutes cover only the legs that could be timed.** Inventing a duration for a declared leg
  prints exactly the walking number the declaration exists to suppress — §Z5's own `73 דק׳ הליכה`
  against 25 by train, one scope up and harder to catch, because a total nobody can decompose hides
  which leg the wrong number came from.

**What carries that asymmetry to the reader is §D5's `~`, and nothing else does.** It is already the
app's mark for "this is an estimate"; here it does a second job — _this counts what could be
counted_ — and the two readings do not conflict, because both are refusals to claim more than we
have. A total whose minutes were exact would be claiming a completeness the declaration itself
denies. No new copy was minted for it: `approxTravelTime` (`lib/duration.ts`) owns the hedge along
with the two traps a second implementation would walk into — the exact-hour rungs are WORDS and take
the Hebrew prefix (`כשעה`, never `~שעה`), and `~0 דק׳` is a sub-rung value rounding to nothing rather
than a hedged duration.

**A day of nothing but declared legs states its distance alone.** Half a line is the honest read
there, and it falls out of the rule rather than being a case bolted onto it.

### AP2. It is a roll-up of the JOURNEYS, not a second pass over the day's legs

`dayTravelTotal` (`lib/day-joins.ts`) takes the same `DayJourney` objects the rows render, which is
§AN's argument for `dayFeasibility` applied to a second day-level read — and it is worth restating
because the wrong version is the obvious one. A total rebuilt from `dayLegs` would count holes that
draw no block: a leg with no estimate is §D4's absence in the list and would be kilometres in the
header, so a day claiming ⁦4.1 ק״מ⁩ over three journeys the list shows two of. Reading the journeys
makes the header and the list describe the same objects rather than agree by care.

It also settles the **no new request** criterion structurally rather than by inspection: the
function takes an array of already-derived values and can fetch nothing. Asserted anyway, on both
surfaces — one `useDayTravel` stops fingerprint per screen, the legs' own stops, and no `fetch` at
all during the render.

### AP3. Both day surfaces, because a total distance is a FACT

ADR-0159 §1 allows `DayView` and `PlanDay` a difference in **posture** and forbids one about a
**fact**. Plan's day-level VERDICT (§AN) is a posture difference and correctly Plan's alone — an
opinion about a day nobody has lived yet. **How far the day goes is not**: it is the same number on
both screens or the app has two answers. So the derivation is one function and the render is one
component (`ui/domain/DayTravelTotal`), which is what makes the agreement structural — the failure
`frontend/CLAUDE.md` names as having cost a release twice is an amendment reaching one call site of
a shared component, and there is only one call site to reach.

### AP4. It is the one row in the day-ambient strip that is NOT a card

Its two neighbours there are tinted boxes because each asserts something to locate (teal, a place)
or to act on (amber, §AN's verdict). A total is neither — you read it and read past it — and
painting it amber would put **two amber cards in one strip** on an overrunning Plan day, where one
means "this day does not fit" and the other means "here is your mileage". That is the loudest
possible reading of the quietest fact on the surface, and it is the failure this ADR's own
Consequences warn about, arriving through styling rather than through copy.

So: the cards' own inline padding, so the ink lines up with theirs, and nothing else. **Rule 4 is
spent on the glyph alone** — a travel time is time (§D1) — at `--amber-deep`, for §AN's reason (plain
`--amber` measures 2.1:1 on `--card` in light). The glyph is `navigate` and deliberately not a mode
mark: the mode is per-leg now, so a `walking` glyph here would be the same false claim the copy just
dropped.

### AP5. Measured on the live page at 360×640, both surfaces, both themes

§M2 records that a THREE-part line is where the day breaks at 360; this one is two-part, and it
measures **⁦128.1px⁩ of a ⁦328.0px⁩ box** — the same number on the day list and in Plan, in light and in
dark. The string measured is the widest honest one this line can produce rather than a typical one:
`H:MM שע׳` is the ladder's longest rung and a whole-kilometre distance is `formatDistance`'s, so
`12 ק״מ · ~2:23 שע׳`.

**Measured in `e2e/day-total.spec.ts` against the running app, and §AN6's three traps are why it is
an e2e rather than a number in a mockup's table.** The artefact's own `measurements.md` is
snapshotted before `document.fonts.ready`, so its numbers are the fallback font's; `scrollWidth` on
an ellipsised child reports the CLIPPED width, so a row ending in `…` measures as fitting; and
summing only the text halves drops the glyph and one gap. The spec waits on `document.fonts.ready`,
takes each child's natural width from an off-screen span carrying that child's own computed font,
and sums **every** child, gap and padding. Verified non-vacuous by widening the line until it
clipped — ⁦533.5px⁩ of ⁦328.0px⁩, and it went red.

The truncation on `.day-total-n` therefore guards a text scale rather than this measurement: a
scale is a box the app does not control, and a total that wraps pushes the day's first row down.
The distance leads, so what an ellipsis takes is the hedged half.

## AQ. Three field reports off a real trip, and only one of them was where it looked (2026-08-27)

Georgia, day 27, dark mode, phone. Three things reported off one screen at one moment, ahead of
M13 — two of them make the app state a falsehood, which outranks a new feature. **Reproduced with
the dev seed against a pinned clock before anything was changed** (`DEV_AUTH=1`, a Tbilisi trip
whose stops are all in Israel, `waypoint:dev-now` at 19:30), because the report was a screenshot
and a screenshot is evidence rather than a diagnosis. All three reproduced; **none of the three had
the cause the report implied**, and the third turned out not to be a defect of its own at all.

### AQ1. The day row advised leaving AFTER the event — and the arithmetic was never wrong

> Destination `כולי עלמא` runs 20:00–21:00. The journey row into it reads `נסיעה · ~23 דק׳ · 6 ק״מ`
> and states `יציאה 20:31`.

Two causes were proposed before the reproduction and **both were wrong**, which is the reason this
section exists in the shape it does.

The first was that the leg's `arriveByMs` was being taken from the destination's `endsAt`: `21:00 −
23 − 6` is `20:31` to the minute. It is not — both day surfaces read `Date.parse(leg.to.startsAt)`,
they always have, and the seeded reproduction of exactly that row printed a correct `יציאה 19:31`.
The second was §AJ's clamp on a floor (the card is dashed, so an ambient span, ADR-0054). Also not:
a flexible arrival states no departure at all, so that path cannot print `יציאה` in the first place.

**The cause is the ZONE the clock is printed in, and the owner is who found it:** _"the time
displayed there is the trip's timezone instead of the current timezone, because the trip is in
Georgia but my events are in Israel."_ Georgia is UTC+4 and Israel UTC+3 in August. `20:00 − 23 min
− ADR-0206 §D5's buffer` is **19:31 in Israel, which is 20:31 in Georgia** — one instant, printed on
a wall nobody on the trip was reading. The number was right the whole time.

**What made it reachable is that `JourneyRowProps.tz` was one prop serving two questions.** Its own
docblock said _"the DAY's own zone"_ and both hosts handed it `trip.timezone` — the zone the trip is
**filed under**, which ADR-0107 demoted to the trip _primary_ years ago and which no other clock on
either screen reads. The card above the block, the card below it and the now-line between them all
resolve through the itinerary; this row was the only one that did not. Meanwhile `JoinRow` was using
the same prop for `narrowGapForTravel`, where `trip.timezone` is **correct** — `gapBetween` built
those wall-clock strings in it — so the one value could not be fixed without splitting it.

**Decided: a journey reads in the leg's own two zones** — `legDisplayZones` (`lib/places.ts`), beside
`eventEdgeZone` because it is the same question asked of two rows at once. The departure takes the
**origin's** end zone (where you are standing when you go — which is ADR-0107 §4 as `Home` already
states it: _"a moment on the wrist of whoever is leaving"_) and the arrival takes the
**destination's** start zone. It honours `DayLeg.fromEdge` for the same reason `endpointPlaceId`
does: a leg off a hire's pickup leaves from the counter it was collected at.

**The two zones are deliberately not subtractable across a crossing**, and that is the trade. `יציאה
19:05 · הגעה ~20:28` over a 23-minute drive looks like arithmetic that does not add up; the
alternative — one zone for the block — makes the arrival disagree with the card it is about. Each
clock agreeing with the row it names is ADR-0107's own grammar and what the two cards either side of
the block already do, so the block joins them rather than inventing a third convention. On a
single-zone day, which is nearly every day of nearly every trip, the two are identical.

**The regression guard is at the RENDER level, deliberately.** The invariant nobody had written
down — _a stated departure is never later than the arrival it is counted back from_ — is now asserted
over `dayJourney`'s arms (`lib/day-joins.test.ts`), and **it was true on `main` throughout the
defect**: the derivation was never the thing that was wrong. Only a spec that reads the string a
person sees could have caught this, so `ui/domain/DayJoinRow.zones.test.tsx` pins the reported
`20:31` against the zone that produced it, and both day screens assert it over their own wiring
(`DayView.travel.test.tsx`, `PlanDay.travel.test.tsx`). Verified red against the old wiring before
being made green.

**And the fixture's DIRECTION is load-bearing**, which is worth writing down because it is why this
survived a shipped screen spec: a trip primary _behind_ its stops prints a departure that is merely
**early** — true, unalarming, invisible. Only a primary _ahead_ of them pushes the clock past the
hour it is counted back from. The specs use the reported direction.

### AQ2. The hero used a mode nobody had chosen, and the fix is a call site rather than an argument

> The day row shows `נסיעה · ~23 דק׳` with the car selected. The hero shows `הליכה · ~1:16 שע׳` and,
> off that figure, `51 דקות באיחור ליציאה`.

Owner, on what the report actually was: _"I switched from walking to driving but it stayed at
walking."_ Confirmed on the seeded trip at one moment: the day row honoured the override on the pair
and the board printed the walk, **53 minutes wrong about a departure**.

One line: `Home.tsx`'s `derivedTravelMode(bookings)` — the **trip's** default, from before §AM made
the mode per LEG. The board never learned, and `useDayTravel`'s options (`{ tripId, stops, modes? }`)
have no way to be told about an override, where both day surfaces go through `useDayTravelReads`,
whose `overrides` parameter is **required** for precisely this reason (§AM7): _"an optional list with
an empty default reads as harmless and isn't, because a surface that forgets to wire it silently
ignores every declaration on the trip, which is indistinguishable from nobody having made one."_ The
board is that sentence coming true, and it is `frontend/CLAUDE.md`'s _"an amendment applied to ONE
call site of a shared component is not applied, and nothing fails"_ a third time.

**So the fix is not to pass a mode into the board's existing call**, which would repair the symptom
and leave the shape that produced it. The board asks `useDayTravelReads` — the same function the two
day surfaces ask, about the same leg — and holds no derivation of its own. **Counted before
changing it: `derivedTravelMode` had three production consumers** (`day-travel.ts`, `Home.tsx`,
`Map.tsx`). It has **two** now, and both are correct: `day-travel.ts` is the shared derivation, and
`Map.tsx` reads it as the _fallback_ it hands `legTravelMode` (§AM8 fixed the canvas already). The
board's was the only one standing in for a leg's own answer.

**A second inversion fell out of the same change and is a fix, not a side effect.** The board
resolved its leg's origin with `eventPlaceId(prevEvent, booking)` — whose default is `arriving` — so
the leg out of a flight you had just got off was measured from the airport it **took off** from. That
is the inversion `endpointPlaceId` exists to get right, asked a second time and answered the other
way; it is exported now and there is one of it. Where an in-progress row supplies the origin the two
agreed already, because `heroHorizon` passes `heading` for the mid-span event and a transport row is
the only one that can be in progress.

**§AA4 re-checked, as the card asked.** `hero-travel.ts`'s docblock claims a leg declared תחב״צ
_"cannot reach this function with a duration, by construction"_, and that still holds — for a better
reason than before. `useDayTravelReads.estimateFor` narrows through `isRoutableMode` (§AM5's single
narrowing at the provider boundary), so no request is made at all and `travelSeconds` is `null`;
`heroLeaveBy` answers `null`, and the whole block is absent. **The board degrades to §D4's silence,
never to a walking number** — asserted. It does not show the leg as `תחב״צ` with no estimate the way
the day row does, and that asymmetry is right: §AM6's argument for the `DECLARED` arm was that the
block is the only thing carrying the mode control, and the board carries none.

### AQ3. `בדרך` on the day was a SYMPTOM of §AQ2 — and there was a real gap underneath it

> The hero offers `בדרך`. The day view's journey rows offer a mode switcher and a caret, and no way
> to say you have set off.

**Reproduced, and then not reproduced.** Driven against the running app, the day's journey block
offers `בדרך` and, once pressed, `ביטול סימון` — which survives the toast, so the guessed shape
("marking is reachable and unmarking is only the toast's transient undo") is not what was happening.
Both surfaces gate the offer identically, on the leave-by having **passed**.

The reported screen is §AQ2: the board was on the walk (departure 51 minutes gone → `PASSED` → the
control) and the day row was on the drive (departure a minute away → `AHEAD` → no control). One leg,
one moment, two arms, because the two surfaces disagreed about the mode. **Fixing §AQ2 fixes the
report**, and it is recorded here rather than fixed twice.

**Underneath it there is a real gap that §AQ2 does not touch.** `dayJourney` checks `OVERRUNS`
before it ever looks at `onWay` — deliberately, §AH1 — so on a leg that does **not fit**, the arm is
always `OVERRUNS` and this screen's control, keyed on `PASSED`, offered nothing. That is the leg
where saying so matters most: an infeasible leg has no leave-by at all, so the clock can never make
the offer, and the board (which has no `OVERRUNS` arm) goes on offering `בדרך` about the same leg.

**Decided: `OVERRUNS` earns the mark, and a mark that is set is always takeable back.** Both arms are
one question — _is the departure still the live thing to say_ — and `liveAction` now asks `liveOnWay`
**first**, which is the half that was actually missing: with the arm pinned at `OVERRUNS`, a branch
keyed on `ON_WAY` could never offer the undo either. This is the board's own rule
(`onWayToNext ? undoSettle : …`), which is the point. **The row keeps saying the shortfall**: what
the mark withdraws is the nudge, not the warning, and the warning is still true once you are moving.

**Nothing new was built.** The store, the verb, its toast, its undo and the read were all shipped
(ADR-0161, ADR-0207 §7, §Z5 §M4); this is one predicate. Per the `SettleControl` family's own
lesson — three hand-rolled settle affordances drifted on four axes while every test stayed green,
because the **vocabulary** diverged and not the geometry (ADR-0139) — the existing verb, the existing
copy and the existing button are reused exactly.

**Trip mode only, and that is ADR-0159 §1 rather than an omission.** "Have I set off" is a fact about
the present, and §1 forbids the two day surfaces differing about a fact — but Plan mode has no
inline settle pair at all (ADR-0171 §10e), and a screen for building a day is not a screen you stand
in. The posture clause is what licenses the difference; the _facts_ on this block — the mode, the
distance, the way to the map, and now the hours it states — are shared, and §AQ1 above had to fix
one of them on both surfaces for exactly that reason.

### AQ4. One thing found on the way, and deliberately not fixed here

The day's **last** bookend leg — the journey into the stay you sleep in (ADR-0209 §1) — passes
`arriveByMs: Date.parse(leg.to.startsAt)`, and a stay's `startsAt` is its **check-in**, which on a
middle night is days in the past. So the leg takes the `PAST` arm and says nothing at all, while the
comment directly above the call already states the rule it breaks: _"a stay has no per-day arrival
instant, so reading its `startsAt` as this hole's deadline would measure a window from its check-in
day."_ Reproduced on the seeded trip (the row printed its duration and distance and no clock).

It is the same family as §AF3 and §AJ1 — a bookend leg reading an instant that is not this day's —
and it is a fourth defect rather than one of the three reported. It is on the backlog with this
reproduction, not smuggled into this round.

## AR. Two more off the same deploy — a departure with its reasoning withheld, and a number with no unit (2026-08-27)

Both reported off the §AQ deploy, both on surfaces §AQ had just touched, and neither is a defect
§AQ introduced — they are older than it. Reproduced against the same seeded fixture and pinned
clock before either was changed.

### AR1. The journey states the arrival beside the departure, always — amending §AJ2

> _"I think that the transit rows should also display the arrival time (if you take off at the
> suggested time) so then we immediately know why they tell us to take off at that time."_

`יציאה 20:46` is an **instruction with its reasoning withheld**. The reader is told to go at a
minute the app worked out and given nothing to check it against — and the whole point of a
statement surface (ADR-0159 §1) is that it states rather than instructs.

**This amends §AJ2, which decided the opposite six weeks of reports ago**, and it is worth being
exact about which half moves. That section gave the slot three shapes:

| shape               | meant                                              |
| ------------------- | -------------------------------------------------- |
| `יציאה X`           | there is a deadline; the buffer fits               |
| `יציאה X · הגעה ~Y` | there is a deadline; the departure was **clamped** |
| `הגעה ~Y`           | there is **no** deadline                           |

**The distinction §AJ2 was defending survives untouched**: `יציאה` still means "there is a deadline
to advise against" and `הגעה` **alone** still means "there is none", which is the difference §AJ2
called _"a difference a reader can act on"_. What the old gate also happened to encode was whether
the departure had been **clamped** — and that was never something a reader was asked to recover
from the shape. It is legible from the two clocks themselves: a clamped departure is the previous
row's own end, which is sitting directly above.

So the second row of that table absorbs the first, and the third is unchanged.

**Which arrival, and the parenthesis in the report is the whole answer.** A leg has two candidate
arrivals and they are different numbers:

- `departAfterMs + travel` — the earliest you could be there. **What the code computed**, and it
  cannot explain the departure beside it, because it is not about that departure.
- `leaveByMs + travel` — where the departure the row is advising actually lands. _"If you take off
  at the suggested time."_

It is the second. On an ordinary leg that resolves to `arriveBy − buffer`, so the row shows §D5's
buffer rather than describing it: `יציאה 19:31 · הגעה ~19:55` above a table at `20:00`. The two
coincide on a clamped leg (there `leaveByMs` **is** `departAfterMs`), which is why §AJ2's shipped
sentence needed no change, and the old formula is still right for a **flexible** destination, where
the app advises no departure and the earliest you could be there is genuinely the answer.

**One arm must still say nothing, and it is the one that would look most helpful.** A `claimDenied`
leg (ADR-0208 §2 — the group said they did not go to the stop the leg starts from) now has an
arrival where before the gate happened to withhold it. It is nulled explicitly: the instant is
derived from the end of a stop nobody was at, so stating it is exactly the claim that arm exists to
refuse, offered in the confident voice of a prediction. **A widening is a second decision at every
arm it reaches**, which is §AJ1's own lesson about fallbacks, applied to a gate coming off.

**Measured, and the measurement corrects §AJ2's.** That section recorded the meta line's box at
**206.95px** at 360 and the combined sentence at **140.06px**. Today the box is **165.28px** at 360
(195.28 at 390) and the sentence **122.63px** — because M8b put the mode chip in that row after
§AJ2 measured it. The conclusion is unchanged and the numbers are not: the combined line renders on
**one line at both 360 and 390**, does not overflow, leaves the row at **58px**, and is still
narrower than the widest string already shipping in the slot (`הגעה ~20:40 · אחרי סגירת החלון`, now
**148.36px**). §AJ2's own rule caught its own figures — _a measurement is about a configuration, and
quoting it outside that configuration is memory_.

**`PASSED` keeps saying only that the departure passed.** `זמן היציאה עבר ב־20:31` names a departure
nobody is going to make, so an arrival beside it would be a prediction off an instruction already
withdrawn. The OVERRUNS arm is unchanged for the same reason: it states the shortfall, which is the
number you act on.

### AR2. The countdown tile's number carries its measure word in every arm

> _"It says 6 to take off, but 6 what? It should have the time units, like in other places."_

`6 · ליציאה`. Two of the board's four tile arms spread `formatCountdown` and then **overwrote its
`unit`** with a preposition phrase, so the ladder's own word was discarded and the number floated:

```
{ ...formatCountdown(leave.minutesToLeave), unit: t.board.leaveIn }
```

**ADR-0208 §1 had already found this exact defect and fixed it on one arm.** Its own words: _"the
unit slot has always carried **either** the measure (`דקות`) **or** the referent (`ליציאה`), and
`באיחור` carried neither"_ — and the repair gave the passed arm all three parts over two lines. The
two arms beside it were carrying only the referent, which is the same half-empty slot, and nobody
asked them the same question. It is `frontend/CLAUDE.md`'s one-call-site failure inside a single
component's props.

**`closesIn` had it too and was never reported.** `לסגירה` is the precedent `leaveIn` was written
from — overwrite included — so a shutting check-in window read `15 · לסגירה`. Fixed with its
sibling rather than after it: they are one slot, and repairing the reported one alone is how this
came back the second time.

**Both arms keep the ladder's word and move the preposition to `unitBelow`** — the second unit line
ADR-0208 §1 built for exactly this, so no new mechanism. The table there gains nothing and loses a
row:

| arm                   | value  | unit line 1   | unit line 2 |
| --------------------- | ------ | ------------- | ----------- |
| counting to the event | `2:00` | `שעות`        | —           |
| leaving is live       | `6`    | `דקות`        | `ליציאה`    |
| a window is shutting  | `15`   | `דקות`        | `לסגירה`    |
| the leave-by passed   | `15`   | `דקות באיחור` | `ליציאה`    |

**Two lines rather than one, and this was measured rather than assumed.** `דקות ליציאה` is 55.39px
of ink and **does** fit one line — it would take the tile from 74px to 81.4px, which is a width the
passed arm already occupies. The reason it is two lines anyway is the **row**, not the tile: at 360
against a long `הבא בתור` title, the one-line form costs the title **7.4px** (9.2px at its worst,
`שעות לסגירה`) where the two-line form costs it **nothing at all** — the tile stays at its 74px
min-width and grows 13px downward instead. §Z5 §M1 already recorded 11px of that title as the point
where it breaks onto a second line, so this spends none of a budget known to be nearly out. It also
leaves all four arms structurally identical, which is right: they are the same tile answering the
same question from different distances.

### AR3. What guards them

- **The arrival**: a spec that asserts the arrival is `leaveByMs + travel` and **not**
  `departAfterMs + travel` — the two are both "an arrival", so a spec that only checked one was
  present would have passed on the wrong number.
- **The tile**: a sweep over **all four arms** asserting the first unit line contains one of the
  ladder's own measure words. Verified red against the old wiring, where it fails on exactly the two
  arms that had the defect and passes on the two that did not. A per-arm assertion is what was
  missing — §1 asserted the arm it fixed.

## AS. The leg back into tonight's bed was silent, and a flag's NAME is why (2026-08-27)

Found by the owner reading §AR's own screenshot: _"I can see that the הגעה is not on all transits,
why not on the walking rows? Wouldn't it be better to be more consistent?"_

**It was not the walking rows**, and establishing that took one experiment rather than an argument:
`dayJourney` takes instants, an estimate and a clock, and **no mode at all** — so mode cannot reach
the sentence. Read at 08:00 with the whole day ahead, the same walking row that was silent at 19:25
printed `יציאה 16:23 · הגעה ~16:55`. What the two silent rows shared was not the walk. It was that
both were the day's **bookend** legs — and only one of them was silent for a good reason.

### AS1. `bookend` was written six times to mean one thing and read once to mean another

`DayLeg.bookend`'s own docblock says what it is: _"this leg leaves a BOOKEND rather than a row — the
stay you woke in. It has no departure window: a middle night's `endsAt` is a check-out days away."_
That is a fact about the leg's **origin**, and its one reader — the `departAfterMs` ternary — asks
exactly that.

The day has three bookend legs and all three were marked `bookend: true`, because in plain English
all three are bookend legs:

| leg                               | origin           | destination | `bookend` was | correct?                                   |
| --------------------------------- | ---------------- | ----------- | ------------- | ------------------------------------------ |
| out of the bed (§AD)              | the stay         | first row   | `true`        | ✅                                         |
| in off the night (§AJ3)           | a span edge      | the stay    | `true`        | inert — it carries its own `departAfterMs` |
| **back to the bed** (ADR-0209 §1) | **the last row** | the stay    | `true`        | ❌                                         |

On the third the stay is the **destination**; its origin is an ordinary row whose `endsAt` is
exactly when you leave. So the flag suppressed the one instant that leg needed, and §AR1's arrival —
which is `leaveByMs ?? departAfterMs` plus the leg — had nothing to count from. **The row was blank
at every hour of every day**, and had been since ADR-0209 §1 built it.

**The comment above that write is the whole story, and it was right about a hazard the flag never
addressed.** It read: _"`bookend` on it too — a stay has no per-day arrival instant, so reading its
`startsAt` as this hole's deadline would measure a window from its check-in day."_ True, and that
hazard is handled by `flexibleArrival`, which asks `isExactEdge(to, 'start')` and gets `not-before`
from any stay. The author reasoned about the **destination**, reached for a flag about the
**origin**, and the name did not stop them — which is the same lesson ADR-0184 §9a wrote when it
deleted `edgeHoldsPosition`: _"a name that contradicts the behaviour is what the next reader
trusts."_ So the field is **`fromIsStay`** now. It states the fact it encodes, and a writer cannot
reach for it by analogy.

### AS2. The two day surfaces disagreed about a fact, and one of them was right

**Plan mode printed `הגעה ~21:26` on this leg the whole time.** It never read `bookend`: it asked
`stayRowIds.has(from.id)` — the origin question, directly — and got the right answer. Trip mode read
the flag and got the wrong one. That is ADR-0159 §1's forbidden case, and it is the **third** time
this pair has drifted (§AG6, §AM7's two singular-mode consumers).

**The cause is that the same question had two implementations**, which is root `CLAUDE.md`'s rule 8
in its usual disguise: not a duplicated mechanism, a duplicated _predicate_. So `planJourney` takes
the **leg** now rather than its two ends, and reads `leg.fromIsStay` — one flag, set where the legs
are built, read identically by both screens. There is nothing left to answer twice.

**This is also why the round that shipped §AR1 did not catch it.** §AR1 widened the arrival and was
verified on both surfaces — but through a URL that does not exist: Plan mode is **in-memory state**
(`mode-state.tsx`, session-only by ADR-0016), so `?mode=plan` silently stayed in Trip mode and the
"both surfaces" check was Trip mode twice. **Plan mode has to be entered by clicking its toggle**,
and any future check of a Plan/Trip difference must assert which mode it is actually in — the specs
below read the toggle's `aria-pressed` for exactly that reason.

### AS3. What guards it

`DayView.travel.test.tsx` already had a spec for this leg — **it counted three blocks and never
asked what the third one said**, which is precisely how a permanently blank row shipped under a
green suite. A count is not a read.

**And the asymmetry in the specs is the asymmetry in the bug.** `PlanDay.travel.test.tsx` has had
_"the drive into tonight's hotel cannot be impossible"_ since §AJ1, asserting `הגעה` on this exact
leg. Trip mode had a count. So the surface with the assertion is the surface that was right, and the
one with the count is the one that was blank — which is not a coincidence and is the most useful
thing in this section: **when two surfaces must agree about a fact, the spec has to be written twice
or the agreement is untested.** It now asserts the sentence, on both surfaces, off the last
row's own end; and that the row states `הגעה` **alone**, because a check-in floor is not a deadline
(§AI1) and the absence of `יציאה` there is a decision rather than the old suppression.

### AS4. This closes the backlog line §AQ4 opened

§AQ4 filed this as _"the day's LAST bookend leg reads an instant that is not this day's"_ and blamed
`arriveByMs` — the stay's check-in, a week in the past. That diagnosis was **half right and named
the wrong half**: `arriveByMs` is inert on this leg (a stay's start is not exact, so `deadlineMs` is
`undefined` and it is never consulted once an arrival exists). The silence was `departAfterMs`. The
backlog line is pruned with this change, and the difference is worth keeping: the first diagnosis
was written from reading, the true one came from dumping the leg's actual inputs in the browser.

### AS5. A leg that does not fit still lands somewhere, and now says when

> _"I see the חסרות 8 דקות לדרך row doesn't show the (late) arrival time. We'd want to know how late
> we arrive, no?"_

Yes. §AR1 widened the arrival to every arm that states a departure and **left `OVERRUNS` alone**,
recorded there as _"it states the shortfall you act on"_. That was half the sentence: the shortfall
is the **size of the problem** — how much has to move — and it says nothing about **when you would
actually be there**, which is the other half of the same decision when somebody is choosing what to
drop from a day.

The row says both now: `חסרות 8 דק׳ לדרך · הגעה ~20:08`, and the two agree by construction (a
20:00 start plus an 8-minute shortfall is a 20:08 arrival), which is itself worth having on screen.

**No new derivation** — the instant has been on this arm since §AR1. On an infeasible leg the clamp
pulls the departure to the origin's own end (there is no buffered departure that exists), so
`arriveAtMs` is already `departAfterMs + travelSeconds`: _leave the moment the row above frees you,
land here_. It is the earliest arrival that exists rather than the best case of advice nobody can
follow, which is why the app can state it.

**Both halves of the arm take it, including `אין זמן לדרך`.** Two rows that touch have no gap for
the journey to be longer than, so the shortfall is the wrong sentence there — but you still land
somewhere, and how late is exactly as actionable. The one that does not take it is
`arrivesAfterClose`, which already led with the arrival and names the thing that makes it matter
(`הגעה ~20:32 · אחרי סגירת החלון`).

**`PASSED` still says only that the departure passed**, unchanged and for §AR1's reason: it names a
departure nobody is going to make, so an arrival beside it would be a prediction off advice already
withdrawn.

## AT. The day painted twice, and the second paint was the feature arriving (2026-08-28)

> _"The day/plan day views started blinking after adding calculated rows like the total travel time
> etc. Very recently, since yesterday I think."_
>
> _"Sometimes the events don't have locations and so the total time and distance calculations could
> be misleading, maybe change the phrasing I'm not sure."_

Two reports, one root: **§D4 collapses "we have no number" and "we have not read our own cache yet"
into the same absence, and M6a/M11 made that collapse structural.** A journey row and the day's
total do not fill in when an estimate lands — they **appear**. So a day that paints before its own
Dexie read has come back paints a second time, taller, a beat later.

**Measured in the live page** (`e2e/day-paints-once.spec.ts`, a four-event Tokyo day at 390×780,
sampling `.day-page` every frame):

| when                           | rows | height  | gap           |
| ------------------------------ | ---- | ------- | ------------- |
| first paint, from the snapshot | 8    | ⁦509px⁩ | —             |
| second paint, cache answered   | 10   | ⁦671px⁩ | ⁦174ms⁩ later |

⁦162px⁩ and two rows, on **every** open of **every** day — the cache read runs on every mount, and
the day's total sits at the TOP of the page, so the whole list below it steps down. That is the
blink. Cold, the same two paints arrive ⁦269ms⁩ apart with the network's answer instead.

Neither report was visible to the unit suite, and not by accident: jsdom has no paint, and **both
frames are correct renders of what the app knew when it drew them**. The defect is only in their
sequence, which is why the proof is an e2e that asserts a _count of distinct painted shapes_ rather
than any particular shape.

### AT1. The day holds its first paint for its own cache, and for nothing else

`useDayTravel` now answers `settled` — false only while the **local** read for this day's legs is in
flight — and both day surfaces carry `data-measuring` until it lifts.

**The line is the local read and the network is on the other side of it**, which is the whole of
the decision:

- **The cache's answer is not new information.** It is what this device already knew and had not
  looked up yet; painting before it is the app racing itself. Bounded by an IndexedDB round trip
  (⁦75–175ms⁩ measured), and `DAY_TRAVEL_SETTLE_MAX_MS` (⁦700ms⁩) is a floor under the one failure the
  hold could cause rather than cure — a Dexie read blocked by another tab would otherwise leave the
  day laid out and never painted.
- **The server's answer IS new information**, and holding a day's content on a request is what root
  `CLAUDE.md` rule 5 refuses. So a genuinely first-ever visit to a day still gains its journeys when
  the matrix comes back. That is once per day per device, ever, and it is the app learning something
  rather than catching up with itself.

Three details are decided rather than incidental:

- **`visibility`, not a mount gate.** The day lays out, keeps its refs, its scroll position and its
  measured boxes, and is simply not painted for a frame or two. Removing the rows would make the
  hold a second structural state — the exact thing being fixed — and would re-run every arrival when
  they came back.
- **No fade on it.** The body already fades on a tab change; a second beat here would trade a jump
  for a flicker. What the hold is worth is that there is no beat at all.
- **A peek never holds** (`useIsDayPreview`). `DayPeek` mounts panes mid-gesture, so a pane that held
  its paint would slide in blank — and a peek never fetches, so it has nothing to hold for. This is
  also what makes the swipe free: the peek's read populates the session's `readDays`, so the day a
  page turn lands on is settled on its **first render**, with no read to wait for.

The session mirror is the second half of that. `sessionKnown`/`readDays` sit beside `askedDays` and
answer a different question — `askedDays` is _has the SERVER answered this day_, these are _has this
DEVICE said what it holds_ — so a second mount of a day is complete synchronously rather than one
read later.

### AT2. A total that covers three of five hops must not read like the day's

§AP2 made the total a roll-up of the **journeys** so the header and the list describe the same
objects. Its cost is that a hole drawing no block is invisible here too — right for a leg still
warming, wrong for a hole with an end **nobody placed**, which will never gain a number. A day of
five hops running through one unplaced stop printed the three it could measure as `⁦6.8⁩ ק״מ · ⁦~1:20⁩
שע׳`, and nothing on screen said what that covered.

This is §D4 failing in the direction that rule exists to prevent. The reader is not being asked to
tell "not computed" from "not computable" — they are being told a number that **looks complete and
is not**. Absence is silence; a confident wrong total is not absence.

So `useDayTravelReads` counts `unplacedLegs` — a hole with an end that resolves to no place, or to a
place with no coordinates — and `dayTravelTotal` takes it as a **required** argument (a surface that
forgets it silently claims completeness it has not got). Where it is non-zero the line leads with
`לפחות`: `לפחות ⁦6.8⁩ ק״מ · ⁦~1:20⁩ שע׳`.

- **The word leads and does not trail.** Both halves are floors, and a qualifier at the end would
  attach to the minutes alone.
- **It wraps the line rather than joining the halves**, so §AP1's half-line case (a day of declared
  legs, distance alone) takes the same word off the same string and cannot drift from it.
- **A pending or refused leg does NOT earn it.** That is §D4's ordinary absence and the number may
  yet arrive; a marker that flipped off when the matrix answered would be a claim changing under the
  reader. Only a permanent hole in what the total covers is named.
- **A hole whose two ends are the SAME place is not counted.** It travels nothing, which is measured
  rather than missing.

The arithmetic is untouched. What a floor changes is the claim, not the numbers — inventing a
distance for a leg with no coordinates would be the same failure one step further on.

## AU. A stop added to the day had no route, and three separate things had to be true for that (2026-08-28)

> _"I've added two stops to my trip, and no route or time estimations. I'm not sure why, maybe
> because the default transportation for this trip is walking (as there's no car rental here)."_
>
> _"I think that the transportation mode should be decided based on the distance (walking or
> driving). Of course you should always see it and should be able to switch between modes."_
>
> _"Perhaps the reason is that the route is not automatically triggered when you add stops - which
> it should. That's actually my biggest suspicion, because I left the app and came back after some
> time, and then I had a route."_

The owner's second guess is the right one, and their first is a real defect standing behind it. A
day with two new stops in the Galilee showed **no journey row at all** on either hole — no time, no
distance, and **no mode control**, because the block that carries the control is the thing that did
not render. Three faults compose:

1. **The ask gave up too early** (§AU1). `useDayTravel` asked once, retried once, and let go — and
   a cold day's warm is three matrix calls the server paces at ⁦1/s⁩, against a `Retry-After` it
   floors at ⁦2s⁩. The one retry regularly lands mid-warm. Nothing re-asks after that, so the day
   stays silent until the fingerprint changes or the surface remounts, which is exactly _"I left
   the app and came back after some time, and then I had a route."_
2. **Nothing said a number was coming** (§AU1). §D4 makes absence silent, so "still computing" and
   "not computable" render identically — and since M6a that means the row does not exist. The
   reader is given no reason to wait and no control to act with.
3. **The mode was the TRIP's, so a ⁦127 km⁩ hop was a walk** (§AU2). §Z2 derives a walking trip from
   the absence of a car hire, and the gate refuses walking past ⁦15 km⁩ — so the leg was unanswerable
   by construction, on a trip where nobody was ever going to walk it.

Each one alone is survivable. Together they are a feature that looks broken and cannot be argued
with.

### AU1. "Being computed" is a third state, and §D4 never covered it

**§D4 is amended a second time, by the same argument §AT made.** That rule says the reader must not
be able to tell "we have not computed this" from "this is not computable". Both of those are
**settled** states — the number is not coming, or it is not coming from us. A leg the server is
warming right now is neither: it resolves into a visible event a few seconds later, and a rule
about indistinguishable absences has nothing to say about a state that ends.

§AT already made this move for the **local** read (_"we have not read our own cache yet is not
absence"_). This is the same claim one layer out, for the **network** one, and it is what §AT1's own
deferral asked for in as many words: _"the version that fixes it without waiting reserves the row's
slot … which needs a state the journey block does not have today (§D4 has no 'asked, not yet
answered')."_ It has one now.

**Two halves, and both were needed:**

- **The client keeps asking.** `DAY_TRAVEL_WARM_ATTEMPTS = 6` rounds, each sleeping the interval
  the answer itself carried (⁦2–30s⁩). It bounds **rounds and not seconds**, so a slow warm is
  waited out and a dead provider still terminates into §D4's silence. Every extra round is a DB
  read plus a warm the server already dedupes (`RoutingService.once`) — the cost is a request, never
  provider work.
- **The row says so.** A `WARMING` arm on `dayJourney`, ranked below `DECLARED` and `TOO_FAR` (both
  permanent) and **above** the floor that bails on a missing estimate — that bail is what deleted
  the row. It renders the mode, the mode control, and `מחשב מסלול…` where the duration will land,
  with a sized `Skeleton` holding the slot so the row does not resize when the number arrives.

**What it deliberately does not do:**

- **No crow-flies distance.** §AM10 already drew this line for the pending case: _"a crow-flies
  number that later becomes a routed one is a figure that changes under the reader."_ The day's
  total reads these journeys, so a stand-in here would also make the header climb leg by leg.
- **No correction to the free time, no leave-by.** §V1.1's rule — never a guess we did not measure,
  in the direction that costs somebody their afternoon.
- **No second live mark.** §D6: `.nowline` is the app's one. `Skeleton`'s existing shimmer is the
  shared idle treatment, taken from `ui/feedback/` rather than minted here.
- **It is not "the server said `pendingModes`".** The gap opens _before_ the first answer lands —
  a day whose stops just changed holds nothing and has been told nothing, and that is the second
  the reader is looking at the screen. So the signal reads the **ask**, narrowed by `refusedModes`
  as answers arrive: a mode the gate refused must never spin for six rounds and then blank.

### AU2. The DISTANCE decides a leg's mode; the trip's bookings are the floor under it

**§Z2 is amended: `derivedTravelMode` is no longer any leg's default.** It answers _is there a car
on this trip_, which is a fact about the trip, and it was being used as a fact about every leg.

The report is the proof. A trip of flights and hotels is a **walking** trip by §Z2 — correctly, by
that rule's own reasoning — so the hop from Tel Aviv to the Galilee was measured as a walk, refused
by the gate at ⁦15 km⁩, and rendered as nothing. **No car booking was ever going to fix that**: you
take a bus, a taxi or a lift, and every one of them is `driving` as far as a router is concerned.

So: `defaultLegTravelMode(from, to, tripMode)` — over `WALK_DEFAULT_MAX_M` (⁦2.5 km⁩) the leg drives,
under it the leg walks, and `tripMode` answers only where there is no distance to read (an end
nobody placed, §AM4's inert leg).

- **It outranks the booking in BOTH directions**, which is what makes the rule one sentence rather
  than two: a long leg drives on a trip with no car, and a ⁦300 m⁩ hop walks on a trip with one,
  because you park and then you walk. §Z2's closing line — that a per-leg answer is _"the per-leg
  override's job"_ — was written when the only per-leg input was a person. **A leg's length is a
  per-leg input the app has had all along.**
- **⁦2.5 km⁩ is a DEFAULT, not a limit.** `TRAVEL_GATE.walking.maxMeters` stays at ⁦15 km⁩ and §Z8's
  judgement is untouched: a group walks a long way **on purpose**, and a walk that far must still
  be pickable. The two numbers are far apart deliberately — the band between them is every leg the
  app guesses `driving` for and a person may still switch to a walk in one tap.
- **⁦2.5 km⁩ is derived, not chosen.** At §Z2's measured ⁦4.9 km/h⁩ and §Z7's ⁦1.16⁩ median road/crow
  that is a **~35-minute walk**: the length past which the answer stops being obvious. It is the
  one number here a device pass may retune from feel.
- **An override still wins.** §AM is untouched — this changes what the app guesses, never what a
  person said.
- **The comparison that clears an override moves with it.** `useLegModeControl` cleared the stored
  row when the pick equalled the **trip's** mode; it now asks `defaultModeFor` for that leg.
  Unchanged, a walking trip's short hop picked as `הליכה` would have persisted a row saying what
  the derivation already says, and then held it against a later change.

**Two call sites, counted rather than assumed** (root `CLAUDE.md`'s own rule, and §AM8 is the
report from the other side of it). `legTravelMode` is read by `useDayTravelReads` — which the day
list, Plan mode and the board all go through — and by the **Map**, which builds its own `legModes`.
The Map was passing the trip's mode as the fallback, so without the same change it would have asked
for the ⁦127 km⁩ leg's **pedestrian** geometry: a different road, and past walking's ceiling, no road
at all. Both call sites take the same pair of derivations, in the same order.

### AU3. What this leaves open

- **The threshold wants a device pass**, with `TRAVEL_BUFFER_SECONDS` and `ARRIVAL_RADIUS_MAX_M`,
  which the backlog already groups as judgements of the same standing.
- **The warming row's copy has not been seen on a real phone.** `מחשב מסלול…` is drawn in
  [`mockups/a-route-is-on-its-way-v1.html`](../../mockups/a-route-is-on-its-way-v1.html) and
  measured at 360 in both themes; whether it reads as reassurance or as noise on a day with four
  cold holes is a judgement only a real cold day makes.
- **`WARMING` is a Trip-and-Plan arm only.** The board (`Home`) reads the same journeys through
  `useDayTravelReads`, so it inherits the state, but the countdown TILE has no shape for "computing"
  and deliberately keeps saying nothing rather than guessing at one.

## 2026-08-28 amendment — two field reports off the shipped day

Both from the owner, against the day list after ADR-0210 landed.

### §AK2 — the warning mark leaves the mode tile, because the tile is gone

_"The warning icon is hiding the car glyph."_

**§AK1 is the rule and it stands:** the mode mark keeps its slot, because M7 swapped the glyph for
`warn` and a day of five stops then read as _"three journeys and two errors"_. §AK2's **corner
badge** was only that rule's implementation, and it assumed the ⁦38px⁩ tile
[ADR-0210](0210-a-day-is-points-lines-and-envelopes.md) removed. Measured against the ⁦19px⁩ glyph
that replaced it, a ⁦15px⁩ badge is **79% of its host**: it covered 23% of the glyph outright and its
halo hid most of the rest — so the corner mark had begun doing the exact thing §AK1 reversed M7
for. (Its halo was `--card` besides, which stopped being this arm's ground when the card did — the
same mistake ADR-0210 fixed on the glyph's own halo and missed one element away.)

**The mark now sits inline at the head**, before the mode word. §AK1 survives with no tile: the mode
keeps the column, the warning sits with the words that say what is wrong, and it is still ONE mark
taking no hue of its own (§AK3.1) — the head is already `--miss-deep` on the arm that can carry it.
It needs no absolute placement, no overhang ratio and no halo, because it no longer sits on a tinted
tile. It does need `align-self: center`: `.day-trv-hd` is `align-items: baseline` and an inline SVG
has no baseline, which `docs/backlog.md` already records from an owner report.

**The spec that should have caught this asserted the placement rather than the rule** — it checked
that the mode glyph was in the badge column and that a flag existed somewhere in it, which stayed
true while the flag was obliterating the glyph. It now asserts §AK1 itself: the mode column holds the
mode **and nothing else**, and the warning is a second mark elsewhere.

### §AU1 — a day is recorded as answered only if it learned something

_"Sometimes, I'm not sure when, on plan day/day view, the driving/walking rows don't show up, and it
stays that way until I restart the app."_

**"Until I restart" names the mechanism**: `askedDays` is module state, cleared only by a reload, and
a day in it is never asked again. It was recorded on `retryAfterSeconds === undefined` **alone** —
which means "nothing more is coming", not "something arrived". A batch that came back with **no
legs** therefore marked the day answered in full while teaching it nothing; `merge` stores nothing
for an empty set, so no estimate reached `sessionKnown` or Dexie either, and every later visit
early-returned on a day holding no numbers. The rows were absent, permanently, until reload.

The rule was **already written for the neighbouring case and simply not applied to this one** — a
still-warming day is deliberately not recorded, _"that is how it gets its numbers at all"_. A day
that learned nothing is in the same position. So the day is recorded only when the batch carried an
estimate or a refusal; refusals count, because a refusal is an answer that is never coming again,
which is what `refusedOf` exists to say.

Guarded by a pair, because either half alone is satisfiable the wrong way: one spec asserts an empty
batch leaves the day re-askable **and** that re-opening it recovers real numbers, the other that a
day which _did_ learn something is still asked exactly once.

## AV. §AU2 asked the crow, and a mountain is crow-close (2026-08-28)

> _"I noticed that after your change (?), sometimes the map defaults to walking. I think that
> walking should be defaulted to only when it makes sense, definitely not a four hour walk, max 10
> minutes probably (or an urban trip but that's probably a whole epic so don't worry about it)."_

Reported off the Iceland trip, one day after §AU2 shipped. The day's first leg — Hafaldan hostel in
Seyðisfjörður to **Baugur Bjólfs** — read `הליכה · ~4:18 שע׳ · ⁦12 ק״מ⁩`, with a departure counted
back to **⁦03:06⁩**.

**§AU2's rule was right and its instrument was wrong.** Bjólfur is the mountain standing directly
above the town: **⁦1.4 km⁩ as the crow flies, ⁦12 km⁩ of switchbacks on foot.** The default asked
`haversineMeters`, got a number under ⁦2.5 km⁩, and called a four-hour ascent a stroll.

### AV1. The walking TIME decides, and the crow is only the floor under it

**No crow threshold fixes this class.** To be safe against a mountain the number would have to sit
near ⁦200 m⁩, which would drive everything including the walks people obviously take. Distance was a
proxy for the question, and the question is time — which the reader is deciding about, and which
the router already answers.

So `defaultLegTravelMode` takes three inputs, ranked:

1. **`walkSeconds`, where the router has answered.** A walk inside `WALK_DEFAULT_MAX_SECONDS`
   (**⁦10 minutes⁩**, the owner's own number) is the default; anything longer is not. This is the
   authority because it is the only input that knows about terrain.
2. **The crow distance**, where it has not — still warming, offline, or refused by the gate before
   it was ever asked. `WALK_DEFAULT_MAX_M` drops from ⁦2.5 km⁩ to **⁦700 m⁩**: the same ten minutes
   at §Z2's measured ⁦4.9 km/h⁩ and §Z7's ⁦1.16⁩ road/crow, **rounded down**.
3. **The trip's own `derivedTravelMode`**, where the leg has no measurable distance at all (§AM4's
   inert leg). §Z2's inference keeps exactly this much of its old job.

**The floor errs low on purpose, because the two mistakes are not equally loud.** Guessing
`driving` for a leg somebody would have walked costs one tap and says nothing false meanwhile.
Guessing `walking` for a leg nobody would walk is this report: a ⁦4:18⁩ hike printed as the plan,
with a departure time counted back from it. And where the ratio is unusual — which is the only
place the floor does any work — it is unusual in the direction that makes the crow **understate**
the walk, never overstate it.

**§AU2's rule is otherwise untouched:** the distance still outranks the booking in both directions,
an override still outranks everything, and `TRAVEL_GATE.walking.maxMeters` stays at ⁦15 km⁩ (§Z8: a
group walks a long way **on purpose**). What changes is only which measure of "long".

**A leg may now change its default once, when the estimate lands** — walking while the matrix is
warming, driving once the walk turns out to be four hours. That is a guess corrected by evidence
rather than a value churning, and §AU1's own row says `מחשב מסלול…` while it happens. Holding a
known-wrong guess to avoid the flicker is the defect this closes.

### AV2. The canvas reads the durations too, or it disagrees by construction

The Map builds its own `legModes` (§AM8's call site). Left on the crow floor alone it would ask for
Bjólfur's **pedestrian** geometry while the day list, holding the ⁦4:18⁩ estimate, correctly drew a
drive — §AM8's divergence with a new cause, and the second time counting the call sites is what
found it.

So `Map.tsx` now reads `useDayTravel` as well: the same hook, the same `routeLegKey`, and the same
Dexie table `useDayShapes` beside it already reads, so a day whose numbers the day surface has
fetched answers from cache with no network at all.

### AV3. The default is lazy, and that is observable rather than tidy

`legTravelMode`'s `fallback` now accepts a **thunk**. Since the default reads an estimate,
computing it for a leg somebody has already declared is work whose answer is discarded — and on a
declared תחב״צ leg it is visible: §AM5 guarantees nothing about that leg is ever asked of the
provider, and the board's own spec asserts the estimate is never looked up at all. That spec is
what caught it.

### AV4. What the suite said, and it is the change stating itself

Thirteen specs failed first, and the interesting ones inverted rather than broke:

- The board's `§AQ2` pair encoded the original report — _"the leg is declared a drive and the board
  keeps printing the walk"_ — over a ⁦76⁩-minute walk against a ⁦23⁩-minute drive. **The app now
  derives that drive on its own**, so the derived case asserts the drive and the meaningful
  override is the walk. A declaration is only testable against a mode the derivation would not have
  picked, which is also why `DayView`'s _"declared driving, the surface reads the drive"_ became
  `declared cycling`: it would have passed with no override at all.
- The day surfaces' specs render ⁦15⁩- and ⁦40⁩-minute journeys, both past the threshold. Their
  durations are load-bearing for the gap arithmetic and are unchanged; what moved is the mode word,
  now read through a named `derivedMode()` helper so retuning the threshold is one line rather than
  six expectations.

### AV5. Still open

- **Urban trips**, which the owner named and set aside: _"or an urban trip but that's probably a
  whole epic so don't worry about it."_ It is — a city where the honest default is transit needs
  V2's transit routing before it can mean anything, and guessing `walking` harder is not it.
- **⁦10 minutes⁩ is a feel call and stays on the backlog** with `TRAVEL_BUFFER_SECONDS` and
  `ARRIVAL_RADIUS_MAX_M`. The owner's own _"probably"_ is the reason it is a named constant.

## AW. A ⁦50 m⁩ drive is a journey the ladder cannot name, and the row went with the number (2026-08-31)

> _"Bug found in the transit row (walking, driving, cycling…). The journey from Katla Ice Cave to
> the supermarket was set to walking (1 minute, 50 meters) and I changed it to driving. Then the row
> vanished and could not be returned. That happened before on different causes."_

The owner's last sentence is the finding. **This is the third time the same row has disappeared and
the third distinct cause** — §AM6 (a declaration), §AM10 (a mode past its ceiling), §AU1 (a number
still being computed) — and each was fixed as its own case. So the fix here is not a fourth case.

**The arithmetic.** ⁦50 m⁩ is over `ROUTE_MIN_CROW_M`, so the pair is routed and every mode answers.
On foot that is ~⁦37⁩ seconds, which ADR-0114's minutes rung rounds to ⁦1 דק׳⁩ and the row states. By
car it is ~⁦12⁩ seconds, which rounds to **nought minutes** — and the 2026-08-26 floor ("a journey
the ladder cannot state is not a journey") answers `null` there, so the hole rendered nothing.
The mode control lives on the journey block. Deleting the block deleted the only way back to the
walk, on the surface the drive had just been picked on.

### AW1. The floor is a NOISE rule, and noise is only noise when nobody asked

The floor is right about what it was aimed at. A ⁦20 m⁩ hop the app called a walk **by itself** has
nothing to say: `~0 דק׳` over a block of its own is a row about nothing, and ADR-0114 has no rung
for it. That case is untouched.

What it never distinguished is **who decided**. §AM10 drew this exact line for the ceiling —
_"§D4's 'absent is absent' is right for a mode the app picked and wrong for one a person picked"_ —
and the floor is the same sentence one cause over: a leg somebody **chose** carries a control, and a
control that deletes itself is not a control.

So `dayJourney` gains a fourth arm, `UNTIMED`, and it is keyed on **the choice, not the cause**:

| the leg                             | with no override | with one          |
| ----------------------------------- | ---------------- | ----------------- |
| under the ladder's floor (⁦12⁩ s)   | no block         | `UNTIMED`         |
| no estimate at all, and none coming | no block         | `UNTIMED`         |
| past the mode's ceiling             | `TOO_FAR`        | `TOO_FAR` (§AM10) |
| asked for, not answered yet         | `WARMING`        | `WARMING` (§AU1)  |

**The second row of that table is the reason the rule is stated this way rather than as a
sub-minute exemption.** A chosen mode can also end up with no estimate whatsoever: the SERVER's
gate refuses it for a reason the client cannot reproduce — `sameClusterOnly` against a point missing
from the cluster set, whose own docblock admits _"a point in no cluster at all answers `false`"_ —
or the provider simply answers nothing for that one mode. `refusedFor` sees only the ceiling, and
`warmingFor` goes false the moment the day stops asking, so that leg fell through the same floor and
vanished the same way. It is §AM10's original field report (_"I changed a drive to a walk and the
route simply disappeared"_) with the half nobody had reached. One rule closes both, and the next
member of the class arrives already fixed.

**Ranked last of the four**, below `DECLARED`, `TOO_FAR` and `WARMING`, each of which is a more
specific statement about the same silence. It claims nothing else: no leave-by (a departure counted
back from ⁦12⁩ seconds is the late mark firing over the time it takes to cross a car park — the very
noise the floor exists to stop), and no correction to the hole, so the free-time strip below reads
the whole hole exactly as it did before the pick. The half-minute at stake is invisible once that
strip rounds to minutes.

### AW2. The words are the arm's one branch, and they are chosen from what the app HAS

`UNTIMED` is the only arm whose sentence is not fixed, because two states reach it and they know
different things:

- **Under the floor** → **`פחות מדקה`**. The app measured this leg; what it cannot do is round the
  answer to a rung. Borrowing `noEstimate` would claim we never measured it, and `~0 דק׳` is the
  value the floor was written to refuse. No `~` — §D5's hedge belongs on a number, and `פחות` is
  already the hedge.
- **No estimate at all** → **`בלי הערכת זמן`**, the declaration's own sentence, which is true here
  for a different reason and needs no second wording.

Neutral tone and no `warn` glyph in both: there is nothing wrong with this leg. §AK's mark stays
claimed for "this journey does not fit".

### AW3. `legModeOverride`, because "what mode is it" cannot answer "who said so"

`legTravelMode` puts the derivation behind the override, which is what makes a leg's mode one
answer — and makes a derived drive and a declared drive **identical** at every call site. The new
read needs the other question, so the override lookup is extracted rather than copied:
`legModeOverride` is the loop (newest row wins, canonicalised pair) and `legTravelMode` is now three
lines over it. `DayTravelReads.chosenFor` asks it, and both day surfaces pass the answer through as
`chosen`.

**It is the presence of the ROW, deliberately, and not `modeFor !== defaultModeFor`.** Since §AU2
the default moves with the distance, so an override can come to agree with it — and it is still a
row somebody wrote, still held against a later change, and still only clearable through the control
the block carries.

### AW4. What guards it

- `lib/day-joins.test.ts` — the floor still deletes a hop nobody chose; the same hop renders
  `UNTIMED` once somebody did; the distance survives and the duration does not; the arm yields to
  all three flags above it; the day's header counts its kilometres and none of its minutes.
- `ui/domain/DayJoinRow.test.tsx` — the row says `פחות מדקה`, keeps the distance, offers all four
  chips, and borrows neither of the other two sentences.
- `screens/DayView.travel.test.tsx` and `screens/PlanDay.travel.test.tsx` — **both** surfaces, which
  is `frontend/CLAUDE.md`'s rule and §AM9's own lesson: the block stands with its disclosure once
  the mode is picked, draws nothing where the app picked it, and advises no departure either way.
- `packages/shared/src/routing.test.ts` — `legModeOverride` answers the same row `legTravelMode`
  answers from, and answers `true` for an override that agrees with the default.

### AW5. Still open

- **The distance on a leg that never got an estimate.** `distanceFor` falls back to the crow only
  for a declared or refused leg (§AA4/§AM10), so an `UNTIMED` leg reached by the no-estimate road
  prints its mode and its sentence with no kilometres. Extending the fallback would put crow numbers
  into the day's total for legs that never route, which is a decision about the header and not about
  this row. Backlogged.
