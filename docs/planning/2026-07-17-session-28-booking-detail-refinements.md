# Session 28 — Booking detail refinements: type-aware timing, the "⋯" on the row, RTL route

**Date:** 2026-07-17
**Type:** implementation (frontend only, no data-model change)
**Outcome:** three post-build refinements to the booking detail view (ADR-0053) shipped on the Index tab. **Revises ADR-0053 §1** (the "⋯" moves off the detail onto the row, mirroring the document row); the timing and route changes are presentation fixes.

## Why this session happened

Assaf walked the shipped booking detail view (the read-only sheet from ADR-0053, PR #129) and filed three items against it, with screenshots, then clarified two of them in follow-ups:

1. **"כשיש זמן צריך להציג אותו, בהתאם לסוגו (טיסות - המראה/נחיתה, מלון - צ'ק אין/צ'ק אאוט)."** The timing should be labelled by booking type, not a generic "מתי". Follow-up: **"...צריך לראות גם מבחוץ (במקום המתי שרואים עכשיו)"** — the labelled time must show **on the row too**, not only in the detail.
2. **"3 נקודות צריך לצאת מה-preview של ההזמנה החוצה."** Clarified: **"תפריט שלוש נקודות רק מבחוץ, לא מתוך תצוגת הפרטים … צריך להיות רק כפתור עריכה, והשלוש נקודות צריכות להיות בחוץ בצד שמאל כמו המסמכים."** The detail view should carry **only** the edit button; the "⋯" (edit/delete) belongs **on the booking row**, on the inline-start (left) side, exactly like a document row.
3. **"כיוון החץ הפוך."** The transport route read `ישראל → קרואטיה` with the arrow pointing the wrong way for a Hebrew (RTL) reader — it looked like Croatia→Israel.

## What changed

### 1 · Type-aware timing labels, in the detail **and** on the row

`BookingDetail.tsx` already used the type-specific span labels (check-in/check-out, depart/arrive) but **only when the linked event had an `endDate`** (a multi-day span). A same-day flight (an event with `endsAt` but no `endDate`, e.g. the arrival leg in fixtures) fell through to the generic **"מתי"** and showed one time.

- The two-fact (start + end) display now keys on the linked event's **`endsAt`**, not `endDate` — so a same-day flight shows both its departure and arrival.
- The single-time fallback uses the **type start label** when a time exists; "מתי" survives only for the truly unscheduled case (no `startsAt`).
- Added flight-specific labels **המראה 🛫 / נחיתה 🛬** (`t.index.form.flightDepartLabel` / `flightArriveLabel`), distinct from the generic transport **יציאה/הגעה** that still serves trains.
- **The Index row** now prefixes its schedule with the (emoji-stripped) type start label — `🔗 המראה · היום · 02:10`, `🔗 צ׳ק-אין · היום · 04:17` — in place of the bare `היום · 02:10`. A date-only event (no time) still reads plainly.
- All three surfaces (detail, the merged `BookingSheet` form, the row) resolve their labels from **one shared helper**, `frontend/src/lib/booking-timing.ts` (`timingLabels` + `plainTimingLabel`), so the wording can't drift.

### 2 · The "⋯" lives on the row, not in the detail (revises ADR-0053 §1)

ADR-0053 §1 put both a visible edit button **and** a "⋯" menu inside the detail view. Assaf's correction: the detail is a pure read-only record with **only** the edit button; the "⋯" belongs on the row, matching the document row (ADR-0052).

- **`BookingDetail`** drops the "⋯", its menu, and the delete path — it now carries only the `✏️ עריכה` button.
- **The booking row** (`Index.tsx`) became a flex container (`.li.bk`), not a single button: a `.li-open` tap area (badge + title + labelled time) opens the read-only detail; a trailing **`.kebab` "⋯"** opens a new **`BookingManageSheet`** (Edit · Delete), the same shape as `DocumentManageSheet`. Edit opens the merged `BookingSheet`; Delete raises the existing delete/unlink prompt (ADR-0047 §3).
- Tapping a row (upcoming **or** past) now consistently opens the detail (the old code opened the edit sheet directly for past rows).

### 3 · RTL route direction

The route (`from → to`) was rendered `dir="ltr"` with a `→`, so for Hebrew place names the origin landed on the left and the arrow pointed away from the destination — backwards for an RTL reader. Replaced with a shared **`RouteLabel`** component: an `inline-flex` row with **explicit `direction: rtl`** and `<bdi>`-isolated names, so the origin sits at the start (right) and a **`←`** points at the destination (left) — **independent of text bidi**, so it reads correctly for both Hebrew (`ישראל ← קרואטיה`) and Latin (`Tel Aviv ← Zagreb`) names. Used in both the row and the detail heading; the `.route` CSS was promoted from `.index`-scoped to general (the detail sheet portals outside `.index`).

## Files touched

- `frontend/src/lib/booking-timing.ts` — **new** shared `timingLabels` + `plainTimingLabel`.
- `frontend/src/ui/BookingManageSheet.tsx` — **new** row "⋯" sheet (edit / delete).
- `frontend/src/ui/BookingDetail.tsx` — edit-only header, `endsAt`-keyed timing, `RouteLabel` (exported), shared labels.
- `frontend/src/screens/Index.tsx` — flex row + `.kebab` → manage sheet; row schedule prefixed with the type label; `RouteLabel`.
- `frontend/src/ui/BookingSheet.tsx` — `spanLabels` delegates to the shared helper.
- `frontend/src/i18n/he.ts` — `flightDepartLabel` / `flightArriveLabel`.
- `frontend/src/screens.css` — general `.route` (RTL flex), `.li.bk` row (mirrors the doc row), removed the detail "⋯" styles.

## Verification

`typecheck`, `lint` (no new warnings), `build`, and the full frontend test suite (283) all green. The row, the edit-only detail, the manage sheet, and the RTL route were confirmed by rendering the exact DOM against the real CSS headlessly — the "⋯" sits on the inline-start of each row, the time reads "המראה · היום · 02:10", and origin-right / arrow-left held for both Hebrew and Latin names.
