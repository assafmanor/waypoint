# 0107 — Per-place timezones and the multi-zone time model

**Status:** Proposed (rides the Maps & Places epic — [ADR-0106](0106-maps-and-places-epic-scope-and-phasing.md) — for the coordinates it derives zones from; the model here is decided in principle, the schema/mechanism details are for the data-model/architecture session)
**Date:** 2026-07-22
**Refines:** [0018](0018-timeline-data-model-shape.md) (events store `startsAt`/`endsAt` as **UTC instants** — the reason this is display-only, not a storage overhaul), [0032](0032-minimal-trip-creation.md) (the single `Trip.timezone` derived from the destination — demoted here), [0036](0036-event-time-setter.md) (`zonedIso` wall-clock↔instant authoring), [0037](0037-overnight-events.md) (the "which day does a boundary event file under" cousin), [0064](0064-day-transition-entries-and-home-band-trim.md) (the per-day transition rows a zone-crosser's two ends reuse — one per zone), [0048](0048-index-build-data-model-refinements.md)/[0051](0051-place-normalization-and-authority.md) (the `Place` entity + the linked/unlinked place resolver a zone rides on), [0084](0084-booking-duration-display.md) (duration is an instant-diff, stays zone-independent) (relates [0026](0026-real-clock-and-dev-time-travel.md)/[0070](0070-global-error-envelope-and-temporal-validation.md)/[0003](0003-one-way-calendar-sync.md)/[0106](0106-maps-and-places-epic-scope-and-phasing.md))

## Context

A trip has a single `Trip.timezone` (default `UTC`, derived from the destination at creation, ADR-0032), and every event time is **rendered** against it (`formatTime(instant, trip.timezone)`), **authored** against it (`zonedIso(date, time, trip.timezone)`), and **day-framed** against it (`todayInTz`, the day-strip, day bucketing). This is wrong the moment a trip touches more than one zone — most sharply for transport that crosses zones: a flight departing Tel Aviv is stored as the correct instant but painted in the destination's (Tokyo's) time, so the traveler standing at the gate sees the wrong departure time.

The precise diagnosis (this ADR turns on it):

- **Storage is already zone-correct.** `startsAt`/`endsAt` are absolute UTC instants (ADR-0018); an instant needs no timezone. **No migration of existing instants.**
- **The now/next engine is already zone-correct.** `deriveNow`/`eventPhase`/countdowns compare instants against the clock, which is absolute. "What's now, when do we leave" works across zones today, untouched.
- **The bug is confined to three display/authoring roles**, all of which hardwire the one trip zone: rendering wall-clock labels, interpreting typed input, and day-framing ("today"/day-strip/bucketing).

The Maps & Places epic (ADR-0106) is about to give places real coordinates — from which an IANA zone is derivable — so the fix becomes buildable. That is why this rides that epic rather than standing alone.

## Decision (proposed)

**1. Places carry a timezone, derived and cached on the row.** A `Place` with coordinates resolves its IANA zone via a **free, offline lat/lng→zone lookup** (no Google Time Zone API cost, works offline), cached on the row like the rest of its Google enrichment (ADR-0048's "the `Place` row is the cache"). Resolved once at pick time. A name-only "Place-lite" (no coords) has no zone yet.

**2. Three roles of "timezone" that were conflated get separated** — this is the load-bearing move:

- **Authoring default** — the zone we interpret typed input in.
- **Event display zone** — the zone we render an already-created event in, forever after.
- **The live "now"** — the clock, the now-line, "today", the day-strip.

They must differ: if display simply followed the viewer's current context, a dinner planned at **19:00** would silently re-render as **20:00** the instant you cross a zone — a fixed plan appears to move. So **display is sticky; only the live "now" tracks your position.**

**3. An event's display/authoring zone resolves by a priority order:**

1. **Place attached** → the place's zone. **Transport is the one asymmetric case**: `startsAt` renders in the origin (`fromPlace`) zone, `endsAt` in the destination (`toPlace`) zone.
2. **No place** → the zone of the **itinerary segment** the event sits in. **Zone-crossing transport events partition the timeline into zone segments**: everything before the outbound crossing is the **origin/home zone** (known once the outbound flight's `fromPlace` is entered), everything after is the destination zone (and so on per crossing). A placeless event inherits its segment's zone.
3. **No anchoring transport at all** → the **trip primary zone** (see the "base" clarification below).

**"Base" is two different zones — name them apart.** They sit at opposite ends of the outbound flight and must not be conflated:

- **Origin/home zone** — the pre-outbound-crossing segment (Jerusalem), derived from the outbound flight's `fromPlace`; a _segment_ concept, not a stored trip field.
- **Trip primary zone** — the destination (Tokyo). This is what `Trip.timezone` demotes to (ADR-0032 already derives it from the destination): the Plan-mode framing anchor and the fallback when no transport is entered yet. It's the "actual trip timezone" a planner refers to before the trip.

They coincide only for a single-zone trip. One consequence to state, not discover: **before the outbound flight is entered, a pre-departure home event ("leave for airport 15:00") defaults to the trip primary (destination) zone** — the app doesn't know your origin until the flight exists — and **flips to the origin zone once the flight is added**. The editable zone chip (§6) covers the gap.

Worked example (the case that drove this): standing at Ben Gurion on flight day, "**coffee now**" is before the flight → **origin zone (Jerusalem)**; "**dinner tonight**," dropped after the flight in the day's order → **destination (Tokyo)** — correct even though the phone is physically in Israel.

**4. The live "now" tracks your position — via the itinerary, not GPS.** In Trip mode the clock/now-line/"today" sit in the zone of your **current itinerary segment** (which side of the nearest crossing you're on); in Plan mode they sit in the trip primary (destination) zone. Device GPS is **not** the driver (fragile at boundaries, permission-gated, and confidently wrong exactly when zones matter — standing at the origin airport, GPS says origin even when you mean the destination). Location, if ever used, is a confirmation nudge only.

**"Today" and the day-strip bounds roll at the _current segment's_ midnight** — a direct consequence: since the live "now" tracks your current segment, the calendar day rolls over at that zone's midnight, so "today" shifts on the travel day as you cross.

**5. `Trip.timezone` is demoted, not deleted.** It stops being every event's display authority and becomes the explicit **trip primary zone** (the destination, per ADR-0032): the fallback for placeless/pre-transport times and the Plan-mode framing anchor. It is _not_ the origin/home zone — that's a segment concept derived from the outbound flight (§3), never a stored trip field. (Renaming to `primaryTimezone` is optional cosmetic.)

**6. The resolved zone is always a visible, editable field.** The time input shows the inferred zone as a chip (e.g. "🕐 19:00 · Tokyo ▾"), one-tap correctable. Inference is never silently authoritative on the high-cost boundary cases — the design goal is "sensibly defaulted, trivially fixable," not a cleverer silent guess.

**7. Sticky display needs a home for a placeless event's zone.** Proposed mechanism: a nullable **`Event.displayTimezone`** — set to the resolved zone when a placeless event is authored (so "my Tokyo quick-add stays Tokyo"), null when a place drives the zone. _This is the main open sub-question_ (store-on-event vs. re-derive-from-segment at render); confirmed in the data-model session.

**8. Edge-case rules:**

- **Attaching a place after authoring a placeless time** → **keep the wall-clock, shift the instant** (you meant the time _there_).
- **Which day(s) a zone-crosser files under → each end files under its own zone's calendar day**, via ADR-0064's per-day transition rows: a **departure transition entry** on the **origin day** in the **origin zone**, and an **arrival transition entry** on the **destination day** in the **destination zone**. So the day-strip reads "✈ depart 23:00 TLV" on day N and "✈ arrive 18:00 Tokyo" on day N+1. This reuses the existing transition-row mechanism rather than inventing a "which single day" rule, and it handles the date-line shift correctly (each end's day is computed in that end's zone).
- **Cross-zone times get a zone tag** so they aren't misread: "23:00 TLV → 18:00 +1 Tokyo".
- **No signal / mid-flight "local"** → mid-flight (between a crossing's departure and arrival) falls back to the **destination** zone (where you're heading); an unknown zone with no anchoring transport falls back to the **trip primary** zone.

## Consequences

- **No migration of existing instants** — they are absolute (ADR-0018). New: `Place.timezone` (derived/cached), a nullable `Event.displayTimezone` (pending §7), demoted `Trip.timezone` semantics; `@waypoint/shared` mirrors all of it.
- **The DST-correct machinery already exists and is already zone-parameterized.** `zonedIso`'s fixed-point wall-clock↔instant resolution takes a zone argument today (threaded with `trip.timezone`). The work is _threading the resolved per-event/segment zone through_ the display/authoring layer + a coords→zone resolver + the segment-partition helper — not inventing timezone handling. The `lib/time.ts` ponytail on DST-ambiguous hours stands unchanged.
- **The now/next engine is untouched** (instant-based). **Duration** (ADR-0084) stays zone-independent (instant-diff).
- **The place resolver extends, it doesn't multiply** — `lib/places.ts` (the linked/unlinked place resolver, ADR-0051) is where "which zone is this event in" naturally lives, plus a segment-partition helper keyed off transport. Reuse, per CLAUDE.md rule 8.
- **Transport events become load-bearing for zone inference** — a trip with no transport entered uses the base zone everywhere (fine, nothing crosses); adding the outbound flight reorients every placeless time after it to the destination. A satisfying "add the flight, the trip's clock reorients" behavior, but explicitly keyed to transport being entered.
- **Calendar sync (ADR-0003, deferred) lands more correctly** with per-place zones (it must already resolve place via booking/Place, ADR-0051).

## Where it sits in the Maps & Places phases (ADR-0106)

Not a seventh map phase — a **dependent workstream** riding the epic:

- **`Place.timezone` resolution folds into Phase 1** (the picker): when the picker lands coordinates, it also resolves + caches the zone. One small addition to that task.
- **The display/authoring/segment layer is a follow-on gated on Phase 1**, runnable **alongside Phases 2–3**, and **independent of the map rendering** (Phases 4/6) — it's a time-model change, not a map-surface one. The transport origin/destination split leans on the transport Place FKs already in the model (ADR-0048).

## Alternatives considered

- **Keep the single trip zone (status quo).** Rejected — wrong for transport and any multi-zone trip; the motivating bug.
- **Device-GPS-driven active zone.** Rejected — fragile at boundaries, permission-gated, and confidently wrong at exactly the moments zones matter (base airport on flight day). Itinerary structure is the reliable, offline, permission-free source.
- **Fluid display — re-render every event in the viewer's current zone.** Rejected — makes a fixed plan appear to move ("dinner slid to 20:00"); the reason display must be sticky.
- **Store a zone on every event.** Rejected as heavier than needed — a place drives the zone when present; only placeless events need to remember one (§7).
- **Store wall-clock + zone instead of a UTC instant.** Rejected — the instant is the correct absolute primitive (ADR-0018) and keeps now/next trivial; we add a display-zone hint, we don't replace the instant.
- **Bake the model into ADR-0106.** Rejected — it revises the core time primitive and the `Trip` schema, consequential enough to reason about on its own; it rides the epic but earns its own record.
