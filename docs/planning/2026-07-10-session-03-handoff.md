# Handoff — Architecture Foundation (session 03, T-025)

**Date:** 2026-07-10
**Purpose:** Cold-start handoff. A single, self-contained synthesis of the durable decisions from the T-025 architecture review so a fresh session can resume without re-reading the whole transcript. Full rationale lives in ADR-0018/0019/0020/0021 and `2026-07-10-session-03-architecture-review.md`; this is the condensed, active-only view.

**Status of T-025:** Done (accepted by Assaf 2026-07-10). The decisions below are locked. They are *documented* but **not yet in code** — the schema/migration/types application is task **T-026**, the first build step.

---

## 1. Active Decisions

### Data model (ADR-0018)

- **Drop the `Day` table; `Event` carries `date DATE`.**
  - *Problem:* `Day` stored derived state — a day is just a calendar date in the trip range. It brought a lifecycle (create-on-trip, reconcile-on-date-change) and a cascade-delete that would take events with it, plus a second source of truth for "when".
  - *Solution:* `Event.date` + `sortOrder` within the date. Empty days derive from the trip range. Optional labels → `Trip.dayLabels Json?` if ever needed.
  - *Rationale:* removes a lifecycle trap and a join; ordering survives via `sortOrder`. Rejected keeping `Day` "for explicit ordering."

- **Remove `now` from `EventStatus` → `planned | done | skipped`.**
  - *Problem:* "now" is a function of the clock; storing it needs something to flip it and shows a stale "now" on an offline phone (fatal for a "what now" app).
  - *Solution:* compute the amber "now" client-side from `startsAt/endsAt` vs. the current time.
  - *Rationale:* no cron/race, no stale state, fewer pointless `Change` records.

- **Times are UTC instants (`startsAt/endsAt DateTime?`), displayed via `Trip.timezone`.**
  - *Rationale:* trivial countdown math, correct calendar push. Accepted limits (documented, not solved): one timezone per trip; editing `Trip.timezone` shifts existing events' wall-clock display.

- **`Event.endDate DATE?` for genuine multi-day *spans*.**
  - *Problem:* a multi-day wedding/festival isn't a point-in-time block and isn't a booking.
  - *Solution:* null (>99%) = single-day point-in-time block; non-null = ambient span rendered as a strip across `date..endDate`, like a hotel. Overnight/midnight-crossing blocks (23:00→06:00 flight) are **not** multi-day — one block whose `endsAt` lands next day.
  - *Rationale:* one nullable column vs. duplicating events per day (no umbrella entity) or a new entity. Unifies the render rule: *date-range → ambient strip; point-in-time → timeline block.*

- **Client-generated entity IDs** (client mints cuid/uuid; server validates format).
  - *Rationale:* deletes the offline temp-id→real-id swap, makes creates idempotent on retry (re-POST → unique violation → already-applied), lets undo-of-delete restore the exact row so references survive. Server still owns `seq`, `updatedAt`, authorization.

- **Uniform audit columns** (`createdAt/updatedAt/updatedBy`, `createdBy` FKs) on every member-mutable entity (Trip, Event, Booking, MaybeItem, Document, TripNote) — not just Event; LWW and the change-feed need them everywhere.

- **Drop `Booking.offlineAvailable`.** A whole trip is a few hundred small rows → the client mirrors all of it; per-row caching flags earn nothing.

- **Roles: `MembershipRole { admin, peer }`; creator = `admin`** (ADR-0005, revised).
  - *Solution:* creator's membership is `admin`, joiners `peer`. Structural from day one; **enforcement minimal/deferred** (v1 at most gates delete-trip / remove-member / revoke-invite). No "exactly one admin" constraint.
  - *Rationale:* never backfill "who's the admin" later. The full permission matrix is deferred (see Pending → T-018b).

- **Practical layer, minimal:** emergency numbers = static frontend data by country (no DB); budget = `Trip.currency String?` + `Trip.dailyBudgetMinor Int?` (display-only, ADR-0014); WiFi/notes = a small `TripNote` table. Overnight/multi-day bookings = one `Booking` with a date range. Dropped `MaybeItem.meta`; `Document` gains `mimeType`/`sizeBytes`. Booking-delete with a dependent hard event = `onDelete: SetNull` + API warn/confirm.

### Sync / consistency / offline (ADR-0019)

- **`Change.seq BigInt @default(autoincrement())` is the cursor** (not timestamps).
  - *Problem:* timestamp cursors are lossy on ms collisions (`>` drops, `>=` duplicates).
  - *Solution:* catch-up = `GET /changes?sinceSeq=<n>`; every WS `change` carries `seq`; client tracks `lastSeq` and, on a gap (`seq > lastSeq+1`) or reconnect (`hello.latestSeq > lastSeq`), runs catch-up. Represent `seq` as a string in JSON to avoid JS precision loss.
  - *Rationale:* gap-detection is what makes "WS receives / REST writes" safe against a dropped frame.

- **Atomic write via a single `ChangeService.mutate({...,apply})`.**
  - *Problem:* if the entity write and `Change` insert aren't atomic, a crash between them permanently desyncs every client.
  - *Solution:* `prisma.$transaction([ apply(tx), insertChange ])` (assigns `seq`), then broadcast **only after commit**. Domain services never write `Change` or touch the WS gateway directly.
  - *Rationale:* "logged exactly once, atomically" as a hard boundary, not a discipline.

- **`GET /trips/:id/snapshot`** — full current trip state + `latestSeq`, read in one transaction. The initial-load and deep-desync baseline (separate per-collection GETs give a torn snapshot with no coherent cursor).

- **Row-level, server-authoritative last-writer-wins.**
  - *Problem:* the original "field-level LWW with a single `updatedAt`" is unimplementable (field-level needs a per-field clock = a CRDT, rejected in ADR-0012).
  - *Solution:* server stamps `updatedAt = now()`; last commit wins the whole row. Concurrent different-field edits can clobber — change-feed shows both, either is undoable.
  - *Rationale:* matches ADR-0012's "awareness over locking". Upgrade path: a `version` column for optimistic concurrency — deferred.

- **Undo = a new inverse `Change`** (append-only, keeps `seq` monotonic); scope = **your own last action only**, client-local via the toast. No shared/global undo stack, no redo (Assaf: "maybe even forever"). Physical deletes; the `Change.before` snapshot is the recovery substrate.

- **Offline outbox = ordered FIFO**, flushed sequentially, halt-and-retry on first error. Client ids make retries idempotent and let an offline-created entity reference another immediately.

- **Ripple** stays a pure, suggestion-only computation that never crosses a hard anchor; applying it = normal move mutations the user confirms.

### Auth & sessions (ADR-0020)

- **Two-token session.** Access = 15-min stateless JWT (`sub`, `email`, `exp`; no authz claims), held **in memory** (never localStorage), sent as `Authorization: Bearer`. Refresh = opaque, stored **hashed** in a `Session` table, rotated on use, revocable (logout deletes the row).
  - *Rationale:* a pure stateless JWT can't be revoked; logout/Google-revocation require server-side session state.

- **Single-origin in production.** The backend host serves the static PWA on the **same origin** as the API; refresh token in an **httpOnly, Secure, SameSite=Lax** cookie; the WS upgrade carries it. **Not Vercel for the frontend** — its serverless layer can't proxy long-lived WebSockets.
  - *Rationale:* same-origin removes cross-origin cookie/CSRF machinery and makes WS auth clean. Rejected split hosting (Vercel + separate API).

- **Generalized identity seam `AuthIdentity`** (`userId, provider AuthProvider, providerAccountId, refreshTokenEnc?, scopes String[]`, `@@unique([provider, providerAccountId])`). `User` holds only the person (`id, email @unique, displayName, avatarColor`).
  - *Problem:* Assaf may add non-Google login later; `googleSub`-on-User + a Google-only token table would close that door.
  - *Solution:* `AuthIdentity` holds each provider identity **and** that provider's OAuth token/scopes. Adding email/password = a `passwordHash` + new `AuthProvider` value; no user migration. `User.email @unique` = account-linking key.
  - *Rationale:* same table count as the Google-specific design, strictly more flexible.

- **`CalendarEventLink` (`eventId × userId → googleCalendarEventId`, `@@unique([eventId,userId])`)** — per-member idempotency for one-way calendar push (ADR-0003).

- **Drop `Membership.googleConnected`** (always true once authenticated). Calendar capability derives from the Google `AuthIdentity.scopes`; `Membership.calendarSyncEnabled` stays (per-trip intent).

- **OAuth hardening:** `state` + PKCE + `access_type=offline` (+ `prompt=consent` when a refresh token is missing). **Encryption:** shared AES-256-GCM util for docs + tokens, with a **separate `TOKEN_ENCRYPTION_KEY`** from `DOC_ENCRYPTION_KEY`. Refresh-token **reuse-detection** deferred.

### Multi-trip (ADR-0021)

- **A user can belong to many trips — already modeled** (the `Membership` join; `GET /trips` + `/me` are already multi-trip; nothing backend assumes a single trip). **No schema change.**
- New work is **client-side:** an **active-trip** selection (`tripId` in `localStorage`, per-device, not synced — same class as the mode override); a **minimal trip switcher** as the entry point (navigation between trip instances — not an ADR-0004 violation); **mode derivation generalized** (default active trip = current in-progress → nearest upcoming → most recent; each trip's mode derived independently).
- **Deferred:** overlapping in-progress trips (default last-opened + manual switch).

### Module boundaries & tooling (CP4)

- **Module map:** Auth (JwtAuthGuard global + `@Public` + MembershipGuard), Trips (+ practical/TripNote/budget), Events (+ hard-event guard, ripple, maybe-shelf), Bookings, Documents, Calendar; infra: PrismaModule (global), CryptoModule (AES-256-GCM), **SyncModule** (`ChangeService` + WS gateway + snapshot/changes).
- **`ChangeService.mutate()` is the only mutation path** (the atomic write choke point). Prerequisite for the first CRUD module — so the sync core is built *before* CRUD, not after.
- **Validation = a ~15-line `ZodValidationPipe`** over `packages/shared` schemas — **not** class-validator/DTOs (keeps shared the single source of truth).
- **`NodeNext` validated:** `nest build` emits CommonJS (no `type:module`), which the Nest runtime needs. **Guardrail: never add `"type":"module"` to `backend/package.json`.**
- **Tests: Vitest everywhere** (not Jest). **ESLint** flat config to be wired (currently claimed but a silent no-op).
- **Dependency stack (current, validated green):** NestJS 11, Prisma 7 + `@prisma/adapter-pg` driver adapter (URL in `prisma.config.ts`), zod 4, React 19, Vite 8, Node 22+. Prisma 7 migration already applied by Assaf.

---

## 2. Pending Tasks

The gitignored task board is authoritative; this is the cold-start summary. Critical path:

```
T-026 (apply data model: schema + migration + shared types)  ← FIRST; gates all backend build
  ├─ T-007 (auth: AuthIdentity/Session, single-origin cookies, PKCE)
  │    └─ T-029 (Sync core: ChangeService + WS gateway + snapshot/changes)  ← before CRUD
  │         └─ T-009 (trips) → T-010 (events, date-based) / T-011 (bookings, documents)
  ├─ T-008 (Home/Day, active-trip aware) → T-027 (trip switcher) → T-014 (wire API) → T-013 (offline)
  └─ T-019 (mode switch, per active trip)

Parallel/ungated: T-028 (ESLint + Vitest) · T-018 (Plan mode, in review) · T-002 (Map/Index design)
Prereq: T-016 (Google Cloud OAuth/Maps) before T-007 real login
```

- **T-026** is the immediate next step: apply the schema above + migration + `packages/shared` sync; flip `data-model.md` from "target" to "current".
- **T-012** (old "realtime last") folded into **T-029** (sync core pulled ahead).
- **T-018b (deferred, agreed):** define the admin↔peer permission matrix — its own future roles ADR. Also covers "what happens when a trip's sole admin leaves?"

---

## 3. Core Principles (established / reaffirmed)

1. **Derived, not stored** — day (→ date), "now" (→ clock), Plan/Trip mode (→ dates), active-trip default (→ dates). Don't persist what the clock or the data already implies.
2. **One atomic mutation path** — every shared-state write goes through `ChangeService.mutate()`: entity + `Change` in one transaction, broadcast post-commit. Never hand-rolled.
3. **`packages/shared` is the single source of truth for shapes** — validate with a `ZodValidationPipe`, never redefine entities as DTOs; keep it in lockstep with `schema.prisma`.
4. **Client-generated ids** — the client owns entity identity; the server owns `seq`, timestamps, and authorization.
5. **Single-origin** — the backend serves the PWA; same-origin cookies + WS. No Vercel for the frontend.
6. **Cursor on `seq`, never on time** — for catch-up, gap-detection, and ordering.
7. **Render rule** — anything with a date range (hotel booking, `Event.endDate`) → ambient strip; point-in-time → timeline block.
8. **Mirror the whole trip offline** — it's small; no per-row caching flags.
9. **Keep future doors open cheaply, don't build through them** — `AuthIdentity` (multi-provider), `role` (future RBAC), `source`/`placeId` separable (future enrichment). Each deferral is recorded with its upgrade path, not silently dropped.
10. **Document-everything (ADR-0001) + repo/private split (ADR-0010)** — decisions become ADRs; committed files never reference the private `_internal/` area.
