# 0181 — A swapped build **announces itself**, and the reload is the user's

**Status:** Accepted (2026-08-10) — built the same day.
**Date:** 2026-08-10
**Session note:** [`planning/2026-08-10-session-239-the-build-swapped-under-you.md`](../planning/2026-08-10-session-239-the-build-swapped-under-you.md)
**Mockup:** [`mockups/sw-update-prompt-v1.html`](../../mockups/sw-update-prompt-v1.html) (§1–§3)

**Amends in place:**

- [0078](0078-feedback-state-family.md) — `StatusBanner` gains the `action` slot. Not a new prop so much as a **declared one finally taken**: `ui/feedback/types.ts` has said since it was written that `FeedbackAction` is shared by _"EmptyState / ErrorState / StatusBanner"_, and the banner was the one member that never had it.
- `architecture/sync-and-offline.md`'s _"The service worker (Workbox) caches the app shell and the document blobs"_ — one line, which described the cache and said nothing about the **update lifecycle**. Extended there rather than restated here.

**Relates:** [0007](0007-pwa-not-native.md) (the PWA itself) · [0017](0017-mobile-first-phone-primary.md) (the 44px floor the verb is measured against) · [0028](0028-plan-violet-color-budget-dark-ready.md) (the notice spends nothing from the budget) · [0096](0096-domain-claude-md-files.md) / rule 8 (why this is `StatusBanner` and not a second banner) · [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 (the touch-target overlay)

## Context

Backlog F-13, written when code-splitting landed: _"now that code-splitting is in (F-07), pair `skipWaiting`/`clientsClaim` with a 'new version, reload' prompt so a mid-session SW swap can't hand a client a stale lazy chunk."_

**There was nothing to pair with.** `injectRegister` was unset, which defaults to `'auto'`, which — with no import of the registration module — emits the plugin's four-line default: register `/sw.js`, no listeners, no callbacks. Read out of a real build, it is exactly this and nothing more:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
```

So the shipped behaviour has been: a rebuilt SW is fetched, activates, and **claims every open tab silently**, while that tab's running JS keeps executing against the old build — including the chunk hashes it holds for routes not yet loaded. The new SW's `activate` deletes precache entries no longer in the manifest, so the next dynamic import of one of those routes can miss. There has been **no user-facing signal of any of it**.

## Decision

### 1. `registerType` stays `'autoUpdate'`. The prompt bolts on top.

The existing `vite.config.ts` comment is right and is kept: without `skipWaiting`/`clientsClaim` a rebuilt SW only takes over once every tab of the old one closes, and an offline reload in between would still run stale JS.

What that buys is paid for in the tab that is **already open** — old JS against a new precache — and the notice is the compensating control for exactly that cost. The prompt therefore does not mean _"an update is available"_; by the time it shows, the swap has already happened and only the running page is behind. Hence the copy: `גרסה חדשה הותקנה`, past tense.

### 2. The signal is `onNeedReload`, **not** `onNeedRefresh` — and passing it is load-bearing

This is the part no README states and the part a future reader will otherwise get wrong. From the plugin's own client source (`vite-plugin-pwa@1.3.0`, `dist/client/build/register.js`), the two modes are disjoint branches:

- Under **`autoUpdate`** (`auto === true`), the only listener registered is `activated`, and `onNeedRefresh` is **never called**. `useRegisterSW`'s `needRefresh` tuple therefore stays `false` forever. A prompt written against it would compile, ship, and never appear.
- The `activated` branch reads `if (onNeedReload) onNeedReload(); else window.location.reload()`. So the plugin's **default in this mode is a silent full-page reload of a live tab.** Providing `onNeedReload` is what suppresses it.

That second point reframes the change. This is not only "add a notice"; it is **"do not let the app reload the page out from under someone mid-sentence."** Wiring the registration without an `onNeedReload` would have introduced that reload, since the trivial injected script never had it.

One consequence follows from the same source: in `autoUpdate`, `updateServiceWorker()` awaits the registration promise and returns — it sends no skip-waiting message and reloads nothing. The reload is our own `window.location.reload()`, and the ADR says so because the function's name invites the opposite assumption.

### 3. `'prompt'` was considered and rejected — and the trap is that it looks like a one-word change

On the defect F-13 names, `'prompt'` is strictly better: the old SW keeps serving its own precache until the user acts, so the stale-chunk window closes completely rather than narrowing.

It was rejected on two counts:

- It **reverses** §1's intent, which the owner's brief put out of scope: the offline-reload-runs-stale-JS case comes back.
- **It does not work as a one-word swap, and fails silently if attempted.** The plugin forces `workbox.skipWaiting`/`clientsClaim` to `true` under `autoUpdate` only; it does **not** force them off under `'prompt'`. The explicit `true`s in `vite.config.ts` would survive the edit, the new SW would keep self-activating, and the `waiting` event that `'prompt'` mode's entire flow hangs off would never fire. The result is a mode that registers a prompt nothing triggers. This is recorded in the config comment as well as here, because the config is where someone will make the change.

### 4. It is `StatusBanner`, mounted at the app root

Rule 8. `ui/feedback/` already owns the status-shell family, and ADR-0078 exists because six one-off shells had piled up. What was missing was not a component but a **mount**: `StatusBanner` was used per-screen, and `AppShell` frames only the in-trip surfaces — `/trips`, `/settings`, the join flow and the boot screen sit outside it. A build swap is not a fact about the screen you happen to be on, so `AppUpdateNotice` mounts beside `TripHandoffLayer` at the root, and `.app-update` is a positioned mount with no look of its own.

**Not a toast.** `TOAST_DURATION_MS` is 3.6s, and a reload prompt that disappears on its own is a prompt nobody sees. That is the line between a confirmation and a state.

**It does keep a dismiss.** The brief said "persist until acted on", and dismissing _is_ acting; what was refused is vanishing unasked. `frontend/CLAUDE.md` already lists `StatusBanner`'s `✕` among the things that are deliberately **not** back-stack layers — back navigates, it does not edit — so the notice registers no layer.

### 5. Top, and it covers the header's identity row

Drawn and measured (mockup §1/§2): the banner is 45px over a 116px header, so it sits on row 1 — trip name, sync badge, gear, avatars — and leaves the day strip and the whole body clear. The two lower zones are already spoken for: the toast at `bottom: 78px` and the tab bar beneath it, and a **persistent** notice cannot share a lane with a transient one.

Put to the owner with the alternatives drawn, and **answered: keep it on top.** The cost is real and named — while the notice is up, the passive sync badge ADR-0149 §7 protects is hidden — and it is bounded by the notice being rare and one tap from gone. The rejected alternative was an offset tracking the header's condense state, which makes a fixed element depend on a scroll position for a notice that shows once a deploy.

The copy is three words for a measured reason: past that it wrapped to a second line at 360px.

### 6. The verb's touch target is an overlay, not a height

`.fb-banner-action` is 27px tall and reaches ADR-0017's 44px floor through the `::after` overlay ADR-0161 §7 established and `ValueToken` uses — measured at 45px on the rendered page. A `min-height` would have grown the banner instead. `--cta`, the neutral primary: reloading is a generic action and spends nothing from the amber/teal/plan budget.

### 7. An open tab re-checks on its own clock

`SW_UPDATE_CHECK_MS` (1 hour) drives `registration.update()`. The browser checks `sw.js` on navigation and roughly every 24h, and this is a standalone PWA left open for the length of a trip — without a poll, a tab opened before a deploy runs the old build until it is closed. Skipped while offline, so a plane costs nothing.

## Consequences

- **`workbox-window` becomes a direct dependency.** It is a declared peer of `vite-plugin-pwa` that was never installed, because the trivial injected script did not use it — the moment the real registration module is imported, the build fails to resolve it. It is dynamically imported, so it lands in its own chunk (`workbox-window.prod.es5-*.js`) and stays off the initial bundle.
- **`injectRegister` is deliberately left unset.** Importing `virtual:pwa-register/react` flips the plugin's own `useImportRegister`, which resolves `'auto'` to "do not inject" — verified in a real build: `dist/registerSW.js` is no longer emitted and `index.html` carries no registration tag, so there is exactly one registration. Pinning it to `false` would instead mean **no** registration at all if that import were ever removed.

## What is tested, and what is not

Said plainly because the honest boundary is narrow, and no service-worker test existed anywhere in this repo before this change.

**Unit-tested** (`ui/AppUpdateNotice.test.tsx`, registration hook mocked): the plugin reports an update → the banner renders with the copy; the verb calls `location.reload()`; dismiss hides it without reloading; the poll calls `registration.update()` on the interval and skips while offline. Plus `StatusBanner`'s new `action` slot in `feedback.test.tsx`.

**Not tested, and not testable this way:** that a real `activated` event fires `onNeedReload` in a browser, and that an un-prompted tab really does fail a lazy import against the new precache. Proving either needs two builds and a `dist` swapped underneath a live tab — not something a unit test or a straightforward Playwright spec can do. Those rest on the plugin's client source, read directly and quoted in `lib/useAppUpdate.ts` rather than recalled from its docs.

**Found by rendering, in the mockup's own harness:** a top-level `const chrome` in the mockup script collided with the browser's `window.chrome` global and threw at parse, leaving the page blank — and `render.mjs` reported "no console errors", because it listens for `console` but not for `pageerror`. Worth knowing before the next mockup is judged by a renderer that cannot see its own failure.
