# Collaboration Model

**Status:** PROPOSED (for review). The requirement: **real collaboration between different users** in v1 — everyone sees the same trip, edits propagate, changes are visible. Built for ~5 members per trip, designed not to preclude more.

## Membership & identity

- **Identity:** each user is a real account (Google sign-in). Not device-local, not a shared login. This is what makes true collaboration and per-user calendar sync possible.
- **A trip has members.** One creator, then others **join via an invite link** (a signed token). Joining adds a membership row.
- **Roles (v1):** everyone is a **peer**. All members can view everything and edit soft plans. No admin/editor/viewer split yet — recorded as a deliberate deferral (ADR-0005). The data model carries a `role` field so roles can be introduced later without migration pain.

## What is shared vs. personal

| Shared (per trip, all members) | Personal (per member) |
|---|---|
| Itinerary (events, hard/soft) | Their Google account connection |
| Index (bookings, codes) | Their personal calendar (one-way sync target) |
| Documents | Their notification preferences |
| The "maybe" shelf | Their device's offline cache |
| The change-feed | — |

## Realtime sync

- Each client subscribes to a channel scoped to its **active trip**.
- When a member commits a change, the server persists it and **fans it out** to other connected members.
- Members see near-real-time updates to the itinerary/index without re-fetching or re-sending messages.
- **Transport:** native **WebSockets** from the NestJS backend, with an in-process per-trip channel manager (fine for ~5 users); Postgres `LISTEN/NOTIFY` if we ever run multiple workers. See tech-stack.md; the model doesn't depend on the exact transport.

## Conflict handling (kept deliberately simple)

At 5 users, heavy conflict machinery (CRDTs, operational transform) is overkill. Proposal for v1:

- **Soft events:** **last-writer-wins** at the field level, plus **undo**. If two people move the same soft block, the later write wins and the change-feed shows both actions; anyone can undo.
- **Hard events:** protected. Editing a hard event requires explicit confirmation (the warning in the mockup) and never happens automatically or via ripple. This drastically shrinks the conflict surface where it matters.
- **The change-feed is the safety net:** "Noam moved ramen to 20:00." Lightweight awareness beats locking. It's *awareness, not a turf war* — no destructive auto-merge, everything undoable.

**Revisit trigger:** if last-writer-wins produces real pain in practice, upgrade specific entities to a CRDT-backed field. The schema (see data-model.md) records `updated_by` / `updated_at`, which is enough to build that later.

## The change-feed

- Every mutation to shared trip state writes a `change` record: who, what, when, before→after.
- Powers the group feed UI and doubles as an audit/debug log and the basis for undo.

## Presence (light, v1)

- Show which members exist and who is connected to Google (avatars + status, already in the mockup).
- **No live GPS location sharing in v1** (privacy + effort). Recorded as out-of-scope (ADR-0006); revisit as an opt-in feature.

## Privacy stance

Private, invite-only. No public trips, no discovery, no social graph. Members' personal data (calendars, notification prefs) is never exposed to other members beyond the light presence above.
