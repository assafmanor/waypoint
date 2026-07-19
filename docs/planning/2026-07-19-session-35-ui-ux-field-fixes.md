# Session 35 — post-deploy UI/UX fixes (booking date/time + sync visibility)

Date: 2026-07-19
Branch: `claude/waypoint-ui-ux-impl-6swnuo` (continues the session-34 UI/UX review implementation)

First on-device pass over the deployed session-34 work surfaced three defects. All
three fixed here; green gate (typecheck · 510 tests · build · lint 0-err · format).

## 1. Booking date/time was broken and looked unfinished (bug, then redesign)

**Defect.** In `DateTimeField mode="datetime"` (the transport/hotel/activity span
endpoints), the combined value was derived from `props.value` every render and
`onChange` emitted `''` whenever either the date or the time was still missing.
So picking a date **before** a time (or vice-versa) emitted `''`, the parent stored
`''`, and the half-entered part was wiped on the next render — the field could never
be filled. Compounded by two cramped native inputs stacked in a 2-up grid that read
as "loose boxes".

**Fix.**

- `DateTimeInput` now holds the date + time **parts in local state**, seeded from
  the value and re-synced only on a genuine external replacement (edit-load / reset)
  via a `lastEmit` ref that ignores the echo of our own `''`. A partial is preserved;
  the combined value emits once both parts exist. Either entry order now works.
- New optional `defaultDate` prop: a time entered before a date falls back to a
  sensible day so the endpoint is immediately usable. BookingSheet passes
  `trip.startDate` for departure and the departure's day for arrival.
- **New UI.** The two native inputs are grouped into one bordered field split by a
  hairline (date grows, amber mono time trails, `focus-within` highlight) — one
  "when" control, not two boxes. The span section moved out of the `.bs-row2` grid
  into a full-width vertical **journey** (`.bs-when`): departure over arrival, each an
  amber-dotted leg (filled = departure, hollow = arrival) with room for the grouped
  control.

Touched: `ui/primitives/DateTimeField.tsx` + `date-time-field.css`, `ui/BookingSheet.tsx`,
`screens.css` (`.bs-when`), `DateTimeField.test.tsx` (both-order + defaultDate +
external-replace cases; the old stateless-recombine test was replaced — that behavior
only "passed" because the mock never fed `value` back).

## 2. "N changes waiting for sync" never cleared (bug)

The reconnect flush fired on `online` / visibility-resume / WS-reconnect / mount —
but a write queued on a **transient blip while `navigator.onLine` never flipped**
sees no `online` transition, so nothing re-drove the flush and the summary wedged on.

`OutboxAutoFlush` now also flushes on window `focus`, and — while `useOutboxCount() > 0`
— retries `flushAllOutbox()` on a gentle interval (`OUTBOX_RETRY_MS = 15s`, inert at
count 0, offline-guarded). The count can no longer get stuck when no connectivity
transition arrives. Touched: `App.tsx`, `constants.ts`.

## 3. No sync badge on the timeline (deferred U-04 slot, now shipped)

`SyncBadge` lived on document + booking rows but not event cards (deferred in Wave 3 —
"no slot on EventCard"), so an edited event showed in the header count but nowhere per
item. `EventCard` gained a `sync?: SyncState` prop; DayView's `ItemNode` passes
`useSyncStatus(event.id).state` (one wiring point — every timeline card routes through
`ItemNode`). The card shows ↑ (pending) / ! (failed) beside the tag and **nothing when
synced**, keeping a settled day uncluttered (the dense-timeline counterpart to the
list rows, which show every state). Backlog line updated.

## Not changed / still open

- Dark-mode live-contrast confirmation + theme-toggle wiring (unchanged from s34).
- Raw-px → token migration + CI px budget (opportunistic).
- The synced-✓ asymmetry (lists show it, timeline hides it) is intentional (density),
  documented in the `EventCard.sync` prop comment.
