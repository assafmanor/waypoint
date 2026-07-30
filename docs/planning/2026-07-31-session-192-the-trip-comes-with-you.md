# Session 192 — the trip comes with you

**Date:** 2026-07-31
**Scope:** Journey 3's last unbuilt piece — `AllTrips` → trip as a shared-element handoff.
**Decision record:** [ADR-0140](../decisions/0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) §7, plus a correction to its §3.

## What was asked

One item off the motion pass's leftovers list: the trip card was the one place in the app
where tapping something took you somewhere without carrying it with you.

## What shipped

- `lib/trip-handoff.ts` — the store and both ends. `beginTripHandoff` measures the tapped
  tile; `useTripHandoffTarget` claims the landing and tells the pill to hide its own glyph
  until it arrives.
- `ui/layout/TripHandoffLayer.tsx` — the travelling clone, mounted beside `AppRoutes` so it
  outlives both the list it came from and the boot screen that follows.
- `NAV_DIR.HANDOFF` — an arrival that carries its own shared element, so the shell fades
  instead of sliding.
- `/trips`' back arrow now stamps `BACK`. It bypasses the back resolver (only that screen
  knows whether there is a live trip), so it was the one back in the app that advanced.
- 9 store tests + 6 e2e specs.

## The two things a device found that tests could not

Both were found by slowing the ramp tokens in a real browser and sampling the clone's box,
its fill and the shell's transform on every frame. Neither would ever have failed a test.

1. **The shell slid 28px under the flying glyph.** `data-nav` was read live, so the trip
   back guard's same-URL push (ADR-0103) flipped it from `handoff` to `forward` a beat after
   arrival and started a second animation on a screen that had already arrived. The trace
   showed the pill's measured position going 334 → 306 → 334 during the flight before the
   cause was known. Latched at arrival now.

   Worth noting **why it had been invisible**: while every arrival was `forward`, the
   attribute never changed value, so nothing restarted. The bug existed from the moment §3
   shipped and needed a second manner of arrival to become observable.

2. **The tile dissolved in the first fifth of the travel.** A keyframe `offset` is sampled
   against the _eased_ progress, and `--ease-arrive` is front-loaded by design — so
   `offset: 0.6` fired almost immediately and the object left the list as a bare glyph
   instead of as a tile. Now its own linear animation.

## What was deliberately not done

- **No refactor of `useDragGhost`.** It also floats a stand-in for a real element, but it
  clones the DOM inside one screen and follows a finger with no animation, and its clone
  keeps its looks only because it never leaves the subtree whose CSS paints it. The overlap
  is "a fixed box measured from a source rect"; generalising it would mean reworking a live
  gesture path, which rule 8 says to ask about rather than do quietly. Said so in the file
  instead, so a third case knows where to look.
- **No `useHandoff`** (`lib/handoff.ts`, ADR-0134 §2) — the two ends straddle a route
  change, so its state would have to live in `App` and every update would re-render the
  whole route tree at the moment the new route is mounting.
- **The name does not travel.** It changes font size, colour, neighbours and truncation
  between the two surfaces, so carrying it would be two different objects pretending to be
  one.

## Still owed

A human pass on the **hold**: the glyph is picked up before the trip shell exists, so on a
slow boot it waits. `STRAND_MS` (1200ms) bounds it, and the lift is what should make the
wait read as "held" rather than "stuck" — but that is a perception question, and perception
is the one thing a build cannot verify about itself (ADR-0143 §8).
