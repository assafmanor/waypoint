# Session 19 — Time-setter: native `<input type="time">` for exact entry

**Date:** 2026-07-15
**Branch:** `claude/event-time-setter-redesign` (follow-up; PRs #84–#86 merged)
**Outcome:** Replaces the custom free-text exact-time entry with the platform-native time control. See [ADR-0036 §2c](../decisions/0036-event-time-setter.md).

## The ask

"Rethink how this behaves. The `:` should be visible always. You shouldn't be able to write an invalid 2-digit number like 76. Use a well-known, intuitive mechanism. Create mockups."

## Path

- Mockup `mockups/event-time-setter-v4.html` compared a **custom segmented mask** vs the **native `<input type="time">`**, both showing the always-on colon + range-bound segments.
- User chose **native**, requiring 24h display (no AM/PM), e.g. `18:57`.
- **Finding (verified in Chromium):** `<input type="time">` picks 12h/24h from the browser's UI locale, **not** the page's `lang`/`dir`. With `lang="he"` under an en-US browser it still rendered `06:57 PM` while `.value` stayed `18:57`. There's no reliable HTML/CSS way to force 24h. Screenshot shared.
- User accepted native anyway (24h on the target he-IL phones; AM/PM only on non-24h-locale devices).

## What shipped

- Both exact inputs (start + exact-end) are now `<input type="time" step={60} lang="he">`. The `:` is always on screen, invalid values are impossible, and the numeric keypad drives it — the three requirements, for free.
- `.value` is always canonical 24h `HH:MM`, so the whole custom parse/validate layer is gone: **removed `parseLoose` and `maskTime`** (and their 10 unit tests). The picker's public contract (`{ start, end }` strings) and `EventForm`'s `zonedIso` save path are unchanged.
- Kept: the 15-min list, the nearest-round reopen suggestion, end-as-duration with the same-day guard, the live hard-conflict warning.
- CSS: `.tp-time-input` tints the native control amber/mono; `::-webkit-calendar-picker-indicator` recoloured.

## Verify / green

Typecheck + Prettier clean; frontend tests 178 passed (10 removed with the deleted helpers). Driven in Chromium: value flows correctly (setting `06:05` preserved the 1h duration → `07:05`); confirmed the locale-driven display caveat first-hand.
