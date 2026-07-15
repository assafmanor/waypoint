# 2026-07-15 · Session 20 — Trip-settings design

**Participants:** Assaf + Claude
**Output:** `mockups/trip-settings-v1.html`, [ADR-0039](../decisions/0039-trip-settings-admin-governed-data-plane.md).
**Status:** design approved; implementation pending (new endpoints + frontend screen).

## Goal

Design the trip-settings screen (`/trip/:id/settings`, previously a `ShellStub`). Show **only functionality that has a working backend**, with everything deferred documented rather than faked as a live control.

## What we walked through

1. **Supported vs. unsupported audit.** Against the old settings block in `screens-v1.html`: the invite link (`POST /trips/:id/invite`), members + roles, leave/remove-member (`DELETE /trips/:id/members/:userId`) are real; editing trip details, delete-trip, calendar-sync push, Gmail/Photos/WhatsApp were **not**.
2. **Editing was pulled into scope.** Assaf chose to build the edit path (`PATCH /trips/:id`) rather than ship a read-only screen.
3. **Governance model (Assaf's calls):**
   - Trip-settings editing is **admin-only, enforced server-side** — not just hidden in the UI. Peers get a read-only screen. (Everyday soft-plan/event editing stays open to all — the gate is on governance.)
   - **Admins can promote** peers to admin. No explicit demotion in v1.
   - When the **last admin leaves**, another member is **auto-promoted (arbitrary)** so no trip is admin-less.
   - **Delete trip = admin-only**, double-confirm.
4. **Timezone & currency stay manually editable** for now; auto-derivation from the destination is a future update.
5. **Every settings mutation must be realtime + offline** — broadcast over WS and logged via the change service so it appears immediately to everyone and works offline. This **moves `Trip` + roster `Membership` onto the data plane**, partially superseding ADR-0022 (which had them as control-plane CRUD). See ADR-0039 §5.
6. **Member actions** went from awkward inline crown+remove buttons to a single **kebab → bottom action sheet** (the app's `Sheet` pattern).
7. **Chrome is mode-neutral** ink-on-paper (settings is reached from both modes; route sits outside the mode Shell).

## Follow-through: date pickers (PR #92)

PR #92 ("fix(dates): bound date pickers and localize the native input", merged 2026-07-15) fixed four native-date bugs in CreateTrip + the event form. **The same treatment must apply to the settings date fields:**

- Pin `lang` to the new `DEVICE_LOCALE` so the native `<input type="date">` renders in the device's convention (not `mm/dd/yyyy`) — the current mockup still shows the un-pinned format.
- Link the **end** picker's `min` to the chosen **start**, and reuse the shared `endDate >= startDate` refine (ADR-0023) so client and server reject an inverted range identically.
- A submit-time guard for typed values that bypass the native bounds.
- **Do not** floor to today here: unlike creation, editing an existing trip must allow past / already-under-way dates (you may be correcting a trip that has started). The future-floor is creation-specific.

## Deferred (documented in the mockup's notes panel)

- `PATCH /trips/:id/members/:userId` (role) and `DELETE /trips/:id` need building; membership ops must move onto `ChangeService`; the client change-apply (`trip-state`/`cache`) and outbox handle only `entityType === 'event'` today and need `'trip'` + `'membership'`.
- Calendar-sync push (ADR-0003), Gmail (v1.1), Photos/WhatsApp (out of scope, ADR-0004), behaviour toggles (built-in, not stored settings).
- `calendarSyncEnabled` is a personal pref (may stay simple CRUD, not roster state).

## Next

Write-up done. Implementation order: shared schemas → `PATCH /trips/:id` + role + delete endpoints (through `ChangeService`, admin-gated) → client entity-type handling + outbox verbs → the React screen replacing the stub, reusing `EventForm`/`Sheet` and the PR-#92 date handling.
