# 0198 — We notify what you can still miss, and each thing fires once

**Status:** Proposed (2026-08-20) — the catalogue half of the notifications epic. The infrastructure half is [0197](0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md).
**Date:** 2026-08-20

**Relates:** [0011](0011-hard-soft-event-model.md) (**the whole filter** — §1) · [0164](0164-a-spans-own-edge-is-something-you-can-still-miss.md) (the set this borrows, name and all) · [0063](0063-category-time-behaviour-profile.md) (the closed table the lead times extend — §3) · [0081](0081-group-change-feed.md) (which already rejected a toast per peer change — §5) · [0190](0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md) / [0191](0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md) / [0193](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) (readiness as tasks, and the urgency ladder a send inherits) · [0194](0194-a-task-deadline-can-pin-its-zone.md) (a pinned deadline zone) · [0196](0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md) (a child cannot be dated, so it is vacuously un-notifiable) · [0006](0006-no-live-location-v1.md) + [0106](0106-maps-and-places-epic-scope-and-phasing.md) (why "leave now" is not in this catalogue — §4) · [0009](0009-docs-english-ui-hebrew.md) / [0118](0118-numbers-in-hebrew-bidi.md) (the copy, and the lock screen that ignores our bidi machinery)

## Context

A notification is the only thing this app does that a person cannot decline by not looking. Every other surface is opt-in by attention; this one spends it. So the catalogue is written as a **budget**, and the default answer to "should we notify this?" is no.

The app already knows which of its own facts are obligations, and it did not need a new taxonomy to find out. ADR-0164 asked _"what can you still miss today"_ and answered it precisely: top-level blocks still ahead of you, **plus an ambient span's own edge** — a 15:00 check-in with luggage, an 11:00 check-out, a 10:00 car return. The middle nights of a hotel stay count nothing, because nothing about the room needs doing on them.

That is the notification set. This ADR is mostly the discipline of not adding to it.

## Decision

### 1. The filter is ADR-0011, applied literally

**A notification is only ever about a timed obligation you can still breach.** Three sources, and nothing else:

| notifiable                                 | why                                                         |
| ------------------------------------------ | ----------------------------------------------------------- |
| a **hard** event (ADR-0011)                | a real commitment: a flight leaves without you              |
| an **ambient span's own edge** (ADR-0164)  | check-in, check-out, pick-up, return — timed and breachable |
| a **task deadline** someone owes (`dueAt`) | a person stated the obligation themselves                   |

**A soft event is never notified. Not once, not ever, not as a preference.** ADR-0011 says a soft item is free to move, slip and be skipped — so a ping about one interrupts a person to tell them about something that is, by definition, fine to ignore. This is the line that keeps the budget honest, and it disposes of most of the ideas that will be proposed for this pipe.

Corollaries that fall out for free, none of which need code:

- **A hotel's middle night, a multi-day hire's middle day: nothing.** ADR-0164's measurement already says so.
- **A sub-task cannot be notified** — ADR-0196 refuses it a deadline, so it is un-notifiable by construction rather than by a guard. (Its parent can be.)
- **A settled or dismissed row is not notified**, and a task settled between the sweep's read and the send is dropped at the last check.
- **A past trip (ADR-0040) sends nothing.** Membership and the access window are read at send time (ADR-0197 §2.4).

### 2. The catalogue

Every row: what fires it, how far ahead, who gets it, whether it may break quiet hours (ADR-0197 §5), and how long it is still worth sending after a missed tick.

**Phase A — tasks. The first consumer, because it is the only place the app already shows a deadline and delivers nothing against it.**

| kind            | fires                                                           | audience                                                                      | critical                      | staleAfter |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- | ---------- |
| `task.due`      | at `dueAt`, when `dueHasTime`                                   | the assignee; **the whole group when `assigneeUserId` is null** ("one of us") | no                            | 3 h        |
| `task.digest`   | **08:00 local**, if anything is open and dated today or overdue | each member, for their own set                                                | no (it is a fixed local hour) | 2 h        |
| `task.assigned` | on assignment, when the actor is not the assignee               | the assignee                                                                  | no                            | 6 h        |

- **An undated task is never notified.** No deadline, no obligation instant, nothing to be late for.
- **`dueHasTime: false` does not fire `task.due`** — "Thursday" is not a moment, and the schema keeps that distinction deliberately (`dueAt` alone cannot tell "Thursday" from "Thursday 00:00"). Undated-with-a-day tasks are the digest's business.
- **No overdue nag.** A second send saying the same thing is the pattern that trains people to swipe notifications away, and the digest already reports it the next morning. Recorded as rejected so it is not proposed as a "small addition".
- **`task.assigned` is the one social send in the catalogue**, and it earns its place by being _addressed_: someone put your name on something. ADR-0081's rejection was of ambient awareness, which this is not. Dedup on the assignee, so passing a task back and forth does not multiply.

**Phase B — the trip's own commitments.**

| kind              | fires                                                                                                         | audience                 | critical | staleAfter |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ | -------- | ---------- |
| `event.hard.soon` | `startsAt` minus the category's lead (§3)                                                                     | every member of the trip | **yes**  | 1 h        |
| `span.edge.soon`  | 60 min before a span edge landing today (`startWindowEnd` when there is a window, else `startsAt` / `endsAt`) | every member             | **yes**  | 30 min     |
| `trip.tomorrow`   | **19:00 local**, the evening before day 1                                                                     | every member             | no       | 3 h        |

- **Only hard events**, per §1. A soft dinner idea at 20:00 sends nothing.
- **The window bounds are used when they exist** (ADR-0184): a check-in that reads 17:00–21:00 is a deadline at 21:00, not an appointment at 17:00, so `span.edge.soon` aims at the **closing** bound — the moment you can actually miss.
- **`timeCritical` on both**, which is what lets a 05:30 departure ring at 04:00 (ADR-0197 §5). This is the whole reason that flag exists.

**Phase C — pre-trip readiness, and this is where an automatic task replaces a notification kind.**

The obvious design here is a `flight.checkin` notification at departure minus 24 h. **Rejected, and replaced by something better:** we do not store the airline's check-in window, so a send claiming "check-in is open" would be a guess printed as a fact. Instead, **a flight booking mints an automatic task** — "check in for the flight", deadline = departure minus 24 h — which then rides `task.due` for free and, more importantly, appears in Plan, in the Index, on the host booking's own section, and can be **ticked**. That is ADR-0190's rule already decided for readiness ("a readiness check is a task row") applied one row further, and it means the reminder is visible to somebody who never enabled notifications at all.

| kind              | fires                                                                                         | audience                        | critical | staleAfter |
| ----------------- | --------------------------------------------------------------------------------------------- | ------------------------------- | -------- | ---------- |
| `readiness.nudge` | **10:00 local** at **T-14 / T-7 / T-2 days**, only if a check (ADR-0190's five) is still open | every member                    | no       | 4 h        |
| —                 | flight check-in                                                                               | (an automatic task, not a send) |          |            |

Three milestones, not a daily countdown, and each names only what is **still missing** ("חסרים: לינה, מסמכים"). A nudge that repeats every day about a thing nobody has done yet is a nag with a calendar.

**Phase D — group awareness, deliberately last and deliberately thin.**

| kind             | fires                                                                                                  | audience                      | critical | staleAfter |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | -------- | ---------- |
| `group.imminent` | at most **once per hour per trip**, batched, when a peer changed something dated **today or tomorrow** | every member except the actor | no       | 1 h        |

This is ADR-0081's feed with two additions that answer its own rejection of a toast: a **time filter** (only what is about to happen to you) and a **batch** (one send, `נועם שינה 2 דברים במסלול של מחר`). Everything further out stays in the change feed, unpushed, where that ADR put it. **This phase may also simply never ship** — it is the only row in the catalogue whose absence costs nobody an obligation.

### 3. The lead time is a field on a table that already exists

`event.hard.soon` needs "how far ahead". That is per-category, and `CATEGORY_TIME_PROFILE` in `packages/shared/src/icons.ts` is already the closed per-`EventCategory` lookup every time-aware surface reads (ADR-0063). So it gains **one field** rather than a new table beside it:

```ts
notifyLeadMinutes: number; // 0 = this category is not notified ahead of time
```

Seed values, and they are a starting point in ADR-0063's own sense (tunable, closed set of nine):

| category                                     | lead    | why                                                                                                                                                |
| -------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transport`                                  | **120** | an airport is the one place where two hours is not paranoid                                                                                        |
| `lodging`                                    | **60**  | a check-in you are late for is a phone call, not a lost ticket                                                                                     |
| `activity`, `services`                       | **60**  | a booked slot with a person waiting                                                                                                                |
| `food`                                       | **30**  | a reservation, and only when it is `hard`                                                                                                          |
| `sightseeing`, `nature`, `shopping`, `other` | **0**   | notified only if hard **and** timed, and then §2's row does not fire ahead — these are rarely hard, and when they are, the day surfaces carry them |

Extending the table rather than adding one is the point (root rule 8): a tenth category, or a per-**mode** override the way ADR-0063's amendment gave flights their own transition words, is then a one-line addition and not a second lookup that can disagree with the first.

### 4. What this catalogue deliberately does not contain

Each of these is a real idea, rejected with the condition that would reopen it — so the next session does not re-derive them.

- **"Leave now" / travel-time departure alerts.** The most-wanted notification in any travel app, and we cannot make it true: it needs travel time (Routes API — not built, ADR-0106/0108's later phases) **and** the traveller's position (ADR-0006 refuses live location in v1). Without both, "leave in 10 minutes" is a guess, and a wrong one is precisely the send that gets the whole feature switched off. **Reopens when** both exist, and then it belongs to `event.hard.soon` as a dynamic lead rather than as a new kind.
- **A soft plan starting, or slipping** (ADR-0027's shelf/slip). §1.
- **A per-change ping.** Rejected once already (ADR-0081), for reasons that did not change.
- **Somebody joined / left the trip.** Visible on the roster, and nobody is late for it.
- **A document was uploaded, a note was written, an idea was added to the shelf.** Content, not obligation.
- **An FX rate moved, a place got enriched.** ADR-0180 §8 dropped even the on-screen indicator; a push about it would be absurd.
- **A passport expiring inside six months of travel** — the one genuinely valuable pre-trip check we cannot do: `DocumentType.passport` carries no expiry field. Reopens if documents ever gain typed fields, and it is a **task** then, not a send (§C's pattern).
- **Weather.** A pipe we do not have, and an obligation it is not.

### 5. Volume: a budget with a number in it

**At most 4 sends per person per day during a trip, at most 1 per day before it.** Enforced at send time off `NotificationSend`'s `(userId, sentAt)` index (ADR-0197 §10), and when the cap binds, the survivors are chosen by the urgency the app already ranks with — `timeCritical` first, then ADR-0193/`sortTasks`' ladder (overdue, today, later). A dropped send is dropped, not deferred: it would arrive as a lie about the time.

**The arithmetic below is computed from the rules, not measured** — and the measurement is not available, which is itself a finding: `backend/prisma/seed.mjs` has **no dated tasks at all** (`grep -c dueAt` → 0), so nothing in the repo can currently exercise a single row of this catalogue. **The build's first task is therefore to give the seed a dated, assigned, partly-overdue task set and a flight, then count what one simulated trip day actually produces.** ADR-0180 §7 made the same move for a currency provider, for the same reason: a number from a document is not evidence.

The computed shape of a typical trip day: one `task.digest` at 08:00, zero-to-two `task.due`, one `event.hard.soon` if the day has a hard commitment, occasionally one `span.edge.soon` on a checkout day. That is 2–4, which is why the cap is 4 and not 10 — the cap should bind only on a day that is genuinely unusual, and if it binds often the catalogue is wrong, not the cap.

### 6. Preferences: three switches, and quiet hours are not one of them

On `User` (so they follow a person to a new phone, like `preferredCurrency`), through the existing `PATCH /me` and `updateMeSchema` — not a new settings entity:

- **`notifyObligations`** — Phase B, the trip's own commitments.
- **`notifyTasks`** — Phase A.
- **`notifyGroup`** — Phase D, defaulting **off** if D ships at all.

Plus the platform's own on/off, which is the permission itself and lives on the device (ADR-0197 §7).

**Quiet hours are constants, not preferences** (22:00–07:00, ADR-0197 §5). A per-user pair of times is three more fields, a validation surface and a zone question, to serve a disagreement nobody has voiced — and the one case that would need it, an early flight, is already handled by `timeCritical` overriding the window entirely. **Per-device preferences** (a work phone that wants only obligations) are likewise deferred: the subscription is per device but the preference is per person, and at ~5 people per trip nobody has asked for the difference.

**No in-app duplicate of a push.** Every one of these obligations already has a home on a screen — the board, the glance rail's `נותרו היום`, the task bands, the readiness checks. A notification is a **way in** to a surface that already exists, never a second inbox, which is ADR-0004's rule reaching a channel it was not written about.

### 7. The copy, and the one thing about it that is not the app's usual problem

Hebrew, no em dashes, `·` as the separator (root `CLAUDE.md`), under a new `notify` namespace in `i18n/he.ts`. Shape: **the title is the kind of obligation, the body is the subject** — the reverse reads as an advert.

| kind              | title                             | body                                   |
| ----------------- | --------------------------------- | -------------------------------------- |
| `task.due`        | `משימה להיום`                     | `צילום דרכונים · עד 18:00`             |
| `task.digest`     | `3 דברים לסגור היום`              | `צילום דרכונים, ביטוח נסיעות ועוד אחד` |
| `task.assigned`   | `דנה הטילה עליך משימה`            | `צילום דרכונים · עד יום ה׳`            |
| `event.hard.soon` | `הטיסה בעוד שעתיים`               | `תל אביב · טוקיו · 14:35`              |
| `span.edge.soon`  | `צ׳ק-אאוט עד 11:00`               | `Hotel Nikko`                          |
| `trip.tomorrow`   | `נוסעים מחר`                      | `הטיסה ב-06:20`                        |
| `readiness.nudge` | `עוד שבוע לטיסה`                  | `חסרים: לינה, מסמכים`                  |
| `group.imminent`  | `נועם שינה 2 דברים במסלול של מחר` | (no body)                              |

**And the part that is genuinely new:** the operating system draws these strings, so **none of ADR-0118's bidi isolation reaches them** — `lib/bidi.ts`, the LTR islands, the `dir` attributes are all app-side. A Hebrew string that ends in a time can reorder on a lock screen in a way the app never shows. Hence the digits sitting mid-string above, `·` instead of parentheses or arrows around numbers, and a **device pass on both platforms' lock screens** before Phase A ships — the sense in which ADR-0146 means a thing must be seen on a phone, not drawn in a mockup.

## Consequences

- **The set of notifiable things is closed and derived**: hard events, span edges, task deadlines. A proposal to notify anything else has to argue with ADR-0011 first, which is a much shorter conversation than arguing about taste.
- **`CATEGORY_TIME_PROFILE` gains `notifyLeadMinutes`** — one field on a table nine rows long, so a category's lead is declared where its other time behaviour already is.
- **The flight check-in reminder is a task, not a notification** — which is why it works for a user who never granted permission, and why it can be ticked. Expect this pattern to absorb the next two "we should notify X before Y" requests as well.
- **`User` gains three booleans**; `PATCH /me` and `updateMeSchema` carry them; no new settings entity.
- **The seed is a blocker for Phase A**, not a nice-to-have: nothing here is testable against fixtures that contain no deadlines.
- **Quiet hours, the daily cap and the leads are all constants in one place**, so the tuning pass ADR-0146 taught this repo to expect is an edit to a table rather than a hunt.
- **Phase D may never ship, and that is a stated outcome rather than a slip.**

## Alternatives considered

- **Notify soft events too, behind a preference.** Rejected: it makes the preference the thing that protects the user from us, and a default-off switch nobody finds is just dead code. ADR-0011 is a better filter than a checkbox.
- **One `task.due` per task with no digest.** Rejected on the count: five people with three dated tasks each on a travel morning is a burst, and the burst is what gets the permission revoked. The digest is one send that answers the same question.
- **A daily countdown before the trip** (T-14 through T-1). Rejected: nine sends to say the same sentence, and the readiness surface already shows it continuously. Three milestones is the compromise, and even those are conditional on something being open.
- **Per-trip preferences** rather than per-user. Rejected as premature (ADR-0065's grow-later posture cuts both ways): a person who wants different treatment for two simultaneous trips is a case nobody has, and `Membership` already carries one preference (`calendarSyncEnabled`) that nothing reads.
- **Send the change feed, filtered by nothing.** ADR-0081 rejected the toast; this ADR does not reopen it, it narrows it to §D's batched, imminent-only slice and admits that slice may not be worth building.
