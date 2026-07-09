# Technology Stack

**Status:** ACCEPTED (core choices ratified 2026-07-09). Optimized for: a self-owned traditional backend, **TypeScript end-to-end** (shared types), small group, real collaboration, offline reads; not built for scale but Postgres-clean so it can scale later.

## The stack

| Layer | Choice | Why |
|---|---|---|
| **Repo shape** | **TS monorepo** (pnpm workspaces / Turborepo): `frontend/`, `backend/`, `packages/shared/` | Share types + zod schemas between client and server with zero codegen |
| **Client** | **React + Vite + TypeScript**, installable **PWA** | Matches the mockup; PWA = install + offline, no app store (ADR-0007) |
| **Client styling** | Hand-rolled CSS design system from the mockup (Tailwind optional later) | Design language already lives as CSS variables |
| **Offline store** | **IndexedDB** via **Dexie** + service worker (Workbox) | True offline reads for index/documents/today; queue writes |
| **Backend** | **Node + TypeScript, NestJS** (Fastify = lighter alt 🔶) | Traditional self-owned service, structured/modular (ADR-0008) |
| **ORM / migrations** | **Prisma** (Drizzle = SQL-first alt 🔶) | Type-safe models + migrations |
| **DB** | **Postgres** | Relational model in data-model.md |
| **Validation** | **zod**, shared via `packages/shared` | One schema validates on client and server |
| **Auth** | **Google OAuth** (Passport / Auth.js) → own JWT; **Google-only** | Everyone has Google; unlocks Maps/Calendar/Gmail scopes (ADR-0013) |
| **Realtime** | **WebSockets** (NestJS gateway / `ws`) + in-process per-trip channels | Simple fan-out for ~5 users; `LISTEN/NOTIFY` if we scale out |
| **File storage** | S3-compatible bucket (disk in dev); **server-side encryption at rest** | Encrypted documents (ADR-0015) |
| **Background jobs** | v1.1 only (Gmail import): BullMQ (Redis) or scheduled worker | Minimal until import lands |
| **Hosting** | Client on Vercel/Netlify; API + worker on a small VPS / Fly / Railway / Render; managed Postgres | Cheap/simple for a private tool |

### Why TypeScript everywhere
Chosen for **natively shared types and validation** between client and server — define an entity/zod schema once in `packages/shared` and both ends use it, no OpenAPI codegen. One language, one toolchain. (Python/FastAPI was the runner-up; it lost the type-sharing edge — ADR-0008.)

## External integrations

| Integration | API | v1? |
|---|---|---|
| Maps / places / nav | Google Maps Platform (Maps, Places, deep-links) | **v1** |
| Calendar push (one-way) | Google Calendar API | **v1 (Should)** |
| Currency / weather | A rates API + a weather API | **v1 (Should)** |
| Booking import ("TripIt magic") | Gmail API + a TS parsing layer | **v1.1** (deferred) |
| Flight status | A flight-status provider | v1.1 |

See [integrations/overview.md](../integrations/overview.md).

## Cross-cutting

- **Shared types:** entities + zod schemas in `packages/shared`, imported by client and backend.
- **Env & secrets:** `.env` (gitignored); notes about which keys exist live in a password manager or private local notes (kept out of the repo) — never real secrets in the repo. Document-encryption keys managed via env/secret store (ADR-0015).

## Decisions ratified 2026-07-09

- ✅ PWA (ADR-0007)
- ✅ Self-owned traditional backend, **Node/TypeScript / NestJS** (ADR-0008)
- ✅ Google-only auth (ADR-0013)
- ✅ Gmail import deferred to v1.1
- ✅ Budget display-only (ADR-0014)
- ✅ Document encryption server-side at rest (ADR-0015)
- ✅ Own-device location in v1; member sharing deferred (ADR-0006)

## Minor choices left to confirm 🔶

- NestJS vs. Fastify.
- Prisma vs. Drizzle.
- Monorepo tool: pnpm workspaces vs. Turborepo.

_(All non-blocking — reasonable defaults chosen above.)_
