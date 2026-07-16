# Bidirectional nudge + standing hard/soft conflict indicator

**Date:** 2026-07-11
**Branch:** `t-014-wire-verbs-to-api`
**Status:** Approved for implementation

## Problem

Two related gaps surfaced while testing T-014's wired-up delay verb:

1. **Delay is later-only.** The quick-verb "delay" always pushes a soft event forward by a fixed step. There's no way to nudge an event earlier, even though "arrive/start earlier" is just as common a real-trip adjustment as "running late."
2. **Silent hard-anchor collisions.** `computeRippleSuggestion`'s forward walk breaks the instant it reaches a hard event — before checking whether that hard event's span is actually overlapped. So delaying a soft event into a following hard commitment returns no ripple suggestion at all, and nothing else in the UI flags it. Concretely: delaying "free time · Shinjuku" (16:30–19:30) by 30 min pushes its end to 20:00, overlapping "Ichiran Ramen" (hard, 19:30–21:00) by 30 minutes, with zero indication anywhere.

## Decision

Two additive, non-blocking pieces. Neither rejects or requires confirmation — soft events stay freely movable per [ADR-0011](../../decisions/0011-hard-soft-event-model.md); the fix is about making the consequences visible, not restricting the action.

### 1. Bidirectional nudge

Mirror "earlier" alongside "delay" (later) as a second quick-verb button, same fixed step (`DELAY_STEP_MINUTES`). The write path already carries a signed delta end-to-end (`applyDelay(deps, event, minutes)`, the `DELAY` reducer case, backend `move()`'s `minutesShift`) — none of that needs to change.

The one forward-only piece is `EventsService.computeRippleSuggestion`'s walk. Generalize it to a direction-agnostic walk over the same-day, `PLANNED` events, sorted by `startsAt`:

- **Forward** (`minutes > 0`, today's behavior): walk events after `moved`, pushing each one forward by `minutes` while it's contiguous/overlapping with the shifted previous end. Stop at the first `HARD` event or the first one that isn't touching (a real gap — nothing to resolve).
- **Backward** (`minutes < 0`, new): walk events before `moved` in reverse, pulling each one earlier by `minutes` while it's contiguous/overlapping with the shifted following start. Same stop conditions, mirrored — plus one asymmetric addition: the walk also stops at the first event whose `startsAt` is already at-or-before the current instant. Pushing later can never walk into the past, but pulling earlier can walk into "already happened," which nothing should silently rewrite.

Implementation: extract the shared "walk and shift while overlapping" loop into one helper parameterized by direction (a comparator + which end of the neighbor to check), rather than duplicating the loop. Return shape (`RippleSuggestion`) is unchanged.

**Frontend:** `verbs.ts` gains an `earlier` verb (thin wrapper calling `applyDelay(deps, event, -DELAY_STEP_MINUTES)`), `DayView.tsx`'s soft-event actions row gains a second button. Toast copy needs an "earlier" variant alongside `softDelayed`/`hardDelayed` in `i18n/he.ts`.

**Hard events:** no "earlier" button added to hard events in this change. Their existing single delay button remains as-is; nudging a hard event in either direction is T-030 (guarded hard-edit confirm)'s guarded-confirm territory, out of scope here.

### 2. Standing conflict indicator

A pure, order-agnostic check — independent of ripple, independent of _how_ an overlap arose — computed from current event state on every render:

```ts
// frontend/src/lib/time.ts
/** Same-day hard event(s) whose span overlaps this soft event's current span. */
export function hardConflicts(event: TripEvent, dayEvents: TripEvent[]): TripEvent[];
```

Only soft-vs-hard overlap is flagged (two soft events overlapping is expected/uninteresting — nothing guards them). Consumed by:

- **`DayView.tsx`**: a soft `EventItem` with a conflict renders a warning row (reusing the existing `.hard-warn` visual treatment — `amber-deep`, already used for the hard-event edit warning — not `--amber`, which is reserved for "now"), e.g. "חופף לאיצ'יראן ראמן (קשיח) · 19:30–21:00". Shown whenever the row is on screen, not just right after a nudge.
- **`Home.tsx`**: when `nowEvent` is soft and has a conflict, add a small inline warning line under the existing "עד HH:MM" meta, naming the conflicting hard event and its start time.

Because this is a pure function of current `events`, it reflects a just-applied optimistic nudge on the very next render — no separate "moment of action" plumbing needed, and no backend response shape changes.

## Out of scope (this change)

- **Reordering** two events' positions on the timeline — new, bigger feature; tracked separately (task to be filed).
- **Confirm-gated hard-event nudge** — T-030 (guarded hard-edit confirm).
- **Arbitrary/custom-time retiming** (a picker, not a fixed step) — covered by T-047 (the event edit form)'s edit form.

## Testing

- Backend: unit tests for `computeRippleSuggestion` backward walk (mirrors existing forward tests) — contiguous soft chain pulled earlier; stops at a hard event; stops at a genuine gap.
- Frontend: unit test for `hardConflicts` (overlap / touching / no-overlap / soft-soft-ignored cases); a render-level test that a conflicting soft event shows the warning row in `DayView`.
- No changes to existing T-014 tests expected; `applyDelay`/reducer already handle signed minutes.

## Docs impact

`docs/architecture/sync-and-offline.md`'s "Ripple (suggestion only)" section says ripple "stops at the first hard anchor" without qualifying direction or the conflict-visibility gap — update it to note the walk is bidirectional and that hard-anchor overlaps are surfaced via the standing conflict indicator, not the ripple bar. No ADR change: this doesn't revise the hard/soft decision, it completes what ADR-0011 already implied (soft freely moves, hard is never silently endangered without visibility).
