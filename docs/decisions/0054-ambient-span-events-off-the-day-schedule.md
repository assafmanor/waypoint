# 0054 — Ambient-span events (lodging / multi-day bookings) are backdrop, not counted schedule blocks

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0045](0045-trip-home-real-data-only.md) (the day-at-a-glance card this fixes), [0041](0041-parallel-overlapping-events.md) (`buildTimeTree` / the block model an ambient span must sit outside of), [0018](0018-timeline-data-model-shape.md) (the `endDate` ambient-span field that becomes the discriminator), [0047](0047-booking-event-linkage-and-notes.md) (a hotel = one Booking backing one Event with an `endDate` span), [0037](0037-overnight-events.md) (distinguishes a true multi-day span from a single overnight tail), [0011](0011-hard-soft-event-model.md) (hard/soft is orthogonal; ambient is a third, presentational axis)

## Rebased on ADR-0063 (2026-07-18) — "ambient" is one profile behaviour, not a bare `endDate` check

[ADR-0063](0063-category-time-behaviour-profile.md) generalizes this decision. "Ambient-span" is no longer "any event with `endDate` set"; it is a **category whose time-profile has `ambientWhenMultiDay`, when the event is actually multi-day** (`lodging`, `transport` are the seeded ones). Every behaviour below stands unchanged — backdrop across days, excluded from `buildTimeTree` / the rail / `remaining`, hard/soft-orthogonal. Only the **discriminator** moves from `e.endDate != null` (§Consequences) to `isAmbient(e)` (profile + multi-day), so the same rule now covers non-booking events and any future ambient category. The amendment below (check-in/out markers) is the profile's `transitions` rendered on the rail.

## Amendment (2026-07-18, Assaf triage) — the glance marks check-in / check-out moments (still uncounted)

Reviewing the design, Assaf asked that the day-at-a-glance still **mark** the transition moments of an ambient span, even though the stay itself is backdrop: "היום במבט: לסמן צ'ק אין צ'ק אאוט וכו' אבל לא [לספור אותם בלוז]." The refinement, additive to the decision below:

- **The rail marks the check-in and check-out moments** of an ambient span as **thin point markers** at their true clock position — check-in on the check-in day, check-out on the check-out day — labelled by type (צ׳ק-אין / צ׳ק-אאוט; and the same treatment generalizes to transport departure/arrival on the day they occur).
- **These are marks on the rail, not segments.** The span stays **excluded from `buildTimeTree`, from the rail width, and from the "נותרו" count** (§2 stands). A transition is a _point_ that happens in the day (you arrive / you leave); marking a point is not counting a block. Middle nights show only the backdrop strip (§3) with no rail marker.
- Rationale is the same "transitions matter, the middle doesn't" principle ADR-0059 §1 applies to the board hero — the two are the Home-wide expression of one idea.

**Refined after mockup review (2026-07-18, `mockups/booking-presentation-v1.html`):**

- **Markers get a dedicated lane above the block bar.** The first cut drew them inline on the block rail and the labels were **swallowed by adjacent segments** (Assaf). Fix: a separate marker row above the bars, each a small chip + a stem down to its clock position — labels can never collide with blocks.
- **Markers are amber (time anchors), not teal.** They are hard-commitment _times_, the same family as the hero's `המראה`/`צ׳ק-אין` labels; teal is reserved for the "where you are now" state (ADR-0059 §2). This also de-clutters the teal already used for the day-strip stay underline.
- **The rule generalizes to every bracketed transition, not just lodging** (Assaf: "flights departure/arrival should also be on the timeline"). It is really "render the profile's `transitions` on the rail" (ADR-0063): a **hotel** (ambient) shows standalone, uncounted check-in/out markers; a **flight** (a counted bracketed block) shows departure/arrival as **edge markers on its block**. So the marker system is driven by `isBracketed` + the profile's `transitions`, while the _uncounted_ part stays specific to `isAmbient` spans.

Implementation: `lib/glance.ts` emits **transition markers** (a marker kind on the returned model, distinct from `GlanceSeg`) for bracketed events on the day — from `CATEGORY_TIME_PROFILE.transitions` (ADR-0063); the `sameDay` partition (`:102`) and the `remaining` count (`:163-166`) are untouched (a flight block stays counted; an ambient hotel stays excluded). `Home.tsx` renders the markers in a dedicated lane above the block bar.

The rest of this ADR (below) stands.

## Implemented (2026-07-18)

- The ambient discriminator is now `isAmbient(e)` (ADR-0063 profile + multi-day), applied in `lib/glance.ts` (`ambientEventsOnDate` + the `buildDayGlance` `sameDay` partition) and in the `DayView` / `PlanDay` day-event filters — replacing the bare `!e.endDate` check. A multi-day event of a non-ambient category (e.g. a sightseeing pass) therefore stays a counted block.
- `buildDayGlance` now takes the full `events` + `activeDate` and emits `markers: GlanceMarker[]` alongside `segs`: for every bracketed event touching the day, its start/end that lands on that day (a same-day flight's departure + arrival edge markers on its counted block; an ambient hotel's check-in on its check-in day / check-out on its check-out day, uncounted; nothing on a middle night). The stay stays out of `buildTimeTree`, the window math, and `remaining`.
- `Home.tsx` renders the markers as amber time-anchor chips in a dedicated lane (`.glance-marks`) positioned above the existing `.rail` block bar (a separate lane, not the mockup's nested `marks`/`bars` restructure — visually equivalent, minimal diff). The persistent stay signal remains the `day-ambient` backdrop in the day views.

### Marker layout refinement (2026-07-18, session 37)

The dedicated lane kept labels off the _blocks_, but on-the-ground use surfaced two ways markers still read as clutter: chips **close in time overlapped each other**, and a chip near the rail edge **clipped off-screen** (`docs/planning/2026-07-18-session-37-glance-markers-and-flight-route-hero.md`). All fixes are pure layout — the marker _set_ and semantics are unchanged.

- **The window folds in transition instants.** `buildDayGlance` derives the transitions before the window math and includes each `atMs` in `windowStart/EndMs`, so an **ambient** booking's late transition (an overnight flight's departure/arrival) — which contributes no counted block to stretch the window — can no longer land past `frac 1` and clip. A day carrying **only** a transition marker (e.g. a lone check-out) is now non-empty instead of dropping the marker.
- **Colliding chips stack into lanes.** A pure, width-independent `assignMarkerLanes` (`MARKER_MIN_GAP_FRAC`) puts each marker in the lowest lane whose last chip is far enough away; `GlanceMarker.lane` + `DayGlance.markerLaneCount` drive a CSS band that lifts each chip by its lane and grows the stem so it still reaches the bar.
- **Edge chips anchor inward.** A marker near either rail edge anchors its chip edge to the point (zero-width flex, no direction-sensitive `translateX`) and extends inward, so it can't clip.

## Context

A hotel is one Event with `startsAt` = check-in and `endsAt` = check-out **days later**, plus `endDate` set (ADR-0047 §1 / `buildSpanSeed`). The day-at-a-glance rail (`lib/glance.ts`, ADR-0045) was built for same-day blocks and mishandles this on both ends (session 2026-07-17, `docs/planning/2026-07-17-session-27-index-post-build-issues.md`):

- **Check-in day:** the window stretches to `Math.max(day23, endsAt)` (`glance.ts:106`, `endMsOf` reads `endsAt` `:54`), so a multi-night stay blows the rail out to _days_, crushing every real event into a sliver — and the hotel is counted in `remaining` (`glance.ts:148-151`), inflating "what's left today" with a thing you don't _do_.
- **Every other night:** the day filters are a strict `e.date === activeDate` (`Home.tsx:47`, same in `DayView`/`PlanDay`); nothing expands an event across `endDate`, so nights 2…checkout are blank.

Assaf named the fix from the user side: "וזה לא צריך להיספר בלוז ב-glance" — a hotel shouldn't be _counted_ in the day's schedule. The underlying model error: a lodging span is being treated as an ordinary timed block. It isn't. You don't perform a hotel at a point in the day; it's the **backdrop the day happens inside**.

## Decision

**1. Define an "ambient-span event": an event with `endDate` set** (a multi-day span — today only lodging / multi-day bookings produce it, via `buildSpanSeed`). This reuses the existing discriminator; no new field. It is distinct from an ADR-0037 **overnight tail** (a single night's event ending before the 07:00 cutoff, no `endDate`), which stays an ordinary block and keeps its current treatment.

**2. Ambient-span events are excluded from the counted day schedule.** They do not enter `buildTimeTree`, do not become glance rail segments, and are **not** in the `remaining` count. Consequently the glance window (`day07…day23`, stretched only by genuine same-day blocks + the overnight tail) is correct again — a hotel can no longer distort the rail, and "3 עוד" counts only things you actually have to do.

**3. Ambient-span events render as a backdrop across every day they cover.** On each day from check-in through check-out, the day surfaces a thin ambient strip/header — e.g. "🏨 <hotel>" with check-in / middle-night / check-out framing — above the day's blocks, not inside the proportional rail. This fixes the "blank on nights 2…N" gap (§Context) with the _same_ mechanism that removes the distortion: the span is shown as context on all its days, counted on none.

**4. The rule is presentational and orthogonal to hard/soft.** A hotel stays a **hard** commitment (ADR-0011) — guarded on edit, in the Index, feeding "next code" on Home. "Ambient" only changes how it appears **on the day timeline/glance**: as backdrop, not a block. Hard/soft (commitment) and ambient/point (day-presentation) are independent axes, the way `category` and `kind` already are (ADR-0038).

## Consequences

- **`lib/glance.ts`:** partition `dayEvents` into ambient (has `endDate`, spans past this day) vs. same-day; feed only same-day to `buildTimeTree`/segments/`remaining`; the window math then only sees same-day extents. Add the ambient set to the returned model for the backdrop.
- **Day expansion:** a small helper — "is this ambient event active on date D?" (`date ≤ D ≤ endDate`) — lets `Home` / `DayView` / `PlanDay` show the backdrop on every covered day, replacing the bare `e.date === activeDate` match _for ambient events only_. Same-day events keep the existing filter untouched.
- **Day view (`DayView`/`PlanDay`):** the ambient strip appears there too, so a hotel is visible (and openable → its detail view, ADR-0053) on nights 2…N, not just check-in. It is not a settle-able block (ADR-0043/0044) — nothing to Done/Skip about where you're sleeping.
- **No data-model or backend change.** `endDate` already exists and is already set by the booking span path; this is entirely derived presentation, consistent with "phases/now are derived, never stored" (ADR-0018/0043).
- **Board hero (Home now/next):** unaffected here — the hero already shows the next _event_; whether a hotel check-in/out should appear on the hero is the separate "board hero booking presentation" backlog item, not this ADR.
- **Generality:** the rule keys on `endDate`, so any future multi-day ambient booking (a multi-day rail pass, a car rental spanning the trip) gets the same correct treatment for free — it's not hotel-special-cased.

## Alternatives considered

- **Cap the glance window to the day (clamp `endsAt` to `day23`) but keep counting the hotel.** Rejected: fixes the rail distortion but not the wrong `remaining` count, and still renders a hotel as a full-width block competing with real events — the category error remains.
- **Expand a hotel into one block per day and show it in the rail each day.** Rejected: it still counts as a block and still eats rail width every day; the point is that lodging isn't a scheduled block at all.
- **Special-case `BookingType === 'hotel'`.** Rejected: keys on the wrong thing. `endDate` (the actual multi-day property) is the honest discriminator and generalizes to other ambient spans; a car rental across the trip is ambient too, and it isn't a hotel.
- **Introduce a stored `ambient`/`allDay` flag on Event.** Rejected: `endDate` already encodes exactly "this spans days"; a second field is redundant and drift-prone (the thing ADR-0047/0048/0051 kept removing). Derive, don't store.
- **Leave it; document that hotels look odd on the glance.** Rejected: it actively breaks the glance on check-in day (real events unreadable) and hides the stay on other days — not a cosmetic edge case.
