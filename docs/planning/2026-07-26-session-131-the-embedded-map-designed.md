# Session 131 — the embedded map, designed (Phase 6)

**Date:** 2026-07-26
**Branch:** `claude/places-maps-epic-vde21w`
**ADR:** [0121](../decisions/0121-embedded-map-phase-6-design.md) · Mockup: [`mockups/map-embedded-v1.html`](../../mockups/map-embedded-v1.html)
**Paper only** — no feature code. Annotates ADR-0106 §D/§E, ADR-0108 §4, ADR-0109 §3/§10.

Opened with "I want to continue with the places/maps epic. What now?" The orientation
answer was that Phases 0–5 are all shipped and the epic's only remaining phase is the
embedded map — which is human-gated on a Google Cloud step and, per both ADR-0109 and its
own backlog line, **must not be designed until current Maps API + pricing are
reconfirmed**. So the pick was the reconfirmation-and-design session, which needs no key.

## The reconfirmation, which is why the session exists

The instruction was worth following literally rather than treating as boilerplate: ADR-0109
deferred this design specifically because "pixel-detailing the rendered map before that
confirmation would likely go stale." Checked against Google's live docs and pricing.

**The architecture held** — the JS-API path over the Embed iframe, the split key (the
browser key is unavoidable because the JS API embeds it in the script URL), cloud styling,
`AdvancedMarkerElement`, Dynamic Maps at ~$7/1,000 with 10,000/month free, and the
free-connectors-before-paid-routes sequencing. Nothing in ADR-0106 §A–F or ADR-0108 §1
needed reopening, which is the outcome the deferral was hoping for.

**Two things moved, both small and both consequential:**

1. **A `mapId` is now mandatory, not merely enabling.** ADR-0106 §B treated it as what
   unlocks vector maps and custom markers; advanced markers now simply do not load without
   one. That turns "create a Map ID + cloud style" from a styling nicety into a **new human
   Phase-0 step** the prerequisites checklist did not list. Added there.
2. **Routes Essentials caps at 10 intermediate waypoints.** ADR-0106 §D assumed ~25 and
   ADR-0108 §4 recorded the older Essentials/Advanced/Preferred tier names. Current:
   Essentials / Pro / Enterprise, with the cheap tier limited to 10 intermediate stops — so
   a day of more than 12 stops does not fit it. Nothing shipping in this phase is affected
   (free connectors have no waypoint cap); the paid-Routes follow-up inherits a lower
   ceiling than it thought and must chunk rather than silently escalate tier.

## The decision that actually shapes the build

**Dynamic Maps bills per map instantiation** — every `new google.maps.Map()` is a billable
load. That reframes the cost question from "how many tiles" to "how many times do we
construct a map", and it is the sort of thing a build discovers late and awkwardly.

The temptation was a global map singleton hoisted above the router, so a tab switch reuses
one instance. Rejected on arithmetic: 10,000 free loads/month is ~333/day for the whole
app, and five people opening the tab twenty times each is ~100. We are an order of
magnitude inside the free tier, so the honest decision is **one instance per tab visit,
not optimised further** — and the discipline goes where it matters instead: never
re-instantiate on the view toggle, a filter, a sheet drag, or the tab's per-second clock
tick, and never create a map at all while the user is on the list half. A detached map
holding listeners and a stale camera across a trip switch is a real bug bought with an
imaginary saving.

## Why a dependency, in a four-dep frontend

`@vis.gl/react-google-maps` (1.9.0, MIT, React 19 fine) is the first real UI dependency
added here in a while, so the reasoning is on the record rather than assumed. A hand-roll
is genuinely feasible — the pin markup is static DOM, so the portal problem is avoidable —
and what it saves is a dependency while what it costs is three lifecycle hazards on **the
one surface in the app where a lifecycle mistake is billed**:

- The loader is a singleton problem (`importLibrary`), and two bootstraps conflict.
- React-19 StrictMode double-invoke is the exact bug class **session 130 just paid for** —
  except there the failure was silent, and here it has a billed side effect.
- `screens/Map.tsx` calls `useClock()` and **re-renders every second**. A map that re-reads
  layout or rebuilds markers on render does it sixty times a minute.

It also dissolves a repo-specific tension rather than fighting it: React content in a
marker needs `createPortal`, which is **lint-blocked** here because a bespoke portal
escapes the back stack (ADR-0090). vis.gl does that portal internally, so we neither
hand-roll an overlay nor add a file to the allowlist for something that is not an overlay.

## Four calls the ADR makes that ADR-0109 §10 left open

- **The sheet is view state, not a back layer.** It renders inline, the map behind it stays
  live, nothing dismisses it — so no `Modal`/`useOverlay` and no back registration, and back
  leaves the tab at any height. Same reading session 105 applied to the geolocation
  pre-prompt. Registering it would make back mean "shrink the list" on exactly one tab.
- **The sheet always peeks.** Not decoration: the list is the only view that works offline
  and the only one that can hold a **coordless** place. Which also retires ADR-0109 §3's
  "hollow dashed ring" coordless pin as unbuildable — a place with no coordinates has no
  position to pin, and the list badge already covers that state.
- **Marker content is our DOM, not `PinElement`.** Google's pin gives
  background/border/glyph — enough for a solid category teardrop, not enough for
  dashed-idea or desaturated-ambient. Half the commitment grammar is not a grammar, and
  our own content is what makes the list badge and the map teardrop read the same
  `--cat-*` tokens by construction rather than by discipline.
- **The connector is dashed, neutral, and day-scope only.** A straight segment drawn solid
  would claim to be the route you will walk; dashed says "this is the order". Restricting
  it to one day removes the per-day colour palette ADR-0106 §E asked for **entirely** — one
  day, one path — which also means the tab's existing scope chip _is_ that ADR's "day
  toggle". And keeping it off the budget leaves **solid + amber** unspent, so a real Routes
  polyline later reads as different in kind, not better in colour.

Plus the camera as the map's version of ADR-0120: every control that changes the pin set
moves the camera (animated fit to the filtered bounds), because a chip that silently leaves
half its results off-canvas is the map's exact analogue of the jump session 130 removed
from the list — while a **manual pan wins until the next scope change**, since re-centring
under someone's fingers on the next tick is a list that re-sorts while you read it.

## Two long-standing threads close

The `TODO(phase-3)` seam on `mapsPlaceUrl` finally has an in-app target: `מפה` (view)
becomes the row↔pin selection on the tab and a focused route-in from
`EventCard`/`BookingDetail`, while `ניווט` stays a Google deep-link forever (ADR-0106 §F).
And ADR-0109 §6's single amber next-stop ring moves onto the pin exactly as the session-104
amendment promised it would — "Phase 6 needs no rework" turned out to be true.

## Deliberately not decided

Paid Routes / live ETAs stay sequenced after (a second cost envelope, a second proxy route,
and now a waypoint ceiling — bundling them would make this phase's approval a cost decision
instead of a rendering one), and they get their own backlog line and ADR. No area chip
(pan/zoom **is** the area filter, ADR-0106 §4). No clustering — the ceiling is named, not
engineered around. And the night map style is minted and read from `data-theme` but **not**
claimed as tested, because dark mode is inert across the whole app and a swap nobody can
see is not a shipped feature.

## Status

Design complete, build not started, and the build is **viewable** only after the human
gate: enable Maps JS, create a Map ID + cloud style (the new step), mint
`VITE_GOOGLE_MAPS_BROWSER_KEY`, set the Dynamic Maps quota cap. `DEMO_MAP_ID` covers local
development and is not a substitute. Everything before that — the shell, the derivation
wiring, the pin markup, the camera rules — is writable and unit-testable today.

## Two gaps found reviewing the mockup (same session, ADR-0121 amendment)

**A line cannot show order.** §7 sold the connector as showing "the day's shape and
order"; it shows the first and not the second, because a dashed segment between two stops
is symmetric. Arrowheads are mush at phone size, a clock on every pin blows §6's
one-amber-anchor rule, and a colour or size ramp is already spoken for by category. The
answer is **numbered pins**, and the number is free: it is the index in
`comparePlacesBySchedule`'s day sequence — the same start-then-`sortOrder` order `DayView`
renders — so the map becomes a third rendering of one derivation rather than a second
opinion. Two things fall out of "the number is a position in the schedule": an idea and an
ambient stay night get **no** number (nothing scheduled them), so numbered-vs-unnumbered
is itself the plan/idea line; and the 🔒 comes off the pin, because solid-vs-dashed already
carries commitment and the number needs that corner.

That leaves the line with one job — the zigzag that says "you cross town twice" — which is
a **planning** question, so the connector is now Plan mode only. Trip mode's canvas gets
quieter, which is right on the surface whose question is "what now".

**A map has no blocks.** The list separates past/upcoming/idea by partitioning into
`מה שלפנינו` / `ללא יום` / `מה שמאחורינו` with outcome tags; a map puts every pin on one
plane, so the distinction has to live on the pin. And a map surfaces a population the list
never had to: **a place that fails the day filter but is inside the viewport.** Filtered-out
is fine in a list; on a map, hiding the café you are standing next to because it is
pencilled for Thursday is exactly the question the tab exists for. So it renders as a
hollow, glyph-less, unnumbered **ghost** — present because it is physically there,
subordinate because it is not today's plan — in day scope only, which is the only scope
that excludes anything. It has to be tappable, because its row is not in the sheet.

The whole four-tier ladder is **prominence and fill, with no new colour**: category keeps
the hue, amber keeps time, teal keeps location affordances, so ADR-0028's budget is
untouched.

**Verified** on the isolated copy across all six states: numbers only where there is a
position, ghosts only in day scope, the connector only in Plan, the amber ring and its tag
only in Trip, no lock left on any pin. Two bugs of my own on the way — a class toggle that
queried by the class it was removing (so it could never restore it), and a next-stop tag
that survived un-scoping because losing its rule only cost it styling, not its text.

## And the row tap stops leaving the app (ADR-0121 amendment C)

Owner call, straight after: "clicking on a place doesn't automatically open maps (for that we
need a button), instead it opens and focuses on the in-app map."

This is the Phase-2 interim ending exactly where ADR-0109's 2026-07-24 amendment said it
would — that tap opened Google's place view "**because we have no map surface yet**", and
Phase 6 is when that stops being true. So the tap focuses our pin, and leaving is a button:
`נווט` (directions), which already is one and stays Google forever (ADR-0106 §F).

**"View on Google Maps" is retired from the row rather than relocated.** With our own map
on screen, a second Google destination competes with the thing it was standing in for. It
survives only in ADR-0115's research results, where a prediction carries no coordinates and
there is genuinely nothing of ours to focus — so `mapsPlaceUrl` keeps a narrowed job and
loses its `TODO(phase-3)`.

Three rules make the focus usable, and all three fall out of the three-height sheet, which
is the first real payoff of having made the toggle and the handle one state:

1. **A row tap while the list is at full height drops the sheet to half** — focusing a map
   you cannot see is useless.
2. **A coordless row is not focusable**: no pin, nothing to focus. Same reasoning as "the
   sheet always peeks".
3. **Offline the tap does nothing** and the row keeps `נווט`. The map is absent and nothing
   pretends otherwise.

The mockup demonstrates all of it, and fixing the fixture to make the numbers believable
forced the day to become internally coherent: one day, `1` visited → `2` skipped → `3` the
next stop → `4` dinner, with the hotel as the unnumbered ambient base and the café as the
unnumbered idea. The connector also became a **real polyline** through those stops in order
rather than two rotated divs — rotated divs cannot follow a sequence, and a polyline is what
the JS API actually draws. It needs no arrowheads, because the numbers are the order.

## A place has to lead somewhere (ADR-0121 amendment D)

Owner call: "clicking on a place should have a way to link and go to the related event or
booking to get more info."

Right, and the map would otherwise dead-end on the least informative record in the chain: a
`Place` holds name, address, coordinates, timezone, rating — while the confirmation code,
the notes, the documents and the real times all live on the **reference**, which is also the
only reason the place is in the trip at all (ADR-0112). **The pointer already existed:**
`DayUsage.eventId` + `edge`, added in session 108 so the row could say _what happens here_.
The link target is that same pointer.

The affordance is revealed by **selection** rather than added to every row — the row is
already badge · name · meta · distance · `נווט`, and only one row is selected at a time, so
it costs nothing until wanted. Its label is the reference's own words
(`הזמנה · רכבת לקיוטו · יציאה`) rather than a generic "details", which is what earns it a
row; full-width and ≥40px, which is exactly why the meta line's own text is _not_ the link.
One entry per in-scope reference, because union semantics already made multiple references
normal and a station really can be one leg's origin and another's destination.

**It also fixed a hole in amendment C.** "Tap = focus" would have forced the coordless
Place-lite to be untappable — stranding the one row whose place data is weakest from the
event that explains it. So the verb is **select**, and focusing is what selection does when
there are coordinates: a coordless row selects, shows its reference, moves no camera, keeps
`＋ מיקום`.

Bugs of my own worth naming, both from patching markup with string search: the rows and the
pins share `data-place`, and the pins come first in the document, so the first insertion
attempt put every reference block inside a **pin**; the recovery then matched
`class="map-list"` in the **stylesheet** and dropped three more into the view toggle. Fixed
by walking lines and indentation instead of searching text, with an assertion that every
block's parent is a `.place` row.

## Scope decision on the review's forks (ADR-0121 amendment E)

Owner call: **take the outcome facet and the places-in-view count into Phase 6; drop transit
for now.** Each needed a design call before it was scope rather than an idea.

**The outcome filter is one toggle, not three chips.** ADR-0117 has three outcome states, but
the list already answers "where have we been" — it labels the `מה שמאחורינו` block and tags
each row — and a third multi-value facet would multiply exactly the count-coupling surface
ADR-0119 was written to repair. The question on the ground is "what's left", so it is a
single `מה נשאר` toggle in the `אולי` chip's idiom, over the `settled` field ADR-0117 already
stores, applying to ghost pins too, and gated on the trip having something settled (the
`hasMaybes` pattern already in `Map.tsx`). On a map this is the payoff a list cannot give:
with the settled pins gone the remaining cluster is legible.

**Drawing it caught the trap immediately.** I labelled the chip `4` — the count of scheduled
unsettled places — when `5` rows actually survive the filter, the coordless row included.
That is precisely the count-vs-render defect ADR-0119 exists to fix, reproduced within
minutes of adding a third axis. So the ADR now states the requirement rather than implying
it: the toggle must **join** ADR-0119's coupling, and its count is surviving list rows given
the picked type and `אולי` state.

**The `באזור` count and the chip count are different questions.** A chip counts what the
**list** renders; `באזור` counts what is on the **canvas** — ghosts included, coordless
excluded, since it has no pin. Six on the canvas beside five in the chip is correct, and the
wording is what carries the distinction. The readout updates on the map's `idle` event, never
per pan frame, and says `אין מקומות באזור` at zero rather than leaving an empty canvas
unexplained. The **list deliberately does not follow the camera**: that would be the true
area filter, and a list reshuffling under your thumb is the same defect as a camera
re-centring under your fingers, which §6 already refuses.

**Transit dropped, with the reason recorded so "it's free" cannot reopen it.**
`TransitLayer` draws the transit **network**, not directions — it cannot show A to B at all.
Point-to-point transit is the free Maps deep-link (which leaves the app) or the paid Routes
API. It is the only ride-along answering no question the tab asks, and the one that fights
"quiet base, loud pins" hardest. Free to draw is not free to read.

## The camera, questioned and made concrete (ADR-0121 amendment F)

Three owner questions — does the map know how much to zoom for the number of pins, do we
cluster dense pins, does a filter reframe — and two of them found holes.

**Zoom follows extent, not count**, which is why "how many pins" is the wrong question:
three pins on one block and three across a country want completely different zoom.
`fitBounds` is the right primitive, but it has three degenerate shapes the plan had left
implied, each with a concrete wrong behaviour. A **single pin** is the sharp one — zero-area
bounds make `fitBounds` snap to building level, so a single pin is _centred_ at a fixed
neighbourhood zoom and never fitted. One `maxZoom` cap covers near-coincident sets as the
same case rather than a second special case. And the fit must inset by the visible area
**plus a pin's own height**, because the teardrop's tip is the anchor and its body sits above
the coordinate — without that the topmost pin of a fitted set draws half off-canvas, which is
the exact failure the fit exists to prevent.

**The clustering answer needed its reason replaced.** §5 declined it because "a trip holds
tens of places, not thousands" — which conflates total count with on-screen **density**, the
same mistake R7 caught for coincident pins and only half-fixed. Eight places in one district
are unreadable at city zoom whatever the total is. What actually saves us is the **default
scope**: Trip mode opens on today, three to six stops. Density bites in Plan/all-days.

So: a **zoom-tiered pin** — below a legibility threshold it degrades to a dot, hue kept,
number and glyph dropped, since a 9px numeral is noise rather than information. Nothing
hidden, nothing invented, no dependency. Clustering stays out on a better reason than the old
one: a cluster bubble **cannot carry the pin grammar** — it spans categories so it can take no
hue, spans tiers so it can be neither solid nor dashed, and has no position in the day so it
can take no number. It would be the only object on the canvas outside the system. The
tap-to-zoom interaction is genuinely good; the bubble is the cost. Recorded with a revisit
trigger rather than as a permanent no.

**A filter does reframe — but only when it owes you something.** Re-fit only when the new set
does not already fit the current view: the promise is that a chip never leaves results
off-canvas, and if they are all on screen, moving is gratuitous. And **focus pans without
zooming**, which amendment C had left vague as "moves the camera" — zooming on selection
throws away the context you were reading. Same instinct as §6's "a manual pan wins": the
camera moves when it owes you something, not whenever state changed.
