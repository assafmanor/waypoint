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

  > **AMENDED 2026-09-03.** "Settled" was read off the row's stored `status`, and for a **parent** that column is never written — [ADR-0196 §2](0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md) derives a checklist's completion from its steps and stores nothing, on purpose. So a checklist finished in June was still `open` in Postgres, and `task.digest` named it every morning after. The parenthesis above — _"(Its parent can be.)"_ — is the sentence that turned out to need a second half: **its parent can be, until its steps say otherwise.** The kinds now resolve that through the same shared derivation the screens use; the amendment in ADR-0196 §2 carries the reasoning and the general shape.

- **A past trip (ADR-0040) sends nothing.** Membership is read at send time (ADR-0197 §2.4), and the sweep's filter is `endDate >= today`.
- **A trip that has not started sends everything in phase A** (owner, 2026-08-20: _"we should be able to send reminders for due tasks even before the trip, we don't want to miss any upcoming"_). Nothing in this catalogue is gated on Trip mode, and it would be backwards if it were: **pre-trip is where task deadlines actually live** — the visa appointment, the passport photos, the currency, the check-in — and it is the window where forgetting still costs something recoverable. ADR-0040 decides which **mode** a trip is in, not whether its obligations are real. Phase B's rows are simply silent before departure because there is nothing timed yet, which is a property of the data and not a rule.

### 2. The catalogue

Every row: what fires it, how far ahead, who gets it, whether it may break quiet hours (ADR-0197 §5), and how long it is still worth sending after a missed tick.

**Phase A — tasks. The first consumer, because it is the only place the app already shows a deadline and delivers nothing against it.**

| kind            | fires                                                           | audience                                                                      | critical                      | staleAfter |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- | ---------- |
| `task.due`      | at `dueAt`, when `dueHasTime`                                   | the assignee; **the whole group when `assigneeUserId` is null** ("one of us") | no                            | 3 h        |
| `task.digest`   | **08:00 local**, if anything is open and dated today or overdue | each member, for their own set                                                | no (it is a fixed local hour) | 2 h        |
| `task.assigned` | on assignment, when the actor is not the assignee               | the assignee                                                                  | no                            | 6 h        |

- **An undated task is never notified.** No deadline, no obligation instant, nothing to be late for.
- **`dueHasTime: false` does not fire `task.due`** — "Thursday" is not a moment, and the schema keeps that distinction deliberately (`dueAt` alone cannot tell "Thursday" from "Thursday 00:00"). **A dated-no-time task is the digest's job, and this is the pre-trip case, not an edge one**: most of what a person writes weeks out is a day without an hour. So the digest is the mechanism that makes the owner's requirement true, and it is worth being explicit that it counts them rather than leaving it implied.
- **The digest names today and tomorrow**, in that order, and that one addition is what closes "we don't want to miss any upcoming" without a second send: a deadline three days out is not silent, it is simply not urgent yet, and the morning it becomes tomorrow's problem it is named in a send that was already going out. A look-ahead of one day and not three — a list of everything eventually due is the backlog, and the app has surfaces for that.
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

  > **⚠ REOPENED 2026-08-26 — both conditions are met, and one of them was never true.** The owner
  > raised it independently, wanting `תתחילו להתכונן ליציאה · כדאי לצאת לפני X`.
  >
  > **Travel time exists.** [ADR-0205](0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md)
  > /[0206](0206-a-travel-time-belongs-between-two-points.md) built it, and not through the Routes
  > API this bullet was waiting on — it is OSM-derived, cached per place-pair, and free. `leaveBy` is
  > a shipped derivation in `@waypoint/shared`.
  >
  > **And the position premise was wrong when written.** ADR-0006 puts **own-device** location _in_
  > v1 — _"always available, privately, on-device"_ — and defers only member-to-member sharing.
  > `lib/useGeolocation.ts` has shipped since ADR-0109 §6. This is the same misreading the routes
  > epic's own design session made and corrected (M3 session note §9.2); it is recorded twice now
  > because it has cost two sessions.
  >
  > **What survives unchanged is the reason for the caution, and it is the load-bearing part:** _"a
  > wrong one is precisely the send that gets the whole feature switched off."_ §D5 of ADR-0206 is
  > the same rule from the other side — an OSM walking estimate is an estimate, so a send must
  > hedge as the app's own surfaces do. And ADR-0206 §Z6's departure buffer already exists for it.
  >
  > **Three things the reopen has to settle, none of which this bullet's "dynamic lead" answers:**
  >
  > 1. **One send or two.** The owner asked for a _prepare_ beat as well as a _leave_ beat. This
  >    bullet assumed one. Two is a different object: a dynamic lead makes `event.hard.soon` fire
  >    earlier, it does not make it fire twice.
  > 2. **Volume.** §5 exempts `event.hard.soon` from every cap because _"a flight does not wait for
  >    a quota"_. That exemption was granted for a handful of hard commitments, **not** for two sends
  >    per stop across a day of stops. A travel-aware lead on a soft-event day is the case §5 never
  >    priced, and it is the one that could make the app a nag.
  > 3. **Which events qualify.** §1's filter is ADR-0011 applied literally: hard events only. But
  >    the leave-by is most useful for the _soft_ stop you will otherwise drift past — and admitting
  >    soft events reopens §1, which is this ADR's foundation. **Do not assume either answer.**
  >
  > **Still blocked, and not on routes:** ADR-0197's sweep is designed and **nothing is built**, so
  > there is no pipe to send down. This belongs to the notifications epic when that starts, not to a
  > routes milestone — the dependency runs that way round.

- **A soft plan starting, or slipping** (ADR-0027's shelf/slip). §1.
- **A per-change ping.** Rejected once already (ADR-0081), for reasons that did not change.
- **Somebody joined / left the trip.** Visible on the roster, and nobody is late for it.
- **A document was uploaded, a note was written, an idea was added to the shelf.** Content, not obligation.
- **An FX rate moved, a place got enriched.** ADR-0180 §8 dropped even the on-screen indicator; a push about it would be absurd.
- **A passport expiring inside six months of travel** — the one genuinely valuable pre-trip check we cannot do: `DocumentType.passport` carries no expiry field. Reopens if documents ever gain typed fields, and it is a **task** then, not a send (§C's pattern).
- **Weather.** A pipe we do not have, and an obligation it is not.

### 5. Volume: a budget with a number in it

**The cap is per source, not per trip phase — we ration what WE decided to say, never what YOU asked to be reminded of.** That is the rule; the numbers follow from it:

| source                                                             | cap                                                               | why                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **someone typed the deadline** (`task.due`, `task.assigned`)       | **6 / person / day**                                              | a person set this time on purpose; suppressing it is us overruling them. 6 is a safety ceiling against a pathological day, not a budget |
| **the app decided to speak** (`readiness.nudge`, `group.imminent`) | **1 / person / day**                                              | this is the one that nags, so this is the one that is rationed                                                                          |
| **the digest** (`task.digest`)                                     | **1 / person / day**, and it does not count against the row above | it exists to _replace_ sends, so charging it like a nudge would be backwards                                                            |
| **`timeCritical`** (`event.hard.soon`, `span.edge.soon`)           | **uncapped**                                                      | a flight does not wait for a quota                                                                                                      |

**An earlier draft of this ADR said "4 per day in trip, 1 per day before it", and that was wrong in the direction that matters** (owner, 2026-08-20). A pre-trip day with two real deadlines would have dropped one, and it would have dropped it by a rule about _where the traveller is standing_ rather than about _what they owe_ — which is the same conflation ADR-0040 §3 already warns against. Pre-trip is not a quieter phase, it is the phase where the tasks are.

Enforced at send time off `NotificationSend`'s `(userId, sentAt)` index (ADR-0197 §10). When a cap binds, the survivors are chosen by the urgency the app already ranks with — `timeCritical` first, then ADR-0193/`sortTasks`' ladder (overdue, today, later). A dropped send is dropped, not deferred: it would arrive as a lie about the time.

**The arithmetic below is computed from the rules, not measured** — and the measurement is not available, which is itself a finding: `backend/prisma/seed.mjs` has **no dated tasks at all** (`grep -c dueAt` → 0), so nothing in the repo can currently exercise a single row of this catalogue. **The build's first task is therefore to give the seed a dated, assigned, partly-overdue task set and a flight, then count what one simulated trip day actually produces.** ADR-0180 §7 made the same move for a currency provider, for the same reason: a number from a document is not evidence.

The computed shape of a typical **trip** day: one `task.digest` at 08:00, zero-to-two `task.due`, one `event.hard.soon` if the day has a hard commitment, occasionally one `span.edge.soon` on a checkout day. Of a typical **pre-trip** day: usually **nothing at all**, because most weeks contain no deadline; one digest and a `task.due` on the days that do; one `readiness.nudge` on three days in the whole run-up. So the caps above should bind almost never — and if they bind often, the catalogue is wrong, not the caps.

### 6. Preferences: three switches, and quiet hours are not one of them

On `User` (so they follow a person to a new phone, like `preferredCurrency`), through the existing `PATCH /me` and `updateMeSchema` — not a new settings entity:

- **`notifyObligations`** — Phase B, the trip's own commitments.
- **`notifyTasks`** — Phase A.
- **`notifyGroup`** — Phase D, defaulting **off** if D ships at all.

Plus the platform's own on/off, which is the permission itself and lives on the device (ADR-0197 §7).

**Quiet hours are constants, not preferences** (22:00–07:00, ADR-0197 §5). A per-user pair of times is three more fields, a validation surface and a zone question, to serve a disagreement nobody has voiced — and the one case that would need it, an early flight, is already handled by `timeCritical` overriding the window entirely. **Per-device preferences** (a work phone that wants only obligations) are likewise deferred: the subscription is per device but the preference is per person, and at ~5 people per trip nobody has asked for the difference.

**Amended 2026-08-21 (phase 1b's mockup): TWO switches, not three, and they arrive with the kind they gate.** `notifyGroup` is not drawn at all until phase D is decided — and this ADR itself leans against building D — because a preference for a feature that may never arrive is a promise, not a control. The other two are real switches over inert kinds until phases 4 and 5 register them, which this screen's own history already ruled on: [ADR-0133](0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) §7 rejected a theme toggle on the grounds that _"a switch that does nothing is worse than a thin page"_ and let it back in only once the remap made it real. So **the preferences card ships with the kind it gates** — `notifyTasks` with phase 4, `notifyObligations` with phase 5 — while the device card (permission, subscription, the device list) ships as soon as it is built, because subscribing is a real action with a provable effect. The `User` fields, `PATCH /me` and `updateMeSchema` are unchanged — the amendment is about when the switches appear, not about what they are. **Both are now on the card** (`notifyTasks` with phase A, `notifyObligations` with phase B), which is the whole of what this screen offers until phase D is decided.

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

#### 7.1 AMENDED IN BUILD (2026-08-21, phase A) — two corrections, and one of them is about a person

**The copy lives on the SERVER, not in `i18n/he.ts`.** This section said the latter, and it cannot: [ADR-0197](0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) §6 shipped first and made `PushPayload` carry `title` and `body` as **finished strings**, so whoever sends is whoever composes — and that is the sweep. Composing in the service worker instead would mean inlining `i18n/he.ts` (2,600 lines) into a bundle on the critical path of every install, which is the exact cost `push.ts` already refuses zod for, or keeping a second copy of these strings. So `backend/src/notifications/notify-copy.ts` is the one place the backend holds user-facing Hebrew. What would change under a second locale: the sweep would need the recipient's locale — a `User` column and a lookup — not a rewrite. The app is Hebrew-only (ADR-0009) and scaffolding for otherwise would be fiction.

**And `task.assigned`'s line is gone, because it guessed a person's gender from their name.** The table above reads `דנה הטילה עליך משימה` — a feminine verb inflected from the name, about a real user, out of a field the app does not have and should not infer. Hebrew has no neutral form of that verb, so the fix is not a different inflection but a construction with none in it:

| kind            | title               | body                              |
| --------------- | ------------------- | --------------------------------- |
| `task.assigned` | `משימה חדשה בשבילך` | `צילום דרכונים · עד יום ה׳ · דנה` |

It stays **addressed** — which is what earns this send its place against ADR-0081's rejection of ambient awareness — because the title says בשבילך and the body says who. There is a test that keeps the verb out.

**And the part that is genuinely new:** the operating system draws these strings, so **none of ADR-0118's bidi isolation reaches them** — `lib/bidi.ts`, the LTR islands, the `dir` attributes are all app-side. A Hebrew string that ends in a time can reorder on a lock screen in a way the app never shows. Hence the digits sitting mid-string above, `·` instead of parentheses or arrows around numbers, and a **device pass on both platforms' lock screens** before Phase A ships — the sense in which ADR-0146 means a thing must be seen on a phone, not drawn in a mockup.

## PHASE A BUILT (2026-08-21) — [session note](../planning/2026-08-21-notifications-phase-a-and-the-settings-surface.md)

`task.due`, `task.digest` and `task.assigned` are registered and firing; the settings surface ADR-0197 §7.1 designed is built beside them, because a switch and the thing it switches had to ship together.

**One column had to be added, and it is not a retreat from ADR-0197 §3.** `Task.assignedAt`. The sweep derives schedules from state, which works because a deadline _is_ a state — and "you were just assigned this" is not: no combination of `updatedAt` and `assigneeUserId` can tell it from a title edit. So the **fact** is recorded where the actor is known and the **send** stays derived. It is null when somebody assigns themselves, which is how this ADR's "when the actor is not the assignee" rule is enforced exactly rather than guessed from `updatedBy` by the sweep; null on un-assign, which retracts a send that has not gone out; and null for every task written before the column, which is right — an assignment nobody could be told about is not news.

**Two per-kind policies joined the interface, both for the reason `timeCritical` is there: a kind must not be able to forget.** `pref` names the switch that turns a kind off, enforced by the sweep in one batched query, so a kind that declares none is visibly un-declinable rather than accidentally so. `dedup` chooses the ledger identity: `BY_SUBJECT` for `task.assigned`, which is what makes §2's "passing a task back and forth does not multiply" true — with the default (the aimed-at minute) an A→B→A→B hand-off would send four times.

**§6's three switches are one.** `notifyTasks` ships with the kinds it gates. `notifyObligations` waits for phase B, `notifyGroup` for a phase this ADR leans against building — see the §6 amendment.

**The digest is the kind whose trigger is a wall clock**, and it stays inside the inverted loop by asking in this order: which trips have an open dated task at all (one indexed scan), then zones for only those, then which of them are at 08:00. So it costs what the trips with something to report cost, never what all trips cost.

**Still owed: the lock-screen device pass** this section requires before phase A is called done. It cannot be done from a sandbox — both platforms, both a Hebrew string ending in a time and one ending in a name.

## PHASE B BUILT (2026-08-21) — [session note](../planning/2026-08-21-notifications-phase-b-built.md)

`event.hard.soon`, `span.edge.soon` and `trip.tomorrow` are registered, `notifyObligations` is a column and the second switch it gates is on the settings card. Six kinds now; §2's phases A and B are complete.

**§2's row for `span.edge.soon` reads "`startWindowEnd` when there is a window", and that shorthand is only true on the START side.** ADR-0184 gives an edge two bounds, and which of them is the deadline is not symmetric: at the start, `startsAt` is when the desk opens and `startWindowEnd` is when you have to be there **by**, so the window bound is the obligation. At the end it is the other way round — `endWindowStart` is the **earliest** you may leave and `endsAt` is the time you must be out by — so the closing instant is `endsAt` and `endWindowStart` is not a deadline at all. The kind therefore reads three of the four bounds and deliberately ignores the fourth; the code says so, because a reader counting fields would otherwise "finish" it.

**The two edges are keyed apart (`subjectId: '<eventId>:start' | ':end'`), and that is not belt-and-braces.** A stay's check-in and check-out are days apart, so their aimed-at minutes differ anyway — but only by luck of the data. Keying on the event id alone would let one edge's ledger row suppress the other's for any span whose ends happen to land in the same minute bucket, and the subject is the honest discriminator.

**`event.hard.soon` and `span.edge.soon` split on `isAmbient`, which is ADR-0164's own line.** A point commitment is the first kind's, an ambient span's two edges are the second's, and no row is both — without that exclusion a hotel check-in fires twice, an hour apart, from two kinds that each think they own it.

**`trip.tomorrow` reads 19:00 at HOME, not at the destination.** The zone comes from `currentZone(now, …)`, which before the first crossing is where the traveller is standing — and the evening before you fly, that is home. Using the trip's own zone would put a long-haul departure's "you travel tomorrow" in the middle of the night.

**And the measurement §5 asked for was finally possible, because the seed now has a flight and a stay.** Counting every one-minute tick of three representative days against the seeded trip (5 members), as **distinct ledger claims per person**:

| day                                         | sends                                       |
| ------------------------------------------- | ------------------------------------------- |
| trip day 3 (a day with a hard 19:30 dinner) | 1 digest, 1 `task.due`, 1 `event.hard.soon` |
| the check-out day                           | 1 digest, 1 `span.edge.soon`                |
| a pre-trip day                              | **nothing at all**                          |

Which is §5's computed shape, now measured rather than reasoned — and the caps bind nowhere.

**The measurement also found a phase-A defect that no test could see, and it is the one worth carrying forward.** `task.digest` reported `aimedAtMs: nowMs` under an `hourInZone(…) === 8` gate. The gate passes for **all sixty minutes** of that hour, so every tick minted a new `fireKey`: 60 distinct ledger claims per person per morning, of which 59 were refused not by the ledger but by the **1/day cap**. Nothing wrong ever reached a phone, and the code comment beside it asserted the opposite ("one bucket per morning") — so the only way to see it was to count. Fixed by `hourStartInZone` in `send-policy.ts`, which buckets the tick to the top of the **local** hour (exact in `+05:45`, where flooring to a UTC hour would not be), and `trip.tomorrow` — written with the same shape — was fixed before it ever shipped. The general rule: **a kind triggered by a wall clock must key on the hour it fires for, not on the tick that noticed.** A cap silently doing the ledger's job is what §5 means when it says that if the caps bind often, the catalogue is wrong.

**`notifyLeadMinutesFor` is the reader, not `CATEGORY_TIME_PROFILE.x.notifyLeadMinutes`.** §3 added the field; the accessor goes beside `typicalMinutesFor` so a kind reads the event's **refined** profile (ADR-0063's per-mode overrides) rather than the category's raw row, and an uncategorised event answers 0 without a call site testing for null.

**`task-audience.ts` became `trip-audience.ts`** — every line of it was already trip-scoped (the live window, the roster, the zone), and phase B's kinds need exactly those three answers. Root rule 8: generalise the one-off rather than write an `event-audience` beside it that could disagree about what "live" means.

## PHASE C, FIRST HALF, BUILT (2026-08-21) — [session note](../planning/2026-08-21-notifications-phase-c-readiness.md)

`readiness.nudge` is registered. **The flight check-in is deliberately NOT built with it** — see the fork below, which this section could not settle on its own.

**`computeReadiness` moved into `packages/shared`, which is ADR-0197 §5's rule applied to a FACT rather than to a clock.** §5 says a send time and a printed time must be one derivation; the same argument holds for "is lodging covered". A nudge that disagreed with the tasks screen about an open check is worse than no nudge: the person opens the app, sees a satisfied row, and stops trusting the channel. The move took `addDays`, `tripDates`, `zonedIso` and the night-window constants with it, re-exported from `lib/time.ts` so the 22 call sites did not churn — the same shape phase 2 used for the zone model. `zonedIso`'s full docstring travelled with it, including the field-report-#38 precondition, because that is the part a reader cannot recover from the code.

**It rides `notifyTasks` rather than a third switch.** ADR-0190 decided a readiness check **is** a task row, so the control that governs task notifications governs these. §6 stays at two switches, and no column was added for a kind the user already has a control for.

**Three milestones, and the labels are a lookup rather than arithmetic.** `שבועיים` (14) and `יומיים` (2) are Hebrew duals, which no `${n} ימים` template can produce — the same reason phase B's `untilLabel` has a dual case. A fourth milestone must supply its own words, which the compiler asks for.

**Nothing open means no send** — not "you're all set". A notification whose content is congratulation is the app talking about itself, and the branch has a test with a fixture that satisfies all five checks (the only way to reach it), proved non-vacuous by mutating the guard away.

### The fork this section did not settle: is the check-in task STORED or DERIVED?

§C above says a flight booking "mints an automatic task … which then rides `task.due` for free" — a **stored** row with a stored `dueAt`. Its very next sentence calls this "ADR-0190's rule already decided for readiness applied one row further" — and ADR-0190's rule is the **opposite**: derive the check, store only the human's dismissal. Both readings are in one paragraph, and they are materially different builds:

- **Stored** — minted in `bookings.create`'s existing `mutateMany` (the auto-`Event` is the precedent), `dueAt` cascaded at the **three** sites that can move a departure (`events.update`, `events.move`, `bookings.update`), deleted with its booking. Rides `task.due` with no new kind. The cost is those three cascade sites, which is exactly the "cascades that write no `Change` rows" hole ADR-0152 §2 / ADR-0157 §3 already name.
- **Derived** — nothing can go stale, but `TaskDerivedKey` is a closed five-value enum and per-**trip**, while a check-in is per-**booking**; and a derived task has no `dueAt` for `task.due`'s indexed query to find, so it would need the `flight.checkin` kind §C explicitly rejected.

**Left open rather than decided quietly, because it touches the schema either way.** Whichever wins, this section gets amended to say so in one voice instead of two.

## AMENDED BY THE OWNER (2026-08-21): two rows leave the catalogue, and one string leaves a payload

**The flight check-in is dropped.** §C's automatic task is not being built — so the stored-vs-derived fork that §C stated two ways in one paragraph is closed by not needing an answer, and phase C is complete as `readiness.nudge` alone. The reasoning §C gives for preferring a task over a `flight.checkin` notification still stands and is worth keeping: we do not store the airline's window, so a send claiming check-in is open would be a guess printed as a fact. If this returns, it returns as a task.

**Phase D is dropped.** `group.imminent` will not be built. This ADR already leaned against it and named the reason — it is the only row whose absence costs nobody an obligation, because you cannot be _late_ for somebody else's edit. ADR-0081's change feed remains the home for that, unpushed. So `notifyGroup` is never added, and §6's two switches are the final set rather than a way-station.

**`task.assigned` no longer names who assigned it.** The body was `‹title› · עד ‹due› · ‹name›`; it is now the first two. The trade is recorded because §2 defended this kind against ADR-0081 on the grounds that it is **addressed** — the title's `בשבילך` carries that alone now. It also deleted a `User` query per tick, and the name was never solid: `updatedBy` is the closest the schema holds, and a third party editing inside the six-hour window moves it while `assignedAt` stays put. Restoring it properly would mean an `assignedBy` column, which is a column for a courtesy.

**So the catalogue is closed at seven kinds:** `task.due`, `task.digest`, `task.assigned`, `event.hard.soon`, `span.edge.soon`, `trip.tomorrow`, `readiness.nudge`.

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
- **A quieter pre-trip budget** (the earlier draft's 1/day). Rejected on §5's argument: it rations the sends a person asked for by a rule about which phase the trip is in, and pre-trip is precisely where the deadlines are. What it was really trying to protect against is the readiness nudge repeating, and that is now capped where it belongs.
- **Treating "Thursday" as "Thursday 09:00"** so a dated-no-time task fires its own `task.due`. Rejected: it invents an hour the person did not type, which is the exact mistake ADR-0194 was written to stop on the display side, and the digest already carries the same information at a defensible hour.
- **Per-trip preferences** rather than per-user. Rejected as premature (ADR-0065's grow-later posture cuts both ways): a person who wants different treatment for two simultaneous trips is a case nobody has, and `Membership` already carries one preference (`calendarSyncEnabled`) that nothing reads.
- **Send the change feed, filtered by nothing.** ADR-0081 rejected the toast; this ADR does not reopen it, it narrows it to §D's batched, imminent-only slice and admits that slice may not be worth building.
