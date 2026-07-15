# Session 18 — Time-setter: auto-insert the colon in the exact field

**Date:** 2026-07-15
**Branch:** `claude/event-time-setter-redesign` (follow-up; PRs #84, #85 merged)
**Outcome:** Small refinement to the `TimePicker` (ADR-0036 §2b).

## The ask

"The custom time doesn't have the `:` as an hour:minute separator. The user shouldn't write it itself, it's a hustle."

## What shipped

- The exact-time field now **auto-inserts the colon** as digits are typed — `0907` → `09:07`, `930` → `9:30`, `1430` → `14:30`. The user types numbers only. Applied to both the start and the exact-end inputs.
- Digits map **right-aligned** (last two = minutes), matching the existing `parseLoose` semantics, so a single-digit hour works naturally (`930` → `9:30`).
- Extracted `maskTime(raw)` as a pure exported helper; 5 new unit tests (bare hour, colon insertion, strips a user-typed colon, ignores non-digits / caps at 4, round-trips through `parseLoose`).

## Known minor

On the leading-zero path there's a one-keystroke transient (`090` shows `0:90`) before the next digit resolves it (`0907` → `09:07`). Inherent to right-aligned entry; the committed value is always correct. Left-to-right masking would trade this for a worse break on single-digit hours (`930` → `93:0`), so right-aligned wins.

## Verify / green

Typecheck + Prettier clean; frontend tests 188 passed (5 new). Driven in Chromium: typing `0 9 0 7` produced `09:07` and committed `09:07`; typing `9 3 0` produced `9:30` and committed `09:30`. No page errors.
