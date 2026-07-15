# 0038 — Trip settings: admin-governed edits; settings mutations join the data plane

**Status:** Accepted
**Date:** 2026-07-15
**Refines:** ADR-0005 (turns the `admin`/`peer` split into concrete settings capabilities), ADR-0032 (trip details, minimal at creation, become editable in settings).
**Partially supersedes:** ADR-0022 (moves `Trip` and roster-level `Membership` mutations from the control plane onto the data plane).

## Context

We designed the trip-settings screen (`/trip/:id/settings`, previously a stub — mockup `mockups/trip-settings-v1.html`). Two forces shaped it:

1. **Ship only what's real, note the rest.** The screen must expose functionality that has a working backend, with deferred items documented rather than faked as live controls.
2. **The owner requires settings changes to be live and offline-capable** — an edit (rename the trip, change dates, promote/remove a member) must appear immediately to everyone and be doable offline, syncing later.

Starting state: no `PATCH`/`DELETE` trip endpoints were implemented; `updateMembershipPrefs` and `removeMember` were plain Prisma CRUD; roles are `admin` (creator) / `peer` (ADR-0005), with everyday **soft-plan (event) editing open to all**; timezone/currency are set at creation (ADR-0032). Critically, **ADR-0022 classified `Trip` and `Membership` as control-plane** — plain CRUD, no `Change` record, no WS broadcast, no offline outbox ("a member joining doesn't belong on the per-trip timeline change-feed").

## Decision

**1. Supported-first scope.** The screen ships: view + edit trip details; members list with role badges; invite link; leave trip; and, admin-only, remove member, promote to admin, and delete trip. Deferred and documented in-mockup (not shown as live controls): Gmail/Photos/WhatsApp integrations (ADR-0004), the calendar-sync push (ADR-0003 — the `calendarSyncEnabled` flag persists but the push is unwired), and behaviour toggles (ripple, hard-detection — these are built-in behaviours, not stored settings).

**2. Trip settings are admin-governed, enforced server-side.** Editing trip details, promoting admins, removing other members, and deleting the trip are **admin-only, gated in the service** (not merely hidden in the UI). Peers get a read-only screen. This makes ADR-0005's structural split concrete for the settings surface. **Everyday soft-plan/event editing stays open to all members** (unchanged) — the gate is on trip *governance*, not on the collaborative timeline.

**3. Details edit = one form → one `PATCH /trips/:id`.** Name, destination, dates, timezone, currency, and daily budget edit together as a single form and a single partial update. **Timezone and currency are manually editable for now**; auto-derivation from the destination is a future update (at which point we decide whether to keep a manual override).

**4. Governance edges.** Admins can promote peers to admin (`PATCH /trips/:id/members/:userId` with a role). There is **no explicit demotion** in v1 (by choice). When the **last admin leaves**, another member is **auto-promoted (arbitrary choice)** inside the removal path, so a trip is never left admin-less.

**5. Settings mutations join the data plane.** `Trip` (update/delete) and roster-level `Membership` mutations (role change, removal/join) now route through **`ChangeService.mutate()`** — atomic entity-write + `Change`, monotonic `seq`, WS broadcast after commit, client optimistic dispatch + offline outbox — exactly like `TripEvent` (ADR-0019). This is the mechanism behind requirement 2. It **partially supersedes ADR-0022**, which had put these entities on the control plane.

**6. Mode-neutral chrome.** The settings screen is ink-on-paper, **mode-neutral** — it is reached from both Plan and Trip mode and its route sits outside the mode Shell, so it does not carry Plan-violet or Trip-indigo mode identity (consistent with the shell being "indigo/neutral only", app-shell.md).

New/changed endpoints (planned): `PATCH /trips/:id` (details, admin-only), `PATCH /trips/:id/members/:userId` (role, admin-only), `DELETE /trips/:id` (delete trip, admin-only, double-confirm). The existing `DELETE /trips/:id/members/:userId` (leave/remove) moves onto `ChangeService`.

## Consequences

- **Realtime + offline for settings, consistent with the timeline.** A rename or a member change reconciles the same way events do. Cost: `Trip`/`Membership` writes now carry `Change` rows and broadcasts, and the **client must handle `entityType` `'trip'` and `'membership'`** — today `trip-state.tsx`/`cache.ts` apply only `'event'`, and the outbox has only event verbs. New outbox verbs (update-trip, set-role, remove-member, delete-trip) are needed.
- **ADR-0022's classification is overridden for these entities**, but its build-order rationale stands historically. The control plane now effectively covers only `User` + auth (`Session`, `AuthIdentity`). ADR-0022 gets a partial-supersession pointer.
- **`calendarSyncEnabled`** (a personal, per-member preference nobody else watches) may stay simple CRUD — it is not shared roster state; flagged for the implementer.
- **Details are now editable post-create**, complementing ADR-0032: creation stays minimal, and settings is where the trip is refined. Trip-detail edits become undoable via the change feed (LWW, ADR-0012); **delete-trip is broadcast + logged but not toast-undoable** (a double-confirm guards it instead).
- Enforcement is no longer "minimal/deferred" for the settings surface (cf. collaboration-model.md): admin gating is real and server-side here.
- **The date fields reuse PR #92's native-date handling** — `lang` pinned to `DEVICE_LOCALE` (localized format, not `mm/dd/yyyy`), the end picker's `min` linked to the chosen start, and the shared `endDate >= startDate` refine (ADR-0023) with a submit-time guard. Unlike creation, editing here **does not floor to today** — an existing trip may already be under way or past.

## Alternatives considered

- **Keep `Trip`/`Membership` on the control plane (status quo, ADR-0022) with refresh-on-snapshot:** rejected — the owner wants settings edits to appear immediately and work offline like the timeline; snapshot-on-refresh doesn't meet that.
- **Editing open to all members (pure "peers not roles"):** rejected — the owner chose admin-governed control for trip settings (soft-plan editing stays open to all).
- **Per-field inline edit / a separate endpoint per field:** rejected — one details form → one `PATCH` is simpler and matches the single-mutation change model.
- **Member actions as inline row buttons (crown + remove):** rejected as visually awkward — replaced by a single kebab opening a bottom action sheet (the app's existing `Sheet` pattern).
