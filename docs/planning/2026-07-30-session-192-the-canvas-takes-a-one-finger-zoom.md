# Session 192 — the canvas takes a one-finger zoom

**Date:** 2026-07-30
**Branch:** `claude/canvas-one-finger-zoom-f7kdfl`
**ADR:** [0145](../decisions/0145-the-canvas-takes-a-one-finger-zoom.md) · **Mockup:** `mockups/map-onefinger-zoom-v1.html`
**Phase:** 9 of the map panel's third pass (#17) — reconfirm → design → build, all three.

## 1. The reconfirmation, which was the point of asking

The phase brief said session 145's finding was **search-level, not a read of the page**, and to reconfirm before designing. It also said that if this turned out to be a flag, that finding was worth the whole session. It is not a flag, and it took three sources to say so honestly:

1. **`@types/google.maps@3.65.3`.** The whole `MapOptions` surface is 45 fields; the only input ones are `gestureHandling`, `disableDoubleClickZoom`, `scrollwheel`, `keyboardShortcuts`, `heading/tiltInteractionEnabled`. No flag.
2. **The live reference**, read on a phone by the owner — `developers.google.com` is blocked by this sandbox's **egress policy** (a `CONNECT` 403 at the proxy, not Google bot-blocking; the proxy README's instruction for that class is to report it rather than route around it). The four `gestureHandling` values are byte-identical to the typings.
3. **The device.** The owner tried the gesture on the shipped tab: nothing happens.
4. **An independent web-access pass**, briefed to _falsify_ the claim rather than confirm it, which came back **CONFIRMED** against v3.65 weekly across the interaction guide, `MapOptions`, `MapElement`/`<gmp-map>`, `Map3DElement` and ~2 years of release notes.

**Three precisions the falsify pass produced, all of which narrow a claim rather than widen it** — worth keeping because each is a way this session could have overstated its case:

- **Google's web docs do contain the words "double-tap and hold … then drag the map"**, in the accessibility/instructional text of embedded live maps (including the cooperative sample). It is not a counter-example — it says _navigate_ and _drag_, never names zooming, and gives no vertical direction — but the honest claim is the narrower one: **Google does not document that sequence as a _zoom_ gesture in the Maps JavaScript API.** Anyone who searches this will hit that string.
- **MapTiler inherits the handler rather than implementing it.** Its SDK extends MapLibre and its handler docs point at MapLibre's source. So it is one library's decision, not two libraries independently arriving at the same one — which is a slightly weaker version of the argument I had been making from it.
- **The issue-tracker check is a non-finding, not a negative.** No feature request and no fixed issue were found, but the tracker's search is sign-in/JS-gated, so the honest strength is "not in the indexed pages". The long-open feature request would have been the single strongest artefact and we do not have it.

**And one finding that closes a design question rather than the reconfirmation:** there is **no documented extension point for Google's gesture recogniser** — no handler interface, no custom-recogniser registration, no way to replace one native gesture while keeping the others, no cancellable low-level touch stream (`preventMapHitsAndGesturesFrom` only suppresses). The brief asked whether the arbitration belongs to "Google's handler, ours, or a capture-phase guard". **The first was never available**, which is why §2 is a forced move rather than a preference. The pass independently described the same implementation shape this session built.

**Worth keeping: source 1 could not have settled this alone**, and reading it as if it could is the trap. A gesture Google already shipped would need no option, so _no flag_ is not _no gesture_ — the typings can only rule out an unshipped one. That is why the device test is the source that closed it, and why the ADR lists all three rather than the tidiest one.

## 2. The brief's expected hard part dissolved, and the real one was unnamed

The brief expected the central problem to be arbitrating against the sheet's drag region, and pointed at five sessions of scars. **Measured, the two never compete:** `.map-pane` is `bottom: var(--sheet-h)` and the sheet begins exactly there, so the drag region is never a canvas pixel. They contend only for the finger _after_ it leaves its origin, which pointer capture already settles on both sides.

**The real competitor was not in the brief: Google's double-click zoom is enabled** (`disableDoubleClickZoom` is unset), and the first two taps of "double-tap then drag" _are_ a double-tap. So the arbitration is against Google's own two handlers, on the same pixel.

**And ADR-0122 §4's precedent does not transfer, which is the finding I would want a future session to have.** "Both listen and the loser bails" is safe there because the sheet's losing drag is tracking a number and rendering nothing. **Google's pan writes the camera on the first move** — so a loser leaves a real pan behind, and ADR-0129 §4's `sameCamera` check would then read it as "a finger did it", which is _correct_ and therefore worse: the stray pan becomes the camera's truth. The competitor being a **writer rather than a tracker** is the whole reason this one is a capture-phase guard.

## 3. The mockup earned its keep twice in one session

Two numbers were derived, drawn, driven by the owner, and **reversed**:

- **Direction.** The design reasoned its way to _up = in_ from a good argument — this screen already says up means more, because dragging up grows the sheet (ADR-0122 §4). A finger overruled it: **down zooms in** — and the verification pass then found Google's Android page documenting exactly that mapping (_slide up → zoom out, slide down → zoom in_), so the feel-call and the reference agree. Recorded rather than quietly flipped, because the sheet-consistency argument is sound enough that someone will make it again.
- **Sensitivity.** 0.18 (≈1/6 of the canvas, roughly Android's feel) → reported too sensitive → 0.30 → **0.5**, over two rounds.

**One confound recorded in both the ADR and §D of the mockup**, because it will matter at the next re-tune: the mockup's canvases are 260px and 214px against ~501px shipped, and the sensitivity is a **share**, so the same constant is twitchier in that file than in the app. 0.5 is ~250px per level on the real canvas — about half its height. §D's table is what to calibrate against, not the feel of the file.

## 4. What the design settled

Full reasoning in the ADR; the four that were open questions in the brief:

- **Anchoring: the canvas centre**, not the tapped point — which is cheaper _and_ more consistent. The tapped point sits under the thumb for the whole drag; holding a pixel fixed needs Google's projection every frame (ADR-0129 §3 already priced that judgement); and ADR-0129 §1 already refused a lateral move bundled into a zoom on this surface. **Point-anchoring stays additive** if the device pass wants it: one more term in the same per-frame write.
- **A manual camera act.** The gesture is a **caller of `useMapCamera`**, not a second camera writer — ADR-0129 §3's invariant. It cancels an ease outright rather than relying on the stand-down check, because that check exists for a pinch we _cannot_ intercept and within one frame the ease could still write after us. ADR-0121 §7's "a manual pan wins until the next scope change" then holds **with nothing added**, and the ADR records why: that rule is implemented as an _absence_ (the framing effect is keyed on `setSignal`, which a drag zoom does not change).
- **The dot tier crossing live costs nothing**, because ADR-0128 §1 already chose exactly this shape for the pinch — a `zoom_changed` listener writing a data attribute, CSS doing the degradation, no marker re-diff and nothing billed. One adjustment: the write is now conditional on the tier actually changing, since a drag makes the load sustained where a pinch's is momentary.
- **Reduced motion: the gesture is exempt, the step-zoom is not.** The drag is one-to-one with the finger — the motion _is_ the input, so a map that refused to follow would be a broken control, not an accommodation. There is no easing to drop. The double-tap step-zoom is the opposite case and collapses to a single `moveCamera` like every other discrete move.

## 5. Two things Google's double-tap cost and paid

Blocking Phase B's events kills Google's `dblclick` zoom, so **the handler owes it** and implements the step-zoom itself through the existing ease and the existing `zoomStepIn`. That repayment is a small win: Google's double-click zoom is Google's own move, and by ADR-0129 §3's table there is no way to ask it to ease — so it was **the one camera move left on this surface that did not go through our driver**. Taking it over finishes a job ADR-0129 did not know was unfinished.

**Three event streams are suppressed and only one drives the recogniser.** `stopPropagation` on `pointerdown` says nothing to a `touchstart` listener — separate streams — and which one Google subscribes to is not ours to know, so touch and mouse are suppressed alongside as suppressors only. **All of them are attached at mount**, which is session 116's scar rather than a preference: `touchmove` must be non-passive to be preventable, and a listener added once the gesture is recognised is added after the browser handed it to the compositor.

## 6. Testing

The brief's warning — _"it talks to a third-party object" is not "it can't be tested"_ — shaped the split. **The recogniser is pure**, a state machine over `(type, x, y, t)` with no Google and no DOM: 17 cases in `lib/drag-zoom.test.ts`, including the ones the five arbitration sessions say to write.

- **A second full gesture behaves like the first.** Session 122's class of miss was that every e2e booted cold and touched its target exactly once, and a real session never does.
- **A pan cannot become the first tap of a double-tap.** Found while writing the machine, not after: without a travel test on release, a tap landing within 24px and 300ms of where a pan ended would arm the zoom.
- **A third tap does not re-arm off the same first one.**
- **Reversing at the ceiling responds at once**, which is the accumulator's whole shape (§4): clamping the _target_ from total travel means dragging ten levels past the ceiling and back one does nothing for nine levels.
- **Down is in and up is out, asserted as a pair** — if that pair ever swaps the gesture is inverted and nothing else in the file would notice.

**The imperative half calls three `google.maps.Map` methods**, so the existing ~60-line fake map covers it: five new cases in `lib/useMapCamera.test.tsx`, including the one that catches §3's decision (a frame of drag zoom must not move the centre) and the one that proves the ease is cancelled rather than merely noticing.

1831 unit tests / 129 files green; `format` / `lint` / `typecheck` / `build` too.

## 7. What is left, and it needs a phone

**Three items join Phase 3's existing device-pass line** rather than opening a new one, as the brief asked: `SPAN_SHARE` **on a real canvas** (settled on a mockup whose canvas is half the size, so it is reported rather than calibrated), `TAP_GAP_MS`, and **whether centre-anchoring reads correctly on a phone** — the one that could reverse a decision rather than move a number. **The direction is not among them:** it was a device-pass item and the owner spent it on the mockup, which is what drawing one is for.

Also unspent, and stated rather than implied: **nothing here has been seen over real tiles at 60fps with a real thumb.** The mockup's canvas is a scaled grid. What a continuous zoom looks like crossing the dot tier on real imagery is a look, and this session did not take it.
