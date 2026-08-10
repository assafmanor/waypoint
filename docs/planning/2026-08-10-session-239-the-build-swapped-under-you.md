# Session 239 — the build swapped under you, and nothing said so

**Date:** 2026-08-10
**Task:** backlog F-13, _"SW update prompt"_.
**Outcome:** [ADR-0181](../decisions/0181-a-swapped-build-announces-itself.md) (Accepted, built same day) · [`mockups/sw-update-prompt-v1.html`](../../mockups/sw-update-prompt-v1.html)

## What the backlog line asked, and why it was wrong about the premise

> _"now that code-splitting is in (F-07), pair `skipWaiting`/`clientsClaim` with a 'new version, reload' prompt so a mid-session SW swap can't hand a client a stale lazy chunk."_

"Pair with" presumes there is something to pair. There was not. `injectRegister` is unset → defaults to `'auto'` → with no import of the registration module the plugin emits its own four-line script: register `/sw.js`, no listeners, no callbacks, no update handling. Read out of a real build, not recalled.

So the shipped behaviour was never "auto-update without a prompt". It was **auto-update with no observation of any kind** — the SW activates and claims every open tab silently while that tab's JS keeps running the previous build.

## The two facts that decided the implementation

Both came from reading `vite-plugin-pwa@1.3.0`'s `dist/client/build/register.js`. Both contradict what the plugin's docs lead you to write.

1. **Under `autoUpdate`, `onNeedRefresh` is never called.** The `auto` branch registers exactly one listener (`activated`) and one for first-install offline-ready. `useRegisterSW`'s `needRefresh` tuple — the thing every example binds a prompt to — stays `false` forever. A prompt written that way compiles, ships, and never appears. The signal is **`onNeedReload`**.

2. **`onNeedReload` is not a notification, it is an override.** The branch reads `if (onNeedReload) onNeedReload(); else window.location.reload()`. The plugin's default in this mode is a **silent full-page reload of a live tab.** So wiring the registration properly and _not_ passing `onNeedReload` would have introduced a page reload that yanks the app out from under someone mid-sentence — a regression the four-line script never had. That reframes the change from "add a notice" to "add a notice _and_ take the reload back".

A corollary, recorded because the name invites the wrong assumption: `updateServiceWorker()` in this mode awaits the registration promise and returns. It reloads nothing. The reload is ours.

## The fork put to the owner

Rendering the mockup produced a cost the code review would not have: **the banner sits exactly on the header's identity row** — 45px over a 116px header — hiding the trip name, the gear, the avatars and, most pointedly, the passive sync badge ADR-0149 §7 exists to keep visible. The day strip and the whole body stay clear.

Three placements were drawn and put up:

|                           |                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Top (chosen)**          | Covers row 1 while the notice is up. Simplest rule; no dependence on header state. Bounded by being rare and one tap from gone.                                          |
| Below the header          | Hides nothing, but a fixed element would have to track the header's condense state — which the Map opens already condensed into — for a notice that shows once a deploy. |
| Bottom, above the tab bar | Lands in the toast's lane (`bottom: 78px`). A persistent prompt and a 3.6s confirmation cannot share a lane.                                                             |

**Answered: top.** Second question, on the dependency (`workbox-window`, a declared peer of the plugin never installed because the trivial script never used it): **add it** rather than hand-roll ~40 lines of raw `navigator.serviceWorker` — it lazily imports into its own chunk and stays off the initial bundle.

## `'prompt'` mode, considered and rejected

Worth the paragraph because it is the obvious next suggestion and it is a trap.

On the defect F-13 names, `'prompt'` is strictly better: the old SW keeps serving its own precache until the user acts, so the stale-chunk window closes rather than narrows. It was rejected because it reverses the `skipWaiting` intent the brief put out of scope — **and because it is not the one-word change it looks like.** The plugin forces `skipWaiting`/`clientsClaim` on under `autoUpdate` and does **not** force them off under `'prompt'`. The explicit `true`s in `vite.config.ts` survive the edit, the new SW keeps self-activating, and the `waiting` event that `'prompt'`'s whole flow hangs off never fires. The result is a prompt nothing triggers, with no error anywhere. Written into the config comment as well as the ADR, because the config is where someone will try it.

## What the render caught in its own harness

A top-level `const chrome` in the mockup's script collided with the browser's `window.chrome` global and threw at parse time, leaving every frame blank — and **`render.mjs` reported "no console errors"**, because it subscribes to `console` and not to `pageerror`. The full-page screenshots looked fine on an earlier run and empty on a later one, which is the worst version of this: intermittent enough to be dismissed as a fluke. Renamed to `tripChrome`. The renderer's blind spot is the durable half and is recorded in the ADR and the catalog entry; teaching `render.mjs` to fail on `pageerror` is a small follow-up nobody has done yet.

## Honesty about coverage

No service-worker test existed in this repo before today and this session did not change that in the way the phrase implies. What is unit-tested is the React half with the registration hook mocked: an update is reported → the banner renders → the verb reloads → dismiss hides it → the poll calls `registration.update()` on the interval and skips while offline. What is **not** tested is that a real `activated` event fires the callback in a browser, and that an un-prompted tab really does fail a lazy import against the new precache; proving either needs two builds and a `dist` swapped underneath a live tab. Those rest on the plugin's client source, quoted in `lib/useAppUpdate.ts` so the next reader does not have to take it on trust.
