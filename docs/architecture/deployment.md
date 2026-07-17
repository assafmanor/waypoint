# Deployment & Hosting

**Status:** ACCEPTED ([ADR-0031](../decisions/0031-hosting-on-railway.md), 2026-07-14). Host: **Railway**, one project for everything. Constraint unchanged: cheap and simple for a private ~5-user tool; portable by construction (vanilla Postgres, generic S3, plain Docker).

## Version control

- **GitHub, private repo.** `.env` and local-only private files are gitignored (`.env.example` is the committed template). See T-020.
- Default branch `main`; branch-per-task (`t-NNN-…`); Conventional Commits (conventions.md).

## Topology — single-origin on Railway (ADR-0020 + ADR-0031)

One Railway project holds everything. The backend container serves the built PWA, the API, and the WebSocket upgrade on **one origin**, so the refresh cookie and WS auth stay same-origin (ADR-0020).

```
GitHub main ──auto-deploy──▶ Railway project
                              ├─ waypoint service (root Dockerfile)
                              │    • NestJS API + WS  +  static PWA (one origin)
                              │    • pre-deploy: npx prisma migrate deploy
                              │    • healthcheck: GET /health
                              ├─ Postgres (Railway plugin, private network)
                              ├─ Redis          — NOT provisioned until v1.1 (BullMQ)
                              └─ Storage Bucket — NOT provisioned until documents land
                                                  (S3-compatible; code against generic S3 API)
```

The pieces in the repo:

| File                  | Role                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile` (root)   | Multi-stage build: pnpm workspace → `pnpm deploy --prod` prune → runtime with `dist/`, `public/` (PWA), prisma CLI                                                                                               |
| `railway.json`        | Config-as-code: Dockerfile builder, `/health` healthcheck, `preDeployCommand: npx prisma migrate deploy`                                                                                                         |
| `backend/src/main.ts` | Serves `<dist>/../public` when it exists (production image only); `SpaFallbackFilter` turns router 404s on browser navigations into the PWA — API routes are excluded by construction, no route list to maintain |

## Environment variables (set in the Railway service, never in the repo)

| Var                                         | Value / how to generate                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                              | Reference variable `${{Postgres.DATABASE_URL}}` (private network)                          |
| `JWT_SECRET`                                | `openssl rand -base64 32` — store in the password manager                                  |
| `TOKEN_ENCRYPTION_KEY`                      | `openssl rand -base64 32` — **must decode to exactly 32 bytes** (AES-256-GCM, crypto.util) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the Google Cloud OAuth client (prerequisites-checklist.md)                            |
| `GOOGLE_OAUTH_REDIRECT_URI`                 | `https://<domain>/auth/google/callback`                                                    |
| `DOC_ENCRYPTION_KEY`                        | Documents at rest (ADR-0015). `openssl rand -base64 32` — must decode to exactly 32 bytes  |
| `S3_ENDPOINT`                               | Railway Storage Bucket endpoint URL (S3-compatible, ADR-0031)                              |
| `S3_BUCKET`                                 | Railway Storage Bucket name                                                                |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Railway Storage Bucket credentials                                                         |

**Never set in production:** `DEV_AUTH` (auth bypass) and `FRONTEND_URL` (dev-only CORS; prod is single-origin). `VITE_API_BASE_URL` stays unset — the client defaults to same-origin. Later additions when their features land: `REDIS_URL` (v1.1), `VITE_GOOGLE_MAPS_API_KEY` (build-time arg).

## One-time setup runbook

1. **Railway**: sign up (GitHub login), **Hobby plan**; optionally set a workspace usage limit (e.g. $10/mo) as a cost guardrail.
2. **Project**: "Deploy from GitHub repo" → this repo, branch `main`, region EU-West. `railway.json` supplies builder/healthcheck; **verify the pre-deploy command** appears in service → Settings → Deploy (set it manually if config-as-code didn't apply): `npx prisma migrate deploy`.
3. **Postgres**: `+ New → Database → PostgreSQL` in the same project.
4. **Env vars**: set the table above on the service (`DATABASE_URL` via the reference picker).
5. **Domain**: service → Settings → Networking → Generate Domain; then fill `GOOGLE_OAUTH_REDIRECT_URI` with it.
6. **Google Cloud Console** (APIs & Services → Credentials → the OAuth client): add `https://<domain>` to Authorized JavaScript origins and `https://<domain>/auth/google/callback` to Authorized redirect URIs. If the consent screen is in _Testing_ mode, add each member's Gmail as a test user.
7. **Deploy & verify** (below).

## Verify after any deploy

- `GET /health` → 200, `GET /api/docs` renders (Swagger).
- App loads at `/`, Google login round-trips, a deep link (`/join/xyz`) serves the PWA, an unknown API path (`/trips/nope`) returns JSON — not HTML.
- Realtime: a change made on one device appears live on another (WS carries the cookie same-origin).
- Documents: upload a file and re-open it. The `S3_*` vars are **required in production** — with them unset the backend refuses the dev-only local-disk fallback and fails loud (`S3_BUCKET not configured`) rather than silently writing to the ephemeral container filesystem and losing every blob on the next redeploy (storage.ts).
- Note: the API connects to Postgres at boot (`PrismaService.onModuleInit`) — the healthcheck failing right after a deploy usually means `DATABASE_URL` is wrong/missing, not app breakage.

## Migrations

`npx prisma migrate deploy` runs as Railway's **pre-deploy command** — in the new image, before it replaces the running one. This is why `prisma` (CLI) and `dotenv` are production `dependencies` of the backend, not dev-only.

## Local production parity

```bash
docker build -t waypoint .
docker run --rm -p 3000:3000 -e DATABASE_URL=… -e JWT_SECRET=… -e TOKEN_ENCRYPTION_KEY=… \
  -e GOOGLE_CLIENT_ID=… -e GOOGLE_CLIENT_SECRET=… -e GOOGLE_OAUTH_REDIRECT_URI=… waypoint
```

Serves the full single-origin app (PWA + API + WS) on `:3000` — the same image Railway runs.

## Still open (deliberately)

1. Custom domain (default `*.up.railway.app` subdomain is fine for a private tool).
2. Staging environment — skipped for v1; Railway PR environments can cover it later.
3. CI on PRs (typecheck/build/test via GitHub Actions) — worth adding; deploys don't depend on it.

## Non-goals for v1

Autoscaling, multi-region, blue/green, IaC beyond `railway.json`. Scale path and the exit story live in [ADR-0031](../decisions/0031-hosting-on-railway.md).
