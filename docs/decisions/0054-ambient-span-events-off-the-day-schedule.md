# 0054 — Ambient-span events (lodging / multi-day bookings) are backdrop, not counted schedule blocks

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0045](0045-trip-home-real-data-only.md) (the day-at-a-glance card this fixes), [0041](0041-parallel-overlapping-events.md) (`buildTimeTree` / the block model an ambient span must sit outside of), [0018](0018-timeline-data-model-shape.md) (the `endDate` ambient-span field that becomes the discriminator), [0047](0047-booking-event-linkage-and-notes.md) (a hotel = one Booking backing one Event with an `endDate` span), [0037](0037-overnight-events.md) (distinguishes a true multi-day span from a single overnight tail), [0011](0011-hard-soft-event-model.md) (hard/soft is orthogonal; ambient is a third, presentational axis)

## Amendment (2026-08-25) — off the day's SCHEDULE, on the day's ROUTE

Owner, running the shipped map polyline on a real trip: _"Now that we have real paths, I'm starting
to feel the absence of some stops from the day schedule (the numbered stops), mostly the hotels …
Basically on most days you can infer for certain that you're gonna start the day in a hotel and end
in a hotel, so you can add poly lines to them and place them first/last on the schedule."_

§2 below is about a **count** and a **rail**: a stay must not eat the glance's width or inflate
`נותרו היום`, because a hotel is not something you _perform_ at a point in the day. All of that
stands, unchanged. What it could not have contemplated is that a day would one day be drawn as a
**line on a map** ([ADR-0206](0206-a-travel-time-belongs-between-two-points.md) §AB5) — and a route
is not a schedule. A schedule is a claim about what you committed to; a route is a claim about where
your feet went, and the stay is the one point on it that needs no scheduling to be certain of.

So the exclusion splits, the same way the 2026-08-05 amendment split `isAmbient` itself when one flag
turned out to be answering two questions:

- **Off the counted schedule** — unchanged. No block, no rail width, no `remaining`, and **no row of
  its own**: asked directly whether the day timeline should grow one, the owner said _"sequence only,
  no new rows"_.
- **On the day's stop SEQUENCE**, as its first and/or last member (`buildDayStopSequence`) — which
  is what feeds the map's polyline, the day's Google Maps directions link, and the selection card's
  traversal.

**Which end it takes needs no rule of its own.** The stay covered last night → you woke there, so it
is the day's first stop; it covers tonight → you end there, so it is the last. A check-in day is
therefore last only, a check-out day first only, and a strictly middle night is **both** — which is
exactly the day that has a hotel at each end. A day you change hotels comes out as _A's check-out …
B's check-in_ for free, because each span only ever answers about itself.

**AMENDED 2026-08-26 — a bookend does not outrank a stop that beat you to it.** Owner, from the
shipped map: _"we rent the car at 00:00 and then go to check in at the hotel … it shows the hotel as
starting before the car rental"_ — on a night they check in at 02:00 and out again that morning. A
hotel counts that as the previous night, so the day reads it as a check-out and pinned it first; the
midnight pick-up that brought them there was drawn after it, and the route left the airport,
teleported to bed, and came back for the car.

The rule is one line and it is **not** a dawn cut-off: **nothing whose instant precedes the stay's
own check-in can sort after it.** Where the app can see when you arrived, it moves the stops that
beat you there; where it cannot — an ordinary stay checked into yesterday afternoon, whose 00:00
errand may equally have been a trip out and back — it moves nothing, because that ordering is
genuinely unknown and inventing an answer for it is how a bookend becomes a general theory of what
precedes what. A zone-free instant comparison, so no day boundary has to be resolved to apply it.

A day you check out of one hotel in the morning and into another at night needs nothing further:
each span answers only about itself, so the compressed stay takes the head and the new one the tail.

**A bookend holds a POSITION and wears no NUMBER.** `knowsMoment` still refuses it the mark — "from
15:00" is a floor and any hour after it will do ([ADR-0171](0171-a-time-can-be-a-floor-or-a-ceiling.md)
§10b) — so nothing on screen renumbers, and the day's known stops still count 1, 2, 3 with no hole.
Put to the owner as a fork, and answered: _"sequence + route, no number."_

**The discriminator is `countsNights`, not `isAmbient` alone**
([ADR-0163](0163-a-hire-is-not-a-journey.md) §4). You sleep in a hotel, so it
brackets your day; you merely _hold_ a car, so a hire's pick-up and return are ordinary stops at
their own instants and its middle days stay pure backdrop. That is also the owner's own second class,
named when asked what else qualifies: _"other non hard times like car rentals etc. that are from time
X or until Y"_ — they wanted those **placed**, which is a different fix from being bracketed. Both
halves are read off [ADR-0162](0162-a-car-hire-is-transport-you-drive-yourself.md)'s profile, so a
future ambient category inherits the answer with nobody naming it here.

**What it cost elsewhere, in two places that had each made a defensible bet:**

- [ADR-0182](0182-a-day-is-a-sequence-you-can-step-through.md) §3 had made the sequence's ORDER ask
  the numbering's own question, so a stop could not sort as timed and read as unnumbered. Right for a
  list, wrong for a route — see its 2026-08-25 amendment.
- `screens/Map.tsx` gated the line on `pin.order != null`, i.e. on the **visible number**. That is
  what made a hotel unreachable by the line even once the sequence held it, and it is why the fix is
  in two files rather than one: it now reads the sequence.

## Amendment (2026-08-05, session 215) — ambient is how a span RENDERS; a journey is what its middle IS

Owner, from the shipped hero: _"when the flight (or anything really) crossed the day boundary, the hero doesn't recognize it as currently happening and just has the landing as the next event."_

This ADR's discriminator turned out to be answering two questions with one flag. `ambientWhenMultiDay` was written for **lodging** and extended to `transport` for the multi-day **car hire** — both spans whose middle is genuinely passive. But the same flag catches an **overnight flight**, because the booking form sets `endDate` whenever the end lands on a later calendar day (`buildSpanSeed`), and a red-eye then satisfies `isAmbient` exactly.

Everything downstream followed the flag off a cliff. `Home` drops every started ambient event from `deriveNow` (so the board stopped seeing the flight the moment it took off), and `deriveHeroBooking`'s ambient branch knows only check-in/check-out windows — so a flight in the air could at best surface near its end as a check-out-shaped transition, which is the landing, offered as something upcoming. Precisely the report.

**Both halves of this ADR were right; they were being asked to decide one thing too many.** So the split is now explicit, and it uses the field [ADR-0160](0160-the-hero-lifts-and-shows-a-horizon.md) §Q added rather than a new one:

- **`isAmbient` keeps its meaning, unchanged** — a rendering fact: this span draws as a backdrop across the days it covers and stays off the counted schedule. An overnight flight is genuinely that on the day it lands.
- **`midSpan.kind` says what the middle IS** — a `journey` you are inside, or a `held` resource whose middle is passive. That is what the hero and the mid-stay strip needed all along, and only ever had `isAmbient` to ask.

Three call sites take the distinction (`isJourney`), and each was wrong in the same direction: `hero-booking.ts`'s classify (a journey never takes the ambient branch, however many days it crosses — the bracketed-point path's windows are **instants** and have never cared what day it is), `Home`'s `deriveNow` filter, and the "inside a booking now" strip from §2's family, which would otherwise have claimed the flight in parallel with the board — `בטיסה` above and `LH692 · יום 1 מתוך 2` below it.

**What deliberately did not change:** the day view still draws a multi-day journey as a backdrop with its two ends as transition markers (the amendment above), and a multi-day hire or stay behaves exactly as before. Nor did `currentDestination`, which still answers nothing mid-journey — you are not standing anywhere, and the origin airport is the one place you are certainly not.

## Amendment (2026-08-04, ADR-0164) — off the RAIL, but its edges are counted

This ADR keeps an ambient span off the counted schedule so a four-night stay cannot distort a day, and that protection is unchanged: it draws no block and does not stretch the glance window.

What [ADR-0164](0164-a-spans-own-edge-is-something-you-can-still-miss.md) changes is the `נותרו היום` **number**, which had inherited the same exclusion: a span's own **edge** on this day (check-in, check-out, a hire's pick-up or return) is a timed thing you can miss, so it counts one. A span's **middle** days still count nothing — which is the half of this ADR that was always right.

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
