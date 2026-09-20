# 0236 — The trip is **live while its last commitment is**, not until its last midnight

**Status:** Accepted and **BUILT** (2026-09-20). ADR and mockup came first by the owner's instruction, then the edge-case sweep they asked for — which changed two decisions before a line was written (§1's shape and §3's direction) and one more during the build (§4's host rule, corrected by its own spec).
**Date:** 2026-09-20
**Design reference:** [`mockups/the-trip-is-live-while-its-last-leg-is-v1.html`](../../mockups/the-trip-is-live-while-its-last-leg-is-v1.html) — every number in §Measurements is read off that file's live DOM in a headless browser, at 360px and 390px, in both themes. **It found two errors in its own first draft and one in the file's data**; both are recorded in §Measurements rather than quietly fixed.

**Amends** [0040](0040-trip-mode-access-window-and-past-trip-archive.md) §1 — the live window ends at the last commitment, not at `endDate`'s midnight. Everything else in that ADR stands: the one-directional override, the read-only archive, the pre-trip half.
**Applies unchanged** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §I/§10 and §M (the `in-transit` hero, its horizon, and the landing-day chip written for the red-eye), [0107](0107-per-place-timezones-and-multi-zone-time.md) §4 (mid-journey you are standing in the destination's clock), [0026](0026-real-clock-and-dev-time-travel.md) (the real clock every derivation here reads) / [0033](0033-all-trips-home.md) (the board is scarce: it means the trip is speaking), [0221](0221-the-countdown-climbs-to-tomorrow-and-the-first-morning-lights-up.md) §4/§7 (a mode change is a moment you come to, not one that happens under your hands).
**Follows** [0203](0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md)'s fifth build log and [0083](0083-whenfield-datetime-standard.md)'s 2026-09-20 amendment, which together made the flight this ADR is about enterable for the first time.

## Context

Fixing the booking form let a person enter the ordinary flight home: it leaves at ⁦22:10⁩ on the trip's last day and lands at ⁦02:30⁩ the next morning. The owner then asked what the read surfaces do with it:

> _"What will it look like on the schedule (day view and plan day the hero etc.) if the flight arrival is after the trip? Needs addressing?"_

**Nothing is placed on a day the trip does not have**, and that was worth establishing before proposing anything: a span is filed under the day it STARTS (ADR-0037 §1), so the leg sits on the trip's last day and carries the next as `endDate`. But the day surfaces are **not** simply fine, and this ADR's first draft said they were — see §4, which is a correction the owner's follow-up question forced. The shared itinerary is the one surface that is genuinely untouched: `sharePreviousNight` already files a pre-dawn instant under the previous night.

**The board is the gap, and it is a window bug, not a missing surface.**

`tripPhase` turns `past` when `today > endDate`, and ADR-0040 §1 makes Plan the only reachable mode there — the manual override is not honoured, deliberately, so there is no way back. On this flight that fires at the live zone's midnight, roughly ⁦50⁩ minutes after take-off. Home swaps to `PlanHome`'s past branch and reads **`הטיול הסתיים · לזיכרון`** while the group is in the air.

Three things found by reading the code, each of which made this change smaller:

**1. ADR-0040 argued the right rule and implemented a different one.** Its words: _"Trip mode has no 'now' to stand on… post-trip every 'now' is behind you."_ Its code: `today ∈ [startDate, endDate]`. Those two agree on every trip whose last commitment ends before its last midnight — which was every trip, because until this week the form refused the others. Here the premise is simply false: at ⁦01:05⁩ the now is ahead of you, at ⁦11 km⁩.

**2. The surface is already built, and it was built for this exact flight.** `Board`'s `in-transit` variant (ADR-0160 §I) draws `בטיסה`, the route, the rail with `נותרו ⁦1:25 שע׳⁩`, the landing in the destination's own zone with its shift pill, and `הבא בתור` — which mid-flight is what ADR-0160 §10 calls _"what is first on the ground… the 'next 30 minutes' question asked at altitude"_. `Board.tsx`'s comment on `endDay` names the case in so many words: _"a red-eye landing at 06:00 reads as this morning"_. **Nothing has to be designed. The app already drew the answer and then takes it away at midnight.**

**3. `deriveNow` never stopped answering.** It is instant-based and date-agnostic, so it holds the flight as `now` for the whole journey. Only the surface it feeds is gone.

## Decision

### 1. The trip's own TODAY is clamped, and the window falls out of it

The rule is one derivation, not two: **while a commitment that began inside the trip is still running, the trip's `today` is the day that commitment belongs to.** `tripToday` already exists for "which day of the trip is it" (`lib/mode.ts`); it gains that clamp, and everything else follows without a second rule —

- `tripPhase` compares `tripToday` against the range, so the phase stays `live` for free. No new arm, no new predicate.
- The day surfaces stop reading the trip's last day as **past**, which is the edge case that made this one rule instead of two: on the 26th at ⁦01:05⁩ `liveToday` is the 26th, `activeDate` clamps to the 25th, and `dayPhase('2026-01-25', '2026-01-26')` answers `PAST` — so ADR-0029's gating locks create/edit/move, the archive chrome paints, and the header's `offToday` points at a day the trip does not have. All of it, mid-flight.

**What counts as running is the board's own question**, and the board already answers it: `deriveNow` over `scheduleEvents`, which is `events` minus a **held** span you are inside (`eventMidSpan(e)?.kind === 'held'`, ADR-0227 §B). That filter is exactly what this needs and would otherwise have had to be re-derived: a hotel whose checkout is the morning after the trip ends must **not** hold the window open, because the board drops a stay you are inside from `now` and would render with nothing to stand on — the "empty shell" ADR-0040 §1 refused. A journey is exempt from that filter, which is why the flight home holds it and the hotel does not.

Two guards, both narrow and both load-bearing:

- **It must have BEGUN inside the window.** `e.date ∈ [startDate, endDate]`, checked on the day the event is filed under. Without it, an event stranded past the end by a date edit (§6) would hold a finished trip live indefinitely.
- **The start never moves.** The clamp fires only when `today > endDate`. You can stay in a trip, never arrive at one early — ADR-0040 §1's governing principle, intact, which is why this amends that ADR rather than reversing it.

**The extension is bounded by the thing that causes it** — the length of one commitment. ⁦3:20⁩ on the flight this ADR is about; ⁦0⁩ on every trip that ends with a checkout at ⁦11:00⁩. There is no number to tune, which is the whole point of measuring it in commitments.

### 2. Nothing new is drawn for the board

The `in-transit` board, its rail, the zone-shift pill, the landing-day chip and `הבא בתור` all ship today. The archive card ships today. **§1–§3 cost the mockup's proposed-CSS block zero lines**, and that is the strongest argument in this ADR (§4 adds one rule, and says why): what changes is _when_ each of them renders, which lives in `lib/mode.ts`. A "landing" screen was drawn and rejected — ADR-0160 §I already checked that content against this exact case and found it present, so a second surface would be a parallel copy of one that exists (root rule 8).

### 3. The archive arrives at the landing — and this reverses the first draft

This ADR first proposed deferring the handover to the next opening, reusing ADR-0221 §4's `mode-seen` from the other end, on the reasoning that ⁦02:30⁩ with the seatbelt sign on is the worst instant for a surface to change by itself. **Checking what the held board would actually render killed it**, and the check is one line of `Home.tsx`:

```ts
const boardVariant =
  inTransit && transitEvent ? 'in-transit' : groupSplit ? 'group-split' : nowEvent ? 'now' : 'free';
```

At ⁦02:31⁩ the flight is over, nothing else is running, and there is no tomorrow inside the trip — so the board held open would fall to **`free`** and print `פנוי · זמן חופשי` as the last thing a trip ever says. That is the empty shell ADR-0040 §1 refused, kept on screen deliberately. The mockup's §2 had drawn the held board as the landed flight, which is a frame the app cannot produce; it now draws what the code says.

**So the handover is immediate, and the symmetry is the argument:** the same sentence that opens the window closes it. The board is live exactly while it has a now to stand on — at ⁦01:05⁩ that is the flight, at ⁦02:31⁩ it is nothing, and a trip whose last commitment has landed is over. What softens the moment is not a delay but the surface it hands over to: ADR-0040 §2 built the archive as _"a calm read-only archive, not the loud prep countdown"_, which is the right thing to meet at ⁦02:31⁩.

**Rejected with it:** holding the window to the end of the landing day (an arbitrary number, and it re-opens the empty board for hours), and a bespoke "landed" state (ADR-0160 §I already audited that content as shipped — §2).

### 4. The arrival's transition row has no day, and that is the day surfaces' own half of this

**This section is a correction.** This ADR's first draft claimed the day view and Plan day need nothing, reasoning that a span is filed under its start day and that both screens draw a cross-midnight `+1`. **Counting the call sites says otherwise** — root `CLAUDE.md`'s own warning landing on the session that quotes it. `transport` is `ambientWhenMultiDay: true`, and a leg whose two ends fall on different days has `endDate` set, so the flight home is **`isAmbient`** — which both day screens _exclude_ from `dayEvents` (`DayView.tsx:669`, `PlanDay.tsx:410`). It never renders as an event card, so that `+1` never fires on it.

What renders instead is ADR-0064 §B's mechanism, built for exactly this case ("a hotel, **a red-eye flight**", in `day-entries.ts`'s own header): two read-only **transition points**, interleaved among the day's groups at their real clocks. `bookingTransitionsOnDate` dates them:

```ts
if (e.date === date && e.startsAt)              // 'start' → המראה, the 25th
if ((e.endDate ?? e.date) === date && e.endsAt) // 'end'   → נחיתה, the 26th
```

**And the trip has no 26th.** `tripDates` stops at `endDate`, `activeDate` clamps, an out-of-range `?day=` falls back — no surface ever asks for that day, so the arrival row is never drawn. The trip's last day lists `המראה · 22:10`, and **the landing time appears nowhere on the day surfaces at all**. Nor is there a bookend row carrying it: a flight is not a stay (`isStayRow` needs `countsNights`).

**Decision: an end whose own day falls outside the trip is filed under the LAST DAY OF THE TRIP ITS SPAN STILL COVERS.** For a leg that is the day it departed from; for a stay whose check-out falls past the end it is the last night you are actually there — **one sentence rather than a journey-shaped special case, and the build is what found that**. The rule was first written as "the day its leg departed from", which hosts a three-night hotel's check-out on its check-in day; the spec for E15 failed on it, and the wording above is the repair. When the span starts after the trip ends it covers no day the trip has, and then nothing is drawn (§6). The last day then reads `המראה · 22:10` and `נחיתה · 02:30 · מחר` — the journey it actually is. The day word beside the clock is not new either: it is `BoardTransit.endDay`'s `מחר` (ADR-0160 §M), the same fact in the same word, reaching the day list. **This is the only new CSS in the whole change** — one rule, three declarations (`.tr-day`), drawn and measured in the mockup's §4.

Rejected: giving the trip a 26th day (that is `tripDates`, the day strip and ADR-0018 rewritten for one row); and leaving the arrival unsaid (the trip's final arrival is precisely what a person opens the day list to check). And this is **not** `sharePreviousNight` generalised — that rule's own docblock calls itself share-only and notes the app's day surfaces already sort correctly by `startsAt`. The problem here is a missing day, not a misordered one.

### 5. What does not change, said so nobody "fixes" it

- **`activeDate` still clamps to `endDate`.** The day view keeps showing the day the leg is filed under, which is the day it departs. Correct as-is.
- **The archive itself** — its copy, its read-only rules, ADR-0040 §2 — is untouched.
- **Trip mode stays unreachable** once the last commitment has ended. The override is still one-directional (ADR-0040 §1); this ADR moves the window's edge, not the rule about who may cross it.
- **Nothing extends `trip.endDate`.** That is a fact a person wrote. _Offering_ to extend it is a good idea and is on the backlog; changing it quietly is the thing ADR-0171 §1 forbids — a suggestion goes into an empty value, never over a filled one.

## The edge cases, swept

Asked for by the owner — _"investigate and find all edge cases that you can find"_ — and the sweep changed two decisions (§1's shape and §3's direction) rather than merely confirming them. `#` numbers are how the specs refer to them.

### What holds the window open

| #   | Case                                                                | Resolution                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **A stay running past the trip's end** (checkout the morning after) | Does **not** hold it. `scheduleEvents` drops a `held` span you are inside (ADR-0227 §B), so the board has no now and would render `free` — the shell ADR-0040 refused. Reusing that filter is what makes this correct for free. |
| E2  | **A car hire mid-hire** across the end                              | Same as E1: `midSpan.kind === 'held'`.                                                                                                                                                                                          |
| E3  | **An event with no `endsAt`** (a last-night dinner at ⁦23:00⁩)      | Holds it, for `typicalMinutesFor(category)` — because that is the same window `deriveNow` uses to call it now, and the board genuinely has something to stand on. Deliberate, not an oversight.                                 |
| E4  | **A done or skipped commitment**                                    | Releases it: `deriveNow` takes `status === PLANNED` only. Marking `נחתנו` early is a person saying they have arrived, and the archive following them is right.                                                                  |
| E5  | **An event stranded past the end** by a date edit (§6)              | Cannot hold it — §1's guard requires `e.date ∈ [startDate, endDate]`. Without it a finished trip stays live forever.                                                                                                            |
| E6  | **Two commitments running at once**                                 | `deriveNow` already ranks them (`byPrimaryNow`); the clamp takes the primary's `date`. No new tie-break.                                                                                                                        |
| E7  | **A 30-hour ferry**                                                 | Holds it for 30 hours. That is the commitment's own length, and there is no number to tune.                                                                                                                                     |
| E8  | **Nothing running, trip over**                                      | Unchanged: `past`, archive, exactly as ADR-0040 §2 ships it.                                                                                                                                                                    |
| E9  | **Before the trip starts**                                          | Unchanged and unreachable by this rule — the clamp only fires when `today > endDate`.                                                                                                                                           |
| E10 | **A member marks the flight done on another device**                | The window closes for everyone on the next sync. Consistent with E4 and with mode being derived, never stored.                                                                                                                  |

### What the day surfaces do

| #   | Case                                                                                 | Resolution                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E11 | **The last day reads `PAST` mid-flight**                                             | Fixed by §1's clamp, and it is why §1 is one rule rather than two: `dayPhase` compares against `tripToday`, so ADR-0029's locks, the archive chrome and `offToday` all stay correct without being patched one at a time.                                                                                                                                                                                     |
| E12 | **The arrival's day is outside the trip**                                            | §4 hosts it on its leg's departure day.                                                                                                                                                                                                                                                                                                                                                                      |
| E13 | **Both of a leg's days are outside**                                                 | Nothing is drawn — §4's second clause. The leg is stranded, which is older and wider than this ADR (§6).                                                                                                                                                                                                                                                                                                     |
| E14 | **A `+2 ימים` arrival**                                                              | Hosted the same way; the day word scales through the same vocabulary the rail uses (`למחרת` / `+N ימים`), so one set of words serves both.                                                                                                                                                                                                                                                                   |
| E15 | **A hotel whose CHECKOUT falls outside**                                             | Hosted on the last night you are there, by the same sentence — and **this case is what corrected the rule**: written as "the day its leg departed from" it put a three-night stay's check-out on its check-in day. For a stay it is also a strict improvement: `stayEdgeEntry` now finds an edge on the last day, so the bookend row says the check-out instead of the day count (ADR-0209 §1's own intent). |
| E16 | **A hosted arrival creating a bogus free-time gap**                                  | It cannot: gaps are measured from **timed events**, and a transition point is not one (`gaps.ts`, and `freeWholeDay`'s docblock says so outright).                                                                                                                                                                                                                                                           |
| E17 | **Ordering** — an arrival clock that reads `02:30` sitting under a `22:10` departure | Correct as-is: entries sort by **instant** (`mergeDayEntries`), so the arrival sorts last, and its `מחר` says why its clock reads smaller.                                                                                                                                                                                                                                                                   |
| E18 | **Settling a hosted arrival**                                                        | Unchanged: it is the same event and the same `end` edge, so `edgeSettleProps(event, 'end')` answers exactly as it does on a normal arrival day.                                                                                                                                                                                                                                                              |
| E19 | **Plan day**                                                                         | Every rule here is in `lib/`, and both screens read it — `frontend/CLAUDE.md`'s standing rule that a day derivation changed in `DayView` only has cost a release twice.                                                                                                                                                                                                                                      |

### Elsewhere

| #   | Case                                                                                            | Resolution                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E20 | **The pre-snapshot chrome** (`trip-state.tsx`'s loading tier) calls `deriveMode` with no events | Events are optional; absent, the answer is the calendar window it is today. A skeleton guessing the chrome does not need the clamp.                                                                                           |
| E21 | **A Plan peek during the extension**                                                            | `PlanHome`/`PlanDay` take the same `tripPhase`, so a peek shows the prep dashboard and an editable day — not the archive. Missing this would have been invisible until someone peeked mid-flight.                             |
| E22 | **No zone evidence**                                                                            | `tripToday` falls back to `todayInTz(trip.timezone)` exactly as it does today; the clamp sits above that choice.                                                                                                              |
| E23 | **DST on the last night**                                                                       | The window is instant-based (`deriveNow`), so it is unaffected; the clamp only reads a `date` string.                                                                                                                         |
| E24 | **Offline**                                                                                     | Everything here is derived client-side from the snapshot. No new network dependency.                                                                                                                                          |
| E25 | **The shared itinerary**                                                                        | Untouched. Its `groupByDay` files an out-of-range landing on its own day card, which is that projection's decision (and `sharePreviousNight` already folds a pre-dawn one into the previous night). Not this ADR's to change. |
| E26 | **The Map's day scope**                                                                         | Untouched: it reads `liveToday` for "where are you standing", which is a different question from "which day of the trip is it". Only the trip-day surfaces move to `tripToday`.                                               |

## When the trip's dates change

Raised by the owner against the design: _"make sure that you're handling edge cases, such as changing the trip dates so that for example it's now changed from until the 26th to the 25th which will now be valid"_. A trip's dates are editable and **nothing re-validates the itinerary when they move** — `trips.service.ts` checks only `endDate >= startDate` and never inspects an event, and the settings form bounds the end date by the start alone. So every state below is reachable today, by editing a date rather than by authoring a flight.

**The point that makes the rest fall out: a shrunk trip and a flight home produce the SAME state.** A leg departing the 25th and landing the 26th, with the trip ending the 25th, is one state whether it was authored that way or arrived there because somebody moved `endDate` from the 26th to the 25th. That is why one rule covers both, and why every rule in this ADR is a **derivation at read time keyed on the current trip range** — never a stored decision. A stored one would have to be migrated on every date edit, which is the lifecycle ADR-0018 deliberately refused when it dropped the `Day` table.

| The edit                                                | What happens                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **End pulled in, past the arrival** (26th → 25th)       | The leg keeps its day; the arrival's day is now outside, so §4 files it under the departure day. The window (§1) still holds through the landing, because the flight began inside the new range. **And the form stops refusing it** — which is the shipped half of this session: before it, editing that booking after the shrink was refused at a field no control can move. |
| **End pulled in, past the departure too** (26th → 24th) | The whole leg is off-trip: its span covers no day the trip has, so §4 finds no host and nothing is drawn — the honest reading of a booking the trip no longer covers. The form refuses at the departure, correctly: that is a picked date a person can fix, or a trip they can extend. The stranding itself is older and wider than this ADR, and stays on the backlog.       |
| **End pushed out** (25th → 26th)                        | §4 stops firing and the arrival renders on its own day, as it always did. Nothing has to be undone because nothing was written: `activeDate` clamps against the **reactive** trip (`trip-state.tsx`, F-06 fixed in session 36), so the new day is immediately selectable and the day strip agrees.                                                                            |
| **End pulled in while the trip is live**                | `tripPhase` asks whether a commitment that began inside the **current** window is still running. Shrink the end past a flight's departure and the trip is simply over — the person said so. Shrink it to the departure's own day mid-flight and the window still holds to the landing. Both fall out of §1 without a special case.                                            |
| **Start pushed out, past a leg**                        | Symmetric and already settled: §1 never moves the window's start, so a trip cannot become live early, and the day surfaces treat an early leg exactly as they treat a late one — no day, therefore no row.                                                                                                                                                                    |

**What this asks of the build, stated so it is not discovered late:** §4's host-day question is asked with the trip range in hand at render time, beside the `activeDate` the surface is already drawing; it is not baked into `bookingTransitionsOnDate`'s `endDate` keying, which stays what it is. And the specs that pin it set the trip's dates **around** a fixed leg rather than moving the leg, because that is how a person reaches the state.

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
| The last day's list            | **⁦164px⁩** today (two transition rows) → **⁦251px⁩** with the arrival                          |
| One transition row             | **⁦77px⁩** — against ADR-0017's ⁦44px⁩ floor                                                    |
| **New CSS this change needs**  | **one rule, `.tr-day`** — §1–§3 cost ⁦0⁩ lines; §4 adds the day word beside the clock           |

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

## Build log — 2026-09-20

**Three decisions changed on the way, and each was changed by evidence rather than by taste.** They are recorded in §1, §3 and §4 in place; what follows is what the build itself cost.

**The window and the day clamp are one function, and that is the whole reason it is small.** `tripToday` gains the clamp; `tripPhase` compares against `tripToday` and so needs no new arm. Five surfaces then move off `liveToday` for their trip-day question — `App` (the day strip and `offToday`), `DayView`, `PlanDay`, `trip-state`'s `defaultDay` — and the Map deliberately does **not**: it asks where you are standing, which is a different question (E26).

**`deriveNow`'s filter came for free and was the difference between right and wrong.** `holdingCommitment` reuses `scheduleEvents`' rule (drop a `held` span you are inside, ADR-0227 §B) rather than deriving a second answer, which is what makes E1 and E2 correct without a special case. The `events` argument is optional everywhere, so the pre-snapshot chrome (E20) keeps the calendar answer it has always had — and a spec pins that the four-argument and three-argument calls disagree exactly where they should.

**One type was a second copy of a shape, and `dayOffset` found it.** `DayEntry`'s transition arm re-declared `BookingTransition`'s four fields instead of intersecting the type, so the new member reached `mergeDayEntries` through the spread and stopped at the type-checker. It is `{ kind: 'transition' } & BookingTransition` now — root rule 8, caught by the first field added to that shape since it was written.

**The day word is the RAIL's, not the board's, and that is a correctness point.** `למחרת` means "the day after the one this is anchored to"; the board's `מחר` means "tomorrow from now" and would be a lie the moment you opened the last day in advance. ADR-0203 §2 minted those words for exactly this relation, so `TransitionRow` borrows them and needs no `trip`/`today` prop at any of its four call sites.

**Tests: 14 new specs, and two of them failed first.** `mode.test.ts` carries E1/E3/E4/E5/E9/E11/E20 and the live-and-over pair; `day-entries.test.ts` carries E12–E15 and E17. E13's first version asserted something stricter than the code needed (it asked about a date the trip does not have, which no surface does) and E15's failure is what corrected §4's rule from "the day it departed from" to "the last day of the trip its span still covers" — the sentence that serves a stay and a leg alike. Suite: **5852 green**, ⁦14⁩ up.

**Found on the way, not fixed here:** `glance-card.css` reads `var(--font-ui)`, a token `tokens.css` does not define, so that rule has been falling back to the inherited face since it was written. One line, unrelated to this ADR, and on the backlog rather than smuggled into it.
