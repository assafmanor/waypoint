# 0121 — Phase-6 embedded map: the reconfirmed API surface, `@vis.gl/react-google-maps`, the map↔list shell, and one map load per visit

**Status:** Accepted (design + the FE/BE shape for Phase 6; no feature code — this is the frame the build fills in)
**Date:** 2026-07-26
**Implements** [0106](0106-maps-and-places-epic-scope-and-phasing.md) **Phase 6** (its §A–F direction is honoured, two points refined below) and the design ADR-0109 explicitly deferred to this session ("the _fully-rendered_ Phase 6 map — to its own build session … re-confirming current Maps/Places API + pricing first").
**Refines:** [0109](0109-map-tab-design.md) (§3's pin grammar gets its map form; §10's map↔list vision becomes a concrete shell; §6's amber next-stop ring finally lands on a pin), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) (§4's Phase-6 cost envelope, now costed against live 2026 SKUs — with one correction to its Routes tier table), [0106](0106-maps-and-places-epic-scope-and-phasing.md) §A/§D/§E, [0120](0120-filter-reveal-is-shared-infrastructure.md) (the map's answer to "every list change moves"), [0090](0090-back-is-computed-from-nav-state.md)/[0103](0103-back-navigation-typed-layer-model.md) (why the list sheet is _not_ a back layer), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget on a rendered canvas), [0096](0096-per-domain-claude-md-guides.md) (reuse before adding — the derivation, the pin palette, and the filter layer are all already built)

Mockup: [`mockups/map-embedded-v1.html`](../../mockups/map-embedded-v1.html) — the split shell at three sheet heights, the `רשימה / מפה` toggle, the pin grammar on a faked quiet base, the dashed day connector, the amber next-stop ring, and the offline (map-absent) state.

**It renders through the app's real CSS, and it is self-contained.** The shipped stylesheets are **inlined** in the app's own import order (`styles/tokens.css` → `App.css` → `screens.css` → `ui/domain/day-strip.css` → the two primitive sheets → `screens/map.css`) by `mockups/tools/inline-app-css.mjs`, which reads an `APP-CSS:` manifest comment in the file and rewrites its generated block in place (idempotent, re-run after any CSS change). Linking them relatively was the first attempt and was wrong in the hand: a phone opening the file through a share sheet or a `content://` provider cannot resolve `../frontend/src/…`, so the mockup arrived unstyled — and a design reference that only styles itself on the author's machine is not one. Copying **mechanically** from source keeps both properties: the CSS is genuinely the app's (any app change shows up in `git diff`), and the file opens anywhere. The file is in `.prettierignore` because formatting the generated block would reflow it and fight the generator on every run. The tab itself is built from the real class names and the real markup — `.header.mode-chrome`, `.wp-daystrip`/`.wp-daypill`, `.map-screen`, `.map-filter-row` with `.choice-grid.pills`, `.map-sortstrip`/`.map-scopechip`/`.map-nearchip`, `.map-grouphead`, `screens/Map.tsx`'s `PlaceRow` verbatim, `.fb-banner`. So the type/space/radius/colour is the token layer (ADR-0082), not a copy of it, and the only new CSS in the file is the Phase-6 delta this ADR proposes, written in the app's own `map-*` naming so it reads as the diff that lands in `screens/map.css`. This follows `loading-states-v1.html` (ADR-0105), which rendered its skeletons through the real classes rather than a parallel copy (ADR-0096 / rule 8).

Working against the real sheets caught two things a hand-drawn copy had hidden, both now corrected in the delta: **the shipped `.map-tag.next` is `--amber-deep` bold text, not a filled amber pill**, and `.place.nextstop`'s ring is a 34%-alpha amber edge over a 22% glow — so the pin's tag and ring reuse those values rather than inventing a second amber (§5's "one cue, two form factors" is only true if it is literally the same cue). Amber therefore stays ink on the canvas, never a ground (ADR-0028/0105). The one place the pin deliberately departs from the row: its **edge is solid** where the row's is 34%, because a 34% amber hairline holds up on a white card and disappears over a map base; the **22% glow is verbatim**.

## Amendment (2026-07-26, same session) — the order is on the pins, and a pin says which population it belongs to

Two gaps found on review of the mockup, both real.

### A. A line does not show order — so the number does, and the line loses most of its job

§7 justified the connector as showing "the day's shape and **order**". It shows the first and not the second: a dashed segment between two stops is symmetric, so nothing on the canvas said which end you reach first. The options were weighed rather than patched:

| Option                                | Verdict                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Numbered pins**                     | **Chosen.** The itinerary-map convention (Wanderlog, Google saved lists), and the number is _free_ — see below.                                                                                |
| Arrowheads / chevrons on the line     | Rejected: at phone size on a 2.5px dashed line they are mush, and they only work where segments are long enough to carry one.                                                                  |
| Time labels on the pins               | Rejected on the colour budget: a time is amber (ADR-0028), and §6 allows **one** amber time-anchor on the canvas. A clock on every pin blows it.                                               |
| Colour or size graded along the day   | Rejected: colour is spent on category (ADR-0038 §2), and a size ramp is unreadable at 25px.                                                                                                    |
| Animated "marching ants"              | Rejected: decorative motion, and it fights `prefers-reduced-motion`.                                                                                                                           |
| Nothing spatial — the list owns order | Considered seriously (the Day view _is_ the order surface, and the map's unique contribution is position). Rejected because the sheet is often at peek height, where the list is not readable. |

**The number is free, and that is what makes it the right answer.** `comparePlacesBySchedule` already computes a day's chronological sequence — start instant, then `sortOrder`, untimed after the clocked ones, exactly as `DayView` renders it (ADR-0109 session-106). The pin's number is the **index in that sequence**, so the map and the list cannot disagree about what comes first any more than the list and the timeline can. One derivation, a third rendering of it.

Three specifics fall out of "the number is a position in the day's schedule":

- **A pin with no position gets no number** — an unconsumed idea (nothing scheduled it), and a strictly-middle ambient stay night (ADR-0054 puts ambient spans off the day schedule). So **numbered vs. unnumbered is itself the plan/idea distinction**, doing work the dashed border was carrying alone.
- **The number is chronological, not the list's row order.** A visited stop keeps its `1` even though the ahead/behind partition (§B) sinks it — the partition changes prominence, never the number.
- **The 🔒 comes off the pin.** ADR-0109 §3 gave a hard commitment a lock micro-cue _and_ a solid fill; the number needs that corner, and solid-vs-dashed already says committed-vs-idea. The lock was belt-and-braces inherited from the row, which keeps it (a row has width for both).

**What is left for the line, and where it stays.** With order on the pins, the connector's only remaining job is revealing a day's **shape** — the zigzag that says "you cross town twice, reorder this". That is a _planning_ question, not a live one: in Trip mode you are living the day and need "where is next", not a critique of your routing. So **the connector is Plan mode only**, still day-scoped, still dashed and neutral for the reason §7 gives (a straight segment is not the path you will walk). Trip mode's canvas loses it and gets quieter, which is the right trade on the surface whose job is "what now".

_This revises §7's "ships in both modes" and ADR-0106 §D's reading of connectors as the order cue; §7's dashed-and-neutral rule and the reservation of solid+amber for a real Routes polyline are unchanged._

### C. The row tap focuses our map — going to Google is a button

The Phase-3 row tap opens **Google's place view** (`mapsPlaceUrl`, `screens/Map.tsx`'s `onClick={view}`). That was always the stopgap ADR-0109's 2026-07-24 amendment said it was: "it deep-links to the Google Maps place view **because we have no map surface yet**." Phase 6 is when that stops being true, so the interim ends.

**Decision: tapping a place never leaves the app. Leaving is an explicit button.**

- **Row tap = focus.** It selects the row and its pin — one selection, §6 — and moves the camera to that pin. No new window, no hand-off.
- **`נווט` stays the row's one Google button** (directions — the on-the-ground verb, a deep-link forever per ADR-0106 §F). It already _is_ a button, which is what the rule asks for; `stopPropagation` keeps it from also focusing.
- **"View on Google Maps" is retired from the Map-tab row, not relocated.** With our own map on screen, a second Google destination is a control competing with the thing it was standing in for. It survives only where there is genuinely nothing of ours to focus: **ADR-0115's research results**, where a prediction has no coordinates and the free `place_id` link is how you vet a place before we pay to resolve it. `mapsPlaceUrl` therefore stays in `lib/places.ts` with a narrowed job, and its `TODO(phase-3)` tag comes off.
- **The same swap on the other surfaces.** `EventCard` and `BookingDetail` keep their labelled `ניווט · מפה` pair (they have no tap-to-view — ADR-0109 2026-07-24), but `מפה` now routes to the Map tab focused on that place instead of opening Google. Two buttons, one of which finally points inward.

Three rules the focus needs to be usable, all of which fall out of the three-height sheet (§4):

1. **Focusing a map you cannot see is useless**, so a row tap while the sheet is at **full** height drops it to **half**. This is the interaction the height axis exists for, and it is why the toggle and the handle had to be one state.
2. **A coordless row is not focusable at all** — there is no pin, so there is nothing to focus. It keeps `＋ מיקום` and no tap affordance, which is the same reasoning that makes the sheet always peek (§5).
3. **Offline there is no map**, so the tap does nothing and the row keeps `נווט` (the OS handles the deep-link). Consistent with §8: the map is absent, and nothing pretends otherwise.

_This revises ADR-0109 §1's "viewing the place is the row tap (opens the place detail / Google Maps place)" — the tap survives, its destination becomes ours._

### B. Four populations, one prominence ladder — including the one the list never had to name

The list answers "past vs. upcoming vs. idea" by **partitioning into blocks** (`מה שלפנינו` / `ללא יום` / `מה שמאחורינו`) with outcome tags on the row (ADR-0117/0109 session-127). A map has no blocks: every pin sits in one plane, so the distinction has to live on the pin itself.

And a map surfaces a population the list never had to: **a place that fails the day filter but is inside the viewport.** On a list, filtered-out is simply gone, which is fine. On a map it is a real loss — hiding the café you are standing next to because it is pencilled for Thursday is exactly the "what's near me right now" question the tab exists to answer (vision pillar 3). So there are four, and they need one legible ladder.

**The ladder is prominence and fill, with no new colour** — category keeps the hue (ADR-0038 §2), amber keeps time, teal keeps location affordances, so ADR-0028's budget is untouched:

| Population                                | Pin                                                                                 | Why that treatment                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **The next stop** (Trip, exactly one)     | Full category pin + the single amber ring + number                                  | §6's one time-anchor, unchanged                                                    |
| **Upcoming today**                        | Full category pin, solid, **numbered**                                              | The plan: it has a place in the sequence                                           |
| **Idea / maybe**                          | Dashed, lightened, **unnumbered**                                                   | The soft grammar (ADR-0011), and nothing scheduled it                              |
| **Behind you** (visited / done / skipped) | Desaturated + reduced opacity, **keeps its number**                                 | Mirrors `.place`'s quiet treatment (ADR-0117); the number is still true            |
| **Not in this day, but in view**          | **A hollow "ghost": category-hued outline, no fill, no glyph, smaller, unnumbered** | Present because it is physically there; subordinate because it is not today's plan |

Four properties of the ghost tier worth pinning down:

1. **Ghosts exist only in day scope**, which is the only scope that excludes anything — the same condition the connector already carries. In all-days scope nothing is out of scope, so there are no ghosts, and the canvas has one less tier to read.
2. **It covers "another day" _and_ "no day at all"** — the `ללא יום` block's dateless ideas and unlinked bookings are out of scope under a day filter exactly as Thursday's café is.
3. **A ghost is tappable, and that is not optional**, because its row is _not_ in the sheet (the sheet is scoped). Tapping one surfaces that single row in the sheet, labelled with the day it belongs to via `relativeDayLabel` (ADR-0085) — the same composition the all-days list already uses for exactly this "when is this, then?" question (ADR-0109 session-109). Reusing the row rather than designing a Google-style info window keeps one way of stating a place.
4. **It never competes with near-me.** Distances and the sort stay the near-me chip's job; a ghost is a position, not a recommendation.

_Open, deliberately: whether a ghost should also appear when it is **near you** but outside the viewport's obvious reading — i.e. whether proximity ever promotes a ghost to a full pin. Left alone until the rendered map exists to judge it on, because it is a relevance question, not a rendering one._

### D. A place needs a way through to the thing that put it there

A `Place` holds a name, an address, coordinates, a timezone and a rating. **Everything a traveller actually wants is on the reference** — the confirmation code, the notes, the linked documents, the hotel WiFi, the real times. And a place is only in the trip _because_ something references it ([ADR-0112](0112-place-in-trip-is-referenced-not-cached.md)). So the map has to offer a way through to that event/booking/idea, or it dead-ends on the least informative record in the chain.

**The pointer already exists.** `DayUsage` gained `eventId` + `edge` in session 108 precisely so the row could say _what happens here_ — "the derivation only **points** at the reference owning the day's moment (following whichever won `at` on a merge)". That pointer is the link target; no new derivation.

**Decision: the tap _selects_; selection reveals the way in.** Not a control on every row — the row is already badge · name · meta · distance · `נווט`, and ADR-0109 §1's test is that every element earns its place. Since only one row is ever selected, the affordance costs nothing until it is wanted:

- **The label is the reference's own words, not "details"** — `הזמנה · רכבת לקיוטו · יציאה`, reusing the meta line's existing vocabulary (`eventEdgeTransition`, `shortTitleText`). A control that names its destination is worth more than a generic one, and it is why this earns a row of its own.
- **One entry per in-scope reference.** Usually that is one. A station that is both one leg's origin and another's destination genuinely has two, and a hotel's edge day has its booking; the moment's owner leads. Union semantics (ADR-0109 §4) already made "a place has several references" the normal case — this is the first surface that lets you act on it.
- **Full-width, ≥40px** — a real touch target (ADR-0017), which is exactly why the meta line's own text is _not_ the link: an 11.5px tag is not a phone affordance.
- **Targets:** a **booking** → `BookingDetail` (the app's booking detail, ADR-0053, a `Modal` sheet so back closes it); an **event** → the Day view for its date, focused on that event; an **idea** → the shelf. Three destinations, one verb.

**Which clarifies §C: the verb is _select_, and focusing is what selection does when there are coordinates.** That is not a quibble — it fixes a real hole. A **coordless Place-lite is still referenced**, so it still needs its way in; only the camera half is missing. Under "tap = focus" it would have had to be untappable, stranding the one row whose place-data is _weakest_ from the event that explains it. So a coordless row selects, reveals its reference, moves no camera, and keeps `＋ מיקום`.

**Open, deliberately:** whether a **pin** tap should reveal the same entries on the canvas (an info window) or only via its row in the sheet. The sheet answer needs no new surface and is what §C already does; an info window is the map idiom but a second way of stating a place. Left until the rendered map exists to judge on — the same reasoning as the ghost-promotion question in §B.

## Amendment (2026-07-26, same session) — review pass across product / design / FE / BE

A deliberate review of the whole phase before any code, checked against the tree rather than recalled. It found one structural gap that would have stopped the build on day one, a ToS violation, two missing pieces of configuration, and a numbering trap. Recorded with decisions; the genuine product forks are left open at the end.

### R1 — BLOCKING: the Map tab has no layout to hang a split on

`.map-screen` (`screens/map.css:6`) sets **only** `--idx-accent`/`--idx-accent-text`. Every screen renders inside `AppShell`'s `<main className="body">`, and `.body` (`App.css:46`) is `flex: 1; overflow-y: auto; padding: 16px 16px 92px`. So the Map tab is a **normally-scrolling page inside the shell's scroll container** — there is no fixed-height flex column, and §4's `.map-split { flex: 1; min-height: 0 }` plus an absolutely-positioned sheet assume one.

Worth naming how this slipped: **the mockup supplied the missing context itself** (`.mk-phone .map-screen { flex: 1; display: flex; flex-direction: column }`), so the design looked correct precisely because the mockup papered over the app's real structure. A mockup that reads the app's CSS still does not inherit the app's _layout tree_.

**Decision: the Map tab opts out of the scrolling body, via the shell rather than a hack.** `AppShell` gains a body modifier (a `fullBleed`/`bodyClassName` prop feeding `.body.is-fullbleed { overflow: hidden; padding: 0 }`) — the layout layer is where this belongs (ADR-0078), it is one contained addition, and any future full-bleed surface reuses it. Consequences the build must handle:

- The filter row + sort strip become the split's **fixed header**, not scrolling content; only the sheet's list scrolls.
- The sheet's bottom must clear the tab bar and the safe area (`.nav` + `--safe-bottom`, both already tokens) — the 92px of body padding that used to do that is gone.
- `<main>` is keyed by tab (`bodyKey`), so **the Map screen unmounts on every tab change.** That independently confirms §3: one map instance per tab visit is not a choice we are making, it is what the shell does, and hoisting a singleton would mean fighting it.

### R2 — ToS: a peeking sheet over a full-bleed map hides Google's attribution

The Maps JS API renders the Google logo and attribution at the **bottom-left of the map div**, and Google's terms require they not be obscured (ADR-0106 §B already committed us to keeping them). §4's map pane is `inset: 0` — full-bleed behind a sheet that always covers the bottom. So the shipped design would have hidden the one element we are contractually obliged to show.

**Decision: the map div is sized to the _visible_ area, not full-bleed behind the sheet.** Two things fall out, both improvements:

- **Attribution sits just above the sheet**, visible at every snap height.
- **Fit-to-bounds becomes honest.** §6 says the camera fits the filtered set; fitting it to a div half-hidden behind the sheet centres pins under the list. The mockup's own comment hand-waved this ("a real camera fits the filtered bounds to the _visible_ map area — which is the same constraint expressed properly"); sizing the div _is_ the proper expression.
- **Cost:** resizing the div triggers a map relayout, so it resizes **on snap, not per drag frame** — the drag animates the sheet, and the map takes one resize when the height settles.

### R3 — the mandatory `mapId` has no configured home

§1 made a `mapId` mandatory and added the human step to create one, but **no env var was ever named for it.** ADR-0108 §1/§Consequences name only `VITE_GOOGLE_MAPS_BROWSER_KEY`. A Map ID is a second build-time value (and §9's night style is a third).

**Decision:** `VITE_GOOGLE_MAPS_MAP_ID` (+ `VITE_GOOGLE_MAPS_MAP_ID_DARK`, unused until dark mode ships), read the way the frontend already reads build vars (`import.meta.env`, as `lib/api.ts:55` does for `VITE_API_BASE_URL`); `.env.example` gains commented placeholders beside the existing server-key note; `deployment.md` gains them as build vars. **And a missing key or map id degrades to list-only** — the same "absent, not disabled" rule as offline (§8), so a checkout without Google setup renders the tab it renders today instead of crashing. `DEMO_MAP_ID` covers local development.

### R4 — the sheet transition and the camera ignore `prefers-reduced-motion`

Every motion pass in this repo respects it (ADR-0098 §4, ADR-0120). §4's `transition: height` and §6's animated camera fit are both new motion and neither was gated. **Decision:** both honour `prefers-reduced-motion` — the sheet snaps, and the camera jumps to the new bounds rather than easing. The camera still _moves_ (that is §6's whole point); only the easing is dropped.

### R5 — numbering must come from the schedule, not from the visible list

Amendment A's number is "the index in `comparePlacesBySchedule`'s day sequence". Two traps the implementation must avoid, because either would make the pin lie:

- **A filter must not renumber.** If the number were the index in the _visible_ set, filtering to `אוכל` would relabel dinner as `1`. The number claims a position in the **day**, so it is computed over the day's whole scheduled set. The existing architecture already makes this the easy path: `listRows` sorts **all** usages and applies visibility as a _predicate_ (session 130's reveal model), so the full ordering is already in hand. **Gaps are correct and informative** — seeing `1, 3, 4` says something is filtered out.
- **Near-me must not renumber.** `listOrder` becomes a distance sort when near-me is on; the number must derive from `comparePlacesBySchedule` specifically, never from whatever `listOrder` currently is.

### R6 — markers must survive the per-second re-render

Verified: `Map.tsx` memoizes properly (`usageIndex`, `allUsages`, `dayScoped`, `categoryCounts`…), but the **ordering** depends on `nowMs` (the ahead/behind partition), so the sorted array's identity changes every second even when nothing moved. The list already handles this (`useFlipRows` measures only when order or visibility actually changed). **Decision for the map:** markers are keyed by `placeId` and take only primitive props (hue, number, tier, selected), so a clock tick reconciles to a no-op diff and no marker is destroyed or recreated. This is the marker-level restatement of §3's "inert to the clock tick".

### R7 — coincident pins are not a density problem, and "no clustering" does not cover them

§5 declined clustering on the grounds that a trip holds tens of places. Correct, and beside the point: **two places at the same address** are a certainty, not a scale issue — a station that is one leg's origin and another's destination, a hotel and its restaurant, a booking's `fromPlace` and an event at the same building. Coincident pins hide each other, and which one wins is currently undefined.

**Decision: a deterministic z-order, stated rather than emergent** — the next stop on top, then ahead-of-you by day order, then ideas, then ambient, then behind-you, then ghosts. The one that matters most is the one you can see and tap. A spreading/spiderfy gesture is **not** adopted (it needs an interaction vocabulary the tab does not have); if coincidence proves common in real trips, that is when it earns a decision.

### R8 — the ghost tier renders pins the chips do not count

ADR-0119 exists to stop a chip promising rows the list will not render. Ghosts create the **inverse**: the canvas shows places that no chip counts, because the chips count the _scoped_ set and a ghost is by definition out of scope.

**Decision: that asymmetry is correct and stays, and it is why the ghost is drawn the way it is.** A ghost is hollow, glyph-less, unnumbered and smaller precisely so it never reads as part of the answer the chips are describing. Two guards: ghosts are never counted in any facet, and they never participate in near-me's sort or distance chips (amendment B rule 4). What ADR-0119 forbids is a **count that overstates** — a subordinate pin that no count claims is the opposite failure mode, and the fix for it is prominence, which amendment B already spends.

### R9 — an archived trip was never considered

ADR-0040/0044 make a finished trip read-only, and the Map tab is a read surface, so it stays. But **the live cues are meaningless there and it still bills a map load.** **Decision:** in the archive the map renders (positions are exactly what you want from a finished trip), and the Trip-mode live layer drops — no amber next-stop, no near-me chip — which is the same rule those cues already follow when mode is not live. The billed load is accepted on §3's arithmetic; nobody opens a finished trip's map twenty times a day.

### R10 — the backend has nothing to do, and that is worth stating

Verified so a future session does not go looking: **no CSP to amend** (the backend runs no `helmet`/CSP and `index.html` sets no `http-equiv`, so the Maps script and tile hosts need no allowance — if a CSP is ever added it must allow `maps.googleapis.com`/`maps.gstatic.com`), **no Workbox change** (no `runtimeCaching` rules exist and Google's script is cross-origin and outside the build graph, so it is neither precached nor intercepted; `navigateFallbackDenylist` covers navigations only), **no schema change, no proxy route, no server env.** Phase 6 is a frontend-only phase. The only backend-adjacent work in the epic is the deferred Routes proxy, already scoped in ADR-0108 §4.

### R11 — decomposition, and how any of this gets tested

`screens/Map.tsx` is **701 lines** today. A pane, a sheet, markers and a camera will roughly double it, and nothing in the ADR said where they go. **Decision:** the canvas + markers become `ui/domain/MapPane` (the `ui/domain/` layer exists for exactly this), the sheet is a primitive, and the camera is a hook — mirroring how `DayStrip`/`GlanceCard`/`EventCard` were extracted.

**And testing, which the ADR had not addressed at all:** a rendered Google map cannot be exercised in the suite. So the phase's logic must live in **pure functions in `lib/`** — the bounds of a set of usages, the day's order index, the tier a usage belongs to, whether a place is focusable — each unit-tested with no Google present, exactly as `place-usage.ts`/`distance.ts` already are. The shell (snap heights, the toggle, row↔pin selection, the full→half lift) is testable with the pane stubbed. What genuinely cannot be tested is the render itself, and that is the honest limit to state rather than paper over — the same posture as the builder-drag's "real-device pass" backlog item.

### Open forks, for a product call rather than a design one

1. **Free Google layers we could switch on almost for nothing.** The JS API ships `TransitLayer` and `TrafficLayer`, which add no separate SKU as far as the current SKU list shows (**confirm at build**). For a transit-dense city trip, transit lines are a real answer to "how do I get there" and cost us nothing to draw. The tension is "quiet base, loud pins" (ADR-0106 §C) — either would add exactly the clutter that rule removes. If taken, it is a **toggle, off by default**, and probably transit only.
2. **The outcome facet, riding along** (deferred by ADR-0117): `מה נשאר` / where we have been. It is a chip over data already derived, and it is _more_ valuable on a map than on a list, where seeing the remaining cluster is the point. Cheap enough to fold into this phase rather than trail it.
3. **A "places in view" count.** ADR-0106 §4 asserts pan/zoom **is** the area filter, but nothing on screen ever says so. A count off the camera bounds ("12 מקומות באזור") would make the claim legible, needs no new data, and is a few lines.
4. **Whether proximity promotes a ghost** (left open in amendment B). Near-me sharpens it rather than settling it: a ghost 50 m away is nearer than anything in scope and is invisible to the sort. Still better judged on a real map.

## Context

Phases 0–5 of the Maps & Places epic have shipped. The Map tab is a real surface: `lib/place-usage.ts` derives every place's days/categories/outcome/commitment from the trip snapshot, `screens/Map.tsx` renders it as a filtered, scoped, ordered list with near-me, navigate-to-next, outcome states and Plan-mode Google research. Phase 6 — the **rendered** map — is the last phase, and the only one still unbuilt.

ADR-0109 deferred its detailed design on purpose, with a specific instruction: Phase 6 is **pricing/API-sensitive** (Google changed its pricing model in 2025), so pixel-detailing it early "would likely go stale," and the build session must re-confirm current API details first. The backlog line carries the same condition. This session is that session: reconfirm, then decide.

Two facts from the tree frame the decisions (verified, not recalled):

- **The frontend has four runtime dependencies** (`react`, `react-dom`, `react-router-dom`, `dexie`, plus the workspace `@waypoint/shared`). Nothing Google-related is installed; no code references `VITE_GOOGLE_MAPS_BROWSER_KEY` or `maps.googleapis`. Phase 6 is the first Google **client** code in the app.
- **`screens/Map.tsx` re-renders every second.** It calls `useClock()` at line 69 and derives `today`, the ahead/behind partition and navigate-to-next from `nowMs`. Any map integration that recreates the map, re-reads layout, or rebuilds markers on render will do it 60 times a minute. Session 130 already paid for this once on the list side (`useFlipRows` measures only when order or visibility actually changed).

## Decision

### 1. The API reconfirmation: the architecture holds, two details move

Confirmed against Google's current documentation and pricing on **2026-07-26**. ADR-0106 §A–F and ADR-0108 §1/§4 stand — the JS-API path, the split-key model, cloud styling, `AdvancedMarkerElement`, and the free-connectors-before-paid-routes sequencing are all still the right shape. What the check changes is small and specific:

**Held (no change):**

| Fact                                                                   | Status                                                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Maps** (a Maps-JS map load) — $7 / 1,000, 10,000/mo free     | Confirmed, unchanged from ADR-0108                                                                                         |
| Per-SKU free tier: 10,000 Essentials / 5,000 Pro / 1,000 Enterprise    | Confirmed                                                                                                                  |
| The browser key is unavoidable and unproxyable (key in the script URL) | Confirmed — ADR-0108 §1's deciding fact holds                                                                              |
| Cloud-based map styling (a `mapId`) is the styling path                | Confirmed; legacy cloud styles were auto-migrated by 2025-03-18, and an experimental JSON-import path was added 2025-08-21 |
| `AdvancedMarkerElement` renders arbitrary HTML/CSS content             | Confirmed — the ADR-0106 §B "our own pins" premise                                                                         |

**Moved — two corrections worth recording:**

1. **A `mapId` is now mandatory, not merely recommended.** Advanced markers do not load without one (an invalid or missing id fails them outright), and `google.maps.Marker` has been deprecated since 2024-02-21 in favour of `AdvancedMarkerElement`. ADR-0106 §B treated the `mapId` as the thing that _unlocks_ vector maps and custom markers; it is now simply the price of admission. **Consequence: creating a Map ID (+ a cloud style on it) is a new human Phase-0 step** that the prerequisites checklist does not currently list — added there in this change. Map type must be **JavaScript**, raster or vector; we take **vector** (it is what advanced markers are designed against).
2. **The Routes tiers are named Essentials / Pro / Enterprise, and Essentials caps at 10 intermediate waypoints.** ADR-0108 §4 records "Essentials/Basic ~$5 … Advanced ~$10 … Preferred ~$15" and ADR-0106 §D assumes a "~25-waypoint cap". Current: **Compute Routes Essentials ~$5/1,000** (basic features, **max 10 intermediate waypoints**), **Pro ~$10/1,000** (traffic-aware), Enterprise above it. This matters for ADR-0106 §D's whole-day route: a day with **more than 12 stops** (origin + 10 intermediate + destination) does not fit the cheap tier. It does not change anything shipping in this phase — free connectors carry no waypoint cap — but the paid-Routes follow-up inherits a lower ceiling than ADR-0106 assumed, and must chunk or degrade rather than silently escalate tier. Recorded so that phase doesn't rediscover it.

Google also now sells **subscription plans** (Starter $100/mo for 50,000 combined calls, and up) as an alternative to pay-as-you-go. Noted and **not taken**: at this scale we sit inside the free per-SKU allowances (§3), so a subscription would be a pure loss.

_Accuracy note, inherited:_ these figures were confirmed on the date above and Google moves them. The **architecture below does not change if a number moves** — the numbers only justify §3's "don't contort the design for map-load cost".

### 2. The binding is `@vis.gl/react-google-maps`, not a hand-rolled loader

Adopt **`@vis.gl/react-google-maps`** (v1.9.0, MIT, peer-deps React ≥16.8 including React 19 — we are on 19.2.7; it pulls `@googlemaps/js-api-loader`, `@types/google.maps`, `fast-equals`). It is the React binding Google itself introduced for the Maps JavaScript API.

This is a real dependency added to a deliberately lean frontend, so the reasoning is recorded rather than assumed:

- **The loader is a singleton problem, and getting it wrong is subtle.** The modern API loads via `google.maps.importLibrary()`; two callers each implementing their own bootstrap is a documented source of conflicts and duplicate loads. One library owning the loader is one answer to "has the API loaded yet" instead of a per-call-site one.
- **React 19 StrictMode double-invoke is exactly the bug class we just paid for.** Session 130's near-me regression was a liveness ref that survived a mount ("a liveness ref belongs to a mount, not to an instance"). A hand-rolled map that instantiates in an effect has the same shape of hazard, with a **billed** side effect (§3) instead of a silently dead hook.
- **The per-second clock re-render (Context) makes lifecycle correctness load-bearing, not cosmetic.** `<Map>`/`<AdvancedMarker>` hold the imperative instances outside the render path and diff their props; a hand-rolled equivalent has to re-derive that discipline, and the failure mode is a map that flickers or re-bills once a second.
- **It resolves the `createPortal` tension instead of fighting it.** Rendering React content into a marker needs a portal into the marker's DOM node, and `createPortal` is **lint-blocked** in this repo (`eslint.config.mjs`) because a bespoke portal escapes the back stack (ADR-0090). vis.gl does that portal inside the library, so we neither hand-roll an overlay nor add a file to the allowlist for something that is not an overlay at all. (§5 keeps the pin markup ours regardless.)

**Rejected: hand-rolling the loader + map lifecycle.** It is genuinely feasible — the pin content is static DOM (§5), so the portal is avoidable — and it saves a dependency. Rejected because what it saves is a dependency and what it costs is the three lifecycle hazards above, on the one surface in the app where a lifecycle mistake is billed. **Rejected: `@googlemaps/js-api-loader` directly** (the library's own dependency) — it solves loading only, leaving the React lifecycle for us; if we are taking a dependency anyway, take the one that covers the part that is hard. **Rejected: the Embed-API iframe** — already rejected in ADR-0106 §A (uncustomisable), unchanged. **Rejected: `google-map-react` / the older `react-google-maps`** — unmaintained against the current API.

### 3. One map instance per tab visit; never re-instantiate on a toggle, a filter, or the clock

**The Dynamic Maps SKU bills per map instantiation** — every `new google.maps.Map()` is a billable load. So the cost question for Phase 6 is not "how many tiles" but "how many times do we construct a map".

The arithmetic, stated so the design isn't contorted around a non-problem: 10,000 free loads/month is ~333/day across the whole app. One trip is ~5 people (ADR-0065's "~5 is a trip, not a ceiling"); a heavy day of five people each opening the Map tab 20 times is ~100 loads. We are an order of magnitude inside the free tier, and the per-SKU daily quota cap (ADR-0108 §6) bounds the abuse case regardless.

**So: one instantiation per tab visit is accepted, and not optimised further.** No global map singleton hoisted above the router, no hidden always-mounted pane. What is **forbidden** is re-instantiating for anything that is not a fresh visit:

- **Not on the `רשימה / מפה` toggle** (§4) — taking either pane full-screen resizes and re-centres one live map; it never destroys and rebuilds it. This is the rule most likely to be broken by a naive `{view === 'map' && <Map/>}`.
- **Not on a filter, scope, near-me, or sheet drag** — those change markers and camera, never the map.
- **Not on the clock tick** — the map must be inert to the per-second re-render.
- **Not created at all while the user is on the list half.** The map is instantiated when the map pane first becomes visible (which, per §4, is the tab's default — but the list-only view and offline both mean no map, so no load).

**Rejected: a module-level map instance re-attached to a fresh DOM node across route unmounts.** It would drive per-visit loads to ~one per session, and it is the kind of clever that leaks — a detached map holding listeners, markers, and the last trip's camera across a trip switch, in exchange for a cost saving we do not need. The arithmetic above is the argument for not building it.

### 4. The shell: a map pane over a draggable list sheet, and it is view state — not a back layer

ADR-0109 §10 fixed the vision (map pane on top, list as a draggable bottom sheet, a `רשימה / מפה` segmented toggle, full-screen map keeps a peeking sheet). Made concrete:

- **The sheet has three snap heights** — **peek** (a handle + the first row or two, over a full-height map), **half** (the §10 default — map pane above, list below), and **full** (the list as it is today, map hidden behind it). The `רשימה / מפה` toggle is a shortcut to the two extremes; dragging the handle is the continuous version of the same axis. One state, two controls, so they can never disagree.
- **Trip mode opens at half; Plan mode opens at half.** The mode pivot in this tab is already the day scope (ADR-0109 §1), and re-using it here to also mean "how much map" would overload it. What differs by mode stays the chrome and the scope, exactly as today.
- **It is not an overlay, so it does not register with the back stack.** The sheet is a persistent pane of a tab, not a layer over it: it renders inline, the map behind it stays interactive, and nothing about it is dismissable. So it goes through neither `Modal` nor `useOverlay` — which is the same reading ADR-0109 §105 already applied to the geolocation pre-prompt ("an inline card, not an overlay — it explains rather than interrupts"). **Back from the Map tab leaves the tab**, whatever height the sheet is at, and the height is view state like the `allDays` scope chip beside it. Registering it would make the back button mean "shrink the list" on one tab and nothing like it anywhere else (ADR-0103's typed-layer model exists to keep back predictable; adding an untyped pane state to it is the opposite).
- **The sheet height persists for the session, per tab visit** — someone who drags to full and comes back should not be handed a map they just dismissed. Not persisted to storage: it is view state, not a preference.
- **The drag handle owns the gesture.** The shelf's drags (ADR-0116 sessions 116–125) taught this repo the whole lesson about a touch keeping its target and a guard outliving the gesture. The sheet drag is a **vertical snap** gesture, not a drop-target gesture, so it is not the shelf's mechanism with a new payload; at build time, check whether the shelf's pointer-capture helper extracts cleanly into a shared hook and generalize it if the extraction is small — if it would mean a substantial refactor of the shelf's drag, ask first rather than silently taking it on (CLAUDE.md rule 8's explicit escape hatch), and otherwise write the small dedicated hook.

### 5. The pins are `AdvancedMarker`s carrying **our** markup, over the same derivation the list reads

- **One source of truth.** The map renders the **same filtered, scoped set** the list does — `buildPlaceUsageIndex` + `matchesPlaceFilter` + the block/comparator vocabulary, untouched. The map is a second _rendering_ of `place-usage.ts`, never a second derivation (ADR-0110 §2). A chip that changes the list changes the pins in the same pass, so the two halves of the split view cannot disagree — the property the whole list-first investment was for.
- **Only coord-bearing places pin.** A coordless "Place-lite" has nothing to pin (ADR-0106 verification point 5); it stays a list row with its existing `＋ מיקום` enrich action. **The map pane must therefore never be the only view of the set** — which the sheet guarantees by always peeking. (ADR-0109 §3's "hollow dashed ring" coordless pin is consequently unbuildable and unneeded: it described a pin for a place that has no position. The list badge covers that state.)
- **Marker content is our DOM, not `PinElement`.** Google's `PinElement` gives background/border/glyph — enough for a solid category teardrop, and **not** enough for the commitment grammar ADR-0109 §3 specifies: dashed for a maybe-only idea, desaturated for an ambient mid-stay base. Those need our CSS. So the marker's `content` is an element carrying the same `--cat-*` tokens and the same class grammar as the list badge, so badge and teardrop are one visual system by construction rather than by discipline. The pin markup is **static per place** (a category, a commitment, a lock, maybe a ring) — no React state inside a marker, which is why §2's portal is a convenience and not the reason for the dependency.
- **The amber next-stop ring lands on the pin, as promised.** ADR-0109's session-104 amendment shipped the list form of §6's single amber time-anchor (an `היעד הבא` tag + a soft ring on one row) and said "Phase 6 needs no rework: the ring moves onto the pin as §6 always intended and the row keeps its tag." That is now built: exactly one pin ever carries it, and it stays Trip-mode only.
  - **It is an outline _on_ the pin, not a ring _around_ it.** Worth stating because the first pass got it wrong in a way that only shows on screen: a pill-shaped box drawn around the teardrop read as "a circle someone drew near a pin" — two shapes, where the intent was one highlighted shape. A `box-shadow` spread follows `border-radius`, so it traces the teardrop's own silhouette, tip included, and the pin simply looks outlined. Selection stays a separate `outline` so the two compose (a pin can be both the next stop and the one you just tapped) rather than one replacing the other.
- **No clustering.** A trip holds tens of places, not thousands; the ceiling is named rather than engineered around. If a trip ever renders enough pins to collide meaningfully, the fix is the marker-clustering library, and it earns its own decision then.

### 6. The camera answers the controls, the same way the list does

ADR-0120's rule is that every control which changes the list is animated — a reveal for arriving/leaving rows, a move for re-orders. **The map's version of that rule: every control which changes the pin set moves the camera.**

- **Fit to the bounds of the filtered set**, animated, whenever that set changes (day ↔ all-days, a type chip, the `אולי` toggle, near-me). A chip tap that silently leaves half its results off-canvas is the map's exact analogue of the jump session 130 removed from the list.
- **A manual pan or zoom wins, until the next scope change.** Someone exploring the map has taken over the camera; re-fitting under their fingers on the next clock tick or re-render would be the map version of a list that re-sorts while you read it. The next explicit control re-fits.
- **Tapping a list row focuses its pin** (and tapping a pin highlights its row) — the concrete rules, including the sheet lifting off the map and what happens to a coordless or offline row, are in **amendment C** above. This is where the interim ends: ADR-0109's 2026-07-24 amendment made `מפה` (view) deep-link out to Google's place view "because we have no map surface yet," tagged `TODO(phase-3)` on `mapsPlaceUrl` in `lib/places.ts`. With a map in the app, **`מפה` focuses our own map** — on the Map tab it is the row tap; from an `EventCard` or `BookingDetail` it routes to the Map tab focused on that place. **`ניווט` (directions) stays a Google deep-link permanently** (ADR-0106 §F — we never rebuild turn-by-turn), and `mapsPlaceUrl` survives only where no in-app map can be reached.
- **The "me" dot** appears when near-me is granted, an OS-map convention outside the colour budget (ADR-0109 §3). Near-me's existing behaviour — the sort, the distance chips, the reason-first pre-prompt, the honest denied/offline degradation — is unchanged; the dot is the spatial addition §7 always said Phase 6 would add for free.

### 7. Day connectors are dashed, neutral, and only exist in day scope

> **Revised by amendment A above (same session):** a line cannot show order, so **the order moved onto the pins as numbers** and the connector is now **Plan mode only** — its one remaining job, revealing the day's shape, is a planning question. The dashed-and-neutral rule and the reservation of solid+amber for a real Routes polyline are unchanged.

ADR-0106 §D/§E chose free straight `Polyline` connectors for the first Phase-6 cut, per day, "colour per day, a day toggle". Two refinements:

- **Connectors render in day scope only.** In all-days scope, connecting every day's stops is spaghetti that answers nothing. Restricting them to a single day removes the need for a per-day colour palette entirely (one day, one path) — and it means **the tab's existing scope control _is_ ADR-0106 §E's "day toggle"**, rather than a second toggle beside it. This revises §E's per-day-colour half; its substantive point — that the trip macro is per-day, never one route — is exactly what this enforces.
- **The connector is a dashed, neutral line, not a coloured route.** A straight segment between two stops is **not the route you will walk**, and drawing it solid would claim it is. Dashed says "this is the order". It also stays off the colour budget: "quiet base, loud pins" (ADR-0106 §C) means the connector belongs to the ground, not the figure — and it leaves **solid + amber ETA** unspent, so a real Routes polyline later reads as categorically different from a connector rather than as a better-coloured one.
- **The free whole-day deep-link ships with it** (ADR-0106 §D): a Google Maps directions URL carrying the day's ordered stops as waypoints — "navigate my whole day", costing nothing, opening turn-by-turn where turn-by-turn belongs.
- **Paid Routes (live ETAs) is explicitly not in this phase.** It stays ADR-0106 §D/§F's sequenced-after enhancement, behind the ADR-0108 §4 envelope (server key, backend proxy, Essentials field mask, per-member·trip throttle) and now also behind §1's 10-intermediate-waypoint ceiling. It is the "when do we leave" payoff and it deserves its own decision, including whether the day-ordered-stops cache ADR-0108 §4 left open is worth building.

### 8. Offline, the map is absent — not broken, not disabled

Rule 5 (everything works offline for reads) is intact because **the rendered map is the one part of this tab that was never offline** (ADR-0106 §7 scope boundary: true offline tiles are a PWA limitation the PRD accepts).

Offline: **no map pane, no toggle, no map instance** — the tab is the list it is today, under the existing "last saved" banner, with distances behaving exactly as ADR-0109 §105 settled. The map half is **absent rather than present-and-dead**, which is the rule this tab has applied twice already: the near-me chip is removed offline because you cannot re-locate (§7), and ADR-0115 made the Google half of research absent rather than disabled. A greyed map frame with a "no connection" watermark would be a third grammar for the same fact.

### 9. Two cloud styles on the existing theme signal — and the night one is inert readiness

ADR-0106 §B calls for two map styles (day/night) swapped on `data-theme`. Built exactly that far and no further, because **dark mode is not shipped**: `tokens.css:226` states the dark remap is "INERT until `<html data-theme="dark">` is set", and ADR-0028/0105 keep dark mode as readiness, not a feature.

So: **mint both Map IDs / styles, read `data-theme`, and ship the day style live.** The night style exists so that turning dark mode on is a token-and-style flip rather than a Maps project task — the same posture `BootScreen` took (ADR-0105: every colour reads a token so the remap is inert-ready, not wired). What we do **not** do is build a swap nobody can see and call it tested.

The style itself is ADR-0106 §C's brief, unchanged: desaturated cool-paper base matching `--screen`, POI clutter dropped, no colour flood. Cloud styling costs nothing.

### 10. Our controls, not Google's; greedy gestures; attribution stays

- **`disableDefaultUI`, then add back only what we need.** Google's default controls are Google-chromed, unlabelled, and unaware of an RTL page — the opposite of a brand-styled map. Zoom is the pinch; the one control we add is a **re-centre** affordance, which is also the escape hatch from §6's "a manual pan wins".
- **The re-centre control is the conventional crosshair, round and icon-only** — the symbol every map app puts on the canvas for exactly this, so it needs no teaching. Two specifics:
  - **It is a real SVG, not a glyph.** A new `locate` entry in `ui/Icon.tsx`'s `PATHS` (a one-line addition to the existing registry, not a new mechanism — the same shape `settings` and `search` took when they replaced raw `⚙`/`🔍`), because "emoji are content, icons are UI" (design-language).
  - **Unlabelled is deliberate, and is not the pair ADR-0109 §1 rejected.** That rejection was of two _confusable_ glyphs — eye vs. compass — competing for the same row action. This is a single universally-recognised control in the position users already look for it, and it still carries an `aria-label`.
  - **What it does: it re-frames, it never locates.** With a fix already in hand (near-me granted, the "me" dot rendered) it centres on you, which is what the symbol promises; without one it fits the filtered set. What it must **never** do is request the permission — that stays the near-me chip's reason-first pre-prompt (ADR-0109 §6), the only place in the app allowed to ask.
- **`gestureHandling: 'greedy'`.** The default (`cooperative`) demands two fingers to pan a map inside a scrollable page and shows Google's "use two fingers" overlay — a phone-first regression (ADR-0017) and un-styleable chrome. The map pane is a fixed pane, not inline content, so one-finger pan is unambiguous and correct; the page does not scroll behind it, and the sheet handle (§4) owns vertical dragging.
- **The Google logo and attribution stay** — required by Google's ToS (ADR-0106 §B), non-negotiable, and designed around rather than fought.

### 11. What Phase 6 is not

Recorded so the build has an edge: **paid Routes / live ETAs** (§7), **the "by area" filter as an explicit facet** — pan/zoom _is_ the area filter (ADR-0106 §4), so no chip is added; **marker clustering** (§5); **offline tiles** (§8); **member GPS sharing** (ADR-0006, still out); **3D/tilt/altitude**; and **a dark map anyone can see** (§9).

## The remaining human gate

Phase 6 cannot be verified without the Google Cloud steps ADR-0106 Phase 0 deferred. The prerequisites checklist is updated in this change to add the newly-mandatory piece:

1. Enable **Maps JavaScript API** (and Routes API only when paid routes are picked up).
2. **Create a Map ID** — type **JavaScript**, **vector** — and attach a **cloud-based map style** to it (the day style; the night style as a second id per §9). _New step, from §1._
3. Mint the **referrer-locked browser key** (`VITE_GOOGLE_MAPS_BROWSER_KEY`), API-restricted to **Maps JavaScript API only** (ADR-0108 §1).
4. Set the **Dynamic Maps daily quota cap** and confirm the budget alert still covers the new SKU (ADR-0108 §6 — a hard gate, not optional).

Until step 3, the build can be written and unit-tested but the rendered map cannot be seen. `DEMO_MAP_ID` exists for local development and is not a substitute for the real style.

## Consequences

- **Phase 6 has a decided shape and no open pricing question.** The two figures that moved (§1) change a follow-up's ceiling and add one human step; nothing in ADR-0106 §A–F or ADR-0108 §1 needed reopening, which is the outcome the "reconfirm first" instruction was hoping for.
- **The frontend gains its first UI dependency in a long while** (`@vis.gl/react-google-maps`), justified in §2 against the alternative of hand-rolling a billed lifecycle. Bundle impact lands in the already-lazy `Map` chunk (`App.tsx:58`), so it costs nothing to a session that never opens the tab.
- **The Phase-3 investment carries forward whole**, as ADR-0109 §10 promised: one derivation, one filter layer, one pin palette, one ordering vocabulary — the map adds a canvas, a camera, a dot, and a connector. No part of the list is thrown away, and the list remains the only view offline and the only view of a coordless place.
- **Two long-standing TODOs close:** the `TODO(phase-3)` seam on `mapsPlaceUrl` (`lib/places.ts`) gets its in-app target (§6), and ADR-0109 §6's amber next-stop ring reaches the pin it was designed for (§5).
- **Three ADRs are annotated as refined by this one:** ADR-0106 §E (per-day connector colour → day scope only), ADR-0108 §4 (Routes tier names + the 10-waypoint Essentials ceiling), ADR-0109 §3 (the coordless pin is unbuildable and unneeded) / §10 (the vision is now a concrete shell).
- **Back navigation is untouched.** The sheet and the toggle are view state, deliberately outside ADR-0103's layer model (§4), so no new back rule and no new overlay registration enter the app for this phase.
- **Cost stays bounded by the same two mechanisms as every other phase:** the free-tier arithmetic (§3) plus the per-SKU daily quota, with the design forbidden only from the pathological case (re-instantiating a map on a toggle or a tick).

## Alternatives considered

- **Replace the list with the map** (the literal reading of "map as a primary surface"). Rejected — ADR-0106 Decision 3 built the list to accommodate the map, not to be replaced by it, and the list is the only view that works offline and the only one that can show a coordless place. The sheet always peeks for this reason.
- **The map as a full-screen overlay pushed from the list** (a layer, with back to dismiss). Rejected: it would make the map a place you visit rather than the tab's default face, and it puts pane state into the back stack (§4) for no gain. The segmented toggle gives the same full-screen map without teaching back a new meaning.
- **A global map singleton above the router**, to make Dynamic Maps loads ~one per session. Rejected in §3 on arithmetic — we are an order of magnitude inside the free tier, and a detached map holding listeners and stale camera state across trip switches is a real bug surface bought with an imaginary saving.
- **`PinElement` for the markers** (Google's built-in customisable pin — no custom DOM, no portal question at all). Rejected: it cannot express the dashed-idea / desaturated-ambient commitment grammar ADR-0109 §3 specifies, so the map's pins would diverge from the list's badges. Half the pin system is not a pin system.
- **Hand-roll the loader and map lifecycle, no dependency.** Considered seriously (§2) — the pin content is static DOM, so the hard part is avoidable. Rejected because the remaining part (loader singleton, StrictMode, inertness under a per-second re-render) is precisely where a mistake is _billed_, and this repo has just spent a session on a StrictMode lifecycle bug that was merely silent.
- **Per-day coloured connectors across all days at once** (ADR-0106 §E as written). Rejected in §7: it is unreadable at trip scale, it needs a new palette the colour budget does not have room for, and the day scope already partitions the trip correctly.
- **Solid connectors** (they look better). Rejected: a straight line drawn solid claims to be the route. Dashing is the honest form, and it keeps solid+amber free for a real Routes polyline.
- **Ship paid Routes ETAs in this phase** (the "leave by 18:37" payoff is the most valuable thing on the roadmap). Rejected as sequencing, not as direction: it is a second cost envelope, a second proxy route, and now a waypoint ceiling — bundling it would make the phase's approval a cost decision instead of a rendering one. Free connectors first, exactly as ADR-0106 §D sequenced.
- **A greyed, watermarked map frame when offline.** Rejected (§8): a third grammar for a fact this tab already states two ways. Absent, not disabled.
- **Build the dark map style now and swap it live.** Rejected (§9): dark mode is inert across the whole app; a swap nobody can see is untestable. Mint the style, read the signal, ship the day map.
