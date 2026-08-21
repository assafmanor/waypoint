# 2026-08-21 — Notifications phase B: the trip's own commitments

**Built.** ADR-0198's phase B — `event.hard.soon`, `span.edge.soon`, `trip.tomorrow` — plus `notifyObligations` and the second switch on the settings card. Amendments: [ADR-0197 §5](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md), [ADR-0198 §6 and the phase-B build note](../decisions/0198-we-notify-what-you-can-still-miss.md).

Six kinds registered; the catalogue's phases A and B are complete. Nothing in the sweep, the ledger, quiet hours, the caps or the ticker changed to add them — except one fix, which is the interesting half of this note.

## The measurement ADR-0198 §5 asked for, three phases late

§5 said its arithmetic was "computed from the rules, not measured", named the reason (`grep -c dueAt` on the seed returned 0) and made the count **the build's first task**. Phase A gave the seed its dated tasks; phase B gave it a flight and a seven-night stay, so the count was finally possible.

Every one-minute tick of a whole day, three representative days, against the seeded trip's five members — counted as **distinct ledger claims per person**, which is what actually reaches a phone:

| day                                    | sends per person                                   |
| -------------------------------------- | -------------------------------------------------- |
| trip day 3 (a hard 19:30 dinner on it) | 1 `task.digest`, 1 `task.due`, 1 `event.hard.soon` |
| the check-out day                      | 1 `task.digest`, 1 `span.edge.soon`                |
| a pre-trip day                         | **nothing at all**                                 |

That is §5's computed shape, confirmed rather than assumed, and no cap binds anywhere in it. The harness was a throwaway spec against the real seeded Postgres (deliberately not kept: the seed's dates are relative to today, so absolute instants would rot within a day) — the numbers are the artifact, not the script.

## What the measurement found, which no test could see

`task.digest` — shipped in phase A, green, reviewed — produced **60 distinct ledger claims per person per morning**.

Its trigger is a wall clock, so it gates on `hourInZone(nowMs, zone) !== DIGEST_HOUR`. That gate passes for **all sixty minutes** of 08:00, and the kind reported `aimedAtMs: nowMs`. So the `fireKey` — the aimed-at instant bucketed to the minute — was a new value on every tick, the ledger recognised none of them as a repeat, and the only thing standing between a person and sixty identical digests was ADR-0198 §5's **1 per day cap**.

Three things about this are worth writing down:

- **Nothing wrong ever reached a phone.** The cap held, the send went out once. That is precisely why it survived a build, a review and a green suite: the defect's whole expression was 59 wasted claim attempts and a cap doing the ledger's job.
- **The code comment beside it asserted the opposite** — "so `fireKey` is one bucket per morning per trip and the digest cannot go out twice however many ticks fall inside `staleAfterMs`". Written from intent, never counted. This is the root `CLAUDE.md`'s own rule ("count the call sites before claiming what a derivation does") in a form it does not quite cover: the claim was about a derivation's _output_, and the only way to check it was to run the clock.
- **ADR-0198 §5 had already named the symptom** and I had read that sentence twice this week: _"if they bind often, the catalogue is wrong, not the caps."_ A cap binding 59 times a day is that sentence.

Fixed by `hourStartInZone(instantMs, zone)` in `send-policy.ts` — beside `hourInZone`, because that is where the sibling question already lives (root rule 8). It reads the **local minute and second** off the instant and subtracts them, rather than flooring to a UTC hour: `Asia/Kathmandu` is `+05:45`, and a UTC floor would land the bucket 45 minutes into the previous hour there. Its own spec covers the fractional-offset zone and the property that matters — bucketing must never move a send into a different hour.

`trip.tomorrow` was written with the identical shape (19:00, `aimedAtMs: nowMs`) and was fixed before it ever shipped. Both now have a spec that ticks nine / six times across the hour and asserts **one** aimed-at instant. Both mutations (back to `nowMs`) fail exactly their own test; so does flooring `hourStartInZone` to the UTC hour.

**The rule, now in ADR-0197 §5:** a kind triggered by a wall clock keys on the hour it fires for, not on the tick that noticed it.

## The split between the two event kinds is ADR-0164's line, not a new one

`event.hard.soon` skips anything `isAmbient`; `span.edge.soon` requires it. No row is both, and that is what stops a hotel check-in firing twice an hour apart from two kinds that each believe they own it. ADR-0164 drew this line for the day surfaces (a stay's middle days count nothing, its edges are real obligations) and it transfers with no adjustment — which is the argument for the derivation living in `packages/shared` rather than being re-asked here.

## §2's shorthand about the window bounds is only half true, and the code says so

§2 describes `span.edge.soon` as aiming at "`startWindowEnd` when there is a window, else `startsAt` / `endsAt`". ADR-0184 gives an edge two bounds, and **which one is the deadline is not symmetric**:

- At the **start**: `startsAt` is when the desk opens, `startWindowEnd` is when you have to be there by. The window bound is the obligation.
- At the **end**: `endWindowStart` is the **earliest** you may leave, `endsAt` is when you must be out. The window bound is _not_ a deadline at all.

So the kind reads three of the four bounds and ignores `endWindowStart` deliberately. Written down in the source, because a reader counting fields would otherwise "finish" it — which would move a check-out reminder to whenever the desk opens.

The two edges also key apart (`subjectId: '<eventId>:start'` / `':end'`). Their aimed-at minutes differ anyway for any real stay, but only by luck of the data; the subject is the honest discriminator, and one edge's ledger row must not be able to suppress the other's.

## `trip.tomorrow` reads 19:00 at home

It resolves the zone through `currentZone(now, …)`, which before the first crossing is the departure origin — where somebody actually is the evening before they fly. Using `trip.timezone` would put "you travel tomorrow" at 19:00 Tokyo time, i.e. the middle of the night in Tel Aviv, for exactly the trip that most needs the reminder. This is ADR-0197 §5's pre-trip paragraph applied to a kind rather than to a row, and it has its own test.

It is also the one kind whose query starts from `Trip` rather than from an itinerary table, because its subject _is_ the trip. That does not break the inverted loop: a trip starts on exactly one day, so the candidate set is tiny by construction and the SQL window (±a day, generous because which calendar day it is depends on a zone not yet resolved) is followed by an exact day-key check.

## Two generalisations rather than two new files

**`task-audience.ts` → `trip-audience.ts`.** Every line of it was already trip-scoped — the live window (`endDate` plus a day's grace, never the ADR-0040 access window), the roster, the zone — and phase B's kinds need those same three answers about events. Root rule 8 says generalise the one-off rather than write an `event-audience.ts` beside it that could drift on what "live" means. The only task-shaped thing left is `recipients`, and it is task-shaped only in taking an optional assignee: an event passes `null` and gets the whole group, which is what an event's audience always is.

**`event-shape.ts` is new, and it is the same argument one level down.** `EVENT_SELECT`, `eventZone` and `eventDayKey` are three questions all three kinds ask, and `eventZone` in particular has to be the display's own derivation (pin first, then `currentZone`) or a notification prints an hour the screen never showed. Three copies of that is where the second, subtly different answer gets written.

**`notifyLeadMinutesFor` is the reader for §3's new field**, and it goes beside `typicalMinutesFor` in `icons.ts` for the same reason: it reads the event's **refined** profile, so ADR-0063's per-mode overrides keep working and an uncategorised event answers `0` without any call site testing for null.

## The seed needed two events, and one of them exposed a bug in the seed

`ev-flight-out` (transport, ✈️, a 06:20 +03:00 departure) and `ev-hotel-stay` (lodging, seven nights, `startsAt` 15:00 with `startWindowEnd` 22:00, `endsAt` 11:00 with `endWindowStart` 07:00) — one row per phase-B kind, and between them the only fixtures in the repo that can exercise a window bound.

They did not appear until the event map was fixed: it wrote `date: date(DAY)` unconditionally, so a per-event `date` was silently overwritten and both new rows landed on the trip's third day. Now `date: e.date ?? date(DAY)`. Every event also carries an explicit `category`, which phase B needs and which nothing had needed before.

`trip.tomorrow` is the one kind the seed still cannot exercise: the demo trip is deliberately in progress. It is covered by fake-prisma specs (the hour, the home zone, day 2, the first timed thing, the absence of one), and making the seed's trip start tomorrow would cost every other surface its "day 3" fixture.

## What is still owed

- **The lock-screen device pass**, on both platforms — ADR-0198 §7 requires it before phase A is called done, and phase B adds two more strings that end in a time. No sandbox can do it.
- **Phase C** — `readiness.nudge` at T-14/T-7/T-2, and the flight check-in as an automatic task rather than a send.
- **Phase D** stays leaned-against, and `notifyGroup` is undrawn until it is decided.
