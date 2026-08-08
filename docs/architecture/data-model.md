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
                          ├──< Document ──< DocumentAttachment >── Booking | Event  (ADR-0173)
                          ├──< MaybeItem
                          ├──< Place           (location registry; Event/Booking/MaybeItem placeId → Place)
                          └──< Change          (the sync/undo/feed substrate)

PlaceEnrichment                               (GLOBAL — no tripId, no FK; joined to Place by alias, ADR-0166)
```

There is **no `Day` table** — a day is a calendar date within the trip range (ADR-0018).

## Entities

### User

The person (no provider fields — those live on `AuthIdentity`).

- `id`, `email @unique`, `displayName`, `createdAt`
- **Identity (ADR-0133):** `avatarHue String?` · `avatarChoice AvatarChoice @default(initials)` · `googleAvatarUrl String?` · `uploadedAvatarKey String?`
  - `avatarHue` stores a **ramp key** (`plum|rose|moss|denim|cocoa`), never a hex, so the dark token remap reaches it — and it is **nullable on purpose**: null means "never chosen" and the server resolves it per-user via `resolveAvatarHue(id, stored)`. It replaces `avatarColor String @default("#E9A63C")`, whose single column default meant every real user rendered the same colour (and that colour was `--amber`, which the decorative palette forbids for avatars).
  - `googleAvatarUrl` is the provider's `picture`, refreshed at **every** sign-in; `avatarChoice` is defaulted only at **create**, so a returning user who chose initials is never flipped back to the photo.
  - The wire DTO always carries a **resolved** `avatarHue`, so no client owns that fallback.

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

- `id` (client-generated), `tripId`, `type` (`flight` | `hotel` | `restaurant` | `train` | `transit` | `car` | `activity` | `other`) — the four **transport** modes are `flight`, `train`, `transit` (bus/ferry/shuttle/cable car, ADR-0156) and `car` (a hire, ADR-0162). Per-type shape (route vs single place, span vs point, default commitment, whether one save can author a return leg or a connection) is `BOOKING_TYPE_PROFILE` in `@waypoint/shared`, which the server's own place-shape guard reads — see ADR-0154 §2.
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

- `id`, `tripId`, `googlePlaceId?` (null for manually-typed places), `name`, `address?`, `lat?`, `lng?`, `timezone?` (IANA, resolved server-side from the coordinates via `geo-tz`), `icon?`, `nickname?`, `category?` (`EventCategory`), `rating?`, `userRatingsTotal?`, `createdAt`, `updatedAt`, `updatedBy`
- **Four fields are user-authored — `name`, `icon` (ADR-0147 §5), `nickname` (ADR-0166 §18) and `category` (ADR-0165) — and Google never overwrites them.** `enrichExisting` adopts the id/address/coordinates/zone and omits all four by construction, which is how a name you typed has always survived a re-pick. `icon` and `category` are both **why `Place` stays trip-scoped** rather than a shared cross-trip record: they are this trip's view of the place, not a property of the entity Google describes.
- `nickname` is the place's own answer to _what do we CALL this_ (ADR-0166 §18), and it is display-only: `name` still holds the official name and the record surfaces still show it. It sits at the top of the label chain — **nickname → the city the airport serves → the name-stripping fallback** — because the automatic half cannot always be right: Wikidata's `P931` lists both Tel Aviv and Jerusalem for Ben Gurion, at equal rank. The IATA code is deliberately **not** in that chain: it renders as its own fact on the booking detail, where there is room for it (ADR-0166 §18).
- `category` is the place's own answer to _what is this_, and it **outranks** the one derived from the referencing entities (`place-usage.ts`'s most-committed reference) on every place-scoped surface — its pin hue, its badge glyph, the type facet it answers to. An `Event` still carries its own category for its own surfaces: the deliberate choice at the nearest scope wins, and a place is the widest scope.
- Referenced by `Event.placeId` (unlinked events only — see the authority rule, ADR-0051), `Booking.placeId` + `Booking.fromPlaceId`/`toPlaceId`, `MaybeItem.placeId`. All `onDelete: SetNull`.
- Enrichment (hours, rating, photos) is added when the Maps work lands; `googlePlaceId`/`lat`/`lng` fill in when the Places picker replaces free-text entry. Orphaned rows are left (no GC yet); no within-trip dedup until `googlePlaceId` exists.
- **The world's facts about the same place live on `PlaceEnrichment` below, not here** (ADR-0166 §1). The line is a rule rather than a judgement call: _if two different trips could legitimately disagree about it, it is not enrichment._

### PlaceEnrichment (ADR-0166) — global, not trip-scoped

Facts about the real-world entity a `Place` refers to: a summary, an image, opening hours, and an airport's IATA code + the city it serves (§18). **Every trip that references the same place reads the same row.** Not data-plane: it has **no `tripId`**, no client ever authors it, and it is deliberately **outside `ChangeService`** (§6) — there is no trip to write a `Change` against, one writer (the server) so no LWW, and no action anyone performed so nothing to undo. The trip snapshot **joins** it as a server-owned read model (Phase 3).

- `id` — **our own key**, so Google is not the identity spine of a store whose purpose is to not depend on Google, and a coordless Place-lite is not stranded (§4).
- `googlePlaceId? @unique`, `wikidataQid? @unique`, `osmRef? @unique` — **alias columns**, the only things queried. `place_id` is the one Google field the terms let us hold indefinitely (§1); the others are added when a source matches. Adding an alias later is a column and an index, not a re-key.
- `fields Json` — `Record<EnrichmentField, present | absent>`, validated by `enrichmentFieldsSchema` in `@waypoint/shared`. **One payload, not a column per field:** every value carries ~6 facts of its own provenance (source, license, attribution, `fetchedAt`, confidence, match method), which as columns is a migration per field _and_ per source for data nothing filters on.
- `attemptedAt` — the **negative-cache** clock (§6.4). Per-field miss timers live inside `fields`; this is the queryable one. "We looked and nobody has a summary for this café" is stored, because most places are that case and without it every cold read re-attempts every provider forever.
- **A text field holds localized _variants_** keyed by language, each a full value with its own source and license, and `lang` is **required** on any value carrying prose (§11.6) — the hook for translation and multi-language support, and the reason a summary can be marked `באנגלית`.
- **No Google-sourced value is ever written here** (§2), enforced by each source's declared `storable` policy plus one guard (`enrichment.policy.ts`), not by anyone remembering the caching terms.
- `Place` is **unchanged** by this table's existence — no migration, no column moved, no behaviour altered.

### Note (ADR-0152)

**One entity, and what it is about is a field.** No host = a general note; exactly one host FK set = that entity's note. Same row, same editor, same list, same sync channel, same offline story either way — which is the whole reason the entity exists rather than a `notes` column on each of five tables (five editors and no unified view).

- `id`, `tripId`, `title?`, `body?`, `url?`, `category?` (`EventCategory`, ADR-0038), `source` (`member` in v1), `createdBy`, `createdAt`, `updatedAt`, `updatedBy`
- Five nullable host FKs, **at most one set**: `eventId?`, `bookingId?`, `placeId?`, `maybeItemId?`, `documentId?`. All `onDelete: Cascade` — note the contrast with `Place`'s `SetNull` above: a note with no host is a _general note_, not an orphan, so a null-ed FK would silently promote a dead note into the group's memory.
- The at-most-one rule is the shared zod schema's (`createNoteSchema`), enforced identically on client and server (ADR-0023) — Prisma's schema language cannot express it as a constraint.
- `category` stays **null on a hosted note**: it is RESOLVED at render as `note.category ?? host.category` (ADR-0152 §5's amendment), never copied at write time, which would go stale the moment the host is recategorised. For the same reason there is **no `icon` column** — the existing `chosenIcon` chain supplies the glyph.
- **A cascade writes no `Change` rows.** Deleting a host removes its notes in the database and tells no client, so the sync half is a rule in the ADR-0094 appliers keyed off `NOTE_HOST_FIELD` (`lib/notes.ts`'s `dropNotesForHostChange`, registered in both the memory channels and `CACHE_CHANNELS`). The cascade is the storage guarantee; the applier rule is the sync one.
- **Migrated in:** `Booking.details.notes` became `Note` rows hosted by their booking (`20260801200000_booking_notes_to_rows_adr0152`), one-time and one-way — a read-both fallback is the drift problem this entity exists to end. `details.wifi` and `details.room` are untouched: WiFi is a field with one reader (`lib/home-quick.ts`), not a note.
- Group-visible only in v1 — no `ownerUserId` (deferred, ADR-0152 §9: the visibility filter would reach every read path and the offline cache).

### DocumentAttachment (ADR-0173)

**The link between a `Document` and the `Booking` or `Event` it belongs to** — a row of its own, not a host FK on `Document`, and it is what reverses ADR-0047 §4's "Documents stay independent of Bookings/Events — no linkage field added".

- `id`, `tripId`, `documentId`, `createdBy`, `createdAt`. No `updatedAt`/`updatedBy`: a link has no content, so it is created and it is removed, never edited.
- Two nullable host FKs, **exactly one set**: `eventId?`, `bookingId?` — stricter than `Note`'s at-most-one, because a note with no host is a general note and a link with no host is a link to nowhere. Enforced by `createDocumentAttachmentSchema` at both edges (ADR-0023).
- **There is no `placeId` host** (ADR-0173 §4, owner's rule). A place _displays_ its single context's attachments and may never _originate_ one, so its inheritance is entirely a read-time resolution — no row that could be mis-hosted, and nothing to reason about when a place is removed (ADR-0157).
- **Three cascades, and the middle one is the point.** `documentId` → `Cascade` (the file is gone, so its pointers are meaningless); `eventId`/`bookingId` → `Cascade` **on the link row**, which takes the _link_ and cannot reach the document — a separate row, still owned by the trip. A cancelled hotel must not delete your voucher, and with a link row that correct behaviour is the DEFAULT rather than a `SetNull` special case someone later "fixes". A host FK on `Document` would have inverted exactly that.
- **Many-to-many, which is a requirement rather than generality:** ADR-0154 fixes a round trip as **two** `Booking`s, and one confirmation PDF covers both. `@@unique([documentId, eventId])` + `@@unique([documentId, bookingId])` keep one document from attaching to one host twice — two constraints and not one over three columns, because Postgres treats NULLs as distinct, so each binds only the rows where its host is actually set.
- **A cascade writes no `Change` rows**, exactly as for `Note` above: the sync half is `lib/attachments.ts`'s `dropAttachmentsForHostChange`, keyed off `ATTACHMENT_HOST_FIELD` and registered in both the memory channels and `CACHE_CHANNELS` (ADR-0094).
- **An attachment never widens visibility** (ADR-0173 §6). A `Document` may be owned; this row is a pointer, not a permission, and a reader resolves it through the document list they already have — so an attachment whose document they cannot see renders as nothing.
- Which hosts share one attachment list is **derived, never stored** — `lib/host-context.ts`, the same module Notes read (ADR-0172 §1–§3). Notes and attachments share the derivation and the grammar; they do not share the storage.

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
