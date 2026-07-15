# Session 16 — Event time-setter redesign

**Date:** 2026-07-15
**Branch:** `claude/event-time-setter-redesign`
**Outcome:** New `TimePicker` replaces the two `<input type="time">` controls in `EventForm`. Decision captured in [ADR-0036](../decisions/0036-event-time-setter.md).

## The ask

"Redesign the time setter — most people schedule on round hours / half-hours / 15/10-min steps; make picking time easier." Then, on review: **visually pleasing, intuitive, familiar** — and keep the conflict warnings; multi-day events are out of scope.

## How it landed (mockup-first)

Three interactive mockups, each sent for review:

1. `mockups/event-time-setter-v1.html` — always-expanded amber hour-strip + minute-chips + duration chips. Verdict: **too tall, and a novel interaction** users must learn.
2. `mockups/event-time-setter-v2.html` — collapsed compact fields; switcher comparing a **scroll list (Google)** vs a **wheel (iOS)**. Verdict: **list**.
3. `mockups/event-time-setter-v3.html` — final: Google-style 15-min scroll list + **typeable exact-time fallback** at the head of the menu (a flight at 09:07), same fallback on the duration field.

The mockups stay in the repo as the design reference (v3 is the shipped one; v1/v2 record the path).

## What shipped

- **`frontend/src/ui/TimePicker.tsx`** — two compact fields (start · duration), each opening an inline panel: 15-min scroll list + exact-time input. End entered as a duration, stored as absolute `HH:MM`. Public contract is `{ start, end }` strings, so `EventForm`'s `zonedIso` save path is untouched.
  - Pure helpers `parseLoose` / `endToDuration` / `clampSameDay` are exported and unit-tested (`TimePicker.test.ts`, 8 cases).
- **`EventForm.tsx`** — swaps the two inputs for `<TimePicker>`; adds a **live hard-conflict warning** via `hardConflicts` + `t.event.conflictWarn` (soft-vs-hard only; a warning, not a block).
- **Same-day guard (multi-day out of scope):** duration presets filtered to `start + d ≤ 23:59`; a typed exact end ≤ start is rejected with an inline note; changing start preserves duration, clamped to the day.
- **CSS** in `screens.css` (`tp-` prefix), amber time on the paper card. **i18n** strings added under `eventForm`.

## Gotcha worth remembering

`.event-form-card` is `overflow-y: auto`, which **clips an absolutely-positioned dropdown**. Verification (Chromium drive of the component in isolation) caught the list rendering at zero visible height. Fix: the panel expands **inline** (normal flow, `position: relative; z-index` above the tap-away backdrop) and the card scrolls. Any future in-card popover should do the same or portal out.

## Decisions deferred

- Cross-midnight / multi-day events (guard is explicit and localized — `endToDuration` + preset filter).
- New-event default time: left as-is (empty for a plain new event; `defaults` prefill for the builder gap-fill).

## Verify / green

`pnpm typecheck`, `pnpm build`, `lint`, Prettier all clean. Frontend tests 180 passed (8 new). Component driven end-to-end in Chromium: off-grid exact entry, list pick preserving duration, duration presets + end times, and the same-day rejection all confirmed.
