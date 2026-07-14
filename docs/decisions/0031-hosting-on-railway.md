# 0031 — Hosting: Railway, one project for everything

**Status:** Accepted
**Date:** 2026-07-14
**Builds on:** [0020](0020-auth-session-architecture.md) (single-origin production), [0008](0008-backend-supabase.md) (self-owned Node service), [0015](0015-document-encryption-server-side.md) (S3-compatible document storage)

## Context

[deployment.md](../architecture/deployment.md) carried T-021's open questions: which host runs the container, and where Postgres lives. ADR-0020 already fixed the shape — **one origin** serving the PWA, the API, and the WebSocket upgrade, which means a long-lived container, not serverless. The 2026 free-tier landscape made "free" a false economy: Fly.io and Koyeb discontinued their free tiers, Railway's free plan is a one-time trial, and Render's free web service cold-starts for 30–60 s after 15 min idle — poison for an on-the-ground "what's next in 30 minutes" tool — while its free Postgres is deleted after 30 days. A small monthly spend is acceptable; juggling three vendors to stay at $0 is not.

## Decision

**Railway, Hobby plan (~$5–8/month all-in), one project holding everything:**

- **One service** built from the root `Dockerfile`, serving API + WS + the built PWA on a single origin (ADR-0020). GitHub auto-deploy from `main`; `railway.json` is the config-as-code (Dockerfile builder, `/health` healthcheck, pre-deploy `prisma migrate deploy`).
- **Railway Postgres** in the same project, wired via a private-network reference variable — never a public connection string.
- **Redis is not provisioned** until v1.1 actually lands BullMQ (tech-stack.md) — an idle Redis is pure cost.
- **Documents (later):** Railway Storage Buckets — S3-compatible, $0.015/GB-month, free egress — coded against the **generic S3 API** (any S3 client), never a Railway-specific SDK, so the bucket stays swappable (R2/S3).

## Consequences

- deployment.md graduates from DRAFT direction to the **runbook** (env vars, Google OAuth production redirect, verify checklist); its T-021 open questions close.
- The backend serves the PWA from `<dist>/../public` — a directory that only exists in the production image, so dev (`:5173` → `:3000`) is untouched. The SPA fallback is a `@Catch(NotFoundException)` filter serving `index.html` only to browser navigations no controller matched — API routes (present and future) are excluded by construction, not by a maintained prefix list.
- `prisma` and `dotenv` move to backend **`dependencies`**: the pruned production image must carry the Prisma CLI for the pre-deploy migration step.
- Scale path stays inside Railway: Hobby → Pro (bigger/multiple replicas, HA Postgres template). **Before running 2+ replicas**, WS fan-out must leave process memory (Postgres `LISTEN/NOTIFY` or Redis pub/sub) — already flagged in tech-stack.md.
- Exit cost stays near zero: vanilla Postgres, generic S3, a plain Docker image — Railway is where things run, not what we build against.

## Alternatives considered

- **Render, all paid** (~$13/mo: $7 service + $6 Postgres): comparable DX and GitHub deploys, but no object storage (persistent disks only, $0.25/GB and filesystem-shaped — wrong shape for ADR-0015) and pricier at every step.
- **Free split stack** (Vercel FE + Render free BE + Neon + Upstash): $0, but splits origins — contradicting ADR-0020 (cookies, WS proxy) — and reintroduces cold starts; explicitly rejected in ADR-0020 already.
- **Fly.io / Koyeb:** free tiers gone (2025–26); Fly's Postgres is unmanaged-by-default.
- **Oracle Cloud Always Free VPS:** the most generous free compute, but all ops (TLS, backups, patching) land on us — wrong trade for a 5-user tool.
