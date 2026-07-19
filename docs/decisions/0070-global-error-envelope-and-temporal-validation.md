# 0070 — One global error envelope + domain validation of dates/timezone

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Relates:** [0019](0019-sync-protocol.md) / [0042](0042-shared-state-is-offline-syncable.md) (the offline outbox needs to tell a permanent 4xx from a retryable 5xx), [0023](0023-zod-first-entities-and-openapi.md) (zod as the single source of truth for validation + OpenAPI), `api-contract.md` §14 (the documented error shape).

## Context

`api-contract.md` §14 states the error contract is `{ error: { code, message, details? } }`, but only _some_ paths produced it (backend architecture review, 2026-07-18, **B-05**). The `ZodValidationPipe` and service `ConflictException`s emitted the envelope; `MembershipGuard` 401/404s, `NotFoundException`s, and uncaught Prisma errors emitted Nest's default `{ statusCode, message, error }`. So the client could not reliably branch on error shape — which matters most for the offline outbox, which has to distinguish "permanent 4xx → drop the queued write" from "retryable 5xx → keep it".

Second, several temporal fields were bare `z.string()`: `date`, `startsAt`, `endsAt` on events; `startDate`/`endDate`/`timezone` on trips. `date: z.string()` accepted `"banana"` → `new Date("banana")` → an Invalid-Date Prisma write → **500**. A bad `timezone` later threw a `RangeError` inside `Intl.DateTimeFormat` in `assertValidMoveTarget` → a 500 on every nudge. Both are client-fixable input that surfaced as opaque 500s.

## Decision

1. **One global exception filter** (`common/all-exceptions.filter.ts`, `@Catch()`), registered app-wide in `bootstrap()`, maps _every_ error to `{ error: { code, message, details? } }`:
   - An exception that already threw the envelope (the zod pipe's `VALIDATION_ERROR`, the document 415) passes through unchanged.
   - Other `HttpException`s are re-wrapped with a status-derived `code` (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, …), keeping the app-authored message.
   - Known Prisma codes map to stable statuses with **generic** messages (never leaking column/constraint names): `P2002`→409 `CONFLICT`, `P2025`→404 `NOT_FOUND`, `P2003`→409 `CONSTRAINT_VIOLATION`.
   - Anything else is a 500 `INTERNAL_ERROR` with a generic message; the real error is logged server-side.
     This filter **absorbs the old `SpaFallbackFilter`**: a browser document navigation (GET + `Accept: text/html`) that 404/401s still loads the PWA shell, but only when a built SPA index path is injected (production) — dev/test get JSON for everything. Folding the two avoids global-filter ordering ambiguity.

2. **Domain-typed temporal fields** in `packages/shared` (one definition validates client + server, ADR-0023): `dateOnlySchema = z.iso.date()` (a real `YYYY-MM-DD`, rejects `2026-02-30`), `isoDateTimeSchema = z.iso.datetime({ offset: true })` (accepts `Z` and numeric offsets like `+09:00`), and `timezoneSchema` (validated with the same ICU `Intl.DateTimeFormat` the runtime uses, so a bad zone is a 400 here, not a `RangeError` 500 later). Applied to the event create/update/move + booking-event-seed schemas and the trip create/update schemas.

## Consequences

- The client can branch on a single, stable error shape; the offline outbox's drop-vs-retry decision is now well-defined by status class.
- Malformed dates/timezones are rejected at the edge with a 400 `VALIDATION_ERROR` instead of blowing up mid-write or mid-render as a 500.
- 500s are logged with method/URL (never the body) so they stay diagnosable while nothing sensitive is returned to the caller.
- Regression tests: the filter maps guard 404, 403, Prisma P2002/P2025, and an unexpected `Error` to the envelope (and still serves the SPA for html navs); the shared schema rejects `date:"banana"`, `2026-02-30`, a non-datetime `startsAt`, and `timezone:"Mars/Olympus"` while accepting `Z`/offset datetimes and real IANA zones.

## Alternatives considered

- **Keep the two filters separate, order them.** Rejected — global-filter precedence for overlapping `@Catch()` is easy to get subtly wrong across Nest versions; one catch-all with the SPA branch inside is unambiguous.
- **Validate timezone against a hard-coded `Intl.supportedValuesOf('timeZone')` set.** Equivalent in effect but can drift from what the runtime's ICU actually accepts (aliases, `UTC`); using the same `Intl.DateTimeFormat` construction that the app uses at runtime is exactly the right oracle.
- **Leave dates as `z.string()` and coerce defensively in services.** Rejected — pushes the same check into every call site; the schema is the single source of truth (ADR-0023).
