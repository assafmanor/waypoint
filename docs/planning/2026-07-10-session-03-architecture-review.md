# Planning Session 03 — Architecture Review & Foundation (T-025)

**Date:** 2026-07-10
**Mode:** Architecture review — critically reviewing the scaffold (incl. the DB schema) and locking the target architecture before any build work.
**Participants:** Assaf + AI assistant
**Task:** T-025. Worked collaboratively in four checkpoints with sign-off at each.

## Purpose
The scaffold was planning-time boilerplate. Before feature work, review everything (data model, sync/consistency, auth, module boundaries, monorepo/tooling), decide the target architecture, record ADRs, and reshape the task plan.

## The review — right / wrong / missing

### CP1 — Data model (→ ADR-0018)
**Right:** relational Postgres keyed by `tripId`; `Membership` join with `@@unique([tripId,userId])`; `Event.kind` as the core enum; `Change` as the single substrate; `Booking.details Json`.
**Wrong (stored derived state):** the `Day` table (a day is a date — and its cascade delete would take events with it); `EventStatus.now` (a clock function; stale offline); "field-level LWW" with a single `updatedAt` (impossible). `Booking.offlineAvailable` (needless per-row flag).
**Missing:** uniform audit columns (only `Event` had them); a home for multi-day *events*; the whole practical layer (WiFi/emergency/budget); auth tables (see CP3).
**Decisions:** drop `Day` (→ `Event.date`); remove `now`; UTC instants + `Trip.timezone`; `Event.endDate` for multi-day ambient spans (wedding/festival) rendered like hotel strips; **client-generated ids**; uniform audit cols; drop `offlineAvailable`; roles `admin`+`peer` (creator = admin, Assaf's call); minimal practical layer (`TripNote`, `Trip.currency`/`dailyBudgetMinor`, static emergency numbers). Overnight = one Booking with a range.

### CP2 — Sync / consistency / offline (→ ADR-0019)
**Wrong/holes:** timestamp catch-up cursor (lossy on ms collisions); no atomicity mandated between the entity write and the `Change` insert (a crash desyncs every client permanently); "field-level" LWW unimplementable.
**Decisions:** `Change.seq` monotonic cursor + gap detection; `ChangeService.mutate()` runs write + `Change` in one transaction, broadcast post-commit; `GET /snapshot` bootstrap; **row-level, server-authoritative** LWW; undo = new inverse `Change`, **your-own-last-action only**; physical deletes with `before` snapshot; offline outbox = ordered FIFO, idempotent via client ids.

### CP3 — Auth & sessions (→ ADR-0020)
**Wrong/missing:** stateless JWT can't satisfy the doc's own "logout invalidates session" / revocation; no tables for our sessions, encrypted Google tokens, or the calendar id map; `Membership.googleConnected` is always-true under Google-only auth.
**Decisions:** in-memory 15-min access JWT + rotating hashed refresh `Session` (revocable); **single-origin** in prod (backend serves the PWA; not Vercel — no WS proxy); refresh in httpOnly SameSite=Lax cookie; **`AuthIdentity`** generalized seam (future non-Google login at zero extra table cost — Assaf's forward-looking ask); `CalendarEventLink`; drop `googleConnected`; state+PKCE+offline access; separate `TOKEN_ENCRYPTION_KEY`.

### CP4 — Module boundaries & tooling
Validated the toolchain empirically (Assaf had bumped deps to current): shared build (zod 4) ✅, backend typecheck (NodeNext + NestJS 11 + Prisma 7 driver-adapter) ✅, `nest build` emits **CommonJS** ✅ (so NodeNext holds — guardrail: no `type:module`), frontend typecheck (React 19 + Vite 8) ✅.
**Gaps:** ESLint claimed but unconfigured (silent no-op); no test runner → **Vitest everywhere**.
**Module map:** Auth / Trips (+practical) / Events (+maybe-shelf, hard-guard, ripple) / Bookings / Documents / Calendar; infra Prisma(global) / Crypto / **Sync** (`ChangeService` + WS gateway + snapshot/changes). Hard boundary: all mutations flow through `ChangeService.mutate()`; validation via a `ZodValidationPipe` over `packages/shared`. Consequence: `ChangeService` is a prerequisite for the first CRUD module (earlier than the old backlog implied).

### Cross-cutting (Assaf raised) — Multi-trip (→ ADR-0021)
A user belongs to many trips. **Already modeled** (Membership join); new work is client-only: active-trip localStorage + a minimal switcher + generalized mode derivation. Overlapping in-progress trips deferred.

## Decisions → ADRs
- New: **0018** (data-model shape), **0019** (sync protocol), **0020** (auth/session), **0021** (multi-trip).
- Updated: **0005** (roles: admin+peer, Accepted), **0012** (LWW+undo, Accepted, row-level clarified).

## Scaffold corrections noted
- ESLint flat config to be wired; Vitest to be added (tooling task T-028).
- `.env.example` gained `TOKEN_ENCRYPTION_KEY`.
- `NodeNext` validated — no change, guardrail documented.
- Prisma 7 driver-adapter migration already done by Assaf.
- The full schema rewrite + migration + shared-types sync is its own task (**T-026**), not done here.

## Task plan reshaped
Updated T-007, T-008, T-019, T-021. New: T-026 (apply data model), T-027 (trip switcher + active-trip), T-028 (tooling: ESLint + Vitest), T-029 (Sync core: `ChangeService` + WS gateway + snapshot/changes — gates CRUD). Board regenerated.

## Sign-offs
Assaf signed off CP1, CP2, CP3, CP4, the multi-trip approach, and the schema-as-T-026 process choice (full trail in the T-025 progress log).
