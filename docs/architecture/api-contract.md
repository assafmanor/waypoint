# API Contract — v1

**Status:** PROPOSED (for review). REST over HTTPS + a WebSocket channel for realtime. All request/response bodies validated with the zod schemas in `packages/shared`. JSON, camelCase.

## Conventions

- Base URL: `/` on the API service (see `VITE_API_BASE_URL`).
- Auth: `Authorization: Bearer <JWT>` on every route except `/health` and the auth routes. See [auth-and-google.md](auth-and-google.md).
- **Authorization:** every trip-scoped route checks the caller's `Membership` for that `tripId`. No membership → `404` (not `403`, to avoid leaking existence).
- IDs are opaque strings (cuid). Timestamps are ISO-8601 UTC.
- Errors: `{ "error": { "code": string, "message": string, "details"?: object } }` with appropriate HTTP status.
- Mutations that change shared trip state also emit a `Change` and broadcast it (see [sync-and-offline.md](sync-and-offline.md)).

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness (implemented) |

## Auth (detail in auth-and-google.md)

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/google` | Begin Google OAuth |
| GET | `/auth/google/callback` | OAuth callback → issue session JWT |
| POST | `/auth/refresh` | Refresh session |
| POST | `/auth/logout` | Invalidate session |
| GET | `/me` | Current user + memberships |

## Trips

| Method | Path | Body → Response |
|---|---|---|
| POST | `/trips` | `createTripSchema` → `Trip` (caller becomes creator + peer member) |
| GET | `/trips` | → `Trip[]` (trips the caller is a member of) |
| GET | `/trips/:tripId` | → `Trip` + members |
| PATCH | `/trips/:tripId` | partial trip → `Trip` |
| POST | `/trips/:tripId/invite` | → `{ inviteUrl }` (signed join token) |
| POST | `/trips/join/:token` | → `Membership` (adds caller as peer) |

## Days & Events

| Method | Path | Body → Response |
|---|---|---|
| GET | `/trips/:tripId/days` | → `Day[]` with nested `Event[]` |
| POST | `/trips/:tripId/events` | `createEventSchema` → `Event` |
| PATCH | `/trips/:tripId/events/:eventId` | `updateEventSchema` → `Event` |
| POST | `/trips/:tripId/events/:eventId/status` | `{ status }` → `Event` (done/skipped/…) |
| POST | `/trips/:tripId/events/:eventId/move` | `{ dayId?, startTime?, sortOrder? }` → `{ event, rippleSuggestion? }` |
| DELETE | `/trips/:tripId/events/:eventId` | → `204` |

**Hard-event guard (ADR-0011):** PATCH/move/DELETE on an event with `kind = hard` requires `?confirm=true` (or `{ confirm: true }`); without it the API returns `409 HARD_EVENT_REQUIRES_CONFIRM` with the linked booking info. Ripple never touches hard events.

## Bookings (the index)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/trips/:tripId/bookings` | → `Booking[]` (offline-cached client-side) |
| POST | `/trips/:tripId/bookings` | `createBookingSchema` → `Booking` |
| PATCH | `/trips/:tripId/bookings/:bookingId` | partial → `Booking` |
| DELETE | `/trips/:tripId/bookings/:bookingId` | → `204` (warns if a hard event depends on it) |

## Maybe shelf

| Method | Path | Body → Response |
|---|---|---|
| GET | `/trips/:tripId/maybe` | → `MaybeItem[]` |
| POST | `/trips/:tripId/maybe` | `{ title, icon?, meta?, placeId? }` → `MaybeItem` |
| POST | `/trips/:tripId/maybe/:id/schedule` | `{ dayId, startTime? }` → `Event` (marks item consumed) |

## Documents

| Method | Path | Purpose |
|---|---|---|
| GET | `/trips/:tripId/documents` | List document metadata |
| POST | `/trips/:tripId/documents` | Upload (multipart) → encrypted at rest (ADR-0015) |
| GET | `/trips/:tripId/documents/:id/content` | Decrypted stream to an authorized member |

## Change feed

| Method | Path | Purpose |
|---|---|---|
| GET | `/trips/:tripId/changes?since=<ts>` | Change history since a timestamp (also used to catch up after offline) |

## Realtime

- `WS /trips/:tripId/stream` — server pushes change events to connected members. Message protocol in [sync-and-offline.md](sync-and-offline.md).

## Out of scope for v1

Expense endpoints, flight-status, Gmail import (v1.1), member location. Kept out per PRD.
