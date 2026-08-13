# Session 265 — the canvas supervises itself, and never gives up (field report #35, the regression)

**Date:** 2026-08-14
**Workstream:** `M` (#35) — **a regression introduced in session 264 the same day, found and fixed.**
**Touches:** `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/constants.ts`, `docs/decisions/0121-embedded-map-phase-6-design.md` (amended in place, and the previous amendment corrected in place), `docs/backlog.md`.

## 0. The report

> _"Still happening on my phone. I feel like today we introduced some regression that has made it way worse than it was before. Not a hundred percent sure because I have to admit that today I became much more critical of it … but it may be that we did introduce some kind of a regression."_

They were right, and the hedge was unnecessary. It is measurable.

## 1. The regression, measured

Session 264's context-loss recovery bounded itself at **three rebuilds per mount**, then degraded to `ErrorState`. Soak test on merged `main` — eight forced context losses, which is eight background/resume cycles on a phone:

```
cycle 1-3  recovered
cycle 4    canvases:0  error:true   <-- dead
cycle 5-8  still dead

3/8 cycles healthy; first break at cycle 4
```

A phone reclaims the GPU context on roughly **every** background. So the fourth time the owner switched away and came back, the map was hard-broken and stayed broken until a manual retry — where before it merely went blank with the chrome intact. **Strictly worse**, exactly as reported, and reachable in minutes of ordinary use.

## 2. Why the bound was the wrong shape

The count was **per mount**, so it measured _how many times this pane has ever recovered_ rather than _how badly it is failing now_. On a device that drops the context every background those are completely different numbers — and recovering three times is evidence the mechanism **works**, not evidence the GPU is broken.

"A bounded retry" is the kind of thing that reads as obviously prudent in review. It was the defect.

## 3. The fix: a supervisor with backoff, and no give-up state

`MAP_RECOVERY_BACKOFF_MS = [0, 2s, 8s, 30s, 60s]`, counting **consecutive failures**, reset to zero by any successful paint.

- A resume that drops the context recovers **immediately, every time, forever**. The common case costs nothing and cannot exhaust.
- A genuinely broken GPU backs off to one attempt a minute rather than spinning.
- **No state exists from which the map stops trying.** Asserted directly.

Two guards inside it, both load-bearing: one pending attempt at a time (a burst of losses collapses into one rebuild), and rebuilds only while visible (a map built against a hidden page is the failure being recovered from) — with an attempt that comes due while hidden re-asked on resume rather than dropped.

**And the never-painted route now heals too.** The tiles watchdog used to show `t.map.loadingSlow` and wait for a human; it now schedules a recovery on the same backoff. That was the other half of what the owner kept seeing: a notice that never became a map.

## 4. Measured after

| Check         | Before                         | After                       |
| ------------- | ------------------------------ | --------------------------- |
| 8-cycle soak  | **3/8**, dead from cycle 4     | **8/8**                     |
| 20-cycle soak | —                              | **20/20**                   |
| Offline flap  | 2/2                            | 2/2                         |
| Never-painted | notice, then waits for a human | notice, then retries itself |

Frontend suite **3634**. The regression is kept as a named unit test — eight losses with a paint between each must all recover — so a fixed budget cannot come back by accident.

## 5. What this says about the last five sessions

Four of the six fixes to #35 were correct changes to real defects that were not the bug, and the fifth introduced a worse one. The pattern is the same each time: **a mechanism was designed against a story about the failure rather than against the failure.** The only session that moved was the one that reproduced it first, and the only reason this regression was caught in a day is that the owner tested the specific thing rather than trusting the report.

The soak test is the durable output. "Does it recover once" was the wrong question all along; "does it still recover on the twentieth try" is the one that matches how a phone behaves.

## 6. Still owed

The owner's phone, again — and this time the thing to try is deliberately hostile: background and resume the app **many** times in one Map-tab session. That is the case that was broken, and it is the case the soak now covers.
