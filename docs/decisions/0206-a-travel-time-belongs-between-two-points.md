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

**D9. Absent, not disabled.** v1 has no transit, so the mode control has **no transit entry** —
not a greyed one. ADR-0160 §H's own words: announcing a control and then doing nothing when it is
activated is the failure. A promise we cannot keep is worse than a silence.

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
