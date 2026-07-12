# Plan Mode & Trip Mode

**Status:** ACCEPTED (decisions 2026-07-09). Both modes are first-class and equally important. See ADR-0016.

## The principle: one surface, two emphases

Plan mode and Trip mode are **not two apps or two screen sets** — they are the **same four tabs (🏠 Home · 🗺️ Map · 📇 Index · 📅 Day-by-day), re-emphasized** for what you're doing. This keeps faith with the founding rule that _the trip is the only surface_ (ADR-0004). The data is identical; what changes is which actions are foregrounded and how each tab presents.

| Tab            | Plan mode emphasis (before / between days)                                                                                        | Trip mode emphasis (on the ground)                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Home**       | **Prep dashboard**: "trip in 12 days · 6 bookings · 3 gaps to fill · 2 travelers not yet connected." Checklist of what's missing. | **Departure board**: now/next, live countdown, day progress, quick access.                        |
| **Day-by-day** | **Builder**: add days/events, set hard vs soft, times, drag to arrange across days. Editing is the point.                         | **Follow + adjust**: read the day; quick verbs (skip/delay/swap/done/on-way); editing is guarded. |
| **Index**      | **Entry**: add bookings manually (flights/hotels/reservations) → index, link to hard events.                                      | **Reference**: read confirmation codes/documents; works offline.                                  |
| **Map**        | **Research**: search & pin places (Google Places), collect onto the "maybe" shelf.                                                | **Orientation**: "near me now," pinned events, deep-link nav.                                     |

Editing isn't _disabled_ in Trip mode — it's _de-emphasized and guarded_ (hard-event warnings, undo). You can always adjust on the ground; the UI just stops leading with it. **What editing means per mode is defined by the capability tiers below (ADR-0025).**

## Editing: capability tiers (ADR-0025)

An edit's **tier is decided by its blast radius, not by mode**; mode decides _how_ you reach it. This refines "editing is never hard-disabled in Trip mode" (ADR-0016): trip-level building (Tier 3) is _gated_ in Trip mode, but the gate is a one-tap, discoverable switch to Plan — not a dead end.

| Tier                                                            | Contents                                                                                                                                                                                     | Trip mode                          | Plan mode                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- |
| **1 — on-the-ground verbs** (one tap, on the item)              | Soft: Done · Skip · Do-it-now · Delay/Earlier · Swap · Navigate. Hard: Navigate · On-my-way · Delay ±step _(confirm)_ · Done. Maybe-shelf → Schedule onto **today**. Add a quick soft event. | ✅ primary surface                 | ✅ available              |
| **2 — single-item structural** (opens an inline **edit sheet**) | Edit one event's details/exact time · flip one event **hard↔soft** · **Delete** an event · quick-add a **booking** · add a **hard event** · link a booking                                   | 🔓 via sheet, then back to the day | ✅ first-class            |
| **3 — trip-level building** (must be in Plan mode)              | Add/remove **days** · move/reorder events **across days** · bulk arrange · trip **dates / destination / timezone** · **invites** & membership · maybe-shelf **research** · **budget** setup  | 🚫 → "Switch to Plan to do this"   | ✅ the point of Plan mode |

Two deliberate distinctions: **Skip** (Tier 1, reversible — parks to the shelf) vs. **Delete** (Tier 2, destroys); **Schedule-from-shelf** (Tier 1) vs. **build-the-shelf / research** (Tier 3). Hard-event edits in any tier route through the ADR-0011 confirmation gate.

### The on-the-ground day view (ADR-0027)

Trip mode's Day-by-day derives a **lifecycle phase** for every event from the real clock (ADR-0026) — never auto-writing status. Past events read as _handled_ without a stored mutation: a departed flight settles as **Passed**; a missed soft plan on today **Slips** to the top ("Slipped — still on?" → **Do it now** / Skip / Pick a time); earlier days' un-acted softs are greyed history. The **shelf is a parking lot**: Skip parks a soft event back onto it (durable, reversible), Schedule places it onto a day, consumed ideas simply stop rendering.

## Plan mode — v1 responsibilities

**Designed to finish level in `mockups/plan-mode-v1.html`** (phone-primary + a two-column tablet builder) — the mode toggle, the prep-dashboard Home, the itinerary **builder** Day view, booking **entry** Index, and **research** Map.

1. **Trip setup + invites** — create the trip (dates, destination, timezone), invite the ~5 via link, each connects their own Google account (ADR-0002).
2. **Itinerary building** — add days and events, mark hard vs soft (ADR-0011), set times, drag to arrange within/across days.
3. **Manual booking entry** — type in bookings → the index; link a booking to a hard event. (Gmail auto-import is v1.1.)
4. **Research + "maybe" shelf** — find and pin places, park ideas on the shelf to schedule later.

## Trip mode — v1 responsibilities

Already designed in `mockups/trip-dashboard-v2.html` and `docs/design/design-language.md`: departure-board Home, live now/next, offline index/documents, map "near me," and the change-on-the-fly verbs.

## The mode switch (ADR-0016)

- **Automatic by date:** the app enters **Trip mode** on the trip's `startDate` and returns to **Plan mode** before the start / after the end and between multi-leg gaps. Mode is **derived** from dates + current time — not stored on the trip.
- **Manual override:** the user can always toggle to peek at / work in the other mode (e.g. tweak the plan mid-trip, or preview the departure board while planning). The override is **session-only, in-memory UI state** — not persisted, and not synced — so it never changes the trip for anyone else, and a fresh load is always back to auto-derived; there's no separate "reset to auto" affordance because there's nothing to reset. It's also scoped per trip (multi-trip, ADR-0021): switching the active trip doesn't carry a peeked mode over from the previous one.
- **Location-awareness is deferred:** flipping to Trip mode on _arrival_ (geolocation) rather than by calendar is a nice future upgrade, out of v1 scope.

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
