# 2026-08-06 — The search answers on the canvas, and the result mark stops being basemap furniture (built)

Designed and built in one session, from five owner reports on the Map tab's search and place
card. The decisions are [ADR-0168](../decisions/0168-the-search-answers-on-the-canvas.md); this
note is what the build found that the design did not, plus the one thing the session got wrong
first.

## The two reports that were about reasoning, not pixels

**The camera one.** ADR-0131 §5 refused to let the query move the camera and gave a good
argument for it: "a chip is ONE DISCRETE ACT where a query is a STREAM". Reading it against the
report, the argument is about the wrong event — the **keystroke** is the stream, and a settled
Text Search response is one discrete fact, already rate-limited twice over by the min-chars floor
and the pause debounce that ADR-0132 §7 made load-bearing for cost. So the fix was not to
override a rule but to notice which event it named. Nothing about the per-frame ease argument
changed.

**The ring one, and this is the session's real finding.** The complaint was aesthetic
("amateur", "out of place") and the cause is not. `design/map-styles/waypoint-map-day.json`
paints Google's own POIs `#c9ccd4` fill · `#4b5568` glyph · `#ffffff` outline. The shipped ring
was `--card` fill · `--ink` keyline · `--ink` glyph. **Same three colours, redistributed** — so
the mark was in the basemap's own family, and every "tune the greys" fix lands somewhere else in
that family. It also explains the sentence that looked self-contradictory: at night the POI is
`#414b61` on `#191e2c`, much quieter, so the ring did not improve in dark mode — **its
competition did.**

The first draft of the redraw answered in greys (a `--muted` donut), which is the right
**shape** in the same wrong **family**, and the owner said so immediately. That candidate is
kept in the mockup rather than deleted, next to a synthetic POI, because it is the clearest way
to show what the palette argument is about.

## What the mockup had to do differently

Two themes cannot be drawn side by side. `tokens.css` remaps dark on `:root[data-theme='dark']`,
and `frontend/CLAUDE.md` records what happened the one time that block was split to make a
variant addressable lower down — so a `[data-theme]` panel inside the page would have been a lie
about the token layer. `?theme=dark` on `<html>`, two screenshots.

The file also draws **the basemap's own marker** beside every candidate. That is the panel
`map-google-pins-v1.html` was missing: it compared silhouettes against the trip's pins, which is
the right environment for "does this out-rank ours" and blind to "is this one of Google's".

## Three things the build changed or caught

**A `boundsFillView` reuse was wrong and looked right.** `cameraTargetFor` already answers "does
the camera owe this set anything", and reusing it whole would have been one function instead of
two. It re-fits a set that is contained but _dwarfed_ — correct for a filter, and for a query it
is precisely the unasked-for zoom ADR-0129 §1 removed from a pin tap. The pure function states
the distinction; the tests assert it by name.

**An antimeridian guard would have been dead code.** `searchCameraTarget`'s pan branch computes
a midpoint, so the instinct was to wrap it the way `cameraFrame` does. It cannot be reached: a
set straddling ±180° has a plainly-compared extent of ~358°, which can never be ≤ 0.8 of a view,
so it always falls to the scatter branch — where the top result is framed among its own cluster,
which is a better answer than either a world-wide fit or a long-way-round sweep. The guard was
removed and the fall-through is what the test asserts.

**"A second tap closes it" deleted a gesture, and an existing test caught it.** The first build
read any tap on a selected row as a second press. But a row can be selected by a **pin or a
ring**, both of which only pan (ADR-0129 §1) — so the row's own tap is the _framing_ gesture, the
one way to see a place you tapped on the canvas and then went to the list for (ADR-0134 §6, and
the owner asked for it by name two sessions ago). `Map.embedded.test.tsx`'s "a result's ROW
frames it; its RING only pans" failed, which is the suite doing exactly the job it exists for.
The rule became "a row closes only once its own tap opened it", one piece of state
(`openedFromRow`), and the sequence now reads as a sentence: ring → pan, row → frame, row →
close.

**And the e2e suite refused the same change one surface further out.** "A second tap closes it"
was extended to `ResultRow` for consistency, and `place-decide.spec.ts`'s _"asks once, for the
place you tapped"_ taps a result row twice and asserts the deciding card is **still there** — the
point of that test being that the enrichment is not re-fetched. The spec is right: a result row is
one half of a row↔ring pair whose second-tap verb is already the shelf on the canvas half, and
closing the row drops the ring that answers "which of these is it". So the close is the **trip
row's** only, which is what was asked for; ADR-0168 §4 states the exclusion rather than leaving it
as a gap someone re-closes later.

Worth naming the pattern across both catches: **the extension that felt like consistency was the
part that broke behaviour, twice.** Both times a test written for a different reason was the thing
that noticed.

## And one accessibility wart the same change produced

Making the expanded card's whole body a `role="button"` with `aria-label={t.map.know.back}` gave
two controls the same accessible name — the body and the `‹ חזרה לפרטי המקום` button inside it —
which two tests reported as "found multiple elements". The answer was already in the codebase:
`PlaceKnowledge` makes the whole summary block tappable around `עוד ›` with no role at all,
because "the tap target grows; the accessible control does not move". The expanded body carries
only an `onClick` now, and the keyboard path is the real button.

## What is left

Both `MAP_SEARCH_CAMERA` numbers are derived and join the device-pass tuning cluster — how much
unasked-for movement reads as helpful rather than as a headache is exactly the judgement a phone
makes and a mockup cannot. And the `אין מקומות באזור` readout is now visibly odd during a search:
it counts _our_ places in view, which the area sort depends on (ADR-0126 §5), so it can say "no
places in the area" over three teal rings. Left alone on purpose — what that readout counts is a
decision, and the pan is what the report asked for.
