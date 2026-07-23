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

Do this in the [Google Cloud Console](https://console.cloud.google.com). **One project holds everything** — sign-in, Calendar, and Maps/Places are all the _same_ project (created for OAuth sign-in, ADR-0013). Maps & Places extend that existing project; do not create a second one.

- [ ] Create a project (e.g. "waypoint"). _(Already done — this is the OAuth project below.)_
- [ ] **OAuth consent screen:** External, in _Testing_ mode; add the 5 travelers as test users (avoids the verification process for a private app).
- [ ] **Credentials → OAuth client ID (Web):**
  - Authorized redirect URI: `http://localhost:3000/auth/google/callback` (add the prod URL later).
  - Copy client ID/secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
- [ ] **Enable APIs:** Google Calendar API (v1). Gmail API — only when you build v1.1 import.
- [ ] **Maps & Places:** see the dedicated section below (ADR-0106 Phase 0).
- [ ] Scopes to configure: `openid email profile`, `.../auth/calendar.events` (see auth-and-google.md).

### Maps & Places (ADR-0106 Phase 0) 👤

Phase 0 of the [Maps & Places epic](../decisions/0106-maps-and-places-epic-scope-and-phasing.md) — the standing human blocker that gates all live map work. **We extend the existing OAuth project; we do not make a new one.** `gcloud` is not usable in the agent sandbox (SDK download is proxy-blocked and no Google account is authenticated), so this is a Console task. Whoever has Owner/Editor on the project runs it once.

The key model is **decided** — [ADR-0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md) chose a **two-key split**: a backend **server key** (Places New + Routes, behind a proxy, never in the browser) and, only at Phase 6, a public **browser key** (Maps JS API only). So Phase 0 has a clear near-term slice (mint the server key, unblock the Phase-1 picker) and a deferred Phase-6 slice (browser key + map/Routes APIs). Do the near-term slice now.

#### Near-term — unblocks the Phase-1 picker (do now)

**1. Enable the Places API.** APIs & Services → **Library** (`https://console.cloud.google.com/apis/library`), confirm the picker at the top shows the **waypoint** project, then:

- [ ] 👤 **Places API (New)** — Autocomplete + Place Details behind the Phase-1 picker (called server-side through our proxy, ADR-0108). If the library lists both "Places API (New)" and the legacy "Places API," enable **Places API (New)**; the exact endpoints are confirmed at Phase-1 implementation (ADR-0106/0108 accuracy note). Enabling the legacy one too is harmless if unsure (usage, not enablement, bills).
- Maps JavaScript API and Routes API are **Phase 6** — leave them off for now (see the deferred slice below).

**2. Billing + hard cost guardrails (ADR-0108 §6 — required before any key ships).** Maps/Places return `REQUEST_DENIED` without billing, and cost discipline is a hard gate here, not a nicety.

- [ ] 👤 Billing (`https://console.cloud.google.com/billing`) → confirm the project is **linked** to an active billing account (if sign-in/Calendar already work this may be true — verify the link, not just that an account exists).
- [ ] 👤 **Budget + alert** (Billing → Budgets & alerts): set a monthly ceiling with alerts (e.g. 50/90/100%). The outer safety net if every in-app guard is bypassed. **Required.**
- [ ] 👤 **Per-SKU daily quota cap** (APIs & Services → Places API (New) → **Quotas & limits**): cap **Place Details** and **Autocomplete** requests/day to a sane ceiling. This is what actually bounds an abuse/leak to a known maximum. (Dynamic Maps + Routes quota caps are added with the Phase-6 slice.)
- [ ] 👤 **Re-confirm current pricing** at billing setup — Google retired the $200/mo universal credit in March 2025 for per-SKU free tiers + Essentials/Pro/Enterprise field-mask tiers (ADR-0108 recorded figures confirmed 2026-07-23). Don't rely on remembered numbers; the _architecture_ doesn't change if a figure moved, but the quota ceilings you set should reflect today's prices.

**3. OAuth consent screen — no change needed.** Maps/Places authenticate with an **API key**, not OAuth scopes, so Phase 0 adds **no** consent-screen scopes and needs no re-verification. (The only OAuth work remains the sign-in/Calendar scopes above.)

**4. Create the server key (`GOOGLE_MAPS_SERVER_KEY`).** Credentials → **Create credentials → API key**, then **Edit** the key immediately:

- [ ] 👤 **API restrictions** → **Restrict key** → **Places API (New)** only. (Add **Routes API** to this same key at Phase 6 — it's the same server key.)
- [ ] 👤 **Application restrictions** → **IP addresses**, set to the backend's egress IP(s):
  - **Production (Railway):** its egress IP — note Railway does not guarantee a static egress IP on every plan, so if you can't pin one, leave application restriction as **None** and rely on the key being **API-restricted + held server-side only + behind `MembershipGuard` + the proxy rate limits** (ADR-0108 §1/§5). Never expose this key to the browser regardless.
  - **Local dev:** an IP restriction will block calls from your dev machine (home/office IPs vary). Simplest is to leave this key IP-unrestricted (API-restricted only) for now, or mint a separate throwaway dev key; either way it stays in your local `.env`, never the repo.
- [ ] 👤 **Store it in `.env` (local) and Railway env vars only — never in the repo** (CLAUDE.md rule 7). Backend var `GOOGLE_MAPS_SERVER_KEY` (read via `requireEnv` in `backend/src/common/env.ts` once the Phase-1 proxy lands — not wired yet, so setting it now is harmless). **Not** a `VITE_` var — the backend holds it, the browser never sees it. Record _what exists_ (not the value) in the password manager.

Setting `GOOGLE_MAPS_SERVER_KEY` today does nothing until the Phase-1 proxy code reads it — so `.env.example` gets a commented placeholder (below), but you can safely mint + store the key now so Phase 1 is unblocked the moment it starts.

#### Deferred — Phase 6 (embedded map + live Routes), do NOT do now

Listed so it isn't forgotten; none of this is needed for Phases 1–5, and per ADR-0108 there is **no browser-side Google key at all until Phase 6**.

- [ ] ⏸️ 👤 **Enable Maps JavaScript API** (Dynamic Maps SKU) and **Routes API**.
- [ ] ⏸️ 👤 **Add Routes API** to the existing `GOOGLE_MAPS_SERVER_KEY`'s API restrictions (Routes is proxied through the same server key).
- [ ] ⏸️ 👤 **Create the browser key (`VITE_GOOGLE_MAPS_BROWSER_KEY`)** — _API restrictions_ → **Maps JavaScript API only**; _Application restrictions_ → **HTTP referrers**, locked to the production origin (single-origin, ADR-0020/0031). A frontend **build-time** var (deployment.md); its blast radius on leak is map loads only.
- [ ] ⏸️ 👤 **Add per-SKU daily quota caps** for **Dynamic Maps** and **Routes** (the same hard-gate as the near-term Place Details cap).

**Status after the near-term slice:** Places API enabled + billing/budget/quota set + `GOOGLE_MAPS_SERVER_KEY` minted and stored = Phase 1 (the picker) is fully unblocked. The Phase-6 browser key and map/Routes APIs wait until that phase by design.

## Secrets

- [ ] `JWT_SECRET` — random 32+ bytes.
- [ ] `DOC_ENCRYPTION_KEY` — random 32 bytes, base64 (server-side document encryption, ADR-0015).
- [ ] Keep all of the above in `.env` (gitignored). Record _what exists_ (not the values) in a password manager or private local notes (kept out of the repo).

## Deployment (later, not v1-blocking) 👤

- [ ] Managed Postgres (Neon/Railway/RDS).
- [ ] Host the API + worker (Fly/Railway/Render); host the PWA (Vercel/Netlify).
- [ ] Object storage (S3-compatible) for documents.
- [ ] Add production redirect URIs and Maps key referrers.
