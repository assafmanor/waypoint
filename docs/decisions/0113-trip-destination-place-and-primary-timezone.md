# 0113 — Trip destination is a picked place that sets the primary timezone (derived default, freely editable, never a forced choice); origin stays derived

**Status:** Proposed (feature scope + shape; not built)
**Date:** 2026-07-23
**Refines:** [0032](0032-minimal-trip-creation.md) (destination stops being free text and `timezone` stops being a manual `UTC` default — both are set via one smart destination field at creation, keeping creation minimal), [0107](0107-per-place-timezones-and-multi-zone-time.md) (this is _where_ `Trip.timezone` — the primary/destination zone — gets chosen; per-event/place zones remain the engine and the primary stays the fallback; **origin stays a derived segment concept, not a stored trip field — upheld, §3/§5**) (relates [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md)/[0110](0110-maps-and-places-frontend-architecture.md) the Places proxy/picker it extends and the `ZonePicker` §3 planned — realized here as the shared zone control, [0039](0039-trip-settings-admin-governed-data-plane.md) whose 5-item timezone `<select>` this widens, [0018](0018-timeline-data-model-shape.md) the trip shape, [0038](0038-icons-and-canonical-category.md) the existing country-flag picker in trip mode)

## Context

Today `Trip.destination` is free text and `Trip.timezone` is a manual `UTC` default that nothing populates — so every trip starts in the wrong zone until someone edits settings. ADR-0107 already _defines_ `Trip.timezone` as the trip **primary (destination) zone**: the fallback for placeless/pre-transport times and the Plan-mode framing anchor, with per-event/place zones (the real engine) overriding it. So a destination that sets a real primary zone at creation fills a field the model already expects — it isn't new machinery.

Two constraints shape the solution:

- **Any granularity, including whole countries.** A user may pick a city (Paris), a region (Crete), or a **country (United States)** — we must not disallow countries. So the destination cannot be assumed to map to a single timezone.
- **No trip exists yet at creation.** The Places proxy (ADR-0108/0110) is trip-scoped (`trips/:tripId/places`, behind `MembershipGuard`, and `resolve` _persists_ a trip `Place`), so it can't be reused as-is before the trip exists.

The tension is only in the **primary timezone**: a city or single-zone country has one obvious zone; a multi-zone country (US, Australia, Russia, Canada, Brazil) has none. `geo-tz` maps a _point_ to one zone — right for a city, arbitrary for a country centroid.

And however the zone is set, it must be **manually adjustable from a real list**. Today trip settings picks the zone from a hardcoded 5-item `<select>` (`TZ_OPTIONS` = Tokyo/Jerusalem/London/New_York/UTC) even though `timezoneSchema` already accepts _any_ valid IANA zone — the UI is the only thing that's narrow. The zone chip ADR-0110 §3 planned (`ZonePicker`) is the same "let me pick a zone" control, still unbuilt. So this ADR also owns **how you choose a zone**, once, for every surface.

## Decision

**The destination is a picked place at any granularity, and it sets the primary timezone by _derive-or-choose_.**

1. **Destination = a picked place** via Google Places Autocomplete restricted to geo types (`includedPrimaryTypes` = locality / administrative-area / country), so cities, regions, and countries all resolve. The Trip stores the display name plus structured fields (`googlePlaceId`, `lat`, `lng`, `countryCode`); `destination` stays the display string.

2. **Primary timezone = a derived default, never a forced choice.** The picked place always carries a representative point, so `geo-tz` always yields a concrete default zone at every granularity — a country resolves to one point → one zone. Creation never blocks on a timezone decision.
   - **Single-zone destination** (a city; or a single-zone country like Japan/Israel) → the derived zone is trustworthy; set it silently.
   - **Multi-zone country** (US, Australia, Russia…) → still take the derived default, but surface it as a **pre-filled, editable** line with a soft, dismissible note ("the United States spans several time zones — this is a starting point, change it any time"). No modal, no list to decode, nothing required. Deciding whether to _show_ the note uses a small country→zones map; without it the note simply doesn't show and the default still stands.
   - **Why leaving it imperfect is safe:** the primary is only the fallback for placeless/pre-transport times + the Plan-mode framing anchor (ADR-0107 §5); **per-event/place zones override it**, and it self-corrects as real places/flights are added. It's editable at creation and in settings. So a "good enough" default is genuinely fine — the user is never asked to predict something they can't (a real NY→LA trip has no single right answer, and that's OK).

3. **Origin is not stored.** The origin/home zone stays a derived segment concept from the outbound flight (ADR-0107 §3/§5). Adding a stored trip origin was considered and rejected here (below).

4. **A new trip-agnostic endpoint pair** (no `tripId`, authed, **per-user** throttled, **no persistence** — there's no trip to write to): a destination search (autocomplete, geo-type-restricted) + a resolve/geocode returning `{ googlePlaceId, name, countryCode, lat, lng, timezone | candidateZones }`. It's distinct from the trip-scoped proxy but reuses `google-places.client.ts` (add the geo-type filter + a geocode path). The trip is then created with the resolved destination fields + the chosen `timezone`.

5. **Minimal creation preserved (ADR-0032).** Destination stays a single field (now a picker); the primary timezone is a derived, editable default shown inline — never a required step. Seeding `currency` from the country is possible but optional/deferred.

6. **How you choose a zone = one shared `ZonePicker`, over the full IANA set.** A net-new `ui/primitives/ZonePicker` (via `Modal`/`useOverlay`): a **searchable** list built from **`Intl.supportedValuesOf('timeZone')`** — the runtime's complete IANA zone set, so there is no hardcoded list to curate and no dataset to ship or age. Each row reads as a friendly label (city + current UTC offset, e.g. "Tokyo · GMT+9"); **relevant candidates are surfaced first** (the device zone, the trip's place zones, the current value) with search by city/zone/offset over everything else. This one primitive is the single answer to "pick a zone" across **three call sites**: the creation primary-zone default's edit/note affordance (Decision 2), **trip settings** (it replaces the 5-item `TZ_OPTIONS` `<select>`), and the **per-event zone chip** ADR-0110 §3 planned (`displayTimezone` override). Reuse-before-adding (CLAUDE.md rule 8): build it once here, wire it everywhere a zone is chosen.

## Consequences

- **Trip schema migration:** add structured destination fields (`destinationGooglePlaceId?`, `destinationLat?`, `destinationLng?`, `destinationCountryCode?`); `timezone` is now set at creation instead of defaulting to `UTC`. Mirror in `@waypoint/shared` + `createTripSchema` (non-negotiable rule 3).
- **New backend endpoint(s) + client method**, with a **per-user** throttle (the per-member·trip tracker doesn't apply before a trip exists). Reuses the already-bundled `geo-tz` for the single-point case.
- **Optional static dataset:** a small offline country-code → IANA-zones map, used only to (a) decide whether to show the "spans multiple zones" note and (b) pre-filter the change-picker's candidates. Not required — the derived default works without it, with a full IANA search as the change fallback.
- **FE:** the creation form gains a destination picker; the trip-scoped `usePlaceSearch` can't be reused verbatim (it needs a trip and persists), so either generalize the search core (inject the search fn + a no-persist mode) or add a lighter creation-only search hook — an implementation call at build.
- **The 5-item `TZ_OPTIONS` `<select>` is retired** in favour of the shared `ZonePicker`; trip settings, creation, and the event zone chip all pick zones the same way. `timezoneSchema` already accepts any IANA zone, so no validation change — only the UI widens from 5 zones to the full set.
- **Consistent with the offline rule:** creation is inherently online (it needs Google), like the rest of the picker; nothing here is expected to work offline.

## Alternatives considered

- **Country-only via the existing offline `DESTINATIONS` dataset** (the flag picker). Rejected — can't express Paris/Crete and carries no coords, so it can't derive a timezone at all.
- **A blocking zone chooser at creation (this ADR's first draft).** Rejected — forcing "which zone will you travel to?" is intrusive and often unanswerable: a genuine multi-place trip (NY + LA) has no single answer at creation, and users shouldn't have to decode an IANA list. The derived default + optional, non-blocking refinement respects that the value is a low-stakes, self-correcting fallback.
- **A stored trip origin.** Rejected — reopens ADR-0107 §5 (origin is a derived segment concept from the outbound flight, never a stored field); its only real value (a home zone before any flight exists) is marginal against the model cost.
- **Reuse the trip-scoped Places proxy at creation.** Impossible — no `tripId` yet, and `resolve` persists a trip `Place`.
- **Google Time Zone API for the zone.** Rejected — paid per-call; `geo-tz` (already bundled) covers the single-point case for free, and the multi-zone case is a user _choice_, not an API lookup.

## Open (confirm at build)

The exact `includedPrimaryTypes` set; the country→zones data source; generalize `usePlaceSearch` vs a dedicated creation hook; whether to seed `currency` from the country.
