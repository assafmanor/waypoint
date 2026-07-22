# Session 66 — Staging environment stood up (ADR-0104), two Railway lessons learned the hard way

Follow-through on ADR-0104: the repo-side pieces (workflow files, docs) shipped via PR #214, then this session did the actual Railway/Google Cloud dashboard work to make staging live. That part didn't go in a straight line, and two of the detours are worth recording so the next person (or agent) doesn't re-learn them from scratch.

## What shipped

- Railway: a `staging` environment in the existing project, its own Postgres, its own Storage Bucket, its own set of secrets.
- `.github/workflows/deploy-staging.yml`: runs on push/PR to `staging`, reuses `ci.yml`'s jobs via `workflow_call`, deploys via `railway up` with a staging-scoped `RAILWAY_STAGING_TOKEN` — the `deploy` job is gated `if: github.event_name == 'push'` so a PR into `staging` only runs tests, never deploys.
- `.github/workflows/ci.yml`: scoped back to `main` only (PR + push) — briefly experimented with dropping the push trigger, reverted; main and staging triggers are now fully disjoint by design.
- Production hardened in passing: `DATABASE_URL` and all five `S3_*` vars converted from ID-pinned Railway reference variables (`${{<uuid>.VAR}}`) to name-based ones (`${{Postgres.DATABASE_URL}}`, `${{"S3 Storage".VAR}}`) — not just a staging concern, this is what makes production itself safely duplicable going forward.
- `deployment.md`'s staging section rewritten to describe what actually worked (Duplicate Environment), not the from-scratch manual build ADR-0104 originally proposed.
- A `FRONTEND_URL` doc bug fixed: `deployment.md` and ADR-0104 both said it should stay unset in production. It shouldn't — see below.

## Lesson 1 — Railway reference-variable syntax determines whether duplication isolates a resource

Two forms of Railway reference variable look similar but behave completely differently under "Duplicate Environment":

- **Name-based**, `${{ServiceName.VAR}}` — resolves against whichever resource has that name _in the environment currently being evaluated_. Survives duplication correctly: a forked environment's same-named resource is what gets picked up.
- **ID-pinned**, `${{<uuid>.VAR}}` — always resolves to that one specific resource, full stop, regardless of which environment the referencing service lives in.

Production's `S3_*` vars turned out to be ID-pinned. Duplicating the environment forked `waypoint` and `Postgres` cleanly (each got its own per-environment deployment, even though the Railway "service" ID is shared at the project level — deployments/volumes are what's actually per-environment), but the Storage Bucket wasn't a "service" duplication touches at all, and the ID-pinned reference meant staging's `waypoint` kept pointing at production's literal bucket. This was a real risk, not a cosmetic one: staging's Postgres came back from the duplicate with a **full copy of production's data**, including document rows referencing real file keys in that shared bucket — a test delete/replace in staging could have destroyed a real production file. Fixed by creating a separate Storage Bucket resource for staging and repointing all five `S3_*` vars. Production's own vars were also converted to name-based syntax (`DATABASE_URL` too, which had been a hardcoded literal, not a reference at all) so this doesn't recur if the environment is ever duplicated again.

**Takeaway:** before trusting "Duplicate Environment" to isolate something, check the actual reference syntax on the source environment's variables, not just whether a value happens to look different per environment.

## Lesson 2 — `FRONTEND_URL` is not dev-only; it's the post-login redirect target everywhere

`GOOGLE_OAUTH_REDIRECT_URI` only controls where **Google** calls back to (your backend's `/auth/google/callback`). Separately, `AuthController.googleCallback` (`backend/src/auth/auth.controller.ts`) does `res.redirect(frontendUrl())` after handling that callback — success or cancelled — where `frontendUrl()` reads `process.env.FRONTEND_URL` with a hardcoded fallback of `http://localhost:5173`.

The docs (both `deployment.md` and ADR-0104) said this var should stay unset in production, framing it as dev-only CORS glue for the `:5173`→`:3000` gap. That's incomplete — production needs it set to its own domain for login to actually redirect back to the app rather than `localhost`. During staging setup this produced a genuinely confusing symptom: after fixing `GOOGLE_OAUTH_REDIRECT_URI`, the Google consent popup correctly showed the staging domain — but completing login still landed the browser on **production**, because `FRONTEND_URL` was still the value cloned from production and nobody had reason to suspect a second, separately-named variable was involved.

Both docs are corrected now (`deployment.md`'s env var table + a `## Amendment` section on ADR-0104, per this repo's amendment convention rather than editing the original decision text).

## Debugging detour (for context, not repeated here as procedure)

The first staging attempt was a manual from-scratch build (per ADR-0104's original plan): new environment, `+ New → Database → Postgres`. That Postgres ended up in a broken state — a `DATABASE_URL` hardcoded to production's literal connection string caused a `P1000` auth failure; fixing the reference actually resolved it, but a `railway-agent` MCP tool call had already staged a volume deletion in response to a misdiagnosis ("stale password baked into the volume"), and the follow-up attempts to reattach a volume via the same tool left several orphaned volume records the API couldn't reconcile. Rather than keep fighting that, the environment was deleted outright and rebuilt via **Duplicate Environment** instead, which is faster and (once its two gaps above are closed) more reliable. `deployment.md`'s staging runbook documents the duplicate-and-audit approach as the recommended path; the from-scratch steps aren't preserved as procedure.

## Standard procedure going forward

Documented in `deployment.md`'s staging section: most changes still ship via the normal task-branch → PR → `main` flow, unchanged. `staging` is an optional proving ground for changes worth seeing live (real OAuth, real deployed build) before they reach `main` — push/PR the task branch to `staging` first when that's warranted, verify at `wpnt-staging.up.railway.app`, then open the normal PR to `main`. Staging's database is disposable, not a durable environment.

## Backlog

The "Railway staging environment dashboard setup (human)" backlog line is retired — everything in it shipped this session.
