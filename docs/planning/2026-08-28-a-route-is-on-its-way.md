# A route is on its way — 2026-08-28

Session on two field reports off the live app, which turned out to be three faults
composing into one screen. Decisions live in
[ADR-0206 §AU](../decisions/0206-a-travel-time-belongs-between-two-points.md); the drawing is
[`mockups/a-route-is-on-its-way-v1.html`](../../mockups/a-route-is-on-its-way-v1.html). This note
is what happened and what was put to the owner.

## The reports

> _"I've added two stops to my trip, and no route or time estimations. I'm not sure why, maybe
> because the default transportation for this trip is walking (as there's no car rental here). If
> that's the bug then I need you to solve this for me. Speaking of it, I think that the
> transportation mode should be decided based on the distance (walking or driving). Of course you
> should always see it and should be able to switch between modes."_

> _"Of course perhaps the root cause may perhaps be something totally different. Perhaps the reason
> is that the route is not automatically triggered when you add stops - which it should. That's
> actually my biggest suspicion, because I left the app and came back after some time, and then I
> had a route. … When you add stops to the day where there should be a route calculated, first of
> all it should be calculated. Second, there should be some kind of indication that it's being
> calculated (mockup needed?) so that the user knows what's going on. Third, the route row in the
> day view / plan day must show up immediately (as loading if route and time estimates are being
> calculated, still allowing to switch mode)."_

Two screenshots: the Map with a dashed straight line from Tel Aviv to the Galilee and no route
geometry, and a day list whose last two holes draw **nothing at all** between the rows.

## What the investigation actually found

The owner's second guess is the root cause and their first is a real defect standing behind it.
Three faults, and each is survivable alone:

1. **The ask gave up too early.** `useDayTravel` asked once, retried once, then let go — its own
   docblock said _"one wait covers the ordinary cold day"_. The arithmetic says otherwise: a cold
   day is three matrix calls, which `RoutingService.warm` starts behind `PolitenessLimiter`'s
   ⁦1s⁩ gap, against a `Retry-After` that `retryAfterFor` floors at ⁦2s⁩. The single retry lands
   mid-warm by construction. Nothing re-asks after that — which is exactly _"I left the app and
   came back after some time, and then I had a route"_, since a remount is what re-runs the effect.
2. **Nothing said a number was coming.** §D4 makes absence silent, and since M6a the journey row
   **appears** rather than fills in — so a warming leg renders no row, and the mode control is a
   disclosure ON that row. The one leg whose mode you would want to change is the one leg with no
   way to change it. §AM10 had already fixed precisely this for a gate-refused mode; the argument
   was never carried over to the pending case.
3. **The mode was the trip's, so a ⁦127 km⁩ hop was a walk.** §Z2 derives a walking trip from the
   absence of a car hire — correctly, by its own reasoning — and the gate refuses walking past
   ⁦15 km⁩. The leg was unanswerable by construction.

## The one fork put to the owner, and the answer taken from their own words

**Where does the distance rule sit relative to §Z2's booking inference?** Two readings:

- **Distance is a tie-break inside the walkable band**, with the booking still deciding. Keeps §Z2
  intact and fixes the long leg, but leaves a driving trip driving a ⁦300 m⁩ hop.
- **Distance decides, and the booking is the floor under it** — used only where a leg has no
  measurable distance.

Taken: the second, on the owner's own framing (_"the transportation mode should be decided based on
the distance"_). It makes the rule one sentence rather than two, and it is symmetric in a way that
matches how people actually move: a long leg drives on a trip with no car (you take a bus or a
taxi), and a short one walks on a trip with one (you park, then you walk). §Z2's closing line said a
per-leg answer was _"the per-leg override's job"_ — written when the only per-leg input was a
person. **A leg's length is a per-leg input the app has had all along.**

**⁦2.5 km⁩ was derived rather than chosen** (~35 minutes at the measured pace), and it is explicitly
_not_ a change to `TRAVEL_GATE.walking.maxMeters`. Lowering that ceiling was the tempting first fix
and it is backwards: §Z8 raised it to ⁦15 km⁩ on the owner's own instruction because _a group walks a
long way on purpose_. The default and the ceiling answer different questions, and the band between
them is every leg the app guesses `driving` for and a person can still walk in one tap.

## What the drawing settled, and two defects it caught in itself

The owner asked _"mockup needed?"_ — yes, and it earned the step twice over:

- **The block is ⁦40px⁩ computing and ⁦40px⁩ answered**, measured by rendering both variants into an
  off-screen probe in the same tick rather than asserting it. That is the whole claim of the sized
  placeholder, and §AF7's shift is closed for this case.
- **A spinner was refused for the third time in this catalog**, now with §D6 behind it as well as
  `where-a-route-shows-up-v1.html`'s _"on a day with five holes that is the loudest thing on the
  screen"_.
- **The mode chips measured ⁦22.3px⁩** and were about to be written up as an ADR-0017 failure —
  `ui/primitives/toggle-chip.css` was missing from the file's own `APP-CSS:` manifest, so it was
  measuring an unstyled control. With the sheet inlined they are ⁦44×44px⁩ via `min-height`. A
  mockup measuring the wrong CSS reports defects the app does not have.
- **The measurement probe blew the page to ⁦11320px⁩ wide.** Parked at `left:-10000px`, which in an
  RTL document extends the scroll width; every screenshot came out a ribbon. `position: fixed` is
  out of flow and costs nothing.

## The audit that was the deliverable, not the preamble

Root `CLAUDE.md`: _"count the call sites before claiming what a derivation does."_ `legTravelMode`
has **two** consumers — `useDayTravelReads` (which the day list, Plan mode and the board all read
through) and the **Map**, which builds its own `legModes`. Only the first was obvious. Left alone,
the Map would have asked for the ⁦127 km⁩ leg's **pedestrian** geometry: a different road, and past
walking's ceiling, no road at all — §AM8's reported defect from the other side. Both call sites now
take the same pair of derivations in the same order.

The suite agreed the change was real before it agreed it was correct: five Map specs and three
travel specs failed, every one of them asserting the behaviour being replaced. Two are worth
recording, because they are the change stating itself:

- `day-travel.mode.test.ts` expected ⁦4380s⁩ for Senso-ji → Tokyo Station and now gets ⁦900s⁩. The
  test's own comment already read _"73 min against 25 by train"_ — the derivation now makes the
  judgement the spec's author had made in prose.
- `Map.embedded.test.tsx`'s _"a car hire drives, everything else walks"_ failed on the **car** case:
  its fixture stops are ⁦1.2 km⁩ apart, and a car hire no longer drives those. The spec was rewritten
  to assert §AU2 at both ends, and its fixture spacing moved from ⁦0.1°⁩ (⁦14 km⁩ a leg, which the new
  rule correctly calls a drive) to walkable, since every assertion in that block is about which leg
  takes the line and never about how far apart the stops are.

## Left open

Both on the backlog: `WALK_DEFAULT_MAX_M` wants the same device pass as `TRAVEL_BUFFER_SECONDS` and
`ARRIVAL_RADIUS_MAX_M`, and the warming row's copy has not been seen on a real cold day with four
unmeasured holes at once. If that reads as noise, the lever is the copy — the sized slot is what
stops the day shifting and stays either way.
