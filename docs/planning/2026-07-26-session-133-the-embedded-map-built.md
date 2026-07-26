---
date: 2026-07-26
session: 133
title: The embedded map, built — Phase 6 and the end of the Maps & Places epic
adrs:
  - '0121'
---

# Session 133 — the embedded map, built

The last phase of the Maps & Places epic. [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md)
had already decided the design in session 131 and session 132 had cleared the human
Google Cloud gate, so this session was a **build against a frame**, not a design
session: read the ADR, fill it in, and record only what the build itself learned.
The ADR's own [Build log](../decisions/0121-embedded-map-phase-6-design.md#build-log-2026-07-26-session-133)
carries the ten decision-level notes; this note carries the shape of the work and
the things a next session would want to know.

## What shipped

A rendered Google map **inside** the Phase-3 list, not instead of it: a map pane over
a three-height list sheet, one live map instance per tab visit, the same filtered set
driving both halves.

Built in ADR-0121 §13's order — cheapest and highest-confidence first, because the one
thing that cannot be tested is the last thing to be written.

**1. The pure layer (`lib/`), unit-tested with no Google present.**

| File              | What it decides                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `map-config.ts`   | The three build vars → "we can draw a map" or "we cannot". No third, disabled state.        |
| `map-pins.ts`     | The tier ladder, the day-sequence number, the coincident z-order, whether a place pins.     |
| `map-camera.ts`   | Bounds of a set, containment, the area count, and what the camera owes you about a new set. |
| `place-refs.ts`   | Every reference to a place — the way in to the entity behind a pin.                         |
| `snap-sheet.ts`   | The sheet's stop arithmetic (resolve, clamp, nearest, as-CSS).                              |
| `useMapCamera.ts` | The imperative half: re-frame on a control, pan on a selection.                             |
| `useSnapDrag.ts`  | The handle's pointer gesture.                                                               |

**2. The layout capability.** `AppShell` gained `bodyClassName`, and `App.css` gained
`.body.is-fullbleed { overflow: hidden; padding: 0 }` — the layout layer is where a
full-bleed surface belongs (ADR-0078), and any future one reuses it. The Map tab's
filter row + sort strip became the split's fixed header; the one scroll region is now
the sheet's list.

**3. The components.** `ui/domain/MapPane` (canvas + markers + our two controls) and
`ui/primitives/SnapSheet` (the three-height sheet, generic and back-stack-free).
`screens/Map.tsx` went from 701 to ~950 lines — it would have roughly doubled without
the extraction, which is what §13 predicted.

**4. The two filter additions.** The `מה נשאר` toggle in the `אולי` chip's idiom, and
the `באזור` count on the canvas.

**5. The two TODOs closed.** The row tap focuses our map; `מפה` on an
`EventCard`/`BookingDetail` routes to the Map tab focused on the place.

## The three hard constraints, and where each one actually lives in the code

These are the rules ADR-0121 calls bugs rather than style choices, so it is worth
writing down what enforces each — a future change that breaks one will break it here.

**One map instantiation per tab visit.** Dynamic Maps bills per
`new google.maps.Map()`. Three things hold it: `AppShell` keys `<main>` by tab (so
leaving the tab is the only teardown), `mapsConfig()` is read in a `useMemo(…, [])`
(so it cannot change under a mounted pane), and `mapId` is passed at construction and
never varied — which is also, independently, why there are no per-mode map styles.

**A clock tick must be a no-op marker diff.** `screens/Map.tsx` re-renders every
second. Every prop `MapPane` (a `memo`) receives is therefore either a primitive, a
`useMemo` result, or a stable callback:

- `pins` is memoized on a **content key**, not on the array — the same trick
  `RevealList` uses to decide "the list changed". The pin models are built every
  render (cheap) and the older array is returned when the content matches.
- `orderIndex` is built with **no clock at all**, which is what makes it stable _and_
  what stops the ahead/behind partition from renumbering anything.
- `onSelectPin` is a `useCallback(…, [])` over a latest-ref, because its real body
  reads `nowMs`. Without the ref, the handler's identity would change once a second
  and take the whole memo with it.
- `defaultCentre` and `me` are memoized objects for the same reason; a fresh object
  literal in the JSX would have quietly defeated all of the above.

**A filter must not renumber a pin.** `buildPinOrderIndex` runs over the whole
**scoped** set before any chip applies, and takes its order from
`comparePlacesBySchedule` specifically — never the screen's `listOrder`, which becomes
a distance sort under near-me. Gaps (`1, 3, 4`) are the correct output.

## What the build learned

Four things worth a next session's attention; the rest is in the ADR's build log.

**The `מה נשאר` ghost case was a real hole, and the test found it.** §9 says the
toggle applies to ghosts. It did not, because a ghost has no day in the scope being
asked about, so a day-scoped `settled` read said "unsettled" and left the pin on the
canvas. `isPlaceSettled` now falls back to all of a place's days when it has none on
the scoped date. **This is the second time in three sessions that writing the test
ADR-0119's rule demands is what caught the defect** — session 131 caught the
mislabelled chip count by drawing the mockup, and this caught its inverse.

**Three-axis count coupling is six lines, not an abstraction.** ADR-0119's rule ("each
facet counts what the OTHER facets leave visible") reads perfectly clearly as three
explicit predicates and three explicit counts. A table-driven `scopeExcept(facet)`
helper was written first and then thrown away: it hid the one ordering constraint that
matters (the type count must be computed before `activeCategory`, which the others
then read) behind a loop.

**`.nav` never needed clearing.** The handoff warned that a full-bleed sheet must
clear the tab bar and `--safe-bottom`. It does not: `.nav` is a **sibling** of
`.body` inside `.app`'s flex column, not an overlay on it, so the body's 92px of
bottom padding was scroll tail rather than nav clearance, and `--safe-bottom` is
already `.nav`'s own padding. Removing the padding is all `is-fullbleed` has to do.
Worth recording because the assumption is easy to re-make from reading `position:
sticky` on `.nav`.

**The environment gotchas the handoff flagged both held.** `pnpm install` was needed
first (no `node_modules` in a fresh sandbox), `packages/shared` needs a `build` before
the frontend typechecks, and `npx prettier@3.9.5 --check .` is the only trustworthy
format check — `npm i prettier@3.9.5 --no-save` failed outright in this sandbox, so
the pinned `npx` invocation is the recipe that works. `@types/google.maps` also had to
be added as a direct devDependency **and** listed in `tsconfig.json`'s `types` array:
the frontend pins that array, so a transitive `@types` package is invisible to `tsc`.

## Testing, and the honest limit

1,199 frontend tests green (up from 1,084), typecheck and build clean, lint clean,
Prettier clean. Three layers:

- **The pure functions**, with no Google in the process: tiers, numbers, z-order,
  bounds, camera targets, refs, snap arithmetic, config resolution.
- **`MapPane`**, with `@vis.gl/react-google-maps` stubbed to plain DOM. This tests the
  part that is **ours** — the pin markup and its class grammar, the number, the amber
  cue composing with selection, the area readout, and that a re-render with identical
  pins reuses the very same marker nodes.
- **The shell**, with the pane stubbed: snap heights, the toggle, row ↔ pin selection,
  the full→half lift, the coordless row that still selects, the ghost's surfaced row,
  the way-in entries, the three-axis counts, the connector's Plan-mode-only scope, and
  offline absence. It lives in its own file (`Map.embedded.test.tsx`) so the existing
  `Map.test.tsx` keeps running **without** build config — which is the graceful-absence
  path, and deserves to stay tested as the list-only tab it is.

**The render itself is unverified, and that is the honest statement rather than a
caveat.** No canvas has been drawn in this session: this sandbox has no
`frontend/.env.local`, so the tab correctly degrades to list-only, which is the
designed behaviour and not a failure. Nothing about how the pins, the connector, the
quiet base, the fit insets or the sheet's motion actually **look** has been seen by
anyone. That is the backlog's human visual pass, on a machine with the browser key —
and it is also where ADR-0121's two deliberately-open questions get answered (whether
proximity promotes a ghost, and whether a pin tap opens an info window).

## Files

**New:** `lib/map-config.ts`, `lib/map-pins.ts`, `lib/map-camera.ts`,
`lib/place-refs.ts`, `lib/snap-sheet.ts`, `lib/useMapCamera.ts`, `lib/useSnapDrag.ts`
(+ tests for all but the two hooks that need a live map), `ui/domain/MapPane.tsx` +
`map-pane.css` + test, `ui/primitives/SnapSheet.tsx` + `snap-sheet.css` + test,
`screens/Map.embedded.test.tsx`, `src/test/pointer-events.ts`.

**Changed:** `screens/Map.tsx` (the split, selection, the two filters, the way in),
`screens/map.css` (the Phase-6 delta), `lib/place-usage.ts` (`isPlaceSettled` +
`PlaceFilter.unsettledOnly`/`onDate`), `lib/places.ts` (the view helpers retired,
`mapsDayRouteUrl` added), `state/map-scope-state.tsx` (the pending focus +
`useShowPlaceOnMap`), `ui/layout/AppShell.tsx` + `App.css` (`is-fullbleed`), `App.tsx`,
`screens/DayView.tsx` + `ui/BookingDetail.tsx` (`מפה` routes in-app), `ui/Icon.tsx`
(`locate`), `styles/tokens.css` (`--me`), `constants.ts`, `i18n/he.ts`,
`frontend/tsconfig.json`, `frontend/package.json`
(`@vis.gl/react-google-maps` 1.9.0 + `@types/google.maps`).

**Docs:** ADR-0121 (status + build log), `backlog.md` (the Phase-6 line narrowed to
its non-code remainder; the `מפה` TODO closed; the epic marked complete),
`design/mockups.md`, and `mockups/map-embedded-v1.html` re-inlined against the changed
stylesheets (its `APP-CSS:` manifest gained `ui/domain/map-pane.css` and
`ui/primitives/snap-sheet.css`, so the mockup now renders the shipped pin CSS).

## Not done, deliberately

Everything ADR-0121 §14 excludes: paid Routes / live ETAs, transit and traffic layers,
an area chip, clustering (with its stated revisit trigger), offline tiles, member GPS
sharing, 3D/tilt, and a dark map anyone can see. The pre-commit hook's Prettier-version
hole that the handoff described is also still unfixed — a small, separate change, and
deliberately not bundled into a feature commit.

## Addendum — the deploy that showed no map

The first production deploy of this work rendered the tab **list-only**, and the
screenshot proved the new code was live: the `מה נשאר 16` chip was there, and a
selected row was showing its `רעיון · על המדף · ללא יום` way-in entry. Near-me was
also still on screen, which rules out the offline branch. So `mapsConfig()` had
returned `null` — the build vars never reached the bundle.

**The cause is a coupling ADR-0121 §2 never wrote down.** §2 says the three vars are
"build args baked into the client bundle" and documents them in `deployment.md`. Both
true, and both insufficient: the frontend is built inside a **Docker stage**
(`Dockerfile`'s `RUN … pnpm build`), and a Docker build sees only what the Dockerfile
declares as `ARG`. Railway passes every service variable as a `--build-arg`, but an
undeclared build arg is silently dropped. Session 132 set all three on production and
they were correct; nothing carried them across the build boundary.

The degradation then did exactly what §2 designed it to do, which is what made it hard
to see: **the correct behaviour for "no Maps setup" and the symptom of "misconfigured
deploy" are the same screen.**

**The fix, three parts:**

1. Three `ARG` lines in the build stage ahead of `pnpm build`, each defaulted to `""`
   so a checkout with no Maps setup still builds. (That empty default also gets
   handled for free: `readMapsConfig` trims and treats blank as absent, which is why
   an empty inlined string degrades rather than reaching the API loader.)
2. A **build-log warning** in `vite.config.ts` naming any missing Maps var, gated to
   `command === 'build'` so it never noises up dev or the test run. A degradation this
   quiet in the UI should be loud on the one surface that can act on it.
3. `deployment.md` states the coupling, with the generalisation that outlives this
   feature: **adding a fourth `VITE_` var later means editing the `Dockerfile` too** —
   the service variable alone will look set and do nothing.

**What was and was not verified.** That Vite picks these up from `process.env` at its
default `VITE_` prefix was the genuinely unknown half, and it is verified: a real
`pnpm build` with sentinel values inlines them into `dist/assets/*.js`, and the
warning correctly falls silent once both are set. The Docker half is standard `ARG`
semantics that this same Dockerfile already relies on one line above
(`ARG BUILD_DB_URL`), but it is **not** verified locally — the sandbox has a docker
CLI and no daemon. The confirmation is the next Railway build log: the Maps warning
should be absent, and the tab should show the pane.

**The lesson worth keeping past this ADR:** "it is a build var" is only half a design.
Where the build gets it is the other half, and on this repo that means the Dockerfile.
