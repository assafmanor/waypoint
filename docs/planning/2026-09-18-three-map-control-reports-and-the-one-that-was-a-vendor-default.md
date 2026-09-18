# 2026-09-18 — Three map-control reports, and the one that turned out to be a vendor default

Owner, with three screenshots of the Map tab at `half`:

1. _"Z index issues with the control buttons, they should always be on top, not the map pins and labels"_
2. _"We need to add a button for changing the orientation of the map: like in Google maps, it should be a compass of some sort where there's two modes: the orientation of our current location pin, and a reset to default. I think that we should mockup this first"_
3. _"The map doesn't always show the current location pin, and sometimes we should click on the current location button, please investigate and fix"_

(1) and (3) shipped immediately. (2) was drawn and decided first, as asked, and then built in the same session once the owner approved the mockup.

## What each one actually was

### 1 — the isolation was one level too high

`.map-pane` carries `isolation: isolate` and a comment saying why: MapLibre writes z-indexes on marker wrappers and they must not compete with the screen's cards. It does exactly that job. What nobody had asked is whether the **pane's own children** are safe, and they are not — `.map-camctl`, `.map-areacount` and `.map-attrib` are siblings of `.map-canvas`, sitting at `z-index: auto`, while a pin inside the canvas carries 400 and the me-dot 1000, and MapLibre's marker container has no z-index of its own to contain them. The screenshots are that, precisely.

Numbering the furniture above the marker ceiling was the obvious fix and is the wrong one: `lib/map-pins.ts`'s ladder is a design object that grows (`NEXT_STOP_Z`, `MAP_RESULT_SELECTED_Z`, `DRAFT_MARKER_Z`, `ME_MARKER_Z`), and every new rung would become a change to three furniture z-indexes. Isolating `.map-canvas` states the rule instead: the ladder ranks things **on** the ground, and nothing on the ground outranks what is painted **over** it. It also silently fixed a teardrop that could paint over the OSM attribution, which the ODbL does not permit and which no report had mentioned.

### 2 — the ask was half a feature and half a defect

Reading the camera stack before drawing anything found the part the request does not say. **The map already rotates.** `MapCanvas` switches off three things and `touchZoomRotate` is not one of them; `useCanvasGestures` suppresses touch only while it owns a one-finger drag, so a two-finger gesture reaches the renderer intact — correctly, since that is also how the pinch survives. And `grep -rn bearing` over `map-camera.ts`, `map-camera-adapter.ts`, `useMapCamera.ts` and `MapPane.tsx` returns **nothing**. So a twist on the way to a pinch tilts the trip's map for the rest of the session, with no control, no cue and no way home.

That reordered the design: the owner's "reset to default" is not the second mode, it is the urgent one.

**The fork that was put and answered inside the file rather than handed back.** The hard question is whether one control may hold two actions when [ADR-0126](../decisions/0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) §1 exists because one did — `recentre` was `if (me) focus(me); else reframe(points)`. The answer the ADR argues, and the mockup draws so it can be judged: #19's defect was never the count of actions, it was that the state choosing between them was a **permission**, which has no picture. A bearing has exactly one, it is on the control's own face, and it is never not there. Following that, Google's own split (compass = reset only, heading-up on locate's second tap) is the **rejected** shape, for two reasons the file states: an appears-only-off-north compass deletes the only way into heading-up, and locate's repeat tap is already spoken for by #20's zoom step-in.

### 3 — the gate was spending the wrong thing

`useGeolocation` lives in the Map **screen**; `App.tsx` renders `<MapView />` per tab, so the screen unmounts on every tab switch and comes back with `status: 'idle'` and, on Safari, `permission: 'unsupported'`. `locationOffered` lives in the **lifted** `MapScopeProvider` and survives. The on-open ladder's first line was `if (locationOffered || offline || nearMe) return`, which correctly declined to show the reason-first card a second time and — in the same breath — declined the silent re-request beside it. Hence "sometimes we should click on the current location button": the button was the only thing left that would ask.

The fix is a distinction, not a flag: the once-per-session gate is about the **card**; consent already given raises no dialog and therefore must not be gated on having asked. `MapScope` gains `locationGranted`, a boolean and never a position, written from the outcome of a request (set on `granted`, cleared on `denied`, untouched by `unavailable` — a radio that is off is not an answer about consent).

**Reading `geo.permission === 'granted'` alone would have looked like a fix and shipped broken**, because the Permissions API is exactly what Safari does not have, and the phones in the screenshots are iPhones. Both regression tests were trap-checked against the old condition and both fail under it.

## What the render caught that reading did not

**ADR-0126 §1's own numbers have drifted.** It measured the pane at 360×640 `half` as 160px with 49px of canvas clear below the furniture band. Against today's stylesheets the same frame is **143px and 30px** — the app's header grew 32px since July (207 → 239 at 390) and the split paid for it. Confirmed by regenerating `map-chrome-v1`'s inlined CSS into a scratch copy and measuring both: the stale file gives the old numbers, the fresh one gives mine. Nothing in ADR-0234 depends on it, since a third control in a horizontal band costs the block axis zero — but a **fourth** object there is now a real question, and `map-chrome-v1`'s own catalog entry is quoting numbers the app no longer produces.

**`map-chrome-v1.html` has been dead in a real browser since the day it was written, and the render harness was structurally unable to say so.** Its script opens `let chrome = 'new'` at global scope, which collides with the `window.chrome` that a real Chrome defines: the whole `<script>` throws `Identifier 'chrome' has already been declared` before its first statement, so no stops, no toggles, no measurements — a static picture with chrome that _looks_ like it works. Playwright's headless **shell**, which `scripts/render.mjs` launches, has no `window.chrome`, so every run of it has reported "no console errors" truthfully and uselessly. Renamed to `chromeState` in both files. A sweep of all **176** mockups under a real Chromium binary found these two and nothing else, which is why this is a rename and not a project.

The harness itself is left alone in this change and is on the backlog: launching the full Chromium rather than the headless shell would have caught this in July.

## What the file shipped wrong, and what caught it

The owner opened it and asked one question: _"Did you follow the writing mockups skill? It is not scrollable for example…"_ Three things came out of that, and the first is the one worth generalising.

**It shipped unscrollable, and nothing in the process could have told me.** `tokens.css` declares `html, body { overflow: clip }` (ADR-0200 §1) and every mockup inlines it. `clip` is not a scroll container, so 5.6k px of content sat behind an 844px window — **unreachable** rather than hidden. The root's `scrollHeight` collapses to `clientHeight`, so the obvious check answers "no, it fits"; no console error; the measurement table filled in; and the render script's full-page screenshot painted every section, because Playwright's full-page capture does not scroll. Every signal I looked at said the page was fine.

`references/pitfalls.md` has documented this since 2026-08, twice, with the canonical fix and the three files it was found on. **I did not read it** — the skill says to, immediately after rendering, and I treated rendering as the finish line. That is the actual process failure; the missing CSS block is only its symptom. Fixed, and a sweep of all 176 mockups in a real Chromium found no others still carrying it.

**No control for either feel call.** The skill names this as "the valuable one": a number that cannot be settled in a desktop screenshot becomes a button, the default ships as the recommendation, and the ADR hands the pair to the device pass. This design has two — the cone's reach and how the needle sweeps back to north — and the file shipped with both as silent literals. Both are now ⟨controls⟩. Writing the second surfaced that **`--t-slow` does not exist** (the tokens are `--t-quick`/`--t-base`/`--t-deliberate`): an undefined `var()` makes the declaration invalid, so the button did nothing and reported `0s`, and the faked ground had been riding a hard-coded `320ms` fallback nobody ever chose.

**`--pin-base` has never been set anywhere in this lineage.** The app writes `clamp(34px, 0.11 * 100cqh, 56px)` from `pinSizeCss()` onto `.map-screen` — ADR-0123's "a pin is a share of the canvas" — and **13 of the 21 mockups that draw a `.map-pin` omit it**, so every pin in them falls back to the 34px floor. At `half` that is right by coincidence, since `0.11 × 233` clamps up to the floor anyway; at the `map` stop the app draws 53–56px and no mockup in four months has ever shown it. Set here because this file's cone is a share of it and could not inherit a number that is only accidentally true: measured 34px at `half`, 53px at `map`. The other twelve are a backlog line.

The shape all three share: **each one produced a plausible-looking page, and the checks I ran were the ones that cannot see the failure.** A full-page screenshot cannot see a page you cannot scroll; an undefined custom property reads as a working control; a coincidence at the default stop reads as fidelity.

## The build (same session, after the owner approved the mockup)

Owner: _"Approved, build"_. §1–§7 shipped; the design needed no reversing. Three things the
build found that the design could not have, and the shape they share is worth more than any
of them individually: **each was invisible on screen and silent in the type system.**

**`easeTo`'s reduced-motion branch dropped the bearing.** That branch writes a single
`moveCamera` to the destination, and it shipped without `bearing` in it — so for everyone
with reduced motion on, and for a map that has not rendered yet, the reset turned the
**needle** and left the ground where it was. The whole feature, absent, on a path nothing
reports.

What caught it is the part worth keeping: my first version of that spec wrapped the 480ms
ease in a `waitFor`, and it **passed** — by racing the animation. That is precisely the
defect this same branch had just spent a round on in `ShareItinerarySheet.test.tsx`, written
again by the person who had just written it up. Rewriting the assertion onto the
reduced-motion path — a real shipped path, not a test shortcut — made it deterministic, and
the determinism is what made it fail. Trap-checked both ways.

**`normalizeBearing` returned `-0`.** `-0 < 0` is false, so a `< 0 ? x + 360 : x` branch
skips its own correction for an exact `-360`. Harmless in CSS; not harmless in `sameCamera`,
which compares with `Object.is` and decides from it whether a finger moved the map.

**Two sign traps in the sensor, both of which read as CSS bugs.** iOS reports
`webkitCompassHeading`, clockwise from true north; everyone else reports `alpha`, which is
**counter**-clockwise — so a heading is `360 - alpha`, and read the other way the compass
turns backwards. And smoothing has to cross north the short way: a weighted average of 350°
and 10° is 180°, i.e. the needle swings through south. Both are pure functions with their own
spec, because neither throws and both look like someone's minus sign in a stylesheet.

**What did not need building:** any screen state. The whole feature is pane-local — the
bearing comes from the camera, the heading from the device — so `screens/Map.tsx` is
untouched, no prop changes on a tap (ADR-0122 §9), and the two high-frequency values go to
the DOM as custom properties rather than through React, in `PinDensity`'s own shape. A
bearing in state would have re-rendered the marker set on every frame of a turn.

**Not seen on a device.** The compass has been rendered in the mockup and exercised by
specs; a real magnetometer, a real tilted map and the question of whether following a heading
is legible at all in a moving hand are the device pass's, and ADR-0234 still says so.

## What was deliberately not done

- **Pitch.** `dragRotate` carries a tilt too, and tilting a map whose pins are DOM teardrops sized as a share of the canvas (ADR-0123) is a separate question. ADR-0234 §7 says so and stops there.
- **Hoisting `useGeolocation`** into the provider so the fix itself survives a tab switch. It would also fix (3), and it changes what ADR-0006 promises about where a position lives. Remembering consent needs none of that.
- **Pitch, still.** `dragRotate` carries a tilt as well as a turn, and tilting a canvas whose pins are DOM teardrops sized as a share of it (ADR-0123) is its own question — quite possibly answered by switching it off. ADR-0234 §7 says so and the build did not touch it.
- **Anything at the screen level.** The compass is pane-local by construction, and keeping it that way is what makes it free on a surface that re-renders every second.
