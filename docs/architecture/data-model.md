# Data Model

**Status:** PROPOSED (for review). Relational (Postgres). The **hard/soft event** is the heart of it. Field lists are sketches, not final DDL.

## Entity map

```
User ──< Membership >── Trip ──< Day >── Event ──? Booking
                          │                 │
                          ├──< Booking       └──(hard→ reservation info)
                          ├──< Document
                          ├──< MaybeItem
                          └──< Change
```

## Entities

### User
The person. Backed by Google identity.
- `id`, `google_sub`, `email`, `display_name`, `avatar_color`, `created_at`

### Trip
The aggregate root.
- `id`, `name` (e.g. "יפן ׳26"), `destination`, `start_date`, `end_date`, `timezone`, `created_by`, `created_at`
- Trip mode (planning/trip) is **derived** from dates + current time, not stored.

### Membership
Join between User and Trip; enables collaboration and per-user features.
- `id`, `trip_id`, `user_id`, `role` (`peer` for v1; field reserved for future roles), `joined_at`
- `calendar_sync_enabled` (bool), `google_connected` (bool)

### Day
Convenience grouping for the itinerary (could be derived, but stored simplifies ordering).
- `id`, `trip_id`, `date`, `label`

### Event ⭐ (the core)
A block on the timeline. **Hard or soft** — this is the decisive field.
- `id`, `trip_id`, `day_id`, `title`, `icon`
- `kind`: **`hard` | `soft`** ← the central distinction
- `start_time`, `end_time` (nullable for open-ended soft blocks)
- `location` (place ref / lat-lng / free text), `place_id` (Google Places, nullable)
- `status`: `planned` | `now` | `done` | `skipped`
- `booking_id` (nullable) — a hard event usually links to a Booking that holds the commitment (code, contact to change it)
- `sort_order` (within the day)
- `source`: `manual` | `gmail` | `maybe_shelf` | `integration`
- `updated_by`, `updated_at` (for last-writer-wins + change-feed)

**Hard vs soft is behavior, not just a flag:**
- `hard` → edits require confirmation; never auto-moved; excluded from ripple; renders with code + lock badge.
- `soft` → freely draggable/skippable/swappable; included in ripple suggestions; renders dashed.

### Booking
An entry in the central index. Backs hard events and stands alone in the index.
- `id`, `trip_id`, `type` (`flight` | `hotel` | `restaurant` | `train` | `activity` | …)
- `title`, `confirmation_code`, `provider`, `address`, `place_id`
- `starts_at`, `ends_at`, `details` (JSON: seat, room, gate, party size…)
- `source`: `manual` | `gmail`
- `offline_available` (bool) — indexed for offline caching

### Document
Sensitive files (passports, insurance).
- `id`, `trip_id`, `type`, `title`, `file_ref` (encrypted blob), `owner_user_id` (nullable — some are group docs)
- **Encrypted at rest; offline-cacheable on the client.** Encryption approach → open question in tech-stack.md.

### MaybeItem
Parked ideas on the "maybe" shelf.
- `id`, `trip_id`, `title`, `icon`, `meta`, `place_id` (nullable), `created_by`
- Scheduling one creates an Event (`source = maybe_shelf`) and marks the MaybeItem consumed.

### Change
The change-feed + audit + undo substrate.
- `id`, `trip_id`, `actor_user_id`, `entity_type`, `entity_id`, `action` (`create`|`update`|`move`|`delete`|`status`), `before` (JSON), `after` (JSON), `created_at`

## Key relationships & rules

- Everything is scoped by `trip_id` (row-level auth by membership).
- An Event may reference a Booking; deleting a Booking should warn if a hard Event depends on it.
- Ripple only ever reorders **soft** Events after a moved Event, never crosses a hard anchor.
- Undo = apply the inverse of a `Change` record.

## Scale-safe by construction

Relational, every row keyed by `trip_id` + a real `user_id`, `role` reserved, `updated_by/at` present. None of this is tuned for scale, but none of it blocks scaling — that's the intended balance.

## Open modeling questions 🔶

1. Should `Day` be a stored entity or derived from dates? (Proposed: stored, for explicit ordering.)
2. Recurring/overnight events (a hotel spanning nights) — model as one Booking with a date range, but how shown on multiple Days?
3. ~~Document encryption: E2E vs. at-rest?~~ **Resolved:** server-side encryption at rest (ADR-0015). `Document.file_ref` points to an encrypted blob the backend can decrypt for authorized members.
