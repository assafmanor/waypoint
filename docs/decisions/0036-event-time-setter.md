# 0036 — The event time-setter: a quantized quick-pick with a typeable exact fallback; end entered as a duration

**Status:** Accepted
**Date:** 2026-07-15
**Refines:** [0011](0011-hard-soft-event-model.md) (hard vs. soft — the conflict warning it surfaces), [0017](0017-mobile-first-device-targets.md) (phone-first, touch-first), [0028](0028-plan-violet-color-budget-dark-ready.md) (semantic color budget — time is amber)

## Context

Scheduling an event happened through two bare `<input type="time">` controls (start, end) in `EventForm`. On a phone that hands the whole interaction to the OS spinner/keypad, with three problems specific to Waypoint:

1. **No bias toward the times people actually pick.** Almost every event starts on `:00 / :15 / :30 / :45`, yet every minute was equally (in)convenient to reach.
2. **Off-brand.** Time is _the_ amber, departure-board primitive here (design-language: "amber = the clock & the commitment"), and the setter is the one surface where that identity matters most — but it rendered as a generic grey OS control.
3. **End is reasoned about as a duration, not an absolute time.** People think "lasts an hour," not "ends at 14:45." Entering the end independently was the fiddliest part.

An earlier exploration (mockups `event-time-setter-v1`) tried an always-expanded custom hour-strip + minute-chip control. It tested as **too tall and unfamiliar** — a novel interaction users had to learn. The lesson: the win is quantization + on-brand time, delivered through a picker people _already know_, not a bespoke one.

## Decision

**1. Two compact fields — start + duration — that open a picker on tap.** The collapsed default is the same footprint as any other form field; nothing is expanded until tapped. This is the Google-Calendar model, chosen for familiarity over a bespoke always-open control.

**2. The picker is a scrollable 15-minute time list (the fast path) with a typeable exact-time field at its head (the fallback).** Scroll-and-tap covers the ~90% round-time case in one gesture; the list auto-centres on the current value. The exact field accepts loose input (`09:07`, `907`, `9`) for the off-grid case — a flight at 09:07, a checkout time. List for speed, typing for precision, no separate mode to discover. (Rejected: an iOS-style two-column wheel — familiar to iOS users but not the native Android control, and finicky to build well with touch momentum + RTL.)

**3. End is entered as a duration off the start, but stored as an absolute end.** The duration menu (`30 דק׳ · שעה · 1:30 שע׳ · שעתיים …`) shows the resulting end time beside each option, and carries the same typeable "exact end" fallback (which back-computes the duration) so a hard event's committed end is still reachable. The component's public contract is `{ start, end }` as `HH:MM` strings — **duration is a UI affordance only**. `EventForm`'s save path (`zonedIso(date, time, tz)`) is unchanged, so nothing downstream (schema, sync, storage) knows the input model changed.

**4. Time is amber, on paper.** The readout and selected states use `--amber`/`--amber-deep` — the setter finally speaks the departure-board language. It stays on the paper card, not a dark board surface (the board is rationed to one per screen, ADR-0028).

**5. Multi-day events are out of scope.** Every path keeps the end on the **same calendar day** as the start: duration presets are filtered so `start + duration ≤ 23:59`, and a typed exact end at or before the start is **rejected** (with an inline "אירוע חד-יומי בלבד" note) rather than rolled into tomorrow. Picking a new start preserves the existing duration, clamped to the same day. Cross-midnight events can be revisited if a concrete need appears.

**6. The setter surfaces the hard-conflict warning live.** As a soft event's span is edited, `hardConflicts` (the same check the day view and board use, ADR-0011) flags an overlap with a same-day hard event, using the shared `conflictWarn` wording. Only soft-vs-hard is flagged — two soft events overlapping is expected and unguarded (ADR-0011). It is a warning, never a block: the event still saves.

**7. Times remain optional.** An event can have no time; a `ללא שעה` action clears both fields back to empty. The duration field is inert until a start exists.

## Consequences

- **Fast for the common case, complete for the rare one.** One tap for a round time; a few keystrokes for an odd one. The 15-minute grid never becomes a cage.
- **The input model is decoupled from storage.** Because the component trades in `{ start, end }` strings, the duration framing is free to evolve (or be revisited) without touching the schema, sync, or the save path.
- **The dropdown expands _inline_, not as an absolute popover.** `.event-form-card` is `overflow-y: auto`; an absolutely-positioned overlay is clipped by it. The panel grows in normal flow and the card scrolls — no clipping, no z-index fights. (Verified: an absolute panel was clipped to the exact-field row; the inline panel renders the full list.)
- **Conflict feedback moves earlier.** You see a hard-event clash while choosing the time, not only after saving and seeing the flag in the day list.
- **Multi-day is a deliberate, documented gap.** The guard is explicit (`endToDuration` returns `null` for a non-same-day end); lifting it later is a localized change to that helper plus the preset filter, not a rework.
- **New primitive to reuse.** `TimePicker` (with pure, tested helpers `parseLoose` / `endToDuration` / `clampSameDay`) is where any future time entry should go, rather than re-adding raw `<input type="time">`.
