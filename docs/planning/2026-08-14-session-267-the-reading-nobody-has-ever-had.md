# Session 267 — the reading nobody has ever had (field report #35)

**Date:** 2026-08-14
**Workstream:** `M` (#35) — no fix. An instrument, because six fixes have shipped on inference and the mechanism is still unknown.
**Touches:** `frontend/src/ui/domain/MapDiagnostic.tsx` (new), `MapPane.tsx` (+ its test), `map-pane.css`, `i18n/he.ts`. Also merged `main` into `staging`, which was 17 commits behind.

## 0. Why an instrument instead of a seventh fix

Every reproduction attempt on this desktop **recovers**: `WEBGL_lose_context` (20/20), a full `Browser.crashGpuProcess` (Chrome restarts the GPU process, map back in ~4s), connectivity flapping (2/2), context-budget exhaustion. Desktop Chrome heals what the reporting phone does not.

So the mechanism cannot be found from here, and the last six changes were all designed against a description. The only way to learn what is true on that device is to read it there.

## 1. What it is

One word — `פרטים` — on a pane that is **already failing**, expanding to one line:

```
gl:ok canvas:none pane:391x312 painted:n fails:2 resumes:0 t:0s online:y vis:v
```

Nine facts, and between them they separate every hypothesis still standing:

| Reading                 | What it means                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `gl:none` / `born-lost` | WebGL is unavailable to the DOCUMENT — no rebuild can ever work, only a reload           |
| `gl:ok canvas:none`     | the map was never constructed — the loader is stuck below `LOADED` (session 262's cause) |
| `gl:ok canvas:LOST`     | the context died and was not replaced                                                    |
| `canvas:ok painted:n`   | constructed, alive, never painted — tiles or network                                     |
| `pane:…x0`              | zero-size container, a different fix entirely                                            |
| `fails:` / `resumes:`   | whether this is the first resume or the twentieth                                        |

The line above is a real capture, taken with the Maps script blocked: `gl:ok canvas:none` is the loader-stuck signature, and it reads differently from every other failure.

## 2. Three deliberate constraints

- **Only on a failing pane.** A working map never grows a debug affordance, and the toggle is one word rather than a panel.
- **Not `DevMapTuner`.** ADR-0146's instrument already reports most of this and `lib/dev-tuning.ts` is deliberately tree-shaken out of production — reaching it would mean shipping the constant-override layer to every user to read nine numbers. This is the numbers, with no overrides and no storage.
- **Sampled at the tap, never on render.** `webglAvailability()` creates a context to answer, so asking on every render of a screen that ticks every second would be its own bug. It also releases the context immediately: the probe must not consume the budget it measures.

One production change rode along: `attemptStartRef` is no longer `DEV`-gated, because a clock that only exists in development is no use to the one place the answer is. It is a single `performance.now()` per attempt.

## 3. Staging

`staging` was **17 commits behind main** and carried one commit main did not (an old #580), so it had none of today's map work. Merged main in, resolving the three conflicts in main's favour — the staging-only commit is superseded by everything after it. Staging now equals main.

The Railway staging service also had no `VITE_GOOGLE_MAPS_*` vars, so the Map tab was list-only there by construction (ADR-0121 §2's graceful absence); the owner has now set them.

## 4. What this does not do

**It does not fix anything**, and that is the point. The next move is a screenshot of that line taken while the map is dead on the owner's phone — and then, for the first time in seven sessions, a fix aimed at a measured cause rather than a plausible one.
