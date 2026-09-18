# 2026-09-18 — Three map-control reports, and the one that turned out to be a vendor default

Owner, with three screenshots of the Map tab at `half`:

1. _"Z index issues with the control buttons, they should always be on top, not the map pins and labels"_
2. _"We need to add a button for changing the orientation of the map: like in Google maps, it should be a compass of some sort where there's two modes: the orientation of our current location pin, and a reset to default. I think that we should mockup this first"_
3. _"The map doesn't always show the current location pin, and sometimes we should click on the current location button, please investigate and fix"_

(1) and (3) shipped. (2) is drawn and decided but **not built**, which is what the owner asked for.

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

## What was deliberately not done

- **Pitch.** `dragRotate` carries a tilt too, and tilting a map whose pins are DOM teardrops sized as a share of the canvas (ADR-0123) is a separate question. ADR-0234 §7 says so and stops there.
- **Hoisting `useGeolocation`** into the provider so the fix itself survives a tab switch. It would also fix (3), and it changes what ADR-0006 promises about where a position lives. Remembering consent needs none of that.
- **Building the compass.** The owner asked to mock it first. `mockups/map-orientation-v1.html` and ADR-0234 §1–§7 are the whole deliverable; the build's largest piece is named in §7 and it is not the CSS — it is teaching `sameCamera` (ADR-0129 §4) that a bearing write can be ours.
