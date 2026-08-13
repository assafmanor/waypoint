# Session 266 — when rebuilding has failed, rebuilding again is not a plan (field report #35)

**Date:** 2026-08-14
**Workstream:** `M` (#35) — the premise behind sessions 264 and 265 retired; a mitigation that does the thing known to work.
**Touches:** `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/lib/guarded-reload.ts` (new, extracted), `frontend/src/lib/lazy-chunk.ts`, `frontend/src/lib/useAppUpdate.ts`, `frontend/src/constants.ts`, `docs/decisions/0121-…md` (amended in place), `docs/backlog.md`.

## 0. The report that retires two amendments

> _"Reloading the map (with the button for example, or the backoff) doesn't recover the map. Once it's dead, it's dead until you switch to another app and then go back, and this too doesn't always solve it… The backoff was a good idea if reloading was the solution, but it isn't."_

Sessions 264 and 265 both assumed a dead canvas is a dead **map object**, curable by constructing another. A brand-new `google.maps.Map` with a brand-new canvas is still dead — so whatever is broken **outlives the map object**, and no amount of rebuilding can reach it.

## 1. What could not be reproduced, stated plainly

Everything forcible on this desktop recovers:

| Forced                                            | Result                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `WEBGL_lose_context.loseContext()`                | recovers; 20/20 with the backoff                             |
| `Browser.crashGpuProcess` (the whole GPU process) | Chrome restarts it, map back in ~4s, WebGL never unavailable |
| Connectivity flap (`offline → online`)            | 2/2                                                          |
| WebGL context-budget exhaustion                   | new contexts still granted                                   |

**Desktop Chrome heals what the phone does not**, so the mechanism behind the real failure is still unidentified. The previous session's soak "passing 20/20" measured a kinder failure than the one being reported — `loseContext()` politely releases one context and the browser hands out another, which is not what a phone does.

That is worth writing down because it is the difference between a fix and a story: six rounds have now been spent on mechanisms that made sense against a description.

## 2. So do the thing that is known to work

The owner's evidence is consistent and unambiguous: rebuilds do not help, the retry button does not help, an app switch sometimes does, **a restart always does**. Only a new document clears it.

Once every backoff step has been spent on a fresh map and the canvas is still dead, the pane stops pretending and escalates to a **document reload**:

- **Automatically, at the next hidden moment** — ADR-0185's own instant for the build swap, chosen for the same reasons: nobody is looking, nothing is mid-sentence, no overlay to lose. This is the owner's workaround performed for them; the app backgrounds, quietly becomes fresh, and returns with a working map.
- **Or immediately on a tap**, since `ErrorState`'s action now reloads instead of rebuilding something known not to recover. A deliberate tap is its own consent.

**Guarded to once per 10 minutes** via `guarded-reload.ts` — `lazy-chunk.ts`'s "one reload, then stop" cooldown, **extracted rather than copied** now there is a second caller (rule 8). `isEditingField` moved there too, since the map must not get a laxer rule about destroying an open form than the build swap has. A device that keeps losing its GPU degrades to a visible error with a manual way out rather than reloading itself under someone every minute.

## 3. What this is

**A mitigation, not a root-cause fix**, and the ADR says so. It automates the one thing that has always worked, and it is bounded so it cannot become its own problem.

## 4. Verified

Frontend suite **3636**; the 8-cycle soak still 8/8 (the rebuild path is unchanged for failures that rebuilding does fix); typecheck, build, format clean. New tests: the escalation to `ErrorState` after the backoff is spent, the reload firing at the hidden moment, and — the guard that matters — **no reload while the map is merely rebuilding**.

## 5. Still owed, and it is the same thing as three sessions ago

A reading from the device while it is broken. Six fixes have now shipped on inference; the one session that moved was the one that reproduced something. The next step is not a seventh guess.
