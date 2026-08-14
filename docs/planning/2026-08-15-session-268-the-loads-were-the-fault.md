# Session 268 (2026-08-15) — the loads were the fault, and every "fix" was spending them

Field report #35, seventh round. This one is mostly a **correction of the previous six**, so it is written to be read by whoever picks up the next round.

## What the device said

The diagnostic shipped in session 267 finally produced a reading while the map was dead:

```
gl:ok canvas:ok pane:411x596 painted:n tiles:0/36 last:4.3s sw:activated
fails:2 resumes:0 t:4s online:y vis:v err:none self:91ms goog:85ms
```

…alongside Google's own overlay, _"This page can't load Google Maps correctly"_, and then the owner's Cloud Console: **Maps JS load quota at 97%**.

§4 of ADR-0121 bills a Dynamic Map **per instantiation**. Sessions 264–266 had shipped automatic rebuild loops. So the recoveries were spending the resource whose exhaustion produced the failure — and the soak probes run in session 267 spent the owner's quota too.

## The owner's objection, which was right

> "But I only recently started approaching the quota limit. The condition existed even before."

The 4xx metrics settle it, and against the theory:

| Window                        | Google 4xx    |
| ----------------------------- | ------------- |
| Aug 7–13 (bug reported daily) | **flat zero** |
| Aug 13 evening – Aug 14       | 11–55%        |

The spike is confined to the days the rebuild loops shipped and the soak ran. So **quota is the recent failure and cannot be the original one**. The device reading agrees from the other side: `tiles:0/60 err:none` is not _refused_, it is **never asked**.

Two bugs, and collapsing them was the session's first error:

- **Original** (weeks, still unidentified): the SDK stops requesting tiles.
- **Recent** (Aug 13–14, self-inflicted): loads refused for quota.

## What was removed

All automatic map construction. `MAP_RECOVERY_BACKOFF_MS` and `MAP_REBUILDS_BEFORE_RELOAD` are deleted; the tiles deadline, a lost GPU context and a loader error now route through one `markFailure()`. What is left is the hidden-moment **document reload** — the only recovery ever measured to work — and a manual retry that reloads **first** rather than after a budget of rebuilds nobody has seen succeed.

**Why this was done before the renderer swap, when the swap makes it moot.** The owner asked exactly that. The answer is that the change is a _deletion of active harm_ running on their phone today, not a feature: rebuilding does not recover the map (measured) and costs billed loads (measured). Rewriting the eight tests that encoded the old contract _would_ have been waste, so those were deleted and replaced with the new contract instead.

## Two defects found by removing it

Both were invisible while the rebuild masked them, and both matter more than the removal:

1. **`markFailure` has to clear `tilesPainted`.** The cue, the retry pill and the diagnostic all render under `!tilesPainted`. So a context dying **after** the first paint set `tilesLate` and displayed **nothing** — a blank canvas with no affordance, which is field report #28 verbatim. The rebuild had been hiding it. With the rebuild gone, saying so is the whole response, so it has to be sayable.
2. **The diagnostic sampled its facts at render, not at the tap.** A second failure changes no state (`tilesLate` already true), React bails out, no re-render — so the readout said `fails:1` for two dead contexts. `MapDiagnostic` now takes a **getter**. This means the counts the previous amendments reasoned from were **under-reporting**.

The second one is the uncomfortable finding: the instrument built to end the guessing was itself slightly wrong.

## What is excluded now, by measurement rather than inference

WebGL (`gl:ok`), the map's own context (`canvas:ok`), layout (`pane:411x596`), the service worker and the network (`self:91ms goog:85ms`), the loader (`err:none`). Every layer this repo owns.

What remains is Google's minified SDK module state — which cannot be instrumented, inspected, or reset from here. That is why six fixes missed: **every one was outside the failing component.** Three failed fixes is where `systematic-debugging` says stop patching and question the architecture; this was six.

## Also shipped

A **build badge** (`ui/BuildBadge.tsx`), gated by `VITE_BUILD_BADGE` exactly like `VITE_NAV_DEBUG`, so staging can be identified on sight — two deploys look identical on a phone and a report against the wrong one costs a session. Its text is **not** an env var: `vite.config.ts` reads the commit from Railway or the local checkout, because a label somebody has to remember to bump is one that eventually lies. It needed a `Dockerfile` `ARG` too, which is the trap `deployment.md` already documents for `VITE_*` vars.

## Next

The renderer swap (ADR-0186), behind the existing `map-config` flag so both renderers run for a release. That is simultaneously the fix and the **experiment six fixes never had**: if MapLibre is healthy on the owner's phone where Google is not, that localises the fault to the SDK conclusively. If it is not, the fault is in this page and something above was mis-excluded.
