# 2026-08-20 — Notifications phase 0: the service worker is ours

**Built.** [ADR-0197](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) §8, the phase that ships **no notification code at all** — a `push` listener cannot be added to a generated worker, so the worker has to become ours first, and that move is the one thing in the epic that can break something already fixed ([ADR-0185](../decisions/0185-a-build-swaps-whole-or-not-at-all.md)'s atomic swap).

## What shipped

`vite.config.ts` moves from `generateSW` to `strategies: 'injectManifest'` + `srcDir: 'src'` + `filename: 'sw.ts'`, and **`frontend/src/sw.ts`** now carries by hand what workbox-build's template used to emit: the `SKIP_WAITING` listener, `clientsClaim()`, `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`, the navigation fallback with its `SERVER_ROUTE_PATTERN` denylist, and the `map-glyphs` CacheFirst rule. `globPatterns` stays in the config, because choosing _which_ files are precached is manifest generation and not worker behaviour.

Beside it, `src/sw.contract.test.ts` — 12 assertions over the worker's and the config's source.

## The worker was written by reading the one we had, not the options we set

That is what got `cleanupOutdatedCaches()` in. It appears in no option this repo ever configured; `generateSW` emitted it anyway, and without it **every precache from every previous build survives on the device forever**. Working from the option list would have dropped it silently, which is exactly the failure mode this phase exists to avoid.

The method: build first, then `dist/sw.js` minus its manifest is a 12-line program. Six calls, in order. Copy them.

Verified equivalent afterwards, not assumed: the built worker holds the same message handler character-for-character, the same six calls, and **68 precache entries / 3196.94 KiB — identical to the generateSW build**.

## Four things the build found

**1. `rollupFormat` is not a top-level option, and getting that wrong produces a green build.** It belongs inside `injectManifest` (`VitePWAOptions.injectManifest: Partial<CustomInjectManifestOptions>`). Placed at the top level it is simply ignored — the build succeeded and the log line said `format: es`, which is the only place the mistake was visible. Caught by reading that line, not by any check.

**2. And the format matters, because the plugin registers the worker as `classic` in every production build.** Its own `dist/index.js` hard-codes it: `.replace('__TYPE__', devOptions.enabled ? devOptions.type : 'classic')`. Meanwhile `rollupFormat` **defaults to `'es'`**. So the shipped default pairs an ES-module worker with a classic registration, and it works only as long as the bundle happens to emit no top-level `import`, `export` or `await` — true today, verified by building both ways. The day one appears, the worker never installs: green build, no error anywhere. `rollupFormat: 'iife'` cannot express the syntax that would break, so it is set. **Not a fix for a live bug — a closed trap**, and worth the line because "it works today" was the whole of the reasoning available before measuring.

**3. The worker is a second TypeScript program.** `ServiceWorkerGlobalScope`, `ExtendableEvent` and (phase 1) `PushEvent` live only in TypeScript's `WebWorker` lib, whose globals collide with `DOM`. So `src/sw.ts` is excluded from the app's `tsconfig.json` and has its own `tsconfig.sw.json`, and **`pnpm typecheck` runs it as a second pass** — because a worker excluded from the app's program and from nothing else is a file nothing type-checks, which is the same silent degradation in a different coat. Proved by injecting a type error and watching the second pass catch it.

**4. The import must be the shared FILE, not the package barrel.** `src/sw.ts` reads `SERVER_ROUTE_PATTERN` through a relative source import — the same two reasons `vite.config.ts` already states for the same module, plus a third that is this phase's own: the plugin builds the worker with `inlineDynamicImports`, so importing `@waypoint/shared` would inline zod and every entity schema into the worker. `server-routes.ts` imports nothing, so the file costs 10 lines. (The alias _is_ inherited — the plugin passes `resolve: viteOptions.resolve` into its own build pass — so the barrel would have resolved and quietly worked.)

## The contract test, and the reason it is trusted

Eleven mutations, each producing exactly one failure against a green baseline of 12:

| mutation                                                       | caught |
| -------------------------------------------------------------- | ------ |
| top-level `self.skipWaiting()` (the pre-ADR-0185 behaviour)    | ✓      |
| `cleanupOutdatedCaches()` deleted                              | ✓      |
| `clientsClaim()` deleted                                       | ✓      |
| `precacheAndRoute(self.__WB_MANIFEST)` deleted                 | ✓      |
| denylist re-typed by hand instead of read from the shared list | ✓      |
| glyph `cacheName` changed                                      | ✓      |
| an import reaching the app graph (`lib/…`)                     | ✓      |
| config flipped back to `generateSW`                            | ✓      |
| `registerType: 'autoUpdate'`                                   | ✓      |
| `rollupFormat` removed (silently back to `es`)                 | ✓      |
| a dead `workbox:` block left in the config                     | ✓      |

The last three are the ones a code review would not think to ask for. **Flipping back to `generateSW` deletes nothing and fails nothing** — `src/sw.ts` stays on disk, every assertion above it still passes, and the file is simply no longer shipped. That is the assertion worth having, and it is why the test reads `vite.config.ts` as well as the worker.

## The real proof is a browser, and it is not new either

`scripts/deploy-swap-check.mjs` — two production builds, a `dist` swapped under a live tab, real Chromium — is what ADR-0185 built for exactly this change. Against the custom worker:

```
build B deletes 34 of build A's 61 assets
[after update] new worker PARKED (waiting):     true
>>> a chunk only build A had: still in the SW cache: true · still fetchable: true (200)
>>> VERDICT: the running build stayed whole — no blank screen possible.
[release] blurring the field; nothing else is touched
  t+30s  skipWaiting: PAGE RELOADED
>>> VERDICT: the app took the new build on its own, with no user action.
```

So the hand-written listener, the claim and the precache all work end to end: the worker waits, the old build stays whole, and SKIP_WAITING is answered.

**Two defects in the script itself, found by running it — which is evidence nobody had, since it could not run at all:**

- **Its documented invocation was broken.** The header said _"run from `frontend/`"_, and cwd has never been what makes a bare ESM specifier resolve — that walks up from the **module's** URL, and `@playwright/test` is a frontend devDependency pnpm does not hoist to the root. It threw `ERR_MODULE_NOT_FOUND` from every directory. Fixed with a `createRequire` based at `frontend/package.json`, and the header now says "run it from anywhere" because that is now true.
- **"Make any source change" is not sufficient.** An added unused export is **tree-shaken**, so both builds hashed identically and the script correctly refused with _"builds are identical — nothing to prove"_. It now says to change a value something reads.

## What was run

- `pnpm typecheck` — 4/4, **including the new second pass**, which was proved real by injecting a type error into `src/sw.ts` and watching only that pass catch it.
- `pnpm lint` — clean (one pre-existing warning in an unrelated e2e spec).
- `pnpm --filter @waypoint/frontend test` — 244 files, **4072 tests**, all green.
- `E2E_PREVIEW=1 pnpm e2e` — **225 passed, 1 skipped**, against the production bundle, which is the mode that exists for exactly this class of change (an asset path, a chunk boundary, a worker URL are build-time facts a dev-server suite asserts none of).
  - The first preview run had **one** failure, `map-renders.spec.ts` › _"a ground that cannot be read is REPORTED"_, and it was chased rather than waved off: it **passes in isolation on the clean baseline**, **passes in isolation with this change**, and **the full suite is green on re-run**. A map spec bounded by `MAP_LOAD_TIMEOUT_MS` under two parallel workers is load-sensitive; nothing in this change touches a fetch path (the `NavigationRoute` handles navigations only, and the archive is a range request).
- `scripts/deploy-swap-check.mjs` — above.
- **Backend specs were not run here**: they need Postgres and this sandbox has no Docker daemon. The diff touches no backend source (one comment pointer), and CI runs them.

## Cost

`dist/sw.js` is 16.83 kB (5.67 kB gzip) as one file, where `generateSW` emitted a 4.8 kB `sw.js` plus a separate `workbox-<hash>.js` chunk it imported at runtime. Same code, **one fewer request** at install. Four `workbox-*` packages move from transitive to **declared**, beside `workbox-window` in `dependencies` — this file's own convention is that anything shipped code imports goes there and tooling goes in `devDependencies`, and the worker is shipped code. Pinned to the `7.4.1` that `workbox-build` already ships, because a version skew across workbox packages is its own class of bug.

## Two stale pointers this change had to fix

`packages/shared/src/server-routes.ts` and `backend/src/openapi-contract.spec.ts` both told the reader the denylist lives in `vite.config.ts`. It does not any more. Small, and exactly the drift the repo's own rule is about: the comment that explains a rule moves with the rule.

## What phase 1 inherits

A worker it can add a `push` listener to, a `tsconfig.sw.json` where `PushEvent` already resolves, and a contract test that will fail if the listener is later deleted. Nothing else about phase 1 changed.
