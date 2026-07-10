# Deployment & Hosting

**Status:** DRAFT (direction + open questions; nothing chosen/executed yet — see T-021). Constraint: cheap and simple for a private ~5-user tool; not built for scale.

## Version control

- **GitHub, private repo.** `.env` and local-only private files are gitignored, so the repo is safe to host. See T-020.
- Default branch `main`; branch-per-task (`t-NNN-…`); Conventional Commits (conventions.md).

## Topology direction — **single-origin** (T-025 / ADR-0020; ratified in T-021)

The T-025 auth review settled the *direction*: **the backend host serves the static PWA on the same origin as the API** (single-origin), so the refresh cookie is same-origin and the WebSocket upgrade carries it cleanly. **The frontend is not deployed to Vercel** — its serverless layer can't proxy long-lived WebSockets, which our realtime channel needs.

```
GitHub (private)
   │  push / PR
   ▼
CI (GitHub Actions): typecheck + build + lint + test on PR; deploy on main
   │
   ├─ ONE service (NestJS) → Fly.io / Railway / Render (container)
   │     • serves the built PWA (static) AND the API + WS on one origin
   ├─ worker (v1.1)   → same host as backend
   ├─ Postgres        → managed (Neon / Railway / Render)
   ├─ Redis (v1.1)    → managed (Upstash / host add-on)
   └─ object storage  → S3-compatible (Cloudflare R2 / AWS S3) for encrypted documents
```

## What each environment needs

- **Env/secrets** set in the host's dashboard (never in the repo): `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (prod URL), `DOC_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY`, `REDIS_URL`, `VITE_GOOGLE_MAPS_API_KEY`. (`VITE_API_BASE_URL` is same-origin in prod, so it may be empty/relative.)
- **Google Cloud:** add the production OAuth redirect URI and Maps key referrer/restrictions (prerequisites-checklist.md).
- **Migrations on deploy:** run `prisma migrate deploy` as a release step before the API starts.

## Open questions 🔶 (resolve in T-021)

1. Backend host: Fly.io vs. Railway vs. Render — pick one (cost, DX, container + WebSocket support).
2. Postgres host: bundle with the backend host, or Neon (serverless) separately?
3. ~~Frontend host~~ — resolved: single-origin, the backend serves the PWA (ADR-0020). No separate frontend host.
4. Custom domain? (or default host subdomains for a private tool).
5. Single "prod" environment, or also a "staging"? (Probably just prod for v1.)
6. Secrets management beyond host env vars (fine for now)?

## Non-goals for v1

Autoscaling, multi-region, blue/green, IaC. A single small prod environment is enough.
