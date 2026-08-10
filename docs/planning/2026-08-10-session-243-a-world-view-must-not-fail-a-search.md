# Session 243 — a world view must not fail a search

**Date:** 2026-08-10
**Task:** backlog **O** (field report **#34**), pruned by this change. Reconciled in
[session 242 §2 #34](2026-08-10-session-242-second-incremental-field-reports-addendum.md).
**Outcome:** direct bug fix, no ADR and no mockup — nothing here revises a decision an ADR owns.

## What was wrong

`[GooglePlacesClient]` → `/v1/places:searchText` → `400 INVALID_ARGUMENT`,
`Invalid rectangle viewport. The rectangle viewport cannot be wider than 180.`

`readMapBounds` hands over the raw NE/SW corners, `textSearch` turned **every** bias into
`locationBias.rectangle`, and nothing in between measured the span. So panning out to a
world view — or a viewport straddling the antimeridian, whose corners come back
`west > east` — made an **optional ranking hint** fail a perfectly valid query.

## The one thing a future reader could get wrong

**The wire schema stays permissive on purpose.** Tightening `searchPlacesTextSchema.bias` to
reject a >180° span is the obvious-looking fix and it is the same bug: a wide viewport would
then 400 from _our_ API instead of Google's. The rule lives at the Google-contract boundary
(`google-places.client.ts`), and everything unusable is **omitted** — never clamped, because a
clamped rectangle ranks results toward a region the user is not looking at, which reads as an
answer and is not one, where an omitted one is merely unranked.

Pinned so it stays deliberate rather than incidental: a non-finite, out-of-range or inverted
(`south > north`) bias is **omitted too, not rejected** — for the same reason.

## Where the rule lives

`isSendableViewport` + `MAX_VIEWPORT_SPAN_DEG` in `@waypoint/shared`'s `geo.ts`, because both
layers ask the same question: the backend drops what it cannot send (the fix), and
`usePlaceSearch` declines to send it in the first place (defence in depth only — the server
never trusts the client's rectangle).

Wrapped viewports are **kept**, not dropped: Google reads `low.longitude > high.longitude` as
a crossing of the antimeridian rather than an error, so the span is measured as
`east - west + 360` and the cap applies to that. The naive subtraction is what let a 359.9°
world view through as a "-0.1° wide" rectangle.

Note this is a narrower rule than the camera's own: `lib/map-camera.ts` still compares
longitudes plainly and fits a ±180°-straddling pin set the long way round, deliberately
(ADR-0121 §14's spirit). That stays as it is — it decides where to _look_, not what Google
will accept.
