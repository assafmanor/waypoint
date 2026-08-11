# Session 250 — the one date control: a Clear that crashed, and a face that stepped aside too easily (field reports #38 + #36, workstream S phase 1)

**Date:** 2026-08-11
**Workstream:** `S` — both reports, in one sitting, because both live at the boundary between `DateField` and the platform. #38 is the crash and did not wait; #36 was a hypothesis at the start of this session and is **confirmed** (§2), so it was fixed in the same branch.
**Touches:** `frontend/src/ui/primitives/DateField.tsx` (+ its test), `frontend/src/ui/primitives/date-field.css`, `frontend/src/lib/time.ts` (+ test), `frontend/src/lib/places.ts` (+ test), `frontend/src/ui/EventForm.test.tsx`, `frontend/e2e/when-field.spec.ts`, `docs/decisions/0176-…md` (§2, amended in place), `docs/backlog.md`.
**ADR-0176 amended in place** — the closed field's format needed restating, which §5 of [session 249](2026-08-11-session-249-third-incremental-field-reports-addendum.md) said would be the trigger. **No new ADR, no mockup.**
**Still owed:** the physical-Android / installed-PWA pass (§5). Everything below was measured in Chromium.

## 1. #38 — the crash, verified on `main` before anything was touched

Session 249 §5 traced this end to end from reading. It reproduces exactly as written, and the reproduction is worth keeping because it names the throwing frame one level deeper than the trace did.

Two repros were run against unmodified `main` (`393edfd`):

- **At the helpers.** `zonedIso('', '12:00', 'Asia/Tokyo')` and `authoringZone({}, { date: '' }, evidence)` both throw `RangeError: Invalid time value`.
- **Through the form.** Rendering `EventForm` and firing the platform's empty at `#ef-date` throws in render, with this stack:

  ```
  RangeError: Invalid time value
    at offsetAt        src/lib/time.ts:469     ← Intl.DateTimeFormat().formatToParts(InvalidDate)
    at zonedIso        src/lib/time.ts:525
    at resolve         src/lib/places.ts:495
    at authoringZone   src/lib/places.ts:499
    at derivedZone     src/ui/EventForm.tsx:173
    at EventForm       src/ui/EventForm.tsx:393
    at renderWithHooks react-dom
  ```

  **One correction to the trace, and it does not change the fix:** the first throw is `Intl.DateTimeFormat.formatToParts` inside `offsetAt`, one frame **inside** `zonedIso`, not `.toISOString()` at its end. Both do throw on that value (checked in the runtime); the offset probe simply gets there first. `EventForm.tsx:393` and the unconditional `derivedZone` are exactly as reported.

- **And in a real browser.** The e2e added below, run against unmodified source, fails with `getByRole('dialog')` → **element(s) not found**: the form is gone from the DOM. That is the reported crash — no error boundary exists anywhere in `frontend/src` (re-checked: `grep` for `componentDidCatch`/`getDerivedStateFromError` finds only two comments _about_ their absence), so a render throw unmounts the tree and the app goes blank.

## 2. #36 — confirmed, in one look, and the leading hypothesis was right

The check session 249 asked for: focus the field and read the box. Done at 390px in Chromium, on `2026-09-12` — the report's own date.

|                       | at rest         | after a real press (focused) |
| --------------------- | --------------- | ---------------------------- |
| `.df-face` visibility | `visible`       | **`hidden`**                 |
| `.df-input` opacity   | `0`             | **`1`**                      |
| what the box paints   | `שבת, 12 בספט׳` | **`09/12/2026`, clipped**    |

Screenshotted both ways. **The hypothesis holds: it is the native input showing through at `:focus-within`.** The input keeps focus after the press (`document.activeElement` is `INPUT/date`), so the field spends the rest of its life in the right-hand column — which is precisely when a reader checks the date they just entered.

The digits differ from the report's (`09/12/2026` here, `12.9.2026` on the owner's Samsung) and that difference is itself the confirmation: **the string is whatever the platform decides**, which is ADR-0176's founding complaint (`08/09/2026` on WebKit) leaking back through the one state where the face steps aside. `lang="he-IL"` is on the input and did not move it, exactly as ADR-0176 §Context says it would not.

**The clip has the same single cause, and the second half of session 249's reading is falsified.** The note proposed that `.vt`/`.df`'s `min-inline-size: 0` lets the token be squeezed below its content as a flex child of `.wf-line`. Measured, it does not: `.wf-line` is `flex-wrap: wrap`, and flex breaks lines from items' **base** sizes before it flexes anything within a line, so an item that does not fit moves to a new line rather than shrinking. The event form's day line holds one token, and at 1×/1.3×/1.6×/2× system text it measured 107 / 133 / 160 / 195px inside a 356px line — no squeeze at any of them.

What clips is simpler: **a native date is one unwrappable line, inside a box whose width the Hebrew face set.** `09/12/2026` in the platform's own segment layout is wider than `שבת, 12 בספט׳`, so it overruns the box the moment it swaps in. The face in the same box wraps. So the numeric read and the clip are **one** cause after all — which is what session 249 argued — just not by the mechanism it named. A larger system font is the trigger for both, as reported, and not the mechanism for either.

## 3. What shipped

**One answer at the boundary, not five at the hosts.** All six `DateField` call sites (trip creation ×2, trip settings ×2, `WhenField`'s day and span) require a date and mark an empty one as a refusal, so there is no host that wants a different answer to either signal.

- **A Clear is a signal, not a value** (#38). The empty never leaves `DateField`. A Clear restores the date that was showing when the picker opened — latched on `pointerdown` **and** `focus`, so reopening the picker on a date just picked rolls back to _that_ date, not to the one the form opened with — and when a tentative pick had already committed one, the rollback goes upward too. `TimeField`'s `onClear` is the shape this follows (rule 8); no host passes one today, and the prop is deliberately not added until one needs it.
- **An incomplete keyboard entry is not a Clear either.** `<input type="date">` reports `''` between the first keystroke and a complete date. That is why `DateField` now holds the control's own value in state, mirroring the prop (`SpanLeg`'s shape, one level down): swallowing the empty without it means React sees a controlled input whose event changed nothing and **restores the DOM value**, resetting every segment under a typist. The prop still wins the moment it moves, and the face always paints the prop, so this is not a second copy of the truth.
- **The face steps aside for a keystroke, not for focus** (#36). `data-typing` goes on at the first keydown that is not `Tab` and off at blur; `date-field.css` keys on that instead of `:focus-within`. A touch user never types a segment, so on a phone the face now never steps aside at all. The OS picker's own surface is untouched — its presentation was never ours.
- **And the shared helpers stopped being reachable with an unparseable day.** `lib/time.ts` gains `isCalendarDay`, the precondition `zonedIso` had only in prose; `authoringZone` answers the trip's **primary zone** for a day it cannot read, because without a day there is no instant to place against a crossing. Ordering matters here and session 249 named it: this guard stands whatever the rollback does. `BookingSheet:525`'s `day && time ?` guard is left alone — it is a legitimate "not enough to compute an instant yet" test at a call site, not a copy of this one.

**Not done, deliberately:** the native Clear control is not hidden (owner's call, and the app cannot reach into the OS picker anyway); `min-inline-size: 0` is left exactly as it is on both `.vt` and `.df`, since §2 measured it innocent and changing it would be a fix for a mechanism that is not running.

## 4. Tests

Twenty added; each was run against unfixed source to check it fails for the reason it claims.

- **`DateField.test.tsx` (+9).** The Clear never reaches the form; it restores the control and the face; it rolls back a **tentatively picked** date upward; it rolls back to the date showing when the picker last opened; a real selection still commits. Then: focus alone does not set `data-typing`, a keystroke does, `Tab` does not, blur clears it, and a half-typed date is held rather than rolled back or forwarded. Five fail on `main`.
- **`EventForm.test.tsx` (+4).** Add and edit, both. The form is still standing after a Clear, on the date it was showing, with the title typed beside it intact; the save sends the restored date; an edit rolls back after a tentative move and updates with the original; a selected date still commits. Three fail on `main` — **by throwing**, which is the failure they are about.
- **`time.test.ts` / `places.test.ts` (+3).** `isCalendarDay` against the shapes that reach it, and `authoringZone` answering the primary zone for four unreadable days instead of throwing.
- **`when-field.spec.ts` (+4, e2e).** The parts only a browser can answer, and the reason this report survived a 3,434-test suite: the face is **visible** after a real press (a text assertion alone cannot tell ours from the platform's — hidden text still matches); the whole Hebrew date renders with no overflow at 1.6× and 2.2× system text and stays inside its line; and a real control writing a real empty value — through React's own value tracking, which a synthetic jsdom event bypasses — leaves the app on screen. All four fail on `main`.

`3,434 → 3,450` unit tests green (16 here, plus the 4 e2e), 10/10 e2e in `when-field.spec.ts`, `pnpm typecheck` + `pnpm build` green, lint clean.

## 5. What a device still owes

Android's text scaling is emulated here by raising the three type tokens, which is what Blink's text zoom does to every size in this app — a good emulation of the layout consequence and **not** a substitute for the pass the owner asked for. Two things in particular cannot be settled in Chromium:

- **Which controls a given Android build's picker draws**, and what its Clear reports. The fix does not care (any empty is a cancellation), but the acceptance item "cancel/back and Clear do not double-fire" is a real-device observation. Nothing here fires on cancel/back at all — the platform reports no change — but that is reasoning, not a reading.
- **Samsung's own font at its own scale**, which is where the report came from, against the wrapped Hebrew face rather than the native line.

Also worth a look while a device is out, and not fixed here because nobody asked: the face reads `שבת, 12 בספט׳` (abbreviated), where the report and the owner's acceptance both write `שבת, 12 בספטמבר` (full). That is `formatDayDate`'s existing choice, unchanged since ADR-0177 §4, so it is a question about the format rather than a defect in it.
