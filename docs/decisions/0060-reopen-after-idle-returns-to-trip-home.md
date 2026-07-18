# 0060 — Reopening the app after an idle stretch returns to the trip Home (today)

**Status:** Accepted (Assaf sign-off 2026-07-18)
**Date:** 2026-07-18
**Refines:** [0033](0033-all-trips-home.md) (the live-trip landing rule this extends to warm resume), [0024](0024-app-shell-and-trip-lifecycle.md) (app shell & routing / initial landing), [0035](0035-in-app-back-and-return-gesture.md) (the Home anchor + the day-strip-to-today reset this reuses)

## Context

The app is an installed, `display: standalone` PWA (ADR-0007) used on the ground. Two reopen paths exist and behave differently:

- **Cold start** (process killed / fresh launch): already lands on **Home** — `resolveLanding` (`lib/active-trip.ts:32-47`) via `App.tsx RootSurface:478-508` — and restores _which trip_ (`state/active-trip-id.tsx`, `localStorage`), but never the tab or day. Correct today.
- **Warm resume** (backgrounded, not killed — the common "phone in pocket" case): the app keeps whatever tab and day you left. The only `visibilitychange` handler (`state/trip-state.tsx:551-561`) is a **data** warm-resume — if hidden ≥ `RESYNC_AFTER_HIDDEN_MS` (30_000, `:71`) it re-runs `handleOnline()` to reconnect the socket and catch up — and it deliberately does **not** touch route/tab/day. There is no `focus`/`pagehide`/`beforeunload` handler and no last-tab/last-day persistence anywhere in `frontend/src`.

So if you leave the app deep in the Index or on some past day and come back an hour later, you resume in that stale spot rather than at "what now." Assaf (2026-07-18): "פתיחה של האפליקציה אחרי שעבר קצת זמן — חזרה לבית הטיול (אם אנחנו במצב טיול)." For a living-visibility layer, reopening after a gap should land you where "now/next" lives.

## Decision

**On resume from background, if the app was hidden for ≥ ~30 minutes and the trip is in Trip mode, reset navigation to the trip Home tab with the day-strip on today.** Under 30 minutes, resume exactly in place (unchanged — you stepped away briefly, your context is still relevant).

- **Threshold: ~30 minutes** (Assaf, 2026-07-18). Deliberately distinct from the 30-**second** data-resync threshold (`RESYNC_AFTER_HIDDEN_MS`): the two answer different questions — "refresh the data" (seconds) vs "reset the view to what-now" (minutes). Give the nav reset its own constant (e.g. `RESET_TO_HOME_AFTER_HIDDEN_MS`).
- **Trip mode only.** In Plan mode (pre-trip) the day isn't today-anchored and there's no "what now" urgency, so resume preserves position — consistent with ADR-0035's Plan-preserves-the-selected-day.
- **Reset = Home tab + today + close any open overlay,** so you land cleanly on Home rather than on Home with a stale sheet floating over it.

## Consequences

- **Frontend only, no data-model/backend change.** Extend the existing `visibilitychange` path (`trip-state.tsx:551-561`) or add a sibling in nav-state: record hidden-at on `hidden`; on `visible`, if `elapsed ≥ RESET_TO_HOME_AFTER_HIDDEN_MS` and `mode === 'trip'`, navigate to `?tab=home`, `setActiveDate(todayInTz(...))`, and clear the overlay stack. The Home-tab reset is already wired for the nav-bar tap (`App.tsx:351-354`); this reuses the same reset from the resume trigger.
- Composes with ADR-0035's day-to-today reset on back-to-Home (2026-07-18 refinement): both routes (gesture-back and idle-resume) now converge on "Home shows today."
- The 30-second data resync still fires independently; a long idle triggers both a data catch-up and the nav reset.
- **Edge:** resuming exactly at the boundary, or with the device clock changed across timezones, uses wall-clock elapsed since `hidden`; `todayInTz` already handles the trip timezone.

## Alternatives considered

- **Reset on cold start only** (Assaf's alternate option). Rejected in favor of the 30-min timer, which _also_ covers the far more common warm-resume case that cold-start-only misses (the app is rarely truly killed on modern phones).
- **Never reset (status quo).** Rejected: a stale deep view on reopen contradicts the whole "what now" promise.
- **15 / 60 minute windows.** Considered; 30 chosen as the balance between "I just glanced away" and "I've been off the app."
- **Persist and restore the last tab/day instead.** Rejected: that optimizes for "put me back exactly where I was," the opposite of what a time-sensitive on-the-ground tool wants after a gap.
