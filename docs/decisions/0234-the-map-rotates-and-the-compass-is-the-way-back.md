# 0234 — The map already rotates; the compass is the way back, and heading-up is the same control

**Status:** Accepted — designed 2026-09-18 and **built the same day, at the owner's approval of the mockup** (see the build log). §8 and §9 shipped with the design. The rendered compass has not been seen on a real device and nothing below claims otherwise — the device pass at the foot still owns its three questions.
**Date:** 2026-09-18
**Amends** [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) **§1** (the furniture band gains its first third member, which §1 predicted and never measured) and **§8** (its "no semantic colour" clause now has a second control to cover). **Amends** [0186](0186-the-map-is-ours-and-it-works-on-a-plane.md) **§2** in the honest direction: the renderer's rotation was inherited, not chosen, and this is where it gets chosen.
Relates [0017](0017-mobile-first-device-targets.md) (the 44×44 floor), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget), [0109](0109-map-tab-design.md) §6 (the reason-first card is the only thing allowed to ask for **location**), [0121](0121-embedded-map-phase-6-design.md) §12, [0123](0123-map-pin-size-is-a-share-of-the-canvas.md) (why an upright teardrop is load-bearing), [0129](0129-map-camera-moves-like-a-camera.md) §4 (`sameCamera`), [0145](0145-the-canvas-takes-a-one-finger-zoom.md) (the gesture seam this rotation passes through), [0207](0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) §4 (a fix may not claim more than it knows).

Mockup: [`mockups/map-orientation-v1.html`](../../mockups/map-orientation-v1.html) — the real layout tree, the shipped stylesheets, the band measured with two controls and with three at both screens, and the ground actually turning under upright pins.

## Context

The owner asked for an orientation control: _"a button for changing the orientation of the map: like in Google maps, it should be a compass of some sort where there's two modes: the orientation of our current location pin, and a reset to default."_

Reading the code to design it found the request is not the whole story, and the smaller half of it is a defect:

**The map already rotates, and nothing can put it back.** `MapCanvas` constructs the map and switches off exactly three things — `keyboard`, `attributionControl`, and deliberately _not_ `doubleClickZoom`. Everything else is MapLibre's default, and `touchZoomRotate` is a default: a two-finger twist writes `bearing`. `useCanvasGestures` suppresses touch events only while `owned` is true (its own one-finger drag-zoom), so a two-finger gesture reaches the renderer untouched — correctly, since that is also how the pinch survives.

And nothing reads the value back. There is no `bearing` anywhere in `map-camera.ts`, `map-camera-adapter.ts`, `useMapCamera.ts` or `MapPane.tsx`; `focus`, `locate` and `reframe` each move centre and zoom and leave the angle where the finger left it. So one twist on the way to a pinch tilts the trip's map for the rest of the session, with no control, no cue and no way home.

That is an unowned vendor default rather than a missing feature, and it is why the second of the owner's two modes — "a reset to default" — is the more urgent one.

## Decision

### 1. One control, two actions, and the needle is the state

The compass holds three states and two actions:

| State                       | What is true                                        | What a tap does               |
| --------------------------- | --------------------------------------------------- | ----------------------------- |
| **North-up** (`bearing 0`)  | The default. The needle points up.                  | Start following your heading. |
| **Rotated** (`bearing ≠ 0`) | A twist got you here. The needle points north.      | Return to north.              |
| **Following**               | The map tracks the device. The control takes `.on`. | Stop following, at north.     |

**The objection this has to answer is ADR-0126 §1's own**, because that ADR exists precisely because one control held two actions: `recentre` was `if (me) focus(me); else reframe(points)`, and splitting it is a decision this must not quietly undo.

It does not, and the difference is not a technicality. #19's defect was never "two actions on one control" — it was that the **state choosing between them was a permission**, and a permission has no representation on a canvas at all. You could not see which button you were pressing. A bearing is the opposite kind of state: it is drawn, continuously, on the control's own face, in the one language a compass has. A needle pointing up says the tap cannot undo anything because there is nothing to undo. A needle 40° off says the tap brings it back. The accent says the map is following you and the tap stops it. **Nothing is hidden, so nothing is guessed** — which is the condition #19 failed, stated as a condition rather than as a count of actions.

`rotate` goes on the **glyph**, never on the button: a 44px circle with a hairline turning under the finger is a wobble, and a touch target must not rotate. The needle carries the **negative** of the camera's bearing, because a needle points at true north rather than at the top of the screen.

_**Corrected 2026-09-18 (§10): "the negative of the bearing" is the picture, not the value.**
The glyph's `rotate` is transitioned, and CSS interpolates a custom property **numerically** —
so feeding it a bearing wrapped into `[0, 360)` makes north a cliff, and a four-degree turn
across it animates −356°. The property the needle reads is a **continuous** angle that is never
wrapped; it agrees with `−bearing` modulo 360 and is not equal to it._

### 2. It is always in the band, and that is what makes the second mode reachable

The alternative — Google's own — is a compass that exists only while the map is off north. It is the smaller band and it is rejected on one argument: **it deletes the only way into heading-up**, because the control is absent in exactly the state you enter that mode from. Drawn in the mockup under ⟨נוכחות המצפן⟩ so the saving and the cost are visible together.

**Measured, always-present is affordable.** ADR-0126 §1 wrote the rule this obeys — _"furniture on this canvas grows along the inline axis, never the block axis… a third piece of furniture, if one is ever justified, joins this band rather than opening a second one"_ — and never had a third to test it with:

| Screen · stop    | Pane    | Band (2) |  Band (3) | Inline spare | Block-axis cost |
| ---------------- | ------- | -------: | --------: | -----------: | --------------: |
| 390×844 · `half` | 390×233 |     96px | **148px** |        155px |         **0px** |
| 360×640 · `half` | 360×143 |     96px | **148px** |        125px |         **0px** |

The third control costs **52px of an inline axis with 125px still spare at the tightest screen, and 0px of the block axis**. The rule ADR-0126 §1 wrote is the entire reason this control is possible; a vertical stack would have put it through the attribution.

### 3. The ground rotates and nothing else does

Markers in MapLibre are viewport-aligned by default (`rotationAlignment` resolves to `viewport` for a marker), so every teardrop, tag and number stays upright while the ground turns. That costs nothing and needs no code — and it is recorded here because it is the part a reader assumes wrongly. A `pin-tag` reading `היעד הבא` at 40° is not text any more, and ADR-0123's whole size system was measured on an upright teardrop. The furniture does not rotate either: the band is chrome, and chrome belongs to the screen, not to the ground.

**The me-dot is the one deliberate exception.** Its orientation is a fact about the world rather than about the camera, so it is the only marker that draws an angle: a cone on `.map-me`, `rotate`d by the device heading minus the map bearing — so in heading-up it points up the screen, which is what heading-up means. **Absent when no heading is known**, because a cone pointing at a direction we are guessing is a claim the fix cannot back; the same rule ADR-0207 §4 applies to the fix's own age.

### 4. A reset changes the bearing and nothing else

Not the centre, not the zoom. That is the difference between "put the map back" and "move the map", and the second is what every other camera call on this surface already does. A control that quietly re-framed while claiming to straighten would be the same class of surprise as #19.

### 5. No semantic colour, and the `.on` is the tab's own

ADR-0126 §8 already settled that the camera controls are **chrome**: `--card`, `--line`, `--ink`, like the two beside it. Following takes `--idx-accent` — the tab's existing "this control is on" accent, the same three declarations `.map-areacount.on` uses.

**Explicitly not teal.** Teal is location (ADR-0028), and which way the map faces is not a place. This is written down because it is the one call in this ADR a reader would plausibly make the other way.

### 6. `deviceorientation` is a second permission, and it is not the location one

Heading-up needs `DeviceOrientationEvent`, which on iOS requires `requestPermission()` **from a user gesture**. The tap on the compass _is_ that gesture, so nothing new has to be built to raise it, and a refusal leaves the control in reset-only service.

**ADR-0109 §6 and ADR-0121 §12 are untouched**: the reason-first card remains the only thing allowed to ask for **location**. This is a different permission, about the device's orientation rather than its position, it reveals nothing about where anybody is, and it is raised by the tap that wants it. Stating that boundary is the point — the invariant is about location, not about the word "permission".

### 7. What this does not touch

- **Pitch.** `dragRotate` carries a tilt as well, and tilting a map whose pins are DOM teardrops sized as a share of the canvas (ADR-0123) is a separate question with a separate answer. This ADR closes rotation only. Whether tilt should simply be switched off is the obvious follow-up and is deliberately not decided here.
- **The camera's own memory.** Following writes `bearing` at whatever rate the device reports, and the camera on this surface is built around "who moved it last" (`sameCamera`, ADR-0129 §4). Teaching it that a bearing write is ours and not a finger's is the build's problem, not the CSS's, and it is the largest single piece of work behind §1.
- **`MAP_CONTROLS_H`, the fit padding, and the stops.** Unchanged: the band does not grow on the block axis, which is the whole of §2.

### 8. Built in the same change: the canvas's furniture loses to its own pins

The same report: _"z-index issues with the control buttons, they should always be on top, not the map pins and labels."_ Three screenshots show a `צ'ק-אאוט` pin tag printed over both camera buttons and a pin tag over `41 באזור`.

`.map-pane` isolates, and its comment says why: marker z-indexes must not compete with the screen's cards. **It does nothing for the pane's own children**, and every piece of canvas furniture is one — the camera cluster, the area readout and the OSM attribution are siblings of `.map-canvas`, not of the pane. MapLibre's marker container carries no z-index, so a pin's `z-index: 400` (and the me-dot's 1000) escaped into the pane's context and out-painted furniture sitting at `auto`.

**The fix is the same isolation one level in: `.map-canvas` gets `isolation: isolate`.** Numbering the furniture above the marker ceiling was rejected — `lib/map-pins.ts`'s ladder ranks objects **on** the ground against each other and is free to grow, and a furniture z-index would have to be re-checked against `ME_MARKER_Z` every time it gained a rung. Isolating states the actual rule: what is painted **over** the ground is ranked by DOM order among siblings, and the ground's own ladder never reaches it. It also quietly fixes an attribution the ODbL does not let us obscure, which no report had noticed. `styles/map-stacking.contract.test.ts` asserts both isolations.

### 9. Built in the same change: consent is not an offer, so it is not spent by one

The same report: _"the map doesn't always show the current location pin, and sometimes we should click on the current location button."_

`useGeolocation` lives in the Map **screen**, and the screen unmounts on a tab switch (`App.tsx`: `if (tab === 'map') return <MapView />`). So every return to the tab starts with no fix, `status: 'idle'`, and — on any browser with no Permissions API, i.e. Safari — `permission: 'unsupported'`. `locationOffered` lives in the **lifted** `MapScopeProvider` and survives. The on-open ladder opened `if (locationOffered || offline || nearMe) return`, so the second visit refused to show the card (correct) **and refused the silent re-request beside it** (not correct). The dot came back only if you tapped locate: the report, exactly.

**The gate is about the card, and only about the card.** Consent already given is the one case where asking again raises no dialog of any kind, so it is the one case that must not be gated on having asked. `MapScope` gains `locationGranted` — a boolean, never a position; the fix is still never persisted, never lifted out of the screen and never put on the wire (ADR-0006) — written from the only place that knows, the outcome of a request: set on `granted`, cleared on `denied` so a permission revoked in browser settings costs one silent refusal rather than one per visit. `unavailable` writes nothing, because a radio that is off is not an answer about consent (ADR-0126 §6's own distinction).

Reading `geo.permission === 'granted'` alone would have fixed Chrome and left Safari broken, which is where the phones in the report are.

## Alternatives considered

- **A compass that appears only off-north** (Google's). Rejected in §2: it deletes the only entry into heading-up. Drawn rather than described.
- **Heading-up on a repeat tap of the locate button** (also Google's). Rejected as #19's own shape: a mode hidden behind a repeat tap on a control whose glyph says "centre me". That repeat tap is also already spoken for — ADR-0126's §6 table hands it to a zoom step-in (#20).
- **Two separate controls**, one to reset and one to follow. Rejected on measurement: a fourth object in the band, buying width for two states you can never be in at once. One state, one needle.
- **Switching `touchZoomRotate` off entirely** and never having a compass. Genuinely tempting, and rejected for the reason `MapCanvas` already records about `doubleClickZoom`: the option is all-or-nothing over a handler that also carries the pinch. Turning off the twist takes the zoom with it, and there is no public way to reach one and not the other. Rotation is therefore ours to own, not ours to delete.
- **Numbering the canvas furniture above the marker ceiling** (§8). Rejected: it makes every future rung of the pin ladder a change to the furniture's z-indexes.
- **Hoisting `useGeolocation` into `MapScopeProvider`** so the fix survives a tab switch (§9). Rejected for this change: it makes the position outlive the screen, which is a change to what ADR-0006 promises and wants its own decision. Remembering **consent** needs none of that.

## Consequences

- **Touched by the build of §1–§7:** `ui/Icon.tsx` (a `compass` entry in `PATHS` **and** in `FILLED` — a north arrow is a solid mark, like `star` and `flight`), `ui/domain/MapPane.tsx` (the third button, the orientation state, the me-dot's cone), `ui/domain/map-pane.css` (`.map-compass` joining `.map-recenter, .map-frame`'s selector list — the real diff is one selector, not one rule), `lib/map-camera-adapter.ts` + `lib/useMapCamera.ts` (a camera that can finally read and write a bearing), `i18n/he.ts`.
- **Shipped in this change (§8/§9):** `ui/domain/map-pane.css`, `styles/map-stacking.contract.test.ts`, `state/map-scope-state.tsx`, `screens/Map.tsx`, `screens/Map.test.tsx`.
- **A number ADR-0126 believed is no longer true, and the mockup is how that surfaced.** §1's table measured the pane at 360×640 `half` as **160px** with **49px** of canvas clear below the band. Re-measured against today's stylesheets it is **143px** and **30px** — the app's header grew 32px between then and now (207 → 239 at 390), and the split paid for it. Nothing in this ADR depends on it (the compass costs the block axis nothing), but the band is tighter than its own ADR thinks, and a **fourth** object would now be a real question rather than a formality.
- **`map-chrome-v1.html` had been dead in a real browser and nobody could tell.** Its script declares `let chrome = 'new'` at global scope, which collides with the `window.chrome` a real Chrome defines: the whole script throws before its first line and the file is a static picture with working-looking chrome. Playwright's headless **shell** has no `window.chrome`, which is exactly why the render harness reported "no console errors" every time. Renamed to `chromeState` in both files. A sweep of all 176 mockups in a real Chromium found these two and nothing else.
- **Two numbers in §1 and §3 are feel calls, and the mockup hands them over as controls rather than as defaults.** The cone's reach (⟨החרוט⟩: 0.66 · **0.95** · 1.3 of `--pin-base`) and how the needle sweeps back to north (⟨תנועת המחט⟩: מיידית · **t-base** · t-deliberate). The bolded values are this ADR's recommendation and nothing more; the device pass settles them. Neither is a new duration or a new length — the sweep rides an existing token and the cone is a share of the pin base (ADR-0123), because a canvas where every length is a fraction is not the place to introduce a px.
- **The mockup shipped unscrollable and that is worth recording, because the failure is silent by construction.** `tokens.css` declares `html, body { overflow: clip }` (ADR-0200 §1) and every mockup inlines it; `clip` is not a scroll container, so 5.6k px of content sat behind an 844px window — unreachable rather than hidden — with no console error, a complete measurement table, and a full-page screenshot that painted all of it. `references/pitfalls.md` has documented precisely this since 2026-08. Only a person trying to scroll catches it, and one did. Fixed with the canonical block; a sweep of all 176 mockups found no others.
- **`--pin-base` has never been set in the map mockup lineage**, which this file needed because its cone is a share of it. The app writes `clamp(34px, 0.11 * 100cqh, 56px)` from `pinSizeCss()` onto `.map-screen`; **13 of the 21 mockups that draw a `.map-pin` omit it**, so their pins sit at the 34px floor — right by coincidence at `half`, and wrong at the `map` stop, where the app draws 53–56px. Set in this file only (it resolves against the pane's existing size container: 34px at `half`, 53px at `map`); the other twelve are a backlog line, not this change's to sweep.
- **The device pass owns three things, and one of them is the heaviest question here:** whether a needle reads over real tiles in both themes; whether continuously following the device's heading is legible at all on a phone in a moving hand, or whether it reads as a jitter (and therefore at what rate a bearing should be eased); and whether the reset's meaning survives when the map is only 5° off. A faked base cannot settle any of them.

## Build log (2026-09-18)

§1–§7 are what shipped and none of them needed reversing. What the build had to decide or
found out is here rather than in a new ADR, because none of it changes a decision this one
made.

1. **`CameraAt.bearing` is optional, and that is the load-bearing choice.** Almost every
   camera move in this app is a pan or a fit with no opinion about the angle. `undefined`
   means "leave it where it is", so every existing call site stays bearing-blind by
   construction and only the orientation control ever states a number — where a required
   field would have made ~10 call sites state one they do not care about, and the first to
   state it wrongly would silently straighten a map the user had turned. `cameraFrame`
   carries the key through only when it was asked for, and a spec pins that a fit leaves a
   turned map turned.

2. **`sameCamera` gained the angle, and without it the ease would overwrite a twist.** That
   function is how "a finger wins" is enforced (ADR-0121 §7), and a two-finger twist moves
   **only** the bearing — so the check was blind on the one axis nothing had ever read.
   Compared over the short arc, so 359.9999 and 0.0001 are one camera rather than a full
   turn apart.

3. **A real defect the deterministic test caught, and the racy version of that test would
   not have.** `easeTo`'s reduced-motion branch writes a single `moveCamera` to the
   destination — and it shipped without `bearing` in it. For everyone with reduced motion on
   (and for a map that has not rendered yet) the reset turned the **needle** and left the
   ground where it was: the whole of the feature, silently absent, on a path nothing on
   screen would have reported. The first version of the spec used `waitFor` around the 480ms
   ease, which passed by racing it; rewriting it onto the reduced-motion path — a real
   shipped path, not a test shortcut — is what made it fail. Trap-checked both ways.

4. **The two high-frequency values never touch React.** `--map-bearing` and `--me-heading`
   are written to the pane's style on the map's own `rotate` event, in `PinDensity`'s exact
   shape; React sees only `atNorth`, a boolean that flips when the map crosses into or out
   of north, and `setState` bails out on an identical value so a turn costs no renders at
   all. `data-heading` goes on the **pane** rather than on `.map-me`, which keeps `MeMarker`
   free of orientation entirely — no prop, no state, no re-render per sample on the marker
   set whose re-diff is the expensive thing here (ADR-0122 §9's discipline, one control over).

5. **`turnTo` records its own write, and that is not bookkeeping.** Following jumps rather
   than eases, because the device reports a heading many times a second. An unrecorded
   bearing write is indistinguishable from a finger, so without the `wrote` update, following
   the compass while a pin-tap pan was still easing would have cancelled the pan on its first
   heading sample. It deliberately does not cancel a running ease: a pan and a turn are about
   different axes and can honestly happen at once.

6. **Two sign traps in the sensor, both of which look like CSS bugs on screen.** iOS reports
   `webkitCompassHeading`, already clockwise from true north; everyone else reports `alpha`
   on `deviceorientationabsolute`, which is **counter**-clockwise, so a heading is
   `360 - alpha` — read the other way the compass turns the wrong way. And smoothing must run
   over the short arc: a plain weighted average of 350° and 10° is 180°, i.e. the needle
   swings through south to cross north. Both are pure functions with their own spec, because
   neither throws.

7. **`normalizeBearing` returned `-0`** for an exact `-360` (`-0 < 0` is false, so a
   `< 0 ? x + 360 : x` branch skips the correction). Harmless in CSS and not harmless in
   `sameCamera`, where `Object.is(-0, 0)` is false and the value decides whether a finger
   moved the map. `((x % 360) + 360) % 360` instead. Found by the spec, not by reading.

8. **The mockup's two feel calls shipped as named constants**, not as literals in a
   `calc()`: `MAP_ORIENT.CONE_SHARE` (0.95 of `--pin-base`) and the needle riding `--t-base`.
   The device pass moves numbers, not code.

9. **What the build did NOT do**, and each is deliberate: nothing about pitch (§7); no change
   to `MAP_CONTROLS_H`, the fit padding or the stops, since the band does not grow on the
   block axis; and no screen-level state at all — the whole feature is pane-local, so
   `screens/Map.tsx` is untouched.

## §10 — The needle unwound the long way across north (2026-09-18, after deploy)

Owner, on the shipped build: _"when the compass rolls over the top and then a little more it
does a full circle instead of just slightly moving to the left/right."_

**The cause is one line, and its shape is worth more than the fix.** Every shortest-arc rule
this feature has — `cameraFrame`'s interpolation, `smoothHeading`'s low-pass, `sameCamera`'s
tolerance — is in code this ADR reasoned about and got right. The needle's rotation is the one
interpolation **CSS** performs, and `.map-compass .icon` carries a `transition`. A custom
property is interpolated **numerically**, so `normalizeBearing`'s wrap into `[0, 360)` hands the
browser a discontinuity at north: 358 → 2 is animated as **−356°**, a full turn of sweep for a
four-degree change of picture.

So the needle reads `--map-needle`, a **continuous** angle advanced by the short arc each
frame — 358 → 362, never 358 → 2. It is deliberately **not** called `--map-bearing` any more:
it agrees with `−bearing` modulo 360 and is not equal to it, and a future reader reaching for
"the bearing" must get the camera's real value rather than 362. Unbounded in principle, which
is fine in practice — 27,000 full turns to reach 1e7, where a double still resolves a
millionth of a degree.

**Two things this says about the method, both of which cost nothing to record:**

- **The normalisation that fixed one class of bug caused another.** `[0, 360)` is exactly what
  makes `sameCamera`'s comparison and `shortestTurn`'s arithmetic well-behaved, and exactly
  what a numeric interpolator must never be given. Both are right; the boundary between them
  is the thing to name, and the property's new name is where it is named.
- **The mockup could not have caught this.** `map-orientation-v1.html` draws three fixed
  orientations — 0°, 40° and 118° — and no step between them crosses north. A file that
  measures a band's geometry is not thereby a file that exercises its motion, and a control
  that steps between discrete values exercises none of the seams between them. Recorded in
  the catalog entry rather than retrofitted into the file.

Asserted by two specs in `MapPane.test.tsx`, and they assert the **step** rather than the
value: no single write may move the needle more than half a turn, which is the defect stated
directly and survives any change to where the accumulation starts.
