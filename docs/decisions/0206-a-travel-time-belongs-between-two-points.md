# 0206 — A travel time belongs **between** two points, and the day owes you the truth about it

**Status:** Proposed. **Nothing here is built, and nothing here ships without a mockup** (§M).
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

| #       | feature                                                    | why it ranks here                                                                                                                                                                                       | where                                  |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **1.1** | **Gap minus travel** — `פנוי · 2:00 שע׳ · אחרי 40 דק׳ דרך` | **A correction, not a feature.** The app currently overstates free time. Nothing else on this list is a bug fix.                                                                                        | `DayJoinRow`, ADR-0159's slot          |
| **1.2** | **Time-to-next + leave-by** — `~23 דק׳ · צאו ב־18:37`      | The U-06 payoff and the sentence the backlog has carried since ADR-0106. Answers the third of the app's three questions.                                                                                | hero horizon, between two points (D2)  |
| **1.3** | **Per-leg travel in the day**                              | Makes 1.1 legible: the day reads as _place · journey · place_ rather than as holes.                                                                                                                     | `DayJoinRow`                           |
| **1.4** | **Late-risk mark**                                         | A leave-by already past is the single most actionable thing this data can say. Costs one derivation on top of 1.2.                                                                                      | wherever 1.2/1.3 render, `--miss` (D7) |
| **1.5** | **The real polyline**                                      | The visualisation the owner asked for. Cheap — `DayConnector` already draws a line.                                                                                                                     | `MapPane`, solid + amber (D1, D8)      |
| **1.6** | **Mode per leg + trip default**                            | A car trip in Iceland and a metro trip in Tokyo want different defaults, and every number above is wrong under the wrong mode.                                                                          | leg-level, defaulted by trip           |
| **1.7** | **Plan-mode day feasibility** — "this day does not fit"    | Plan mode's whole job is building a day that works, and it currently builds days that cannot be walked. Same matrix, no new fetch.                                                                      | `PlanDay`                              |
| **1.8** | **Offline route pack**                                     | Our stops are known in advance, so routes are precomputable at ~410 bytes each and ride ADR-0186 §5/§6's existing download, budget and eviction machinery. **This is what makes it work on the plane.** | `MapService` extract pipeline          |
| **1.9** | **Day travel total** — `3.2 ק״מ · 48 דק׳ הליכה`            | One line, free from data 1.3 already fetched, and it is the day-shape read a planner actually wants.                                                                                                    | day header or Plan summary             |

**1.1 through 1.5 are the product.** 1.6–1.9 are what make it not feel like a demo, and each is
cheap **only because** the ones before it exist. That ordering is the milestone board's, too.

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
