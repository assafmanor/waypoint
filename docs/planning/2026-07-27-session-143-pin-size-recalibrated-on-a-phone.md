# Session 143 — the pin size, recalibrated on a phone (2026-07-27)

**ADR:** [0123](../decisions/0123-map-pin-size-is-a-share-of-the-canvas.md) — amended, not superseded. The shape held; both numbers moved.
**Branch:** `claude/map-pin-sizing-misafk`, restarted from `main` after [#310](https://github.com/assafmanor/waypoint/pull/310) merged.

## The report

A second screenshot of the same map extreme, and one sentence:

> It still feels too small to me, don't you think?

The honest answer was yes — and the interesting part is that the rule was working exactly as specified while producing a pin the owner was right to reject.

## What actually happened

Session 142 set `CANVAS_SHARE = 0.08` and `MAX_H = 46` against [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md)'s measured 390×844 budget, where the map-stop canvas is **545px**. That budget is real, but it is a **mockup baseline, not a device**. The owner's phone has a shorter usable viewport, so:

|                          | promised (390×844) | delivered (the phone) |
| ------------------------ | ------------------ | --------------------- |
| canvas at the `map` stop | 545px              | **~501px**            |
| pin                      | 43.6px (+28%)      | **~40px (+18%)**      |
| cap reached?             | at 575px           | never in reach        |

So the tab landed mid-ramp on the one device anyone had looked at it on, and the headline number in the previous session's own commit message was optimistic about the only case that mattered.

## The measurement, because a screenshot can be an input

Rather than eyeball two PNGs, the lodging pin's badge was segmented by its `--cat-lodging` violet (`#9c8ce8`, unique on that canvas) in both screenshots — same device, same element, two states:

|        | badge height | pixels in the blob |
| ------ | ------------ | ------------------ |
| before | 67 device px | 1,543              |
| after  | 79 device px | 2,148              |

Ratio **1.18** (area ratio 1.39 ≈ 1.18², which is the cross-check). Running 1.18 back through `clamp(34px, 0.08 × canvas, 46px)` gives the ~40px pin and therefore the ~501px canvas — no DPR assumption needed, because the ratio is taken between two states of the same device. That is what turned "it feels small" into "your canvas is 501px, and here is the number that follows".

## The decision

`CANVAS_SHARE` **0.08 → 0.11**, `MAX_H` **46 → 56**. `MIN_H` unchanged at 34. Owner's call, made against a 1:1 preview with both numbers on sliders and the frame sized to the measured 501px canvas.

**One consequence, recorded in `constants.ts` and the ADR rather than left to be rediscovered.** The growth band is `MIN_H/SHARE` → `MAX_H/SHARE` = **309px → 509px** of canvas. A phone at the map extreme is therefore **at the cap**, so:

- **`MAX_H` is the knob** for any further re-tune of the map extreme, not the share.
- The share's remaining job on a phone is to **hold `half` at the floor** — and it has room: `half`'s canvas is 44% of the body (~243px there) against a floor that holds anywhere under 309px, so even 0.14 would leave the shared-screen stop byte-for-byte as it shipped. That is what made raising the share safe for the stop the owner had already said reads correctly.

## What the tests learned

`AT_MAP_STOP` (545) is kept **and** `ON_DEVICE` (501) added, because calibrating against the mockup budget alone is exactly what produced the undershoot. Three assertions changed shape rather than value:

- "grows the pin" now probes the **middle of the growth band** instead of 545px, which is now capped.
- A new assertion states the recalibration as a **ratio** (`pinHeightFor(ON_DEVICE) / MIN_H > 1.5`), so re-tuning cannot quietly undo the finding that moved the numbers.
- A new assertion pins the consequence above: a phone's map extreme is at the cap, and the growth band starts above `half`'s canvas.

## Recorded here, but it shipped in #310 itself

Between the two sessions, run 750 on #310 failed on `SnapSheet.test.tsx` — `expected 'half' to be 'map'` — in a file that branch never touched, so the fix went into #310 and is already on `main`; it is written up here because session 142's note was closed before it happened. `flickTo`'s second leg was **1px**, so clearing `SNAP_FLICK_PX_PER_MS` (0.5) needed the two `fireEvent`s within **2ms** of each other; the helper's comment argued this was machine-independent because `useSnapDrag` floors `dt` at 1ms, but that floor is a **lower** bound and nothing caps it. On a loaded runner the events land 5–20ms apart, velocity comes out at 0.05–0.2, and the release snaps to the nearest stop instead of committing.

Reproduced under CPU load (1 failure in 6 runs), fixed by **distance rather than timing** — the second leg is now half the gesture, giving `dt` a ~40ms budget — and confirmed 0 failures in 12 runs under 6× load. Total travel is unchanged, so the test's "40px down is nowhere near the map stop by distance" still holds, and the flick test now shares its waypoints with the slow-drag test beside it, leaving **timing as the only difference between them**, which is the thing being tested.

## Still open

**A case, not a number.** Past roughly 56px a teardrop's tip gets vaguer about which building it marks, and coincident pins overlap sooner. The case that would show it is a **dense day in all-days scope** — not another single-day screenshot — so that is what to look at before `MAX_H` moves again. It stays with Phase 3's tuning cluster (`MAP_ZOOM`, `MAP_REFIT_FILL_SHARE`, `half`'s fraction), which is still unspent.

## The lesson worth keeping

A measured mockup budget is not a device. ADR-0122 measured 390×844 honestly and said so; session 142 then treated that number as _the_ canvas rather than as _a_ canvas, and shipped a share calibrated for a pane 44px taller than the one it ran on. Where a constant is a share of something the device supplies, the device has to be one of the baselines — which is now true in the tests.
