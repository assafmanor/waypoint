# 2026-08-21 — Notifications phases 2 and 3: the derivations move, and the clock arrives

**Built.** Phase 2 (the zone derivations into `packages/shared`) and phase 3 (the sweep, the ledger, quiet hours, the caps) — [ADR-0197](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) §3, §3.1, §5. **No kind is registered, so nothing can notify anybody.** That is the deliverable, not a caveat: the machinery is exercised and the policies are enforced while the catalogue is still being written.

Shipped on the same branch as the `PUSH_DISABLED` doc fix, at the owner's request.

## Phase 2 — one derivation, not two that agree today

`packages/shared/src/zones.ts` (the ADR-0107 model: `ZoneCrossing`, `placeTimezone`, `bookingZoneOverrides`, `bookingEndZones`, `tripZoneCrossings`, `segmentZoneAt`, `currentZone`, `todayInTz`) and `task-time.ts` (`TASK_BAND`, `TaskClock`, `dueZone`, `taskBand`). Everything else in `lib/tasks.ts` — the facets, the sort, the sub-task tree, the counts — stayed, because no server surface asks those questions.

**The call-site count decided the shape of the move**, which is the repo's own discipline rather than a preference:

| symbol                                               | files    | what happened                           |
| ---------------------------------------------------- | -------- | --------------------------------------- |
| `currentZone`, `segmentZoneAt`, `bookingEndZones`, … | 2–5 each | moved outright                          |
| `todayInTz`                                          | **14**   | moved, **re-exported** from `lib/time`  |
| `TaskClock`                                          | **17**   | moved, **re-exported** from `lib/tasks` |

Churning 31 files to relocate a definition is cost with no reader on the other end. A re-export is one definition with a familiar path, and each site says which is canonical.

**It also caught a duplicate the move itself created.** `todayInTz` briefly existed in _both_ packages — I added it to shared and did not remove the frontend's copy. Two implementations of "which calendar day is this, over there" is precisely how a notification comes to fire on a different day than the row it is about, and it is the drift ADRs 0078/0079/0094/0095 exist to undo. Collapsed to one.

**And it amended [`packages/shared/CLAUDE.md`](../../packages/shared/CLAUDE.md).** That file forbade `Intl` in shared. The real line is _nothing ambient_: `Intl.DateTimeFormat('en-CA', { timeZone })` with the zone as an **argument** is deterministic in its inputs, and `schemas.ts` had been validating zone strings that way since long before the rule was written — so the rule was already stricter than the package's own code. What stays out is `Intl` reading the environment: no ambient zone, no ambient locale.

## Phase 3 — the clock, and the shape it took on the second attempt

Shipped: `NotificationSend` (the ledger), `NotificationSweepService`, `send-policy.ts` (quiet hours, the caps, `fireKeyFor`, staleness), `NotificationDispatcher` + `DirectDispatcher` (§3.1's seam B, which now has a caller and so is no longer the speculative abstraction the ADR was careful not to ask for), and `NotificationSchedulerService` — a 60-second in-process ticker that **starts no timer at all while no kind is registered**, rather than firing a no-op every minute for the life of the process.

### The owner's question, and the answer it forced

> _"Is your sweep logic scalable enough? What happens when there's lots and lots of trips?"_

**It was not.** The first version looped over live trips and loaded each one's events, bookings and places to derive zones:

```
activeTrips()          → 1 query
for each trip:
  contextFor(trip)     → 3 queries (ALL events, bookings, places of that trip)
  for each candidate:
    count()  create()  → 2 queries      ← and the count is an N+1
```

`1 + 3T` **sequential** queries per tick, **paid whether or not anything was due**:

| trips | queries/tick | @2ms  | @10ms      |
| ----- | ------------ | ----- | ---------- |
| 100   | 301          | 0.6s  | 3.0s       |
| 1,000 | 3,001        | 6.0s  | **30.0s**  |
| 5,000 | 15,001       | 30.0s | **150.0s** |

Past ADR-0197 §3.1's own 30-second threshold at ~1,000 trips and over the 60-second interval at ~5,000 — **with zero sends in every row.** The cost scaled with _trips_ when it must scale with _things due_, and on a notification sweep almost every tick has nothing to do.

### Four changes

1. **A kind is no longer handed a trip.** `due(context: SweepContext)` became `due({ prisma, nowMs, zonesFor })`: one indexed range query across every trip at once, over a window no wider than the kind's own `staleAfterMs`. This is what removes `T` from the cost.
2. **Zone context is lazy and memoized.** `zonesFor(tripId)` runs only for trips a query actually returned, cached per tick — twenty due tasks in one trip cost one load, and a live trip with nothing due costs nothing. Its events query is narrowed to `bookingId != null AND startsAt != null`, the only rows that can produce a crossing.
3. **The caps are one grouped query**, not a count per candidate. That introduced a hazard which had to be closed in the same change: a `groupBy` is a snapshot taken _before_ any claim, so the sweep decrements in memory too — without it, four nudges in one tick would each read "0 spent" and all go out. There is a test for exactly that.
4. **Two indexes**, `Task(status, dueAt)` and `Event(startsAt)`. Neither column was indexed, and **every existing index on those tables leads with `tripId`**, which a cross-trip query cannot use — so the right query shape would still have full-scanned every minute. `status` leads on `Task` because it is the selective half: most rows are settled and can never be due again.

Result: an idle tick is one index range scan per kind, returning nothing. Constant in trips.

**The ADR was wrong, not just the code.** §3.1's threshold read "a tick over 30 s ≈ 4,000 sends", which measures the wrong axis — it broke at ~1,000 trips with no sends at all. Amended in place, with the reason kept rather than tidied away, because the mistake is easy to repeat: **the expensive thing in a sweep is rarely the sending.**

### The timing decisions worth knowing

- **`fireKey` is the aimed-at instant bucketed to the minute, in UTC.** A moved deadline is a new key and re-arms; an edited title is the same key and does not re-send. UTC because a key is an identity, not something anybody reads — per-zone would make one send dedupe differently either side of a border.
- **A deferred send writes nothing.** Inside quiet hours the candidate is simply re-derived on a tick after 07:00, carrying the same `fireKey`, so it arrives once. Storing a defer would be the queue §3 rejects — which is why there is no `deferUntil` computing an instant nobody would read (there was, briefly; it had no consumer and was deleted).
- **Claims all happen before any dispatch.** A crash mid-dispatch then loses deliveries rather than double-sending them, which is the direction a notification should fail in.
- **An unclassified kind gets the tightest budget**, never an exemption. The failure direction is "too quiet", never "unbounded".

## Three things that were wrong before they were right

**The fake Prisma's `count` was garbled** and reported zero for everything, so the cap test failed against correct code. Fixed before it could be "fixed" in the production code — the second time this session a fake accused the thing it was testing.

**`vi.mock`'s factory is hoisted above every top-level `const`.** The registry mock referenced a `const kinds = []` and threw _"Cannot access 'kinds' before initialization"_. `vi.hoisted` is the documented answer.

**A dynamic `await import` in a spec passes vitest and fails `tsc`.** The backend emits CommonJS, where top-level `await` is TS1309. It ran green under vitest and broke `pnpm typecheck` — the kind of divergence a second gate exists to catch.

## What is deliberately still not here

- **No registered kind.** Phase 4's, along with the seed fixtures that make the catalogue exercisable at all (`prisma/seed.mjs` still has no dated tasks).
- **No `QueueDispatcher`.** §3.1's thresholds have not been met and `DirectDispatcher` is sequential on purpose: a tick's batch is small by construction, and the concurrency knob is what the queue is for.
- **Nothing user-facing.** Phase 1b's designed settings surface is still the one design phase.
