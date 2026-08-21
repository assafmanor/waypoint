# 2026-08-21 — Notifications phase A, and the surface that switches it on

**Built.** ADR-0198's phase A — `task.due`, `task.digest`, `task.assigned` — plus phase 1b's settings surface, because a switch and the thing it switches had to ship together. Amendments: [ADR-0197 §7.2](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md), [ADR-0198 §7.1 and the phase-A build note](../decisions/0198-we-notify-what-you-can-still-miss.md).

The registry stops being empty. `NOTIFICATION_KINDS` was `[]` on purpose for two phases; phase 3's claim was that filling it in would be the only line that changed to turn the machinery on. **That held** — the sweep, the ledger, quiet hours, the caps and the ticker are untouched except for the two policies below.

## The one column that had to be added, and why it is not a retreat

`Task.assignedAt`.

ADR-0197 §3 derives every schedule from state rather than enqueueing it, and that works because **a deadline is a state**. "You were just assigned this" is not. No combination of `updatedAt` and `assigneeUserId` can tell it from somebody fixing a typo in the title, so there is nothing to derive from.

So the **fact** is recorded and the **send** stays derived. Three properties of the stamp are load-bearing, and `assignmentStamp` has a spec for each:

- **Null when the actor assigned themselves.** This is ADR-0198's "when the actor is not the assignee" rule applied where the actor is actually _known_. The alternative was the sweep comparing `assigneeUserId` to `updatedBy`, which is a guess that goes wrong the moment a third person edits the row inside the six-hour window.
- **Null on un-assign**, which retracts a send that has not gone out yet.
- **Untouched when the assignee did not change**, so an edit to anything else cannot re-announce an assignment somebody already heard about.
- **Null for every task written before the column**, and deliberately not backfilled: an assignment that happened before anybody could be told about it is not news.

## Two per-kind policies joined the interface

Both for the reason `timeCritical` is there: **a kind must not be able to forget.**

**`pref`** names the `User` switch that turns a kind off, and the sweep enforces it in one batched query beside `spentToday`. A kind with `pref: null` is one nobody can decline, and that is visible in its own source rather than by omission at the check. A missing user row reads as opted **out** — the only way to be absent is to have been deleted mid-tick, and silence is the safe direction.

**`dedup`** chooses the ledger identity. The default is the aimed-at minute, which is what makes a moved deadline re-arm and an edited title not. `task.assigned` needs `BY_SUBJECT`, and the reason is exact: ADR-0198 asks for "dedup on the assignee, so passing a task back and forth does not multiply", and with the default an A→B→A→B hand-off sends four times. There is no instant that both bounds this kind's staleness _and_ stays put across later edits, so the two jobs are separated instead of one of them being fudged. `SUBJECT_FIRE_KEY` is the word `once`, not an empty string, so a row in the table reads as a decision.

## The digest is the one kind whose trigger is a wall clock

The others fire at a stored instant. This one fires at 08:00 _somewhere_, and "is it 08:00 for this trip" can only be asked after a zone is resolved — which is the per-trip cost the inverted loop exists to avoid paying for nothing.

It stays inverted by asking in this order: **which trips have an open dated task at all** (one indexed scan, and most rows in that table are settled), then zones for only those trips, then which of them are at 08:00. So the cost scales with trips that have something to report.

Two things it deliberately does:

- **Counts overdue as part of today**, rather than nagging separately. ADR-0198 rejects the overdue nag by name, and this is the mechanism that replaces it.
- **Names today and tomorrow**, which is the addition that closes the owner's "we don't want to miss any upcoming" without a second send — and it matters most for the dated-**no-time** task, which never fires `task.due` by design and is most of what anybody writes weeks out.

It is per **person**, not per task: each member's digest counts their own assigned tasks plus everything nobody claimed, so two members of one trip get two different digests and somebody with nothing gets none.

## The copy moved to the server, which contradicted an ADR

ADR-0198 §7 put the strings "under a new `notify` namespace in `i18n/he.ts`". They cannot go there: ADR-0197 §6 shipped first and made `PushPayload` carry finished strings, so whoever sends composes — and that is the sweep. Composing in the worker instead would inline 2,600 lines of i18n into a bundle on the critical path of every install, which is exactly the cost `push.ts` refuses zod for.

So `notify-copy.ts` is the one place the backend holds user-facing Hebrew, and the file says what would change under a second locale (a `User` column and a lookup, not a rewrite).

### And the copy dropped a line that guessed a person's gender

§7's table read `דנה הטילה עליך משימה` — a **feminine verb inflected from a name**, about a real user, out of a field the app does not have. Hebrew has no neutral form of that verb, so the fix is not a different inflection but a construction with none in it: `משימה חדשה בשבילך` in the title, the subject and the sender as peer facts in the body. It stays _addressed_, which is what earns this send its place against ADR-0081's rejection of ambient awareness. There is a test asserting the verb is absent.

## The settings surface, built from the mockup

Everything the phase-1b mockup measured, plus what the build found:

- **`ui/primitives/Switch`** — the app's first boolean. `role="switch"`, a 46×28 track, the 44px target through an `::after` overlay (`ValueToken`'s technique), `--cta`/`--cta-text` for ON because the colour budget has no member for "this setting is on", and a **hairline rather than the iOS knob-shadow**, which is invisible on a dark track.
- **`.set-edit` now meets ADR-0017's floor.** It rendered at 25px at its existing call sites — the map-storage delete buttons on this very screen — and the device list is the second consumer that earned the fix, exactly as `.set-tz-trigger`'s 40px defect was fixed when the currency field became its second call site.
- **The preferences card renders only while this device is subscribed.** A category switch on a device that receives nothing narrows nothing, which is ADR-0197 §7's own copy rule.
- **The device list needs no endpoint on the wire.** `POST` now returns the row's id; the client stores it and compares ids. `GET /notifications/subscriptions` carries `{ id, label, lastSentAt, createdAt }` and neither the endpoint (a bearer capability) nor the raw user-agent. `deviceLabel` is ordered longest-claim-first because every Edge UA also says Chrome and every Chrome-on-iOS says Safari.
- **The second door** is `StatusBanner` with an action, inside `TaskSheet` under the deadline field. `waypoint:push:asked` is the "once per install" half, and **a dismissal sets it exactly as an acceptance does**.

### One new accessor, and it is not a test accommodation

`useMaybeAuth`. `useAuth` throws without a provider, correctly — for nearly everything a missing provider is a wiring bug worth failing loudly on. The push ask is the one shape where absence is a **state to render nothing for**: no session means no device to subscribe and nothing to offer. It also keeps `TaskSheet` from having to learn what VAPID is: the banner owns its whole dependency and takes one prop, `visible`.

The first attempt did it the other way round — `TaskSheet` read `useAuth` and passed the key down — and 13 tests failed because that form's own specs render it bare. That was the design telling the truth about where the dependency belonged.

## The seed, which was the stated blocker

`grep -c dueAt prisma/seed.mjs` was **0**. Now seven tasks, one per catalogue case: timed, dated-no-time, overdue, tomorrow, assigned-by-another, unassigned, undated, settled. Date-only deadlines use the app's own **23:59** convention (`DAY_DEADLINE_HHMM`) rather than midnight, or the sweep would have been fed a shape the app never produces.

And **memberships for all five demo users**. The trip had one, so every group-shaped behaviour — "one of us" reaching everybody, an assignment coming _from_ somebody, the roster's avatars — was untestable against the seed. The users already existed; only the memberships were missing.

## Things that were wrong before they were right

**A require cycle, caught by a type error.** `notification-kind.ts` held both the interface and the registry, so a kind imported `DEDUP` from it while it imported the kind back — which in CommonJS hands one side an `undefined` from a half-initialised module. The registry moved to `notification-registry.ts`; the interface no longer knows its implementers, which also made the sweep's `vi.mock` a two-line module instead of a partial mock.

**A mock that ignored its argument turned a security test into theatre.** `PushAskBanner`'s spec stubbed `pushBlocker` to return a fixture value regardless of the key it was passed — so "does not appear with no session" passed against a component that never checked. Fixed by making the mock honour its argument the way the real function does. Same lesson as the fake Prisma in phase 1, one layer up.

**`registerPushSubscription`'s mock resolved `undefined`** and the caller now destructures `{ id }` from it. Two specs failed for a reason that was only about the mock, which is the failure mode that comment in `push.test.ts` was already written about.

## What is still owed

- **The lock-screen device pass**, on both platforms, which ADR-0198 §7 requires before phase A is called done. A Hebrew string ending in a time and one ending in a name are the two shapes to look at, and neither can be judged from a sandbox.
- **Phase B** (`notifyObligations`, hard events and span edges) and **phase C** (readiness nudges, and the flight check-in that is an automatic task rather than a send).
- **`assignedBy`**, if the assigner's name in `task.assigned` ever visibly drifts. Today it reads `updatedBy`, which is exact at the moment of assignment and can drift if a third party edits inside the six-hour window — a courtesy in the body, never the thing that makes the send legitimate.
