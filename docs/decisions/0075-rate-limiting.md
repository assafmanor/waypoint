# 0075 — Endpoint-specific rate limiting

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Relates:** [0024](0024-app-shell-and-trip-lifecycle.md) (the public invite-preview/join surface being protected), [0031](0031-hosting-on-railway.md) (the Railway proxy whose `X-Forwarded-For` is trusted), [0070](0070-global-error-envelope-and-temporal-validation.md) (429s ride the shared error envelope), [0065](0065-app-scope-many-trips-small-groups.md) (public-ish growth is when this bites).

## Context

No endpoint had any rate limiting (backend architecture review, 2026-07-18, **B-10**). The unauthenticated `GET /invites/:token` is an HMAC oracle that could be hammered; `POST /auth/refresh` and `POST /trips/join/:token` are cheap abuse/DoS targets; large uploads and `sinceSeq=0` are expensive. Hardening, not an active exploit — but the kind that bites once the app is public-ish (ADR-0065).

## Decision

Add `@nestjs/throttler` with a **global `ThrottlerGuard`** and one generous per-IP `default` policy — **300 requests / 60s** — so an offline client flushing a queued burst on reconnect (outbox replay + paged catch-up) is never 429'd. The **abuse targets tighten it per-route** with `@Throttle({ default: { limit: 20, ttl: 60_000 } })`: `POST /auth/refresh`, `POST /trips/join/:token`, and `GET /invites/:token`. In-memory storage — single-instance by design (ADR-0019); a multi-instance deploy would swap in a shared store.

`X-Forwarded-For` is trusted **only in production** (`app.set('trust proxy', 1)` — exactly one hop, Railway's proxy) so the limiter keys on the real client IP; in dev, XFF is not trusted (it would let a client spoof its IP). A tripped limit is a **429** carrying `Retry-After`, mapped to the documented envelope as `RATE_LIMITED` (ADR-0070).

## Consequences

- The public invite/refresh/join surface is no longer freely hammerable; general and sync traffic keep a generous ceiling that legitimate reconnect bursts stay well under.
- This is the abuse-resistance layer that short/guessable invite codes (the separate B-07 work) lean on.
- Single-instance only for now (in-memory counters); documented as the swap point if the app ever scales horizontally.
- Regression test (`throttler.e2e.spec.ts`, real app over HTTP): hammering `/invites/:token` past the cap returns 429 with `Retry-After`, while the first calls pass.

## Alternatives considered

- **Proxy/edge-level limiting only.** Fine as an additional layer, but app-level limits are portable across hosts and let policy be endpoint-specific (tight on the HMAC oracle, generous on sync) in one place.
- **A single global limit for everything.** Either too tight (429s a legitimate offline flush) or too loose (leaves the oracle hammerable); the generous-default + per-route-tight split resolves that tension.
- **Trust `X-Forwarded-For` always.** Rejected — in dev (or any non-proxied deploy) it lets a client forge its IP and evade the limit; only the known Railway hop is trusted.
