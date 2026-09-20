# 0236 — The trip is **live while its last commitment is**, not until its last midnight

**Status:** Proposed (2026-09-20). **Not built** — this ADR and its mockup come first, by the owner's instruction.
**Date:** 2026-09-20
**Design reference:** [`mockups/the-trip-is-live-while-its-last-leg-is-v1.html`](../../mockups/the-trip-is-live-while-its-last-leg-is-v1.html) — every number in §Measurements is read off that file's live DOM in a headless browser, at 360px and 390px, in both themes. **It found two errors in its own first draft and one in the file's data**; both are recorded in §Measurements rather than quietly fixed.

**Amends** [0040](0040-trip-mode-access-window-and-past-trip-archive.md) §1 — the live window ends at the last commitment, not at `endDate`'s midnight. Everything else in that ADR stands: the one-directional override, the read-only archive, the pre-trip half.
**Applies unchanged** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §I/§10 and §M (the `in-transit` hero, its horizon, and the landing-day chip written for the red-eye), [0107](0107-per-place-timezones-and-multi-zone-time.md) §4 (mid-journey you are standing in the destination's clock), [0026](0026-real-clock-and-dev-time-travel.md) (the real clock every derivation here reads) / [0033](0033-all-trips-home.md) (the board is scarce: it means the trip is speaking), [0221](0221-the-countdown-climbs-to-tomorrow-and-the-first-morning-lights-up.md) §4/§7 (a mode change is a moment you come to, not one that happens under your hands).
**Follows** [0203](0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md)'s fifth build log and [0083](0083-whenfield-datetime-standard.md)'s 2026-09-20 amendment, which together made the flight this ADR is about enterable for the first time.

## Context

Fixing the booking form let a person enter the ordinary flight home: it leaves at ⁦22:10⁩ on the trip's last day and lands at ⁦02:30⁩ the next morning. The owner then asked what the read surfaces do with it:

> _"What will it look like on the schedule (day view and plan day the hero etc.) if the flight arrival is after the trip? Needs addressing?"_

**Two of the three surfaces need nothing, and that was worth establishing before proposing anything.** A span is filed under the day it STARTS (ADR-0037 §1), so the leg sits on the trip's last day and carries the next as `endDate`; both day screens already draw the cross-midnight marker for it (`crossesMidnightZoned`, `EventCard.tsx` / `PlanDay.tsx`), and nothing is placed on a day the trip does not have. The shared itinerary is ahead of both: `sharePreviousNight` already files a pre-dawn instant under the previous night.

**The board is the gap, and it is a window bug, not a missing surface.**

`tripPhase` turns `past` when `today > endDate`, and ADR-0040 §1 makes Plan the only reachable mode there — the manual override is not honoured, deliberately, so there is no way back. On this flight that fires at the live zone's midnight, roughly ⁦50⁩ minutes after take-off. Home swaps to `PlanHome`'s past branch and reads **`הטיול הסתיים · לזיכרון`** while the group is in the air.

Three things found by reading the code, each of which made this change smaller:

**1. ADR-0040 argued the right rule and implemented a different one.** Its words: _"Trip mode has no 'now' to stand on… post-trip every 'now' is behind you."_ Its code: `today ∈ [startDate, endDate]`. Those two agree on every trip whose last commitment ends before its last midnight — which was every trip, because until this week the form refused the others. Here the premise is simply false: at ⁦01:05⁩ the now is ahead of you, at ⁦11 km⁩.

**2. The surface is already built, and it was built for this exact flight.** `Board`'s `in-transit` variant (ADR-0160 §I) draws `בטיסה`, the route, the rail with `נותרו ⁦1:25 שע׳⁩`, the landing in the destination's own zone with its shift pill, and `הבא בתור` — which mid-flight is what ADR-0160 §10 calls _"what is first on the ground… the 'next 30 minutes' question asked at altitude"_. `Board.tsx`'s comment on `endDay` names the case in so many words: _"a red-eye landing at 06:00 reads as this morning"_. **Nothing has to be designed. The app already drew the answer and then takes it away at midnight.**

**3. `deriveNow` never stopped answering.** It is instant-based and date-agnostic, so it holds the flight as `now` for the whole journey. Only the surface it feeds is gone.

## Decision

### 1. The live window ends at the last commitment that began inside it

`tripPhase` is `live` when `today ∈ [startDate, endDate]` **or** something that started inside that range is still running — the `now` window `deriveNow` already computes (`nowEndOf`: an event's own `endsAt`, or its category's typical duration for a start-only one). Stated as a sentence rather than as a range: **Trip mode is live exactly while the board has a now to stand on**, which is ADR-0040's own premise taken literally instead of approximated by the calendar.

**The start does not move.** The window may only ever extend past the end, never pull the beginning earlier: you can stay in the trip, never arrive at it early. That keeps ADR-0040 §1's governing principle intact — Trip is the privileged live state, Plan is the universal fallback — and it is why this is an amendment to that ADR and not a reversal of it.

**The extension is bounded by the thing that causes it.** It is the length of one commitment, so in practice the last leg: ⁦3:20⁩ on the flight this ADR is about, ⁦0⁩ on every trip that ends with a hotel checkout at ⁦11:00⁩. There is no number to tune, which is the point of measuring it in commitments.

### 2. Nothing new is drawn

The `in-transit` board, its rail, the zone-shift pill, the landing-day chip and `הבא בתור` all ship today. The archive card ships today. **The mockup's proposed-CSS block is empty**, and that is the strongest argument in this ADR: what changes is _when_ each of them renders, which lives in `lib/mode.ts`. A "landing" screen was drawn and rejected — ADR-0160 §I already checked that content against this exact case and found it present, so a second surface would be a parallel copy of one that exists (root rule 8).

### 3. The archive is handed over at the **next opening**, not under your hands

At ⁦02:30⁩ the flight ends and the trip genuinely is over. The only question is when the archive arrives, and ⁦02:30⁩ with the seatbelt sign still on is the worst possible moment for a surface to change by itself — which is the hazard ADR-0221 §7 already named from the other end, about the automatic flip at midnight, and which `design-language.md`'s _"the automatic switch should be gentler"_ line was written for.

So the flip is deferred the way the trip's **beginning** already is: `waypoint:mode-seen:<tripId>` (ADR-0221 §4) persists the last mode seen per trip, and the archive is delivered on the next open. While the app stays open past the landing the board holds its last state — the flight complete, the rail full, `הבא בתור` still naming the ride home, which is the one thing left to do.

**This is the file's one feel call and the mockup makes it a control** (`מיד` · `בפתיחה הבאה`), with the deferred handover as the recommendation and the immediate one drawn beside it. A device pass owns the final answer; the measurement below is what it costs either way.

### 4. What does not change, said so nobody "fixes" it

- **`activeDate` still clamps to `endDate`.** The day view keeps showing the day the leg is filed under, which is the day it departs. Correct as-is.
- **The archive itself** — its copy, its read-only rules, ADR-0040 §2 — is untouched.
- **Trip mode stays unreachable** once the last commitment has ended. The override is still one-directional (ADR-0040 §1); this ADR moves the window's edge, not the rule about who may cross it.
- **Nothing extends `trip.endDate`.** That is a fact a person wrote. _Offering_ to extend it is a good idea and is on the backlog; changing it quietly is the thing ADR-0171 §1 forbids — a suggestion goes into an empty value, never over a filled one.

## Measurements

Read from the mockup's live DOM, ⁦360px⁩ and ⁦390px⁩, both themes (identical across all four):

|                                |                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| The `in-transit` board         | **⁦271px⁩** — the card that disappears at midnight today                                        |
| `.prep-past` archive card      | **⁦108px⁩** — what replaces it                                                                  |
| The swap                       | **⁦163px⁩** of surface changing under the reader's hands, at ⁦02:31⁩, in §3's immediate variant |
| The flight rail                | **⁦27px⁩** carrying `נותרו`, the landing and the shift                                          |
| `הבא בתור` row                 | **⁦62px⁩** — what is first on the ground                                                        |
| Today's window vs the proposal | **⁦40%⁩ → ⁦65%⁩** of the ⁦20:00–06:00⁩ strip; the window ends ⁦50⁩ minutes after take-off today |
| **New CSS this change needs**  | **⁦0⁩ lines**                                                                                   |

**Three errors the render caught, recorded rather than quietly fixed**, because two of them are the traps `references/pitfalls.md` exists for:

- **The board drew at ⁦574px⁩** on the first pass. The file had drawn an inline `<svg viewBox>` for the flight glyph with no width/height, so it took the SVG default of ⁦300×150⁩ — and the app does not use an `Icon` there at all: `Home` passes `nowIcon={boardNowEvent?.icon}`, the event's own **emoji**. A card the app cannot produce, from a glyph the app does not have, visible in one look and invisible in the source.
- **`height: 100dvh` leaked into every frame.** `.app` is the viewport in the app, so each column became a ⁦640px⁩ box with a ⁦271px⁩ card at the top of it. Overridden in a labelled mockup-only block, never by re-typing the shipped rule.
- **The file's own data was wrong in the way this ADR is about.** Elapsed minutes were typed in by hand, counted from Rome's ⁦22:10⁩ against an Israeli clock, so ⁦01:05⁩ claimed ⁦0:25 שע׳⁩ remaining when the answer is ⁦1:25⁩ — and the `מחר` chip was drawn on the two moments that should not have it. Both are derived from the two ends now. A file arguing that a clock must be read in its own zone got that wrong inside itself, which is the most useful thing it could have demonstrated.

## Consequences

- **Frontend:** `tripPhase` (`lib/mode.ts`) takes the running-commitment arm and therefore needs the trip's events, which `ModeProvider` already has through `useTrip()`. `deriveMode` and every caller keep their signatures. `PlanHome`'s past branch is unchanged but is reached later. The handover needs `mode-seen` to be read on the way **out** of Trip as well as into it (ADR-0221 §4 wrote only the entry half).
- **The board's own clock keeps ticking across the boundary**, so nothing on it has to know the window moved — `deriveNow`, `eventPhase` and the transit rail are all instant-based already.
- **No data-model change.** Mode and window stay derived (ADR-0016), and no stored field learns about this.
- **Testing:** the clock must be pinned (`setSimulatedNow`) for every spec here, and both day scopes checked — `frontend/CLAUDE.md`'s two standing rules for this class of surface. The specs worth having: the window holds mid-flight, it closes at the landing, it does **not** open early, and a trip that ends with a daytime commitment behaves exactly as it does today.
- **Deferred, on the backlog:** offering to extend `trip.endDate` when a journey lands past it, and the older path where **shrinking** a trip's dates strands events outside the new range with nothing in the backend to stop it.

## Alternatives considered

- **Extend the window by a fixed day.** Rejected: an arbitrary number that follows from no fact, and it leaves an empty board for every trip that ends at noon — exactly the _"empty shell"_ ADR-0040 §1 refused.
- **Re-open the manual Trip-mode override after the end.** Rejected: ADR-0040 §1 closed it deliberately, and it converts a precision problem into a knowledge problem — whoever does not know the control exists does not get the board.
- **Move `trip.endDate` for the user.** Rejected: see §4. An offer, later; a silent edit, never.
- **A dedicated "landing" screen.** Rejected: ADR-0160 §I already audited that content against this case and found it shipped — the landing, the zone shift, and what is first on the ground. A second surface would be the duplicate root rule 8 exists to prevent.
- **Do nothing, and treat the archive arriving mid-flight as acceptable.** Rejected on the report itself: the last hours of a journey are when _"what now / what next"_ is most load-bearing, and the app currently answers them with a retrospective.
