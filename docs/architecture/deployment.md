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

| Var                                         | Value / how to generate                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Reference variable `${{Postgres.DATABASE_URL}}` (private network)                                              |
| `JWT_SECRET`                                | `openssl rand -base64 32` — store in the password manager                                                      |
| `TOKEN_ENCRYPTION_KEY`                      | `openssl rand -base64 32` — **must decode to exactly 32 bytes** (AES-256-GCM, crypto.util)                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the Google Cloud OAuth client (prerequisites-checklist.md)                                                |
| `GOOGLE_OAUTH_REDIRECT_URI`                 | `https://<domain>/auth/google/callback` — only controls where **Google** calls back to                         |
| `FRONTEND_URL`                              | `https://<domain>` (the environment's own origin). **Required in every deployed environment** — see note below |
| `DOC_ENCRYPTION_KEY`                        | Documents at rest (ADR-0015). `openssl rand -base64 32` — must decode to exactly 32 bytes                      |
| `S3_ENDPOINT`                               | Railway Storage Bucket endpoint URL (S3-compatible, ADR-0031)                                                  |
| `S3_BUCKET`                                 | Railway Storage Bucket name                                                                                    |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Railway Storage Bucket credentials                                                                             |
| `DOC_CACHE_DIR` _(optional)_                | Local-FS blob-cache tier path (ADR-0055). Unset → memory-only; a lost dir on redeploy just re-warms from S3    |
| `DOC_CACHE_MAX_BYTES` _(optional)_          | In-memory LRU bound in bytes (ADR-0055). Unset → 64 MB default                                                 |
| `DOC_CACHE_DISABLED` _(optional)_           | Any truthy value turns the blob cache off entirely (kill switch, ADR-0055)                                     |

**Never set in production:** `DEV_AUTH` (auth bypass). `VITE_API_BASE_URL` stays unset — the client defaults to same-origin. Later additions when their features land: `REDIS_URL` (v1.1) and `VITE_GOOGLE_MAPS_API_KEY` (build-time arg).

**`FRONTEND_URL` is not dev-only, despite the name.** It doubles as the dev `:5173`→`:3000` CORS origin locally, but `AuthController`'s Google callback (`res.redirect(frontendUrl())`, `auth.controller.ts`) also uses it as the **post-login redirect target** in every environment, with a hardcoded fallback of `http://localhost:5173` when unset. A deployed environment without `FRONTEND_URL` set doesn't fail loud — Google auth completes, then silently redirects the browser to `localhost`. Set it to the environment's own origin (production's own domain, staging's own domain) everywhere, single-origin topology notwithstanding.

**Never copy these verbatim into staging (ADR-0104):** `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DOC_ENCRYPTION_KEY` need their own freshly-generated values; `DATABASE_URL` must be a reference variable resolving to staging's own Postgres, never production's connection string; `S3_*` should point at a separate staging bucket; `GOOGLE_OAUTH_REDIRECT_URI` and `FRONTEND_URL` both need staging's own domain, not production's. See the staging section below — and note that Railway's **reference-variable syntax matters**: a variable like `${{<uuid>.VAR}}` (ID-pinned) keeps pointing at that exact resource regardless of environment, while `${{ServiceName.VAR}}` (name-based) resolves against whichever resource has that name _in the current environment_ — only the latter survives being duplicated into a new environment correctly.

**Document blob cache (ADR-0055).** A read-through, **ciphertext-only** cache below `getObject` (`backend/src/documents/blob-cache.ts`): an in-memory LRU (`DOC_CACHE_MAX_BYTES`, default 64 MB) plus an optional local-FS tier (`DOC_CACHE_DIR`). Keyed by the immutable `fileRef`, so it needs eviction on delete/replace only, never content invalidation. All three vars are optional — unconfigured, the cache runs memory-only and nothing breaks. Both tiers hold exactly the bytes S3 holds (ciphertext), so the operator trust boundary (ADR-0034) is unchanged, and the FS tier is a cache, never a source of truth — the ephemeral filesystem (below) is fine for it, a miss just falls through to S3. `DOC_CACHE_DISABLED` is the kill switch. The client mirrors this with a Cache-API blob cache (`frontend/src/lib/doc-cache.ts`) so repeat and offline opens skip the network.

## One-time setup runbook

1. **Railway**: sign up (GitHub login), **Hobby plan**; optionally set a workspace usage limit (e.g. $10/mo) as a cost guardrail.
2. **Project**: "Deploy from GitHub repo" → this repo, branch `main`, region EU-West. `railway.json` supplies builder/healthcheck; **verify the pre-deploy command** appears in service → Settings → Deploy (set it manually if config-as-code didn't apply): `npx prisma migrate deploy`.
3. **Postgres**: `+ New → Database → PostgreSQL` in the same project.
4. **Env vars**: set the table above on the service (`DATABASE_URL` via the reference picker).
5. **Domain**: service → Settings → Networking → Generate Domain; then fill `GOOGLE_OAUTH_REDIRECT_URI` **and** `FRONTEND_URL` with it (both, not just the redirect URI — see the `FRONTEND_URL` note above).
6. **Google Cloud Console** (APIs & Services → Credentials → the OAuth client): add `https://<domain>` to Authorized JavaScript origins and `https://<domain>/auth/google/callback` to Authorized redirect URIs. If the consent screen is in _Testing_ mode, add each member's Gmail as a test user.
7. **Deploy & verify** (below).

## Verify after any deploy

- `GET /health` → 200, `GET /api/docs` renders (Swagger).
- App loads at `/`, Google login round-trips, a deep link (`/join/xyz`) serves the PWA, an unknown API path (`/trips/nope`) returns JSON — not HTML.
- Realtime: a change made on one device appears live on another (WS carries the cookie same-origin).
- Documents: upload a file and re-open it. The `S3_*` vars are **required in production** — with them unset the backend refuses the dev-only local-disk fallback and fails loud (`S3_BUCKET not configured`) rather than silently writing to the ephemeral container filesystem and losing every blob on the next redeploy (storage.ts).
- Note: the API connects to Postgres at boot (`PrismaService.onModuleInit`) — the healthcheck failing right after a deploy usually means `DATABASE_URL` is wrong/missing, not app breakage.

## Staging environment (ADR-0104)

A second **environment** inside the same Railway project (not a second project, per ADR-0031) — its own service instance (same Dockerfile/`railway.json`), its own Postgres, and its own Storage Bucket. Deploys come from a persistent `staging` git branch, gated by CI rather than fired directly by Railway's git webhook:

```
GitHub staging branch ──push──▶ .github/workflows/deploy-staging.yml
                                  ├─ calls ci.yml's jobs (typecheck/build/test/lint/e2e)
                                  └─ on green: `railway up` (Railway CLI) ──▶ Railway "staging" environment
                                                                              ├─ waypoint service (staging)
                                                                              └─ Postgres (staging, separate from prod)
```

**Standard procedure for using it:** most changes ship the normal way — task branch → PR → `main` — without ever touching staging. Reach for staging when a change is risky or hard to fully verify locally (auth flow changes, anything you want to see live against real Google OAuth and a real deployed build): push the task branch to `staging` (or open a PR into it) first, verify it live, then open the normal PR into `main`. Staging's database is disposable — treat it as a scratch testing lane, not a durable environment; it can be wiped and reset without ceremony.

**Syncing `staging` with `main`.** `staging` is kept as "`main` plus at most one active experiment," not a persistent ahead-of-main integration branch — this repo ships PR-per-task straight to `main`, and staging stays a lightweight, disposable add-on to that rather than a second gate everything queues through:

- **Idle (not testing anything):** `staging` == `main`, exactly.
- **Starting a test:** confirm staging is at `main`'s tip (run the reset below if unsure), then push/merge the task branch onto `staging`.
- **After the test** (merged to `main` or abandoned, either way): reset `staging` back to `main`'s tip. If the change merged first, staging naturally picks it up; if abandoned, the experimental commits just disappear from staging.

The reset is a manual **`Reset Staging to Main`** GitHub Action (`.github/workflows/reset-staging.yml`, `workflow_dispatch` — Actions tab → select it → **Run workflow**, works from the GitHub mobile UI too, no local git needed). It force-points `staging` at whatever `main` currently is. This doesn't support two people testing unrelated changes on staging at once — they'd clobber each other — which is fine at the current team size and worth revisiting only if that stops being true.

**One-time setup that actually worked (human, Railway + GitHub dashboards):**

Railway's **Duplicate Environment** (environment dropdown → New Environment → duplicate from `production`) is the right starting point — it forks `waypoint` and `Postgres` as their own per-environment deployments automatically. It does **not**, however, fork every resource, and it copies every variable's **literal value**, including ones that must differ. After duplicating:

1. **Audit every variable it copied** — don't assume anything is correctly scoped just because duplication ran. Concretely:
   - `DATABASE_URL`: confirm it's a reference (`${{Postgres.DATABASE_URL}}` or `${{<postgres-service-id>.DATABASE_URL}}`) rather than a literal connection string. Postgres gets its own per-environment deployment/volume even under a shared service ID, so either reference form actually resolves correctly per-environment here — a literal copy of the connection string is the only broken case (production's stale password won't match staging's Postgres).
   - `S3_*`: duplication does **not** fork a new Storage Bucket — staging will still reference production's literal bucket ID. This is a real risk, not cosmetic (staging's DB is a clone of production's data, so document rows reference _real_ file keys in that bucket — a test delete/replace in staging can destroy a real production file). Add a **new, separate** Storage Bucket resource in the staging environment and repoint all five `S3_*` vars at it before doing anything with documents in staging.
   - `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DOC_ENCRYPTION_KEY`: regenerate all three (`openssl rand -base64 32` each) — these are always literal values, always copied verbatim, always wrong to share with production.
   - `GOOGLE_OAUTH_REDIRECT_URI` **and** `FRONTEND_URL`: both need staging's own domain. Missing the `FRONTEND_URL` fix specifically produces a confusing symptom — the Google consent screen correctly shows the staging domain (that's driven by `GOOGLE_OAUTH_REDIRECT_URI`), but after completing login the browser still lands on **production** (see the `FRONTEND_URL` note above — it's a separate variable governing the post-callback redirect, easy to miss).
2. Staging service → Settings → **Source**: point it at the `staging` branch (not whatever branch it inherited from duplication), then turn **off** its git auto-deploy trigger — deploys come from `deploy-staging.yml`, not the webhook, so a red test run never reaches staging.
3. Google Cloud Console: add the staging domain to Authorized JavaScript origins and `https://<staging-domain>/auth/google/callback` to Authorized redirect URIs on the **same** OAuth client (it accepts multiple redirect URIs — no need for a second client).
4. Railway → Project Settings → **Tokens** → create a **project token scoped to the staging environment** (not the account-wide token). Add it to the GitHub repo as the `RAILWAY_STAGING_TOKEN` secret.
5. Push to `staging` once to confirm `deploy-staging.yml` runs the test jobs and deploys (re-run just the `deploy` job after adding the secret rather than pushing again, if the first push predates it).

**Verify:** same checklist as production (above), run against the staging domain — plus actually completing a Google login end-to-end, since that's the flow most likely to silently break from a half-finished variable audit.

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
2. Railway's ephemeral PR-preview environments — a possible future addition for per-PR preview links; the persistent `staging` environment (ADR-0104) covers the "stable pre-production URL" need instead.

## Non-goals for v1

Autoscaling, multi-region, blue/green, IaC beyond `railway.json`. Scale path and the exit story live in [ADR-0031](../decisions/0031-hosting-on-railway.md).
