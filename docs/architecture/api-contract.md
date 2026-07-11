# API Contract — v1

**Status:** ACCEPTED (T-025). REST over HTTPS + a WebSocket channel for realtime. All request/response bodies validated with the zod schemas in `packages/shared` (via a `ZodValidationPipe`, not class-validator). JSON, camelCase.

## Conventions

- Base URL: `/` on the API service (single-origin with the PWA in prod, ADR-0020).
- Auth: `Authorization: Bearer <access JWT>` on protected routes; **`/auth/refresh` + `/auth/logout` use the httpOnly refresh cookie instead** (ADR-0020). Exceptions: `/health` and the auth routes.
- **Authorization:** every trip-scoped route checks the caller's `Membership` for that `tripId`. No membership → `404` (not `403`, to avoid leaking existence).
- **IDs are client-generated** opaque strings (cuid/uuid), validated for format server-side (ADR-0018). Timestamps are ISO-8601 UTC.
- Mutations go through `ChangeService` — entity write + `Change` in one transaction, broadcast post-commit (ADR-0019).
- Errors: `{ "error": { "code": string, "message": string, "details"?: object } }` with appropriate HTTP status.
- Mutations that change shared trip state also emit a `Change` and broadcast it (see [sync-and-offline.md](sync-and-offline.md)).

## Health

| Method | Path      | Auth | Purpose                |
| ------ | --------- | ---- | ---------------------- |
| GET    | `/health` | none | Liveness (implemented) |

## Auth (detail in auth-and-google.md)

| Method | Path                    | Purpose                            |
| ------ | ----------------------- | ---------------------------------- |
| GET    | `/auth/google`          | Begin Google OAuth                 |
| GET    | `/auth/google/callback` | OAuth callback → issue session JWT |
| POST   | `/auth/refresh`         | Refresh session                    |
| POST   | `/auth/logout`          | Invalidate session                 |
| GET    | `/me`                   | Current user + memberships         |

## Trips

| Method | Path                             | Body → Response                                                                     |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/trips`                         | `createTripSchema` → `Trip` (caller becomes creator + **`admin`** member, ADR-0005) |
| GET    | `/trips`                         | → `Trip[]` (all trips the caller is a member of — multi-trip, ADR-0021)             |
| GET    | `/trips/:tripId`                 | → `Trip` + members                                                                  |
| PATCH  | `/trips/:tripId`                 | partial trip → `Trip`                                                               |
| POST   | `/trips/:tripId/invite`          | → `{ inviteUrl }` (signed join token)                                               |
| POST   | `/trips/join/:token`             | → `Membership` (adds caller as peer; idempotent, keeps existing role on rejoin)     |
| DELETE | `/trips/:tripId/members/:userId` | → `204` (self = leave, anyone; others = admin-only, ADR-0005)                       |

## Events

There is no `Day` resource — events carry `date` (ADR-0018); the client groups by date. Empty days derive from the trip range.

| Method | Path                                    | Body → Response                                                     |
| ------ | --------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/trips/:tripId/events`                 | → `Event[]` (client groups by `date`)                               |
| POST   | `/trips/:tripId/events`                 | `createEventSchema` (incl. client `id`) → `Event`                   |
| PATCH  | `/trips/:tripId/events/:eventId`        | `updateEventSchema` → `Event`                                       |
| POST   | `/trips/:tripId/events/:eventId/status` | `{ status }` → `Event` (done/skipped)                               |
| POST   | `/trips/:tripId/events/:eventId/move`   | `{ date?, startsAt?, sortOrder? }` → `{ event, rippleSuggestion? }` |
| DELETE | `/trips/:tripId/events/:eventId`        | → `204`                                                             |

**Hard-event guard (ADR-0011):** PATCH/move/DELETE on an event with `kind = hard` requires `?confirm=true` (or `{ confirm: true }`); without it the API returns `409 HARD_EVENT_REQUIRES_CONFIRM` with the linked booking info. Ripple never touches hard events.

## Bookings (the index)

| Method | Path                                 | Body → Response                               |
| ------ | ------------------------------------ | --------------------------------------------- |
| GET    | `/trips/:tripId/bookings`            | → `Booking[]` (offline-cached client-side)    |
| POST   | `/trips/:tripId/bookings`            | `createBookingSchema` → `Booking`             |
| PATCH  | `/trips/:tripId/bookings/:bookingId` | partial → `Booking`                           |
| DELETE | `/trips/:tripId/bookings/:bookingId` | → `204` (warns if a hard event depends on it) |

## Maybe shelf

| Method | Path                                | Body → Response                                                      |
| ------ | ----------------------------------- | -------------------------------------------------------------------- |
| GET    | `/trips/:tripId/maybe`              | → `MaybeItem[]`                                                      |
| POST   | `/trips/:tripId/maybe`              | `createMaybeItemSchema` (`{ title, icon?, placeId? }`) → `MaybeItem` |
| POST   | `/trips/:tripId/maybe/:id/schedule` | `{ date, startsAt? }` → `Event` (marks item consumed)                |

## Documents

| Method | Path                                   | Purpose                                           |
| ------ | -------------------------------------- | ------------------------------------------------- |
| GET    | `/trips/:tripId/documents`             | List document metadata                            |
| POST   | `/trips/:tripId/documents`             | Upload (multipart) → encrypted at rest (ADR-0015) |
| GET    | `/trips/:tripId/documents/:id/content` | Decrypted stream to an authorized member          |

## Snapshot & change feed (ADR-0019)

| Method | Path                                  | Purpose                                                                                                      |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/trips/:tripId/snapshot`             | Full current trip state **+ `latestSeq`**, read in one transaction — the initial-load / deep-desync baseline |
| GET    | `/trips/:tripId/changes?sinceSeq=<n>` | Change history since a `seq` (reconnect catch-up). **Cursor on `seq`, not timestamps.**                      |

## Realtime

- `WS /trips/:tripId/stream` — server pushes `change` events (each carrying its `seq`) to connected members; `hello` carries `latestSeq` for gap-detection. Authenticated via the session cookie. Message protocol in [sync-and-offline.md](sync-and-offline.md).

## Out of scope for v1

Expense endpoints, flight-status, Gmail import (v1.1), member location. Kept out per PRD.
