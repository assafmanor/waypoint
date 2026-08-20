# 2026-08-20 — Notifications: the epic, designed

**Ask (owner):** _"I want to start working on adding notifications. Two things: (1) the technology and infrastructure — how are we going to achieve that? (2) scope what notifications we are going to send and when (task reminders, booking reminders, before the flights (to check in?), etc.)"_

**Deliverables:** [ADR-0197](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) (the pipe) and [ADR-0198](../decisions/0198-we-notify-what-you-can-still-miss.md) (the catalogue). Two ADRs rather than one because the questions have different lifetimes: the transport and the clock will outlive any particular reminder, and the catalogue will be argued about every time somebody wants a new ping. Nothing is built.

## What the survey found before anything was decided

- **The backlog had already costed this** (2026-08-15, from the tasks PM session) and named four costs. Three of them survived the session unchanged. **The fourth did not** — see below.
- **Nothing exists.** Re-verified rather than trusted: no `web-push`, `VAPID`, `pushManager` or `new Notification(` in `frontend/src`, `backend/src` or `packages/shared/src`.
- **The app already has the taxonomy this needs and it took no inventing.** ADR-0164 asked _"what can you still miss today"_ and answered it exactly: top-level blocks ahead of you plus an ambient span's own **edge**. That set, plus task deadlines, plus one addressed social send, is the whole catalogue.
- **`CATEGORY_TIME_PROFILE`** (`packages/shared/src/icons.ts`, nine rows) is where a per-category notification lead belongs — one field on an existing closed table, not a second lookup beside it.
- **The seed has no dated tasks.** `grep -c dueAt backend/prisma/seed.mjs` → **0**. So today nothing in the repo can exercise a single row of the catalogue, which makes the fixture work a **blocker** for phase A rather than a chore after it.

## The one thing that reversed

**The backlog said the scheduler activates the reserved BullMQ role. It should not, and ADR-0197 §3 says why.**

The queue would be a **second copy of a schedule Postgres already holds** (`Task.dueAt`, `Event.startsAt`, the ADR-0184 window bounds), and every edit path would have to keep the copy honest: an LWW patch, a move, a ripple, a delete, a settle, a parent's cascade — **and the cascades write no `Change` rows**, the exact hole ADR-0152 §2 / ADR-0157 §3 already paid for once on the client. Add the offline outbox replaying an edit hours later and the queue is wrong silently, in the direction of sending something false.

What replaces it: a **60-second sweep** that derives candidates from the entities, plus a `NotificationSend` **ledger** whose unique key is `(userId, kind, subjectId, fireKey)` — and `fireKey` is _the instant the send was aimed at_, which is the detail that makes edits behave (a moved deadline re-arms; an edited title does not). Insert-the-ledger-row-and-send in one transaction is also the exactly-once mechanism across instances, so nothing here assumes a single process (ADR-0065).

Two smaller facts that pushed the same way: the compose Redis has **no volume**, so delayed jobs die on restart (durability is work BullMQ would _add_), and a durable queue's behaviour after downtime is a burst of stale sends, where the sweep's is silence. **Redis and BullMQ stay reserved** — the backlog line is not consumed — and the switch is behind one sender interface if volume ever asks for it.

## The other thing worth carrying forward

**"Notify before the flight to check in" should not be a notification.** We do not store the airline's check-in window, so a send claiming check-in is open is a guess printed as a fact. It becomes an **automatic task** instead (deadline = departure − 24 h), which then rides `task.due` for free _and_ shows up in Plan, the Index and the booking's own section, and can be ticked — ADR-0190's "a readiness check is a task row" applied one row further. Expect this pattern to absorb the next two "notify X before Y" requests too.

## Phasing (one PR each, in this order)

**Phase 0 — the service worker becomes ours, and nothing else changes.** `vite.config.ts` moves from `generateSW` to `injectManifest` + `src/sw.ts`, hand-writing what the template used to emit: the `SKIP_WAITING` listener, `precacheAndRoute`, `clientsClaim`, the navigation fallback and its `SERVER_ROUTE_PATTERN` denylist, the `map-glyphs` rule. **This is the phase that can break something already fixed** (ADR-0185's atomic swap — a missing listener is a silently degraded PWA, not a build error), so it ships with a build-failing contract test in the shape of `styles/exit-animations.contract.test.ts`, and it is verified by installing a build and taking the update path. No notification code in this PR.

**Phase 1 — the plumbing, end to end, with one hard-coded send.** VAPID through `env.ts` + `validateConfig` (ADR-0071), the two tables, `web-push`, `POST/DELETE /notifications/subscription`, the `push` + `notificationclick` handlers, the `UserSettings` row with the honest iOS state. Proven by a dev-only "send me a test notification" button, which is also how the lock-screen device pass gets run.

**Phase 2 — the zone derivations move to `packages/shared`.** `currentZone` / `zoneCrossings` / `segmentZoneAt` / `ZoneCrossing` out of `frontend/src/lib/places.ts`, and `dueZone` / `taskBand` / `TaskClock` out of `frontend/src/lib/tasks.ts`. Pure and clock-injected already, so this is a move plus re-exports. It is what makes the send time and the printed time the same fact. Do it **before** the first real send, not after — the 03:00 notification is the bug that ends the feature.

**Phase 3 — the sweep, the ledger, quiet hours, the daily cap.** Plus `PUSH_DISABLED`. Still zero kinds registered: the tick runs and sends nothing, which is a testable state.

**Phase 4 — the seed gains deadlines**, then phase A's three task kinds (`task.due`, `task.digest`, `task.assigned`). The count of what one simulated trip day actually produces is measured here and written into ADR-0198 §5, replacing the computed estimate.

**Phase 5 — phase B** (`event.hard.soon`, `span.edge.soon`, `trip.tomorrow`) and `notifyLeadMinutes` on `CATEGORY_TIME_PROFILE`.

**Phase 6 — phase C**: the flight-check-in automatic task, then `readiness.nudge`.

**Phase D is not scheduled.** ADR-0198 says out loud that it may never ship.

## Open questions for the owner (none of them block phase 0–3)

1. **Is `group.imminent` (phase D) wanted at all?** The ADR leans no and says so. It is the only row whose absence costs nobody an obligation.
2. **`task.due` when `assigneeUserId` is null** goes to the whole group in the catalogue as written. The alternative is nobody — an unassigned task is by definition not yours. Group was chosen because "one of us" is how the app words it, but this is a taste call about who gets interrupted.
3. **The leads in §3** (transport 120, lodging 60, food 30) are a starting point in ADR-0063's sense. They want a real trip, not a review.
4. **Email as a second transport** if the group's phones turn out to be mostly un-installed iOS Safari. Deferred in ADR-0197 §1 with the condition that reopens it.

## Two rules from these ADRs that outlive them

- **The read is still the trigger everywhere else.** ADR-0166 §14 / ADR-0180 §14 stand; this epic is a scoped exception whose justification is that its output is _defined_ by nobody reading. Anything else that wants a clock still has to argue against them.
- **The lock screen is drawn by the operating system, so ADR-0118's bidi isolation does not reach it.** Every other surface in this app puts numerals in LTR islands; a notification string cannot. That is a device-pass item on both platforms, not a mockup question.
