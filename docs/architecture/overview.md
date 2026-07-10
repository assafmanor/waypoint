# Architecture Overview

**Status:** ACCEPTED (revised in the T-025 review — see `planning/2026-07-10-session-03-architecture-review.md` and ADR-0018/0019/0020/0021). Guiding constraint: **real multi-user collaboration must work in v1**, but we are **not building for scale** — we optimize for a handful of trips and ~5 users each, while keeping the design free of choices that would block scaling later.

## Shape of the system

```
┌─────────────────────────────────────────────┐
│  Client (PWA, React)                          │
│  • 4-tab trip UI, RTL                         │
│  • Local store / cache (offline index + docs) │
│  • Optimistic edits + undo                    │
└──────────────┬────────────────────────────────┘
               │  HTTPS (REST/RPC) + realtime channel
┌──────────────▼────────────────────────────────┐
│  Backend service (single small app)           │
│  • Auth (Google OAuth)                         │
│  • Trip / event / booking CRUD                 │
│  • Realtime fan-out to trip members            │
│  • Integration workers (Gmail import,          │
│    calendar push, flight status)               │
└──────────────┬────────────────────────────────┘
               │
        ┌──────▼──────┐   ┌───────────────┐
        │  Database    │   │ External APIs │
        │ (Postgres)   │   │ Google Maps/  │
        └──────────────┘   │ Places, Gmail,│
                           │ Calendar,     │
                           │ flight status │
                           └───────────────┘
```

## What the T-025 review changed (summary)

- **Data model (ADR-0018):** dropped the `Day` table (a day is a date on `Event`); removed stored `EventStatus.now` (computed from the clock); `Event.endDate` for multi-day ambient spans; **client-generated ids**; uniform audit columns; dropped `Booking.offlineAvailable`; roles `admin`+`peer`; a minimal practical layer (`TripNote`, budget columns, static emergency numbers).
- **Sync (ADR-0019):** `Change.seq` monotonic cursor (not timestamps); the entity write + `Change` insert are one transaction through a single `ChangeService.mutate()`, broadcast post-commit; a `snapshot` bootstrap endpoint; **row-level** server-authoritative LWW (the old "field-level" claim was unimplementable).
- **Auth (ADR-0020):** in-memory access JWT + a rotating httpOnly refresh `Session`; **single-origin** in prod (backend serves the PWA); a generalized `AuthIdentity` seam so non-Google login is a cheap future add; `CalendarEventLink` for one-way sync idempotency.
- **Multi-trip (ADR-0021):** already supported by the model; adds a client active-trip selection + a minimal switcher.
- These are applied to code in **T-026** (schema/migration/shared types) and the reshaped build tasks.

## Design tenets

1. **Trip-centric.** The trip is the aggregate root. Almost everything (events, bookings, documents, members, changes) hangs off a trip.
2. **Integrations are pipes, not screens.** Workers transform external data into the same event/booking entities the UI already renders. No integration owns a surface. See [integrations/overview.md](../integrations/overview.md).
3. **Offline-first for read-critical data.** The index and documents must render with zero connectivity. The client keeps a local copy; writes queue and sync when back online.
4. **Optimistic + undo.** Edits apply locally immediately, then reconcile with the server. Undo is a first-class operation.
5. **Small but not painted into a corner.** Single service + single database now. The collaboration and data models avoid choices (e.g. per-device-only state, no user IDs on records) that would force a rewrite to scale.

## Client responsibilities

- Render the four tabs; drive the automatic planning↔trip mode switch (by date now; by geolocation later).
- Maintain a local cache of the trip so the index/documents work offline.
- Apply edits optimistically, expose undo, and reconcile with server truth.
- Subscribe to a realtime channel for its active trip to receive others' changes and the change-feed.

## Server responsibilities

- Authenticate users (Google), authorize by trip membership.
- Persist trips/events/bookings/documents/members/changes.
- Fan out changes to connected members (realtime) and record the change-feed.
- Run integration workers on a schedule / on-demand (Gmail parse, calendar push, flight status).
- Store encrypted documents; serve them to members with an offline-cacheable response.

## Offline model (v1)

- **Read:** index + documents + today's itinerary are cached locally and fully readable offline.
- **Write offline:** soft edits queue locally and sync on reconnect (last-writer-wins with undo is acceptable at this size — see collaboration-model.md).
- **Not offline in v1:** map tiles/navigation (deep-link to Google Maps, which handles its own offline), Gmail import, calendar push.

## What "not for scale" means concretely

- Fine to keep realtime simple (a hosted realtime service or a single-node websocket) rather than a horizontally-scaled bus.
- Fine to run integration workers in-process on a timer rather than a distributed queue.
- **But**: every record is keyed by `trip_id` and `user_id`, auth is real, and the schema is relational — so scaling later is an infra change, not a data-model rewrite.
