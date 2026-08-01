# Session 203 — the shelf crowds: built

**Date:** 2026-08-05
**Scope:** All six steps of [ADR-0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md)'s session-202 amendment, plus [ADR-0151](../decisions/0151-a-suggestion-has-a-source-and-a-reason.md)'s contract. Backend (one line), `@waypoint/shared`, frontend.
**Design session:** [session 202](2026-08-01-session-202-the-shelf-crowds-and-a-suggestion-gets-a-contract.md), mocked in [`mockups/shelf-crowded-v1.html`](../../mockups/shelf-crowded-v1.html).

## What shipped

| Step | Where                                                  |
| ---- | ------------------------------------------------------ |
| 1    | `trips.service.ts` — the missing `orderBy`             |
| 2    | `MaybeCard` + `maybe-card.css` — the `.compact` tile   |
| 3    | `packages/shared/suggestions.ts` + `geo.ts`            |
| 4    | `lib/shelf.ts` — `rankIdeas`, both shelves             |
| 5    | `GapFillSheet` + the extracted `SearchField` primitive |
| 6    | `MaybeMoreCard` + `useShowMaybesOnMap`                 |

The hold-to-drag gesture is untouched, and ADR-0151 §4's endpoint is not built.

## The mockup was driven, and it was worth doing

The panel's numbers are read from the live DOM, so the acceptance criteria are only
real if you move the toggle. Driven at 5 · 18 · 40 in Chromium, the shipped column
reports the report as a number: the idea you are reaching for at position **3 · 18 ·
18**, swipes-to-last **2 · 10 · 24**.

Then the same measurement was run against the **built** CSS rather than the mockup's,
which is the part that caught something. The tile came out **140×84**, not 76 — every
token identical, the eight pixels entirely from the meta line wrapping. See below.

## Four things the build found that the mockup could not

**1. The reason needs two renderings.** `0.3 ק״מ ממסעדת מון` wraps at tile width and
costs exactly the 8px §2 was drawn to buy back. The mockup had this right in its code
(its shelf drew `km(k)`, only its gap row named the stop) and ADR-0151 §8's prose read
as one string for both. Now: `reasonText` for the sheet, `tileReasonText` for the
strip, one structured reason behind both.

**2. `reason` is structured, not "a rendered string" as ADR-0151 §1 wrote it.** Two
reasons that only appear in code: `packages/shared` holds no UI copy, and §4's endpoint
returns `Suggestion[]` from a Nest service, where Hebrew would break ADR-0009. Amended
on the ADR in place. What §1 was requiring — a reason, always, per suggestion — is
intact.

**3. A third reason code the fixture never needed.** Every mockup idea carried a
distance. Real shelves hold ideas with no place, and a Place-lite has no coordinates.
Their honest reason is recency, and on the strip it takes no line at all.

**4. The remove `✕` lands on the tile's title.** The mockup drew the strip's cards as
plain `div`s, so the Plan-mode remove variant was never in the picture. On the shipped
card the glyph sits above the title and the corner is free; a row axis runs the title
under it. Fixed by reserving the corner, gated on `:has(.wp-maybecard-remove)` so the
tile without one keeps its full width.

## The ordering: the mockup won an argument with the ADR's prose

ADR-0151 §3 reads as a priority list with haversine first. The mockup's `ranked()`
partitions on spoken-for and sorts by distance _within_ each tier. The mockup is right,
and not narrowly: the other reading silently reverses ADR-0116 §2's
dateless-before-aimed-elsewhere grouping — the one thing this build was explicitly not
supposed to touch. The tier is the primary key; `TIER_SPAN` is what keeps `score` a
real quantity while sorting by it reproduces the documented order.

**And a number nobody should clean up:** `FAR_M = 5_000`. Past it, proximity stops
discriminating — two ideas across town are both "not near today" — so they tie and
recency decides. Without it, an idea that merely _has_ coordinates outranks a placeless
one on that alone, which is a claim we cannot support.

## Rule 8, three times

- **`haversineMeters` moved to `@waypoint/shared`** (`geo.ts`) rather than being
  written a second time for a strategy that cannot import from `frontend/`.
  `lib/distance.ts` re-exports it, so the Map's call site never knew. `formatDistance`
  stayed behind: it renders Hebrew.
- **The search field became a primitive.** `.search-overlay-field` was private to
  `SearchOverlay`; the gap sheet needed the same pill, and copying it would have been
  the second copy of the apparatus ADR-0120 exists to have prevented one of.
  `SearchOverlay` is now its first consumer rather than its owner.
- **The Map handoff is a `useHandoff`**, the fourth on that channel, not a fourth
  bespoke flag. It is consumed once, so a later visit to the tab is not still filtered
  by a tap from three screens ago.

## The open question was asked, and answered "build it as drawn"

§5's tab switch mid-build. The recommendation given, and taken: the alternative —
capping the strip with no way through — trades a _suspected_ problem (an abrupt
transition) for a _known_ one (35 ideas visibly hidden behind no affordance), and the
destination is complete rather than a dead end, since ADR-0135 makes it a round trip.

**The device pass is still owed.** It is now a question about a shipped behaviour
instead of a drawing, which is the only thing that changed. Beside it, unchanged: does
the two-line title truncate too much on real titles, and does a capped strip read as
"the five best" or as "something is missing" — the group's count (`הכי מתאימים להיום ·
40`) is the build's answer to the second, and only a phone can say whether it lands.

## Environment note, for the next session in this sandbox

`pnpm --filter @waypoint/backend test` needs a real Postgres. Docker is unavailable
here; `pg_ctlcluster 16 main start` plus a `waypoint`/`waypoint` role and database gets
migrations green, but **12 of 25 backend spec files still fail** on Prisma 7 interactive
transactions ("User was denied access on the database"). Verified identical on a clean
`main` checkout, so it is the sandbox and not this change — but it means the backend
suite was not a real signal for this work. The one backend line here is covered by CI.
