# Plan Mode & Trip Mode

**Status:** ACCEPTED (decisions 2026-07-09). Both modes are first-class and equally important. See ADR-0016.

## The principle: one surface, two emphases

Plan mode and Trip mode are **not two apps or two screen sets** — they are the **same four tabs (🏠 Home · 🗺️ Map · 📇 Index · 📅 Day-by-day), re-emphasized** for what you're doing. This keeps faith with the founding rule that *the trip is the only surface* (ADR-0004). The data is identical; what changes is which actions are foregrounded and how each tab presents.

| Tab | Plan mode emphasis (before / between days) | Trip mode emphasis (on the ground) |
|---|---|---|
| **Home** | **Prep dashboard**: "trip in 12 days · 6 bookings · 3 gaps to fill · 2 travelers not yet connected." Checklist of what's missing. | **Departure board**: now/next, live countdown, day progress, quick access. |
| **Day-by-day** | **Builder**: add days/events, set hard vs soft, times, drag to arrange across days. Editing is the point. | **Follow + adjust**: read the day; quick verbs (skip/delay/swap/done/on-way); editing is guarded. |
| **Index** | **Entry**: add bookings manually (flights/hotels/reservations) → index, link to hard events. | **Reference**: read confirmation codes/documents; works offline. |
| **Map** | **Research**: search & pin places (Google Places), collect onto the "maybe" shelf. | **Orientation**: "near me now," pinned events, deep-link nav. |

Editing isn't *disabled* in Trip mode — it's *de-emphasized and guarded* (hard-event warnings, undo). You can always adjust on the ground; the UI just stops leading with it.

## Plan mode — v1 responsibilities

1. **Trip setup + invites** — create the trip (dates, destination, timezone), invite the ~5 via link, each connects their own Google account (ADR-0002).
2. **Itinerary building** — add days and events, mark hard vs soft (ADR-0011), set times, drag to arrange within/across days.
3. **Manual booking entry** — type in bookings → the index; link a booking to a hard event. (Gmail auto-import is v1.1.)
4. **Research + "maybe" shelf** — find and pin places, park ideas on the shelf to schedule later.

## Trip mode — v1 responsibilities

Already designed in `mockups/trip-dashboard-v2.html` and `docs/design/design-language.md`: departure-board Home, live now/next, offline index/documents, map "near me," and the change-on-the-fly verbs.

## The mode switch (ADR-0016)

- **Automatic by date:** the app enters **Trip mode** on the trip's `startDate` and returns to **Plan mode** before the start / after the end and between multi-leg gaps. Mode is **derived** from dates + current time — not stored on the trip.
- **Manual override:** the user can always toggle to peek at / work in the other mode (e.g. tweak the plan mid-trip, or preview the departure board while planning). The override is a per-user, per-device UI state — it does not change the trip for anyone else.
- **Location-awareness is deferred:** flipping to Trip mode on *arrival* (geolocation) rather than by calendar is a nice future upgrade, out of v1 scope.

## Device note

The app is **phone-primary** (ADR-0017). **Trip mode** is effectively phone-only — in hand, on the ground. **Plan mode** is where **tablet** use is most likely (building the itinerary, entering bookings, and researching are easier with width), so Plan-mode layouts should have a proper tablet treatment, not just a stretched phone column. Desktop is a rare, graceful-minimum case.

## Collaboration note

Both modes are multi-user. In Plan mode, members build the itinerary together (same real-time sync + change-feed as Trip mode — see `../architecture/sync-and-offline.md`). The manual override is the only mode state that's personal; everything else is shared.

## Future direction — keep the design open to enrichment 🔭

A directional idea to **not design ourselves out of** (not v1): the option to **automatically enrich entries from the web / an AI integration** — e.g. pull opening hours, photos, descriptions, local tips, or fill in a booking's details from a confirmation. To keep this door open:

- Treat enrichment as **another pipe** feeding the existing entities (ADR-0004), never a new screen. See `../integrations/overview.md`.
- On `Event` / `Booking` / `MaybeItem`, allow room for enriched fields and a **provenance/source** marker (we already have `source`), so enriched data is distinguishable from user-entered data and can be re-fetched or discarded.
- Keep place references (`placeId`) and free-text separable so an enrichment step has stable keys to hang data on.

This is recorded so v1 modeling stays compatible; no v1 work is implied.
