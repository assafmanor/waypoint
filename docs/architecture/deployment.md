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

| Var                                         | Value / how to generate                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                              | Reference variable `${{Postgres.DATABASE_URL}}` (private network)                                                                                                                          |
| `JWT_SECRET`                                | `openssl rand -base64 32` — store in the password manager                                                                                                                                  |
| `TOKEN_ENCRYPTION_KEY`                      | `openssl rand -base64 32` — **must decode to exactly 32 bytes** (AES-256-GCM, crypto.util)                                                                                                 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the Google Cloud OAuth client (prerequisites-checklist.md)                                                                                                                            |
| `GOOGLE_OAUTH_REDIRECT_URI`                 | `https://<domain>/auth/google/callback` — where **Google** calls back to. Same `<domain>` as `FRONTEND_URL`, enforced at boot                                                              |
| `FRONTEND_URL`                              | `https://<domain>` (the environment's own origin, and its **canonical host** — ADR-0169). **Required in every deployed environment** — see note below                                      |
| `DOC_ENCRYPTION_KEY`                        | Documents at rest (ADR-0015). `openssl rand -base64 32` — must decode to exactly 32 bytes                                                                                                  |
| `S3_ENDPOINT`                               | Railway Storage Bucket endpoint URL (S3-compatible, ADR-0031)                                                                                                                              |
| `S3_BUCKET`                                 | Railway Storage Bucket name                                                                                                                                                                |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Railway Storage Bucket credentials                                                                                                                                                         |
| `DOC_CACHE_DIR` _(optional)_                | Local-FS blob-cache tier path (ADR-0055). Unset → memory-only; a lost dir on redeploy just re-warms from S3                                                                                |
| `DOC_CACHE_MAX_BYTES` _(optional)_          | In-memory LRU bound in bytes (ADR-0055). Unset → 64 MB default                                                                                                                             |
| `DOC_CACHE_DISABLED` _(optional)_           | Any truthy value turns the blob cache off entirely (kill switch, ADR-0055)                                                                                                                 |
| `MAP_PLANET_CACHE_DIR` _(optional)_         | Local-FS hot-range cache for the live PMTiles proxy (ADR-0187). Unset → memory-only                                                                                                        |
| `MAP_PLANET_CACHE_MAX_BYTES` _(optional)_   | In-memory hot-range LRU bound in bytes (ADR-0187). Unset → 128 MB default                                                                                                                  |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`    | Web Push (ADR-0197). **Generate the pair together:** `npx web-push generate-vapid-keys`. Store both in the password manager                                                                |
| `VAPID_SUBJECT`                             | A `mailto:` or `https:` URL a push service can use to reach whoever runs this deployment. Required by the spec, and some services reject a send without it                                 |
| `PUSH_DISABLED` _(optional)_                | **Set it to `1` to stop every send; REMOVE it to re-enable** — see the warning below (kill switch, ADR-0197 §4). Subscribing, unsubscribing and every in-app surface keep working          |
| `ROUTING_BASE_URL` _(optional)_             | Where the routing engine lives (ADR-0205 §2). Unset → the FOSSGIS planet server, which §Y1 keeps as the standing default. **Boot-validated** — see the note below                          |
| `ROUTING_FETCH_TIMEOUT_MS` _(optional)_     | Per-request timeout for a matrix or a shape (ADR-0205). Unset → 15 s. A day matrix measures ~560 ms median / ~1 s tail, and nothing user-facing waits on it                                |
| `ROUTING_DISABLED` _(optional)_             | **Set it to `1` to stop every upstream routing call; REMOVE it to re-enable** — see the warning below (kill switch, ADR-0205). Stored legs are still served and the endpoint still answers |

**The three `VAPID_*` vars are REQUIRED in production and the service refuses to boot without them** (ADR-0197 §1, enforced in `validate-config.ts` — the same fail-fast posture as ADR-0071's other requireds). That is deliberate: the alternative is a deploy that boots "healthy" and silently cannot notify anyone. Two more rules the validator enforces, both because they are the ways this actually goes wrong:

- **All three or none.** A partial keypair subscribes fine and fails at the first send, which is a failure nobody is watching a log for.
- **The two keys are size-checked and therefore cannot be swapped.** The public half is 65 bytes (an uncompressed P-256 point), the private half 32 — so the copy-paste that pastes them into each other's box fails at boot with a message naming which one is wrong, rather than 401-ing at the first send weeks later. Both are base64url; a value containing `+` or `/` came from the wrong tool.

**A kill switch is turned OFF by deleting the variable, never by setting it to `0` or `false`** — measured, not inferred. `PUSH_DISABLED`, `ENRICHMENT_DISABLED`, `DOC_CACHE_DISABLED` and `ROUTING_DISABLED` are read as a bare truthiness check on the string, and in JavaScript the strings `"0"` and `"false"` are **truthy** — so `PUSH_DISABLED=false` **stops every push**, which is the exact opposite of what it looks like it says. Only an absent or empty value re-enables. (`FX_DISABLED` is still the odd one out: it tests `=== '1'`, so `FX_DISABLED=false` leaves FX running. **Five switches, two behaviours** — worth collapsing, and not yet done. ADR-0205's `ROUTING_DISABLED` deliberately joined the majority rather than the exception, so collapsing means moving one switch, not four.)

**Rotating them logs out every device, not every user.** The keypair is this server's identity to the push services, so a new one invalidates every stored `PushSubscription` — existing rows start returning `410`, the sender prunes them (§10), and each device has to be re-subscribed by its owner. Nothing else breaks and no user is signed out; it is a notification outage, not an auth one. Treat it as a real user-visible event rather than a routine secret rotation.

**Never set in production:** `DEV_AUTH` (auth bypass). `VITE_API_BASE_URL` stays unset because the client defaults to same-origin. The MapLibre renderer needs no frontend map key, Map ID or runtime vendor configuration; its archives are served through the same origin. `GOOGLE_MAPS_SERVER_KEY` remains backend-only for the Places proxy. A later addition when its feature lands is `REDIS_URL` (v1.1).

**Never set in production, second list — the frontend debug flags:** `VITE_PUSH_DEBUG` (the push instrument in user settings, ADR-0197 phase 1) belongs to a local or staging build only. It is a **build-time** variable, so it has to be present when the frontend is built rather than when the service starts.

**`VITE_BUILD_BADGE=1` puts a build stamp on screen, and staging is what it is for (session 268).** Two deploys look identical on a phone, so a report against the wrong one costs a session. Set it on **staging only**; unset (the default) ships nothing, exactly like `VITE_NAV_DEBUG`. The badge is a small fixed corner label — `branch · shortSHA · MM-DD HH:MM` — that hides for the session when tapped, so it can never block the surface being tested (`ui/BuildBadge.tsx`).

**The timestamp is automatic; the commit needs one variable, and this cost a deploy to learn.** `vite.config.ts`'s `buildLabel()` always stamps the build time, which is what answers "did my redeploy land?". The commit is a bonus, and on Railway it does **not** resolve by itself: `RAILWAY_GIT_COMMIT_SHA`/`RAILWAY_GIT_BRANCH` are provided to the **service**, not forwarded into the Docker build, and the build context carries no `.git` — so the first version printed `unknown 08-14 09:22` with the commit silently missing. Declaring the `ARG`s is necessary and not sufficient.

To get the commit, set one service variable and let Railway interpolate it:

```
VITE_BUILD_LABEL = ${{RAILWAY_GIT_BRANCH}} ${{RAILWAY_GIT_COMMIT_SHA}}
```

It is still not a hand-typed label — Railway substitutes the real values per deploy, so it cannot go stale. Locally it falls back to the git checkout, and when nothing can answer the commit is simply **omitted**: an honest gap beats `unknown`. All names here are subject to the `ARG` rule above and are declared in the `Dockerfile`.

**`FRONTEND_URL` is not dev-only, despite the name — and it is now the environment's canonical host (ADR-0169).** It doubles as the dev `:5173`→`:3000` CORS origin locally, but `AuthController`'s Google callback (`res.redirect(frontendUrl())`, `auth.controller.ts`) also uses it as the **post-login redirect target** in every environment, and `common/canonical-host.ts` redirects any other `Host` this service answers on to it. Set it to the environment's own origin (production's own domain, staging's own domain) everywhere, single-origin topology notwithstanding.

Two things that were silent failures and now aren't. `validateConfig` **refuses to boot in production** when (a) `FRONTEND_URL` is unset — previously that completed a Google login and then redirected the browser to `localhost`, with nothing in the logs — or (b) `FRONTEND_URL` and `GOOGLE_OAUTH_REDIRECT_URI` name **different hosts**, e.g. one on `www.` and one on the apex. The second pair cannot log anyone in at all: the OAuth state cookie is host-only (ADR-0020), so it is set by the host that started the round-trip and never sent to the host Google calls back to — the callback fails its own check and bounces the user home, signed out. Both variables move together, always. The report that produced this guard was a **single mistyped character** — `FRONTEND_URL` set to `https://wwww.travelive.app`, four `w`s, while the callback URI was spelled right: login succeeded, the session cookie was set, and the browser was then redirected to a hostname that does not exist. Nothing in the logs, healthcheck green.

**Never copy these verbatim into staging (ADR-0104):** `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DOC_ENCRYPTION_KEY` and the `VAPID_*` pair need their own freshly-generated values — a shared VAPID keypair means staging and production compete for the same push identity, and a subscription made against one is addressable by the other; `DATABASE_URL` must be a reference variable resolving to staging's own Postgres, never production's connection string; `S3_*` should point at a separate staging bucket; `GOOGLE_OAUTH_REDIRECT_URI` and `FRONTEND_URL` both need staging's own domain, not production's. See the staging section below — and note that Railway's **reference-variable syntax matters**: a variable like `${{<uuid>.VAR}}` (ID-pinned) keeps pointing at that exact resource regardless of environment, while `${{ServiceName.VAR}}` (name-based) resolves against whichever resource has that name _in the current environment_ — only the latter survives being duplicated into a new environment correctly.

**Document blob cache (ADR-0055).** A read-through, **ciphertext-only** cache below `getObject` (`backend/src/documents/blob-cache.ts`): an in-memory LRU (`DOC_CACHE_MAX_BYTES`, default 64 MB) plus an optional local-FS tier (`DOC_CACHE_DIR`). Keyed by the immutable `fileRef`, so it needs eviction on delete/replace only, never content invalidation. All three vars are optional — unconfigured, the cache runs memory-only and nothing breaks. Both tiers hold exactly the bytes S3 holds (ciphertext), so the operator trust boundary (ADR-0034) is unchanged, and the FS tier is a cache, never a source of truth — the ephemeral filesystem (below) is fine for it, a miss just falls through to S3. `DOC_CACHE_DISABLED` is the kill switch. The client mirrors this with a Cache-API blob cache (`frontend/src/lib/doc-cache.ts`) so repeat and offline opens skip the network.

**Live map range cache (ADR-0187).** `GET /map/planet-<build>.pmtiles` range-reads the configured planet archive through a bounded in-memory LRU (`MAP_PLANET_CACHE_MAX_BYTES`, default 128 MB) and an optional local-FS tier (`MAP_PLANET_CACHE_DIR`). The route is guarded, accepts closed byte ranges only, and validates exact upstream partial responses. **Which build it reads is resolved at runtime** — upstream keeps only about a week of dailies, so the server probes the last 8 and takes the newest that answers, re-resolving on a 6-hour TTL and stating the answer on `/me` (ADR-0187 §1 amendment, 2026-08-21). Setting `MAP_TILES_SOURCE_URL` pins a mirror and skips resolution entirely; with it set, that URL's build id is the only one the route serves. **Offline artefacts are keyed by a 30-day vintage** derived from that build (`map_world-z6_<vintage>.pmtiles`, `map_<tripId>_<signature>_<vintage>.pmtiles`), so a rolled vintage is a cache miss that re-cuts in the background and a device can tell its downloaded map has been superseded (ADR-0186 §6 amendment). Expect one extra archive per logical map per window in the bucket; the previous vintage is kept because devices still holding it read it. Both tiers are disposable caches; an empty ephemeral filesystem only causes the ranges to warm again.

**Routing (ADR-0205).** **Nothing has to be set for routes to work** — all three vars are optional and the service calls the FOSSGIS planet server by default (§Y1's standing default). What is worth knowing is why `ROUTING_BASE_URL` is validated at boot rather than at the first call: ADR-0205 §2 links `https://valhalla.openstreetmap.de/`, which is the **demo web application**, and it answers `200` with an HTML page for `/status` and for every API path. A deploy pointed there does not fail — it returns a well-formed success carrying a document nothing can parse, forever, and every travel time in the app quietly reads as ADR-0206 §D4's crow-flies chip. §Z4 calls that the most expensive way to be wrong. So the validator refuses anything that is not a bare `https` origin whose host the outbound allowlist already carries; the API host is **`valhalla1`.openstreetmap.de**.

That second half is the one operational gotcha: **moving to a self-hosted router is two changes, not one.** The allowlist in `backend/src/enrichment/outbound-fetch.ts` is code on purpose (ADR-0166 §7 — _"a host you can add by setting a variable is not much of an allowlist"_), so a new host needs a line there as well as the variable here, and setting only the variable fails at boot with a message saying exactly that. `ROUTING_DISABLED` is the kill switch, and it stops **outbound calls only**: every leg already in the `RouteLeg` table is still served and the endpoint still answers, because a route is a cache (§4) rather than data.

**Itinerary PDF (ADR-0213 §4).** All three vars are optional and the shipped image needs
none of them. The runtime stage installs **system `chromium`** (with `fonts-liberation`,
Chromium's own baseline) and `PDF_CHROMIUM_PATH` defaults to where that lands; the backend
depends on `playwright-core`, which ships no browser, so nothing in the build or at first
request downloads ~150 MB from a CDN. The app's Hebrew faces are read from `/app/pdf-fonts`
(copied out of the frontend source at build) and **inlined into the document as data URLs**,
so a rendered PDF depends on no system font and makes no outbound request at all — the page
aborts every request before its content is set.

The one worth tuning is **`PDF_RENDER_CONCURRENCY`** (default 2). Each render is a real
browser tab holding tens of megabytes on an **unauthenticated** route, so an unbounded value
is a memory-exhaustion lever anyone holding a link can pull; the per-IP throttle in front of
it (5/min) does not help against many IPs. Work queued behind the cap is refused after
`PDF_RENDER_TIMEOUT_MS` (default 15 s) with `503` + `Retry-After: 5`, which is an honest
answer rather than a request that never returns. There is **no kill switch and no stored
PDF**: a file that outlives a revocation is what the whole `no-store` posture exists to
prevent, and the browser is launched lazily, so an instance that is never asked for a PDF
never starts one.

## One-time setup runbook

1. **Railway**: sign up (GitHub login), **Hobby plan**; optionally set a workspace usage limit (e.g. $10/mo) as a cost guardrail.
2. **Project**: "Deploy from GitHub repo" → this repo, branch `main`, region EU-West. `railway.json` supplies builder/healthcheck; **verify the pre-deploy command** appears in service → Settings → Deploy (set it manually if config-as-code didn't apply): `npx prisma migrate deploy`.
3. **Postgres**: `+ New → Database → PostgreSQL` in the same project.
4. **Env vars**: set the table above on the service (`DATABASE_URL` via the reference picker).
5. **Domain**: service → Settings → Networking → Generate Domain; then fill `GOOGLE_OAUTH_REDIRECT_URI` **and** `FRONTEND_URL` with it (both, not just the redirect URI — see the `FRONTEND_URL` note above). For a bought domain, see the custom-domain section below.
6. **Google Cloud Console** (APIs & Services → Credentials → the OAuth client): add `https://<domain>` to Authorized JavaScript origins and `https://<domain>/auth/google/callback` to Authorized redirect URIs. If the consent screen is in _Testing_ mode, add each member's Gmail as a test user.
7. **Deploy & verify** (below).

## Custom domain (ADR-0169)

Production runs on **`travelive.app`**, bought at GoDaddy. The one rule: **the app answers on exactly one host**, and every other name it can be reached by redirects there. The session is a host-only cookie (ADR-0020), so two live hosts are two logins that cannot see each other — and since `GOOGLE_OAUTH_REDIRECT_URI` pins the callback to a single fixed host, a login begun on the other one lands on a callback that can't verify its own state cookie and signs the user out in silence.

**The canonical host must be the same string in four places**, or login breaks:

| Where                                     | What                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Railway → service → Settings → Networking | the custom domain (add the other name too — the app redirects it)  |
| `FRONTEND_URL`                            | `https://<canonical>`                                              |
| `GOOGLE_OAUTH_REDIRECT_URI`               | `https://<canonical>/auth/google/callback`                         |
| Google Cloud console → the OAuth client   | `https://<canonical>` in JS origins, the callback in redirect URIs |

The service **refuses to boot** if the middle two disagree on host, so a half-finished move fails at deploy rather than at someone's next login. Extra entries in the Google console (a `www.` origin, the old `*.up.railway.app` callback) are harmless — Google only ever uses the one the backend asks for.

**DNS: registered at GoDaddy, served by Cloudflare.** That combination is what makes the apex usable at all — Railway serves a custom domain over a `CNAME`, and DNS forbids a `CNAME` at the apex; providers work around it with CNAME flattening / `ALIAS` / `ANAME`, and **GoDaddy has none**. So:

The nameservers already point at Cloudflare, so **apex-canonical is available and is the setup to keep**: in Cloudflare, `CNAME travelive.app → <railway target>` and `CNAME www → <railway target>`, both **DNS only** (grey cloud) so Railway issues and renews the certificate; in Railway, add **both** names as custom domains on the service. The app redirects `www` to the apex (ADR-0169 §2).

The alternative, recorded only so nobody re-derives it: staying on GoDaddy DNS would have forced `www`-canonical, with the apex on GoDaddy **Forwarding**. GoDaddy forwarding does not reliably carry the **path**, so a pasted `travelive.app/join/<code>` arrives at the `www` home page with the invite code gone — the app's one shared URL, silently eaten.

**A parked apex leaves a 301 behind.** GoDaddy's parking answers with a **permanent** redirect, and browsers cache those per profile and effectively forever. So a device that visited the apex while it was parked keeps opening `/lander` **after** the DNS is correct — working in incognito and failing in a normal window is the signature, and it means the server side is already fixed. Nothing deployable clears it: delete browsing data → _cached images and files_, all time (Chrome desktop and Android; iOS Safari: Settings → Safari → Clear History and Website Data). If the Cloudflare record is proxied (orange cloud), purge the Cloudflare cache too.

**If the apex serves a GoDaddy `/lander` page in incognito as well** (and inconsistently — one device fine, another not), that is the apex still resolving to GoDaddy's parking/forwarding servers rather than to Railway; leftover parked `A` records or an active Forwarding entry are the usual cause. It is a DNS-record problem, not a caching one — clearing the phone's cache can't help, and a device that "works" is usually just holding an older answer. Delete GoDaddy's parked `A`/`AAAA` records for `@` and turn Forwarding **off** before adding the real record.

## Verify after any deploy

- `GET /health` → 200, `GET /api/docs` renders (Swagger).
- App loads at `/`, Google login round-trips, a deep link (`/join/xyz`) serves the PWA, an unknown API path (`/trips/nope`) returns JSON — not HTML.
- Every other name the service answers on redirects to the canonical host with its path intact: `curl -sI https://<other-host>/join/xyz` → `302` + `location: https://<canonical>/join/xyz` (ADR-0169).
- Realtime: a change made on one device appears live on another (WS carries the cookie same-origin).
- Documents: upload a file and re-open it. The `S3_*` vars are **required in production** — with them unset the backend refuses the dev-only local-disk fallback and fails loud (`S3_BUCKET not configured`) rather than silently writing to the ephemeral container filesystem and losing every blob on the next redeploy (storage.ts).
- Routes (ADR-0205): open a day with two stops close enough to walk and confirm a travel time appears within a few seconds — the first ask answers `202` and warms, the next `200`. **A silence here is indistinguishable from a correct absence** (§D4 is the design), so if nothing ever appears, check the logs for `routing warm failed` rather than the UI: the endpoint answering is not evidence the provider is reachable.
- Sharing (ADR-0213): open a trip's share sheet, press **Live Link**, and open the resulting `/s/<code>` in a signed-out browser — it must render without redirecting to `/login`, and `curl -sI` on it must carry `cache-control: private, no-store` and `x-robots-tag: noindex...`. Then press **PDF**. **A PDF failure is the deploy-specific one here**: it is the only feature that needs a browser binary inside the image, so a `500` on `/shared-itineraries/<code>/pdf` almost always means `chromium` is missing from the runtime stage or `PDF_CHROMIUM_PATH` points somewhere else — check the logs for a launch error rather than the UI. CI's `pdf-smoke` job renders the reference trip inside the built image and verifies the artifact with pdfjs, so this should already be proven before a deploy.
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

The idle case above is **automatic**: `.github/workflows/sync-staging.yml` runs on every push to `main` and fast-forwards `staging` to match — but only via a plain (non-force) push, so it's a no-op whenever `staging` has diverged (i.e., someone's mid-test). A diverged `staging` is left alone, never silently clobbered.

The "after a test" case needs one manual step, because a squash-merged PR lands as a brand-new commit `staging`'s original commits aren't an ancestor of (even though the content matches) — so the automatic fast-forward can't tell that case apart from "still testing" and correctly declines to touch it. Run the manual **`Reset Staging to Main`** GitHub Action (`.github/workflows/reset-staging.yml`, `workflow_dispatch` — Actions tab → select it → **Run workflow**, works from the GitHub mobile UI too, no local git needed) once you're done, whether the test merged or was abandoned. It force-points `staging` at whatever `main` currently is.

This doesn't support two people testing unrelated changes on staging at once — they'd clobber each other — which is fine at the current team size and worth revisiting only if that stops being true.

**One-time setup that actually worked (human, Railway + GitHub dashboards):**

Railway's **Duplicate Environment** (environment dropdown → New Environment → duplicate from `production`) is the right starting point — it forks `waypoint` and `Postgres` as their own per-environment deployments automatically. It does **not**, however, fork every resource, and it copies every variable's **literal value**, including ones that must differ. After duplicating:

1. **Audit every variable it copied** — don't assume anything is correctly scoped just because duplication ran. Concretely:
   - `DATABASE_URL`: confirm it's a reference (`${{Postgres.DATABASE_URL}}` or `${{<postgres-service-id>.DATABASE_URL}}`) rather than a literal connection string. Postgres gets its own per-environment deployment/volume even under a shared service ID, so either reference form actually resolves correctly per-environment here — a literal copy of the connection string is the only broken case (production's stale password won't match staging's Postgres).
   - `S3_*`: duplication does **not** fork a new Storage Bucket — staging will still reference production's literal bucket ID. This is a real risk, not cosmetic (staging's DB is a clone of production's data, so document rows reference _real_ file keys in that bucket — a test delete/replace in staging can destroy a real production file). Add a **new, separate** Storage Bucket resource in the staging environment and repoint all five `S3_*` vars at it before doing anything with documents in staging.
   - `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DOC_ENCRYPTION_KEY`: regenerate all three (`openssl rand -base64 32` each) — these are always literal values, always copied verbatim, always wrong to share with production.
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: regenerate as a pair (`npx web-push generate-vapid-keys`), for the same reason and one of its own — a shared keypair makes a device subscribed on staging addressable from production. `VAPID_SUBJECT` may name the same contact.
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

1. Railway's ephemeral PR-preview environments — a possible future addition for per-PR preview links; the persistent `staging` environment (ADR-0104) covers the "stable pre-production URL" need instead.

## Non-goals for v1

Autoscaling, multi-region, blue/green, IaC beyond `railway.json`. Scale path and the exit story live in [ADR-0031](../decisions/0031-hosting-on-railway.md).
