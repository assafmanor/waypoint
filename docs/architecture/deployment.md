# Deployment & Hosting

**Status:** DRAFT (direction + open questions; nothing chosen/executed yet — see T-021). Constraint: cheap and simple for a private ~5-user tool; not built for scale.

## Version control

- **GitHub, private repo.** `.env` and local-only private files are gitignored, so the repo is safe to host. See T-020.
- Default branch `main`; branch-per-task (`t-NNN-…`); Conventional Commits (conventions.md).

## Proposed topology (to be ratified in T-021)

```
GitHub (private)
   │  push / PR
   ▼
CI (GitHub Actions): typecheck + build + lint on PR; deploy on main
   │
   ├─ frontend (PWA)  → Vercel or Netlify (static + edge)
   ├─ backend (NestJS) → Fly.io / Railway / Render (container)
   ├─ worker (v1.1)   → same host as backend
   ├─ Postgres        → managed (Neon / Railway / Render)
   ├─ Redis (v1.1)    → managed (Upstash / host add-on)
   └─ object storage  → S3-compatible (Cloudflare R2 / AWS S3) for encrypted documents
```

## What each environment needs

- **Env/secrets** set in each host's dashboard (never in the repo): `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (prod URL), `DOC_ENCRYPTION_KEY`, `REDIS_URL`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_API_BASE_URL`.
- **Google Cloud:** add the production OAuth redirect URI and Maps key referrer/restrictions (prerequisites-checklist.md).
- **Migrations on deploy:** run `prisma migrate deploy` as a release step before the API starts.

## Open questions 🔶 (resolve in T-021)

1. Backend host: Fly.io vs. Railway vs. Render — pick one (cost, DX, container support).
2. Postgres host: bundle with the backend host, or Neon (serverless) separately?
3. Frontend: Vercel vs. Netlify (either is fine; Vercel if we later want edge functions).
4. Custom domain? (or default host subdomains for a private tool).
5. Single "prod" environment, or also a "staging"? (Probably just prod for v1.)
6. Secrets management beyond host env vars (fine for now)?

## Non-goals for v1

Autoscaling, multi-region, blue/green, IaC. A single small prod environment is enough.
