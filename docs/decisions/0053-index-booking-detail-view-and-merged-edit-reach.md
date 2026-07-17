# 0053 — Index bookings: a guarded detail view + "⋯" menu, and the merged edit surface reachable from the linked event

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0049](0049-index-tab-mode-and-lifecycle.md) (revises "tap a booking → the merged edit sheet": tap now opens a read-only detail, edit is behind a menu), [0047](0047-booking-event-linkage-and-notes.md) (completes §2's "one merged edit surface … from the Index **or** the day view" — only the Index path shipped), [0011](0011-hard-soft-event-model.md) (a booking backs a **hard** event, which is _guarded on edit_ — the detail-first pattern is that guard), [0043](0043-day-view-now-line-phases-and-archive-chrome.md) (the event card's expand → quick-verbs → "⋯" pattern this brings bookings to parity with)

## Context

Two asymmetries surfaced walking the shipped Index (session 2026-07-17, `docs/planning/2026-07-17-session-27-index-post-build-issues.md`):

1. **A booking has no guarded detail view.** Tapping a booking row (`Index.tsx:139` → `BookingSheet`) drops you straight into the editable sheet. Events do the opposite: the card expands to quick verbs, and edit/delete sit behind a 3-dots "⋯" menu (`DayView.tsx:642-691`). A booking backs a **hard** event — the most guarded thing in the model (ADR-0011) — yet it's the _least_ guarded to edit. Assaf asked for the event pattern: "תצוגה של הפרטים וכפתור עריכה 3 נקודות … כמו באירועים."

2. **The "merged edit surface" is only half-wired.** ADR-0047 §2 says editing a linked Booking+Event opens the same merged form "from the Index **or** the day view." Only the Index path was built. From the day view / plan builder, editing a booking-linked event opens `EventForm` — the event-only, **same-day** form (`DayView.tsx:40,102,194-202`; `PlanDay.tsx:46`; `EventForm.tsx:45` single date; `TimePicker.tsx:14-16` same-day scope). So you cannot edit a hotel's multi-day span from where you actually see the hotel (the day). Assaf: "עריכת אירוע שמקושר להזמנה — צריך להיות אותו דבר כמו הזמנה … הזמנים לא מוגבלים ליום אחד."

Both are about the same thing — how you interact with a booking and its event — so they're settled together.

## Decision

**1. Tapping a booking opens a read-only detail view; editing is deliberate.** The Index row opens a **detail sheet** showing every fact — title, confirmation code, provider, place / transport route, hotel room + WiFi, notes, and the linked event's timing (check-in→check-out for a span) — with a **"⋯" menu → Edit · Delete** in the corner, mirroring the event card (ADR-0043). "Edit" opens the existing `BookingSheet`; "Delete" runs the existing delete/unlink prompt (ADR-0047 §3). This is the guarded posture a hard commitment deserves (ADR-0011) and gives bookings parity with events.

This **revises ADR-0049 / `trip-index-v1.html`**, which drew tap-straight-to-the-merged-sheet. That was a reasonable first cut; the guarded detail-first pattern is the deliberate correction, chosen for consistency with events and with hard/soft guarding.

**2. The merged edit surface is reached from _both_ sides — Index and the linked event.** Wherever a booking-linked event is edited (day view, plan builder), the edit opens the merged `BookingSheet` seeded from the booking + its event — **not** `EventForm`. `EventForm` remains the editor for **unlinked** manual events only. Concretely: the edit action checks `event.bookingId`; if set, it resolves the booking and opens `BookingSheet` (which already reads the linked event and owns the span fields, `BookingSheet.tsx:68`); if not, it opens `EventForm` as today. This finishes ADR-0047 §2; it invents nothing — the merged sheet already exists and already spans days.

**3. One edit surface, one set of options, from any entry point.** Because both the booking (via §1's detail view) and its event (via §2) now route to the same `BookingSheet`, "editing the event" and "editing the booking" are the same action with the same options — including the multi-day span for hotels/transport. The same-day limitation Assaf hit only ever came from the _wrong form being opened_, not from a missing capability.

## Consequences

- **Frontend only — no data-model or backend change.** The merged sheet, the span fields, and the delete/unlink prompt all exist; this rewires _which_ surface opens and adds a detail view in front of the edit.
- **New:** a booking **detail view** component (read-only; reuses the row/badge chrome and the merged sheet's field layout for display). `Index.tsx` opens detail-then-edit instead of edit directly.
- **Changed:** `DayView.tsx` / `PlanDay.tsx` gain a `bookingId`-aware edit branch that opens `BookingSheet` (they already import the booking for display — `DayView.tsx:357`; now they forward it to edit). They must import `BookingSheet` (today only `EventForm`).
- **`EventForm` narrows in role** to unlinked events. Its same-day scope (ADR-0036/0037) is correct _for that role_; the fix is not to widen `EventForm` but to stop pointing it at linked events.
- **Detail view content is a superset of the row.** The row (ADR-0049) stays a compact list entry; the detail view is where the full record (notes, wifi, room, route, timing) is read — so the durable-reference value of the Index (ADR-0049 §1) is actually visible, not only editable.
- **Archive/read-only (ADR-0049 §2):** in the finished-trip archive the detail view is exactly right — it's already read-only; the "⋯" menu is simply absent (no edit/delete in the archive), which is cleaner than today's tap-into-an-edit-form-then-discover-it's-locked.
- **`trip-index-v1.html` is superseded on this point** by `mockups/index-fixes-v1.html` (detail-view + "⋯"); the rest of `trip-index-v1.html` (lists, empty/archive states, add affordances) stands.

## Alternatives considered

- **Keep tap-to-edit (ADR-0049 as shipped); just add a "⋯" for delete.** Rejected: leaves the asymmetry with events and the un-guarded editing of a hard commitment; Assaf explicitly asked for the detail-view + menu pattern.
- **Widen `EventForm` to handle multi-day spans so linked events can be edited in place.** Rejected: duplicates the span logic the merged `BookingSheet` already owns (`buildSpanSeed`) and reopens the drift ADR-0047 §2 closed (two forms editing the same linked pair). Route to the one merged surface instead.
- **A separate lightweight "linked-event editor" distinct from the booking sheet.** Rejected: that _is_ independent edit surfaces with re-sync, rejected already in ADR-0047 §2.
- **Inline-expand the booking row to verbs (exactly like the event card) instead of a detail sheet.** Considered; a sheet reads better for a booking's richer field set (code, route, wifi, notes) than an inline strip, and the "⋯" affordance is preserved either way. Left to the mockup/implementation to tune; the decision is "read-only detail + ⋯ menu," not the exact container.
