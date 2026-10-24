# 0061 — Plan-mode Home "what's missing to complete" rework

**Status:** Accepted (Assaf sign-off 2026-07-18; mockup `mockups/plan-home-readiness-v1.html`). **Amended 2026-08-07** (session 218) from field report #5 — the round-trip check reads a leg's **location**, not its name. **Amended 2026-08-14** — a trip night only needs a bed if there is a sleepable stretch left in it; see the amendments below.
**Date:** 2026-07-18
**Refines:** [0045](0045-trip-home-real-data-only.md) (real-data-only home — the sibling principle the checklist already follows), [0004](0004-integrations-are-pipes.md) (deferred suggestions wait for their pipes/data). Builds on the plan-home built in `planning/2026-07-14-session-06-plan-home.md`.

## Context

The Plan-mode Home is a **prep dashboard**: a violet readiness hero + a derived "what's missing" checklist (`screens/PlanHome.tsx`, `lib/readiness.ts`). `computeReadiness` (`readiness.ts:44-64`) runs **four** derived, never-stored checks:

- `flights` — a flight booking exists (`:56`)
- `lodging` — a hotel booking exists (`:57`)
- `itinerary` — no empty days (`:58`, counts empty dates)
- `group` — more than one member (`:59`)

Each incomplete row shows one CTA (`PlanHome.tsx:105-145`): flights/lodging → `onNavigate('index')`; itinerary → seed the first empty day then `onNavigate('days')`; group → the settings invite. Session 06 deferred a set of richer signals as "recorded, not faked" (Google-connection status, passports/documents, Gmail-import flavor, WhatsApp reminder, specific "required booking missing" detection) because the data/features didn't exist.

Assaf (2026-07-18): "כפתורי מסך הבית במצב תכנון 'מה חסר להשלמה', גם לחשוב על איזה הצעות וגם התנהגות הקיימים" — revisit **both** (a) _what_ the checklist suggests and (b) the _behavior_ of the existing rows. Two things have changed since session 06 that make this timely: the Index booking-entry flow and the Day builder are now **real screens** (session 06 noted their CTAs pointed at `Placeholder`s — that note is stale), and **documents are now in the trip snapshot** (ADR-0058), so a documents/passport check is finally buildable from real data.

## Decision (direction — the exact set is settled in the design pass)

**Keep the real-data-only, derived-never-stored foundation (ADR-0045 sibling); rework the checklist's contents and the existing rows' behavior against the screens and data we now actually have.**

1. **Re-verify the four existing rows' behavior now that their targets are real.** Each CTA should _do the thing_, not just switch tabs: flights/lodging → open the add-booking flow in the Index (not merely land on the tab); itinerary → the Day builder seeded on the first empty day (already close, `PlanHome.tsx:122-136` — confirm it still lands right); group → the settings invite. Retire the session-06 placeholder-era stopgaps.

2. **Reconsider the suggestion set.** Now-buildable candidates to add: a **documents/passport** check (feasible post-ADR-0058 — the snapshot carries documents), a **"hard bookings have confirmation codes"** completeness nudge, finer itinerary signals beyond a bare "empty day." Still-deferred (no data/feature): Google-connection status, Gmail-import, WhatsApp reminders — these stay recorded-not-faked per ADR-0004.

3. **The exact final check set, copy, ordering, and CTA behavior are settled in a design pass** (a mockup + this ADR flipping to Accepted). This ADR fixes the direction and the constraint (real data only, derived), not the final row list.

## Settled (Assaf sign-off, 2026-07-18; mockup `mockups/plan-home-readiness-v1.html`)

- **Check set (all derived, real-data-only):** keep the four existing — 🏨 `lodging`, 📅 `itinerary` (empty days), ✈️ `flights`, 👥 `group` — each with a CTA that _does the thing_ (opens the add-booking sheet / seeds the day builder on the first empty day / the settings invite), not a bare tab-switch. **Add exactly one new check:** 🛂 **documents/passports** (per-traveller, from the snapshot documents list post-ADR-0058).
- **Confirmation-code completeness (🔑) is dropped** — considered, but "too minor for its own row" (Assaf). It can live as a subtle inline hint on a booking later, not as a readiness check.
- **Documents is a per-traveller rollup** ("2 מתוך 5 העלו דרכון", with a small per-person indicator), breakdown on tap — fits the small-group model.
- **Completed checks collapse into a one-line summary** ("✓ הושלמו · ✈️ טיסות · 👥 הקבוצה") with a "show completed" toggle, so the list stays about _what's missing_.
- **Readiness stays advisory** — a nudge, never a blocker; it does **not** gate the go-live mode switch.
- **Left out** (no data/feature, ADR-0045/0004): Google-connection, Gmail import, WhatsApp reminder.

## Refinement (2026-07-18, Assaf) — type-specific CTA targets + flights = round-trip

- **Each actionable row's CTA opens the type-specific create form, pre-set** — not a generic "add booking." The 🏨 lodging row opens the **create-lodging** form (booking type = hotel); the ✈️ flights row opens the **create-flight** form (booking type = flight, seeded with the missing direction where known). The row already knows which type is missing, so it seeds the form. (📅 empty-day → the day builder on the first empty day; 👥 group → the settings invite — unchanged.)
- **The flights check is round-trip aware.** It is complete only when there is **at least one flight to the destination (outbound) _and_ at least one flight from the destination (return)** — "a way in and a way out." A single one-way flight leaves the check **open**, with copy naming the missing leg ("יש טיסת הלוך · חסרה טיסת חזור") and a CTA that opens the create-flight form for that direction. Derived from flight bookings' origin/destination `Place` FKs (ADR-0048/0051): an outbound leg's destination is the trip destination, a return leg's origin is the trip destination. "Source"/home need not be stored — only that a leg lands at the destination and a leg leaves it.
- **Degradation until the Place-picker lands** (backlog; direction rests on name-only Places today): if a flight's origin/destination isn't recorded, the check can't confirm that leg, so it **stays open** — conservatively nudging the traveller to record both legs rather than falsely reading "done." Revisit if that proves too strict in practice.

`readiness.ts`: the `flights` check reads flight bookings' origin/destination Places and requires both directions (a small pure predicate, unit-tested). `PlanHome.tsx`: each CTA passes the target booking type (and, for the return flight, the direction) into the create form.

## Consequences

- `lib/readiness.ts` (new/changed pure checks + a unit test per check, matching `readiness.test.ts`) and `screens/PlanHome.tsx` (row behavior/CTAs), plus `i18n/he.ts` copy (no em dashes; `·` for separators).
- A documents check reads the snapshot documents list (ADR-0058) — no new fetch, offline-safe.
- Design record + mockup (`mockups/plan-home-readiness-v1.html`, session 32) land first; implementation follows on its own change.
- No data-model or backend change anticipated (all inputs already in the snapshot).

### Implementation notes (built 2026-07-18)

- `computeReadiness` now takes `destination`, `places`, `documents`, and `travelerIds` (replacing the bare `memberCount`). The flights check derives `hasOutbound`/`hasReturn` from each flight's `to`/`from` Place **name** vs the trip destination (case-insensitive, substring-tolerant so "Tokyo, Japan" reaches "Japan"); a flight with an unrecorded endpoint can't be confirmed, so it leaves the check open (the ADR's degradation clause). _(The name test is no longer the whole mechanism — see the 2026-08-07 amendment below; the degradation clause is unchanged.)_ The documents check counts distinct travellers who own a `passport` doc; a group-owned passport (no `ownerUserId`) covers nobody.
- Actionable CTAs reuse existing plumbing, no new form components: flight/lodging open the shared `BookingSheet` in create mode via a new optional `seed` prop (`{ type, origin?, dest? }`) — the flight row seeds the missing leg's destination endpoint; empty-day seeds the day builder on the first empty date; group navigates to the settings invite.
- **Documents "breakdown on tap"** is the existing Index documents section: the row shows the `X מתוך N` rollup + a per-person dot indicator inline, and its CTA deep-links to `?tab=index&focus=docs` rather than opening a bespoke per-traveller popover (the docs list already is the breakdown). Missing-hard-commitment CTAs (flight/lodging) render in `--miss` as a status nudge; readiness stays advisory and gates nothing.

### Refinement (2026-07-18, post-merge feedback)

Three fixes after driving the shipped screen:

- **`lodging` = night-coverage, not "a hotel exists."** The check is complete only when **every trip night is covered** by a hotel booking, so a stay that ends before the trip does leaves the check open. Trip nights are `[startDate, endDate)` (the departure day has no night). A `Booking` carries no dates — the check reads each hotel booking's check-in→check-out span off its **linked event** (`date`/`endDate`, ADR-0018/0063); a stay with no `endDate` covers its single night. Multiple hotels stitch together to cover a span. A hotel booking with no dated event can't be credited (degradation, like flights). Row copy is a rollup: `X מתוך Y לילות מכוסים`.
- **`documents` counts passport documents, not owners.** The original per-owner rule (a passport must have an `ownerUserId` matching a traveller) is **unsatisfiable today**: the upload flow is group-owned only — the per-owner picker is deferred (ADR-0015), so no upload sets `ownerUserId`. As built, every passport read `0 מתוך N`. Fixed: count passport documents against the traveller head-count (`min(passportCount, travelerCount)` of `travelerCount`; complete when `passportCount >= travelerCount`). Ceiling: one person could upload N passports and satisfy it — acceptable for the small-group model; tighten to per-owner when the upload owner-picker ships.
- **Documents CTA opens the upload sheet, not the Index.** Superseding the `?tab=index&focus=docs` deep-link above: the 🛂 row's CTA now opens `DocumentUploadSheet` in place (it defaults its type to `passport`), matching flights/lodging opening the `BookingSheet` — the CTA _does the thing_ (ADR-0061's own principle) instead of dropping the user on the Index.

### Amendment (2026-08-07, session 218) — a leg reaches the destination by **where it lands**, not by what it is called

Field report #5 (triaged in [`planning/2026-08-07-session-216-field-reports-triage.md`](../planning/2026-08-07-session-216-field-reports-triage.md)): a trip with a real round trip booked still read `חסרה טיסת חזור`. The refinement above says the check is "derived from flight bookings' origin/destination `Place` FKs" — the intent was always locational — but the built test was the names, and a **name test is true of an airport only by luck**. "Keflavík International Airport" contains no "Iceland" and "Iceland" contains no "Keflavík", so the leg that actually flew there never counted. The report is a defect against this ADR, not a change to it.

**`reachesDestination` now takes the `Place`, not its name, and asks three independent questions.** Each is positive evidence and any one of them is enough:

1. **It is the destination place** — same `googlePlaceId` as the trip's destination pick (ADR-0113).
2. **Its zone is the destination's zone.** A `Place.timezone` is resolved server-side from that place's own coordinates (ADR-0107/0108) and `Trip.timezone` is the destination's own zone (ADR-0113 §2), so this is a region test on real location data. A **zone is the coarsest region we store**, which is exactly what a destination that may be a whole country needs: a point-and-radius cannot be both Iceland-sized and Tokyo-sized, and there is no stored extent to size it from. A destination country known to span several zones accepts any zone in **that one country's** list (ADR-0113 §2's `MULTI_ZONE_COUNTRIES`, moved to `@waypoint/shared` for this second reader), so a leg into Los Angeles reaches a New-York-zoned trip to the United States.
3. **Its name contains the destination's**, unchanged — the fallback for a name-only Place-lite (ADR-0051), which is still all we have before a pick.

**The degradation clause is untouched and is what the routes are shaped around:** none of them can answer _no_. A place no route can place is unconfirmed, and an unconfirmed leg leaves the check **open** rather than reading done — the same conservative direction the clause chose, now reached far less often. What the amendment removes is the **false** open, which is the one that made a correct trip look unprepared.

**Two limits, recorded rather than papered over.** A country whose real zone is missing from the curated multi-zone list degrades to "can't confirm" (open, never a false pass). And a zone is a region, not a border: a leg into Osaka satisfies a Tokyo-destination trip, which is honest for a check that asks "is there a way in", and a country-sized zone shared with a neighbour would too. **A place's own country code would answer better than its zone and we do not store one** — `Place` carries no country (the trip's destination does, via its geocode), so adding one is a Google field-mask + schema decision, not a bug fix. If the zone route proves too coarse, that is the next thing to cost.

### Amendment (2026-08-14) — a night is only a night if there is a **bed-shaped gap** in it

Owner report: _"The first and last days don't necessarily have hotels (maybe the flight is before you need to sleep), and thinking of it even mid trip there are scenarios where you for example take an overnight bus."_ The 2026-07-18 refinement above credited exactly one thing — a `hotel` booking's span — so a fully-prepared trip read as missing lodging for every night spent in the air, on a night bus, or awake waiting for an early-hours flight. Like the 2026-08-07 amendment, this is a **defect against this ADR**, not a change to it: the check was always meant to ask "does everyone have somewhere to sleep", and it was built asking "is there a hotel booking on this date".

**`nightNeedsABed` measures the sleepable stretch, not the flight.** Each trip night gets a window — `NIGHT_WINDOW_START_TIME`→`NIGHT_WINDOW_END_TIME`, 22:00 to 08:00 the next morning, trip-local — and two things are subtracted from it:

1. **Time in motion.** A booked leg that carries you occupies the window for its whole length.
2. **Time somewhere else.** A leg whose origin reaches the destination **ends** your presence; one whose endpoint reaches it **starts** a presence. An arrival wins over a departure, so a hop between two places inside the destination leaves you there.

What remains is the longest stretch a room could have been slept in. Below `SLEEPABLE_NIGHT_MIN_MINUTES` (5h) the night leaves the check's denominator entirely — it is not an uncovered night, it is not a night.

**Both subtractions are load-bearing, and the owner's second report is what proves it.** _"What if the flight is at 1am — then of course there's a big chance that on the night before we wouldn't get a hotel booking."_ An overlap test alone (the first draft of this amendment, rejected before it was built) scores a 01:00 flight **out** and a 01:00 flight **in** identically — 2 hours of the window either way — and they are opposite facts: the departure consumes the night, the arrival is the reason you want the bed. No threshold separates them, because the difference is not duration. Presence does.

| night                                       | longest sleepable stretch | needs a bed |
| ------------------------------------------- | ------------------------- | ----------- |
| 01:00 flight out                            | 22:00→01:00 = 3h          | no          |
| 06:00 flight out                            | 22:00→06:00 = 8h          | yes         |
| red-eye out 23:00→06:00                     | 22:00→23:00 = 1h          | no          |
| flight in landing 00:40                     | 00:40→08:00 = 7h20        | yes         |
| night bus 21:00→04:00, both ends in-country | 04:00→08:00 = 4h          | no          |

**`inMotion` is a new profile axis, not `carriesRoute`.** ADR-0154 §2's `BOOKING_TYPE_PROFILE` gains an optional `inMotion`, set once inside `transportProfile` so flight/train/transit carry it and a future carried mode inherits it by being one of them. The **car hire** is why it is not `carriesRoute` (ADR-0162's own separation, one axis further): a hire carries a route and spans two instants exactly like the three above, but its span is a period you _hold_ the vehicle, parked through every night of it — reading that as motion would tell a five-day rental it needs no lodging at all. A test pins it.

**A lodging-category event now covers its nights without a booking.** The friend's spare room, the campsite: the app can already author these and the check could not see them. Same direction as everything else here — it only ever closes a night the old rule left falsely open.

**The degradation clause is untouched, and it is what makes the residual safe.** An untimed leg, an endpoint no route can place, a trip with no zone (pre-ADR-0113): nothing is subtracted, the window stays whole, the night reads as needing a bed and the check stays **open**. Every failure mode here is a false _nag_, never a false all-clear.

**Two limits, recorded rather than papered over.** An **unbooked transport event** is deliberately not credited — it carries no `BookingType`, so a taxi and a car hire are the same shape to the derivation, and crediting the wrong one is precisely the false pass this check is built to avoid. And an **untimed** flight subtracts nothing, so a 01:00 departure entered without a clock still asks for a hotel; that case, not the couch, is the one that would justify the stored per-night waiver considered alongside this change. **The waiver was deliberately not built** — readiness is advisory and gates nothing, so a night the derivation cannot reach costs a nag and not a blocked trip, and a stored override would need a column, a sync path and a way to go stale. Revisit if the untimed-leg case shows up in a real trip.

## Alternatives considered

- **Leave the four checks as-is.** Rejected: Assaf asked to revisit both content and behavior, and the CTA-target notes are stale now that the screens are real.
- **Add every deferred session-06 row now.** Rejected: Google-connection / Gmail / WhatsApp still have no data or feature behind them — adding them would reintroduce the faked-signal failure mode ADR-0045 exists to prevent. Only the now-backed ones (documents) become eligible.
- **Make readiness a stored trip field.** Rejected: same reasoning as the derived Now/Next and the existing readiness — a computed state auto-written needs a trigger, emits sync traffic, and goes stale offline (ADR-0018/0045).
