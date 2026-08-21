# 0197 — A notification is a derived obligation, and a sweep is its clock

**Status:** Proposed (2026-08-20) — the infrastructure half of the notifications epic. The catalogue half is [0198](0198-we-notify-what-you-can-still-miss.md).
**Date:** 2026-08-20

**Activates** the backlog's _"Push notifications — its own epic, and tasks is only its first consumer"_ (owner ask 2026-08-15; [`planning/2026-08-15-tasks-design-brief.md`](../planning/2026-08-15-tasks-design-brief.md) §12), and **revises one of its four costs**: the scheduler is not BullMQ (§3).

**Relates:** [0007](0007-platform-pwa.md) (a PWA is the only client, so Web Push is the only channel) · [0011](0011-hard-soft-event-model.md) (what may be notified at all — 0198 §1) · [0019](0019-sync-protocol.md) / [0042](0042-shared-state-is-offline-syncable.md) (the `Change` stream a send may never be confused with) · [0066](0066-client-local-data-teardown-on-signout.md) (a sign-out must revoke the device's subscription — §2.3) · [0067](0067-revocable-code-invites-and-removal-blocks.md) / [0074](0074-evict-removed-member-websocket.md) (a removed member stops receiving, and §3 gets that for free) · [0071](0071-fail-fast-config-validation.md) (the VAPID keypair is a boot-time required) · [0072](0072-graceful-shutdown-and-readiness.md) (the ticker's lifecycle) · [0031](0031-hosting-on-railway.md) / [0169](0169-the-app-answers-on-one-host.md) (one service, one host) · [0065](0065-app-scope-many-trips-small-groups.md) (grow-later: nothing here assumes one instance) · [0107](0107-per-place-timezones-and-multi-zone-time.md) + [0194](0194-a-task-deadline-can-pin-its-zone.md) (which wall clock a send is aimed at — §5) · [0166](0166-place-enrichment-is-a-multi-source-pipe.md) §6/§14 + [0180](0180-currency-is-derived-and-a-rate-is-a-glance-card.md) §14 (the no-scheduler precedent this ADR is the exception to, and the kill-switch shape it copies) · [0185](0185-a-build-swaps-whole-or-not-at-all.md) (the atomic swap a custom service worker must not break — §8) · [0118](0118-numbers-in-hebrew-bidi.md) (whose isolation machinery does **not** reach a lock screen — §9)

## Context

Nothing exists. Confirmed by grep, not by memory: no `web-push`, no `VAPID`, no `pushManager`, no `new Notification(` anywhere in `frontend/src`, `backend/src` or `packages/shared/src`; `redis` is in `docker-compose.yml` with the comment _"For v1.1 background jobs … Harmless to run now"_ and **no volume**; `backend/package.json` has no queue library. So a task due at 18:00 and a flight at 06:20 both surface only when somebody opens the app, and the tasks brief's rule — _no copy anywhere may imply otherwise_ — is still load-bearing.

**The interesting part is not the transport.** Web Push is a settled, boring technology and one library. The two decisions that will still be true in a year are **what wakes up** (§3/§4) and **which wall clock a send is aimed at** (§5), and the first of them argues with decided practice in this repo.

That practice: **the read is the trigger, there is no scheduler.** ADR-0157 §6, ADR-0166 §14 and ADR-0180 §14 each faced "when does this run" and each answered the same way, on the same reasoning — a request is already happening, deciding whether work is due costs one indexed lookup we are doing anyway, and _surplus work is dropped, never queued_. Notifications are the one feature in this app where that answer is unavailable by definition: **the whole value is delivery when nobody is reading.** So this ADR opens the exception, and the shape of the exception is chosen to keep as much of that practice as possible.

## Decision

### 1. The channel is Web Push (VAPID) to the PWA's own service worker

One transport, no fan-out layer. The client is a PWA and only a PWA (ADR-0007), so the standards channel is the channel: `PushManager.subscribe()` with an application server key, `web-push` on the backend, delivery through the browser's own push service (FCM for Chromium, Mozilla autopush, Apple for WebKit).

**No FCM/APNs SDK**, because both want a native app we do not have. **No SMS**, because it costs per message and we hold no phone numbers. **Email is deferred, not rejected** — it is the only honest answer to §7's iOS coverage hole, and it is a different register: a reminder that lands in an inbox is _"you should have known"_, not _"what now"_. It reopens if §7's hole turns out to be most of the group's devices, and it reuses everything below except the transport.

**iOS is the constraint that shapes the ramp, not the design** (§7): Safari 16.4+ delivers Web Push only to a PWA **added to the home screen**. Nothing else about this ADR changes because of it.

### 2. A subscription is a device, and it is control-plane data

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique   // the push service's URL — the device's identity
  p256dh    String              // client public key (base64url)
  auth      String              // client auth secret (base64url)
  userAgent String?             // so a person can recognise the row in settings
  createdAt DateTime @default(now())
  lastSentAt   DateTime?
  lastFailedAt DateTime?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

**2.1 Keyed on `endpoint`, not on `(userId, deviceId)`.** The push service issues the endpoint and it is already unique per (browser profile, origin, subscription). Inventing our own device id would be a second identity for the same thing, and re-subscribing after a key rotation would leave the old row addressable.

**2.2 It is not a data-plane entity.** No `Change` row, no `ENTITY_TYPE` member, no `ChangeService.mutate()`, no broadcast. `PlaceEnrichment` set this precedent for the same three reasons (ADR-0166 §6): there is no trip to write a change against, there is one writer, and there is no action anyone would undo. `backend/CLAUDE.md`'s hard boundary is about data-plane mutations; this is control plane (ADR-0022).

**2.3 Sign-out revokes it, and this is the security bug worth naming before it ships.** ADR-0066 tears down client-local data on sign-out. A push subscription is not client-local data — it lives on the server and keeps working after the tab closes, which is the point. So a phone handed to somebody else, or a shared laptop, would keep waking with **another person's** deadlines on the lock screen. Sign-out therefore does two things: `pushManager.getSubscription()?.unsubscribe()` on the device and `DELETE /notifications/subscription` for the row. The delete is best-effort and the server prunes anyway (§10), but the local `unsubscribe()` is not optional.

**2.4 A removed member stops receiving with no cancellation step.** ADR-0074 had to evict a removed member's WebSocket explicitly because a live socket is state. §3 has no per-user state to evict: membership is read at send time, so removal (ADR-0067), a trip block, and an archived trip (ADR-0040) all take effect on the next tick with no code that knows about them.

### 3. The schedule is **derived at send time**, never enqueued

**This reverses the backlog's costing, which named BullMQ.** The argument that changes the answer:

> **The "when" is already in Postgres, and a queue is a second copy of it that every edit has to keep in sync.**

`Task.dueAt`, `Event.startsAt`, `Event.startWindowEnd`, `Event.endWindowStart` are the schedule. Enqueueing a delayed job per notification means every one of these has to cancel and re-arm it: an LWW patch (ADR-0012), a move or a ripple, a delete, a settle or dismiss, a parent's cascade — **and the cascades write no `Change` rows**, which is the exact hole ADR-0152 §2 / ADR-0157 §3 already paid for once on the client. Add the offline outbox replaying an edit hours later (ADR-0042) and the queue is wrong more often than it is right, silently, in the direction of sending something false.

So: **a ticker sweeps, a ledger deduplicates.**

```prisma
model NotificationSend {
  id        String   @id @default(cuid())
  userId    String
  kind      String   // 0198's catalogue id, e.g. 'task.due'
  subjectId String   // the task / event / trip the send is about
  fireKey   String   // the instant it was AIMED at, to the minute (see below)
  sentAt    DateTime @default(now())
  @@unique([userId, kind, subjectId, fireKey])
  @@index([userId, sentAt])
}
```

Each tick: find candidate obligations in a bounded window, resolve each to the instant it should fire (§5), and for those now due, **insert the ledger row and send in the same transaction**. A unique violation means it is already sent — by an earlier tick or by another instance — and the send is skipped. That is the whole exactly-once mechanism: no leader election, no advisory lock, no assumption of one backend process (ADR-0065).

**`fireKey` is the aimed-at instant, and that choice is what makes edits behave.** Dedup on `(whom, what, which instant)` rather than on `(whom, what)`:

- A deadline moved from 18:00 to 20:00 is a **new** key, so it re-arms and fires at 20:00. Correct: the obligation changed.
- A title edited, an assignee changed, an unrelated field touched — same key, so nothing re-sends.
- Moved to 20:00 and back to 18:00 before either fired: the 18:00 key never sent, so it still fires once.
- Moved **after** 18:00 already fired, to 20:00: it fires again. Accepted, and it is the right failure — somebody changed a deadline that had already passed, which is a real event a reminder should follow.

**A missed tick is dropped, not delivered late.** Each kind declares a `staleAfter` (0198's table). A "leave for the airport" is worthless twenty minutes late; "a task is overdue" is still true tomorrow but is the morning digest's job by then, not a stale point send. Downtime therefore loses sends rather than replaying a burst — the same posture as ADR-0180's "surplus work is dropped, never queued", and the opposite of what a durable queue would give us, which is a redeploy that fires eleven notifications at once.

**What is genuinely lost by not having a queue**, recorded so it is not rediscovered as a surprise: retry-with-backoff on a transient push-service failure (we drop, and the next tick or the morning digest carries it), and fan-out throughput. Both are volume properties, and §3.1 is where they get thresholds instead of adjectives.

### 3.1 What a queue would replace, and when it becomes the right call

The distinction that makes this a later swap rather than a later rewrite — and it is a distinction, not a hedge:

> **A queue of "deliver this now" jobs is fine. A queue of "fire this at 18:00" jobs is the thing §3 rejects.**

The first carries a **stateless unit of work** — an endpoint, an encrypted payload, a retry policy — that depends on no entity and cannot go stale, because the decision was already made. The second carries a **prediction about the future** that six edit paths can silently invalidate. So the sweep keeps the decision forever, and only the delivery is ever handed off.

Two seams, and I was vague about which one I meant:

```ts
// Seam A — the transport. Exists in phase 1, because tests need a fake.
export interface NotificationSender {
  send(target: SubscriptionTarget, payload: NotificationPayload): Promise<SendOutcome>;
}
// WebPushSender (prod) · RecordingSender (specs) · a future EmailSender (§1)

// Seam B — the dispatch. This is the one BullMQ would take over.
export interface NotificationDispatcher {
  dispatch(due: readonly DueSend[]): Promise<void>;
}
// DirectDispatcher: bounded-concurrency Promise.all over NotificationSender (today)
// QueueDispatcher:  one job per DueSend; workers call the SAME NotificationSender
```

The sweep produces `DueSend[]` — already resolved, already deduped by the ledger insert — and hands it to a dispatcher. Swapping in BullMQ means writing `QueueDispatcher`, wiring a worker, and changing one provider binding. **The ledger, the derivation, the zone resolution, the quiet-hours rule and the catalogue are all untouched by that change**, which is the whole reason it can wait.

**The thresholds, in the order they are likely to arrive:**

1. **A second scheduled workload appears.** Gmail import is the candidate `docker-compose.yml` has always named, and it is the workload a queue is genuinely for: fan-out, third-party rate limits, retries, and work that is expensive to redo. At two consumers the fixed cost of Redis amortises, and notifications should ride it then rather than keep a private mechanism.
2. **A tick cannot finish inside its interval.** Measurable, not felt: log per-tick wall time from day one, and the trigger is sustained **> 30 s** against a 60 s interval.

   **AMENDED 2026-08-21 (phase 3): the sends were the wrong quantity to count.** This
   threshold was written as "~4,000 sends inside 30 s" — one Web Push POST at ~100–200 ms,
   at concurrency 20 — and that arithmetic is fine and was measuring the wrong thing. The
   first sweep looped over live trips and loaded each one's events, bookings and places to
   derive zones: `1 + 3T` sequential queries per tick, **paid whether or not anything was
   due**. Computed against that shape: fine at 100 trips, past this very threshold at ~1,000,
   and over the 60-second interval outright at ~5,000 — with **zero** sends in every case.
   The cost scaled with **trips** when it must scale with **things due**, and on a
   notification sweep almost every tick has nothing to do.

   Phase 3 inverted the loop instead of raising the number: a kind runs one indexed range
   query across every trip at once (`Task(status, dueAt)`, `Event(startsAt)` — neither column
   was indexed before), zone context is resolved only for the trips those queries returned
   and memoized per tick, and the daily caps are one grouped query rather than one count per
   candidate. An idle tick is now one index scan per kind returning nothing. **So the
   threshold stands as written and now measures what it says it measures** — but a future
   reader should know it was briefly guarding the wrong axis, because the mistake is easy to
   repeat: the expensive thing in a sweep is rarely the sending.

3. **Sustained non-`410` delivery failures.** `404`/`410` are a subscription's normal death (§10) and need no retry. Anything else, above roughly **1 %** of sends over a day, is the point where "drop it" becomes visible as reminders that never came — and retry-with-backoff is precisely what the queue buys.
4. **Several backend instances plus a delivery-load reason to spread the work.** Correctness already survives multiple instances (the ledger claim, §3), so this is about not having every instance walk the whole candidate set — an efficiency trigger, not a bug.

**And the burst that will hit threshold 2 first is not the trip data — it is the digest.** `task.digest` fires at a fixed local hour, so every user sharing a timezone lands in the _same minute_, while `task.due` and `event.hard.soon` scatter across the day by construction. That makes the first mitigation cheaper than a queue and worth knowing before reaching for one: **spread the digest over a few minutes** by deriving a stable per-user offset (a hash of the user id into a 0–9 minute window), which multiplies the ceiling by ten for one line and no infrastructure. Reach for the queue when that is no longer enough.

Two more reasons the queue is not the cheap option here, contra the costing:

- **The compose Redis has no volume**, so delayed jobs die on restart. Making them durable is work BullMQ would _add_, not save.
- The candidate query is small: one indexed scan per tick, which at this app's scale (ADR-0065 — many trips, ~5 people each) is the same shape of read every snapshot already does.

**The sweep's scope is every trip that has not ENDED — pre-trip explicitly included** (owner, 2026-08-20: _"we should be able to send reminders for due tasks even before the trip"_). This is worth stating because the obvious phrasing, "trips inside their access window", reads as ADR-0040's **Trip-mode** window and would have excluded exactly the case that matters most: ADR-0040 governs which **mode** a trip is in, not whether it is live data, and pre-trip is ordinary editable Plan mode where most task deadlines are actually written. So the filter is `endDate >= today`, not "is the board showing". A finished trip is the read-only archive (ADR-0040 §2) and is the only thing excluded.

#### 3.3 CORRECTED IN PRODUCTION (2026-08-21) — the unique violation is the guarantee, not the path

§3 says "inserting the ledger row IS the exactly-once mechanism: a unique violation means another tick, or another backend instance, already owns this send." That is still true, and building on it **as the normal path** was still wrong.

The shape of the windows is what makes it obvious in hindsight. A kind selects its candidates within its own `staleAfterMs`, so `task.due`'s window is three hours wide — a deadline that fired at 12:00 is **still a candidate** at 12:01, 12:02 … 14:59. Every one of those ticks re-derived it, re-attempted the insert, and took a Postgres `ERROR: duplicate key value violates unique constraint`. About **180 per task, forever, for every task ever notified**, plus an INFO line a minute saying nothing happened.

**Correctness never broke. Observability did** — and a log full of expected errors is a log with no errors in it. Which is how this was found: on a production dashboard, by the owner, not by a test.

So the sweep now **reads the ledger once per tick** for exactly the keys its candidates would claim, and skips those already present. The insert keeps its `catch` for what it was always really for: two instances inside the same minute. That is a genuine race, it is rare, and losing it is worth a line. The pre-check is a check-then-act and therefore not a guarantee — it is not meant to be one; the unique index still is.

Two rules fall out, both of them small and both of them the kind of thing that comes back if unwritten:

- **The key is derived in one place** (`keyFor`), read by the pre-check and the insert. A pre-check that computed it even slightly differently would stop matching and silently restore the storm.
- **A tick that did nothing says nothing.** "Every candidate already sent" is the normal state for the whole of a kind's window, so logging it per minute is the same noise one severity down.

#### 3.2 What an edit does, and what the ledger has to forget (2026-08-21, phase A)

§3's whole argument for refusing a queue was that **no edit path should have to know notifications exist**. Phase A is where that stopped being an argument and became a test suite, so the claim is written down as the table it was verified against:

| the edit                              | what happens, and why                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| deadline moved, not yet fired         | fires at the new instant, never the old — the window is re-read every tick                                                                |
| deadline moved **after** firing       | **re-arms**: a different instant is a different `fireKey`, and it is a different obligation                                               |
| moved inside the same minute          | does not re-send — the bucket is the tick's interval                                                                                      |
| title, body, assignee's name edited   | does not re-send — none of them move the aimed-at instant                                                                                 |
| zone pin corrected                    | changes the printed hour, not the key: `dueAt` is the instant, the pin is only how it is read                                             |
| settled (done / dismissed)            | drops out of every kind on the next tick — `status: open` is the first clause of every query                                              |
| re-opened at the same deadline        | does **not** re-fire; the ledger row stands. Being told once is the promise                                                               |
| deleted, or cascaded away by a parent | nothing to select. The sweep reads entities and never the change log, so the cascade hole ADR-0152 §2 costs the client costs this nothing |
| re-assigned                           | the new assignee gets their own row; the old one is not told twice                                                                        |
| un-assigned                           | back to the group for `task.due`; a pending `task.assigned` is **retracted** by its stamp clearing                                        |
| a member removed                      | stops receiving, with no cancellation step (§2.4)                                                                                         |
| trip dates shortened so it has ended  | stops. ADR-0040's archive is derived from the live window, so this is the same check                                                      |
| an offline edit replayed hours late   | `staleAfterMs` drops it rather than firing a burst (ADR-0042)                                                                             |

**And the one thing that does NOT take care of itself: the ledger grows monotonically.** It cascades from `User`, and there is deliberately no FK to `Task` or `Trip` — a send is _about_ a thing that may be gone, so the subject is an id and not a relation. Nothing else ever removed a row.

So retention, and **the split is by `dedup`, because getting it the other way round would resurrect notifications rather than merely waste disk**. A `BY_INSTANT` row stops mattering once its instant is far behind: the longest reader is the 24-hour cap window. A `BY_SUBJECT` row _is_ the permanent answer to "has this person already been told about this task" — prune it and every assignment announcement fires again. So those are exempt, and they are cheap: one row per assignee per task, ever. The window is 30 days rather than the 25 hours correctness needs, because §10 makes this table the log as well as the ledger.

It rides the sweep's own timer at a six-hour cadence rather than taking a second timer — a second timer is a second thing to shut down cleanly (ADR-0072) — and it sits inside the tick's `try`, so a failing prune is logged and dropped exactly like a failing tick. Housekeeping is never the reason a notification does not go out.

### 4. What is awake: an in-process ticker in the one service

A `NotificationScheduler` provider in the single Nest service (ADR-0031, ADR-0169), started in `onApplicationBootstrap` and cleared in `onModuleDestroy` so ADR-0072's graceful shutdown stops it before the pool closes. **60-second interval**, which is also `fireKey`'s bucket: a notification may be up to a minute late, and nothing in 0198's catalogue is written to a tighter tolerance than that.

**Not `@nestjs/schedule`** — a decorator around `setInterval` for one job, and it registers globally in a way that makes the test story worse. The ticker takes its interval **and its clock** from arguments so its spec never waits for real time — the clock-injection shape every pure derivation in this repo already uses (`TaskClock`, `buildDayGlance`, `heroHorizon`). Note that ADR-0026's dev time-travel seam is **client-only** (`lib/useClock.ts`): the backend has no simulated clock today, so testing a send against a moved clock needs the injected one.

**Not a Railway cron service** hitting an HTTP route: a second deploy artifact, and a route that can send to every user is an auth seat that has to be defended forever. The ticker needs neither.

**Not a `pg_cron` / DB-side job**: it would put the catalogue's logic in SQL, where none of 0198's per-kind rules can be unit-tested.

**`PUSH_DISABLED`** in `common/env.ts`, read per tick, is the kill switch — the third variable of its kind after `ENRICHMENT_DISABLED` and `FX_DISABLED`, and for the same stated reason: this is now the third thing in the app that acts on its own initiative, so it gets the one switch that stops it doing so. Reads and in-app surfaces are unaffected.

### 5. A send is aimed at a wall clock, and the derivation is the display's own

**The 03:00 bug is the one that gets notifications disabled permanently**, and this app moves people across zones mid-trip by design. So the rule is not "be careful": it is that **the sender resolves the zone through exactly the function the screen does** — ADR-0107's `currentZone(instant, crossings, primaryZone)`, and for a task ADR-0194's `dueZone`, which honours a pinned `Task.displayTimezone` before deriving. One derivation, so a reminder cannot name a time the app does not show.

**This is the epic's biggest hidden cost and it is a move, not a rewrite.** Those functions are in `frontend/src/lib/places.ts` (`currentZone`, `zoneCrossings`, `segmentZoneAt`, `ZoneCrossing`) and `frontend/src/lib/tasks.ts` (`dueZone`, `taskBand`, `TaskClock`). They are pure and clock-injected already, so **they move to `packages/shared`** and the frontend re-exports or imports them from there. That is root rule 3 catching up with reality — this logic was always shape-and-semantics, not screen — and it is what makes the send time and the printed time the same fact rather than two implementations that agree today.

**Pre-trip, the same derivation already answers "home", and the nuance is worth one paragraph** because a reader checking `currentZone`'s doc comment will find the opposite. That comment says Plan mode deliberately does _not_ read it — planning is framed in the trip's **primary** zone (ADR-0107 §4). True for the clock, the now-line and the day grid; **not** true for a task deadline, which ADR-0194 deliberately routed through `dueZone` on every surface, `taskDue` included. And `segmentZoneAt` returns `crossings[0].fromZone` for any instant before the first crossing — the **departure origin**, i.e. home. So a deadline written before the trip prints and fires in the zone the person is standing in, and the row and the notification agree with no special case. Verified by reading both functions, not assumed: the one thing that would break the agreement is a _pinned_ zone, and a pin wins in both places because both call `dueZone`.

**AMENDED IN BUILD (2026-08-21, phase B): a kind triggered by a WALL CLOCK keys on the hour it fires for, not on the tick that noticed.** Most kinds aim at a stored instant (`Task.dueAt`, `Event.startsAt`), so the `fireKey` is theirs for free. Two do not — `task.digest` at 08:00 and `trip.tomorrow` at 19:00 — and their gate is an **hour**, which passes for all sixty of its minutes. Phase A reported `aimedAtMs: nowMs` there, so every tick minted a new key: measured against the seed, 60 ledger claims per person per morning, 59 of them refused by ADR-0198 §5's 1/day cap rather than by the ledger. Nothing wrong reached a phone, which is exactly why it survived — the comment beside the code asserted the opposite and no test disagreed. `hourStartInZone` (in `send-policy.ts`, beside `hourInZone`) buckets the tick to the top of the local hour, reading the local **minute** rather than flooring to a UTC hour, because `Asia/Kathmandu` is `+05:45`. A cap silently doing the ledger's job is a defect in the kind, never a working cap.

**Quiet hours are part of the aim, not a filter bolted after it.** No send between **22:00 and 07:00** in the recipient's current zone, with one exception: a notification **about** something inside that window may fire inside it (a 05:30 airport departure has to ring at 04:00, or the feature is decorative). Each kind therefore declares `timeCritical: boolean`; a non-critical send whose aim lands in quiet hours is **deferred to 07:00 local, keeping its original `fireKey`**, so it arrives once and the ledger still recognises it. The boundaries are constants, not preferences (0198 §6).

### 6. The payload is small, opaque to the push service, and readable on a lock screen

Web Push encrypts the payload (aes128gcm) so the push service cannot read it. What it **can** read is that a message was sent, to which endpoint, and how big it was — so nothing in this system uses payload size or timing as a signal.

What lands on a lock screen is a different threat model, and it decides the copy: a notification says **what kind of obligation and which subject**, never document content, never a confirmation code, never anything ADR-0015/ADR-0034 encrypt. A document notification says `מסמך` and a deep link, and the app asks for the passcode on open like every other read.

Payload budget: **≤ 2 KB** of JSON (the practical floor across push services is ~4 KB; Apple's is the tightest). It carries `{ kind, tripId, subjectId, title, body, url }` and nothing else — no entity snapshot. The service worker does not fetch on `push`: it renders what it was given, because a fetch there races the network the device may not have.

### 6.1 AMENDED IN BUILD (2026-08-21): the URL lands on the SOURCE, and it is query-addressed

§6 says a payload carries a `url` and that tapping it is "a way in to a surface that already exists" (ADR-0004). It never said what such a URL looks like, and every URL shipped in phases A–C was **wrong**: `/trips/<id>/index/tasks` and `/trips/<id>/day/<date>` match no route. The router has `login`, `trips`, `new`, `join/:token`, `trip/:id/settings`, `settings` and `*` — both fell through to `*`, which renders the app home. So every notification ever sent landed on home, reported by the owner as exactly that.

**The app is query-addressed, not path-addressed** (ADR-0098): one surface, with `?tab=` and `?day=` choosing it and ADR-0153 §8's "way-in" ids opening something on top. So a notification URL is built from that vocabulary, and two params had to be added to it:

- **`?task=<id>`**, the fifth way-in id beside `?booking=`/`?doc=`/`?event=`/`?idea=`. A task had none because nothing outside the app had ever needed to name one — every way in was a tap on the row itself.
- **`?trip=<id>`, which is the one that matters most and is easiest to miss.** The active trip lives in `localStorage` alone, so _no_ URL could ever change it. Invisible while every entry point was a tap from inside the app; a wrong-answer bug the moment a notification arrives from outside it, because a reminder about Japan tapped while Iceland is active opened **Iceland**. It counts as an explicit pick, so ADR-0033's live-trip landing rule cannot redirect a notification about a trip that has not started yet.

**A kind whose subject is one row names it; a kind whose subject is a set does not.** `task.due` and `task.assigned` open that task's sheet; the digest and the readiness nudge open the list, because picking one arbitrary row out of a send that was deliberately about the whole set would misrepresent it. The two event kinds carry `?event=`, so a flight reminder lands on the flight rather than on the day containing it.

The service worker needed no change: its `notificationclick` already focuses an open window and navigates it, so this was only ever about generating an address that exists.

### 7. Permission is asked at the moment it is earned, and iOS is told the truth

**Never on load.** A permission prompt fired at first paint is the request that gets denied permanently, and a denial is not recoverable in-app on any platform.

Two places may ask, both from a real gesture:

1. **The Notifications row in `UserSettings`** (`screens/UserSettings.tsx`), where the theme pick and the map-storage rows already live — device state and account state side by side, which is exactly what this is: the **subscription is per device** (§2), the **category preferences are on `User`** (0198 §6), so they follow you to a new phone the way `preferredCurrency` does.
2. **Immediately after a first deadline is set on a task** — the one moment where the user has just expressed the want. Once per install, dismissible, never re-asked.

**The iOS hole is stated in the row, not discovered in the field.** With `window.matchMedia('(display-mode: standalone)')` false and `'PushManager' in window` false on an Apple browser, the row does not offer a switch that cannot work: it says the app must be added to the home screen first, and how. That is the same rule as ADR-0180's manual refresh — _a control that reliably does nothing is worse than no control_.

**And the tasks brief's copy rule outlives this ADR.** Any UI that implies a reminder will arrive must be gated on a live subscription **for that user**, not on the feature existing. A deadline field on a device with no subscription promises nothing.

#### 7.1 DRAWN — the surface, in every state it can be in (2026-08-21)

Phase 1b's mockup ([`notifications-in-settings-v1.html`](../../mockups/notifications-in-settings-v1.html), catalogued in [`design/mockups.md`](../design/mockups.md)) resolves the five things §7 left as prose. Its numbers are read off its own DOM, so they are quoted rather than re-derived.

- **The section is TWO cards in one `התראות` section, between `תצוגה` and `מפות אופליין`.** The device card (permission, local) and the preferences card (categories, account) have **opposite persistence**, and ADR-0180 §2 already settled that this means one hint per card — a single card would leave two contradicting promises under it with nothing saying which was which. 235px at 360px, section heading and hints included.
- **Where a blocker cannot be cleared, there is no control** — not a disabled one. A disabled toggle invites a tap and answers nothing, and on iOS it is worst of all, because there the user genuinely _can_ fix it. The sentence carries the information instead. **And when the SERVER holds no keypair the whole section is absent**: that is a property of the deployment, so it does not become a row apologising.
- **The sentence is the shipped `.set-note`**, not a new component. It has existed in `screens.css` with one call site — `TripSettings`'s "this is peer-managed, you cannot change it", `lock` glyph included — which is exactly "a statement inside the card saying why there is no control". Generalising it from one line to a paragraph is two properties. The file's first draft wrote a _second_ `.set-note` and the name collision made the shipped `display: flex` split the instruction into two ragged columns: rule 8 failing at the drawing stage, caught by rendering.
- **A boolean is a new primitive, and four call sites arrive at once.** `grep -r 'role="switch"' frontend/src` returns nothing; every `aria-checked` in the tree is `ChoiceGrid`'s radiogroup. Measured against the same four booleans: a two-option `ChoiceGrid` per row costs **+80px**, the `.set-edit` verb costs **+48px** _once ADR-0017's floor is honoured_ (as shipped it measures 25px, so it was only ever cheaper by being illegal). So `ui/primitives/Switch` — `role="switch"`, a 46×28 track, the 44px target through an `::after` overlay exactly as `ValueToken` does it, `--cta`/`--cta-text` for the on state because the colour budget has no member for "this setting is on", and a **hairline** rather than the iOS knob-shadow, which is invisible on a dark track.
- **The device list is the map-storage rows, not `ListRow`.** `ListRow` requires `onOpen` — a primary target to open — and a registered device has none. The map-storage rows six lines up the same screen are the same job. Two decisions on top: the list **renders only when a device other than this one exists** (a one-row list under the switch you just flipped is the same fact twice, and its heading promises a list), and the row is **two lines**, because one line ellipsised the device _name_ at 360px — 116px of label against 296px — on the one row a person is there to recognise, for 9px of height.
- **`userAgent` is a hint, not an identity.** It is 120 Latin characters, and it lies (Chrome on iOS reports Safari), so it is derived to a short label and the real recognition is carried by a `המכשיר הזה` mark. The label only has to distinguish the _others_.
- **The second door is `StatusBanner`, inside `TaskSheet`, under the deadline field.** No new infrastructure: `StatusBanner` already takes an `action` and an `onDismiss`, and ADR-0181 already recorded why the verb belongs inside the banner. A sheet after the editor's own sheet measured **169px against the banner's 55.7px, ×3, plus a back-stack layer**; a banner on "the screen after" is unreachable from `HostTasks` and `TripHomeTaskBand`, which also set deadlines. Inside the sheet is one host, zero new layers, and the moment the want was expressed.
- **One shipped defect found on the way, and it is not this feature's:** `.set-edit` renders at **25px**, under ADR-0017's 44px floor, at its existing call sites — the map-storage delete buttons in this very screen. Same class as the `.set-tz-trigger` 40px defect `currency-becomes-a-feature-v1` found and `.set-pick-trigger` fixed by the same argument: a second call site is the moment to fix it rather than file it.

#### 7.2 BUILT (2026-08-21) — [session note](../planning/2026-08-21-notifications-phase-a-and-the-settings-surface.md)

The surface §7.1 drew is built, with phase A's kinds, because a switch and the thing it switches had to ship together. What the build added to the drawing:

- **`ui/primitives/Switch`** — the app's first boolean, `role="switch"`, 46×28, its 44px target through an `::after` overlay, `--cta`/`--cta-text` for ON, and a hairline rather than the iOS knob-shadow.
- **`.set-edit` now meets ADR-0017's floor**, through the same overlay technique. It rendered at 25px at its existing call sites — the map-storage delete buttons on this very screen — and the device list is the second consumer that earned the fix.
- **The device list needs no endpoint on the wire.** `POST /notifications/subscription` returns the row's **id**, the client stores it (`waypoint:push:subscription-id`), and `GET /notifications/subscriptions` carries `{ id, label, lastSentAt, createdAt }` — no endpoint (a bearer capability) and no raw user-agent (noise, and it lies: Chrome on iOS reports Safari). `deviceLabel` derives `iPhone · Safari` server-side, ordered longest-claim-first because every Edge UA also says Chrome.
- **The preferences card renders only while this device is subscribed.** A category switch on a device that receives nothing narrows nothing, which is this section's own copy rule.
- **The second door is `PushAskBanner`** — `StatusBanner` with an action, inside `TaskSheet` under the deadline field. `waypoint:push:asked` is the "once per install" half, and **a dismissal sets it exactly as an acceptance does**: re-asking somebody who said no is how a prompt becomes a nag, and a platform refusal is not recoverable in-app anyway. It reads `useMaybeAuth` rather than `useAuth`, a new tolerant accessor for the one shape where no session is a state to render nothing for rather than a wiring bug.

### 8. The service worker becomes ours, and ADR-0185's swap must survive it

A `push` listener cannot be added to a generated worker, so `vite.config.ts` moves from `VitePWA`'s default `generateSW` to **`strategies: 'injectManifest'`** with `frontend/src/sw.ts`.

**This is the one change in the epic that can break something already fixed.** ADR-0185 made a build swap atomic with `registerType: 'prompt'` + `skipWaiting: false`, and the config's own comment records why: the `SKIP_WAITING` message listener is emitted **only** by `generateSW`'s template. Under `injectManifest` we write it, along with `precacheAndRoute(self.__WB_MANIFEST)`, `clientsClaim()`, the navigation fallback and its denylist (`SERVER_ROUTE_PATTERN`), and the `map-glyphs` runtime rule. Every one of those is currently declarative config that will become code, and a missing line is a silently-degraded PWA, not a build error.

So the phase that does this ships **a contract test that fails the build** when the worker stops listening for `SKIP_WAITING` or stops precaching the manifest — the shape `styles/exit-animations.contract.test.ts` already established for a rule a snapshot cannot see. And it ships **before** any notification kind, verified by installing a build and taking the update path, because "the app went blank after a deploy" is a worse bug than "no reminders yet".

**BUILT 2026-08-20** ([session note](../planning/2026-08-20-notifications-phase-0-built.md)), and it added one line to this section's list and closed one trap the section did not know about.

- **The list above was incomplete: `cleanupOutdatedCaches()`.** It is named in no option this repo ever set, `generateSW` emitted it anyway, and without it every precache from every previous build lives on the device forever. Found by writing the worker from the one we had — `dist/sw.js` minus its manifest is a 12-line program — rather than from the option list, which is the method this phase recommends to anyone repeating it.
- **The plugin registers the worker as `type: 'classic'` in every production build** (its `__TYPE__` replacement hard-codes it outside dev) while `rollupFormat` **defaults to `'es'`**. That pairing works only while the bundle emits no top-level `import`/`export`/`await` — true today, verified by building both ways — so `rollupFormat: 'iife'` is set to close it rather than to fix anything. Its own trap: `rollupFormat` lives **inside** `injectManifest`, and at the top level it is silently ignored, with the build log's `format:` line the only place the mistake shows.
- **The worker is a second TypeScript program.** `WebWorker`'s globals collide with `DOM`, so `src/sw.ts` has `tsconfig.sw.json` and `pnpm typecheck` runs it as a second pass — a worker excluded from the app's program and from nothing else is a file nothing type-checks.
- **The contract test is trusted because it was made to fail**: eleven mutations, one failure each. The three worth naming, because a review would not ask for them: flipping the config back to `generateSW` (which deletes nothing, fails nothing, and simply stops shipping the worker), losing `rollupFormat`, and leaving a dead `workbox:` block that reads as configured behaviour and does not run.
- **`scripts/deploy-swap-check.mjs` confirmed all of it in Chromium** — worker parked, a chunk only the old build had still served at 200, and the new build taken with no user action. Running it also found that its documented invocation had never worked (a bare ESM specifier resolves from the module's URL, not the cwd, and `@playwright/test` is not hoisted), which is why nobody had run it since.

Two service-worker rules that are not ours to negotiate:

- **A `push` handler must always show a notification.** `event.waitUntil(showNotification(...))` on every path, including a malformed payload — browsers penalise and eventually revoke permission for a push that displays nothing.
- **`notificationclick` focuses an existing client before opening a new one**, and the deep link is one of the app's existing routes (ADR-0050's quick-access links, ADR-0103's typed layers) so a notification cannot land on a screen with no way back.

**PHASE 1 BUILT 2026-08-21** ([session note](../planning/2026-08-21-notifications-phase-1-built.md)) — §1, §2, §6, §7, §8's handlers and §10. A real notification reaches a real device; nothing decides what to send or when. Five things the sections above did not say:

- **§2's upsert must re-own the endpoint.** `update` carries `userId`, or the previous signed-in user keeps a shared device's row and stays reachable on it — §2.3's handed-over-phone case arriving through the front door rather than through sign-out.
- **The test send is a route, not a button**, and the reason generalises past this epic: push exists only in a **production build** (no service worker under `pnpm dev`), where `import.meta.env.DEV` is false — so a `DEV`-gated control can never test push. It is gated on `isDevAuthEnabled()`, which `validateConfig` already refuses to let be true in production, rather than on a second flag.
- **§6's payload contract is zod-free**, and that is a deliberate exemption from ADR-0023: the worker bundles with `inlineDynamicImports`, so a zod import would inline zod and every schema into it. A hand-written total parse is what the worker needs anyway — a `push` handler that throws is a silent push, which is the case with the permission penalty attached.
- **§7's ramp needed one instrument, not a surface.** The permission prompt must come from a gesture, so a curl cannot register a device; `PushDebugPanel` is `BuildBadge`'s register (gated behind `VITE_PUSH_DEBUG`), sitting where the designed row will land so that becomes a swap. **The settings surface is now its own phase (1b) and it is the epic's one design phase** — permission in four states × installed-or-not × server-has-a-keypair, where several honest answers are an instruction rather than a control, plus three preferences and a managed device list.
- **The ledger and the dispatcher are NOT built.** §3's `NotificationSend` and §3.1's `NotificationDispatcher` land with the sweep that reads and feeds them. An interface with one caller and no second implementation is the speculative abstraction §3.1 was careful not to ask for yet.

And what the build measured rather than assumed: `webpush.generateVAPIDKeys()` really does emit 65 bytes public / 32 private in the base64url alphabet (so §1's swap check is calibrated, not guessed), and **the worker draws a notification for every push** — verified in Chromium by a new `scripts/push-handler-check.mjs`, which delivers straight to the registered worker over CDP and reads back what it drew, so it needs neither a push service nor a keypair. Phase 0's atomic swap re-verified with the new listeners in place.

**PHASES 2 AND 3 BUILT 2026-08-21** ([session note](../planning/2026-08-21-notifications-phases-2-3-built.md)).

Phase 2 moved §5's derivations into `packages/shared` — `zones.ts` (the ADR-0107 model) and `task-time.ts` (`dueZone`, `taskBand`) — so a send time and a printed time are one derivation rather than two that agree today. Counted before moving: the zone functions had 2–5 call sites each and moved outright, while `todayInTz` (14 files) and `TaskClock` (17) are **re-exported** from their old paths, because churning 31 files to relocate a definition is cost without a reader. It also collapsed a duplicate the move created: `todayInTz` briefly existed in both packages, which is exactly the drift this repo has several ADRs about. And it **amended `packages/shared/CLAUDE.md`**, whose rule said no `Intl` in shared: the real line is _nothing ambient_ — `Intl.DateTimeFormat` with the zone as an **argument** is deterministic, and `schemas.ts` had been validating zone strings that way since long before the rule was written.

Phase 3 added the clock: the `NotificationSend` ledger, the sweep, quiet hours, the per-source caps, `NotificationDispatcher` (§3.1's seam B, which now has a caller and so is no longer speculative), and a 60-second in-process ticker that **starts no timer while no kind is registered**. §3.1's threshold-2 amendment above is the part worth reading twice.

### 9. The lock screen renders the string, so ADR-0118 does not reach it

**Non-obvious and worth one line:** every number in this app renders inside an LTR-isolated island (ADR-0118, `lib/bidi.ts`) — and none of that machinery exists in a notification, whose text the **operating system** draws. A Hebrew string ending in a time can therefore reorder on the lock screen in ways the app never shows.

Consequence for 0198's copy: keep digits away from the string's edges where a neutral character would flip, prefer `·` to parentheses and arrows around numbers, and **check each string on a real iOS and a real Android lock screen** — this is a device-pass item in the sense ADR-0146 means, not something a mockup can settle.

### 10. Failure is how a subscription dies, and the ledger is the log

A `404` or `410` from the push service means the subscription is gone: **delete the row** (this is the normal end of a subscription's life, not an error). A `413` is our bug and is capped at §6. A `429` or `5xx` sets `lastFailedAt` and the send is dropped per §3. Anything else is logged with the endpoint's host, never its path — an endpoint is a bearer capability, so it is not written to logs whole.

No separate metrics table: `NotificationSend` **is** the record of what was sent, and `@@index([userId, sentAt])` is also what enforces 0198 §6's per-day cap.

**AMENDED IN BUILD (2026-08-21, a field report): the two per-kind policies are TOLD to the push service, not just enforced here.**

Reported: _"I got the notification as soon as I opened the app. But when it was closed I got nothing."_ The worker was not at fault — its `push` handler parses synchronously and hands `showNotification` to `event.waitUntil`, so a freshly-started worker cannot be killed before it draws. What happened is that the push service **held** the message while the device was unreachable and released it on reconnect, and it was entitled to: `web-push`'s default TTL is **four weeks** (`DEFAULT_TTL = 2419200`) and its default urgency is `normal`.

So a send this sweep would refuse to re-derive after an hour could be delivered by FCM 672 hours later, saying "your flight is in two hours". The staleness rule existed on our side only.

Both knobs are RFC 8030's and both are already declared per kind, so neither is a new decision — only a message that was never sent:

- **`timeCritical` → `Urgency`.** §5.3's `high` row is "incoming call or time-sensitive alert", and is the one delivered to a device on low battery. That is what `timeCritical` already means, so the mapping is a rename.
- **`staleAfterMs` → `TTL`**, rounded up so it cannot expire inside the window the sweep still considers current. A notification past its staleness is a lie about the time, and expiring it at the push service is the same answer we already give ourselves.

Derived from the kind by id (`deliveryFor`) rather than declared a second time, because a per-kind table of urgencies is a copy that can disagree with the flag the sweep enforces. An unnamed kind — the dev-only `test` send — gets ordinary urgency and fifteen minutes rather than inheriting a month.

**What this does not fix, and the honest limit:** it does not make a push arrive at a device whose browser the OS has stopped. Whether a closed PWA is woken at all is the platform's call — Android battery optimisation and a force-stopped browser both prevent it, and no header changes that. What this changes is that a late delivery no longer arrives as a **lie**: past its kind's staleness the send expires instead.

**AMENDED IN BUILD (2026-08-21): the transport had never worked in production, and the reason was a mock looser than the module it stood for.**

The first status-less failure, read once its reason was logged, said `webpush.sendNotification is not a function`. `web-push` is CommonJS, so a dynamic `import()` of it returns a Module namespace whose named exports are only those `cjs-module-lexer` can detect statically — for this library `WebPushError` and `supportedContentEncodings`, and **not** `sendNotification`, which is reachable only through `.default`. So every send this feature ever attempted threw, and because that `TypeError` carries no `statusCode` it was logged as an ordinary transport failure for the whole life of the epic.

**No test could see it, and that is the part worth keeping.** `web-push.sender.spec.ts` mocked the module as `{ sendNotification }` — a top-level named export no build of the library has ever had. The mock was **looser than reality**, so eight specs asserted the sender's whole contract against a shape that could not occur. The mock now mirrors the real namespace (`sendNotification` on `.default` only), which makes every one of those eight fail against the old code, and a `shape` switch covers the ESM fallback so both interop branches are exercised rather than one being hoped for.

This is the third time in this epic that a fake diverging from the real thing hid a defect (phase 1's fake Prisma stricter than Prisma, phase B's leaked prototype spy, and now this) and the only one that reached production. The lesson is narrower than "write better fakes": **a fake's SHAPE is part of the contract under test.** When the thing being stubbed is a module boundary, copy its real export shape, because that boundary is exactly what the stub replaces.

**AMENDED IN BUILD (2026-08-21, the same production failure): a claim whose send reached NO device is handed back, and the next tick re-derives it.**

This is not a new policy — it is what `SEND_OUTCOME.FAILED` has documented since phase 1: _"recorded and dropped; §3's sweep re-derives on the next tick rather than retrying here."_ That re-derivation could not happen. The claim is written **before** the send, deliberately, so that a crash mid-dispatch loses a delivery rather than double-sending it; but a claim that outlives a **failed** send makes the loss permanent, and one DNS hiccup silently consumed somebody's flight reminder for good.

**The distinction that makes releasing safe is who told us.** A crash leaves us guessing what got through, so the conservative direction is right there. A transport failure is the sender reporting, in-process, that nothing arrived — there is no ambiguity to protect. Retrying what we know did not arrive is not a double send. So the claim-before-send ordering is unchanged, and only the in-process failure path releases.

Three boundaries, each of which is a branch rather than a comment:

- **Some device took it → the claim stands.** Two phones and one unreachable is a delivered notification; re-sending would buzz the phone that already has it.
- **No devices at all (`attempted === 0`) → the claim stands.** That is an empty audience, not a failure, and releasing it would re-derive the same candidate every tick until it went stale, for nobody.
- **`staleAfterMs` is the bound, and it is the right one.** The candidate stops being derived once the moment it names has passed, so an unreachable device costs one attempt a tick until the send is no longer worth making — and a device the push service reports `410` for is deleted on the first attempt and never tried again. A `429` is retried next tick, which at ADR-0198 §5's volume (a handful of sends per person per day) cannot be what caused the throttle; §3.1's fourth threshold (non-410 failures over ~1%) is where that stops being true and a backoff belongs.

**One implementation note that is a trap rather than a detail.** The map from a dispatched send back to its ledger key is keyed by the send's **value** (`userId`, `kind`, `subjectId`, `aimedAtMs`), never by object identity. `DirectDispatcher` returns the very objects it was handed, so a `Map<DueSend, …>` works today — and would break silently the moment this seam does what it exists for, because a `QueueDispatcher` serialises and returns an equal object that is never the same one. Releases would just stop, with nothing failing to say so.

**AMENDED IN BUILD (2026-08-21, a production failure): a status names itself; a send with NO status has to name its reason.** The rule above — log the endpoint's host and never its path — was right and is unchanged. What it did not say is what to log _instead_ of the path, and the answer had been nothing: `push send failed (no status) to fcm.googleapis.com` was the whole line, and it is unactionable. A no-status rejection is the one case where the library's own message **is** the diagnosis, because such a send never reached a push service at all — `web-push` refused before the request (a malformed subscription key, a VAPID complaint) or the socket did (DNS, TLS, timeout). **The first class is the likely one, and it is now measured:** a well-formed request always comes back with a status — even a bogus FCM endpoint token answers 410 — so a status-LESS failure points at `web-push` refusing locally rather than at the network. So the reason is appended for that case only, with two constraints that keep it inside the privacy promise: the endpoint is **subtracted** from the text rather than trusted not to appear (`WebPushError` carries an `endpoint` property, so a future message could interpolate it), and the text is **capped**, because a library is free to put a response body in there.

**And the same failure corrected a documented decision about the OTHER keypair.** `MAX_PUSH_KEY_LENGTH`'s note said the caps "exist to bound the column, not to validate the crypto — the push service is the authority on whether the keys work, at send time". The first half stands; the second was wrong about _where_ a bad key is caught. `web-push` validates both lengths itself and throws **before** any request, so a wrong-length `p256dh`/`auth` never reaches a push service and there is no verdict to defer to — it appears as a subscribe that succeeded and a send that failed with no status, hours later and on another day's log. RFC 8291 fixes both lengths (65 bytes and 16), so `createPushSubscriptionSchema` now checks them at the subscribe, which is the one moment somebody is still holding the device. That is exactly the argument `validateVapid` already makes for the server's own keypair — "a swap is caught at boot instead of at the first send" — applied to the half it had been left out of. The client already rolls its local subscription back when registration fails, so a refusal costs a retry rather than a spent permission.

## Consequences

- **Schema:** two new tables (`PushSubscription`, `NotificationSend`), both control-plane, neither in the sync protocol or the trip snapshot. One migration, no change to any existing model.
- **Config:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:`), named in `common/env.ts` and required in production by `validateConfig` (ADR-0071) — with the public key served to the client through the existing config/me route rather than a second `VITE_` copy that can drift from the private half.
- **Dependency:** `web-push` on the backend. Nothing new on the frontend (`workbox-window` is already there and `injectManifest` uses the same plugin).
- **`packages/shared` gains the zone and task-band derivations** (§5). The frontend keeps its import sites; the backend gains the ability to answer "what wall clock does this person read".
- **The exception to "the read is the trigger" is now on the record**, scoped narrowly: this is the only subsystem allowed a clock, and the reason is that its output is defined by nobody reading. Anything else that wants a scheduler still has to argue against ADR-0166 §14.
- **Redis stays reserved, unused and harmless.** The backlog expected this epic to be the BullMQ role's first consumer; it declines it. `docker-compose.yml`'s comment still names Gmail import, which is untouched by this ADR and remains a genuine candidate — a fan-out import with retries is the workload a queue is actually for.
- **iOS coverage is partial and stated in the UI** rather than assumed away. If the group's devices turn out to be mostly un-installed Safari, §1's deferred email transport is the answer, and it is a provider behind the same sender interface.

## Alternatives considered

- **BullMQ delayed jobs (the backlog's own costing).** Rejected on §3's argument: the queue duplicates a schedule Postgres already holds, and every edit path — including cascades that write no `Change` rows and an outbox replaying hours late — has to keep the copy honest. It also buys durability we would have to configure (no volume today) to protect work that costs nothing to redo. Reopens on volume, behind the sender interface.
- **Precompute a row per future notification at write time** (a queue in Postgres instead of Redis). Same defect with a different storage engine: it is still a second copy of `dueAt`, still needs cancellation on every edit. The ledger records the **past**, which is the half that cannot go stale.
- **Client-side scheduling** (`Notification` from a `setTimeout`, or the Notification Triggers proposal). Rejected: a closed tab has no timer, and Triggers ships nowhere. This is the failure mode the feature exists to fix.
- **Notify from the `Change` stream** (a socket message becomes a push). Rejected: the stream is peer edits, not obligations. Most obligations are **not** changes — nobody edits anything on the morning a flight leaves — and the reverse was already decided against as a toast (ADR-0081). 0198 §5 admits a narrow, batched exception.
- **A separate worker service on Railway.** Rejected for now: a second service, a second deploy, a second set of secrets, to run a 60-second timer that costs nothing beside the API. Revisit if the sweep ever competes with request latency, which is measurable before it is guessed at.
- **A native app wrapper for reliable iOS delivery.** Out of scope by ADR-0007, and it trades one coverage hole for an app-store release process.
