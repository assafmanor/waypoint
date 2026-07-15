# Session 15 — Builder "add event" button + event-form keyboard (2026-07-15)

**Outcome:** Two UX refinements to the Plan-mode day builder, surfaced by user screenshots. No architectural change.

## 1. The trailing "add event" button earns a distinct job

The builder had two add entry points that fired the **same** handler (`setFormTarget('new')`): the section-header `+ אירוע חדש` and the trailing full-width `+ הוסף אירוע ליום N`. Same blank form, no time — pure duplication.

Kept the trailing button (it's the empty-day CTA, and its position after the last row means "continue the day") but gave it a real job: it now **prefills the next open slot**. New `lib/gaps.ts#nextSlot` returns a `GapDefaults` block — a `GAP_FILL_MINUTES` (1h) block starting at the day's **latest event end** (max `endsAt ?? startsAt` across the day, so an overlapping long block wins over a later-starting short one), or a `DAY_WINDOW.START_HOUR` (07:00) block when the day is empty. Fed through `EventForm`'s existing `defaults` prop (the same channel gap-fill uses).

- Label: `הוסף אירוע ליום N` → `הוסף אירוע` (the day number was redundant on the day's own screen; "end of day" wording was rejected as misleading against the 07:00 empty-day default).
- Header button unchanged: still the free-form "you fill in everything" add.

## 2. Event form is a bottom sheet, not a centered modal

`.confirm-overlay` centered `.event-form-card` vertically; the title field autofocuses, so the on-screen keyboard opened immediately and covered date/time/save. Anchored the form to the bottom edge instead (scoped via a new `event-form-overlay` class so the generic `ConfirmDialog` is untouched):

- `align-items: flex-end`, `dvh` max-height, top-only radius, `sheet-up` slide-in, `env(safe-area-inset-bottom)` padding.
- `index.html` viewport gains `interactive-widget=resizes-content` so the layout viewport shrinks with the keyboard and `dvh` tracks the visible area.
- `EventForm` adds `onFocusCapture` → `scrollIntoView({ block: 'center' })` so a field focused below the fold is revealed inside the scroll container.

This is a step toward the bottom-sheet presentation the `EventForm` header comment already anticipated (T-053).

## Verified

Frontend `typecheck · lint · test · build` all green; **182** frontend tests (incl. 4 new `nextSlot` cases). Keyboard-overlap behavior itself needs a real device/soft-keyboard to confirm end-to-end — the CSS/viewport wiring is in place.
