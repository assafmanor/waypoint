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

**AMENDED 2026-08-26 — the map has to SAY which end of the day the stay was.** Owner: _"you can't
see from the map where you check in or out from (unless you connect the lines)"_ — and, on being
asked, they rejected numbering for the right reason: on a middle night one pin would wear two
numbers. That objection is diagnostic. A number is an **ordinal** and one pin cannot hold two; _which
end of the day this is_ is not an ordinal, and "both ends" is a single coherent state. So the answer
is the word slot the pin already has (ADR-0141), not a new mark. Three things were swallowing it, and
none of them was the design:

1. **A zoom rule that asked about the wrong thing.** `map-pane.css` dropped the neutral tag under
   `[data-pins='dot']` in every scope, on the reasoning that "a text-scale claim on a ⁦5px⁩ dot" is a
   smudge. But the dot tier is **scoped**: in day scope only `.aside` degrades, so a full-size
   numbered stop below ⁦zoom 11⁩ — a ~⁦30km⁩ span, i.e. every view wider than a town — kept its size and
   silently lost its word. **Deleted rather than rescoped**, because the corrected rule is inert:
   the only day-scope pin that becomes a dot is `.aside`, and `Map.tsx` withholds the word from
   aside pins outright. The trap generalises — a rule keyed only on `[data-pins='dot']` has assumed
   both scopes degrade alike, and they never have.
2. **`behind` silenced the check-out you had already done.** ADR-0141 silences that tier because
   "the transition happened, so a word naming it as ahead is a lie" — right for _what happens next
   here_, wrong for a stay, whose word says which END of the day this place was. The afternoon does
   not falsify that. **A stay is exempt; every other tier stays silent**, so a departed flight still
   cannot name itself as ahead. The grey continues to carry "behind you"; the word only says which
   moment it was.
3. **A middle night had no word at all to un-silence**, carrying neither end by construction. It
   takes one of its own — `לינת לילה`, neutral rather than amber, because it is where you are
   sleeping and not a commitment on the clock. Owner's wording and owner's call: _"maybe it should
   just read as a different label … then nothing needs mocking up"_, which is right — this spends no
   new axis on a pin ladder ADR-0206 §AC3 already recorded as full.

**Not verifiable in the suite:** (1) is CSS at a zoom tier, which jsdom cannot see; it was
established by reading the `--pin-u` rules it sits beside rather than by a test. (2) and (3) are
`pinTransition`, and are specced.

**AMENDED 2026-08-26 — a bookend does not outrank what brought you in through the night.** Owner,
from the shipped map: _"we rent the car at 00:00 and then go to check in at the hotel … it shows the
hotel as starting before the car rental"_. A hotel counts a 02:00 arrival as the previous night, so
the day reads that stay as a check-out and pinned it first; the midnight pick-up that brought them
there was drawn after it, and the route left the airport, teleported to bed, and came back for the
car.

**This is the second rule written for it, and the first one is worth keeping on the page.** That one
said: _nothing whose instant precedes the stay's own check-in can sort after it_ — a zone-free
instant comparison, chosen over a dawn cut-off precisely because it looked like it needed no day
boundary. The sentence is fine. **`startsAt` is not the arrival.** A lodging start is a **floor** —
the hour the room opens — which is the one thing
[ADR-0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §10b exists to say is not a moment, and it
was then used as one. On the owner's day the room was available from 15:00 the previous afternoon
while they were still in the air until 23:20, so every stop of the day fell after it, the comparison
moved nothing, and the report came back unchanged.

**The specs shipped green through all of it, and that is the transferable part.** The fixture carried
`startsAt: 02:00` on the day itself — a check-in instant, because that is what the rule was reasoning
about. A fixture built from the rule proves the rule. Worse, the spec covering the owner's actual
shape (a floor on the previous afternoon) existed and asserted `moves NOTHING`, in a comment arguing
that the ordering was genuinely unknown. **Before writing the fixture, take the shape from the
report.**

The rule that replaces it asks **two** questions, and either alone answers a different day wrongly:

|                                             | before dawn               | after dawn |
| ------------------------------------------- | ------------------------- | ---------- |
| a **floor** (a hire "available from 00:00") | **sorts before the stay** | stays put  |
| a **known** moment (a 06:30 flight)         | stays put                 | stays put  |

- **Dawn** is `dayWindowMs(date, zone).startMs` — ADR-0045's own 07:00 window boundary, resolved by
  the screen and handed to the derivation as an **instant**, because a wall-clock hour needs a zone
  and `map-pins.ts` deliberately holds none. Absent, nothing moves and the sequence behaves as it
  did. It was lifted out of `Home.tsx`, where it was two inline calls and a private `hourLabel`, so
  the glance's rail and the day's route cannot disagree about where dawn is (root rule 8).
- **`knowsMoment`** is the half a bare cut-off misses: a 06:30 flight is an exact commitment you left
  the bed for, while a car claiming no hour at all is the shape of a night arrival.

**Its cost, stated rather than buried:** a pre-dawn stop with an exact time that you genuinely went
out for after checking in (a 01:00 table) keeps the hotel ahead of it. That leaves the bookend where
it already was, which is the safer of the two wrong answers, and it is what buys the early-flight
morning.

A day you check out of one hotel and into another needs nothing further: each span answers only about
itself, so the compressed stay takes the head and the new one the tail.

**EXTENDED the same day — the DAY LIST asks it too, and had been answering the opposite.** Owner,
off the M6a/ADR-0209 deploy: _"it doesn't handle a car rental late at the night before. Should be
handled like the map handles this."_ The screenshot is the same Iceland day, one surface over: the
hotel row at the head of the day, the midnight pick-up beneath it, and a 25 km journey block drawn
between them — the list reading "wake up, then drive out to the counter", which is exactly the
teleport this amendment removed from the route.

[ADR-0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) is what surfaced it. Before it,
the stay had no row of its own on an edge day, so nothing could sort ahead of anything; giving the
day a **first row** created the ordering question the map had already answered a day earlier, and
neither day surface knew about it. That is [ADR-0159](0159-what-sits-between-two-rows.md) §1's line
— posture may differ, a fact may not — and "you picked the car up before you reached the hotel" is
a fact.

So the predicate moved out of `map-pins.ts`'s `buildDayStopSequence`, where it was a local `early`,
and became `broughtInOvernight` in `place-usage.ts` beside the `knowsMoment` it asks (root rule 8:
it had one reader and now has three). Its two questions and its stated cost are unchanged — this
extension is about **who reads it**, not what it says.

**In the list it is a bucket rather than a sort.** `placeDayEntries` returns the overnight edges in
their own `overnight` array, out of `positioned`, and both day surfaces render that run above the
stay row. Two reasons it is not a comparator:

- **The day list's order is not the route's.** The list interleaves rows by instant and the stay
  row is not in that stream at all (ADR-0209 §3: it carries no clock), so there is nothing for a
  midnight edge to sort against.
- **A bucket is provably free of side effects, and a re-sort is not.** Only **transition** entries
  are diverted, and a span edge is never a leg's endpoint — a flexible one is already transparent
  to `prevEnd` ([ADR-0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §5) — so no gap, journey or
  adjacency can change. The one thing that did have to follow the entry is the ambient strip's
  sentence, which reads the PLACED edge (`placedEdgeOf` now looks in both buckets, or a midnight
  pick-up silently fell back to `יום 1 מתוך 10`).

**And no journey block into the bed above it**, deliberately: a stay has no per-day arrival
instant, so the only deadline available is its check-in floor from _yesterday_, and counting back
from a bound the app invented is the whole of
[ADR-0206](0206-a-travel-time-belongs-between-two-points.md) §AI. The drive from the counter to the
hotel really happened, and the app cannot say when — so it says the two rows in the right order and
nothing about the road between them.

**And the label was not wrong.** The same report asked why the pin read `צ׳ק-אאוט` rather than
`לינת לילה`. It is a one-night stay, so that day **is** the check-out day and `צ׳ק-אאוט` is the true
word; `לינת לילה` belongs to a strictly middle night, which this day is not. Nothing changed there.

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
