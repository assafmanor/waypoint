# 0146 — The device pass gets an instrument: a dev-only tuning panel, and three of its "numbers" were never numbers

**Status:** Accepted — designed and built 2026-07-30 (session 195). Not a phase of the map panel: the **calibration** the phases have been deferring to since Phase 2.
**Date:** 2026-07-30
**Relates** [0121](0121-embedded-map-phase-6-design.md) §4 (a map instantiation is billed — the constraint that shapes every choice below) / §13 (what is testable on this surface), [0122](0122-map-split-controls-over-the-canvas.md) §9 (`--sheet-h` is written from the snapped stop; nothing re-creates the map) and its "device pass, and what it owns", [0123](0123-map-pin-size-is-a-share-of-the-canvas.md) (the pin's size is already CSS-resolved, so part of this was free — and turned out not to be needed), [0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 (the data-attribute pattern that changes a rendered pin with no marker re-render), [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) / [0130](0130-a-maybe-is-not-a-past-place.md) / [0145](0145-the-canvas-takes-a-one-finger-zoom.md) (the ADRs whose device-pass items this one sorts).
**No mockup, on purpose.** A mockup is a picture of a decision; every item here is a question a picture cannot answer, because the thing being judged is a real Google canvas on a real phone. Drawing one would be the failure mode this ADR exists to end.

## Context

**The device pass has never been run, and every phase since Phase 2 has added to it.** ADR-0122 handed it `half`'s fraction and two drag thresholds, ADR-0121 §7 and ADR-0127 handed it the zoom ladder, session 139 handed it `MAP_REFIT_FILL_SHARE`, ADR-0128 handed it `MAP_CARD_BODY_H`, ADR-0126 handed it three look questions, ADR-0130 two more, ADR-0145 three. The backlog's own instruction is **"do them in one sitting on a phone with a browser key. Tuning them separately is how they drifted apart before."**

That instruction is not followable today. Every one of these lives in `constants.ts`, so answering one is edit → rebuild → redeploy → look, and answering the cluster is that eighteen times with no way to hold two candidates side by side. The gap between the instruction and what the code allows is why the cluster has aged instead of closing.

**And the pass is now the epic's only real blocker.** Phase 13 is closed, Phase 10 is down to §9, so the map panel's remaining feature work is Phase 6(b)+(c) — authoring a place on the canvas, the epic's third authoring surface and the one that **spends per add**. Sessions 193–194 are the argument against building it first: Phase 9 shipped, and within 24 hours a phone found that **two of its models were wrong** — not two numbers, two models. That was the epic's 4th and 5th device correction of something derived and unit-tested (after ADR-0129, session 139's re-fit guard, and ADR-0121's session-134 camera), and in every one **the tests asserted what the code did while the model was wrong.** Calibrate, then build on something that has been seen.

## Decision

### 1. The cluster is three kinds of thing, and only one of them wants a control

This is the half of the deliverable that is not code. The cluster has been called "the numbers" for eight sessions and **it is not one bucket** — which is why an instrument for it kept looking bigger and vaguer than it is.

**(a) Preferences — a live control. Seven of them.** Someone has to feel these and there is no measurement that settles them:

| Tunable                      | Today | Read by                          |
| ---------------------------- | ----- | -------------------------------- |
| `MAP_ZOOM.PLACE`             | 14    | `useMapCamera` (focus, locate)   |
| `MAP_ZOOM.MAX_FIT`           | 15    | `useMapCamera` (the fit's cap)   |
| `MAP_ZOOM.STEP_IN_MAX`       | 17    | `useMapCamera` (locate's ladder) |
| `MAP_ZOOM.DOT_BELOW`         | 11    | `MapPane`'s `PinDensity`         |
| `MAP_REFIT_FILL_SHARE`       | 0.4   | `map-camera.ts` `boundsFillView` |
| `MAP_DRAG_ZOOM.PX_PER_LEVEL` | 120   | `drag-zoom.ts` `zoomPerLevelPx`  |
| `MAP_DRAG_ZOOM.TAP_GAP_MS`   | 500   | `drag-zoom.ts` `reduceDragZoom`  |

**(b) Readings — a readout, not a control. Two of them, and this is the finding.** Both have been on the list as numbers to pick for eight sessions, and neither is a preference:

- **`half`'s fraction (0.56) is read off the gesture the app already has.** The sheet is draggable to any height. The owner drags it to where the canvas reads right, and the panel reports the height as a fraction of the container. A slider would be a second, worse way to do what a thumb already does — and it would have to override `MAP_SHEET_STOPS`, which is the one override that genuinely fights ADR-0122 §9 (see §4). **So §9 is neither bent nor argued with: the question was never a slider's to answer.**
- **`MAP_CARD_BODY_H` (130) is a measurement.** It is a constant only because ADR-0128 §2 forbids a layout read on a screen that re-renders every second — not because 130 is anyone's taste. A dev panel measuring the rendered card **once, on demand** is the exact instrument that was missing, and the answer is "make the constant what the card actually is." Nothing to slide.

The zoom ladder gets a readout too, for the same reason in a weaker form: pinch until a place reads in context and the current zoom **is** `PLACE`. The steppers are then how you confirm the ladder _lands_ there, which is the part a readout cannot show.

**(c) Look questions — the real app on a phone, and no panel at all. Five.** ADR-0126's three (crosshair vs. frame glyph distinct over real tiles; is the 44px band heavy at `half` on 360×640; does the `באזור` pill read as tappable) and ADR-0130's two (does the maybe's hatch read as texture at the 34px floor rather than noise; does the 0.72 aside ratio separate a handful of today's maybes from tens of general ones). Nothing to tune — a control here would invite fiddling with values ADR-0130 §4 already checked in a renderer and the backlog explicitly closed (`MAP_PIN`'s dials are **not** open; session 143 calibrated them). They ride in the panel as a **checklist**, so the sitting records its own answers, and not as sliders.

### 2. ADR-0145's anchoring item is already spent, and comes OFF the list

The backlog and this session's brief both carry it as open — _"does the drag zoom's centre anchoring read correctly, the only one that could reverse a decision rather than move a number"_. **ADR-0145 §3's amendment closed it the same day it was raised**: the owner used both anchors on a phone, the double-tap took the tapped point (Google's own behaviour, restored), and the drag kept the centre as an **affirmed** call — _"drag zoom should be anchored to the center as it was"_. §3 says so in as many words: "this is no longer a deferred question in either direction."

Recorded rather than quietly dropped, because a spent item that stays on a list is how a list stops being believed.

### 3. A constant becomes live at the READER, through one accessor, and prod contains none of it

The crux. `MAP_ZOOM` and friends are `as const` and read at module scope by pure functions — which is exactly what makes `map-camera.ts` / `drag-zoom.ts` / `snap-sheet.ts` testable with no Google in the process (ADR-0121 §13). A mutable override layer over the definitions would be the parallel copy ADR-0094/0095 keep being written to undo.

**Two facts make this smaller than it looks.** Both were checked, not assumed:

- **Every one of the seven is read _inside a function body_, at call time** — in a camera callback, in a `zoom_changed` handler, in a pure function's body. Not one is captured at module init. So a reader that consults an override needs no new prop, no new state, and no re-render to pick up a new value: **the next fit, the next gesture, the next zoom event already re-reads.**
- **`constants.ts` stays the only source of truth.** The override layer holds no defaults — it holds only what the owner has changed, and it is handed the constant at the call site.

So the seam is one function, and the call site names the constant it is shadowing:

```ts
// was: zoom: Math.min(fitted, MAP_ZOOM.MAX_FIT)
zoom: Math.min(fitted, tune(TUNE.zoomMaxFit, MAP_ZOOM.MAX_FIT)),
```

```ts
export function tune(key: DevTunableKey, base: number): number {
  return import.meta.env?.DEV ? (overrides[key] ?? base) : base;
}
```

**How prod containing none of it is guaranteed, rather than intended.** Vite statically replaces `import.meta.env.DEV` with `false` in a production build, so the ternary collapses to `base`, `overrides` becomes unreferenced and is tree-shaken, and the panel — mounted behind `import.meta.env.DEV &&`, the mechanism `App.tsx` already uses for `DevTimeTravel` — drops with everything it imports. That is the reasoning; the **evidence** is a build-output check, run in this session and recorded in §7, that greps `dist/` for the panel's own strings. Stating the mechanism without running the grep is exactly the "reasoned rather than seen" habit this ADR exists to break.

`import.meta.env` is **optional-chained**, which is not defensive style but a recorded cost: `e2e/shelf-drag.spec.ts` imports from `constants.ts` in plain Node, where `import.meta.env` is undefined and a bare read is a `TypeError` that fails the whole suite at collection. `constants.ts` carries that note because it already cost a red CI once.

**Three things deliberately do NOT go through the accessor:**

- **`MapPane`'s `defaultZoom`.** It reads `MAP_ZOOM.PLACE` directly and stays that way: it is a **construction-time** value, so making it live would mean re-instantiating the map, and a re-instantiation is billed (ADR-0121 §4). The call site now says which read is calibratable and which is not — information the bare constant did not carry.
- **`MAP_SHEET_STOPS`.** §1(b): the fraction is a reading. It is also the one value read on **both** sides of the CSS/TS line — `stopHeightCss` writes `--sheet-h` while `stopHeightPx`/`nearestStop` do the drag arithmetic — so a CSS-only override would silently desync the snap targets from the rendered height, and a TS override would hand `SnapSheet` a fresh `stops` object on a screen that ticks every second. Both hazards vanish with the slider.
- **`MAP_PIN`'s dials.** Closed (§1(c)).

### 4. What CSS already resolves was free, and it turned out not to be needed

Worth recording because it is the option this session expected to spend most of its budget on. Pin geometry is already fully CSS-resolved — `map-pane.css` reads `--pin-base`, `--pin-aside-scale`, `--pin-dot-scale` and `--pin-tag-rise`, each with a fallback, and `screens/Map.tsx` writes them from `MAP_PIN` in a `style` object it re-renders anyway. So a live pin dial costs **one `var()` wrapper** and no mechanism at all: write `var(--tune-pin-aside-scale, 0.72)` in dev, set `--tune-…` on `:root` from the panel, and the browser re-resolves with no React, no prop and no marker re-render.

**It is not built, because §1 found nothing that needs it.** Every CSS-resolved value in the cluster is a reading (`half`) or a closed look question (the pin ratios). Building a second mechanism for zero consumers is how a codebase acquires the parallel copies rule 8 exists to prevent — so this is recorded as **available and one line away**, which is the useful state for it to be in, rather than shipped unused.

### 5. What the panel must not do to the map, and how the design makes that structural

The most expensive possible build here is a panel whose state lives above `MapPane` and re-renders it on every drag — and **it would look like it works** while billing a map load per interaction, or at best re-diffing every marker. ADR-0122 §9 is explicit: no new wrapper around `<MapPane>`, no new prop that flips on a tap, no `mapId` change, no remount.

Four choices make that structural rather than a rule to remember:

- **The panel is a sibling, and its state is its own.** It renders inside `.map-split` beside `MapPane`, never around it — the position the file's own comment already reserves for the controls row and the place card — and every value it holds is local `useState`. A sibling's state change re-renders the sibling.
- **The override store is not React state.** It is a plain module object. Nothing above `MapPane` re-renders when a tunable changes, so no prop can change identity, so no marker can re-diff. The map picks the value up on its next act.
- **Steppers, not sliders.** A slider drags — tens of events per gesture — and a slider on a phone cannot reliably land on `0.40`, so the value the owner chooses would not be the value they could report. `− 14 +` emits one discrete change per tap, is precise, is reproducible, and designs the re-render storm out instead of guarding against it.
- **The map probe is `PinDensity`'s shape, not a new one.** Reading the live zoom needs the `google.maps.Map`, which lives inside `MapPane`'s `APIProvider`. So a **stateless, null-rendering** sibling of `PinDensity` — outside `<Map>`, inside `APIProvider`, reaching the instance by id — with `useMap`, one `zoom_changed` listener, and a write to the store. Exactly the arrangement ADR-0128 §1 chose for the dot tier and for the same reason. Holding no state, it cannot re-render anything.
- **One section of the panel is open at a time**, which is the same rule as the badge one level down. All four open measured **430px of an 844px phone** — the entire canvas at the `half` stop — so the instrument was covering the thing it exists to judge. Sectioned, `tune` is 181px (measured in a browser, §7).

### 6. The answer gets out as selectable text, and the clipboard is the bonus

The failure mode is the owner sliding to something good and nobody being able to reproduce it. So the panel emits a block naming each constant, its default and the chosen value, plus the readings (with what was measured) and the look checklist's answers.

**It renders into a `<textarea>` and only then tries the clipboard**, which is the non-obvious part: a phone on the LAN reaches the dev server over `http://192.168.x.x`, which is **not a secure context**, so `navigator.clipboard` is undefined there. A copy button as the only way out would fail silently on the exact device the sitting happens on. Selectable text works everywhere; the clipboard write is attempted and its absence is not an error.

Overrides persist in `sessionStorage`, so an HMR reload mid-sitting does not discard the afternoon.

### 7. The numbers are preferences; the properties are the bugs

The lesson from all five device corrections is that **the tests asserted what the code did while the model was wrong**. Session 194's fix is pinned as a property — no canvas at any size may cost more finger travel per level than the calibrated stop — precisely so a re-tune cannot reintroduce the inverted model.

This ADR takes that one step further, because a tuning panel makes it possible: **the panel's exposed range is itself a testable surface.** The properties are asserted over **every value the panel can produce**, not over today's constants — so the owner cannot slide into a state that violates an invariant and mistake it for a design failure.

The properties, each named for the bug it prevents:

1. **`DOT_BELOW < PLACE`** — otherwise "take me to this place" lands you in a view where every pin is a dot: the camera would deliver you to precision it has just thrown away.
2. **`PLACE ≤ MAX_FIT ≤ STEP_IN_MAX`** — the relationship `constants.ts` says was "preserved rather than re-invented" when both moved a step out. Break it and a fit with real extent behind it is capped **looser** than a no-extent guess.
3. **`0 < REFIT_FILL_SHARE ≤ 1`** — at a share above 1 no set can ever fill the view, so the camera re-fits forever; at 0 the dwarfed guard is off and session 139's bug is back.
4. **No canvas at any size costs more travel per level than the calibrated stop** — session 194's property, re-asserted across the panel's whole `PX_PER_LEVEL` range rather than at 120.
5. **The recogniser stays total** — for every `TAP_GAP_MS` the panel offers, no event sequence yields both a tap and an armed zoom.

### 8. One lint guard is allowlisted for the `dev/` tree, and it is stated rather than routed around

The panels are English and the document is RTL, so mirrored they read backwards — a `− 14 +` stepper column, and worse, the emitted block, which **is** the sitting's deliverable. So the panel's content carries `dir="ltr"`, which ADR-0118 lint-blocks.

`eslint.config.mjs` gains a layered block dropping `BIDI_SELECTORS` for `frontend/src/dev/**` only, with the reasoning in place — the same move the repo already prescribes for the `createPortal` guard ("add the file to the lint allowlist — don't route around it silently"). Everything else still applies there: the clock ban, the glyph ban and the emoji ban all stayed on, and the emoji one caught two glyphs in this panel's first draft. **The positioned box keeps the document's direction**, so `insetInlineEnd` still puts the badge in the corner `DevTimeTravel` has always occupied; only the content inside it is LTR.

## Alternatives considered

- **A mutable `MAP_ZOOM` (`let`, or a proxy over the `as const`).** The parallel source of truth ADR-0094/0095 exist to undo, and it would make the pure functions' inputs invisible at the call site — the readers would look unchanged while meaning something different. The accessor is more typing and says what it does.
- **A URL query string or `.env` values.** Still a reload per candidate, so it does not close the gap the backlog names: no two candidates side by side, and eighteen answers is still eighteen cycles.
- **Sliders.** §5 — unreproducible on a phone and the expensive re-render shape.
- **A second dev affordance beside `DevTimeTravel`.** Rejected under rule 8: they are the same thing (a corner badge that expands, inline styles, dev-gated at the mount), so the shell is **extracted** and both sit on it. Which also fixes something a second badge would have broken: the shell owns the corner geometry, so two badges cannot land on top of each other.
- **Mounting the panel in `App.tsx` beside `DevTimeTravel`.** It would need the map's zoom and the pane's box from two routes away. It lives on the screen it instruments.
- **A slider for `half`'s fraction anyway.** §1(b)/§3 — it is the one override that fights ADR-0122 §9, and the gesture already answers the question better.
- **Leaving the look questions out of the panel entirely.** They need no control, but the sitting needs a record: five judgements made on a phone and reported from memory is how three of them stayed open for eight sessions.

## Consequences

- **The device pass becomes one sitting, and the sitting has an artefact.** Seven steppers, four readouts, five checkboxes and a block of text that says what was chosen.
- **Three items leave the cluster without being tuned:** `half`'s fraction and `MAP_CARD_BODY_H` become readings, and ADR-0145's anchoring was already spent. The count the backlog carries was wrong in both directions — it named a constant session 194 deleted (`SPAN_SHARE`) and it counted an answered question as open.
- **The seam is small and it is visible.** Seven call sites gain `tune(TUNE.x, CONSTANT)`; `constants.ts` is unchanged; the pure functions stay pure in prod by construction, because in prod `tune` **is** the identity.
- **What was never seen is still not seen, and that is this session's honest limit.** The sitting needs a real browser key on a real phone, which no agent session has. The panel is verified headlessly — the seam, the properties, the emit, the prod-emptiness — and **not one of the 12 remaining questions is answered by this ADR.** The instrument is the deliverable; the calibration is the owner's.
- **Touched:** a new `lib/dev-tuning.ts` + test, a new `dev/DevPanel.tsx` (the extracted shell) with `DevTimeTravel` refactored onto it, a new `dev/DevMapTuner.tsx` + test, a new `dev/map-tunables.ts`, a new `dev/DevMapProbe.tsx`, seven read sites across `lib/useMapCamera.ts`, `lib/map-camera.ts`, `lib/drag-zoom.ts` and `ui/domain/MapPane.tsx`, the mount in `screens/Map.tsx`, and one layered block in `eslint.config.mjs` (§8).

## Build log (2026-07-30, session 195)

**The prod-emptiness claim was run, not asserted.** After `pnpm build`, `dist/` contains none of the panel's strings — `map tuning`, `px / level`, `waypoint:dev-tuning`, `time travel`, `hatchIsTexture` are all absent — and `tune` survives as exactly what §3 predicted: a minified identity, `function I(e,t){return t}` (once per chunk). The override object, the `sessionStorage` hydration, the labels, the ranges, the probe and both panels are gone.

**The panel was driven in a real browser, which is as far as headless goes here.** A dev server with placeholder map build vars renders the split (Google's script is aborted, so no canvas), and Playwright at 390×844 confirmed four things a unit test cannot:

- **A stepper tap does not remount the pane.** `.map-pane`'s element handle is identical across two taps — the billed failure, checked as element identity rather than argued from the code.
- **The badges stack and clear the nav**: tuning at y=40, time travel at y=8, nav at y=775.
- **The readouts read the real boxes.** At the `half` stop the pane measured **250px**, so `zoomPerLevelPx` reported **125** px/level in force — i.e. `MAX_SHARE` binds at 130 and not at 120 on the baseline phone, exactly the "binds below ~240px and nowhere above" boundary ADR-0145 §4 states, now measured rather than derived.
- **The `half` readout agrees with the constant it will replace**: sheet 318 of split 569 = **0.559** against the stop's 0.56. The reading instrument is calibrated against a value we already know, which is the only way to trust it on a value we do not.
- Overrides survived a reload with the stepped value intact.

**What the headless drive cannot reach: the live zoom readout.** With Google's script aborted there is no map instance, so `DevMapProbe` publishes nothing and the emit block prints `live zoom at emit: ?`. That readout, and every one of the 12 remaining questions, needs a real browser key on a real phone. **Not one of them is answered here** — this session built the instrument and saw the instrument work; it did not see the map.
