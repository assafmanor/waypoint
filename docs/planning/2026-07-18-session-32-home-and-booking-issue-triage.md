# Session 32 — Home & bookings issue triage (2026-07-18)

**Outcome:** Triaged a batch of on-the-ground issues/feature requests from Assaf (pasted in Hebrew) into documented decisions and independently deployable tasks. Four new ADRs (0059–0062), three amendments to existing ADRs (0035, 0052, 0054), backlog entries, and this note with a task breakdown + file-ownership map. **No code changed this session** — this is the design/decision record; each task ships on its own change.

## The raw input (Assaf, Hebrew) and how it was read

| #   | Raw item                                                                                                         | Reading                                                                                                                                                                                           | Landed in                        |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1a  | הירו — מלונות רק לפני צ'ק אין (ואולי קצת אחרי) ולפני צ'ק אאוט מוצגים, וכל שאר סוגי ההתחלה סוף (המראה נחיתה וכו') | The board hero should surface a booking at its **transition moments** — a hotel around check-in (before + a short grace after) and before check-out, not mid-stay; transport at departure/arrival | ADR-0059 §1                      |
| 1b  | היום במבט: לסמן צ'ק אין צ'ק אאוט וכו' אבל לא [לספור]                                                             | The glance should **mark** check-in/out moments but **not count** them in the schedule                                                                                                            | ADR-0054 amendment               |
| 1c  | לחשוב על עיצוב חדש שמסמן שאנחנו תוך כדי הזמנה … כרגע העיצוב מאוד סתמי                                            | A distinct "you're inside a booking now" treatment (at the hotel / in transit)                                                                                                                    | ADR-0059 §2                      |
| 3   | מראה התצוגה מקדימה של הזמנות                                                                                     | Booking appearance polish — clarified as **all three** surfaces (hero, Index row, detail view)                                                                                                    | ADR-0059 §3                      |
| 2   | swipe gesture לחזרה — בית טיול (והיום של הטיול); מבית טיול → כל הטיולים                                          | Back → trip Home **and today**; Home → all-trips. Clarified as **both** a bug and a reset-to-today refinement                                                                                     | ADR-0035 refinement (2026-07-18) |
| 4   | שליטה על המסמכים — פחות אפשרויות ב־3 נקודות, רק עריכה בסיסית + מחיקה                                             | Trim the documents "⋯" to Edit · Delete                                                                                                                                                           | ADR-0052 amendment (2026-07-18)  |
| 5   | פתיחה אחרי שעבר קצת זמן — חזרה לבית הטיול (במצב טיול)                                                            | Reopen after idle → trip Home/today                                                                                                                                                               | ADR-0060                         |
| 6   | כפתורי "מה חסר להשלמה" במצב תכנון — הצעות + התנהגות הקיימים                                                      | Rework the plan-home readiness checklist (content + behavior)                                                                                                                                     | ADR-0061                         |
| 7   | זום באפליקציה — מבוטל חוץ מ־preview של תמונה                                                                     | Disable zoom app-wide except the image preview                                                                                                                                                    | ADR-0062                         |

## Decisions Assaf made this session (AskUserQuestion, 2026-07-18)

- **Documents "edit" = rename + change type** (metadata), "⋯" becomes Edit · Delete; **replace-file dropped** (delete + re-upload instead). → ADR-0052 amendment.
- **Idle-resume threshold = ~30 min**, resetting to Home + today; under 30 min resume in place. → ADR-0060.
- **Back gesture = both** a correctness fix and a reset-to-today; the concrete cause is the gesture path skipping the day reset. → ADR-0035 refinement.
- **Booking preview = all of the above** (hero + Index row + detail view). → ADR-0059 §3.

## What was decided (per ADR)

- **ADR-0059 (Proposed)** — bookings surface on the hero at transitions (hotel check-in/out, transport departure/arrival), a distinct in-progress "inside a booking" treatment, and one shared appearance grammar across hero/row/detail. Design pass (mockup `mockups/booking-presentation-v1.html`) first. Subsumes the backlog's "board hero booking presentation" item. Open Qs: exact window durations; whether transport gate is modeled; one vs two in-progress treatments.
- **ADR-0060 (Proposed)** — a `visibilitychange` nav-reset to Home/today after ≥~30 min hidden in Trip mode; distinct constant from the 30-second data resync; Plan mode preserves position.
- **ADR-0061 (Proposed)** — re-verify the four existing readiness checks' behavior against the now-real Index/Day screens; reconsider the suggestion set (documents/passport now buildable post-ADR-0058); real-data-only stays. Design pass first; open Qs listed in the ADR (which new suggestions; advisory vs gating; collapse done rows; per-traveller dimension).
- **ADR-0062 (Proposed)** — zoom off app-wide (`touch-action: manipulation` + multi-touch gesture suppression, since iOS ignores the viewport meta), viewer opts back into pinch-zoom + pan. Accessibility trade-off recorded.
- **ADR-0035 refinement** — back-to-Home also resets the day to today in Trip mode (gesture path currently skips it); reliability verify.
- **ADR-0052 amendment** — "⋯" trimmed to Edit · Delete; Edit = rename + type; replace-file deferred.
- **ADR-0054 amendment** — glance adds uncounted check-in/check-out point markers; count/tree untouched.

## Task breakdown + file-ownership map (for parallel agents)

Ordered roughly by independence. Frontend paths are under `frontend/src/`. Tasks touching disjoint files can run simultaneously; shared-file collisions are called out.

| Task                                  | ADR         | Primary files (owned)                                                                                   | Notes / sequencing                                                                         |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| T1 Booking presentation design        | 0059        | `mockups/booking-presentation-v1.html` (new); the ADR flips to Accepted on sign-off                     | Design-only; gates T2/T3. Do first.                                                        |
| T2 Hero transitions + in-progress     | 0059 §1/§2  | `screens/Home.tsx` (hero block), a new `lib/hero-booking.ts` (+ test), `i18n/he.ts`, `screens.css`      | After T1. **Shares `Home.tsx`/`screens.css`/`he.ts` with T4/T5** — sequence or coordinate. |
| T3 Booking appearance (row + detail)  | 0059 §3     | `screens/Index.tsx` (`BookingLi`), `ui/BookingDetail.tsx`, `screens.css`                                | After T1. Disjoint from T2 except `screens.css`.                                           |
| T4 Glance check-in/out markers        | 0054 amend  | `lib/glance.ts` (+ test), `screens/Home.tsx` (rail render), `screens.css`                               | Fold into the ADR-0054 ambient-span build. Shares `Home.tsx`/`screens.css` with T2.        |
| T5 Idle-resume to Home/today          | 0060        | `state/trip-state.tsx` or `state/nav-state.tsx`, `App.tsx`                                              | Reuses the Home-tap reset (`App.tsx:351-354`).                                             |
| T6 Swipe-back resets to today         | 0035 refine | `state/nav-state.tsx` (`useTripTab`/`goToTab`), `App.tsx`                                               | Small; coordinate with T5 on `App.tsx`.                                                    |
| T7 Plan-home readiness design + build | 0061        | mockup (new); then `lib/readiness.ts` (+ test), `screens/PlanHome.tsx`, `i18n/he.ts`                    | Answer open Qs with Assaf first. Independent of T2/T3.                                     |
| T8 Documents "⋯" → Edit · Delete      | 0052 amend  | `ui/DocumentManageSheet.tsx`, `ui/DocumentsSection.tsx`, `i18n/he.ts`                                   | Part of the ADR-0052 documents task.                                                       |
| T9 Disable zoom except viewer         | 0062        | `index.html`, `App.css`/`styles/tokens.css`, `ui/DocumentViewer.tsx`, `screens.css` (`.doc-viewer-img`) | **Must verify on iOS Safari / installed PWA.** Independent.                                |

`he.ts` and `screens.css` are touched by several tasks — expect small, localized merges there (append-only string/rule additions), not structural conflicts.

## Open questions carried forward (need Assaf, before the relevant build)

- **ADR-0059:** exact transition-window durations (pre-check-in, post-check-in grace, pre-check-out, departure lead); is transport gate/terminal data available to show; one shared "inside a booking" component or hotel/transit variants.
- **ADR-0061:** which new suggestions to add first (documents/passport confirmed as the strongest candidate); advisory vs gating the go-live switch; collapse completed rows; per-traveller vs trip-level checks.

## Deferred / explicitly not done

- Building any of the mockups or implementation (this session is triage + decisions only).
- The document **replace-file** PATCH variant (ADR-0052 amendment defers it; delete + re-upload covers the need).
- Flipping ADR-0059/0060/0061/0062 to Accepted — they await Assaf's sign-off (and, for 0059/0061, a mockup), per the repo's Proposed→Accepted gate.
