# 2026-09-20 — The flight home leaves the trip behind

**Outcome:** [ADR-0236](../decisions/0236-the-trip-is-live-while-its-last-commitment-is.md) (**Proposed, not built** — ADR and mockup first, on the owner's instruction) · [`mockups/the-trip-is-live-while-its-last-leg-is-v1.html`](../../mockups/the-trip-is-live-while-its-last-leg-is-v1.html) · README row · catalog entry · backlog line updated. The form half of the same session shipped separately: [ADR-0203](../decisions/0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md)'s fifth build log and [ADR-0083](../decisions/0083-whenfield-datetime-standard.md)'s amendment.

## What was asked, and in what order

The session started on a screenshot of the booking form with two contradictory things on it: the rail drawing `למחרת` with a ⁦3:20⁩ leg, and `זמן הסיום צריך להיות אחרי ההתחלה` underneath it.

> There's a bug in the flight travel times, why is this

That was two bugs stacked, both fixed and both on PR #860. The second was found by the **owner reading the screenshot rather than the code**:

> Maybe the issue is that the trip is set until January 25th? Possible clue

It was not the cause of the message on screen — that was the day-resolution divergence — but it was the next refusal underneath it, and worth recording as a method note: **the clue was right about the system and wrong about the symptom**, which is a more useful thing to receive than either alone. Fixing the days alone would have left the flight home just as unenterable, one message further on.

Then, on the read side:

> What will it look like on the schedule (day view and plan day the hero etc.) if the flight arrival is after the trip? Needs addressing? Mocking up?

And on the answer:

> go ahead, ADR and mockup first

## What counting found

**Two of the three surfaces needed nothing, and establishing that was most of the work.** A span is filed under the day it STARTS (ADR-0037 §1), so the leg sits on the trip's last day and carries the next as `endDate`; `EventCard` and `PlanDay` both already draw the cross-midnight marker through `crossesMidnightZoned`; and the shared projection's `sharePreviousNight` already files a pre-dawn instant under the previous night. Nothing is placed on a day the trip does not have.

**The board was a window bug, not a missing surface**, and the three things that made the change smaller are all in the ADR. The one worth repeating here is the shape of the mistake: **ADR-0040 argued the right rule and implemented a different one.** Its prose says _"Trip mode has no 'now' to stand on"_; its code says `today ∈ [startDate, endDate]`. Those agreed on every trip that existed, because the form refused the flights where they disagree. A premise can be load-bearing and false at the same time for years, and the thing that exposes it is usually a fix somewhere else.

## The forks, and where they stand

None of these has been put to the owner yet — the ADR is Proposed and this note is the list to answer from.

1. **The window's new edge.** Recommended and written into §1: the `now` window `deriveNow` already computes. The alternatives (a fixed extra day, re-opening the manual override) are rejected in the ADR with their reasons.
2. **When the archive is handed over.** §3, and the one genuine feel call: `מיד` at ⁦02:31⁩ against `בפתיחה הבאה`. The recommendation is the deferred handover, because ⁦02:30⁩ with the seatbelt sign on is the worst instant for a surface to change by itself — the hazard ADR-0221 §7 named from the other end. The mockup draws both; the measurement is that ⁦163px⁩ of card swaps either way.
3. **Whether to offer extending `trip.endDate`.** Deliberately NOT in this ADR. The app knows both facts and says neither; an offer is ADR-0171 §1's grammar and a silent edit is forbidden. On the backlog.

## What the render caught, which is why the file exists

Three, all recorded in the ADR's Measurements and the catalog entry. The one that is a lesson rather than a slip: **the file typed its own elapsed minutes in the wrong zone** — counted from Rome's ⁦22:10⁩ against a board clock that is Israel's (ADR-0107 §4) — so ⁦01:05⁩ claimed ⁦0:25 שע׳⁩ remaining instead of ⁦1:25⁩, and the `מחר` chip was drawn on exactly the two moments that should not carry it. A file arguing that a clock must be read in its own zone got that wrong inside itself, and only rendering it said so.

## Handoff

The build is unstarted. What it needs: the running-commitment arm in `tripPhase` (`lib/mode.ts`, which needs the trip's events — `ModeProvider` already has them), and `mode-seen` read on the way **out** of Trip as well as in (ADR-0221 §4 wrote only the entry half). Specs pin the clock (`setSimulatedNow`) and both day scopes, per `frontend/CLAUDE.md`: the window holds mid-flight, closes at the landing, never opens early, and a trip ending with a daytime commitment behaves exactly as it does today.
