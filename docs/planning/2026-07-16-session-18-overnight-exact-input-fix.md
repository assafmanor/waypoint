# Session 18 — Overnight exact-time input fix (2026-07-16)

**Outcome:** Bug fix on top of ADR-0037 (overnight events), surfaced by a user screenshot on iOS. New branch off `main` after #89 merged.

## Bug

With a late start (22:15), you couldn't pick a post-midnight end — not via the duration presets you had to scroll to, and crucially **not via the OS exact-time wheel**: the field "stays the same choice as before."

## Cause

The exact-end `<input type="time">` was **controlled** (`value={end}`). The OS time wheel fires `onChange` on every tick, and `applyExactEnd` rejects an invalid tick (`endToDuration` → `null`) without committing — so React snapped the controlled input back to the old value. To reach a valid overnight end (00:30) the wheel must scroll _through_ the daytime range (11:15 PM → flip to AM → 11:15 AM, or hour 11 → 12:15 PM), and every one of those intermediate ticks is invalid → reverted → the user is trapped before ever reaching midnight. The pure logic was fine: setting `00:30` directly always validated (`endToDuration(1335, 30) = 135`); only the scroll-through was blocked.

## Fix

Made the exact-end input **uncontrolled** (`defaultValue={end}` instead of `value={end}`). The wheel now moves freely; an invalid tick shows the inline note but no longer resets the field, so the user can scroll past the daytime range to a valid post-midnight end, which commits. The input is conditionally rendered, so it remounts on each panel open and re-syncs to the committed `end`. One-line change in `TimePicker.tsx` (plus an explaining comment). The start exact input is left controlled — `applyStart` accepts every value, so it never reverts.

## Verified

`typecheck · lint · test · build` green; 190 tests. Drove the real app (headless Chromium) simulating the iOS wheel: start 22:15, an invalid intermediate tick (12:15) now **retains** its value with the note (previously blanked/reverted), then 00:30 commits — saved event renders `22:15–00:30 +1`.
