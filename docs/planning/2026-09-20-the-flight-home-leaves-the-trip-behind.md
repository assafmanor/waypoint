# 2026-09-20 — The flight home leaves the trip behind

**Outcome:** [ADR-0236](../decisions/0236-the-trip-is-live-while-its-last-commitment-is.md) (**built the same day, in three passes** — §1–§5 on #860, §6 on #861, §7 on the map after that; the ADR and mockup came first, on the owner's instruction) · [`mockups/the-trip-is-live-while-its-last-leg-is-v1.html`](../../mockups/the-trip-is-live-while-its-last-leg-is-v1.html) · README row · catalog entry · backlog line updated. The form half of the same session shipped separately: [ADR-0203](../decisions/0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md)'s fifth build log and [ADR-0083](../decisions/0083-whenfield-datetime-standard.md)'s amendment.

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

**One surface needed nothing; two did — and the first answer to the owner got that wrong.** Nothing is placed on a day the trip does not have (a span is filed under the day it STARTS, ADR-0037 §1) and the shared projection is genuinely untouched. But "the day surfaces are fine" was written from the `date`/`endDate` reasoning without checking `isAmbient`, and it is wrong: `transport` is `ambientWhenMultiDay`, the leg has an `endDate`, so both day screens exclude it from `dayEvents` and it renders as ADR-0064 §B's two transition points — the arrival dated to `endDate`, a day the trip does not have.

**This is root `CLAUDE.md`'s own rule catching the session that was quoting it:** _"Count the call sites before claiming what a derivation does. 'This doesn't affect X' written from memory is a coin flip, and it stays a coin flip when it happens to land right."_ One `grep` for `ambientWhenMultiDay` turned it into a fact. The correction is ADR-0236 §4, and the owner's question is what forced it — the second time in this session that reading the screen beat reading the diff.

**The board was a window bug, not a missing surface**, and the three things that made the change smaller are all in the ADR. The one worth repeating here is the shape of the mistake: **ADR-0040 argued the right rule and implemented a different one.** Its prose says _"Trip mode has no 'now' to stand on"_; its code says `today ∈ [startDate, endDate]`. Those agreed on every trip that existed, because the form refused the flights where they disagree. A premise can be load-bearing and false at the same time for years, and the thing that exposes it is usually a fix somewhere else.

## The forks, and where they stand

None of these has been put to the owner yet — the ADR is Proposed and this note is the list to answer from.

1. **The window's new edge.** Recommended and written into §1: the `now` window `deriveNow` already computes. The alternatives (a fixed extra day, re-opening the manual override) are rejected in the ADR with their reasons.
2. **When the archive is handed over.** §3, and the one genuine feel call: `מיד` at ⁦02:31⁩ against `בפתיחה הבאה`. The recommendation is the deferred handover, because ⁦02:30⁩ with the seatbelt sign on is the worst instant for a surface to change by itself — the hazard ADR-0221 §7 named from the other end. The mockup draws both; the measurement is that ⁦163px⁩ of card swaps either way.
3. **Whether to offer extending `trip.endDate`.** Deliberately NOT in this ADR. The app knows both facts and says neither; an offer is ADR-0171 §1's grammar and a silent edit is forbidden. On the backlog.

## What the render caught, which is why the file exists

Three, all recorded in the ADR's Measurements and the catalog entry. The one that is a lesson rather than a slip: **the file typed its own elapsed minutes in the wrong zone** — counted from Rome's ⁦22:10⁩ against a board clock that is Israel's (ADR-0107 §4) — so ⁦01:05⁩ claimed ⁦0:25 שע׳⁩ remaining instead of ⁦1:25⁩, and the `מחר` chip was drawn on exactly the two moments that should not carry it. A file arguing that a clock must be read in its own zone got that wrong inside itself, and only rendering it said so.

## The follow-up that became §6

Later the same day, with the first and last day side by side:

> What about the day view and plan day? What will the arrival look like? At what date?

…and then, on seeing them:

> why does the flight back look different than the outward flight?

Both are shape questions about a surface the session had just changed, and both found something. The first produced §4 (the arrival had no day at all). The second produced §6, and the useful part is what it cost to get right: **the app's existing exemption was the obvious reach and the wrong one.** `isAmbient(e) && !isJourney(e)` is at three call sites already and reads like the answer; it would have drawn a within-trip red-eye as a card on its departure day AND as two transition rows across two days. The question §6 asks is how many day surfaces a span's ends are spread across — which is `endHostDay`, the function §4 had just written.

## The third pass, which is the same correction a third time

The owner, on the trip's last day with the map open:

> there's still an issue with the map regarding this issue, see that it shows only one leg of the flight on the map

**The ADR had already answered this, and answered it wrong.** E26 said the Map's day scope is untouched — its clock reads `liveToday` for "where are you standing", which is a different question from "which day of the trip is it". That is true, and it is about the clock. The **pins** ask a third question: which day of the trip does this place's reference land on. `routeEndpointDay` dated the flight's destination to `endDate`, so on the last day it was a `ghost` — dimmed, filed under a day the strip has no chip for — and the tab drew the departure airport alone.

So the session's own rule landed on it a second time: **the claim "X is untouched" needed one `grep` and did not get one.** `routeEndpointDay` has three consumers and two of them are day-scoped; they were in plain sight. The pattern across all three passes is the same and worth naming once: every one of the four defects was found by the owner **looking at a surface**, and in each case the code had the answer available to anyone who counted.

Two things were riding underneath the missing pin and neither was in the report: the row said nothing about which day the landing falls on (day-scoped silence reads as "today"), and the arrival was structurally unsettleable, because `unreached` is `refDate > today` and the reference was dated past the trip's own end.

**No new mockup frame.** §4's already draws this landing and this word; §7 adds a consumer, not a decision. What it claims — that the map row and the day row say the same thing — is pinned by a spec asserting the day list's own `t.journey.nextDay` inside `.map-ref-meta`.

## Handoff

Built and merged: §1–§5 (#860), §6 (#861), §7 on the map. Still deliberately open, on the backlog: `buildDayGlance`'s `!isAmbient` filter (Home's rail draws such a leg as anchor ticks, and no number disagrees); offering to extend `trip.endDate` when a journey lands past it; the older path where **shrinking** a trip's dates strands events outside the new range with nothing in the backend to stop it.
