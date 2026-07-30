# Session 195 — the device pass gets an instrument

**Date:** 2026-07-30
**Branch:** `claude/maps-device-pass-panel-07sxmg`
**ADR:** [0146](../decisions/0146-the-device-pass-gets-an-instrument.md) (new). No mockup, on purpose — every item in this cluster is a question a picture cannot answer.

The map panel's only unbuilt feature work is Phase 6(b)+(c), which finishes the epic. This session took the **device pass** first, and not on preference: every phase since Phase 2 has added to it and it has never been run, while sessions 193–194 shipped Phase 9 and then, inside 24 hours, a phone found **two of its models wrong** — the drag's sensitivity was a share of the canvas when it belonged to the finger, and the double-tap reused locate's ladder and inherited a floor that sent a globe view to city zoom. That was the epic's 4th and 5th device correction of something derived and unit-tested. Phase 6 would stack a third authoring surface, one that spends money per add, on a base nobody has looked at.

## 1. The cluster is three kinds of thing, and that is half the deliverable

This is the finding, and it is why the panel came out smaller than the brief expected. It had been "the numbers" for eight sessions:

- **Seven preferences** — `MAP_ZOOM.PLACE` / `MAX_FIT` / `STEP_IN_MAX` / `DOT_BELOW`, `MAP_REFIT_FILL_SHARE`, `MAP_DRAG_ZOOM.PX_PER_LEVEL` / `TAP_GAP_MS`. Nothing measures these; someone has to feel them. These get the steppers.
- **Two readings, which were never numbers.** `half`'s fraction is read off a gesture the app already has: the sheet drags to any height, so the owner drags until the canvas reads right and the panel reports the height as a fraction of the container. A slider would be a second, worse way to do what a thumb does — and it is the one override that genuinely fights ADR-0122 §9 (`--sheet-h` is written from the snapped stop, and the fraction is read on **both** sides of the CSS/TS line, so a CSS-only override desyncs the snap targets from the rendered height). **So §9 is neither bent nor argued with: the question was never a slider's to answer.** And `MAP_CARD_BODY_H` is a **measurement** — a constant only because ADR-0128 §2 forbids a layout read on a screen that re-renders every second, not because 130 is anyone's taste. The panel measures the rendered card on demand, which is exactly the instrument that was missing.
- **Five look questions** — ADR-0126's three and ADR-0130's two. No control at all; they ride as a checklist so the sitting records its own answers.

**And one item was already spent.** The brief and the backlog both carry ADR-0145's centre-anchoring as open — "the only one that could reverse a decision rather than move a number". [ADR-0145 §3's amendment](../decisions/0145-the-canvas-takes-a-one-finger-zoom.md) closed it the day it was raised: both anchors were used on a phone, the double-tap took the tapped point (Google's own behaviour, restored) and the drag kept the centre as an affirmed call. §3 says "no longer a deferred question in either direction". It comes off the list — recorded rather than quietly dropped, because a spent item left on a list is how a list stops being believed.

So the count is **12 open**, not 18: 7 + 5.

## 2. The crux: a constant goes live at the reader

`MAP_ZOOM` and friends are `as const`, read at module scope by pure functions — which is what makes `map-camera.ts`/`drag-zoom.ts` testable with no Google in the process. A mutable layer over the _definitions_ would be the parallel copy ADR-0094/0095 keep being written to undo.

Two facts, both checked rather than assumed, made this much smaller than expected:

- **Every one of the seven is read inside a function body, at call time** — in a camera callback, in a `zoom_changed` handler, in a pure function. Not one is captured at module init. So a reader that consults an override needs **no prop, no state and no re-render**: the next fit, the next gesture, the next zoom event already re-reads. On this surface that is the whole game, because a needless prop change re-diffs every marker and a remount is **billed** (ADR-0121 §4, ADR-0122 §9).
- **The accessor is handed the constant**, so `constants.ts` keeps the only copy: `tune(TUNE.zoomMaxFit, MAP_ZOOM.MAX_FIT)`. The call site still names the number, and it now also says which reads are calibratable — `MapPane`'s `defaultZoom` deliberately reads `MAP_ZOOM.PLACE` directly, because a construction-time value cannot be live without a remount.

**Prod-emptiness was run, not stated.** After `pnpm build`, `dist/` contains none of `map tuning` / `px / level` / `waypoint:dev-tuning` / `time travel` / `hatchIsTexture`, and `tune` survives as exactly the predicted minified identity: `function I(e,t){return t}`. The override object, the `sessionStorage` hydration, the ranges, the probe and both panels are gone.

**What CSS already resolves was free and turned out not to be needed.** Pin geometry is fully CSS-resolved (`--pin-base`/`--pin-aside-scale`/`--pin-dot-scale`, each with a fallback, written from `MAP_PIN` in a `style` object the screen re-renders anyway), so a live pin dial costs one `var()` wrapper and no mechanism. But §1 leaves it zero consumers — the CSS-resolved values are a reading and two closed look questions — so it is recorded as available and one line away rather than built unused. Two mechanisms for zero need is how the parallel copies rule 8 exists to prevent get started.

## 3. Three build decisions worth keeping

**Steppers, not sliders.** A slider drags — tens of events per gesture, the most expensive re-render shape this surface has — and on a phone it cannot reliably land on `0.40`, so the value the owner chose would not be the value they could report. `− 14 +` emits one discrete change per tap. The expensive failure is designed out rather than guarded against.

**The panel was covering the thing it exists to judge.** First render measured **430px of an 844px phone** with all four groups open — the entire canvas at the `half` stop. Sectioned to one group at a time it is **181px**, measured in a browser. Same rule as the badge one level down, and the same rule `DevTimeTravel`'s own comment states.

**The answer leaves as selectable text.** The clipboard is the bonus, not the mechanism: the phone doing this sitting reaches the dev server over `http://192.168.x.x`, which is not a secure context, so `navigator.clipboard` is **undefined exactly there**. A copy button as the only way out would have failed silently on the one device that matters.

## 4. The properties, over the panel's range rather than the shipped value

The lesson from all five device corrections is that the tests asserted what the code did while the model was wrong. A tuning panel makes a stronger version available: **the panel's exposed range is itself a testable surface**, so the invariants are quantified over every value a stepper can produce.

Five properties, each named for the bug it prevents: `DOT_BELOW < PLACE` (else the camera delivers you to a place at a zoom where every pin is a dot — precision it just threw away); `PLACE ≤ MAX_FIT ≤ STEP_IN_MAX` (else a fit with real extent is capped **looser** than the no-extent guess); `0 < REFIT_FILL_SHARE ≤ 1` (above 1 the camera re-fits forever, at 0 session 139's bug is back); session 194's travel-per-level property re-asserted across the whole `PX_PER_LEVEL` range; and the recogniser staying total at every `TAP_GAP_MS`, asserted at each window's boundary because an off-by-one in the comparison is precisely what a value test agrees with.

**And a broken combination is stated, not made unreachable.** The steppers' ranges overlap on purpose — narrowing them so a bad pair could not be expressed would make them lie about what the constants can be — so `tuningWarnings` names the violation live and the emitted block leads with `## INVARIANTS VIOLATED`. That is what keeps "the owner cannot step into a violating state and mistake it for a design failure" true: they can step there, and it tells them.

## 5. Reuse, and one lint allowlist

`DevTimeTravel` was already this pattern, so its shell is **extracted** to `DevPanel` and both sit on it rather than a second dev affordance appearing beside it (rule 8). The extraction paid for itself immediately: the shell owns the corner geometry, so `slot` keeps two badges from landing on top of each other — a copy would have shipped that overlap.

The zoom readout needs the `google.maps.Map`, which lives inside `MapPane`'s `APIProvider`. `DevMapProbe` is deliberately `PinDensity`'s shape (ADR-0128 §1) — a stateless, null-rendering sibling with one `zoom_changed` listener — so it cannot re-render that subtree.

One guard is allowlisted: the panels are English inside an RTL document, and mirrored, a `− 14 +` stepper column reads backwards and the emitted block (which **is** the deliverable) is unreadable. `eslint.config.mjs` gains a layered block dropping `BIDI_SELECTORS` for `frontend/src/dev/**` only, with the reasoning in place — the move the repo already prescribes for the `createPortal` guard, rather than the CSS `direction: ltr` that lint cannot see. Everything else stays on there, and the emoji ban caught two glyphs in the panel's first draft. The positioned box keeps the document direction, so the badge stays in the corner `DevTimeTravel` has always used.

## 6. Verified headlessly, and what was never seen

Green: 1872 frontend tests (20 new), typecheck, lint, build.

Driven in a real browser at 390×844, against a dev server with placeholder map build vars so the split renders (Google's script aborted, so no canvas):

- **A stepper tap does not remount the pane** — `.map-pane`'s element handle is identical across two taps. The billed failure, checked as element identity rather than argued from the code.
- **The badges stack and clear the nav**: tuning y=40, time travel y=8, nav y=775.
- **The readouts read real boxes.** At `half` the pane measured **250px**, so `zoomPerLevelPx` reported **125** px/level in force — i.e. `MAX_SHARE` binds at 130 and not at 120 on the baseline phone, exactly the "binds below ~240px and nowhere above" boundary ADR-0145 §4 states, now measured rather than derived.
- **The `half` readout agrees with the constant it will replace**: sheet 318 of split 569 = **0.559** against the stop's 0.56. Calibrating the reading instrument against a value we already know is the only way to trust it on one we do not.
- Overrides survived a reload with the stepped value intact.

**What was never seen, stated plainly because this epic has been burned five times by the gap between "reasoned" and "seen":** the map. With Google's script aborted there is no map instance, so the **live zoom readout published nothing** and the emit block printed `live zoom at emit: ?`. That readout, all seven preferences, both readings and all five look questions need a real browser key on a real phone, which no agent session has. **This session answered none of the 12 questions.** It built the instrument and watched the instrument work.

## 7. Backlog

The Phase 3 device-pass line is **restated, not extended** — one line, as every phase has been told. It now says 12 open in three kinds, names `PX_PER_LEVEL` + `MAX_SHARE` where it still said `SPAN_SHARE` (deleted as a concept by session 194), corrects "seven numbers plus three look questions", and records the three items that left without being tuned and why. What remains on it is the sitting.

## What is next

**The sitting** — one pass on a phone with a browser key, which is now a single sitting rather than eighteen cycles. Then Phase 6(b)+(c), on a base that has been looked at.
