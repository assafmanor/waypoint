# Prerequisites Checklist

**Status:** ACCEPTED. What must exist before/while coding. Split into what runs locally and what needs external accounts. Items marked 👤 only _you_ can do (accounts/console); the rest an agent can do.

## Local toolchain (your machine, once)

- [x] 👤 **Node.js 22 LTS** (`.nvmrc` pins 22; use nvm/fnm: `nvm use`).
- [x] 👤 **pnpm** via Corepack: `corepack enable && corepack prepare pnpm@9.12.0 --activate`.
- [x] 👤 **Docker Desktop** (for local Postgres + Redis via `docker-compose.yml`).
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

- [x] 👤 **Places API (New)** — Autocomplete + Place Details behind the Phase-1 picker (called server-side through our proxy, ADR-0108). If the library lists both "Places API (New)" and the legacy "Places API," enable **Places API (New)**; the exact endpoints are confirmed at Phase-1 implementation (ADR-0106/0108 accuracy note). Enabling the legacy one too is harmless if unsure (usage, not enablement, bills).
- Maps JavaScript API and Routes API are **Phase 6** — leave them off for now (see the deferred slice below).

**2. Billing + hard cost guardrails (ADR-0108 §6 — required before any key ships).** Maps/Places return `REQUEST_DENIED` without billing, and cost discipline is a hard gate here, not a nicety.

- [x] 👤 Billing (`https://console.cloud.google.com/billing`) → confirm the project is **linked** to an active billing account (if sign-in/Calendar already work this may be true — verify the link, not just that an account exists).
- [x] 👤 **Budget + alert** (Billing → Budgets & alerts): set a monthly ceiling with alerts (e.g. 50/90/100%). The outer safety net if every in-app guard is bypassed. **Required.**
- [x] 👤 **Per-SKU daily quota cap** (APIs & Services → Places API (New) → **Quotas & limits**): cap **Place Details** and **Autocomplete** requests/day to a sane ceiling. This is what actually bounds an abuse/leak to a known maximum. (Dynamic Maps + Routes quota caps are added with the Phase-6 slice.)
- [x] 👤 **Re-confirm current pricing** at billing setup — Google retired the $200/mo universal credit in March 2025 for per-SKU free tiers + Essentials/Pro/Enterprise field-mask tiers (ADR-0108 recorded figures confirmed 2026-07-23). Don't rely on remembered numbers; the _architecture_ doesn't change if a figure moved, but the quota ceilings you set should reflect today's prices.

**3. OAuth consent screen — no change needed.** Maps/Places authenticate with an **API key**, not OAuth scopes, so Phase 0 adds **no** consent-screen scopes and needs no re-verification. (The only OAuth work remains the sign-in/Calendar scopes above.)

**4. Create the server key (`GOOGLE_MAPS_SERVER_KEY`).** Credentials → **Create credentials → API key**, then **Edit** the key immediately:

- [x] 👤 **API restrictions** → **Restrict key** → **Places API (New)** only. (Add **Routes API** to this same key at Phase 6 — it's the same server key.)
- [x] 👤 **Application restrictions** → **IP addresses**, set to the backend's egress IP(s):
  - **Production (Railway):** its egress IP — note Railway does not guarantee a static egress IP on every plan, so if you can't pin one, leave application restriction as **None** and rely on the key being **API-restricted + held server-side only + behind `MembershipGuard` + the proxy rate limits** (ADR-0108 §1/§5). Never expose this key to the browser regardless.
  - **Local dev:** an IP restriction will block calls from your dev machine (home/office IPs vary). Simplest is to leave this key IP-unrestricted (API-restricted only) for now, or mint a separate throwaway dev key; either way it stays in your local `.env`, never the repo.
- [x] 👤 **Store it in `.env` (local) and Railway env vars only — never in the repo** (CLAUDE.md rule 7). Backend var `GOOGLE_MAPS_SERVER_KEY`, read by the Places proxy. **Not** a `VITE_` var — the backend holds it, the browser never sees it. Record _what exists_ (not the value) in the password manager.

`GOOGLE_MAPS_SERVER_KEY` is unrelated to the map renderer. It remains required for Places search.

#### Retired Phase 6 Google renderer setup

> Retired by ADR-0186 Phase 4 on 2026-08-14. Do not create, configure or deploy the browser Maps key, Map IDs, cloud styles or the three frontend build variables below. MapLibre is bundled and reads our PMTiles routes with no frontend map credential. The collapsed checklist remains only as migration history.

<details>
<summary>Historical Google Maps renderer checklist</summary>

Phases 1–5 have shipped and need none of this; per ADR-0108 there is **no browser-side Google key at all until Phase 6**. The Phase-6 design is now done ([ADR-0121](../decisions/0121-embedded-map-phase-6-design.md)), so this section is the only thing between the build and a map anyone can see. **Routes is a later, paid enhancement** and stays off entirely until it is picked up (step 7).

Same project as everything else — confirm the Console's project picker shows **waypoint** on every page below before clicking anything. Owner/Editor needed (Map IDs and styles require it). Budget ~20 minutes.

**Do the steps in this order.** The quota cap (step 2) comes _before_ the key (step 5) on purpose: a public browser key that exists before its SKU is capped is an uncapped public key, and the cap is the thing that bounds a forged-referrer abuse (ADR-0108 §6).

**1. Enable the Maps JavaScript API** — the Dynamic Maps SKU, and the only new API this phase needs.

- [x] 👤 APIs & Services → **Library** (`https://console.cloud.google.com/apis/library`) → search **"Maps JavaScript API"** → open it → **Enable**.
- [x] 👤 Verify at **Enabled APIs & services** (`https://console.cloud.google.com/apis/dashboard`) that _Maps JavaScript API_ is listed alongside _Places API (New)_.
- Leave **Routes API** disabled (step 7). Enabling costs nothing, but keeping it off keeps the browser key's reachable surface provably one SKU.

**2. Cap the Dynamic Maps daily quota, and re-check the budget alert** (ADR-0108 §6 — a hard gate, not a nicety). Dynamic Maps bills **per map instantiation** (~$7/1,000, 10,000/month free), so the daily cap is what converts "a leaked key" into "a known maximum".

- [x] 👤 Google Maps Platform → **Quotas** (`https://console.cloud.google.com/google/maps-apis/quotas`) → pick **Maps JavaScript API** in the API selector → the **Requests** tab.
- [x] 👤 Find the **`Map loads per day`** metric → edit it (pencil / ⋮ at the row's end) → untick **Unlimited** → enter the ceiling → **Save**. Quotas reset at **midnight Pacific**, and an edit can take a few minutes to apply.
- [x] 👤 **Suggested ceiling: 300/day.** The arithmetic, so the number is a decision and not a guess: real use is ~100 loads/day (5 travellers × ~20 tab opens, ADR-0121 §4), and 300/day × 30 days = 9,000/month — still **inside** the 10,000/month free tier even if the cap is pinned every single day. So the worst case a leak can reach is a bill of roughly zero. Raise it only with a reason.
- [x] 👤 Leave the per-minute quotas at Google's defaults (30,000/min per project, 300/min per IP). They are not the money lever; the daily cap is.
- [x] 👤 Billing → **Budgets & alerts** → open the existing budget and confirm its **scope covers the new SKU**. If it was scoped to specific services (Places API only) rather than the whole project, add **Maps JavaScript API** — a project-wide budget needs no change. This is the "confirm the budget alert covers the new SKU" box, and it is easy to tick without looking.

**3. Create the Map IDs** — `mapId` is **mandatory**, not optional styling: `AdvancedMarkerElement` does not load without one (ADR-0121 §1, reconfirmed 2026-07-26), and `google.maps.Marker` has been deprecated since 2024-02-21.

- [x] 👤 Google Maps Platform → **Map management** (`https://console.cloud.google.com/google/maps-apis/studio/maps`) → **Create map ID**.
- [x] 👤 Name it **`waypoint-day`** → **Map type: JavaScript** → **Vector** → Save. Leave tilt/rotation off (ADR-0121 §14 excludes 3D/tilt; the app sets camera options in code regardless).
- [x] 👤 Copy the generated **Map ID** value (a short opaque string, not the name) — it becomes `VITE_GOOGLE_MAPS_MAP_ID`.
- [x] 👤 Repeat for **`waypoint-night`** (same settings) → its value becomes `VITE_GOOGLE_MAPS_MAP_ID_DARK`. Inert until dark mode ships (ADR-0121 §11) — minting it now is what makes enabling dark mode a token flip instead of a Maps project task.

**4. Import the two cloud styles and associate them.** Styling costs nothing. A Map ID with no style attached still renders and still carries advanced markers, so this step is what makes the map ours rather than Google-default.

**The styles are authored — do not redraw them by hand.** [`docs/design/map-styles/`](../design/map-styles/README.md) holds `waypoint-map-day.json` and `waypoint-map-night.json`, with every colour taken from `tokens.css` (`--screen`, `--card`, `--muted`, `--ink`, `--faint`, `--board`) and its README carrying the token→map-element mapping.

- [x] 👤 Google Maps Platform → **Map styles** (`https://console.cloud.google.com/google/maps-apis/studio/styles`) → **Create style** → **Import JSON** → paste `waypoint-map-day.json` → save as **`waypoint-day`**.
- [x] 👤 **Associate map IDs** → tick the `waypoint-day` Map ID → Save.
- [ ] ⏸️ 👤 Repeat with `waypoint-map-night.json` → `waypoint-night`, into that Map ID's **Dark mode** slot.
- **A Map ID has TWO style slots, light and dark, and the app picks one** — this is the step that is easy to do correctly and still see nothing (ADR-0158 §12). `colorScheme` on the map defaults to `LIGHT`, so a night Map ID with a night style in its dark slot renders its **light** slot unless the app asks for dark. It does now (`readMapsConfig` resolves the slot from the same theme it resolves the ID from), but a bundle built before that change still asks for light — and Vite inlines at build time, so it needs a rebuild, not a restart.
- **The day boxes above are ticked retroactively.** They were left unticked through session 133, which [ADR-0125](../decisions/0125-map-canvas-terrain-vocabulary.md) then contradicts in its opening line: the day style was imported, seen on a real phone, judged _"very lifeless"_, and the sea was tweaked **by hand in the Console** — a change the repo files never carried. Treat ADR-0125 as authoritative for the day style, and note the trap it records: a Console-only edit is invisible to `git` and the next import silently reverts it.
- [ ] ⏸️ 👤 Note the propagation lag: a style edit or a new association can take **up to ~6 hours** to appear on a live map. Do not debug an unstyled map for the first few hours; check the association is saved and move on.
- **Neither JSON has been seen on a rendered map** (the render cannot be exercised in the suite, ADR-0121 §13). Expect one adjustment round on a real device, most likely water contrast and the park fill — the two values reasoned to from the palette rather than lifted from it. Fix them in the JSON files, not only in the Console, or the next import silently reverts the fix.
- **Per-mode styles are deliberately not built.** Trip/Plan identity lives in chrome and in map _figures_ — the Plan-only dashed connector and the Trip-only amber next-stop cue (ADR-0121 §10/§6) — never in the base canvas: `--plan` violet flooded across the ground is exactly the colour flood ADR-0106 §C forbids, and `mapId` is construction-time, so swapping it per mode would re-instantiate the map and bill a fresh load on every mode toggle (ADR-0121 §4). Day/night is the only axis that needs a second Map ID, because `--screen` itself remaps under `data-theme="dark"`.

**5. Create the browser key (`VITE_GOOGLE_MAPS_BROWSER_KEY`)** — public by necessity (it rides in the script URL and cannot be proxied, ADR-0108 §1), so every restriction below is load-bearing. **Restrict it immediately on creation**, before it is pasted anywhere.

- [x] 👤 APIs & Services → **Credentials** (`https://console.cloud.google.com/apis/credentials`) → **Create credentials** → **API key** → in the dialog, **Edit API key** (do not just close it — an unrestricted browser key is the whole risk).
- [x] 👤 **Name it `waypoint-browser-maps-js`** so it is never confused with `GOOGLE_MAPS_SERVER_KEY` at a glance. Two keys with default names on one project is how the wrong one ends up in the wrong place.
- [x] 👤 **Application restrictions → Websites** (HTTP referrers) → **Add** one entry per deployed origin:
  - `https://<production-domain>/*`
  - `https://<staging-domain>/*` — **easy to miss**: single-origin (ADR-0020/0031) means one origin _per environment_, and staging is a separate domain (ADR-0104). Without this the map is blank on staging only.
  - `http://localhost:5173/*` — the Vite dev origin, so local development uses the real style instead of `DEMO_MAP_ID`. Only `http://` and `https://` referrer schemes are supported; the installed PWA still sends its origin, so no extra entry is needed for standalone mode.
- [x] 👤 **API restrictions → Restrict key** → tick **Maps JavaScript API** and **nothing else**. Not Places, not Routes — that separation _is_ the split-key model (ADR-0108 §1), and it is what makes a scraped browser key worth ~$7/1,000 capped map loads instead of ~$20/1,000 Place Details.
- [x] 👤 **Save**, and allow up to ~5 minutes for restriction changes to take effect before concluding something is broken.

**6. Store the three build vars** — all three are **build-time** frontend args baked into the client bundle (`deployment.md`), read via `import.meta.env` the way `lib/api.ts:55` reads `VITE_API_BASE_URL`. They deliberately do **not** go in `.env.example` (that file's own comment states the rule).

- [x] 👤 **Local:** put them in **`frontend/.env.local`**, not the repo-root `.env`. Vite's config sets no `envDir`, so it reads env files from the **`frontend/`** package — the root `.env` is the backend's and Vite never sees it. `frontend/.env.local` is already gitignored (`.env.*`, CLAUDE.md rule 7):

  ```
  VITE_GOOGLE_MAPS_BROWSER_KEY=...
  VITE_GOOGLE_MAPS_MAP_ID=...
  VITE_GOOGLE_MAPS_MAP_ID_DARK=...
  ```

- [x] 👤 **Railway production:** all three set as service variables.
- [ ] ⏸️ 👤 **Railway staging:** still unset. The map will be list-only on staging until they are added there too (ADR-0121 §2's graceful absence), which is the quiet failure to expect when a staging test says "the map didn't ship". They are needed **at build time** — Vite inlines them into the bundle, so a var added after the build does nothing until the next deploy. A rebuild is required, not a restart.
- [x] 👤 Record _what exists_ (not the values) in the password manager, as with the server key.
- Absent or wrong, the Map tab **degrades to its list-only form** rather than crashing (ADR-0121 §2) — which also means a typo fails quietly. Step 7's verification is how you catch that.

**7. Verify, and know the error strings.** No app code reads these vars yet (the Phase-6 build is unwritten), so the honest check today is a scratch page, not the app.

- [ ] ⏸️ 👤 Confirm the key's own **Metrics** page shows traffic once the build ships: Google Maps Platform → **Metrics**, filtered to the browser key — Dynamic Maps loads appearing there is the end-to-end proof.
- [ ] ⏸️ 👤 Optional pre-build smoke test: a throwaway local HTML file loading the JS API with the key + `VITE_GOOGLE_MAPS_MAP_ID` and one `AdvancedMarkerElement`, served over `http://localhost:5173` so the referrer entry applies. It **bills one map load** (~$0.007, inside the free tier). Keep it out of the repo — the scratchpad, not the working tree.
- What the failures look like, so nobody debugs the wrong step: **`ApiNotActivatedMapError`** → step 1; **`RefererNotAllowedMapError`** → step 5's referrer list (check the exact scheme/port); **`InvalidKeyMapError`** → wrong or truncated key; **markers silently absent while the map renders** → a missing or invalid `mapId` (step 3), the failure mode `mapId`-is-mandatory produces; **a greyed "development purposes only" watermark** → billing not linked to the project; **an unstyled but working map** → step 4's association, or its ~6-hour propagation.

</details>

**Later — Routes stays off until the paid work starts.**

- [ ] ⏸️ 👤 Enable **Routes API**, add it to the existing `GOOGLE_MAPS_SERVER_KEY`'s API restrictions, and give it its own daily quota cap — **only** when the paid live-ETA work is picked up (Routes is proxied through the server key; ADR-0108 §4, ADR-0121 §14). Its Essentials tier caps at **10 intermediate waypoints** (ADR-0121 §1), which that work inherits.

**Status after the near-term slice:** Places API enabled + billing/budget/quota set + `GOOGLE_MAPS_SERVER_KEY` minted and stored = Phase 1 (the picker) is fully unblocked. The Phase-6 browser key and map APIs wait until that phase by design.

**Done 2026-07-23:** the near-term slice above is complete — Places API (New) enabled on the existing `waypoint` project, a billing budget alert + a per-day request quota cap set, and `GOOGLE_MAPS_SERVER_KEY` minted and stored in local `.env` + Railway. Phases 1–5 shipped on it.

**Retired 2026-08-14.** The browser Maps key, Map IDs, cloud styles and frontend build variables are no longer read by the app and may be removed from deployed service configuration. The backend Places key remains active.

## Secrets

- [ ] `JWT_SECRET` — random 32+ bytes.
- [ ] `DOC_ENCRYPTION_KEY` — random 32 bytes, base64 (server-side document encryption, ADR-0015).
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` — Web Push (ADR-0197). Generate the pair with **`npx web-push generate-vapid-keys`**; the subject is a `mailto:` or `https:` URL a push service can use to reach whoever runs the deployment. **All three or none:** the backend refuses to boot on a partial keypair, because half of one subscribes fine and fails at the first send. It also size-checks them (65 bytes public, 32 private), so the copy-paste that swaps the two halves fails at boot rather than at the first send. Omit all three on a dev box and `/me` reports no key, which the app states rather than offering a control that cannot work.
  - **To actually see a notification you need a production build**, because there is no service worker under `pnpm dev`: `VITE_PUSH_DEBUG=1 pnpm --filter @waypoint/frontend build && pnpm --filter @waypoint/frontend preview`, subscribe from the instrument in user settings, then `curl -X POST localhost:3000/notifications/test` with `DEV_AUTH=1`.
- [ ] Keep all of the above in `.env` (gitignored). Record _what exists_ (not the values) in a password manager or private local notes (kept out of the repo).

## Deployment (later, not v1-blocking) 👤

- [ ] Managed Postgres (Neon/Railway/RDS).
- [ ] Host the API + worker (Fly/Railway/Render); host the PWA (Vercel/Netlify).
- [ ] Object storage (S3-compatible) for documents.
- [ ] Add production redirect URIs and Maps key referrers.
