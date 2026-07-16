# Feature Catalog

**Status:** DRAFT (PM proposal). Priority uses **MoSCoW** (Must / Should / Could / Won't-for-now). Phase is the target release.

## How to read this

- **Must** = v1 is not v1 without it.
- **Should** = strongly wanted in v1, first to cut under pressure.
- **Could** = v1.1+ once the core proves itself.
- **Won't (now)** = deliberately deferred; recorded so we don't re-litigate.

## Core surfaces

| Feature                                  | Priority | Phase | Notes                                                                                     |
| ---------------------------------------- | -------- | ----- | ----------------------------------------------------------------------------------------- |
| Home "Now/Next" departure board          | Must     | v1    | Signature element; live clock, countdown, day progress                                    |
| Day-by-day itinerary                     | Must     | v1    | Hard/soft cards, quick verbs, undo                                                        |
| Central index (bookings + codes)         | Must     | v1    | **Offline-first**                                                                         |
| Offline encrypted documents              | Must     | v1    | Passports, insurance                                                                      |
| Map with pinned events + "near me now"   | Should   | v1    | Deep-link to Google Maps for turn-by-turn                                                 |
| Automatic mode switch (planning ↔ trip) | Should   | v1    | By date; location later                                                                   |
| Day-at-a-glance card (derived)           | Should   | v1    | Trip-Home glance, computed from events (ADR-0045); replaces the weather/FX/budget row     |
| Glance cards (weather / FX)              | Could    | v1.1  | Return as their own cards when the integration pipes land (ADR-0045/0004); budget dropped |

## Modes (Plan / Trip)

| Feature                            | Priority | Phase | Notes                                                                   |
| ---------------------------------- | -------- | ----- | ----------------------------------------------------------------------- |
| One-surface, re-emphasized tabs    | Must     | v1    | ADR-0016; tabs shift emphasis by mode                                   |
| Auto mode switch by date           | Must     | v1    | Derived from trip dates vs now                                          |
| Manual mode override (peek/work)   | Should   | v1    | Per-user, per-device UI state                                           |
| Plan: trip setup + invites         | Must     | v1    | Create trip, invite 5, connect Google                                   |
| Plan: itinerary builder            | Must     | v1    | Add/arrange hard/soft events across days                                |
| Plan: manual booking entry         | Must     | v1    | → index; link to hard events                                            |
| Plan: research + maybe-shelf       | Should   | v1    | Search/pin places, park ideas                                           |
| Location-based switch (on arrival) | Could    | vNext | Geolocation flip; deferred                                              |
| Web/AI enrichment of entries       | Could    | vNext | Auto-pull hours/photos/details as a pipe; keep model open (modes.md 🔭) |

## Flexibility / change-on-the-fly

| Feature                                   | Priority | Phase | Notes                                       |
| ----------------------------------------- | -------- | ----- | ------------------------------------------- |
| Hard/soft event typing                    | Must     | v1    | Core model                                  |
| Quick verbs (skip/delay/swap/done/on-way) | Must     | v1    |                                             |
| Undo everywhere                           | Must     | v1    | Makes fast edits safe                       |
| "Maybe" shelf                             | Should   | v1    | Park ideas, schedule on demand              |
| Ripple suggestion on move                 | Should   | v1    | Suggestion only, never touches hard anchors |
| Hard-event edit warning                   | Must     | v1    | Guardrail                                   |

## Collaboration

| Feature                               | Priority    | Phase | Notes                                                                      |
| ------------------------------------- | ----------- | ----- | -------------------------------------------------------------------------- |
| Shared trip + invite link             | Must        | v1    | Multi-user is a v1 requirement                                             |
| Real-time-ish sync of itinerary/index | Must        | v1    | See collaboration-model.md                                                 |
| Group change-feed                     | Should      | v1    | "Noam moved ramen to 20:00"                                                |
| Member presence (who's connected)     | Could       | v1    | Light; avatars already in mockup                                           |
| Live GPS location sharing             | Won't (now) | —     | Privacy + effort; revisit                                                  |
| Multi-trip membership + trip switcher | Should      | v1    | Model already supports it; minimal switcher + active-trip state (ADR-0021) |
| Roles: `admin` (creator) + `peer`     | Must        | v1    | Structural from day one; enforcement minimal/deferred (ADR-0005)           |
| Full role permission matrix           | Won't (now) | —     | Admin powers defined in a later task                                       |

## App shell & lifecycle (outside a single trip)

The thin outer ring — chrome to get you into a trip and back out. Spec: [architecture/app-shell.md](../architecture/app-shell.md); decision: ADR-0024.

| Feature                                  | Priority    | Phase | Notes                                                           |
| ---------------------------------------- | ----------- | ----- | --------------------------------------------------------------- |
| Sign-in screen (Google)                  | Must        | v1    | Google-only (ADR-0013); one button                              |
| Zero-state home (no trips)               | Must        | v1    | Create and Join weighted equally (5-friend model)               |
| Trip creation (one form)                 | Must        | v1    | `createTripSchema`; land in the new trip, prompt to invite      |
| Join landing (invite link + preview)     | Must        | v1    | Confirm w/ minimal preview via new public `GET /invites/:token` |
| Trip switcher (header sheet)             | Should      | v1    | Not a dashboard; active-trip in localStorage (ADR-0021)         |
| Account menu (name + sign out)           | Must        | v1    | Minimal; profile editing deferred                               |
| Trip settings & members                  | Must        | v1    | Invite/members/leave/edit; not a nav tab (ADR-0004)             |
| Profile editing / trips archive & search | Won't (now) | —     | Deferred; keeps the shell thin                                  |

## Integrations (pipes, not screens)

| Feature                                 | Priority | Phase | Notes                                                                          |
| --------------------------------------- | -------- | ----- | ------------------------------------------------------------------------------ |
| Google Maps/Places deep-links           | Must     | v1    | Nav, hours, ratings                                                            |
| One-way calendar sync (trip → personal) | Should   | v1    | ADR-0003                                                                       |
| Gmail booking import ("TripIt magic")   | Could    | v1.1  | Deferred — high effort, not the most important for v1 (manual entry covers it) |
| Flight status feed                      | Could    | v1.1  | Feeds Now/Next directly                                                        |
| WhatsApp share-out                      | Could    | v1.1  | Share a card/plan to group chat                                                |
| Expense splitting (Splitwise-style)     | Could    | v1.1  |                                                                                |
| Shared Google Photos album              | Could    | v1.1  |                                                                                |

## Practical layer

| Feature                        | Priority    | Phase | Notes                                                                            |
| ------------------------------ | ----------- | ----- | -------------------------------------------------------------------------------- |
| Currency rate display          | Should      | v1    |                                                                                  |
| Weather                        | Should      | v1    |                                                                                  |
| Emergency numbers by country   | Should      | v1    |                                                                                  |
| WiFi codes (copy to clipboard) | Could       | v1    | Already in mockup                                                                |
| Per-day budget (display)       | Won't (now) | —     | Pulled from the Home (ADR-0045 / ADR-0014 amendment); no expense model behind it |
| Shared expense tracking        | Could       | v1.1  | Bigger than display-only                                                         |
