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
