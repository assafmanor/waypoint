# Place enrichment — the trigger: **when** a pass happens

**Date:** 2026-08-05
**Scope:** The phase the [build plan](2026-08-05-place-enrichment-build-plan.md) forgot, now decided in [ADR-0166 §14](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) and built. Backend only.
**Follows:** [Phase 1](2026-08-05-place-enrichment-phase-1-built.md), [Phase 2](2026-08-05-place-enrichment-phase-2-built.md), [Phase 3](2026-08-05-place-enrichment-phase-3-built.md).
**Owner's calls:** both triggers (pick + snapshot read), and ships enabled behind a kill switch.

## Why this needed a session at all

Phases 1–3 shipped a complete pipe that nothing ever started. §6 described the timing in four
words — _"enrichment is scheduled after the fact"_ — which names a constraint and no mechanism,
and **no phase of the plan claimed it**. It was not deferred; it was invisible, because a design
sentence in the present tense reads as already-true. `snapshot.enrichments` was `{}` in
production after three merged PRs.

## What shipped

| Piece                                                       | Where                                |
| ----------------------------------------------------------- | ------------------------------------ |
| The fire-and-forget layer: kill switch, dedupe, caps, drops | `enrichment/enrichment.scheduler.ts` |
| Stale work list, from the read model's own query            | `enrichment/enrichment.service.ts`   |
| The pick trigger                                            | `places/places.service.ts`           |
| The snapshot-read trigger                                   | `trips/trips.service.ts`             |
| `ENRICHMENT_DISABLED`                                       | `common/env.ts`, `.env.example`      |

## The design, and the one thing that made it cheap

**Two triggers, both riding a request that was already happening.** A pick, so a place enriches
while the person who added it is still looking at it; and a snapshot read, which is what
backfills places picked before any of this existed, refreshes a value once its TTL lapses, and
recovers a pass a redeploy interrupted.

The read trigger is free because **Phase 3's join already reads the rows that answer "what is
stale"**. So `readForPlaces` returns both the read model and the work list from one query, and
scheduling costs nothing on the app's most contended read. A separate `staleForPlaces` method
would have read the same rows twice to keep a boundary that buys nothing.

**No scheduler**, and that is consistent with decided practice rather than my preference:
ADR-0157 §6 already refused one for the orphan sweep, in this same service, and its code says
so out loud — _"the repo has no scheduler and this is not a good enough reason to introduce
one"_. Enrichment is the weaker case, not the stronger one.

## Three properties worth knowing

**Surplus work is dropped, never queued.** At most 3 passes in flight and 3 started per read;
anything beyond that is discarded. Safe because the read trigger is idempotent and `attemptedAt`
is written only on completion — so a dropped or interrupted pass simply still reads as stale. A
queue would be state a redeploy loses anyway, protecting work that costs nothing to redo.

**What actually bounds outbound traffic is the negative cache, not the scheduler.** §6.4's miss
TTL means a place with nothing is re-attempted at most once every 30 days however often it is
read — so fetch volume scales with the number of _places_, not with traffic. The caps are the
second line of defence for cold start.

**One pass per real-world place**, deduped by `googlePlaceId` across trips, because the store is
global. Two members opening one trip, or a pick immediately followed by a snapshot read, produce
one pass.

## What a test caught that review would not have

I wrote the pick trigger as a bare `this.scheduler.schedule(place)` on the grounds that the
scheduler cannot throw — which is true, and its own spec proves it. Then the test asserting
§6's actual guarantee (_"exactly as failable as it was"_) failed: with the scheduler stubbed to
throw, **the pick failed**. The guarantee was resting on the scheduler's internal discipline
rather than on structure at the call site.

Fixed with a `try` at the call site, the same shape `sweepAfterMint` uses eight lines above it
and for the same stated reason. Worth recording because the bare version reads as obviously fine
and the failure mode is a user losing a place they just picked.

## Rollout

**Enabled, behind `ENRICHMENT_DISABLED`** — the env-gated-with-a-kill-switch shape the document
blob cache already uses. Read per call, so flipping it needs no redeploy, and it stops only the
outbound passes: the reads keep serving already-stored data.

**This is the first deploy on which any of this code can make a live Wikimedia request.** Three
phases of providers, the image pipeline and the matcher have only ever run against fixtures
recorded from the coverage spike. Specific things to watch on the first real pass:

- the `800 → 840` `iiurlwidth` bucket assumption (§12.1 measured only the 500 bucket);
- `wbsearchentities` ranking against real Hebrew place names, which decides how often the
  name-proximity route matches at all;
- whether 3 concurrent passes is polite enough for Wikimedia during a cold-start backfill of an
  existing trip.

The switch exists for exactly the case where one of those goes badly.

## Still open

- **Phase 4's device pass** — whether a real photograph is legible at 40px. Now genuinely
  reachable: this is the change that makes real bytes exist to look at.
- **Hours** — still uncosted for restaurants (§12.4). `FIELD_SOURCE_PRECEDENCE` already names
  OSM, so it stays a provider plus a registration.
- **A coordless Place-lite is never enriched or scheduled.** Matching one by name + coordinates
  is permitted by §4's alias design and built by nothing (§10) — unchanged, and now visible in
  the scheduler as an explicit skip rather than an accident.
