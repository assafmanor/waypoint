# Session 19 — Next-day marker polish (2026-07-16)

**Outcome:** Visual fix on top of ADR-0037, from a user screenshot. New branch off `main` after #90 merged.

## Problem

In the TimePicker, the overnight `למחרת` ("next day") tag rendered jammed against the time (`04:00למחרת`, no gap) in both the collapsed duration field and the preset rows, and in the narrow collapsed field it pushed the line over width, wrapping mid-word (`6` / `שעות`).

## Fix

- Replaced the `למחרת` word with the compact **`+1`** superscript marker — the same `crossesMidnight` treatment the day/builder rows already use (`.xmid`), so overnight reads consistently across the app. The Hebrew word is kept as the `title` tooltip. Rendered as `<sup>`, so it's cleanly offset instead of jammed.
- `.tp-nextday` restyled to the superscript form (matching `.xmid`).
- Collapsed duration field (`.tp-dur .tp-val`): `flex-wrap: wrap` + `white-space: nowrap` on the children, so it wraps between the duration and the end (`6 שעות` / `עד 04:00⁺¹`) instead of breaking mid-word.

CSS + markup only; no logic change.

## Verified

`typecheck · lint · test · build` green; 190 tests. Rendered the overnight picker in a headless browser: collapsed field now shows `6 שעות` / `עד 04:00⁺¹` cleanly, and the preset rows show `עד 00:00⁺¹` with the marker properly offset.
