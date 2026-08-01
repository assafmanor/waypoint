# 0151 — A suggestion has a source, a score and a reason: one strategy contract, and where each strategy runs is a property of the strategy

**Status:** Accepted (contract + the first strategy; the endpoint of §4 is **reserved, not built**)
**Date:** 2026-08-01
**Session note:** [`planning/2026-08-01-session-202-the-shelf-crowds-and-a-suggestion-gets-a-contract.md`](../planning/2026-08-01-session-202-the-shelf-crowds-and-a-suggestion-gets-a-contract.md)
**Design exploration:** [`mockups/shelf-crowded-v1.html`](../../mockups/shelf-crowded-v1.html) — the shelf-crowding consultation this came out of. Its §3 (rank the pool) and §4 (rank the gap sheet against its own slot) are the first two consumers, and its `.gapfill-m` reason line is §8 drawn.
**Builds on:** [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) (the split-key model, the proxy, and "a leak or abuse can't blow past the free allowances" as the stated cost goal — plus `PlacesThrottlerGuard`, the per-member·trip windows a remote strategy inherits), [0115](0115-plan-mode-place-research.md) §2 (the paid half is **armed by intent** — §7 is that rule applied to a second surface), [0109](0109-map-tab-design.md) §7 (the near-me rule: offline, a thing that needs the network is **absent**, not disabled — §5), [0094](0094-one-pluggable-change-applier-registry.md) (the registry idiom this reuses rather than inventing), [0095](0095-named-constants-for-string-discriminants.md) (strategy ids and source tags are named constants, never bare literals), [0023](0023-zod-first-entities-and-openapi.md) (the contract is zod-first in `@waypoint/shared`)
**Refines:** [0116](0116-day-aware-shelf-and-idea-target-day.md) §1 — which rejected a derived per-day "fit" as a **substitute** for the stored `targetDate` and explicitly kept it "on the table as a future _sort_". This is that sort arriving, with the field it was waiting for already shipped. `targetDate` stays the stored human intention; a score never overwrites it.
**Relates:** [0111](0111-places-field-mask-tier-and-rating-deferral.md) (why a rating-based strategy is a cost decision and not free), [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) / [0121](0121-embedded-map-phase-6-design.md) §6 (the existing subordinate tiers for "not in the trip yet" — §6 spends them rather than drawing a third), [0119](0119-map-maybes-facet-is-the-shelf.md) (the Map's `אולי` facet is the shelf's union, so both surfaces rank the same set), [0065](0065-app-scope-many-trips-small-groups.md) (grow-later: leave room, don't pre-build)

## Context

The shelf-crowding consultation proposed ranking the idea pool by proximity to the day's scheduled stops — a comparator inside the shelf's `sort`. The owner's response reframed it, and the reframing is better than the proposal:

> _"create a backend endpoint for recommended items based on some filters (day, category, location). At first it's going to be pretty basic … but have it flexible enough to have room to evolve, by having the ability to suggest stuff not added, and by different strategies for recommendations."_

Two halves, and they pull in opposite directions. **"Different strategies" is right and the comparator was wrong**: a hardcoded `.sort()` fits exactly one rule and has to be rewritten for the second. **"Backend endpoint" is right for the strategies that need a server and wrong for the one being built now**, and the difference is not a preference — it is non-negotiable rule 5.

Four facts verified against the tree this session, not recalled:

- **`haversineMeters` already exists client-side** (`frontend/src/lib/distance.ts`), built for the Map's near-me sort. Its own header says the quiet part: _"A straight-line metre count is honest for the job it does … and it stays correct offline."_ The day's stops and the trip's ideas are both already in trip state. The whole of the first strategy is arithmetic over data the client is holding.
- **There is no `orderBy` at all.** `maybeItem.findMany({ where: { tripId } })` (`backend/src/trips/trips.service.ts:456`), so the "snapshot's order" ADR-0116 §2 relies on is whatever Postgres returns. Any ranking needs a stable floor under it first.
- **The paid pipe already exists**: `backend/src/places/google-places.client.ts` (`textSearch`), `PlacesThrottlerGuard` (per-member·trip minute + day windows, ADR-0108 §5), `MembershipGuard`. A remote strategy is an extension of a live module, not a new one.
- **Ratings are not available at the current tier** (ADR-0111): `rating`/`userRatingCount` are the only Enterprise-tier fields in the mask, the columns exist and are `null`, and turning them on cuts the free allowance 5× (5,000 → 1,000 picks/month).

## Decision

### 1. A suggestion is one shared shape: `{ source, ref, score, reason }`

In `@waypoint/shared`, zod-first (ADR-0023), so both sides and every surface speak it.

- **`source`** — the strategy that produced it, a named constant (`SUGGESTION_SOURCE`, ADR-0095). It is what §8's reason line is keyed to and what a merge interleaves by.
- **`ref`** — a tagged union, and the tags are the whole point of §6: an existing `MaybeItem`, an existing `Place`, or an **unresolved external candidate** that is not in the trip and has no row.
- **`score`** — comparable **within one strategy only** (§2's note).
- **`reason`** — a rendered string, **not optional**. A strategy that cannot say why it spoke has not finished (§8).

### 2. A strategy is a pure function over a context; where it runs is a property of the strategy, not of the architecture

```
(ctx: SuggestionContext) => Suggestion[]
```

`SuggestionContext` carries the owner's filters, typed once: `{ date, dayStops, ideas, category?, near?, limit }`. One registry (`SUGGESTION_STRATEGIES`, the ADR-0094 idiom), one entry per strategy, each declaring its **placement**:

- **`LOCAL`** — needs no secret, no network and no money. Runs in the browser, works offline, costs nothing.
- **`REMOTE`** — needs a key and bills for it. Runs on the server, behind §4's endpoint.

The signature is identical either way. That is what makes the split a property of the strategy rather than a fork in the design: a strategy can be promoted or demoted without any surface changing, and the frontend merges both kinds into one list through one renderer.

**A surface calls the registry, never a strategy.** `suggestFor(ctx, placement)` consults `SUGGESTION_STRATEGIES`, runs what matches and merges the results; the shelf and the gap sheet call **that**, and neither one imports `nearTheDay` or knows its name. This is the whole of what makes a second strategy a registration rather than an edit — a call site holding a direct reference to today's only strategy is a call site that has to be found and changed for the next one, which is how the `if`/`else` chains ADR-0094 undid got there in the first place. With one strategy registered the indirection buys nothing visible, and that is expected: it is the seam, and the seam is the deliverable.

**Scores from different strategies are not commensurable, and nothing may sort a merged list by `score`.** "0.3 km from lunch" and "popular in this area" are not two readings of one quantity, and normalising them would be inventing a precision we do not have. A merge **interleaves by rank** within each source. Recorded here because a merged list sorted by score is the obvious wrong thing to write, it will look like it works, and its output is meaningless.

### 3. The first strategy is `near-the-day`, and it is `LOCAL`

Ranking the pool for a day: ideas aimed at that day are already the shelf's own group (ADR-0116 §2, untouched); within the pool it is haversine to the day's **scheduled** places, then dateless before aimed-elsewhere — an idea pencilled in for Thursday is spoken for — then recency.

It reuses `haversineMeters` (rule 8; the Map's near-me sort is the same arithmetic on the same data). Its prerequisite is the missing `orderBy`, which lands with it as the stable floor a rank sits on.

The gap sheet runs the same strategy with a narrower `near` — the events on either side of the slot rather than the whole day — which is the case for a _context_, not a second function.

**What this first build does NOT do, stated so the scope is not read up.** `near-the-day` ranks ideas that are **already on the shelf**. It proposes nothing new: no external candidates, no `REMOTE` strategy, no network call, no spend, and `ref` never takes its third tag. Functionally the user gets the same set of ideas in a better order with a reason attached. Everything else here — the registry, the placement split, the scores, the reason line, §4's reserved route — is the seam that makes the next strategy an addition instead of a rewrite, and it is built now precisely because retrofitting a seam under a shipped sort is the more expensive half.

### 4. The endpoint is a host for strategies that cannot run locally, and it is deliberately **not built yet**

Shape reserved, so the first remote strategy is a handler and not a design session:

```
GET /trips/:tripId/suggestions?date=&category=&near=&strategy=
```

in the existing `places` module, behind `MembershipGuard` + `PlacesThrottlerGuard`, returning `Suggestion[]` — §1's shape, unchanged.

**Why the route waits.** An HTTP route whose only implementation is haversine over data the client already holds adds a network dependency to an offline surface and buys no capability. Worse, it breaks rule 5 on the two surfaces least able to afford it: the shelf and the gap sheet are the on-the-ground surfaces — foreign SIM, no signal, underground, deciding what to do in the next thirty minutes. Server-ranked, they fall back offline to _no order at all_, which is the exact defect the ranking exists to fix.

**The counter-argument, and why it loses here.** A server lets the algorithm improve without shipping a client. That is real, and it is why the _contract_ is shared rather than frontend-local — a strategy is one move from either side. But this is a PWA; clients update on next load, and that convenience does not outweigh the shelf going unordered on a train. The route is built when the first `REMOTE` strategy exists to justify its guard, its throttle, its cache and its cost envelope.

### 5. Offline, a remote source is **absent** — not empty, not stale, not spinning

ADR-0109 §7's near-me rule, applied unchanged: a section that needs the network is not rendered at all rather than rendered as a failure. Because the local strategy always answers, the surface is never unranked and never has an error state to explain.

### 6. A suggestion is not a `MaybeItem`, and an external candidate never persists until someone picks it

The moment strategies can propose places nobody added, the tempting shortcut is to write them into the shelf as ideas with a `suggested` flag. That re-creates — with machine volume behind it — precisely the crowding this whole line of work exists to fix.

So an external candidate is a **candidate**: it renders in a subordinate tier and owns no row. The app already has that tier twice (a Google result is a ring, ADR-0132; the embedded map's ghost pins, ADR-0121 §6), and this spends the existing grammar rather than drawing a third. Picking one runs the existing `＋ אולי` path (ADR-0115 §3) — which is also what keeps ADR-0112's "a place in a trip is referenced, not cached" true: a suggestion referenced nothing until a human chose it.

### 7. A `REMOTE` strategy is armed by intent, never by rendering a day

ADR-0115 §2 drew this line for search, because it was the first surface that spends money per keystroke: filtering your own list and buying a Google call must not be the same gesture. A "suggest places we don't have yet" strategy is the same shape one surface over. It fires on a deliberate tap. Nothing that bills may be a consequence of looking at a screen.

### 8. Every suggestion states which strategy spoke, and that is what makes a bad ranking arguable

The reason line renders in `.gapfill-m` — a slot styled in `screens.css` since the sheet shipped and never once rendered — and in the tile's meta. `0.3 ק״מ ממסעדת מון` and `פופולרי באזור` are different sentences because they are different claims, and a user who disagrees can see what to disagree with.

It is also the honest limit. We are stating a fact we computed, never taste we do not have.

## Consequences

- **The shelf fix ships offline-complete**, with one line of backend work (the `orderBy`) and no route. Rule 5 holds on the two surfaces that need it most.
- **The second strategy is a registry entry**, and a remote one is a handler behind an endpoint whose shape is already fixed — which is the flexibility the owner asked for, bought without pre-building the part that has no consumer (ADR-0065).
- **`.gapfill-m` finally renders**, after being styled and dead since the sheet shipped.
- **A rating-based strategy is a cost decision, not free** (ADR-0111): a field-mask edit that cuts the free allowance 5×. Worth knowing before designing a strategy around a star.
- **Scores are not cross-comparable** and a merged list is interleaved by rank. If that ever stops being enough, the next decision is a _merge policy_, not a normalisation.
- **Deferred, recorded rather than half-built:** the endpoint itself (§4); any merge policy beyond rank-interleave; per-user or per-trip learning from what got picked; and a strategy that reads anything other than the trip's own data.

## Alternatives considered

- **Put the first ranking behind the endpoint, as proposed.** Rejected on three grounds, in order: rule 5 (the shelf is an offline surface and would lose its order exactly when it is most needed), cost (an ambient billed call per day view contradicts ADR-0108's "a leak can't blow past the allowances"), and redundancy (a round trip to compute haversine over data already in memory, with `haversineMeters` already written and tested). The shared contract is what preserves the half of the idea that was right.
- **Keep the comparator in the shelf's `sort`** (the mockup's own §3). Rejected: it fits one rule and is rewritten for the second, which is the thing the owner's reframing correctly identified.
- **Persist suggestions as `MaybeItem`s with a `suggested` flag.** Rejected (§6): it reproduces the crowding at machine volume, and it puts rows in the trip that no human chose.
- **Normalise scores across strategies into one ranking.** Rejected (§2): distance and popularity are not two readings of one quantity, and a normalised blend is false precision that reads as authority.
- **One strategy with a `mode` parameter** instead of a registry. Rejected: it is the `if`/`else` chain ADR-0094 exists to have already replaced once, and the placement split (§2) would live inside a branch rather than in the registration.
