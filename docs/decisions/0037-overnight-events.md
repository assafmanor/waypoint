# 0037 — Overnight events: an end may run into the small hours of the next day, filed under the start night

**Status:** Accepted
**Date:** 2026-07-15
**Supersedes:** [0036 §5](0036-event-time-setter.md) (multi-day events out of scope — the same-day-only guard)
**Refines:** [0011](0011-hard-soft-event-model.md) (hard vs. soft — the conflict check a span drives), [0017](0017-mobile-first-device-targets.md) (phone-first)

## Context

ADR-0036 §5 deliberately kept every event on a single calendar day: `endToDuration` returned `null` for an end at or before the start, the duration presets were filtered to `start + d ≤ 23:59`, and a typed exact end that wrapped past midnight was rejected with an inline note. That ADR also said, explicitly, "cross-midnight events can be revisited if a concrete need appears."

The concrete need appeared: a night out (a club, a bar, a live set) genuinely runs `23:00 → 02:00`. Forcing it to end `23:59` is a lie the timeline shouldn't tell. §43 of that ADR anticipated this — "lifting it later is a localized change to that helper plus the preset filter."

## Decision

**1. An event's end may land in the small hours of the next calendar day; the event still belongs to its start night.** The `date` field stays the start day, so the event lives on the night it began and shows once, on that day's list. `endsAt` becomes a next-day instant (`resolveEndIso` puts it on `date + 1` when the end reads earlier than the start). This is **not** a two-day event model — nothing lives in two day-buckets. The data layer already supported it (`endsAt` is an ISO instant); the constraints were all in the UI/derivation layer.

**2. The overnight window is bounded, and disambiguated so a typo isn't stretched to 23 hours.** An end at or before the start is read as _next day_ only when **both**: the end is at or before **07:00** (`OVERNIGHT.END_HOUR`), and the start is **afternoon/evening** (≥ 12:00, `OVERNIGHT.MIN_START_HOUR`). So `23:00 → 02:00` is a 3-hour overnight, `22:00 → 07:00` is a 9-hour one, but `05:00 → 04:00` (a morning start with an earlier end) stays a rejected end-before-start error rather than a silent 23-hour span. The two-part guard is deliberately not a magic "max duration" number — "an overnight starts in the afternoon/evening and ends by breakfast" is the intuition it encodes.

**3. Transportation is a separate category, out of scope here.** A red-eye flight landing at 09:00 exceeds the 07:00 cutoff — and that is on purpose. Transportation (flights, trains, overnight buses) is **not a regular event**: it has its own shape (origin/destination, terminals, seats, timezone changes) and deserves its own primitive later, not a widened overnight cutoff bolted onto free-form events. Keeping the cutoff at 07:00 for regular events keeps the "night out" case honest without pretending a generic event is a flight. When transport lands, it can carry its own, looser cross-day rules (a flight can end whenever it lands, in whatever timezone) without disturbing this one. _(This is the recorded outcome of the design discussion; the transport primitive itself is unspecified and unscheduled.)_

**4. The next-day end is marked wherever a span is shown.** A `23:00 → 02:00` row would read as a 21-hour backwards event without a signal, so the end carries a small amber **`+1`** in the day/builder rows (`crossesMidnight`) and a **`למחרת`** tag in the TimePicker's duration readout and preset list. Time stays amber (ADR-0028).

**5. The slot-prefill helper stays same-day.** `nextSlot` (the "add event / schedule from shelf" default) measures each end as **minutes since the day's local midnight**, so an overnight end reads as ≥ 1440 and clamps to `23:59` (start-only) rather than looking like a 02:00 slot _on this day_. A day that already runs past midnight is full; the prefill doesn't try to invent a slot inside the small hours.

## Consequences

- **`hardConflicts` gets overnight-correctness for free**, and hard overnight events become representable. Overlap is instant-based (`Date.parse`), so a soft `23:00 → 02:00` vs. a same-night hard event is flagged correctly across midnight. **Known gap:** `hardConflicts` still scopes to same-`date` events, so a conflict between a cross-midnight event and one filed under the _next_ day isn't detected. Acceptable for v1 (rare, and it's a warning, never a block).
- **The next morning's day view doesn't list a still-running overnight event** — it's filed under the night it started (decision: "start night only"). The Home board's `deriveNow` _does_ surface it live as "now" past midnight (instant-based, date-agnostic), so "what's happening now" stays correct; only the next-day list is blind to it. A carryover chip on the next morning was considered and deferred.
- **DST caveat inherited, not worsened.** An overnight spanning a spring-forward/fall-back inherits `zonedIso`'s documented 2 a.m.-ambiguity behaviour (ADR-0036 ponytail). Rare for a single-timezone trip; no new handling.
- **`gapBetween`'s fill prefill isn't midnight-aware**, but in practice an overnight event is the last of its night (nothing starts after it on the same `date`), so no gap chip forms after it. Left as-is; flagged here rather than fixed speculatively.
- **The guard lives in pure, tested helpers.** `endToDuration` / `clampToLatestEnd` (TimePicker) and `resolveEndIso` / `crossesMidnight` (time) carry the rules, unit-tested, so tightening the window or adding the transport primitive later is localized.
