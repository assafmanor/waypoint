# 0071 — Fail-fast configuration validation + a production DEV_AUTH guard

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Relates:** [0020](0020-auth-session-architecture.md) (the secrets/keys being validated; the `DEV_AUTH` bypass), [0031](0031-hosting-on-railway.md) (Railway single-origin deploy this protects), [0015](0015-document-encryption-server-side.md)/[0034](0034-document-encryption-trust-model.md) (the doc/token keys).

## Context

Critical secrets (`JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DOC_ENCRYPTION_KEY`, `GOOGLE_*`) were validated only lazily, on first use by a request (`requireEnv` throws when first touched). So a misconfigured production deploy booted "healthy" — the health check passed — and only failed at the first login or upload (backend architecture review, 2026-07-18, **B-04**). The storage layer already had a fail-loud guard (`storageBucket()` throws in production when no bucket is set); auth/secrets did not.

Worse, `DEV_AUTH=1` turns any un-tokened request into the seeded dev user (ADR-0020), with **no guard preventing it in production** — an accidental `DEV_AUTH=1` in a production deploy is a latent full authentication bypass.

## Decision

1. **A startup config validator** (`common/validate-config.ts`, `validateConfig`) runs in `bootstrap()` **before `listen()`**. On any problem it prints the offending var **names** (never their values) and the process exits non-zero, so a bad deploy dies immediately instead of serving traffic. It checks: the three keys decode from base64 to exactly 32 bytes; the Google OAuth vars are present; URLs (`GOOGLE_OAUTH_REDIRECT_URI`, `FRONTEND_URL`) parse. Presence is **required in production**; in dev the same fields are still format-checked when present (catches a typo) but may be absent — a `DEV_AUTH` sandbox needs no Google credentials.
2. **Refuse to boot if `DEV_AUTH=1` while `NODE_ENV=production`** — the one check that applies in every environment.
3. **Defense in depth:** the `DEV_AUTH` bypass itself is gated behind `isDevAuthEnabled()` (`process.env.DEV_AUTH === '1' && NODE_ENV !== 'production'`), used by both `JwtAuthGuard` and `SyncGateway`. Even if the boot check were somehow skipped, the bypass is inert in production.

## Consequences

- A misconfigured production deploy fails fast and loud, with a precise (value-free) reason, instead of booting healthy and failing at the first login/upload.
- An accidental production `DEV_AUTH=1` cannot boot, and is inert even if it did — the full-auth-bypass footgun is closed at two layers.
- Dev/test and `DEV_AUTH` sandboxes are unaffected: absent Google credentials are fine there, only format is checked when present.
- Regression tests (`validate-config.spec.ts`): a missing/short key → throws; `DEV_AUTH=1`+production → throws; a valid production config passes; the error message never contains a secret value.

## Alternatives considered

- **Keep lazy `requireEnv` only.** Rejected — it's the exact behavior that lets a broken deploy pass the health check; fail-fast at boot is the whole point.
- **A full config module (`@nestjs/config` + a schema class).** More machinery than warranted for a handful of vars; a single boot-time function is easier to reason about and test, and mirrors the existing fail-loud storage guard.
- **Require Google credentials in every environment.** Rejected — it would break the documented `DEV_AUTH` headless/agent workflow (CLAUDE.md) that intentionally has no Google setup.
