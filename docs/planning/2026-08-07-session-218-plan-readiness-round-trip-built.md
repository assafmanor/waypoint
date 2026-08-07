# Session 218 — Workstream B built: the round-trip check asks where a leg lands

**Date:** 2026-08-07
**Branch:** `claude/fix-readiness-round-trip-match-5jvvru`
**Scope:** field report #5 from [session 216's triage](2026-08-07-session-216-field-reports-triage.md) — Workstream B, classified there as Class A (a defect against accepted behaviour). Bug fix only: no mockup, no new ADR. [ADR-0061](../decisions/0061-plan-home-readiness-rework.md) is **amended in place**, because the mechanism it recorded as built is the thing that was wrong.

## What was wrong

ADR-0061's refinement says the check is _"derived from flight bookings' origin/destination `Place` FKs … an outbound leg's destination is the trip destination"_ — the intent was locational from the start. What shipped tested the **names**: `reachesDestination(placeName, destination)` asked whether either string contained the other. That is true of an airport only by luck. A trip to Iceland with `Keflavík International Airport` booked in both directions matched nothing in either direction, so Plan Home reported both legs missing on a trip that was fully booked. The failure is silent by construction: the check has no way to say "I could not tell", so an unanswerable question renders as an unmet one.

## What it asks now

`reachesDestination` takes the `Place` rather than its name, and the trip destination arrives as a `DestinationRef` — the structured fields [ADR-0113](../decisions/0113-trip-destination-place-and-primary-timezone.md) already resolves from the destination pick — instead of a bare string. Three independent routes, any one of which affirms:

1. The endpoint **is** the destination place (same `googlePlaceId`).
2. Its **zone** is the destination's zone. That is the location truth the fix rests on, and the reason it is a zone rather than a distance: a `Place.timezone` is resolved server-side from that place's own coordinates (ADR-0107/0108) and `Trip.timezone` is the destination's own zone (ADR-0113 §2), so both sides already hold a **region** — and a region is what containment needs. A point plus a radius cannot be Iceland-sized and Tokyo-sized at once, and nothing stores the destination's extent to size one from, so any radius here would have been a number chosen to make one report pass. A destination country known to span several zones accepts any zone in that **one** country's list.
3. Its **name** contains the destination's, exactly as before — still the only thing a name-only Place-lite (ADR-0051) offers.

**Nothing can answer _no_,** which is what keeps ADR-0061's degradation clause intact: a place no route can place stays unconfirmed and leaves the check open. The routes only add ways to be confirmed, so every case that passed before still passes — that is asserted, not assumed.

## The one piece of reuse

`MULTI_ZONE_COUNTRIES` (ADR-0113 §2's curated country → zones map) was a private const in `backend/src/places/destinations.service.ts`, where it decides whether creation shows the "spans several zones" note. It is now in `@waypoint/shared`'s `destinations.ts` — the ISO-code-keyed destination vocabulary — with the backend importing it back unchanged. Two readers across the FE/BE boundary is `packages/shared/CLAUDE.md`'s own trigger for promoting a value, and copying the table into the frontend would have been root rule 8's exact failure. It stays a **curated** list: a country missing a zone degrades to "can't confirm", never to a wrong answer.

## What is deliberately still coarse

A zone is a region, not a border. A leg into Osaka satisfies a trip whose destination is Tokyo, and that is honest for a check asking whether there is a way in and a way out. **The better signal would be the place's own country code, and `Place` does not carry one** — the trip's destination has one because it is geocoded (ADR-0113), while a picked place's country would mean widening the Place Details field mask and adding a column. That is a schema and cost decision, not a bug fix, so it is named in the ADR amendment and left for whoever finds the zone too coarse. Field report #7 (real IATA codes, Workstream E) is the other request that will want a richer airport identity; if that research lands a data source, this check is a second consumer of it.

## Coverage

`lib/readiness.test.ts` — a new `flights reaching a destination the airport is not named after` block, on the report's own case: `Keflavík International Airport` / `Iceland` sharing no text, in both directions, and the same trip written with a Hebrew destination and `Reykjavík` as the airport (the cross-script version of the same defect — the one [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §15 hit from the other side). Both fail against the pre-fix predicate. Beside them: a leg into another country is **not** counted (the guard against trading a false-negative for a false-positive), a multi-zone destination country is reached from any of its zones, the endpoint that is the destination place is reached, and a name-only endpoint no route can place leaves the check open. The pre-picker case ADR-0061 shipped for — `Tokyo, Japan` reaching `Japan` with no location on either side — now has its own named test rather than riding the all-checks-pass one.

## Not done here

No mockup, no new ADR, and nothing from the other seven open workstreams. Backend specs were not run green in this session: they need Postgres, which the sandbox has no Docker for, and every failure is a Prisma connection error present before this change — `destinations.service.spec.ts`, the spec that covers the file this change touches, passes. The Plan Home screen itself was not opened on a device; what is verified is the predicate.
