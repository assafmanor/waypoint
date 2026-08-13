# 0185 — A build swaps **whole**, or not at all — and takes itself when nobody is looking

**Status:** Accepted (2026-08-13) — built the same day.
**Date:** 2026-08-13
**Session note:** [`planning/2026-08-13-session-263-the-build-swaps-whole.md`](../planning/2026-08-13-session-263-the-build-swaps-whole.md)

**Supersedes** [0181](0181-a-swapped-build-announces-itself.md) §1 (`registerType: 'autoUpdate'` with `skipWaiting` on) and its §3 (the rejection of `'prompt'`). §2's reading of the plugin's client source stands and is **extended** — the same class of trap turned out to exist in `'prompt'` mode too, and this time it was measured rather than read. §4–§7 (the banner is `StatusBanner`, mounted at the root, on top, its verb's touch target, the hourly re-check) are unchanged; what changes is that the banner is no longer the mechanism.

**Amends in place:**

- `architecture/sync-and-offline.md`'s _"A rebuilt SW takes over immediately, and says so"_ — rewritten there, not restated here.
- `lib/money.ts`'s standing observation that the app has no `ErrorBoundary`. It has one now.

**Relates:** [0007](0007-pwa-not-native.md) (the PWA) · [0018](0018-client-generated-ids.md) (why a reload mid-flush is safe) · [0026](0026-real-clock-dev-time-travel.md) (why the idle math goes through `getNow`) · [0060](0060-reopen-after-idle-resets-to-home.md) (the precedent that a long background stretch may reset the view) · [0078](0078-feedback-state-family.md) (`ErrorState` is the crash screen's shell) · [0096](0096-domain-claude-md-files.md) / rule 8 (why the visibility listener was extracted rather than copied a third time)

## Context

The reported symptom: **the app freezes on a blank screen after a deploy, most often on the first open after one.** ADR-0181's notice does its job when it appears — and sometimes the freeze happens first, with no notice possible.

ADR-0181 named the mechanism in writing and shipped a notice as the compensating control: _"its running JS holds the old build's chunk hashes while the new SW has already replaced the precache, so a dynamic import of a not-yet-loaded route can miss."_ Two things were wrong with treating that as covered.

**1. The swap is not atomic, and a notice cannot make it so.** With `skipWaiting`/`clientsClaim`, a rebuilt SW activates and claims the open page immediately, and Workbox's precache cleanup then deletes every entry not in the new manifest — which, with content-hashed filenames, is every `assets/*-<oldhash>.js`. The image ships one `dist`, so those files are gone from the server too (`all-exceptions.filter.ts` returns a JSON 404 for a script request, which only falls back to the shell for `Accept: text/html`). From that instant, every route the page has not already loaded is a guaranteed failure. The update check fires **on navigation**, so this lands seconds after the app opens — precisely when someone taps a tab. The notice is racing the failure, and a race is not a fix.

**2. There is no error boundary anywhere in the app**, so losing that race is fatal rather than ugly. React unmounts the whole tree on an uncaught render error; a rejected `React.lazy` import produces a blank white document with no error, no affordance and no way back. `lib/money.ts` had carried a comment saying exactly this since a currency-less trip blanked the screen. The build swap was the second instance of one bug.

## Decision

### 1. `registerType: 'prompt'` with `skipWaiting: false`. The swap becomes atomic.

A rebuilt SW **waits**. The old worker keeps serving its own complete precache, so the running document and the chunks it has not loaded yet still agree — the mixed state simply cannot exist. The new build is taken only by an explicit `SKIP_WAITING`, which is always immediately followed by a reload.

ADR-0181 §3 already said `'prompt'` was "strictly better" on this defect and rejected it on two grounds. Both are answered:

- _It reverses §1's intent: an offline reload in between would run stale JS._ It would run the **old, complete, self-consistent** build, which works. The bug was never staleness; it was **incoherence**. A build that is a build behaves; half of one does not. And the window is now bounded by §2 rather than by a tab closing.
- _It is not a one-word change and fails silently._ Correct, and that warning is why this is one change and not two: the plugin forces both Workbox flags on under `autoUpdate` and does **not** force them off under `'prompt'`, so `skipWaiting: true` surviving the edit would leave the worker self-activating and the `waiting` event this mode hangs off would never fire. Verified in a real build: the generated `sw.js` now carries the `SKIP_WAITING` message listener and **no** unconditional `self.skipWaiting()` — workbox-build's `sw-template.js` emits one or the other, never both.

`clientsClaim` stays **on**, and it is not the other half of the pair. With no previous worker there is no old build to be incoherent with, so it only means "the first visit is offline-capable without a second load". On an update, the claim rides our own `skipWaiting`.

### 2. The build takes itself, at a moment a reload costs nothing

The owner's call, and the reason §1 does not simply hand the banner more work to do: a prompt is a chore, and a waiting build is **harmless**, so there is no reason to interrupt anyone with it. Three moments, in the order they fire in practice:

- **The tab goes hidden.** A screen lock or an app switch, which on a phone happens within minutes. Nobody is looking; the reload is free. This gets its own event because a backgrounded page is throttled too hard for a poll to catch the window the OS gives it.
- **The document has never been touched.** `touchedAtRef === 0`. A reload before the first tap is indistinguishable from a slightly longer boot, and this is the common case after a deploy: the update check fires on navigation, so the new build turns up seconds after the app opens. This is the reported symptom's exact scenario, now ending in a fresh build instead of a blank page.
- **Foreground idle** past `SW_UPDATE_IDLE_APPLY_MS` (5 min). The backstop for a phone face-up on a table. Deliberately long: the hidden edge almost always gets there first, so a short one would buy nothing and would reload pages people are reading.

**And never while it would cost something.** `canReloadQuietly()` refuses while any overlay is open (asked of `nav-state`'s overlay stack, the one registry that knows — a half-filled sheet is real work) or while an editable element has focus. Hidden is **not** an exemption from that: an app switched away from mid-form is the most likely way to be mid-form.

Nothing guards the outbox, on purpose. A queued write lives in IndexedDB and the flush is FIFO and idempotent (ADR-0018), so a reload mid-flush re-sends and the server rejects the duplicate. And ADR-0060 already establishes that a long background stretch may reset the view to Home, so the worst case here is bounded by a cost the app has already accepted.

### 3. The reload hangs off `controllerchange`, **not** the plugin's `onNeedReload`

This is the part that a code reading would have got wrong, and did — it was caught by running two builds against a live tab, and every unit test in the repo passed straight through it.

ADR-0181 §2 established that under `autoUpdate` the signal is `onNeedReload` and not `onNeedRefresh`. Under `'prompt'` the pair swaps: `onNeedRefresh` fires on `waiting` (reliable — workbox-window also raises it for a worker already parked when the page loaded, the cold-open case). But `onNeedReload` is **not** the reload signal, because the plugin's `controlling` handler reads `if (event.isUpdate)`, and workbox-window only sets `isUpdate` when its own `updateLikelyTriggeredExternally` heuristic decides the update was ours. That heuristic includes _"more than 60 seconds since `register()`"_ — true of every update a long-lived tab will ever find.

Measured: SKIP_WAITING posted, the new worker activated and claimed the tab, `controllerchange` fired — **and `onNeedReload` never ran.** The page sat there running orphaned JS: the exact state this ADR exists to prevent, reintroduced by trusting a callback whose gate has nothing to do with whether we asked.

So the reload listens to `navigator.serviceWorker`'s `controllerchange` directly. No heuristic, no opinion about who caused it: the controller changed, therefore this document is stale, therefore it reloads. `onNeedReload` is still passed — it is also an **override**, and passing it is what suppresses the plugin's own `window.location.reload()` (ADR-0181 §2's point, still true) — and it routes into the same idempotent handler.

One consequence of listening at that level: `clientsClaim()` taking a **first** install also fires `controllerchange`. So the handler first asks whether this document was controlled when it loaded; if it was not, the claim is the opposite of a stale build and is ignored. Without that, every first-ever visit would be greeted with "a new version was installed".

### 4. The banner survives as the exception, not the mechanism

Kept (owner's call) for the two cases the quiet path cannot serve, and it needed no new copy — `גרסה חדשה הותקנה`, past tense, is true of both:

- **Another tab took the swap.** This tab is now orphaned through no decision of its own. Shown immediately, because that state is the dangerous one.
- **The quiet path has been blocked for `SW_UPDATE_NOTICE_AFTER_MS`** (10 min — twice the idle rule, so it can only follow a real refusal). At which point offering the choice is more honest than waiting longer.

### 5. Nothing blanks the screen again: a root boundary, and a chunk that heals itself

Defense in depth, and worth having on its own merits — this is the app's first error boundary of any kind.

- **`AppErrorBoundary`** mounts in `main.tsx` above the router, because the surface it has to keep alive is the whole document. It renders `ErrorState` (ADR-0078's shell — the boundary supplies content, not a look) with a reload and nothing else: it catches what we did not anticipate, so "try that again" is the only honest verb. It also `console.error`s the crash, since a silent blank screen is what made the last one hard to place.
- **`lazyRoute`** replaces `lazy` at all eleven code-split routes. A failed dynamic import triggers **one** reload — a fresh document names chunks that exist — and the loader's promise then never settles, so the Suspense fallback stays up instead of flashing an error onto a document that is already leaving. A second failure inside `CHUNK_RELOAD_COOLDOWN_MS` is a chunk that was never deployed rather than one that moved, so it re-throws to the boundary instead of spinning. The cooldown lives in `sessionStorage`; if storage refuses (Safari private mode) we cannot count, so we do not reload at all.

### 6. The shell must never outlive the assets it names

`express.static`'s default (`public, max-age=0`) already forces revalidation, so this is **not** the cure for the freeze and is not claimed as one. It is made explicit because §1 deliberately keeps serving a whole old build for a while, which promotes an incidental property to a load-bearing one. The other half is the trade `max-age=0` gets wrong: everything under `/assets/` is content-hashed and therefore immutable by construction, and was paying a conditional GET each — a round trip per asset, on exactly the weak connectivity abroad that the code-splitting exists for.

## Consequences

- **A tab can run one build behind for up to five minutes of foreground use.** That is the cost of atomicity, and it is paid in a state where everything works.
- **The update is no longer observable to the user in the normal case.** Deliberate, and it means a deploy's reach is now measured by the server, not by a banner someone remembers seeing.
- **`nav-state` exports `useHasOverlay`**, the overlay-stack question that already existed on the context and had no consumer outside the back resolver.
- **`lib/visibility.ts`** is a new shared module, not a new mechanism: `App.tsx`'s idle-resume reset and `trip-state`'s warm-resume catch-up had each grown the same `hiddenAt` bookkeeping, and this change would have been the third copy (rule 8). Both were moved onto it.

## What is tested, and what is not

The honest boundary moved a long way, and the part that moved is the part that mattered.

**Unit-tested** (`ui/AppUpdateNotice.test.tsx`, registration mocked): a waiting build is taken at once on an untouched document; held once the page has been used and taken when the tab hides; taken in the foreground after the idle stretch; **never** taken under a focused field, hidden or not, and taken as soon as that field blurs; asked for once and not re-asked; the reload follows the swap rather than the request; a first install's claim is not announced; the banner appears only for an unasked-for swap or a long-blocked one. Plus `lib/lazy-chunk.test.ts` (one reload, no spin, no reload without storage), `ui/feedback/AppErrorBoundary.test.tsx` (the document is not empty — the assertion that matters is the negative one) and `backend/src/common/static-cache.spec.ts`.

**Tested in a real browser, by `scripts/deploy-swap-check.mjs`** — which is the thing ADR-0181 called untestable, and it was untestable as a unit test, not as a script. Two production builds, a static server whose contents change mid-run, real Chromium. Measured on this change:

|                                                       | before (`autoUpdate` + `skipWaiting`) | after         |
| ----------------------------------------------------- | ------------------------------------- | ------------- |
| new worker parked after the deploy                    | no — activates under the page         | **yes**       |
| a chunk only the old build had, still in the SW cache | **no**                                | yes           |
| …still fetchable by the live page                     | **no — 404**                          | **yes — 200** |

That 404 is the blank screen, reproduced. The script also releases the hold and watches the app take the new build with no user action, which is how §3's defect was found.

**Still not tested:** iOS/Safari specifically (the harness is Chromium), and the real-world timing of the hidden-edge apply on a suspended PWA.
