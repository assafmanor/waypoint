# 0121 — Phase-6 embedded map: the reconfirmed API surface, `@vis.gl/react-google-maps`, the map↔list shell, and one map load per visit

**Status:** Accepted — **built 2026-07-26 (session 133)**, with three production fixes in session 134; see the [Build log](#build-log-2026-07-26-session-133) for where the build refined this design, the one place it read against the letter, and the three gaps the deploy found — §2's build vars never reaching the build, §7's containment guard swallowing the opening framing, and §6's prominence ladder never saying that the camera ignores ghosts
**Date:** 2026-07-26
**Implements** [0106](0106-maps-and-places-epic-scope-and-phasing.md) **Phase 6** and the design [ADR-0109](0109-map-tab-design.md) deferred to this session ("the _fully-rendered_ Phase 6 map — to its own build session … re-confirming current Maps/Places API + pricing first").
**Amended:** 2026-07-28 (session 148) — §8 gains **where** `מפה` appears (the row's category badge, on every event and booking in both modes) and **what a placeless row says**; see the amendment above.
**Amended:** 2026-08-05 — §8's way-in block becomes **one entry per reference** (a linked booking+event was drawing two rows with the same label), gains a two-line entry carrying `kind · day · time`, **folds** at `PLACE_REFS_CAP` behind `עוד N`, and stops overflowing the card (`min-width: 0`); see the amendment inside §8.
**Refines:** [0109](0109-map-tab-design.md) (§3's pin grammar gets its map form; §10's shell becomes concrete; §6's amber ring lands on a pin; §1's row tap changes destination), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) (§4's cost envelope re-costed; its Routes tier table corrected), [0106](0106-maps-and-places-epic-scope-and-phasing.md) §4/§B/§D/§E, [0117](0117-map-place-outcome-states.md) (its deferred outcome filter is scoped here), [0119](0119-map-maybes-facet-is-the-shelf.md) (the ghost tier is its deliberate inverse), [0120](0120-filter-reveal-is-shared-infrastructure.md) (the map's answer to "every list change moves"), [0078](0078-feedback-state-family.md) (the layout layer gains a full-bleed body modifier), [0090](0090-back-is-computed-from-nav-state.md)/[0103](0103-back-navigation-typed-layer-model.md) (why the sheet is _not_ a back layer), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget on a rendered canvas), [0096](0096-per-domain-claude-md-guides.md) (reuse before adding)

Mockup: [`mockups/map-embedded-v1.html`](../../mockups/map-embedded-v1.html) — six states, rendering through the app's **real** stylesheets (inlined by `mockups/tools/inline-app-css.mjs` from an `APP-CSS:` manifest, so it is portable and cannot drift; the file is in `.prettierignore` because formatting the generated block fights the generator). Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

> Written as one decision rather than a stack of same-day amendments. The **Revision log** at the end records what changed during the session and why, so a rejected idea is not re-proposed — but §1–§14 are the design, readable start to finish.

## Amendment (2026-07-28, session 148) — the badge is the way to the pin, and a placeless row says so

Phase 5 of the map epic ("every place-bearing surface reaches the map") plus its sibling item ("a booking with NO place"), built together. Mockup: [`mockups/map-reach-v1.html`](../../mockups/map-reach-v1.html). This amends **§8**, which had settled what `מפה` _does_ (an in-app destination, never a Google hand-off) but not **where it appears** — and had nothing to say about a row with no place at all.

### 1. The rule: every event and every booking, in both modes

`useShowPlaceOnMap()` was built and correct with **two** call sites (`EventCard`, `BookingDetail`). The session opened by auditing the rest and reached a **wrong answer worth recording**, because it is the tempting one: it argued that a row whose own tap reaches a surface already carrying `מפה` (the Index's booking rows and `TransitionRow` both open `BookingDetail`) needs no second way in, citing §8's own retirement of "View on Google Maps" and the four ADRs that exist to undo parallel copies. On that reading three of the four surfaces the backlog named were not gaps.

**The owner overruled it: every event and booking gets an _easy_ way to its pin, in both modes.** Two taps through a sheet that then closes and switches tabs is a path, not an affordance. And the audit had missed the fact that made the owner's report exact: on `EventCard` the labelled action row lives inside `.wp-event-actions`, which is `max-height: 0` until the card is expanded — so **an unexpanded day event offered no way to the map at all**, and the settle variant (a passed, unmarked soft event) returns _before_ that row exists, so it had **none in any state**. The affordance was in the code and absent from the screen.

_Not_ in scope, and the reason matters: a shelf **idea** is neither an event nor a booking, and it is already a first-class map population with its own pin and row (§6) which the `על המדף` tag names — so the shelf is no dead end, and `MaybeCard`'s only corner is spent on `✕`.

### 2. The placement is the BADGE, and that is a measured decision

A separate control in each row's trailing slot was built first, then measured against the real stylesheets in the mockup. It fails:

|                                                       | 390px                                | 360px           |
| ----------------------------------------------------- | ------------------------------------ | --------------- |
| `Ichiran Ramen` on the day card                       | 1 line → **2**                       | —               |
| a long Hebrew builder title (`.bld-ttl`, no ellipsis) | 1 → 2 lines                          | 2 → **5 lines** |
| `Shinjuku Granbell` on a transition row               | silently truncated **184px → 126px** | —               |

A dense phone row has no horizontal width to give (ADR-0017), and `.bld-ttl` has no ellipsis, so it wraps rather than truncating. **So the way in is the row's category badge** (`ui/domain/PlaceBadge.tsx`), which costs nothing because it is already there, at the same leading position, on every host.

It is also the **right** object rather than merely the free one: §6 and ADR-0109 §3 make the map pin and the list badge **one thing in two form factors**, sharing the `--cat-*` tokens by construction. Tapping the badge to see the badge's other form is this ADR's own idea, followed.

- **It wears a teal ring and a corner PIN, not a bare dot.** A tappable thing has to look tappable, and a dot says only "something is here" while the pin names what the tap does — in the silhouette of what you land on (ADR-0087's marker; `Icon`'s new `pin`). Teal because it is a location affordance and teal is location only (ADR-0028); the badge's own category tint is untouched underneath.
- **A real SVG, never 🗺️.** Emoji are content, icons are UI (design-language.md), and a row's one emoji slot is already the category glyph (ADR-0038) — a second emoji there would muddy the one thing the badge is for.
- **With no place it is exactly the inert badge it always was** — no ring, no marker, no `role`, nothing for a screen reader to find. "Absent, not broken", on the same two conditions as before: no mappable place, or no Map tab to route to.
- **Hosts:** `EventCard` (both variants), `BuilderRow` (PlanDay), `TransitionRow` (**both** edges — where you check _out_ of is a place on the map as much as where you check in), and the Index's booking rows via the shared `ListRow`, which gains one `onShowOnMap` prop so any future managed list is a one-line addition.

> **Amended 2026-08-06 — a per-edge host passes its EDGE, or it goes to the wrong airport.** `TransitionRow` is listed above as a host on **both** edges, and it was: both edges got the button and both resolved the same place. `eventMapPlace` goes through `eventPlaceId`, which answers with a transport booking's **origin** — right for a surface about the booking as a whole, and wrong for a row that is about one end of it. So a card labelled `נחיתה` framed the airport you took off from (owner: _"the map centers around the departure and not the landing … it should be aware of the relevant node"_). The resolvers take an optional edge now; omitting it keeps the booking-level answer, so only the per-edge caller changed. **The same row also stopped naming the whole route** — it says `נחיתה` already, so the other endpoint was the half that pushed the relevant one off the row, and it truncated the wrong way round.

### 3. `מפה` and `ניווט` are not one atomic pair

The open question §8 left was whether they always sit together. **They do not.** `ניווט` stays a labelled text action in `EventCard`'s action row and on `TransitionRow`'s start edge, because directions are a **live, on-the-ground** verb — which is why the day view already gates its own on `!readOnly` and `TransitionRow` takes none at all in Plan mode. `מפה` asks "where is this in the trip", which is mode-neutral and belongs in both. So the builder's row carries the way to the map and no `ניווט`, and that is the design rather than an omission.

### 4. NOT on Home's board (owner, 2026-07-28)

It was wired to the hero's now/next slots first, on the rule in §1 taken literally, and **read too loud**: the board is the app's one dark, glowing surface, rationed to one per screen, and a teal ring plus a marker on its icon competes with the thing the board exists to say. It is backed out. The hero's way in is deferred to **its own redesign** — the backlog's "Hero 2.0", where tapping the board expands it and actions become possible in place, which is the shape this affordance actually wants there. Home already answers "where is the next stop" with the navigate-to-next quick tile (ADR-0106 §6), and that tile stays one tile, one job: at four columns it is ~75px wide, under the 44×44 floor for any second control.

### 5. A placeless row says so, and the save is never gated

Every non-transport booking type saved happily with **no** location (`BookingSheet` validates title + dates only), and then `BookingDetail`'s `LocationFact` was gated behind "is there anything to show" and **simply did not render** — so no surface anywhere said the booking was placeless. It cost a false bug report: a two-night hotel "missing from the map" was a hotel with no place. Transport was already effectively gated (`routeTitle` → `routeRequired` needs both endpoints), so this is single-place types only.

- **The `מיקום` fact now ALWAYS renders for a single-place booking**, including when there is nothing to show: the value reads `לא הוגדר מיקום` in the muted voice a missing value earns. Words, not a dash — a dash reads as "unknown", and this is a thing you can fix from right here.
- **`＋ הוספת מקום` beside it**, on both no-place states: no place at all, and a coordless Place-lite the picker can enrich in place. It opens `PlacePickerSheet` — the shared picker, reused rather than reinvented (ADR-0110 §1's enrich flow, which the Map row's coordless affordance already drove).
- **A quiet inline note under an empty location field in BOTH authoring forms**, naming what is lost: the map pin and row, `ניווט`, distance/near-me, the cached rating, and the event falling back to the segment/trip zone instead of the place's own (ADR-0107). One shared key, because an event with no place loses exactly the same five things — the two forms must not disagree about whether that is worth saying. `Field` gains a `hint` slot for it: the error slot's quiet peer, which never blocks and never announces itself as an alert.
- **The save is NOT gated, and there is no confirm.** A `ConfirmDialog` on absence, on a non-destructive action, on a legitimate mid-planning path would be clicked through — ADR-0109 §6's anti-nag reasoning, applied one surface over.
- **The coords check is not re-litigated.** Both resolvers still end in `hasCoords(place) ? place : undefined`, so a coordless place still yields no `מפה`: there is genuinely no camera to move. What was wrong was the **silence** around it, not the check.

### 6. Reuse, and one thing deferred on purpose

- `showOnMapHandler` was a private helper in `DayView`; it is now `eventShowOnMap`/`bookingShowOnMap` in `lib/places.ts`, beside the resolvers they already call. A call site is one expression and **cannot forget either** reason to have no button.
- The Map row's one-off `.map-addbtn` became the shared `AddLocationButton` the moment a second surface needed it, and it borrows the in-form picker's own empty label so one action reads one way everywhere. It had to: its label was `מיקום`, which is also what the location fact calls itself, so a placeless row read `מיקום · לא הוגדר מיקום · ＋ מיקום`.
- **`＋ הוספת מקום` should eventually open the Map tab's own search overlay and return here (owner, 2026-07-28).** Adding a place is a spatial act and deserves the map, not a list sheet. That overlay is **Phase 10** and unbuilt, so shipping the shared picker now is the honest interim — it works, offline included, and it is the same flow the Map row already uses. Recorded on the backlog under Phase 10 rather than invented twice.

  > **Settled 2026-07-28 by [ADR-0131](0131-map-search-is-a-control-not-a-screen.md) §9 — the host is `PlacePickerSheet`, and the trip back needs nothing built.** Phase 10 turned out to remove the destination this line was waiting for: the Map tab's Trip-mode search stops being an overlay at all, and it searches the trip's **own** places, which is the wrong corpus for an affordance whose whole job is finding a place that is **not** in the trip yet. And a navigation to the Map tab would unmount this `Modal`, so "return to where you came from" would need a **remembered return target** — explicit state feeding `resolveBack`, the parallel back mechanism ADR-0090 exists to keep out. As a stacked overlay the return already works for free: `resolveBack` reads `hasOverlay` first and closes the topmost. **So the interim is not an interim — it is the right host, and what it lacks is a canvas**, which over coordinate-less Google predictions is Phase 6a by definition, cost gate included.

## Context

Phases 0–5 of the epic have shipped: `lib/place-usage.ts` derives every place's days/categories/outcome/commitment from the trip snapshot, and `screens/Map.tsx` renders it as a filtered, scoped, ordered list with near-me, navigate-to-next, outcome states and Plan-mode Google research. Phase 6 — the **rendered** map — is the last phase, and ADR-0109 deferred its design on the explicit condition that current Maps API + pricing be reconfirmed first.

Three facts from the tree frame everything below (verified, not recalled):

- **The frontend has four runtime dependencies** (`react`, `react-dom`, `react-router-dom`, `dexie`). Nothing Google-related is installed; no code references a browser key or `maps.googleapis`. This is the first Google **client** code in the app.
- **`screens/Map.tsx` re-renders every second** (`useClock()`), and its ordering depends on `nowMs`. Anything that rebuilds on render does it 60×/minute.
- **The Map tab has no layout of its own.** `.map-screen` (`screens/map.css:6`) sets only `--idx-accent`/`--idx-accent-text`; every screen renders inside `AppShell`'s `<main className="body">`, which is `flex:1; overflow-y:auto; padding:16px 16px 92px`. There is no fixed-height flex column to hang a split on — see §5.

## Decision

### 1. The API reconfirmation: the architecture holds, two details move

Confirmed against Google's current documentation and pricing on **2026-07-26**. ADR-0106 §A–F and ADR-0108 §1/§4 stand — the JS-API path, the split-key model, cloud styling, `AdvancedMarkerElement`, and free-connectors-before-paid-routes.

**Held:** Dynamic Maps at ~$7/1,000 with 10,000/month free; per-SKU free tiers (10,000 Essentials / 5,000 Pro / 1,000 Enterprise); the browser key is unavoidable and unproxyable (it lives in the script URL — ADR-0108 §1's deciding fact); cloud styling via a `mapId` is the styling path (legacy cloud styles auto-migrated by 2025-03-18, an experimental JSON-import path added 2025-08-21); `AdvancedMarkerElement` renders arbitrary HTML/CSS.

**Moved:**

1. **A `mapId` is mandatory, not merely enabling.** Advanced markers do not load without one, and `google.maps.Marker` has been deprecated since 2024-02-21. ADR-0106 §B treated the `mapId` as what _unlocks_ vector maps and custom markers; it is now the price of admission. Consequence: **creating a Map ID + cloud style is a new human Phase-0 step** (added to `prerequisites-checklist.md`). Map type **JavaScript**, **vector**.
2. **Routes tiers are Essentials / Pro / Enterprise, and Essentials caps at 10 intermediate waypoints.** ADR-0108 §4 recorded the older Essentials/Advanced/Preferred names; ADR-0106 §D assumed a ~25-waypoint cap. Current: **Compute Routes Essentials ~$5/1,000** (max 10 intermediate waypoints), **Pro ~$10/1,000** (traffic-aware). So a day of more than 12 stops does not fit the cheap tier. Nothing in this phase is affected — free connectors have no waypoint cap — but the paid-Routes follow-up inherits a lower ceiling and must chunk or degrade rather than silently escalate tier.

Google also sells **subscription plans** (Starter $100/mo for 50,000 combined calls, up). Noted and **not taken**: we sit inside the free per-SKU allowances, so a subscription is a pure loss.

_Accuracy note:_ these figures were confirmed on the date above and Google moves them. Nothing in §2–§14 changes if a number moves; the numbers only justify §4's "don't contort the design for map-load cost".

### 2. Configuration: three build vars, one name each, and graceful absence

- **`VITE_GOOGLE_MAPS_BROWSER_KEY`** — the public browser key, API-restricted to Maps JavaScript and referrer-locked (ADR-0108 §1). **This settles a naming conflict:** ADR-0108 and `.env.example` said `…BROWSER_KEY`; `architecture/deployment.md:52` said `VITE_GOOGLE_MAPS_API_KEY`. Whoever wired it would have set one and read the other. ADR-0108's name wins — it says what the key _is_ — and `deployment.md` is corrected.
- **`VITE_GOOGLE_MAPS_MAP_ID`** (+ **`VITE_GOOGLE_MAPS_MAP_ID_DARK`**, unused until dark mode ships, §11). §1 made the `mapId` mandatory but no var had ever been named for it.
- **All three are documented in `architecture/deployment.md`, not `.env.example`** — that file's own comment states the rule ("a frontend build var (deployment.md), not here"). They are build args baked into the client bundle, read via `import.meta.env` as `lib/api.ts:55` already reads `VITE_API_BASE_URL`.
- **A missing key or map id degrades to list-only** — the same "absent, not disabled" rule as offline (§11), so a checkout without Google setup renders today's tab instead of crashing. `DEMO_MAP_ID` covers local development and is not a substitute for the real style.

### 3. The binding is `@vis.gl/react-google-maps`, not a hand-rolled loader

Adopt **`@vis.gl/react-google-maps`** (1.9.0, MIT; peer React ≥16.8 incl. 19 — we are on 19.2.7; pulls `@googlemaps/js-api-loader`, `@types/google.maps`, `fast-equals`). It is the React binding Google introduced for the Maps JS API. A real dependency in a four-dep frontend, so the reasoning is recorded:

- **The loader is a singleton problem.** The modern API loads via `google.maps.importLibrary()`; two callers each bootstrapping is a documented source of conflicts and duplicate loads.
- **React 19 StrictMode double-invoke is the bug class session 130 just paid for** (a liveness ref that survived a mount). Same shape here, with a **billed** side effect instead of a silently dead hook.
- **The per-second re-render makes lifecycle correctness load-bearing.** `<Map>`/`<AdvancedMarker>` hold the imperative instances outside the render path and diff props; the failure mode of a hand-roll is a map that flickers or re-bills once a second.
- **It resolves the `createPortal` tension rather than fighting it.** React content in a marker needs a portal, and `createPortal` is lint-blocked here because a bespoke portal escapes the back stack (ADR-0090). vis.gl does that portal internally, so we neither hand-roll an overlay nor add a file to an allowlist for something that is not an overlay. (§6 keeps the pin markup ours regardless.)

### 4. One map instance per tab visit; never re-instantiate on a toggle, a filter, or the clock

**Dynamic Maps bills per map instantiation** — every `new google.maps.Map()` is a billable load. So the cost question is not "how many tiles" but "how many times do we construct a map".

The arithmetic, so the design is not contorted around a non-problem: 10,000 free loads/month is ~333/day across the whole app; five people (ADR-0065) each opening the tab 20×/day is ~100. We are an order of magnitude inside the free tier, and the per-SKU daily quota (ADR-0108 §6) bounds abuse regardless.

**One instantiation per tab visit is accepted and not optimised further.** It is also not really a choice: `AppShell` keys `<main>` by tab, so the Map screen unmounts on every tab change. What is **forbidden** is re-instantiating for anything that is not a fresh visit — not on the `רשימה / מפה` toggle (which resizes one live map), not on a filter/scope/near-me/sheet drag, not on the clock tick, and **not created at all while the user is on the list half** (or offline, or without config).

### 5. The shell: a full-bleed tab, a map pane, and a three-height list sheet that is view state

> **Amended 2026-07-27 by [ADR-0122](0122-map-split-controls-over-the-canvas.md)** (mockup: [`mockups/map-split-v2.html`](../../mockups/map-split-v2.html); **built session 141**), after the owner used the shipped tab on a phone: the map and the list were both too small, the drag was unpleasant, and the filter chrome was cluttered. Measured against the real layout tree, **370 of 844 phone pixels are spent before either half gets one**, 94 of them this tab's two fixed rows — so the filter row + sort strip **stop being the split's fixed header** and become one decluttered row floating **over the canvas** (the split is then the whole body; pins are kept clear of the row by the fit's inset, not by layout). **`peek` is retired outright** — 116px showed 0.8 of a row, and sizing it to show one would have spent 97px of map on a row nobody asked for — so the map extreme becomes the sheet's own top row and nothing of the list (517px of map, against 358 shipped) and a tapped pin surfaces its place as a card on the canvas instead (§8's note below); `full` stops below the controls, and `half` keeps 0.56, which the measurement exonerates. The drag target widens to the whole `.wp-snapsheet-top` with a slop threshold and a velocity term, the toggle gains a thumb that shows the third stop, the geolocation pre-prompt moves out of the list's scroll region onto the canvas, and **a pin tap stops moving the sheet at all** (§8's note below). Both constraints below survive verbatim: `--sheet-h` is still written from the snapped stop, and nothing re-creates the map. Read §5 with that amendment; the reasoning it rests on is unchanged.

ADR-0109 §10 fixed the vision (map pane over a draggable list sheet, a `רשימה / מפה` toggle). Made concrete:

**The tab opts out of the scrolling body.** Per Context, `.map-screen` has no layout and `.body` scrolls with padding. `AppShell` gains a body modifier (`fullBleed`/`bodyClassName` → `.body.is-fullbleed { overflow: hidden; padding: 0 }`) — the layout layer is where this belongs (ADR-0078), and any future full-bleed surface reuses it. Knock-ons: the filter row + sort strip become the split's **fixed header** (only the sheet's list scrolls), and the sheet must clear the tab bar and safe area (`.nav` + `--safe-bottom`), since the 92px of body padding that used to do that is gone.

**The map div is sized to the _visible_ area, not full-bleed behind the sheet.** The Maps JS API renders Google's logo and attribution at the bottom-left **of the map div**, and Google's terms require they not be obscured (ADR-0106 §B) — a peeking sheet over an `inset:0` pane would hide the one element we are contractually obliged to show. Sizing to the visible area also makes §7's fit-to-bounds honest, since fitting bounds to a div half-hidden behind the list centres pins under it. Cost: a resize triggers relayout, so the pane resizes **on snap, not per drag frame**.

**Three snap heights, one axis:** **peek** (handle + a row or two over a full-height map), **half** (the default in both modes), **full** (today's list, map hidden behind it but still one live instance). The `רשימה / מפה` toggle is a shortcut to the two extremes of the same axis the handle drags — one state, two controls, so they cannot disagree. At half neither extreme is active, which is the honest rendering.

**The sheet always peeks**, which is not decoration: the list is the only view that works offline and the only one that can hold a **coordless** place. _(Amended 2026-07-27 by [ADR-0122](0122-map-split-controls-over-the-canvas.md) §3/§7: what always remains is the sheet's own **top row** — the handle, the sort chip and the view toggle — and no list rows at the map extreme. The reason above survives intact, because it needs the list to be **reachable**, not to be showing a row: 116px of peek showed 0.8 of a row, and buying a whole one would have cost the map 97px permanently.)_ (That also retires ADR-0109 §3's "hollow dashed ring" coordless pin as unbuildable — a place with no coordinates has no position to pin.)

**It is not an overlay, so it does not register with the back stack.** It renders inline, the map behind it stays interactive, nothing dismisses it — so neither `Modal` nor `useOverlay`, the same reading ADR-0109's session-105 amendment applied to the geolocation pre-prompt. **Back leaves the tab** at any height, and the height is view state like the `allDays` chip beside it; registering it would make back mean "shrink the list" on exactly one tab (ADR-0103's typed-layer model exists to keep back predictable). The height **persists for the session per tab visit**, not to storage.

**The drag handle owns the vertical gesture.** It is a snap gesture, not a drop-target one, so it is not the shelf's mechanism with a new payload (ADR-0116 sessions 116–125). At build time, check whether the shelf's pointer-capture helper extracts cleanly into a shared hook and generalize if the extraction is small; if it would mean a substantial refactor of the shelf's drag, **ask first** rather than silently taking it on (CLAUDE.md rule 8's escape hatch), and otherwise write the small dedicated hook.

### 6. The pins: our markup, four populations, order as numbers

**One source of truth.** The map renders the **same filtered, scoped set** the list does — `buildPlaceUsageIndex` + `matchesPlaceFilter` + the block/comparator vocabulary, untouched. A chip that changes the list changes the pins in the same pass, so the two halves cannot disagree; this is the property the whole list-first investment was for (ADR-0110 §2).

**Only coord-bearing places pin.** A coordless Place-lite stays a list row with its `＋ מיקום` action.

**Marker content is our DOM, not `PinElement`.** Google's pin gives background/border/glyph — enough for a solid category teardrop, not enough for the commitment grammar ADR-0109 §3 specifies. So the marker's `content` carries the same `--cat-*` tokens and class grammar as the list badge, making badge and teardrop one visual system by construction rather than by discipline. The markup is static per place — no React state inside a marker.

**Four populations, one prominence ladder, no new colour.** The list separates past/upcoming/idea by _partitioning into blocks_ with headers; a map puts every pin on one plane, so the distinction lives on the pin. And a map surfaces a population the list never had to: **a place that fails the day filter but sits inside the viewport** — hiding the café you are standing next to because it is pencilled for Thursday is the inverse of what this tab is for.

| Population                            | Pin                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| **The next stop** (Trip, exactly one) | Full category pin + the single amber cue + number                                 |
| **Upcoming**                          | Full category pin, solid, **numbered**                                            |
| **Idea / maybe**                      | Dashed, lightened, **unnumbered**                                                 |
| **Behind you** (done / skipped)       | Desaturated + reduced opacity, **keeps its number**                               |
| **Not in this day, but in view**      | A hollow **ghost**: category-hued outline, no fill, no glyph, smaller, unnumbered |

Category keeps the hue (ADR-0038 §2), amber keeps time, teal keeps location affordances — ADR-0028's budget is untouched.

**The ghost tier**, four properties: it exists **only in day scope** (the only scope that excludes anything — the same condition the connector carries, §10); it covers "another day" **and** "no day at all" (the `ללא יום` block); it is **tappable, not optionally** — its row is not in the sheet, so the tap is how you learn what it is, surfacing that single row labelled with its day via `relativeDayLabel` (ADR-0085), reusing the row rather than inventing an info window; and it never enters near-me's sort or distance chips.

> **Amended 2026-07-28 ([ADR-0130](0130-a-maybe-is-not-a-past-place.md)): the second of those four is withdrawn — "another day" and "no day at all" are DIFFERENT claims.** A place no day has claimed is not busy elsewhere, which is exactly what leaves it available today, and drawing it hollow said the opposite. So the ladder has a **sixth rung**: a shelf maybe with no day is a `shelf` pin — the **maybe's own paint** (dashed, hatched, filled, its glyph) at the subordinate **size** — while `ghost` narrows to "pencilled for another day" and is otherwise unchanged. The other three properties hold for **both** rungs, which is what `isAsidePin` names: neither is in the sheet, neither carries the amber cue, neither pulls the camera, both surface their row on a tap. And the two are prioritised against each other by size, z-order and the dot tier, because a trip carries **tens** of general maybes against a **handful** earmarked for today. **The behind-you row of the table above is also now Trip-mode only** (ADR-0130 §1): in Plan mode a day is a shape to arrange and nothing on it has passed.

**Ghosts render pins no chip counts, and that asymmetry is deliberate.** ADR-0119 forbids a chip **promising rows the list will not render**; ghosts are the inverse, since chips count the _scoped_ set. That is precisely why a ghost is hollow, glyph-less, unnumbered and smaller — prominence is what keeps it from reading as part of the answer the chips describe. A count that overstates is a bug; a subordinate pin no count claims is paid for in prominence.

**The order is on the pins, as numbers.** A line between two stops is symmetric and cannot show order (§10). The number is the **index in `comparePlacesBySchedule`'s day sequence** — start instant, then `sortOrder`, untimed after the clocked ones, exactly as `DayView` renders it (ADR-0109's session-106 amendment) — so the map is a third rendering of one derivation. Consequences:

- **A pin with no position in the schedule gets no number** (an unconsumed idea; a strictly-middle ambient stay night, ADR-0054). So **numbered-vs-unnumbered is itself the plan/idea distinction**.
- **The number is chronological, not the list's row order.** A visited stop keeps its `1` though the ahead/behind partition sinks it: the partition changes prominence, never the number.
- **A filter must not renumber**, or the number stops meaning a position in the day. It is computed over the day's whole scheduled set — which the existing architecture already makes the easy path, since `listRows` sorts **all** usages and applies visibility as a _predicate_ (session 130's reveal model). **Gaps are correct and informative**: `1, 3, 4` says something is filtered out.
- **Near-me must not renumber either.** `listOrder` becomes a distance sort when near-me is on; the number derives from `comparePlacesBySchedule` specifically.
- **The 🔒 comes off the pin.** ADR-0109 §3 gave a hard commitment a lock _and_ a solid fill; the number needs that corner and solid-vs-dashed already says committed-vs-idea. The row keeps its lock.

_Amended 2026-07-28 (session 146, report #16): **the number exists in day scope only.** "The index in the day's sequence" was implemented as "the index in whatever scope is on", so all-days handed `comparePlacesBySchedule` no `onDate` and it sequenced the **whole trip** — a pin read `27`, an index into a day that is not on screen. `buildPinOrderIndex` now returns an empty map without an `onDate`, so **both halves lose it together** (they read the one map, which is §6's own property). Renumbering `1..n` per day was rejected for breaking this section's other rule: two pins both reading `1` on one canvas, with nothing on either saying which day it belongs to. It is not a loss — an all-days row already states its day in words (`relativeDayLabel`, ADR-0085/session 136) exactly where the number was ambiguous, and the day-scoped number is untouched. Two consequences, both benign: `pinZIndex`'s `ORDER_SPREAD` nudge goes inert in all-days (it only ever ordered **within** `upcoming`, and the tier z-order still holds), and `.map-badge[data-order]` / `.pin-n` simply stop rendering, as they already do for every unnumbered row. **"A tick cannot renumber a pin" is unchanged and now doubly held**: the clock-free signature stays (ADR-0124 §4's load-bearing note about `placeDay` without a clock), and the scope guard makes the all-days branch it protected unreachable._

**The amber next-stop cue is an outline _on_ the pin, not a ring _around_ it.** Exactly one pin ever carries it, Trip mode only (ADR-0109 §6 / its session-104 promise that "the ring moves onto the pin"). A `box-shadow` spread follows `border-radius`, so it traces the teardrop's own silhouette, tip included, and the pin looks outlined rather than circled. It reuses `.place.nextstop`'s **22% glow verbatim**; its **edge is solid** where the row's is 34%, because a 34% amber hairline holds up on a white card and disappears over a map base. Selection stays a separate `outline` so the two compose — a pin can be both the next stop and the one you just tapped.

_Amended 2026-07-27 (session 138): the canvas gained a **second** amber cue — `עכשיו`, the place you are at right now — so "exactly one pin ever carries it" becomes **exactly one of each**. They cannot collide on a pin (`eventPhase` reads `now` or `upcoming`, never both), both are amber because both are time (ADR-0028), and they are told apart by **motion**: the now-pin pulses (Home's `wp-board-pulse` blip, reused verbatim), the next-pin stays still. See [ADR-0109](0109-map-tab-design.md)'s amendment of the same date._

**Density, not count, is the legibility problem.** Below a legibility threshold **a pin degrades to a dot** — hue kept, number and glyph dropped, since a 9px numeral is noise. Nothing hidden, nothing invented, no dependency. **Coincident pins** (a station that is one leg's origin and another's destination; a hotel and its restaurant) get a **stated z-order**: next stop, then ahead by day order, then ideas, then ambient, then behind, then ghosts — the one that matters most is the one you can see and tap.

**Clustering is not adopted**, and the reason matters because the first one was wrong: it is _not_ that "a trip holds tens of places, not thousands" (that conflates total count with on-screen density — eight places in one district are unreadable at city zoom whatever the total). What actually mitigates density is the **default day scope**, three to six stops. Clustering stays out because **a cluster bubble cannot carry the pin grammar**: it spans categories so it can take no hue, spans tiers so it is neither solid nor dashed, and has no position in the day so it can take no number. It would be the only object on the canvas outside the system, plus a dependency. **Revisit trigger:** a real trip where all-days scope is routinely unreadable at the fitted zoom.

**Markers survive the per-second re-render.** `Map.tsx` memoizes its derivations, but the _ordering_ depends on `nowMs`, so the sorted array's identity changes every second. Markers are keyed by `placeId` and take only primitive props (hue, number, tier, selected), so a clock tick reconciles to a no-op diff — the marker-level restatement of §4.

### 7. The camera: zoom follows extent, and it moves only when it owes you something

**Fit the bounds of the filtered set, animated**, whenever that set changes (day ↔ all-days, a type chip, `אולי`, `מה נשאר`, near-me). This is the map's version of ADR-0120's "every list change moves": a chip that silently leaves half its results off-canvas is the jump session 130 removed from the list.

**Zoom follows the set's _extent_, not its count** — three pins on one block and three across a country want completely different zoom, which is why "how many pins" is the wrong question. `fitBounds` is the right primitive; its degenerate shapes are not:

| Set                              | Unguarded behaviour                                           | Decision                                                                |
| -------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **One pin**                      | Zero-area bounds → snaps to **maximum** zoom (building level) | Centre at a fixed neighbourhood zoom. Never `fitBounds` a single point. |
| **Several near-coincident pins** | The same failure, milder                                      | One shared **`maxZoom` cap** covers both, not a second special case.    |
| **A multi-city trip, all-days**  | Zooms to country level                                        | Allowed — that _is_ the extent. Legibility there is §6's dot tier.      |
| **No pins**                      | Undefined bounds                                              | Leave the camera alone; the empty state speaks.                         |

**The fit insets by the visible area (§5) plus a pin's own height** — the teardrop's tip is the anchor, so its body and any tag extend _above_ the coordinate; without that the topmost pin of a fitted set draws half off-canvas, the exact failure the fit prevents.

**Re-fit only when the new set does not already fit the current view.** The promise is that a chip never leaves results off-canvas; if they are all on screen, moving is gratuitous. A bounds-containment check keeps the guarantee and removes the "tap `אוכל`, map lurches across the city" case.

_Amended 2026-07-27 (session 139) — **containment alone was the wrong test.** "On screen" and "framed" are not the same thing, and conflating them made a wide view permanent: once the camera is out (a day whose places are hours apart, or a bad first fit), **every** later, tighter set is contained by it, so nothing is ever owed and no control can pull the frame back in. A category chip, `אולי`, `מה נשאר`, and picking another day all hit it; narrowing to a single pin hit it too, since the containment test ran before the coincident-point branch. The guard is now two tests: contained **and** filling at least `MAP_REFIT_FILL_SHARE` of the view on at least one axis. `||` across the axes, because dwarfed means small in **both** — a row of stops down one street fills the width and almost none of the height, and re-fitting that is the lurch this guard exists to prevent. Two consequences worth stating: a zero-area extent fills nothing, so a single pin now always re-frames; and because a tight view makes every ratio larger, "a manual zoom wins until the next scope change" survives, most strongly exactly where someone has deliberately gone in close. This also removes at its root the second of the two hazards session 134 diagnosed — the opening framing still passes no view, but it is no longer the only thing standing between a bad first fit and a camera stuck at it. **The share needs a device pass**: "too small to read" is a legibility call, and it is the same tuning cluster as the `MAP_ZOOM` ladder Phase 3 owns._

**A manual pan or zoom wins until the next scope change.** Someone exploring has taken over the camera; re-fitting under their fingers on the next clock tick is a list that re-sorts while you read it.

**Focus pans, it does not zoom.** Selecting a place centres at the current zoom — zooming on selection throws away the context you were reading. Only an explicit control (re-centre, a scope change) changes zoom.

**The "me" dot** appears when near-me is granted — an OS-map convention outside the colour budget (ADR-0109 §3). Near-me's existing behaviour is unchanged; the dot is the spatial addition ADR-0109 §7 always said Phase 6 would add for free.

### 8. Tapping a place: it selects, and selection never leaves the app

**The verb is _select_; focusing is what selection does when the place has coordinates.** That distinction is load-bearing (see the coordless case below).

- **Row tap = select + focus.** It selects the row and its pin — one selection — and centres the camera. No new window, no hand-off.
- **`נווט` stays the row's one Google button** (directions, a deep-link forever per ADR-0106 §F). It already _is_ a button, which is what "going to Google needs a button" asks for; `stopPropagation` keeps it from also selecting.
- **"View on Google Maps" is retired from the Map-tab row, not relocated.** ADR-0109's 2026-07-24 amendment said the row tap deep-linked out "**because we have no map surface yet**"; Phase 6 ends that. With our own map on screen a second Google destination competes with the thing it was standing in for. It survives only in **ADR-0115's research results**, where a prediction has no coordinates and there is nothing of ours to focus — so `mapsPlaceUrl` keeps a narrowed job and drops its `TODO(phase-3)`. _(This revises ADR-0109 §1's "viewing the place is the row tap (opens … Google Maps place)": the tap survives, its destination becomes ours.)_
  - **Narrowly revised 2026-08-04 by [ADR-0166 §13](0166-place-enrichment-is-a-multi-source-pipe.md) — the ROW is untouched; a Google link returns on the place DETAIL surface.** This bullet's argument holds exactly where it was aimed: the row still carries one Google exit (`נווט`), and our map still answers _where is it_. What changed is that a question this bullet never considered now has no other answer. [ADR-0166 §11.3](0166-place-enrichment-is-a-multi-source-pipe.md) measured open-licensed enrichment at **0 of 7 for Tokyo restaurants** — no image, no summary, nothing — and §13 rejected filling that from Google's API on cost and caching-terms grounds. So the deep link comes back as the answer to **_what does Google know about this place_** (hours, photos, reviews, phone), which is a different question from _where is it_, sits beside the enrichment it supplements rather than competing with the map, and costs nothing. `mapsSearchUrl` widens its job; no second builder.
- **The same swap elsewhere.** `EventCard` and `BookingDetail` keep their labelled `ניווט · מפה` pair (they have no tap-to-view), but `מפה` now routes to the Map tab focused on that place.
- **A row tap while the sheet is at full height drops it to half** — focusing a map you cannot see is useless, and this is the interaction the three-height axis exists for.
- **A coordless row still selects.** It is still _referenced_, so it still needs the way in below; only the camera half is missing. Under "tap = focus" it would have had to be untappable, stranding the row whose place data is weakest from the event that explains it.
- **Offline the tap does nothing** and the row keeps `נווט`; the map is absent and nothing pretends otherwise (§11).

**Selection reveals the way through to the entity.** A `Place` holds name/address/coords/timezone/rating; the confirmation code, notes, documents and real times live on the **reference**, which is also the only reason the place is in the trip (ADR-0112). **The pointer already exists** — `DayUsage.eventId` + `edge`, added in session 108 so the row could say _what happens here_.

- Revealed by selection rather than sitting on every row (the row is already badge · name · meta · distance · `נווט`, and only one row is selected at a time).
- **Labelled in the reference's own words** — `הזמנה · רכבת לקיוטו · יציאה`, reusing `eventEdgeTransition`/`shortTitleText`. A control that names its destination is worth more than a generic "details", and that is what earns it a row.
- **One entry per in-scope reference**, the moment's owner leading. Union semantics (ADR-0109 §4) already made multiple references normal; this is the first surface that lets you act on it.
- **Full-width, ≥40px** — a real touch target (ADR-0017), which is why the meta line's own 11.5px text is _not_ the link.
- **Targets:** a booking → `BookingDetail` (ADR-0053, a `Modal` sheet so back closes it); an event → the Day view for its date, focused; an idea → the shelf.

> **Amended 2026-08-05 — the block is one entry per reference and it FOLDS, and the bullets above needed one word of enforcement they never had.** From a single owner screenshot of Ben Gurion at all-days: _"too much lines when there's multiple bookings/events"_ and _"long titles push outside the border … it pushes even for lines that aren't too long"_.
>
> **1. "One entry per in-scope reference" was being read as one entry per _destination_.** A booking-linked reference drew **two** rows — `הזמנה · X` and `אירוע · X` — carrying the **identical** label and told apart only by the leading word. On a hub place that is arithmetic: three legs at Ben Gurion rendered as six rows, sitting between the notes and the row's primary action, and half of them were a copy of the other half. The bullet's own wording is the fix. **One entry, going to whatever HOLDS the reference's detail:** the booking when there is one (the code, the documents, the notes), the day otherwise, the shelf for an idea. Nothing the second row could do is lost except leaving the tab — the event's clock is now on the entry's own meta line and its outcome is the settle pair beside it ([ADR-0139](0139-settling-an-event-from-the-map.md) §1). **What IS given up, stated rather than smoothed:** a linked pair no longer offers "go to the day this happens on"; the day strip is one tap away and the booking is the thing you want standing at the place, so the trade is worth naming and not worth a second row.
>
> **2. The entry is two lines, which is what pays for the day.** `.map-t` over `.map-m` at reference scale — what this reference IS, then `kind · day · time`. The kind word used to sit **beside** the label and take width from the one line that truncates: ADR-0139's Consequences measured that label wanting 199px against **146** available, and moving the kind down returns it to **304** at 390 / 274 at 360. The row clears ADR-0017's 44px floor by being two lines rather than by a `min-height` propping up a 40px box, and the block gains the fact an all-days list never had — **which day each reference is on**, named only where the block is not already scoped to one.
>
> **3. It folds at `PLACE_REFS_CAP` (3), and an open question is never folded.** Chronological is the right order to READ a place's history in and the wrong one to choose a survivor by — on an airport the trip's first flight is the least useful row on the last day. So the fold ranks by _open question first, then nearest to now in either direction_, and draws the survivors in the block's own chronological order. A passed day nobody answered is kept **on top of** the cap whatever its rank: it is the one entry the block emphasises (ADR-0139 §2), and a folded question is not asked. `עוד N` names the count rather than saying "more", because the number is what tells you whether it is worth a tap. Folding is a list change, so it is ADR-0120's reveal and not a slice — a folded row is hidden in place.
>
> **4. And the block overflowed the card, on a defect the bullets could not state because it is a layout one.** `.map-refs` is a flex item with `flex-basis: 100%` and no `min-width: 0`, so `min-width: auto` floored it at its min-content — and `.map-ref-label` is `nowrap` inside a `flex: 1` child, which flexbox's intrinsic sizing (§9.9.1) scales by the flex fraction. **So one long label sized the whole block: measured 491px inside a 340px card at 390, at x −126 → 365, with `היינו`/`דילגנו` at −118 → −50** — off the screen edge, on rows whose own label was short, which is exactly the half of the report that reads as impossible. One declaration. Recorded here because the shape recurs: **an ellipsis needs `min-width: 0` on every ancestor between it and the box it must not exceed**, and `.place > .note-sec` / `.map-sum` are the same shape one line away.
>
> **6. And one reference could still be drawn twice — the fix above made that visible rather than causing it** (2026-08-06, from the same owner's next screenshot: two identical `השכרת רכב · החזרת הרכב · 18:00` rows). A route-carrying booking contributes **both** endpoints, and a car hire collected and returned at the airport names the same place in both. `edgeOnDate` resolves the edge from the **date**, and its caller passed the **event's** date rather than the **scope's** — so its `date == null` branch was dead code and both endpoints resolved to `start`, at the same `at`, with keys taken from the endpoint that asked rather than the edge that came out. Two rows saying the identical thing, and the collection missing entirely. Un-scoped the endpoints now keep their own edges (two real moments, each on its own day); day-scoped they legitimately collapse — the airport on the day the car is collected **is** the collection, whichever field named it — so the entry is keyed on the **resolved** edge and the collision is one row instead of two. A same-day round trip through one station is untouched and tested, which is the case that must not collapse.

> **5. The settle slot is sized for the widest state, not the current one** (owner: _"make sure that you save enough space for the דלג as well as the היינו"_). The compact cluster is three widths — 68px unsettled, 76px `היינו` + undo, **84px `דילגנו` + undo** — so unreserved, settling a row reflows the label, and reflows further for a skip than for a done. 86px reserved, slack spent on the label side, so the marks line up down the block in all three states. Geometry is the host's half of ADR-0139's split; the words and hues stay in `SettleControl`.

> **Amended 2026-08-06 — an arrival LANDS, and it lands at `half`.** `מפה` on an event, a booking or a shelf idea hands this tab a place (§8's "Targets"), and the tab framed the camera and set the selection while leaving the LIST wherever it was — so the row it had just selected could sit below the fold with nothing saying it had been brought to you. Not a decision anyone made: the arrival path had grown its own half-copy of `select` and simply missed the scroll that a row tap has had since ADR-0135 §8. It goes through the real one now.
>
> **Which host it opens in was the open question, and it is answered with a measurement rather than a preference** (owner: _"I'm actually not sure if it should open in half mode with the list item scrolled to, or open with the full map and the card open"_). Unobstructed map is `0.44S − 54` at `half` against `S − 136 − card` at the map extreme, so the extreme wins only while the card is under `0.56S − 82` — about **265px on a 620px split**, where the card in the report that opened this session measured **336**. **The card costs more canvas than the sheet does**, and it costs most on exactly the places worth arriving at: the ones carrying the references, the summary and the notes. So `half`, with the row.
>
> Two reasons that are not about pixels, and they matter more if the card is ever trimmed under that threshold: the row is the real object and the card is its **stand-in where a list cannot be shown** ([ADR-0122](0122-map-split-controls-over-the-canvas.md) §7), so arriving at the extreme means deliberately choosing the host that has to synthesise one; and "I picked a place, show me" should not have two behaviours depending on which screen picked it — a **row tap already normalises to `half`, frames and scrolls**, and an arrival is far closer to that than to a pin tap. **The condition that would reopen this is named rather than left implicit:** trim the card under ~265px and the pixel case flips.
>
> **One split the build had to make, and it is the reusable part.** `select`'s `fromRow` was carrying two unrelated jobs: the **treatment** (normalise the sheet, frame, scroll the row into view) and the **provenance** (`openedFromRow`, which decides whether the next tap on that row CLOSES it). An arrival wants the first and must not have the second — a place the app put in front of you has not been tapped yet, so the user's first tap must not be read as their second. `openedFromRow`'s own comment already listed arrivals among the sources that must not be treated as row taps; the flag simply could not express it. Two options now (`fromRow`, `land`), and a test asserts the tap that would have closed the row.

> **Amended 2026-08-06 — a route's two ends are two PLACES, and both derivations forgot it.** Owner, from the device: _"Notice that the landing in Ben Gurion Airport is the first on the list and on the time, yet it appears as still ahead of us, which is untrue"_ — with a map list showing `נמל התעופה בן גוריון · נחיתה 02:00` under `מה שלפנינו` **and** `נמל התעופה של פרנקפורט · נחיתה 02:00` under `מה שמאחורינו`. One flight, drawn as two landings, one of them at the airport it took off from.
>
> **Three defects, from two screenshots, and a fourth found by sweeping for the same shape.**
>
> **1. A route endpoint was getting the WHOLE span.** `spanDays` took the endpoint's edge and then discarded it for a multi-day event, so an overnight FRA → TLV flight put Frankfurt on the arrival day at the arrival's clock under the arrival's word, and Tel Aviv on the departure day as a departure. The dates in between belong to the journey, not to either airport: **you are not at the origin on the day you land.**
>
> **2. A SETTLED reference was holding a place open.** `isDayUsagePast` honours [ADR-0117](0117-map-place-outcome-states.md) §2's "a human outranks the clock" only when EVERY reference on the day is settled, and `until` counted them all — so a day carrying a passed-and-unanswered landing plus an 18:00 car return the traveller had **already ticked off** read as still ahead, on the strength of the tick. Per-reference is where that rule belongs: what a human has closed cannot be what keeps a place in front of you.
>
> **3. The row named the earliest reference while the block was decided by the latest** — **fixed on the owner's call** (_"I want the timings to display only the ones relevant for the day"_). `at`/`edge` point at a day's earliest reference and `until` at its latest; each is right for the question it answers and they misread **together**, so a place that is genuinely still ahead sat under `מה שלפנינו` naming something already behind you. It could not say **why** it was ahead, because the pointer was spent.
>
> So the day now **carries its moments** rather than one collapsed pointer, and the read side — which has the clock, where the derivation deliberately does not — picks: **the next thing that has not happened; once they all have, the last one that did.** A settled reference is never "next", the same rule `until` follows, so the block and the name cannot disagree about whether a tick counts. The pointers themselves are untouched, so **ordering and block placement do not move** — only what the row says.
>
> Two things this deliberately does not do. It does **not** list every timing on the meta line: that line is one tag on a row already carrying badge · name · meta · distance · `נווט`, and selecting the row enumerates every reference in the way-in block with its own day and time — the full list is one tap away rather than crammed into a tag. And it does **not** change `placeDay`, which answers "which day is this place" for the ordering; the choice is made _within_ the day it already picked.
>
> **4. And `placeRefs` had defect 1 too, on the day-scoped path** — found by sweeping for the shape rather than by a report. Scoped to the arrival day, the ORIGIN airport produced a `נחיתה` entry at the landing's clock: a way in to a place you had already left, under the word for the place you arrived at.
>
> **5. And the layover was filed under the day you took off** (found in the same sweep, fixed on the owner's call). `connectionStops` read each leg's event `date` — the day it BEGINS — so an inbound leg landing at 02:00 dated its layover to the previous evening, when you were still at the origin airport. Its own doc already named the right two dates ("arrives on one and leaves on the next"); the code implemented neither for an overnight leg. It reads `routeEndpointDay` now too — the **third** consumer, which is the clearest evidence the rule was worth naming.
>
> **So the rule is named once and shared.** `routeEndpointDay` answers "which day does this endpoint own, and at which end", and both `spanDays` and `placeRefs` read it. That is the point of the fix as much as the two call sites are: **two derivations of the same fact had drifted into the same bug independently**, and a third copy is what naming it prevents. A span whose ends are ONE place — a hotel, a hire collected and returned at the same counter — is untouched and tested: it still owns every night, and the hire still owns both its days.

> **Amended 2026-08-06 — the number is the index of a STOP, not of a place.** Owner, on the row fix above: _"now the rows are correct but the numbering is weird"_ — with their own diagnosis, which was right: _"probably because the same place was there before as a different event (landing I think?)"_.
>
> §6 defined the number as a place's index in the day's sequence, computed from that place's **earliest** moment. That agreed with what the row said only because the row also named the earliest moment. The amendment above changed the row to name the **relevant** reference — and the two came apart, so the screen contradicted itself: an airport whose landing was at 02:00 and whose car is due back at 18:00 read `1 · 18:00` **above** a place reading `2 · 09:00`. Each number was defensible on its own and the pair was unreadable. **A caused defect, not a discovered one**: the row fix is what desynchronised them.
>
> **A day is a sequence of STOPS, and a place you go to twice is two of them.** So the stops are numbered and a place shows the number of the stop its row is naming. The airport becomes `3`; `1` belongs to the landing it already made, and the gap is informative in exactly the way this function's filter gaps already are ("Gaps (1, 3, 4) are correct and informative").
>
> **§6's "a tick can never renumber a pin" is preserved where it matters, and that is the whole design of the fix rather than a happy accident.** The stop list is built and numbered with **no clock**; the clock decides only _which of its own stops_ a twice-visited place displays. So no place that is visited once can ever move — nearly every pin on the canvas — and a twice-visited one changes only its own number, only when its own next visit passes. The screen's memo is keyed on the **minute** rather than the per-second tick, because that is the granularity the question actually has.
>
> **Two alternatives rejected.** Reverting the row to the earliest moment brings back the reported `נחיתה 02:00` under `מה שלפנינו`. Dropping the number entirely from a multi-stop place is honest and cheap, and removes the row↔pin link exactly where the place is busiest.

_Open, deliberately:_ whether a **pin** tap should reveal the same entries on the canvas (an info window) or only via its row. The sheet answer needs no new surface; an info window is the map idiom but a second way of stating a place. Judge it on a real map.

> **Closed 2026-07-27 by [ADR-0122](0122-map-split-controls-over-the-canvas.md) §7 — on the canvas, and as the row.** Judged from the running app, on the owner's report that a pin tap must surface the place without interrupting the interactive map, and their call that the list-sliver peek was not earning its screen. So `peek` is retired (ADR-0122 §3: the map extreme is the sheet's own top row and nothing of the list) and **a tapped pin's place surfaces as a card over the canvas, with nothing moving** — the pane's box is unchanged, so the camera does not shift and the map keeps every pixel. The worry in this note is answered rather than overruled: the card **is** the `.place` row in a second host, not a second way of stating a place — one grammar, two hosts, the way the pin is the list badge in a second form factor (ADR-0109 §3) — it carries the same way-in block, it renders **only where the sheet cannot show the row** (so it never doubles it), and it clears Google's attribution by the attribution's own height (§5's ToS constraint). It also **generalises `.map-ghostrow`**, which already surfaces a tapped pin's row on exactly that condition, so the app ends up with one mechanism fewer rather than one more. Dismissal is the map idiom (a tap on the canvas clears the selection); nothing registers with the back stack. This **revises session 136's pin-tap raise** (the Phase-1 fix for report #4) while keeping its scroll for the stops where the list is showing, and it replaces "the raise mirrors the drop" with the rule that explains both directions: **a tap never takes away the surface it was made on** — so a pin tap moves nothing, and a **row** tap normalises to `half`.

### 9. Two filter additions: `מה נשאר`, and a `באזור` count

> **Amended 2026-07-27 ([ADR-0124](0124-map-filters-scope-facets-and-what-is-left.md) §2): `מה נשאר` is "somewhere you can still go", not "not settled".** The shape below is right — one independent toggle, in the `אולי` idiom, applying to ghosts, joining the count coupling — and every one of those points stands. The **predicate** was wrong: it hid only what a human had settled, and settling is a manual tap that ADR-0027 §1 and ADR-0018 both refuse to automate, so on a real trip almost nothing is settled, the filter hid almost nothing, and the payoff this section promises ("with the settled pins gone the remaining cluster is legible") never arrived. Two things close a place, not one — a human closing it **or the clock** — which is `isDayUsagePast`, already both and already checking `settled` first. So the rule is now: **it hides exactly what the list files under `מה שמאחורינו`**. Consequently the chip's gate is `hasBehind`, not "the trip has something settled" — the old gate never appeared on a trip where nobody taps `היינו`, though there was a morning behind you it would have cleared. Read ADR-0124 for the full model, including how the facets compose.

**The outcome filter (ADR-0117's deferred item) is one toggle, not three chips.** The list already answers "where have we been" (the `מה שמאחורינו` block + per-row `היינו`/`דילגנו`), and a third multi-value facet would multiply the count-coupling surface ADR-0119 exists to repair. The question on the ground is "what's left":

- **One independent `מה נשאר` toggle** in the `אולי` chip's idiom — same shape of control for the same shape of question.
- **It hides everything `settled`**, `done` and `skipped` alike — a predicate over a field ADR-0117 already stores.
- **It applies to ghosts too**: a place visited on Tuesday must not sit on the canvas while you ask what is left.
- **It must join ADR-0119's count coupling.** Its own count is the number of **surviving list rows** given the picked type and `אולי` state, and while it is on the type chips and `אולי` count only unsettled places. Getting this wrong is not cosmetic — it is the exact defect ADR-0119 was written to fix, now with one more axis. (Drawing the mockup caught it: a first pass labelled the chip `4`, the scheduled-unsettled count, where `5` rows survive — the coordless row included.)
- **The chip appears only when the trip has something settled**, reusing the `{hasMaybes && …}` pattern already in `screens/Map.tsx` and ADR-0050's derived-affordance rule. That also makes it a no-op on a trip that has not started, without a mode gate.
- On a map this is the payoff a list cannot give: with the settled pins gone, the remaining cluster is legible.

**A `12 באזור` count makes ADR-0106 §4's claim visible.** That ADR decided there is no "by area" filter because pan/zoom **is** it — sound, and never said on screen, so the decision was invisible. A quiet count read off the camera fixes that, and **no area chip is ever built**:

- **Updated on the map's `idle` event, not during the pan** — a number churning under a moving finger is noise, and per-frame recompute is what §4/§6 forbid.
- **Placed top-inline-end**, opposite the re-centre control and clear of Google's bottom-left attribution (§5).
- **Zero says so:** `אין מקומות באזור`. An empty canvas with no explanation reads as broken rather than panned-away.
- **It counts every pin on the canvas, ghosts included** — not a contradiction of the "ghosts are never counted" rule, because this is a **spatial** readout, not a facet count, and "how many of our places are around here" is exactly what the ghost tier is for. The wording carries it: `באזור` is about the area. Its number and the chip's will legitimately differ (canvas vs. list; the coordless place has no pin) — that is why they are worded differently.
- **The list does _not_ follow the camera.** That would be the true area filter, and it is rejected: a list reshuffling under your thumb as you pan is the same defect as a camera re-centring under your fingers. Pan/zoom filters what you **see**.

### 10. Day connectors are dashed, neutral, and Plan mode only

- **Dashed, because a straight segment is not the route you will walk.** Drawing it solid would claim it is; dashed says "this is the order". It also stays off the colour budget — the connector belongs to the quiet base, not the loud figure (ADR-0106 §C) — which leaves **solid + amber** unspent so a real Routes polyline later reads as different in kind, not better in colour.
- **Day scope only.** Connecting every day's stops is spaghetti that answers nothing; one day means no per-day palette, and the tab's existing scope chip **is** ADR-0106 §E's "day toggle".
- **Plan mode only.** With the order on the pins (§6), the line's one remaining job is revealing the day's **shape** — the zigzag that says "you cross town twice, reorder this" — which is a planning question. In Trip mode you are living the day and need "where is next", so its canvas stays quieter. _(This revises ADR-0106 §E's per-day-colour half and §D's reading of connectors as the order cue.)_
- **It carries no arrowheads:** the numbers are the order, and at phone size an arrowhead on a 2.5px dashed line is mush.
- **The free whole-day deep-link ships with it** — a Google directions URL carrying the day's ordered stops as waypoints, costing nothing.
- **Paid Routes (live ETAs) is not in this phase** (§14).

### 11. Offline, archive, and theme

**Offline the map is absent — not broken, not disabled.** The rendered map is the one part of this tab that was never offline (ADR-0106 §7). So: no map pane, no toggle, no map instance, no billed load — the tab is the list it is today under the existing "last saved" banner. The `מה נשאר` chip stays (pure derivation); the **near-me chip is removed**, already the shipped rule (ADR-0109 §7 — you cannot re-locate). The map half is **absent rather than present-and-dead**, the third application of a rule this tab already runs (near-me offline; ADR-0115's Google research half). A greyed watermarked frame would be a third grammar for one fact.

**In an archived trip the map renders and the live layer drops.** ADR-0040/0044 make a finished trip read-only and the map is a read surface — positions are exactly what you want from a finished trip — but the amber next-stop cue and near-me are meaningless there, the same rule those cues already follow when mode is not live. The billed load is accepted on §4's arithmetic.

**Two cloud styles on the existing theme signal, and the night one is inert readiness.** ADR-0106 §B calls for day/night styles swapped on `data-theme`; dark mode is **not shipped** (`tokens.css:226` states the remap is inert). So mint both Map IDs, read `data-theme`, ship the day style live. The night style exists so enabling dark mode is a token-and-style flip rather than a Maps project task — the posture ADR-0105 took for `BootScreen`. We do **not** build a swap nobody can see and call it tested. The style itself is ADR-0106 §C's brief: desaturated cool-paper base matching `--screen`, POI clutter dropped, no colour flood. Cloud styling costs nothing.

> **Amended 2026-07-28 by [ADR-0125](0125-map-canvas-terrain-vocabulary.md)**, after the style was seen on a real phone and read as **lifeless** — measured, every colour sat in one hue band (210–218) with land, landCover, building, park _and water_ inside 4.4 L\* of each other. Two of this paragraph's three clauses moved. **"Desaturated cool-paper base matching `--screen`"** becomes a **warm** base (one step off `--paper`) against cool water, because _quiet_ means low chroma rather than grey, and the `--screen` adjacency this assumed does not exist under ADR-0122's full-bleed split. **"POI clutter dropped"** keeps the root suppression but re-enables a **sights** set (`landmark`, `entertainment`, `zoo`, `peak`, `natureReserve`) with all commerce still off — a travel map without the Eiffel Tower is not quiet, it is uninformative — and Google's sight pins are held **achromatic** so ours stay the coloured ones. **"No colour flood" survives verbatim** and is now a stated ceiling (ground below chroma 14; pins 27.8–51.8). §11's day/night structure, the inert night style and "cloud styling costs nothing" are untouched.

### 12. Our controls, not Google's; greedy gestures; attribution stays

- **`disableDefaultUI`, then add back only what we need.** Google's controls are Google-chromed, unlabelled and unaware of an RTL page. Zoom is the pinch; the one control we add is **re-centre**, which is also the escape hatch from §7's "a manual pan wins".
- **Re-centre is the conventional round, icon-only crosshair** every map app puts on the canvas. It is a **real SVG** — a new `locate` entry in `ui/Icon.tsx`'s `PATHS`, a one-line addition to the existing registry, the same shape `search`/`settings` took when they replaced raw 🔍/⚙ — never a raw `⌖` glyph ("emoji are content, icons are UI"). **Unlabelled is deliberate and is not the pair ADR-0109 §1 rejected** (two _confusable_ glyphs competing on one row); it carries an `aria-label`. **It re-frames, it never locates:** with a fix in hand it centres on you, without one it fits the filtered set, and it never requests the permission — that stays the near-me chip's reason-first pre-prompt (ADR-0109 §6), the only place allowed to ask.
- **`gestureHandling: 'greedy'`.** The default demands two fingers inside a scrollable page and shows Google's un-styleable "use two fingers" overlay — a phone-first regression (ADR-0017). The pane is fixed, not inline content, so one-finger pan is unambiguous; the sheet handle owns vertical dragging.
- **The Google logo and attribution stay** — required by ToS, designed around rather than fought (see §5 for the layout consequence).

### 13. Structure, motion, and how any of this is tested

- **Decomposition.** `screens/Map.tsx` is 701 lines; a pane, sheet, markers and camera would roughly double it. The canvas + markers become `ui/domain/MapPane`, the sheet a primitive, the camera a hook — mirroring how `DayStrip`/`GlanceCard`/`EventCard` were extracted.
- **Motion respects `prefers-reduced-motion`**, as every motion pass here does (ADR-0098 §4, ADR-0120): the sheet snaps and the camera jumps to the new bounds rather than easing. The camera still **moves** — only the easing is dropped.
- **Testing.** A rendered Google map cannot be exercised in the suite, so the phase's logic lives in **pure functions in `lib/`** — the bounds of a set, the day's order index, a usage's tier, whether a place is focusable — unit-tested with no Google present, exactly as `place-usage.ts`/`distance.ts` are. The shell (snap heights, the toggle, row↔pin selection, the full→half lift) is testable with the pane stubbed. **The render itself cannot be tested**, and that is the honest limit to state rather than paper over — the posture the builder-drag's "real-device pass" backlog item already takes.
- **The backend has nothing to do**, verified so nobody goes looking: no CSP to amend (no `helmet`/CSP exists and `index.html` sets no `http-equiv`; if one is ever added it must allow `maps.googleapis.com`/`maps.gstatic.com`), no Workbox change (no `runtimeCaching` rules exist and Google's script is cross-origin and outside the build graph, so it is neither precached nor intercepted), no schema change, no proxy route, no server env. Phase 6 is frontend-only; the epic's only backend-adjacent work is the deferred Routes proxy (ADR-0108 §4).

### 14. What Phase 6 is not

**Paid Routes / live ETAs** — a second cost envelope, a second proxy route, and now a 10-waypoint ceiling (§1); bundling them would make this phase's approval a cost decision instead of a rendering one. **Transit / traffic layers** — `TransitLayer` draws the transit **network**, not directions; it cannot show A→B at all, so it answers no question this tab asks while fighting "quiet base, loud pins" hardest. Point-to-point transit is the free Maps deep-link or paid Routes. Recorded so "but it's free" does not reopen it on its own: free to draw is not free to read. If it returns, a toggle, off by default, transit only. **An area chip** — pan/zoom _is_ the area filter (§9). **Clustering** (§6). **Offline tiles** (§11). **Member GPS sharing** (ADR-0006). **3D / tilt / altitude.** **A dark map anyone can see** (§11).

## The remaining human gate

Phase 6 cannot be _seen_ without the Google Cloud steps ADR-0106 Phase 0 deferred. `prerequisites-checklist.md` carries the click-path; the four boxes are: enable **Maps JavaScript API**; **create a Map ID** (JavaScript, vector) with a **cloud style** attached (plus a second for night, §11) — _newly mandatory, §1_; mint the **referrer-locked browser key**; set the **Dynamic Maps daily quota cap** and confirm the budget alert covers the new SKU (ADR-0108 §6, a hard gate).

Until the key exists the build can be written and unit-tested but not viewed. `DEMO_MAP_ID` covers local development.

## Consequences

- **Phase 6 has a decided shape and no open pricing question.** Two figures moved (§1); nothing in ADR-0106 §A–F or ADR-0108 §1 needed reopening.
- **The frontend gains its first UI dependency in a long while**, justified in §3 against hand-rolling a billed lifecycle. It lands in the already-lazy `Map` chunk (`App.tsx:58`), so it costs nothing to a session that never opens the tab.
- **The Phase-3 investment carries forward whole** — one derivation, one filter layer, one pin palette, one ordering vocabulary. The list remains the only view offline and the only view of a coordless place.
- **Two long-standing TODOs close:** `mapsPlaceUrl`'s `TODO(phase-3)` gets its in-app target (§8), and ADR-0109 §6's amber next-stop cue reaches the pin it was designed for (§6).
- **Six ADRs are annotated as refined by this one:** ADR-0106 (§4 area readout, §B mapId + attribution-as-layout-constraint, §D waypoint ceiling, §E connector scope), ADR-0108 §4 (Routes tiers + per-instantiation billing), ADR-0109 (§1 row-tap destination, §3 coordless pin retired, §10 shell + the two structural findings), ADR-0117 (its outcome filter scoped as one toggle), ADR-0119 (the ghost tier as its deliberate inverse), ADR-0078 (the full-bleed body modifier).
- **Back navigation is untouched** — the sheet and toggle are view state, deliberately outside ADR-0103's layer model.
- **One new shell capability** (`.body.is-fullbleed`) and **three new build vars** (§2) are the total surface area added outside the Map tab.

## Alternatives considered

- **Replace the list with the map.** Rejected — ADR-0106 Decision 3 built the list to accommodate the map, and the list is the only view that works offline or shows a coordless place.
- **The map as a full-screen overlay pushed from the list** (a back-poppable layer). Rejected: it makes the map a place you visit rather than the tab's default face, and puts pane state in the back stack for no gain.
- **A global map singleton above the router** (~one load per session). Rejected on §4's arithmetic — a detached map holding listeners and stale camera state across a trip switch is a real bug bought with an imaginary saving.
- **`PinElement` for markers.** Rejected: it cannot express the dashed-idea / desaturated-ambient grammar, so map pins would diverge from list badges. Half a pin system is not a pin system.
- **Hand-roll the loader and map lifecycle, no dependency.** Considered seriously (the pin content is static DOM, so the portal is avoidable). Rejected because the remaining part is where a mistake is _billed_ (§3).
- **`@googlemaps/js-api-loader` directly.** Rejected: it solves loading only, leaving the React lifecycle — if we take a dependency, take the one covering the hard part.
- **The Embed-API iframe** (ADR-0106 §A) and **`google-map-react` / older `react-google-maps`.** Rejected: uncustomisable, and unmaintained against the current API.
- **Clustering.** Rejected in §6 — a cluster bubble cannot carry the pin grammar. With a revisit trigger.
- **Arrowheads, time labels, colour/size ramps, or animated "marching ants" for order.** Rejected in favour of numbers: arrowheads are mush at phone size; a time is amber and §6 allows one amber anchor; colour is spent on category and a size ramp is unreadable at 25px; animated dashes are decorative motion that fights reduced-motion.
- **Nothing spatial — let the list own order.** Considered (the Day view _is_ the order surface). Rejected because the sheet is often at peek height, where the list is not readable.
- **Per-day coloured connectors across all days at once** (ADR-0106 §E as written). Rejected: unreadable at trip scale, needs a palette the budget lacks, and day scope already partitions the trip.
- **Solid connectors.** Rejected: a straight line drawn solid claims to be the route.
- **Three outcome chips** instead of one `מה נשאר` toggle. Rejected in §9: the list already answers "where have we been", and a third multi-value facet multiplies ADR-0119's coupling surface.
- **The list following the camera** (a true area filter). Rejected in §9 — it reshuffles under your thumb.
- **A greyed, watermarked map frame when offline.** Rejected: a third grammar for a fact this tab already states two ways.
- **Build the dark map style now and swap it live.** Rejected: dark mode is inert app-wide; a swap nobody can see is untestable.
- **Ship paid Routes ETAs in this phase.** Rejected as sequencing, not direction (§14).

## Build log (2026-07-26, session 133)

The design above is what shipped; §1–§14 needed no reversal. What the build had to
decide, refine or read against the letter, recorded here rather than in a new ADR
because none of it changes a decision this one made.

1. **The settled check needed a fallback, or `מה נשאר` could not reach a ghost.**
   §9 requires the toggle to apply to ghosts — "a place visited on Tuesday must not
   sit on the canvas while you ask what is left" — but a ghost by definition has **no
   day in the scope being asked about**, so a strictly day-scoped `settled` read
   returned "unsettled" and left it pinned. `isPlaceSettled(usage, onDate)` therefore
   falls back to **all** the place's days when it has none on `onDate`. In the list
   that branch is unreachable (the day predicate already hid the row), so this is
   precisely the ghost case and nothing else. Caught by writing the test §9 asks for.
2. **`ghost` wins over the next-stop cue**, not the other way round. Both can be true
   at once: in day scope, once today's stops are settled, `nextDestination` resolves
   to tomorrow's place — which is out of scope. Giving it the single amber outline
   would have it claim a prominence its (absent) row cannot back up, so the tier
   ladder is evaluated ghost-first and the cue is suppressed there.
3. **The next stop and selection are cues, not tiers.** §6's table lists "the next
   stop" as a population, but its row reads "full category pin **+** the amber cue +
   number" — i.e. `upcoming` plus a cue. Modelled that way (`tier` + two independent
   booleans), which is also what makes §6's "selection stays a separate `outline` so
   the two compose" expressible at all.
4. **"View on Google Maps" is retired all the way.** §8 says `mapsPlaceUrl` "keeps a
   narrowed job and drops its `TODO(phase-3)`". Once every surface focuses our own
   map, that narrowed job turns out to be **zero call sites** — the surviving research
   case goes through `mapsPredictionUrl`, which builds its URL from the shared
   `mapsSearchUrl` and never touched `mapsPlaceUrl`. Keeping it (and
   `eventPlaceUrl`/`bookingPlaceUrl`) would be three dead exports, so all three were
   removed with their call sites. `EventCard`/`BookingDetail` now resolve
   `eventMapPlace`/`bookingMapPlace`, which return a **`Place`** rather than a URL —
   the honest shape, since the destination is a tab and a selection.
5. **The shelf's drag does not extract, and §5 predicted why.** `useHoldToDrag`
   deliberately avoids pointer capture and listens on the **window**, because its
   dragged element can unmount mid-gesture (dwelling on the day strip switches the
   day); and it is **hold-gated**, because a shelf card is simultaneously a tap target
   and a piece of a scrolling strip. A drag handle wants none of that — nothing to
   arbitrate, nothing to scroll, and it stays mounted — so `lib/useSnapDrag.ts` is the
   small dedicated hook §5's escape hatch allows, and pointer capture is right there.
   One thing **did** generalize: the jsdom `PointerEvent` shim that test had the only
   copy of now lives in `src/test/pointer-events.ts` and serves both (rule 8).
6. **A leaf must not throw for want of a tab-navigation context.** `useShowPlaceOnMap`
   returns `null` outside the trip shell rather than throwing, so `BookingDetail`
   (rendered from the Index, and from any test harness) drops the `מפה` affordance
   instead of crashing — the same "absent, not broken" rule the map half itself runs.
7. **The map is absent, so the tab is not full-bleed either.** §11 says offline the tab
   "is the list it is today"; the build takes that literally — with no config or no
   connectivity there is no split, no sheet and no `.body.is-fullbleed`, just the
   shipped scrolling list. One shared `mapPaneAvailable()` answers the question for
   both the screen and the shell, so they cannot disagree.
8. **Two token/constant duplications were accepted, each with precedent.**
   `MAP_CONNECTOR.COLOR` restates `--soft-line`'s value because the Maps JS API takes
   a colour, not a CSS variable — the same concession `LIST_MOVE_EASING` already makes
   for the Web Animations API. And `--me` was added to `tokens.css` (light + dark) as
   the OS-map convention blue §7 places outside the colour budget.
9. **"Animated" fit is Google's, and Google has none.** §7 asks for an animated fit.
   `Map.fitBounds` changes zoom and centre without easing and the API offers no
   animated equivalent, so a **fit is a jump** and a **focus pans** (`panTo`, or
   `setCenter` under `prefers-reduced-motion`). Stated rather than papered over.
10. **The render is still unverified**, exactly as §13 said it would be. The suite
    covers the pure functions with no Google present, the pin markup with the binding
    stubbed, and the shell with the pane stubbed — 1,199 tests green. Nothing about how
    the canvas **looks** has been seen; that is the human pass on the backlog line.

11. **§2 named the build vars and never said how they reach the build — which cost a
    deploy.** The vars were on Railway production from session 132 and the map still did
    not render: the frontend is built inside a **Docker stage**, and a Docker build sees
    only what the `Dockerfile` declares as `ARG`, so Vite inlined nothing and the tab
    took §2's graceful-absence path. Exactly right behaviour, indistinguishable from a
    misconfiguration. Fixed by three `ARG` lines (defaulted to empty, so a Maps-less
    build still succeeds) and a **build-log warning** in `vite.config.ts` naming any
    missing var — because a degradation this quiet needs to be loud on the one surface
    that can act on it. `architecture/deployment.md` now states the coupling: **a fourth
    `VITE_` var later means editing the `Dockerfile` too.** Worth generalising past this
    ADR: "it is a build var" is only half the design — where the build gets it is the
    other half.

12. **§7's containment guard swallowed the OPENING framing, and the map opened on the
    whole world** (reported from production, session 134). Two hazards compounded, and
    neither is visible from the ADR alone:
    - `fitBounds` fired from a mount effect can hit a div that has not laid out yet.
      With padding larger than that viewport, Google resolves a degenerate box and
      zooms far **out** — the opposite of a fit.
    - §7's "re-fit only when the new set does not already fit the current view" then
      makes it **permanent**: a wide view contains every pin, so every later framing
      is correctly declined, forever. The guard was written for control changes ("tap
      `אוכל`, the map lurches across the city") and silently also governed the first
      framing, which has no view worth preserving.

    So the opening framing is now a **third case**, distinct from both a re-frame and
    a re-render: it ignores containment, and it waits for the map's own `idle` — the
    first moment the map is genuinely rendered and sized — retrying there until a
    framing actually succeeds. `fitPaddingFor` (pure, tested) drops padding that would
    claim half an axis and refuses outright on an unsized div, so the degenerate fit
    cannot happen at all. The `maxZoom` cap became a clamp applied after the fit
    rather than a map option set and restored around it, which leaves nothing to
    restore if the fit does not settle.

    **The testing note in §13 was too broad, and that is why this shipped.** "A
    rendered Google map cannot be exercised in the suite" is true of the canvas and
    false of the camera: `useMapCamera` touches eight `google.maps.Map` methods, so a
    fake map covers it completely. `lib/useMapCamera.test.tsx` now pins the three-way
    distinction above, and would have caught this. Read §13 as "the **render** cannot
    be tested", never as "anything that touches a map cannot be".

13. **The camera framed the ghost tier, so a two-stop day framed three continents**
    (reported from production right after entry 12 was fixed). §7 says "fit the bounds
    of the **filtered set**" — and the ghost tier is precisely what the filter left
    out. §6 already subordinates ghosts everywhere it matters (no chip counts them,
    they never enter near-me's sort or its distance chips, they are hollow and
    unnumbered "so prominence keeps them from reading as part of the answer the chips
    describe"), but nothing said the camera. Day scope on a trip whose other days sit
    in Rome and Tokyo therefore fitted Europe-to-Asia around two stops in Tel Aviv.

    `isFramedByCamera` (one predicate, in `lib/map-pins.ts`) now states it: the camera
    answers every tier **except** ghost, and the opening centre prefers a day pin over
    a ghost too. Two consequences worth keeping straight, because they look
    contradictory and are not:
    - **Ghosts still draw.** They are why the tier exists — the café you are standing
      next to must be visible even when it is pencilled for Thursday.
    - **The `באזור` readout still counts them** (§9's explicit rule): it is a
      **spatial** question about the area, not the facet question the camera answers.
      One canvas, two honest readings.

    When the day has no pins of its own, the camera falls back to **you** if there is
    a fix, which resolves through the existing single-point path (centre at
    neighbourhood zoom) and needs no new branch; with neither, it is left alone.

    Generalisation for the next tier that gets added: **§6's prominence ladder is not
    only a paint rule.** Anything subordinate on the canvas is probably subordinate to
    the camera, the counts and the sort as well — say which, when the tier is added.

## Revision log (2026-07-26, within the design session)

Recorded so a rejected or reversed call is not re-proposed; each is already folded into §1–§14 above.

1. **The connector was going to ship in both modes and carry the order.** It cannot show order at all (a segment is symmetric), so order moved to numbered pins and the connector became Plan-only (§6, §10).
2. **The next-stop cue was a pill-shaped box around the teardrop.** It read as a circle drawn near a pin — two shapes. Now an outline tracing the pin's silhouette (§6).
3. **The row tap opened Google's place view.** Retired, not relocated; the tap focuses our map and `נווט` is the Google button (§8).
4. **"Tap = focus" was wrong for a coordless place** — still referenced, so it must still select. The verb is _select_ (§8).
5. **`.map-screen` has no layout**, and the mockup had silently supplied one, so the split looked correct against the app's real CSS while being unbuildable. A mockup that reads the app's CSS still does not inherit its layout tree (§5).
6. **A full-bleed pane hid Google's attribution** (ToS). The pane is sized to the visible area, which also made fit-to-bounds honest (§5, §7).
7. **The browser key had two names across docs**, and the mandatory `mapId` had none (§2).
8. **"No clustering" rested on count, not density** — a bad reason for a right decision. Replaced, and density answered by a dot tier (§6).
9. **The `מה נשאר` chip's count was mislabelled** in the mockup (`4` where `5` rows survive), reproducing ADR-0119's bug within minutes of adding a third axis — which is why §9 states the coupling requirement rather than implying it.
10. **Transit layers were considered and dropped** (§14), with the reason recorded so "it's free" does not reopen it.
11. **Still open by decision:** whether proximity promotes a ghost to a full pin (§6), and whether a pin tap opens an info window (§8). Both are judged better on a real rendered map than on paper.

## Amendment (2026-08-04, session 211) — §8's rule reaches the shelf idea, which it had skipped

§8's badge (the 2026-07-28 amendment: _"every event and booking has an easy way to its pin, in both modes"_) is on `EventCard`, `BuilderRow` and `TransitionRow`. It is **not** on `MaybeCard`, whose sheet (`MaybeManageSheet`) offers exactly `שיבוץ ליום` and `הסר`.

That is the wrong entity to have missed. An idea is the thing in this app **most likely to be a place**: every place added from the map outside an errand becomes one (`Map.tsx`'s `landPlace` → `verbs.addMaybe(title, { placeId })`), so the shelf is where map research accumulates. With thirty ideas on it, _"where is this one?"_ is the first question asked and the shelf cannot answer it — while a hotel booking three taps away can.

**So `MaybeCard`'s icon slot becomes a `PlaceBadge`,** on the host's own class exactly as the other three do (`.wp-maybecard-ic` in, no geometry change out). Absent when the idea carries no place or the place has no coordinates — "absent, not broken", the rule the badge already follows. Nothing else about the card, the sheet or the drag changes.

Recorded here rather than in a new ADR because it is this section's rule applied to a host it always implied, which is an omission and not a decision. The **workflow** it is part of — thirty researched places, and slotting them being the slow part — is its own brief; see [backlog](../backlog.md).

**Built 2026-08-04**, with one extension and one measurement.

**The extension: a SKIPPED event's shelf card gets it too.** `MaybeCard` hosts two things — an idea, and a skipped soft event parked on the shelf (ADR-0027 §2) — and the skipped card is an _event_, which §8's original rule ("every event and booking, in both modes") already covered. Its day row is gone from the list while it is parked, so the shelf card is the only surface it has; leaving it inert beside a badged idea would have been the same omission one row over. It goes through `eventShowOnMap`, exactly as its day row did.

**The measurement, because this component's history demands one.** `PlaceBadge`'s own header records what killed its first draft: a separate control in the trailing slot took a title from one line to two at 390px and to five at 360px. "The badge costs nothing because it is already there" is a claim about boxes, so it was measured on the real stylesheets at both widths, in both modes, against an identically-titled card with no place: **same 76px height, same 140px width, same title box (2 lines, 71px), the pin overlapping the title by 0px and the `✕` and note mark by 0px.** Plan's tile is the crowded case — it carries all three marks — and it is the one asserted. The numbers live in `e2e/idea-place-badge.spec.ts` rather than in this doc, because the unit suite cannot fail them: jsdom loads no CSS and reports every rect as zero.

**Three follow-ups off the render, same day, and all three are the same mistake:** the badge's marker was drawn against the 32–40px badge boxes of the three hosts that had it, and this host's glyph slot is inline content (~21×17px) with no box and no radius. So the sizes did not travel — which is this file's own "a shared component lands somewhere new and inherits its DEFAULTS with it", one more time.

1. **The marker was 80% of its host** (owner: _"the icon for the map pin is too large"_), against 42% on `EventCard`. Its size is `--placebadge-mark` now, defaulting to the shipped 17px, with the overhang, the glyph and the halo all derived from it — so a host with a smaller badge re-points one value and the proportions hold.
2. **It became a bare teal pin**, not a pin inside a teal disc (owner). The disc was carrying the teal _and_ lifting the glyph off the badge, and it charged for both in size: a filled circle plus a `--card` ring plus an inset glyph needs ~17px before the pin inside is legible at all. The pin carries the teal itself and is `fill`ed with a stroked halo under it, so the mark is exactly the glyph. Which also answers the "spindly at 11px" note that had put a `stroke-width: 2.4` override on it: a solid silhouette survives at 13px where an outlined teardrop with a 2.2-radius hole does not.
3. **The teal ring had square corners** (owner: _"the corners … are still not rounded"_). It is a `box-shadow`, so it takes the shape of the box it is on, and the other three hosts are rounded squares while this glyph had no radius. A radius on this host only — no padding, because the measurement above says the badge costs the tile nothing and that stays true.

**And one thing the smaller marker surfaced rather than caused:** at 21×17 this badge is far under ADR-0017's floor, on the host that introduced a badge that small (the other three are 32–40px). The tap area now grows out of flow to ~33×29 — the most the card's 10px padding and its 8px gap to the title allow without a tap on the words opening the map, which is asserted. Still short of 44, and recorded as a device-pass item rather than hidden: the honest fix is a bigger badge on this tile, which is a tile redesign and not this amendment's business.
