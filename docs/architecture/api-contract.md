# API Contract — v1

**Status:** ACCEPTED (T-025). REST over HTTPS + a WebSocket channel for realtime. All request/response bodies validated with the zod schemas in `packages/shared`. JSON, camelCase.

**Validation (ADR-0023):** entity shapes (`Trip`, `Membership`, `TripEvent`, `Booking`, `MaybeItem`, `Place`, `TripSnapshot`, ...) are zod schemas in `packages/shared/src/entities.ts`; their TS types are `z.infer` of those schemas — one shape per entity, not a separate hand-written interface. Requests are validated against `packages/shared` input schemas via the repo's `ZodValidationPipe`; responses on migrated routes are validated/stripped via `nestjs-zod`'s `@ZodSerializerDto`. OpenAPI (`/api/docs`) is generated directly from the same zod schemas via `createZodDto` — no hand-written `@ApiProperty` DTOs to keep in sync.

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

| Method | Path                             | Body → Response                                                                                                                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/trips`                         | `createTripSchema` → `Trip` (caller becomes creator + **`admin`** member, ADR-0005)                                                         |
| GET    | `/trips`                         | → `Trip[]` (all trips the caller is a member of — multi-trip, ADR-0021)                                                                     |
| GET    | `/trips/:tripId`                 | → `Trip` + members                                                                                                                          |
| PATCH  | `/trips/:tripId`                 | partial trip → `Trip` (**admin-only**, ADR-0039; `endDate >= startDate` refine, ADR-0023)                                                   |
| DELETE | `/trips/:tripId`                 | → `204` (**admin-only**, double-confirm; deletes the trip for everyone — ADR-0039)                                                          |
| POST   | `/trips/:tripId/invite`          | → `{ inviteUrl }` (frontend `/join/:token` shell route, ADR-0024 — not the API's own `/trips/join/:token`)                                  |
| GET    | `/invites/:token`                | **public** → `{ tripName, destination, startDate, endDate, memberCount }` (join preview, ADR-0024; validates the HMAC token, no membership) |
| POST   | `/trips/join/:token`             | `joinTripSchema` (`{ calendarSyncEnabled? }`) → `Membership` (peer join; idempotent; rejoin re-applies the flag)                            |
| PATCH  | `/trips/:tripId/members/me`      | `updateMembershipPrefsSchema` (`{ calendarSyncEnabled }`) → `Membership` (caller's own row only, ADR-0005)                                  |
| PATCH  | `/trips/:tripId/members/:userId` | `{ role }` → `Membership` (**admin-only**; promote a peer to `admin`, ADR-0039; no explicit demotion in v1)                                 |
| DELETE | `/trips/:tripId/members/:userId` | → `204` (self = leave, anyone; others = admin-only, ADR-0005; last admin leaving auto-promotes another member, ADR-0039)                    |

**Trip-settings mutations are data-plane (ADR-0039, partially superseding ADR-0022):** `PATCH`/`DELETE /trips/:tripId`, the member-role `PATCH`, and member removal route through `ChangeService.mutate()` — atomic write + `Change`, WS broadcast after commit, client optimistic + offline outbox — so settings edits are realtime and offline-capable like the timeline. (`PATCH .../members/me` for the personal `calendarSyncEnabled` pref may stay simple CRUD — it is not shared roster state.)

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

| Method | Path                                 | Body → Response                                    |
| ------ | ------------------------------------ | -------------------------------------------------- |
| GET    | `/trips/:tripId/bookings`            | → `Booking[]` (offline-cached client-side)         |
| POST   | `/trips/:tripId/bookings`            | `createBookingSchema` → `Booking`                  |
| PATCH  | `/trips/:tripId/bookings/:bookingId` | partial → `Booking`                                |
| DELETE | `/trips/:tripId/bookings/:bookingId` | → `204` (`?deleteEvents=`, `?confirm=`; see below) |

**Auto-create-on-save (ADR-0047 §1 / ADR-0048):** `createBookingSchema` carries an optional `event` seed (`{ id?, date, startsAt?, endsAt?, endDate?, kind?, icon?, category? }`). When present, the booking and its linked `Event` are written in **one transaction** (two `Change` rows — `booking:create` then `event:create` — via `ChangeService.mutateMany()`). The event's place lives on the booking, so its own `placeId` is null (ADR-0051); `kind` defaults `hard`; `category` falls back to the booking type only when the seed gives none. Re-POSTing the same client ids is idempotent (offline-retry safe). `PATCH` with an `event` seed upserts the linked event the same way.

**Places (ADR-0048):** transport bookings carry `fromPlaceId`/`toPlaceId`; every other type carries a single `placeId` — the two are mutually exclusive (a `400` otherwise). Any place id must belong to the trip (`400` otherwise).

**Delete / unlink (ADR-0047 §3):** `DELETE ?deleteEvents=true` removes the booking **and** its linked event; the default (`false`) **unlinks** — the event survives with `bookingId` nulled, recorded as its own `event:update` `Change` (not a silent FK `SetNull`). The hard-event guard still applies: if a `hard` event depends on the booking, `?confirm=true` is required or the API returns `409 HARD_EVENT_REQUIRES_CONFIRM`.

## Places

Trip-scoped location registry (ADR-0048). Read via the trip snapshot (`places`); written here. Name-only rows are valid ("Place-lite"); the Places picker enriches `googlePlaceId`/`lat`/`lng` later. No delete endpoint yet (orphans are left).

| Method | Path                             | Body → Response                                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/places`          | `createPlaceSchema` (`{ id?, name, googlePlaceId?, address?, lat?, lng? }`) → `Place` |
| PATCH  | `/trips/:tripId/places/:placeId` | partial → `Place` (the picker's enrichment path)                                      |

## Maybe shelf

The shelf is read via the trip snapshot (`maybeItems`), not a standalone list. Scheduling an idea onto a day is done client-side — create the `Event` (`POST /events`, `source: maybe_shelf`) and mark the idea consumed — rather than a dedicated `/schedule` endpoint, so day/time/kind are chosen in the builder's event form.

| Method | Path                                              | Body → Response                                                           |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/maybe-items`                      | `createMaybeItemSchema` (`{ id?, title, icon?, placeId? }`) → `MaybeItem` |
| DELETE | `/trips/:tripId/maybe-items/:maybeItemId`         | → `204` (remove an idea)                                                  |
| POST   | `/trips/:tripId/maybe-items/:maybeItemId/consume` | → `MaybeItem` (marks consumed when scheduled)                             |

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
