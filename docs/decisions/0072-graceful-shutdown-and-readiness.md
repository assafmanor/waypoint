# 0072 — Graceful shutdown + a readiness endpoint distinct from liveness

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Refines:** [0031](0031-hosting-on-railway.md) (Railway single-image deploy, `healthcheckPath`).
**Relates:** [0019](0019-sync-protocol.md) (the WS server being closed on shutdown).

## Context

Two deployment gaps (backend architecture review, 2026-07-18, **B-08**):

- `PrismaService` implements `OnModuleDestroy`, but without `app.enableShutdownHooks()` Nest never invokes it on SIGTERM — Prisma won't disconnect cleanly and in-flight requests / WS frames are cut on every deploy. The raw `ws` server was likewise never closed.
- `/health` returned a static `ok`, and `railway.json` used it as the deploy health gate. So Railway would route traffic to a freshly-deployed instance whose DB is unreachable (the migrate/connection isn't checked), and operators had no readiness signal.

## Decision

1. **Graceful shutdown.** `app.enableShutdownHooks()` in `bootstrap()` so Nest runs `OnModuleDestroy`/`OnApplicationShutdown` on SIGTERM/SIGINT. `PrismaService` disconnects (already wired), and `SyncGateway` now implements `onApplicationShutdown()` to close every live socket (WS 1001 "going away") and the `WebSocketServer` — no frames severed mid-transaction, no leaked listener.
2. **Split liveness from readiness.**
   - `GET /health` stays a **static liveness** signal, deliberately independent of DB/storage, so a transient dependency blip never triggers a restart loop. This is what a process-restart policy should watch.
   - `GET /health/ready` is **readiness**: a cheap `SELECT 1`. It returns 503 (`NOT_READY`) when the DB is unreachable.
   - `railway.json`'s `healthcheckPath` moves to **`/health/ready`**, so a new instance is only routed to once its DB is actually reachable.

## Consequences

- Deploys drain cleanly: Prisma disconnects and WS clients are told to go away (they reconnect via the normal catch-up path, ADR-0019) instead of seeing severed connections.
- The deploy gate now reflects "can actually serve," while liveness stays independent of transient failures — the two signals no longer conflated.
- Regression tests (`health.controller.spec.ts`): liveness never touches the DB; readiness returns `ready` when the DB answers and **503** when it throws.

## Alternatives considered

- **Make `/health` itself do the DB check.** Rejected — conflating liveness with a dependency check is exactly what causes restart loops when the DB blips; the two need to be separate endpoints.
- **A full readiness aggregation (DB + storage HEAD + …).** The DB check is the high-value one and cheapest; a storage HEAD can be added to `/health/ready` later without changing the contract.
