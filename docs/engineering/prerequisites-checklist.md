# Prerequisites Checklist

**Status:** ACCEPTED. What must exist before/while coding. Split into what runs locally and what needs external accounts. Items marked 👤 only _you_ can do (accounts/console); the rest an agent can do.

## Local toolchain (your machine, once)

- [ ] 👤 **Node.js 22 LTS** (`.nvmrc` pins 22; use nvm/fnm: `nvm use`).
- [ ] 👤 **pnpm** via Corepack: `corepack enable && corepack prepare pnpm@9.12.0 --activate`.
- [ ] 👤 **Docker Desktop** (for local Postgres + Redis via `docker-compose.yml`).
- [ ] `pnpm install` at the repo root (regenerates `node_modules` for your OS; the sandbox couldn't pre-build these).

## First run (verifies the scaffold)

```bash
cp .env.example .env         # fill in secrets as you get them
docker compose up -d         # Postgres + Redis
pnpm install
pnpm --filter @waypoint/backend prisma:generate
pnpm --filter @waypoint/backend prisma:migrate   # creates the schema
pnpm dev                     # runs backend + frontend via Turbo
# backend:  http://localhost:3000/health
# frontend: http://localhost:5173
```

## Local dev auth bypass (`DEV_AUTH=1`) — headless / agent testing

Google OAuth (below) needs the Cloud setup and a real browser sign-in, which a
sandbox, CI-style, or agent session can't complete. To run and exercise the
backend + app **without** Google, set `DEV_AUTH=1` in `.env`:

- **What it does:** a request with no bearer token is treated as the seeded dev
  user — `u-assaf` / `assaf@example.com`, matching `prisma/seed.mjs`'s ME user
  (`backend/src/auth/jwt-auth.guard.ts`, `sync.gateway.ts`). A real
  `Authorization: Bearer …` still wins. **Dev-only — never set in production**
  (ADR-0020; see `architecture/deployment.md`).
- **Seed first** (`pnpm --filter @waypoint/backend prisma:seed`): it creates that
  dev user plus a **live demo trip** (dates relative to today, `Asia/Tokyo`), so
  the app lands authed on a real trip instead of the zero-state.
- **Frontend → backend:** across the dev `:5173 → :3000` gap, start the frontend
  with `VITE_API_BASE_URL=http://localhost:3000` and open it at
  **`http://localhost:5173`** (not `127.0.0.1`) — the request Origin must equal
  `FRONTEND_URL` or CORS blocks the credentialed `GET /me`.
- **No Docker?** Any Postgres reachable on `:5432` with role/db `waypoint` /
  `waypoint` satisfies the default `DATABASE_URL` — the CI workflow uses a
  `postgres:16` service; a system cluster (`pg_ctlcluster 16 main start`) works
  too. Docker is only the convenience path.
- **Pin the clock** to exercise now / passed / upcoming and past/future days
  (ADR-0026): the dev time-travel widget, or set
  `localStorage['waypoint:dev-now'] = <epoch ms>` and reload.

## Google Cloud setup 👤 (needed for auth + Maps + Calendar)

Do this in the [Google Cloud Console](https://console.cloud.google.com):

- [ ] Create a project (e.g. "waypoint").
- [ ] **OAuth consent screen:** External, in _Testing_ mode; add the 5 travelers as test users (avoids the verification process for a private app).
- [ ] **Credentials → OAuth client ID (Web):**
  - Authorized redirect URI: `http://localhost:3000/auth/google/callback` (add the prod URL later).
  - Copy client ID/secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
- [ ] **Enable APIs:** Google Calendar API (v1). Gmail API — only when you build v1.1 import.
- [ ] **Maps Platform:** create an API key; enable Maps JavaScript API + Places API; restrict the key. → `VITE_GOOGLE_MAPS_API_KEY`.
- [ ] Scopes to configure: `openid email profile`, `.../auth/calendar.events` (see auth-and-google.md).

## Secrets

- [ ] `JWT_SECRET` — random 32+ bytes.
- [ ] `DOC_ENCRYPTION_KEY` — random 32 bytes, base64 (server-side document encryption, ADR-0015).
- [ ] Keep all of the above in `.env` (gitignored). Record _what exists_ (not the values) in a password manager or private local notes (kept out of the repo).

## Deployment (later, not v1-blocking) 👤

- [ ] Managed Postgres (Neon/Railway/RDS).
- [ ] Host the API + worker (Fly/Railway/Render); host the PWA (Vercel/Netlify).
- [ ] Object storage (S3-compatible) for documents.
- [ ] Add production redirect URIs and Maps key referrers.
