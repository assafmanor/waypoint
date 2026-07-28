# Session 151 — the camera answers the tap (Phase 3, part one)

**Date:** 2026-07-28
**Kind:** design + build in one session, deliberately — unlike Phase 8, none of this is a layout question, so there is nothing a mockup could have shown that the fake map cannot.
**Output:** [ADR-0127](../decisions/0127-map-camera-answers-the-tap.md) (amends ADR-0121 §7), built. Phase 3's backlog block rewritten: the zoom ladder and the arrival defect are done, three legibility items remain.

## What shipped

Four reports, and three of them were the same question — so they now name one constant. `MAP_ZOOM.PLACE` replaces `SINGLE_PIN` and is read by the lone-pin centre, by a selection zooming in, and by locate. Before, the tab landed at a different zoom depending on how you got there.

**Focus zooms, in one direction.** ADR-0121 §7's "focus pans, it does not zoom" is reversed only for zooming _in_. That was the whole trick of this one: §7's argument is about protecting the context you were reading, and that protection is entirely about not pulling **back**. Being dropped on a country-level view and told the place is somewhere in it protects nothing. So the half that was doing work is kept and the half that was not is dropped — which is a smaller change than "reverse §7" sounded like when it was written on the backlog.

**#20's step-in is stateless** — one level in from wherever the map is. Counting taps would be state a pinch silently invalidates, and a tap count in a prop is what ADR-0122 §9 refuses.

## The one that was not a tuning question

**Arriving from `מפה` landed on the day's frame, not on the place**, and the backlog line was right that this is a defect rather than a preference. It was also right about something more useful: _the ordering is a runtime race, so do not trust this description of it._

I could not confirm it on a real arrival — no canvas — so I did not try to fix the ordering at all. **The fix is ownership: an arrival focus IS the frame, and the fit does not run for it.** Two runners became one, so there is no race to lose and nothing to out-time. What makes it hold in practice is two properties, both tested:

- it is **claimed on the render that brings it and held until spent**, because the screen consumes `focusPlaceId` in one pass while the map may not be sized for several more — reading the live prop would drop the focus on exactly the slow arrivals this exists to fix;
- it **wins from either side of the race** — landing before the map is sized, and landing after the fit already claimed the opening frame.

That second test is the one that would have caught a timing fix pretending to be a rule. This is the **third** instance of one family (ADR-0121's session-134 entry, session 139's re-fit guard), and each earlier fix added a guard to `apply`; the backlog explicitly asked for an ownership rule this time instead, and that turned out to be both smaller and order-independent.

## What I did not do, and why it is worth saying

The three zoom values are **derived defaults**: `PLACE` 14 and `MAX_FIT` 15, each one step out from the values reported as too close, with the relationship between them preserved rather than re-invented. One step is the minimal honest response to "too close" when every step halves the span. I have not seen them on a map and the ADR says so.

This is ADR-0122's posture, not a new one: ship the derivation, name the calibration. What has changed is the size of the bill — **the device pass now owns five numbers** (`PLACE`, `MAX_FIT`, `STEP_IN_MAX`, `MAP_REFIT_FILL_SHARE`, `MAP_PIN`'s three) plus ADR-0126's three look questions. They are one legibility question asked in several places, and the backlog now says plainly that they want **one sitting on a phone** rather than being picked off individually. Tuning them separately is how they drifted apart in the first place.

## Phase 3 is not finished

Three items left, all legibility: `MAP_PIN`'s dials, ADR-0121 §6's `dot` tier (decided, never built, keyed on zoom rather than on the canvas — which is why ADR-0123 left it alone), and ADR-0122 §7's bottom camera inset. That last one is no longer blocked: it was deferred because it needs a `MapPane` prop that changes on a tap, and ADR-0126's build log now records where that line actually sits — §9's subject is re-instantiating the map, not any prop at all.
