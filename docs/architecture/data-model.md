# Data Model

**Status:** CURRENT — implemented in `backend/prisma/schema.prisma` + `packages/shared` + the init migration (T-026; decisions in ADR-0018 / 0019 / 0020 / 0021). Relational (Postgres). The **hard/soft event** is the heart of it.

## Entity map

```
User ──< AuthIdentity                         (identity + per-provider OAuth token/scopes)
User ──< Session                              (our rotating refresh tokens)
User ──< Membership >── Trip ──< Event ──? Booking   (Event.bookingId @unique → strict 1:1)
                          │        │
                          │        └──< CalendarEventLink (per member, one-way sync)
                          ├──< Booking
                          ├──< Document
                          ├──< MaybeItem
                          ├──< Place           (location registry; Event/Booking/MaybeItem placeId → Place)
                          └──< Change          (the sync/undo/feed substrate)
```

There is **no `Day` table** — a day is a calendar date within the trip range (ADR-0018).

## Entities

### User

The person (no provider fields — those live on `AuthIdentity`).

- `id`, `email @unique`, `displayName`, `avatarColor`, `createdAt`

### AuthIdentity (ADR-0020)

One per (user, provider). Holds the provider identity **and** that provider's OAuth material.

- `id`, `userId`, `provider` (`AuthProvider` enum: `google`; extensible), `providerAccountId`
- `refreshTokenEnc?` (encrypted at rest, ADR-0015), `scopes String[]`, `createdAt`, `updatedAt`
- `@@unique([provider, providerAccountId])`

### Session (ADR-0020)

Our own refresh-token store (the access token is a stateless in-memory JWT, not stored).

- `id`, `userId`, `refreshTokenHash`, `expiresAt`, `createdAt`, `revokedAt?`, `userAgent?`

### Trip

The aggregate root.

- `id`, `name` (e.g. "יפן ׳26"), `destination`, `startDate @db.Date`, `endDate @db.Date`, `timezone`
- `currency String?`, `dailyBudgetMinor Int?` (display-only budget, ADR-0014)
- `createdBy` (FK → User), `createdAt`, `updatedAt`, `updatedBy`
- Trip **mode** (plan/trip) is **derived** from dates + now, never stored (ADR-0016).

### Membership

User×Trip join — enables collaboration, multi-trip (ADR-0021), and per-user calendar sync.

- `id`, `tripId`, `userId`, `role` (`MembershipRole`: `admin` | `peer` — creator is `admin`, ADR-0005)
- `calendarSyncEnabled Boolean` (per-trip intent; capability derives from the user's Google `AuthIdentity.scopes`)
- `joinedAt`
- `@@unique([tripId, userId])`, `@@index([tripId])`, `@@index([userId])` (the last for `getMe`/`listForUser`, which filter by `userId` alone — the composite leads with `tripId`; backend-review B-09)

### Event ⭐ (the core)

A block on the timeline. **Hard or soft** — the decisive field (ADR-0011).

- `id` (**client-generated**, ADR-0018), `tripId`, `date @db.Date` (which day it's anchored to)
- `endDate @db.Date?` — **null = single-day point-in-time block; non-null = multi-day ambient span** (wedding/festival), rendered as a strip like a hotel (ADR-0018)
- `title`, `icon?`, `kind` (`hard` | `soft`)
- `startsAt DateTime?`, `endsAt DateTime?` — **UTC instants**, may cross midnight; displayed via `Trip.timezone`
- `placeId?` — **FK → Place** (ADR-0048). Authoritative only for an _unlinked_ event; when `bookingId` is set it is forced null and the place resolves from the booking (the authority rule, ADR-0051). Both `placeId` and `bookingId` are **trip-scoped on write** (`EventsService`, shared `common/trip-scope.util.ts`) — a client-supplied id pointing at another trip's place/booking is a 400, matching what bookings already enforce (backend-review B-06).
- `status` (`EventStatus`: `planned` | `done` | `skipped` — **no `now`**; "now" is computed client-side from times)
- `bookingId?` **`@unique`** — strict 1:1 with Booking (ADR-0047, enforced in the schema per ADR-0051); a hard event usually links a Booking holding the commitment
- `sortOrder Int` (within the date), `source` (`manual` | `gmail` | `maybe_shelf` | `integration`)
- `createdAt`, `updatedAt`, `updatedBy`
- `@@index([tripId, date])`

**Hard vs soft is behavior, not just a flag:**

- `hard` → edits require confirmation; never auto-moved; excluded from ripple; renders with code + lock.
- `soft` → freely draggable/skippable/swappable; included in ripple; renders dashed.

### Booking

An entry in the central index. Backs hard events and stands alone in the index.

- `id` (client-generated), `tripId`, `type` (`flight` | `hotel` | `restaurant` | `train` | `activity` | `other`)
- `title`, `confirmationCode?`, `provider?`
- `placeId?` — **FK → Place** (single-place types; mutually exclusive with from/to). Transport bookings instead carry `fromPlaceId?`/`toPlaceId?` (FK → Place) for origin/destination; the linked Event's map-pin/navigate-to-next target derives as the **origin** (ADR-0048/0051).
- Time lives on the **linked Event** (the sole time authority — ADR-0048); a hotel across nights is **one** Booking whose Event carries the range via `endDate` (ADR-0018). Booking has no `startsAt`/`endsAt` of its own.
- `details Json?` (seat, room, gate, party size…; plus a generic `notes` string and, for `hotel`, a `wifi` `{network, password}` — ADR-0047), `source` (`manual` | `gmail`)
- `createdAt`, `updatedAt`, `updatedBy`
- (No `offlineAvailable` — the client mirrors the whole trip; ADR-0018.)

### CalendarEventLink (ADR-0020)

Idempotency map for one-way calendar push (ADR-0003) — per member, per event.

- `id`, `eventId`, `userId`, `googleCalendarEventId`, `updatedAt`
- `@@unique([eventId, userId])`

### Document

Sensitive files (passports, insurance).

- `id`, `tripId`, `type` (`passport` | `insurance` | `visa` | `other`), `title`
- `fileRef` (server-side-encrypted blob, ADR-0015 — trust model in ADR-0034), `mimeType`, `sizeBytes`, `ownerUserId?` (null = group doc)
- `createdAt`, `updatedAt`, `updatedBy`

### MaybeItem

Parked ideas on the "maybe" shelf.

- `id`, `tripId`, `title`, `icon?`, `placeId?` (**FK → Place**, ADR-0048), `createdBy`, `consumed Boolean`, `createdAt`, `updatedAt`, `updatedBy`
- Scheduling one creates an Event (`source = maybe_shelf`) and marks the MaybeItem consumed.
- (Dropped the untyped `meta` field — `title` + `placeId` + `icon` cover the shelf card.)

### Place (ADR-0048)

The trip-scoped location registry every `placeId` FK points to, and the cache the Map/Places work will enrich. Data-plane (created/updated through `ChangeService`). The **only** way a location is expressed — there is no free-text `Event.location`/`Booking.address` (ADR-0051); free text becomes a name-only Place ("Place-lite").

- `id`, `tripId`, `googlePlaceId?` (null for manually-typed places), `name`, `address?`, `lat?`, `lng?`, `createdAt`, `updatedAt`, `updatedBy`
- Referenced by `Event.placeId` (unlinked events only — see the authority rule, ADR-0051), `Booking.placeId` + `Booking.fromPlaceId`/`toPlaceId`, `MaybeItem.placeId`. All `onDelete: SetNull`.
- Enrichment (hours, rating, photos) is added when the Maps work lands; `googlePlaceId`/`lat`/`lng` fill in when the Places picker replaces free-text entry. Orphaned rows are left (no GC yet); no within-trip dedup until `googlePlaceId` exists.

### Change (the sync/undo/feed substrate — ADR-0019)

- `id`, `seq BigInt @default(autoincrement())` (strictly-increasing cursor), `tripId`, `actorUserId`
- `entityType`, `entityId`, `action` (`create` | `update` | `move` | `delete` | `status`)
- `before Json?`, `after Json?`, `createdAt`
- `@@index([tripId, seq])`

## Key relationships & rules

- Everything is scoped by `tripId` (row-level auth by membership).
- An Event may reference a Booking; deleting a Booking with a dependent hard event uses `onDelete: SetNull` and the API warns/confirms (api-contract.md).
- Every shared-state mutation goes through `ChangeService.mutate()` — entity write + `Change` insert in **one transaction**, broadcast post-commit (ADR-0019).
- Ripple only ever reorders **soft** Events after a moved Event, never crosses a hard anchor.
- Undo = apply the inverse of a `Change` (append a new `Change`; ADR-0019).

## Resolved modeling questions

1. **Day stored vs derived** → **derived** (drop the table; `Event.date`). ADR-0018.
2. **Overnight/multi-day bookings** → a hotel is **one Booking** with a date range; multi-day _events_ (weddings) use `Event.endDate`. Both render as ambient strips; point-in-time blocks stay single-date. ADR-0018.
3. **Document encryption** → server-side at rest (ADR-0015).

## Scale-safe by construction

Relational, every row keyed by `trip_id` + a real `user_id`, `role` present, audit columns everywhere, client-generated ids. None of this is tuned for scale, but none of it blocks scaling.
