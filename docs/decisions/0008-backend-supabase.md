# 0008 — Backend: traditional self-owned Node/TypeScript service

**Status:** Accepted
**Date:** 2026-07-09
**History:** first proposed as Supabase (rejected — owner wants a self-owned backend); then Python/FastAPI; **finalized as Node/TypeScript** so the stack is TypeScript end-to-end.

## Context
The owner wants a **traditional, self-owned backend** (not a BaaS) and, after weighing it, chose **TypeScript everywhere**. The decisive benefit of TS on both ends is **natively shared types and validation** between client and server — no OpenAPI codegen step, one language, one toolchain.

## Decision
Build a **traditional Node + TypeScript backend**:
- **Framework:** **NestJS** (structured, modular, DI — a "real backend framework" feel). *Fastify is the lighter alternative if NestJS feels heavy — confirmable.*
- **DB:** **Postgres**.
- **ORM / migrations:** **Prisma** (type-safe, great migrations). *Drizzle is the SQL-first alternative if more raw-SQL control is wanted — confirmable.*
- **Validation:** **zod** schemas, shared with the frontend via a `packages/shared` workspace.
- **Auth:** Google OAuth (Passport / Auth.js) → our own JWT session. Google-only (ADR-0013).
- **Realtime:** WebSockets (NestJS gateway / `ws`) with an in-process per-trip channel manager; Postgres `LISTEN/NOTIFY` if we ever scale out.
- **File storage:** S3-compatible bucket (disk in dev).
- **Background jobs (v1.1, Gmail import):** BullMQ (Redis) or a scheduled worker — minimal until needed.

**Repo shape:** a TypeScript **monorepo** (pnpm workspaces / Turborepo) with `frontend/`, `backend/`, and `packages/shared/` (types + zod schemas used by both).

## Consequences
- One language, shared types/validation with zero codegen — the main reason for the switch.
- Full control and no lock-in (standard Postgres + OAuth).
- We own auth, realtime, and storage (more code than a BaaS, deliberately).
- Gmail parsing (v1.1) will be done in TS rather than Python — acceptable; libraries exist.

## Alternatives considered
- **Python/FastAPI:** owner's familiarity, great for parsing, but loses native type-sharing (needs OpenAPI→TS codegen). Superseded by the TS-everywhere choice.
- **Supabase / BaaS:** rejected — owner prefers a self-owned backend.
