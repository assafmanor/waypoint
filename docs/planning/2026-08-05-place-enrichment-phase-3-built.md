# Place enrichment — Phase 3 built: delivery to the client

**Date:** 2026-08-05
**Scope:** Phase 3 of the [build plan](2026-08-05-place-enrichment-build-plan.md) — [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §6. Backend + the first frontend work in this epic. **Still invisible: nothing renders enrichment, and nothing produces it yet either — see the gap at the bottom.**
**Follows:** [Phase 1](2026-08-05-place-enrichment-phase-1-built.md), [Phase 2](2026-08-05-place-enrichment-phase-2-built.md).
**Not this phase:** the badge (4), the collapsed card (5), the research card (6).

## What shipped

| Piece                                                               | Where                                          |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| Delivered read model (`url`, not `blobKey`; no `absent`)            | `packages/shared/src/enrichment.ts`            |
| `TripSnapshot.enrichments`, keyed by `placeId`                      | `packages/shared/src/entities.ts`              |
| `WS_MESSAGE_TYPE.ENRICHMENT`                                        | `packages/shared/src/constants.ts`             |
| Stored → delivered mapping                                          | `backend/src/enrichment/enrichment.mapper.ts`  |
| `readForPlaces` — the join                                          | `backend/src/enrichment/enrichment.service.ts` |
| The snapshot join                                                   | `backend/src/trips/trips.service.ts`           |
| `broadcastEnrichment` + the fan-out to every trip holding the place | `sync.gateway.ts` + `enrichment.service.ts`    |
| WS handler that touches neither cursor nor gap check                | `frontend/src/lib/ws.ts`                       |
| `snapshotMeta.enrichments` + `cacheEnrichment`                      | `frontend/src/lib/cache.ts`                    |
| Reactive map on trip-state                                          | `frontend/src/state/trip-state.tsx`            |

## Two decisions worth the reader's time

**1. The delivered shape drops the `absent` state entirely, and that is a simplification the
plan did not ask for.** The store distinguishes three states per field — never asked, asked
and nothing there, present (§6.4's negative cache) — and my first cut shipped all three to the
client. It is the wrong boundary. A surface renders "we know nothing" identically either way:
ADR-0167 §6's empty card is _a card whose whole content is the way to the answer_, and it does
not care which kind of nothing it is showing. The negative cache is a **fetch-scheduling**
fact, so it stays server-side, and a **missing key** is the client's whole vocabulary for
"nothing". That also removes the `state` discriminant from every read path: `enrichments[id]
?.summary?.en?.value` rather than an unwrap at each call site.

**2. An image is delivered as a URL, never a `blobKey`.** Same move `documentSummarySchema`
makes by omitting `fileRef`, and the same reason `uploadedAvatarUrl` exists (ADR-0133 §12): the
storage key stays server-side, the client gets something it can put in an `<img src>`, and
because the server builds the path no client knows the content route's shape.

## The plan's letter I could not follow, and why

**The plan says "one entry in `CACHE_CHANNELS` and one in the memory channels". Neither is
possible, and forcing it would have broken ADR-0166 §6.**

Both registries are keyed by `EntityType` and driven by a `Change`. Enrichment has no entity
type, no `tripId`, no action and no `seq` — because §6 deliberately keeps it out of the change
log. Joining those registries would have meant **inventing a fake `Change` and a fake entity
type**, i.e. re-introducing in the client the exact fiction the ADR spent a section refusing on
the server.

What the registry rule is actually protecting against is per-type branching in the apply path,
and there is none: enrichment has **one declared home on each side of the mirror**
(`snapshotMeta.enrichments` in Dexie, one `useState` map in trip-state) and **one writer each**.
The comment at `cacheEnrichment` says all of this, so the next reader does not "fix" it by
adding the entry.

## Smaller things the build settled

- **The nudge carries the value, not just a signal.** §6 says "nudged"; carrying the fields
  makes the client's applier a one-line upsert and costs nothing, since the payload is already
  small and the server is the only writer. A client that misses one loses nothing — the value
  is in the next snapshot.
- **The fan-out §6 refused is fine here.** Notifying every trip that holds the place is the
  same fan-out that disqualified `ChangeService` — but there it meant N **durable** `Change`
  rows per fact, and here it is N transient messages and no storage.
- **The join reads outside the snapshot's `RepeatableRead` transaction**, deliberately: it
  depends on the places that transaction returned, and enrichment takes no part in the
  `latestSeq` coherence guarantee (it has no `seq` and is ordered against nothing). Holding the
  app's most contended read open for a second query would buy nothing.
- **`enrichment` is the first WS message with no `seq`**, so the client must neither advance
  `lastSeq` nor gap-check it. Getting that wrong would make the next real change look like a
  gap and trigger a needless full resync — there is a test for exactly that.
- **A row whose every field came back absent is omitted from the join**, so the payload stays
  proportional to what we know rather than to how many places have been attempted.

## The gap: nothing calls `enrich()` yet

**This is the one thing standing between three merged phases and a working feature, and no
phase in the plan claims it.** §6 says enrichment "is scheduled after the fact" and never says
by what. So the pipe is complete and dry: the store, the providers, the image pipeline, the
join and the nudge all work, and nothing ever triggers a pass, which means
`snapshot.enrichments` is `{}` in production today.

It is left unbuilt rather than guessed at because the choice has real content: whether
`resolvePlace` fires a background pass after responding (simple, and loses queued work on a
redeploy), whether a periodic sweep walks places with a stale `attemptedAt` (which is what the
`attemptedAt` column was put there for, §6.4), or both; plus concurrency against Wikimedia,
whose API etiquette this pipe should not learn the hard way. **Worth asking rather than
deciding** — and it is a small piece of work once decided.

## Testing

`format:check`, `typecheck`, `lint`, `build`, and the full suite green: **170 shared + 406
backend + 2,689 frontend**. New coverage for the join (keying, the shared global row, URL not
`blobKey`, the omissions), the mapper, the WS cursor behaviour, and the offline mirror
including the pre-upgrade `undefined` fallback.

Unchanged from Phases 1–2: **egress to Wikimedia is blocked here**, so no real provider
response has ever been observed. Phase 3 adds no network of its own, so that limit is exactly
where it was.
