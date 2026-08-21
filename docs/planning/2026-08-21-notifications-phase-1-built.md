# 2026-08-21 — Notifications phase 1: the pipe, end to end

**Built.** [ADR-0197](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) §1/§2/§6/§7/§8/§10. A real notification can now reach a real device. Nothing decides _what_ to send or _when_ — that is phase 3's sweep and phase 4's first kinds.

Also answered here, because the owner asked while starting this phase: **how many phases remain, and whether any of them is a design phase** (§"The phase list, re-cut" below).

## What shipped

**Backend.** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` + `PUSH_DISABLED` through `common/env.ts`; the fail-fast validation (ADR-0071); one table (`PushSubscription`); a `notifications` module with `POST`/`DELETE /notifications/subscription` and a dev-only `POST /notifications/test`; `NotificationSender` (seam A of §3.1) with `WebPushSender` behind it.

**Frontend.** The worker gains `push` and `notificationclick`; `lib/push.ts` answers "can this device be reached, and if not why" and owns the two verbs; sign-out revokes; `PushDebugPanel` is the gesture that subscribes.

**`GET /me` gained `push: { vapidPublicKey }`** — `null` when the server holds no keypair. All four `Me` paths funnel through `getMe` (counted, not assumed: `grep -n "return this.getMe"` → three, plus `getMe` itself), so the capability needed adding once.

## Five decisions worth the reader's time

**1. The subscribe upsert re-owns the endpoint, and that is a security fix rather than a nicety.** `update` includes `userId`. Create-and-ignore-conflict would leave the _previous_ signed-in user owning a shared device's endpoint and still being notified on it — ADR-0197 §2.3's handed-over-phone case arriving through the front door instead of through sign-out.

**2. `DELETE` takes a body.** Unusual, and right: an endpoint is a URL _and_ a bearer capability, so a path segment would percent-encode a credential into every access log. It is also scoped to the caller's own rows (`deleteMany` on the pair), so a request carrying somebody else's endpoint cannot unsubscribe their device.

**3. The test send is a backend route, not a button.** Push exists only in a **production build** — there is no service worker under `pnpm dev` — and `import.meta.env.DEV` is _false_ there, so a `DEV`-gated button could never test the thing it exists to test. A curl works against any build, including a phone on staging. It is gated on `isDevAuthEnabled()`, which is not a new flag but one `validateConfig` already refuses to let be true in production.

**4. The one piece of UI phase 1 could not avoid**, and it is deliberately an instrument. The permission prompt must come from a user gesture, so a curl cannot register a device. `PushDebugPanel` is `BuildBadge`'s register — inline styles, Latin text, no token spend, gated behind `VITE_PUSH_DEBUG` — and it sits exactly where phase 1b's designed row will land, so that becomes a swap rather than a move.

**5. The payload contract is zod-free, and that exemption is the interesting part.** `packages/shared/src/push.ts` imports nothing. The worker is bundled with `inlineDynamicImports`, so a zod import there would inline zod and every entity schema into the worker — on the critical path of every install. And a hand-written total parse is what the worker needs anyway: a `push` handler that throws is a **silent push**, which browsers treat as an abuse signal and eventually revoke the origin's permission for.

## What the build measured rather than assumed

- **The VAPID key sizes are the library's, not the spec's from memory.** `webpush.generateVAPIDKeys()` → 65 bytes public, 32 private, base64url charset. The validator's size check (which is what catches the copy-paste that swaps the halves) was written against those numbers _after_ running that line.
- **The worker draws a notification for every push, verified in Chromium.** New script, `scripts/push-handler-check.mjs` — CDP's `ServiceWorker.deliverPushMessage` delivers straight to the registered worker and the page reads back `registration.getNotifications()`, so the round trip needs no push service and no keypair. Five cases: a well-formed payload draws itself with its tap target on `data`; not-JSON, JSON-that-is-not-a-payload, an empty body and an **off-origin url** all draw the fallback — and the off-origin case additionally asserts the fallback's title rather than the attacker's, because a notification wearing supplied text would defeat the parse it slipped past.
- **Phase 0's atomic swap survives the new listeners.** `deploy-swap-check.mjs` re-run: worker parked, an old-build chunk still served at 200, the new build taken with no user action.

## Three things that were wrong before they were right

**The contract test's new push assertion was vacuous.** `expect(SW).toContain('parsePushPayload')` is satisfied by the _import line_ and by the `ReturnType<typeof …>` annotation, so deleting the actual call left the suite green. Mutation-testing found it; it is now `/parsePushPayload\(\s*event\.data/`. This is exactly the failure mode `frontend/CLAUDE.md` names — an assertion that reports green forever — and the only thing that finds it is breaking the code on purpose.

**The fake Prisma was stricter than Prisma, which turned a security assertion into theatre.** The spec for "one user cannot unsubscribe another's device" passed against a query with the ownership scope _removed_, because the fake compared each field directly: dropping `userId` left `row.userId === undefined`, so nothing matched, so the row survived. A `where` in Prisma constrains only the keys it carries. The fake now models that, and the mutation fails. **A fake that refuses more than the real store cannot test a refusal.**

**`push-handler-check.mjs` accused the code before it accused itself.** Its first version resolved the CDP registration id lazily, inside the first delivery, by cycling `ServiceWorker.disable`/`enable` to make CDP replay its registrations — which disturbed the worker enough that the first pushes went nowhere. It reported four failures against a worker that was behaving perfectly. `enable` replays on its own: listen first, enable once, resolve the id before any delivery.

## The phase list, re-cut — and the one design phase

Six phases remained after phase 0. **Phase 1 is now split, because the owner's question is a good one and the answer is that exactly one thing here wants designing.**

| phase | what                                                                         | design?                              |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------ |
| ~~0~~ | ~~the service worker is ours~~                                               | done                                 |
| **1** | **the pipe: config, table, routes, worker handlers, revoke — no product UI** | **done**                             |
| 1b    | the **Notifications settings surface** + the permission ramp                 | **yes — one mockup**                 |
| 2     | the zone derivations move to `packages/shared`                               | no                                   |
| 3     | the sweep, the ledger, quiet hours, the daily cap                            | no                                   |
| 4     | the seed gains deadlines, then phase A's three task kinds                    | no (a **device pass**, not a mockup) |
| 5     | phase B + `notifyLeadMinutes` on `CATEGORY_TIME_PROFILE`                     | no                                   |
| 6     | phase C: the flight-check-in automatic task, then `readiness.nudge`          | no                                   |

**Why 1b is a design phase and nothing else is.** The settings surface is a real state machine on a screen: permission in four states (default / granted / denied / unsupported), crossed with installed-or-not on iOS, crossed with the server having a keypair or not — and the honest answer for several of those is an _instruction_ rather than a control. On top of that sit three category toggles (ADR-0198 §6) and a device list that is a managed list, so `ListRow`/`RowManageSheet` needs checking before anything new is drawn. That is drawn and measured before it is coded, per ADR-0175.

**Why the rest are not.** Phases 2, 3 and 5 have no surface at all. Phase 4's surface is a **notification**, which the operating system draws — so there is nothing to mock up, and what it needs instead is the lock-screen device pass ADR-0198 §7 already asks for (the one place ADR-0118's bidi isolation cannot reach). Phase 6's automatic task renders through task rows that already exist (ADR-0190/0191).

## What is deliberately not here

- **`NotificationSend`, the send ledger.** It lands with the sweep that reads it (§3, phase 3). A new table costs nothing to add later; one nothing writes costs a reader's attention now.
- **`NotificationDispatcher`** (seam B of §3.1). Same reason: there is no sweep to feed it, and an interface with one caller and no second implementation is the speculative abstraction §3.1 was careful _not_ to ask for yet.
- **Any Hebrew copy.** ADR-0198 §7's table is the phase-4 deliverable; the only strings shipped here are the instrument's Latin diagnostics and the worker's fallback title, which is reachable only through a bug.

## Owner action to see it on a phone

```
npx web-push generate-vapid-keys              # into .env, all three
VITE_PUSH_DEBUG=1 pnpm --filter @waypoint/frontend build
pnpm --filter @waypoint/frontend preview      # a production build, not `pnpm dev`
# subscribe from the instrument in user settings, then:
curl -X POST http://localhost:3000/notifications/test   # DEV_AUTH=1
```

On iOS the app must be **added to the home screen first** — the instrument says so rather than offering a control that cannot work.
