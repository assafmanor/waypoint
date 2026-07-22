# 0104 — Staging environment on Railway + gated `staging` branch deploy

**Status:** Accepted
**Date:** 2026-07-21
**Builds on:** [0031](0031-hosting-on-railway.md) (hosting on Railway, one project for everything)

## Amendment (2026-07-22, post-standup) — `FRONTEND_URL` is required, not unset

Standing up staging surfaced that this ADR's own claim below — "`DEV_AUTH` and `FRONTEND_URL` stay unset, exactly as in production" — is wrong about `FRONTEND_URL`. `AuthController`'s Google callback redirects the browser to `frontendUrl()` after every login (success or cancelled), which falls back to `http://localhost:5173` when the env var is unset. Every deployed environment, staging included, needs `FRONTEND_URL` explicitly set to its own origin, or Google login silently redirects to `localhost` (or, if copied verbatim from another environment during setup, to _that_ environment's domain instead of the one the user is actually on). `docs/architecture/deployment.md` carries the corrected guidance and the full staging runbook, including the Duplicate-Environment approach that was actually used (this ADR's original setup section below assumed a from-scratch build that was never exercised). The rest of this ADR — the decision itself — stands.

## Context

[deployment.md](../architecture/deployment.md) explicitly deferred a staging environment for v1 ("Railway PR environments can cover it later") and flagged "CI on PRs" as worth adding. CI (`.github/workflows/ci.yml`) has since shipped. A staging environment is now wanted: a stable, always-on deploy target for testing changes against real Google OAuth + a real (non-production) database before they reach `main`/production, reachable at a fixed URL the group can revisit (unlike an ephemeral per-PR preview).

## Decision

**One more Railway environment in the existing project, not a second project.** Railway's built-in multi-environment feature adds a `staging` environment alongside production inside the same project — preserving ADR-0031's "one project for everything." Each environment gets its **own** service instance (same Dockerfile/`railway.json`), its **own** Postgres, and (once documents are wired into staging) its **own** Storage Bucket. Staging never reads or writes production's database or bucket.

**A persistent `staging` git branch is the deploy source**, tracked by the staging environment's service. Deploys are **gated by CI**, not fired directly by Railway's git webhook:

- `.github/workflows/ci.yml` gains a `workflow_call` trigger so its jobs (typecheck/build/test/lint/e2e) are reusable.
- A new `.github/workflows/deploy-staging.yml` runs on push to `staging`: it calls the reused CI jobs first, and only on green, deploys via the Railway CLI (`railway up`) using a **project token scoped to the staging environment only** (`RAILWAY_STAGING_TOKEN` GitHub secret) — never the account-wide token, so a compromised secret can't touch production.
- Railway's own git auto-deploy trigger is turned **off** for the staging service/environment, so the Action is the only path to a staging deploy and a red test suite never reaches it.

**Secrets are never copied verbatim from production.** Duplicating the production service's variable list is a fine starting point for _names_, but several values must be regenerated or repointed per-environment:

- `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DOC_ENCRYPTION_KEY` — fresh values (`openssl rand -base64 32`). Reusing production's would mean a staging token/ciphertext is valid against — or decryptable in — production, and vice versa.
- `DATABASE_URL` — the environment-scoped reference variable (`${{Postgres.DATABASE_URL}}`) must resolve to **staging's** Postgres plugin instance. A literal copy-paste of production's connection string would point staging at the production database.
- `GOOGLE_OAUTH_REDIRECT_URI` — the staging domain's callback URL, added to the OAuth client's Authorized redirect URIs (reusing the same OAuth client as production is fine; it accepts multiple redirect URIs).
- `S3_*` — a separate staging bucket (or left unset, falling back to the dev-only local-disk path, acceptable early on) so staging traffic can't corrupt or delete production documents.
- `DEV_AUTH` and `FRONTEND_URL` stay unset, exactly as in production (ADR-0031/ADR-0020 constraints don't change per-environment).

## Consequences

- `docs/architecture/deployment.md` gains a staging section and its "Still open" list drops the staging line.
- `RAILWAY_STAGING_TOKEN` (a Railway _project_ token, environment-scoped) is a new required GitHub Actions secret; it must never be the account token.
- The `staging` branch is long-lived (not a task branch); merges into it are how a change reaches staging, same as `main` reaches production.
- Manual, one-time Railway/Google Cloud dashboard steps (creating the environment, Postgres, optionally a bucket, generating the token, adding the redirect URI, turning off git auto-deploy for that service) aren't automatable from this repo and are tracked as a backlog "human" item until done.

## Alternatives considered

- **A second Railway project for staging.** Rejected: doubles the billing/plan surface ADR-0031 deliberately kept singular, and environment-scoped reference variables (`${{Postgres.DATABASE_URL}}`) work within one project, not across two.
- **Railway's ephemeral PR environments.** Still a good future addition for per-PR preview links, but doesn't replace a stable, bookmarkable staging URL for manual testing — deferred, not chosen instead.
- **Let Railway's native git auto-deploy trigger staging directly** (no gating Action). Simpler, but a broken push to `staging` would deploy immediately; explicitly rejected so tests actually gate the environment meant for pre-production testing.
