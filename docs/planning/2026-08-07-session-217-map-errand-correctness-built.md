# Session 217 — Workstream A built: the errand's search moves the camera, and the empty trip stops talking over it

**Date:** 2026-08-07
**Branch:** `claude/map-search-empty-state-mmdy1q`
**Scope:** field reports #1 and #21 from [session 216's triage](2026-08-07-session-216-field-reports-triage.md) — Workstream A, classified there as Class A (defects against accepted behaviour). Bug fix only: no mockup, no new ADR. [ADR-0168](../decisions/0168-the-search-answers-on-the-canvas.md) §1 is **amended in place**, because #1 turned out to be a rule that ADR stated and did not hold.

## The lead the triage flagged, resolved

§1 of the triage asked the one question worth asking first: is the booking/event place-selection errand wired to `useMapCamera`, or is it a parallel path? **It is the same path, all the way down.** `PlacePicker` no longer owns a search sheet at all (ADR-0134 §9) — it hands the Map tab an errand, the tab renders its one `MapPane`, and that pane holds the one camera. Nothing about the errand branches the rings, the `resultSignal` effect, or `showResults`.

The gap is one step further in, and it is why reproducing in the errand context mattered:

**A map is constructed with a camera, and `showResults` was reading that placeholder as a frame.** `MapPane` gives `<Map>` a `defaultCenter` of `defaultCentre` where there is a pin to prefer and `{0,0}` at `MAP_ZOOM.WORLD` where there is not. Either way `getBounds()` answers, so ADR-0168 §1's anti-jitter rule ("every result already on canvas → nothing") fired against a view nobody chose. On the world view **every** result is contained, so the camera never moved and the ring stayed a speck in the Atlantic.

**And the errand is where that state is ordinary.** You go to the Map to pick a place for your _first_ booking, so the trip has no places, so `points` is empty — and with no points the framing effect has nothing to fit _and does not register its `idle` retry_, so the map stays unframed for the whole visit. On the Map tab's own search you have normally already been looking at your places, so the opening fit has long since run and the rule behaves. Same code, two populations; screenshot D in the triage note is the failing one, and it is the same screen that produced #21.

Two consequences, both in `lib/useMapCamera.ts`:

- `showResults` passes the view as `null` until `framed` is true — the reading `searchCameraTarget` already has for it, and the same one the opening fit makes. A map that has **not rendered** still does nothing: bounds are what separate "no view to answer with" from "no view worth preserving".
- The deferred opening framing now stands down once anything has framed the map. ADR-0168 §1 claimed `framed` already prevented an opening fit from landing on top of the search's answer; nothing actually re-read the ref, and the search's own move fires the very `idle` that framing is waiting on. One condition on the `idle` listener, and the ADR's claim is now true.

## #21, unchanged from the triage's own reading

`Map.tsx`'s `listBody` tested `allUsages.length === 0` **before** the active-search branches, so a trip with no places of its own stated an emptiness the search underneath it was in the middle of disproving. The query branch now outranks all three "why is this list empty" causes rather than two of them; at rest the empty trip still says so. It is the same rule the merged-emptiness check inside that branch already held for the other half (session 164's "a list cannot say nothing and then show something") — this was the branch **order** failing to hold it too.

## Coverage

- `lib/useMapCamera.test.tsx` — a rendered-but-never-framed map fits a settled result set instead of reading its opening camera as a view; the _next_ settled set is then answered against the frame the first one landed (the anti-jitter rule is intact, not traded away); and a deferred opening fit does not land on top of the answer. All three fail against the pre-fix hook.
- `screens/Map.embedded.test.tsx` — a new `with no places of its own` block **inside the errand describe**, driving the real errand handoff: the trip's emptiness is not stated while a search is answering (#21), it still is at rest, and the settled result reaches the pane as the ring on a pane whose pin set is empty — the exact input the camera was mishandling. The camera move itself stays in the hook's own suite, per ADR-0121 §13's split.

## Not done here

No mockup, no new ADR, and nothing from the other eight workstreams — including the confirmed one-liners (#5, #14, #15) the triage deliberately left for their own sessions. The rendered canvas was not seen: whether the camera lands where it should on a real phone is still the human step ADR-0121 §13 names.
