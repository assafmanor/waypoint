# Session 05 — Hosting decision + deployment scaffolding (2026-07-14)

**Outcome:** T-021's hosting questions resolved → [ADR-0031](../decisions/0031-hosting-on-railway.md) (Railway, one project); [deployment.md](../architecture/deployment.md) rewritten as the runbook; deployment scaffolding landed.

## What was decided

- Surveyed the 2026 landscape: Fly.io/Koyeb free tiers gone, Railway free is trial-only, Render free cold-starts and its free Postgres expires after 30 days. Free tiers now require a multi-vendor split (Vercel + Render + Neon + Upstash) that contradicts single-origin (ADR-0020).
- **Railway Hobby (~$5–8/mo)**: one project = Dockerfile service (PWA + API + WS, one origin) + Postgres; GitHub auto-deploy from `main`. Redis deferred to v1.1; documents later on Railway Storage Buckets via the generic S3 API. Full rationale + alternatives in ADR-0031.

## What landed in the repo

- Root `Dockerfile` (multi-stage pnpm build → pruned runtime with prisma CLI), `.dockerignore`, `railway.json` (Dockerfile builder, `/health` healthcheck, pre-deploy `npx prisma migrate deploy`).
- Backend serves the built PWA when `<dist>/../public` exists; `SpaFallbackFilter` (`@Catch(NotFoundException)`) deep-links client routes without a maintained route list. Dev is untouched.
- `prisma` + `dotenv` became production `dependencies` (migrations run from the shipped image).
- Root `.env.example` added (was referenced by CLAUDE.md but missing); backend + prisma config now also read the repo-root `.env`.

## Verified

- `pnpm typecheck` / `build` / `lint` / `test` green (frontend 105, backend 54 with compose Postgres + seed).
- Production image built and smoke-tested end-to-end: `/health` 200, PWA served at `/`, deep links (`/join/xyz`, `/trip/abc/settings`) serve the app, unknown API paths stay JSON, `/api/docs` up, assets 200, `npx prisma migrate deploy` works inside the image.

## Left for the human (runbook in deployment.md)

Railway project creation + Postgres, env vars, domain, Google OAuth redirect URI update, first deploy verification.
