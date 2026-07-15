# 0038 — Curated event/item icons + a canonical `category` primitive

**Status:** Proposed
**Date:** 2026-07-15
**Refines:** [0011](0011-hard-soft-event-model.md) (category is orthogonal to hard/soft — a different axis), [0018](0018-timeline-data-model-shape.md) (Event/MaybeItem field shapes; the pre-existing `icon?`)
**Relates:** [0004](0004-integrations-are-pipes.md) (the index an event can join), [0028](0028-plan-violet-color-budget-dark-ready.md) (semantic-colour budget; map-pin categories), [0016](0016-plan-trip-modes-one-surface.md) (Plan-mode entry forms)

Design reference: `mockups/event-item-icons-v1.html`.

## Context

Events and shelf ideas can carry an emoji badge — `Event.icon?` and `MaybeItem.icon?` already exist in `backend/prisma/schema.prisma` and `@waypoint/shared` (ADR-0018) — but nothing lets a user _choose_ one. `EventForm` hardcodes `DEFAULT_EVENT_ICON = '📌'`, manually-added ideas get `💡`, and trips fall back to a `🧳` placeholder (`frontend/src/constants.ts`). The ask: let people pick an icon from a **limited set**.

Two questions hide inside "let them pick an icon":

1. **What vocabulary?** The design language already rules on this — _"emoji are content, icons are UI"_ (design-language.md): the event badge is **content**, so the picker chooses a curated **emoji**, not a lucide glyph. And the colour budget's discipline — _pick from bounded ramps, don't invent values_ — says the set must be **curated and bounded**, not the full OS emoji keyboard (unbounded, cross-platform-inconsistent, and it would break the calm paper aesthetic).

2. **Is an emoji enough to store?** No. An emoji is _presentation_. Several planned features want _semantics_ — a **type**, not a glyph: an event surfacing in the central index alongside bookings even when it has no Booking (ADR-0004), the map's five pin categories (food/lodging/transit/leisure/services, design-language.md), type filtering, calendar categorisation. Storing only the glyph forces every future consumer to reverse-engineer meaning from an emoji, which is brittle. The catch: three category-ish vocabularies already exist and must **not** fork into three parallel taxonomies — `BookingType` (6 values), the map's pin categories (5), and the icon picker's browse-groups (10).

## Decision

**1. Two fields, two jobs: a canonical `category` (semantics) and `icon?` (the badge, an optional override).** `category` is the durable primitive future features read; `icon` is the glyph shown, which the user may override and which can vary by platform/theme without changing meaning. This mirrors the codebase's core discipline — colour carries _meaning_, decoration is separate (ADR-0028) — applied to iconography.

**2. One canonical `EventCategory` enum on `Event` and `MaybeItem`; everything else derives _from_ it.** The single meaning system:

```
transport · food · lodging · sightseeing · nature · activity · shopping · services · other
```

The three existing vocabularies map **into** it — none is a second source of truth:

| Source                         | → canonical `category`                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BookingType` (booked events)  | flight→`transport`, train→`transport`, hotel→`lodging`, restaurant→`food`, activity→`activity`, other→`other`                                                                                               |
| Icon picker browse-groups (10) | transport→`transport`, food→`food`, **drink→`food`**, lodging→`lodging`, **sights→`sightseeing`**, nature→`nature`, activity→`activity`, shopping→`shopping`, **practical→`services`**, **general→`other`** |
| Map-pin colour (5)             | `transport`→transit, `food`→food, `lodging`→lodging, `sightseeing`/`nature`/`activity`/`shopping`→leisure, `services`→services, `other`→leisure (fallback)                                                  |

`category` is **nullable** — legacy/unset rows are `null` ("uncategorised"). A glyph chosen in the picker always yields a category (the "general" group resolves to `other`), so new writes are non-null.

**3. The browse-groups are UI, the categories are data — and the UI may be finer than the enum.** The picker offers **ten** groups for _browsing_ (`drink`, `sights`, `practical`, `general` included) because that is how people _look for_ an icon; they collapse into the nine stored categories per the table above. The curated set (~100 glyphs, grouped) lives in **`@waypoint/shared` as the source of truth** (`ICON_SET`), imported by every host — bounded like the type/colour/radius ramps. Adding or removing a glyph is a **code change**, not a migration (icon is a free string); changing the `EventCategory` enum **is** a migration.

**4. Auto-suggest is deterministic, from booking type only ("Tier B").** A booked event has a structured `Booking.type`; we map it → `category` → a default glyph (`iconForCategory`). There is **no free-text / keyword / NLP inference** from the title — that fuzzier "Tier C" is rejected (see Alternatives). Events without a booking, ideas, and trips get a sensible default plus a manual pick. **Manual choice always wins**; a "↺ reset" reverts to the suggestion. The stored `icon` is whatever ends up chosen.

**5. One `IconPicker` component, three hosts — but trips carry a glyph only, no category.** The same picker serves `EventForm`, the maybe-shelf "add idea" flow, and trip creation. `Event` and `MaybeItem` get `category` + `icon`; **`Trip` gets a new `icon String?` only** (a trip is neither a timeline item nor an index item, so a trip "category" would serve no consumer — YAGNI). This replaces the `DEFAULT_TRIP_ICON` placeholder with a real pick.

**6. The picker chrome is neutral — selection never spends a semantic hue.** Amber/teal/violet stay reserved for time/place/plan (ADR-0028); the selected cell uses an ink fill, non-colour-redundant (fill + ring). The picker is an ordinary form control. The derived category is surfaced in the picker head so the saved semantic is legible.

## Consequences

- **Schema + migration.** Add `enum EventCategory`; add `category EventCategory?` to `Event` and `MaybeItem`; add `icon String?` to `Trip`. Backfill: events with a linked `Booking` derive `category` from `Booking.type`; everything else stays `null`. `@waypoint/shared` gains `eventCategorySchema`, `ICON_SET`, `categoryForBookingType()`, `iconForCategory()`, and `category`/`icon` on the create/update schemas — kept in sync with the Prisma schema (non-negotiable rule 3).
- **Index unification and map-pin colour are unblocked.** Both can query/group by `category` without touching a Booking, which is the whole point of storing it now rather than later.
- **Sync/undo need no special-casing.** `category` and `icon` are plain fields on the Event/MaybeItem update path; they flow through `ChangeService.mutate()` and undo like any other column (ADR-0019).
- **`icon` stays a free string; the curated set is enforced at the UI, not the DB.** This keeps forward-compat (a future glyph, a platform variant) cheap and avoids a migration per icon-set tweak. The trade-off: the DB won't reject an off-set glyph — acceptable, since writes only come from our own client.
- **`category` is intentionally decoupled from `kind` (hard/soft) and from `BookingType`.** Hard/soft is a commitment axis (ADR-0011); category is a semantic-type axis; they compose freely (a `hard` `transport` flight, a `soft` `food` idea). Keeping `EventCategory` distinct from `BookingType` lets the two evolve independently (a non-booking hike is `activity`, not a contorted `BookingType`).
- **The auto-suggest "smartness" is bounded and layerable.** Tier B is a lookup table — testable, offline, deterministic. If keyword inference is ever wanted, it can be added as a fallback _below_ the type signal without any schema change.

## Alternatives considered

- **Store the glyph only; no category (YAGNI).** Rejected: re-deriving a category from an emoji later is brittle (an emoji has no stable meaning), and it blocks the index/pin features that motivated the ask. The category is cheap to capture now (the picker already knows the group) and expensive to reconstruct later.
- **Reuse/broaden `BookingType` as the shared item type.** Rejected: its booking-flavoured values (flight/hotel/train) fit a hike, a viewpoint, or a shopping stop poorly, overloading `activity`/`other`; and it couples booking semantics to event semantics, which should evolve apart.
- **Make the stored enum the picker's 10 browse-groups.** Rejected: `general` and `drink` aren't durable semantic categories, and 10 values don't align with the 5 pin colours or 6 booking types. A tighter 9-value set that the browse-groups collapse into keeps one clean vocabulary.
- **A full OS emoji keyboard.** Rejected: unbounded and cross-platform-inconsistent, and it violates the "pick from bounded ramps" discipline that governs colour, type, radius, and motion.
- **Free-text / keyword / NLP auto-suggest ("Tier C").** Rejected for v1: Hebrew morphology (prefix gluing, construct forms, plurals) makes naive matching unreliable, and a keyword dictionary is ongoing content maintenance for a guess that's only ever a convenience. Tier B (type-driven) delivers the reliable share of the benefit with none of the fuzziness, and Tier C can layer on later.
