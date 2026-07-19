# 0063 — A per-category time-behaviour profile: bracketed spans + ambient multi-day (derived, not stored)

**Status:** Accepted (Assaf sign-off 2026-07-18)
**Date:** 2026-07-18
**Refines:** [0038](0038-icons-and-canonical-category.md) (adds a time-behaviour profile to the canonical `category` registry it established), [0054](0054-ambient-span-events-off-the-day-schedule.md) (generalizes "ambient-span" from a bare `endDate` check into one profile behaviour — the behaviours there stand), [0011](0011-hard-soft-event-model.md) (hard/soft is the commitment axis; this is a separate time-presentation axis), [0018](0018-timeline-data-model-shape.md) (derive, don't store — the profile is a lookup, nothing new is persisted)
**Relates:** [0059](0059-booking-presentation-on-home-and-index.md) (the hero/appearance work that becomes an application of this profile), [0047](0047-booking-event-linkage-and-notes.md)/[0048](0048-index-build-data-model-refinements.md)/[0051](0051-place-normalization-and-authority.md) (Booking↔Event; the `endDate` span; Event as sole time authority), [0037](0037-overnight-events.md) (a single overnight tail vs a true multi-day span)

## Context

Raised by Assaf (2026-07-18), before mocking up the booking-presentation work: rather than keep special-casing hotels, flights, etc. in the Home and the day screens, introduce a first-class concept — a "prolonged event" that shows at its **start and end** (with some padding) and is **passive in between**, whose behaviour, texts, and time-management are **configurable** — so the single-day vs multi-day discrepancy across screens becomes one known, handled thing, and new types slot in cleanly.

He's named a real defect. Two behaviours we'd just decided this session are each a per-type patch:

- **ADR-0054** makes a hotel _ambient_ — excluded from the counted schedule, rendered as a backdrop across its days — keyed on a bare `e.endDate != null` check that repeats across `lib/glance.ts`, `screens/Home.tsx`, `DayView`, `PlanDay`.
- **ADR-0059** makes the hero surface a hotel around check-in/out and a flight at departure/arrival — as hotel/flight-specific hero logic.

Both are the **same underlying idea** — a thing whose _ends_ matter and whose _middle_ is passive — expressed twice, per type, in scattered code. That scatter _is_ the discrepancy Assaf wants gone.

The codebase already has the right hook. ADR-0038 established a canonical `EventCategory` (9 values) and a per-category registry in `packages/shared/src/icons.ts` — `CATEGORY_DEFAULT_ICON`, `BOOKING_TYPE_CATEGORY`, `categoryForBookingType`. "How a kind of thing behaves over time" belongs in exactly that registry.

## Decision

**Introduce a per-`EventCategory` time-behaviour profile — a small, closed lookup table beside the icon registry — that every time-aware surface reads. "Prolonged / bracketed" and "ambient" stop being per-type special-cases and become two _derived_ behaviours declared once per category.**

**1. The profile shape (closed, in `@waypoint/shared`):**

```ts
interface CategoryTimeProfile {
  bracketed: boolean; // the ends matter; the middle is passive (show start & end, not the span between)
  ambientWhenMultiDay: boolean; // if the event crosses days: backdrop, off the counted schedule
  transitions?: {
    // i18n keys for the two ends (only meaningful when bracketed)
    startKey: string; // e.g. 'checkIn' / 'departure'
    endKey: string; // e.g. 'checkOut' / 'arrival'
  };
}
export const CATEGORY_TIME_PROFILE: Record<EventCategory, CategoryTimeProfile>;
```

Seed values (tunable; the closed set of 9 categories):

- `transport` → `{ bracketed: true, ambientWhenMultiDay: true, transitions: { departure, arrival } }`
- `lodging` → `{ bracketed: true, ambientWhenMultiDay: true, transitions: { checkIn, checkOut } }`
- everything else (`food`, `sightseeing`, `nature`, `activity`, `shopping`, `services`, `other`) → `{ bracketed: false, ambientWhenMultiDay: false }` — an ordinary point/block.

**2. Two behaviours derive from the profile + the event's own timing; nothing is stored.**

- **Bracketed** (profile `bracketed`): the presentation shows the start and the end (with padding windows), the middle passive. Applies **regardless of duration** — a same-day flight and a multi-night hotel are both bracketed; when start ≈ end it collapses naturally to a point.
- **Ambient** (profile `ambientWhenMultiDay` **and** the event is multi-day — `endDate` crosses days, ADR-0018/0047): rendered as a backdrop across every covered day, **off** the counted schedule (out of `buildTimeTree`, the glance rail width, and `remaining`). This is exactly ADR-0054's behaviour, now derived from the profile instead of a bare `endDate` check. A single overnight tail (ADR-0037, no `endDate`) is **not** multi-day, so it stays an ordinary block — unchanged.
- **Count-eligibility is derived, not a field:** an event counts in the schedule unless it is _currently ambient_. A same-day flight (bracketed, not ambient) still counts; a multi-night hotel (ambient) does not. No separate flag needed.

**3. Transition texts come from the profile, once.** The check-in/check-out and departure/arrival labels that ADR-0059 and ADR-0054's amendment need are the profile's `transitions` keys, resolved in `i18n/he.ts`. A new bracketed category declares its two keys and every surface (hero, glance markers, Index row/detail) gets the right words for free. _(Refined 2026-07-19 — see the Amendment below: a mode within a category can override the two keys, so a flight reads take-off/landing while a train reads the generic departure/arrival.)_

**4. It's derived and keys on `category`, so it applies to every event, not only bookings.** A manually-added `lodging` event with an `endDate` (three nights at a friend's, no Booking) gets the ambient backdrop too — the behaviour follows the _semantic type_, not the presence of a Booking. `category` is nullable (ADR-0038); a null/unset category uses the default profile (ordinary point/block). **No migration** — the profile is a pure lookup over the existing enum.

**5. Orthogonal to hard/soft.** hard/soft is the commitment axis (ADR-0011); bracketed/ambient is a time-presentation axis; category is the semantic axis. They compose freely — a `hard` `transport` flight is bracketed-not-ambient; a `hard` `lodging` hotel is bracketed-and-ambient; a `soft` `food` idea is neither.

## Consequences

- **One place to change, every surface follows.** `glance.ts`, `Home.tsx` (hero + rail), `DayView`, `PlanDay`, and the Index row/detail read `CATEGORY_TIME_PROFILE` instead of ad-hoc `endDate`/type checks. The single-day vs multi-day discrepancy across screens is resolved by construction.
- **ADR-0054 becomes "the ambient profile behaviour."** Its decisions (backdrop across days, off the count, uncounted check-in/out markers) stand unchanged; only the _discriminator_ generalizes from `e.endDate != null` to `profile.ambientWhenMultiDay && isMultiDay(e)`. Its 2026-07-18 amendment (transition markers) becomes "render the profile's `transitions`."
- **ADR-0059 becomes "apply the bracketed profile."** The hero renders a bracketed event by its `transitions` + padding windows; the in-progress ("inside a booking") treatment is "a bracketed event, now inside its span"; the shared appearance grammar reads the profile. No hotel/flight-specific branches.
- **Extensible by design** (Assaf's goal): a new booking/category type maps to a category (ADR-0038), the category carries a profile, and its time-behaviour is handled everywhere with no new per-screen code — "known and handled when we add new types."
- **`@waypoint/shared`:** add `CategoryTimeProfile` + `CATEGORY_TIME_PROFILE` beside the icon registry, plus small derivation helpers (`isBracketed(event)`, `isAmbient(event)`, `isMultiDay(event)`), unit-tested. **No schema / DB / backend change** — derived from the existing `category` + `endDate`.
- **Padding-window values** (how long before/after each transition the hero shows the event) live with the profile as tunable constants; their exact values are settled in the ADR-0059 mockup, not here.
- **Doc sync:** ADR-0054 and ADR-0059 gain a "rebased on 0063" note; the backlog's booking-presentation tasks gain this shared foundation as their first step.

## Alternatives considered

- **A new stored `prolonged`/`ambient`/`allDay` boolean on Event (the literal "new event type").** Rejected for the same reason ADR-0054 rejected a stored ambient flag: it duplicates what `category` + `endDate` already imply, needs a migration and a write path, and drifts out of sync. Derive from the category profile instead.
- **Keep the per-type special-cases (ADR-0059/0054 as first written).** Rejected: that's the scattered, discrepancy-prone state Assaf flagged; the profile centralizes it _before_ any of it is built — the cheapest possible moment.
- **Key the profile on `BookingType` instead of `category`.** Rejected: `category` is the canonical primitive (ADR-0038), covers non-booking events too, and keying on `BookingType` would re-fork a taxonomy 0038 deliberately unified and miss manual events.
- **A general per-event configuration / rules engine ("configure each event's behaviour").** Rejected: over-built for a small-group app. A closed 9-row lookup is testable, offline, and proportionate — the same discipline as the bounded icon/colour/type ramps (ADR-0038/0028). Per-event overrides can layer on later if ever needed, without a schema change.
- **Fold it into ADR-0059/0054 without a foundation ADR.** Rejected: it's a model-shaping decision that reshapes two ADRs and touches the shared package; it earns its own record.

## Amendment (2026-07-19) — transition wording is by mode, not only by category

**Trigger.** A train surfaced on the Home hero and the glance rail reading _המראה / נחיתה_ (take-off / landing) — flight wording. The `transport` category profile hard-coded aviation words as its two transition keys (§3), and both flight and train are `transport` (ADR-0038), so every surface transport mode inherited flight vocabulary.

**Refinement.** §3 stands — transition keys still come from the profile as the default — but a **mode within a category may override the two keys**, resolved once in `@waypoint/shared`:

- The `transport` profile's default keys now resolve to the **generic** _יציאה / הגעה_ (departure / arrival), which is correct for every surface/sea mode (train, bus, ferry, car).
- A small, closed per-glyph override table (`ICON_TRANSITION_KEYS`, bounded like the icon set itself, ADR-0038) refines a mode whose ends read differently — today only `✈️` → take-off / landing (`flightDeparture` / `flightArrival`).
- A single resolver, `eventTransitionKeys(event)`, returns the glyph override when present, else the category profile's `transitions`. Every time-aware surface (hero `hero-booking.ts`, glance markers `glance.ts`, day entries, `Home.tsx`) reads it — nothing hard-codes a mode's words per screen.

**Why the glyph, not `BookingType`.** The profile stays keyed on `category` (the alternative to key on `BookingType` remains rejected, above). But a bare `TripEvent` carries no booking type — only `category` + `icon` (ADR-0038) — and the derivation must work for manual, non-booking events (§4). The event's own glyph is the finest mode signal every event already has, so the override keys on it; an unknown glyph falls back to the category default. Adding a mode with distinct wording is one line in `ICON_TRANSITION_KEYS` — no schema change, no per-screen edit. This keeps the hero/glance wording consistent with the type-aware `timingLabels(BookingType)` already used on the Index/detail (`booking-timing.ts`).
