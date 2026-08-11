# Session 247 — the Map's base map goes blank while our pins stay (field report #28, workstream M)

**Date:** 2026-08-11
**Workstream:** `M` — production fix + dev-only diagnostic capture. Root cause NOT confirmed; a device pass is still owed.
**Touches:** `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/ui/feedback/ErrorState.tsx` (+ its test), `frontend/src/ui/feedback/feedback.css`, `frontend/src/constants.ts`, `frontend/src/i18n/he.ts`, `frontend/src/dev/DevMapProbe.tsx`, `frontend/src/dev/DevMapTuner.tsx` (+ its test), `docs/decisions/0121-embedded-map-phase-6-design.md` (amended in place), `docs/backlog.md`.
**No mockup** — nothing here is a visual design decision; `ErrorState`'s existing slot styling covers it. **No new ADR** — ADR-0121 is amended in place (§4/§11's rule extended, not revised).

## 0. What this was

On some devices the Map tab kept drawing the place list and the app's own pins while Google's rendered terrain/tiles stayed blank — not the whole tab failing, since `AdvancedMarker`s are DOM overlays independent of Google's tile layer, so their surviving is evidence a script loaded and a `google.maps.Map` constructed, not evidence tiles ever painted. Only restarting the app recovered it. `MapPane.tsx` had no load-failure, error or retry branch anywhere around `<APIProvider>`/`<Map>` (confirmed against `main` on 2026-08-11, unchanged since the 2026-08-10 report) — so there was nothing to recover through.

This splits into two genuinely different pieces, per the handoff that opened this session, and both shipped:

- **(a) a production fix** — ships regardless of root cause, because real users hit this on real phones today.
- **(b) a dev-only diagnostic capture** — instrumentation for the device pass that still has to happen before anyone can say WHICH failure mode this is (tile/network, WebGL context loss, SDK lifecycle, service-worker interaction, GPU-specific).

One thing was already fixed before this session and is not part of it: the malformed `screens/map.css` selector list session 240 found while rendering the stop-traversal mockup — `map.css:384-388` already carries that fix.

## 1. The production fix

**Two signals, because one class of failure has an event and the other does not.**

- **A failed script load** (bad key, blocked network, a referrer restriction) is `@vis.gl/react-google-maps`'s own `APIProvider.onError` — reliable, immediate, no invention needed. Checked the installed version (1.9.0, confirmed against `package.json` and the type defs after `pnpm install`, which this sandbox had never run): `useApiLoadingStatus()`'s `AUTH_FAILURE` member exists in the enum but the library never actually sets it (`gm_authFailure` is not wired to it in this version) — only `FAILED`/`onError` fire in practice, so `onError` alone covers the whole script-load class.
- **A script that loaded fine and never painted a tile** — the report's own shape — has no Google-exposed event at all. This is the heuristic fallback the backlog bullet anticipated: `<Map>`'s `onTilesLoaded` never firing within a bound is treated as a failure, run through `lib/deadline.ts`'s existing `withDeadline` (the same mechanism field reports #20/#22 built for "an await with no guaranteed completion signal" — a canvas mounted with no `.catch()` to hang a failure off is the identical shape one surface over). The bound is `constants.ts`'s new `MAP_LOAD_TIMEOUT_MS.TILES` (10s — between `LOCAL_READ_TIMEOUT_MS.HANDLE`'s 3s and `API_TIMEOUT_MS.FETCH`'s 20s, following the file's own "this is dead, never this is slow" sizing rule). **Unmeasured, owed a real device pass** — the same caveat #22's own bounds carried at the time.

**Where the failure state lives.** `MapPane` keeps its own `mapFailed`/`attempt` state and, on either signal, swaps `<APIProvider>`'s whole subtree for `ErrorState` **in the pane's own slot** — `screens/Map.tsx`'s split keeps the place list, the controls row and the sheet exactly as they were, since `MapPane` only ever occupied the canvas area to begin with. This reads as a third reason to land in the list-only outcome §2/§11 already define for a missing key/Map ID and for offline, not a fourth grammar — the difference is that here `MapPane` itself still mounts (config is present), so the swap has to happen inside the pane rather than at `screens/Map.tsx`'s `!hasMap` branch.

**Retry is one tap, forces a fresh instance, never auto-retries.** `ErrorState`'s retry bumps a `key` on `<APIProvider>`, which remounts the whole subtree — ADR-0121 §4's one-instantiation-per-visit invariant holds because a new `google.maps.Map` is only ever constructed after a genuinely failed one, never on a rerender, and clearing local state and hoping the old instance recovers was rejected for the same reason a hand-rolled retry always is in this codebase (rule 8). No backoff, no cap: a human tap is already the throttle.

**`ErrorState` gained a `size="pane"` variant**, mirroring `EmptyState`'s existing `size="pane"` (`fb-empty-pane`) rather than inventing a new grammar for "owns a whole region instead of sitting in a list's flow" — `ErrorState` was the one sibling in the feedback family missing an option its twin already had. `retryLabel` reuses `t.feedback.retry` (`נסו שוב`) unchanged; only the title is map-specific (`t.map.loadError`, `לא הצלחנו לטעון את המפה`), following every other `ErrorState` call site's own pattern of naming its own title rather than sharing `t.feedback.errorTitle`.

## 2. The dev-only diagnostic capture

Scoped to what backlog workstream M named and what was cheaply reachable, per the handoff's own fallback: online state, build/browser/device are trivial; WebGL context loss has a real DOM event (`webglcontextlost`) to listen for; what was not cheaply reachable — a genuine `console.error` intercept, and any build/version identifier, since none exists yet in this app — is left out rather than invented, and is named here rather than silently missing.

**No second probe mechanism.** `DevMapProbe` (ADR-0146's existing null-rendering, `useMap`-based, dev-gated instrument) gained two more listeners of the same shape as its existing zoom one: `webglcontextlost`/`webglcontextrestored` on the live canvas, and `online`/`offline` on `window`. `apiStatus`/`apiError`/`tilesLoaded` are **not** a second capture of the same signals `MapPane` already has — they are published straight from `MapPane`'s own production `onError`/`onTilesLoaded` handlers (dev-gated inline), so the diagnostic panel reads the exact same events the production fix decides a failure from rather than re-deriving them.

`DevMapTuner` gained a fourth tab, `diag`, reading `lib/dev-tuning.ts`'s extended `DevMapReading` (now carrying `apiStatus`/`apiError`/`tilesLoaded`/`webglContextLost`/`online`) plus the live `mapId`/`colorScheme` off `mapsConfig()` and `navigator.userAgent`. The existing `emit()` text report gained a `## load diagnostics (#28)` block so a sitting that finally reproduces #28 on a phone leaves a written record rather than a memory — the same reasoning ADR-0146 §6 already gives for the rest of the panel's emitted output.

Dev-gated exactly as the rest of ADR-0146's panel (`import.meta.env.DEV`), and it is not, and must not become, part of the production path — §1's fix does not read anything this section publishes.

## 3. What this does not settle

Nobody has confirmed WHICH failure mode #28 actually is on a real device. §1 ships regardless — it treats "a base map that never painted" as one outcome regardless of cause — and §2 is what makes the eventual device pass possible, not a resolution of it. Saying so here rather than implying the bug is understood.

## 4. Verification

- `pnpm install` first (no `node_modules` existed in this sandbox), then `pnpm --filter @waypoint/shared build` (the frontend's typecheck depends on `@waypoint/shared`'s emitted `.d.ts`) and `pnpm --filter @waypoint/backend prisma:generate` (the backend's typecheck depends on the generated Prisma client) — both pre-existing sandbox gaps, unrelated to this change, needed only to get a clean baseline.
- `pnpm typecheck` (all three packages) and `pnpm --filter @waypoint/frontend build` both clean.
- `pnpm vitest run` — **207 test files, 3433 tests, all passing**, including new coverage in `MapPane.test.tsx` (the `onError`/`onTilesLoaded` failure paths, the retry remount, tiles loading before the bound never failing), `feedback.test.tsx` (`ErrorState`'s `size="pane"` variant), and `DevMapTuner.test.tsx` (the `diag` tab reading published diagnostics, and the emitted block).
- `@vis.gl/react-google-maps`'s real API (`onLoad`/`onError` on `APIProvider`, `onTilesLoaded` on `<Map>`, `useApiLoadingStatus`/`APILoadingStatus`) was read from the installed 1.9.0 package's type defs and source (`node_modules/@vis.gl/react-google-maps/dist/index.d.ts` / `index.modern.mjs`) rather than assumed — the handoff's own instruction, since a rendered Google map cannot be exercised in this suite at all (ADR-0121 §13) and a wrong guess about the library's shape would have shipped silently untested.
- `pnpm format` (after the two builds above, per root `CLAUDE.md`'s caveat about an unpinned `prettier` binary), staged by filename.
