# Routes & travel time — the milestone board

**Date opened:** 2026-08-24
**Status:** **M0 CLOSED 2026-08-25. The epic is unblocked — M1, M2 and M3 can all start now, in parallel.** Nothing is built yet.
**Decisions:** [ADR-0205](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) (the substrate) · [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) (what it says, and the V1/V2 split)
**Research:** [2026-08-24 — what is actually possible](2026-08-24-routes-and-travel-time-what-is-actually-possible.md)

> **This file is the single source of truth for epic progress.** The ADRs hold the decisions and do
> not change as work lands; this board changes constantly. If the board and an ADR disagree about a
> _decision_, the ADR wins and the board is stale. If they disagree about _status_, the board wins.

---

## Start here — the protocol every session follows

**Opening a milestone.** Read, in this order and no more than this: root `CLAUDE.md` → this
section → **your milestone's card only** → ADR-0205 and ADR-0206 → the `CLAUDE.md` of the
package(s) your card names. That is the whole context budget. Do not read sibling milestone cards
and do not preload the ADRs your card does not cite (root `CLAUDE.md`, _Context is RAM_).

**Working it.**

- **One milestone, one branch, one PR.** Branch `routes/mN-slug`, named in the card.
- **Touch only the files in your card's Conflict surface.** If the work genuinely needs a file
  outside it, that is a signal the milestone was scoped wrong: say so on the PR and update the card
  rather than widening quietly.
- **A decision you take that the ADR did not** — a constant, a rejected alternative, a constraint
  found by building — is **amended into the ADR in place**, in the same commit. Not a new ADR, not a
  new note (root `CLAUDE.md`, _"amend that doc in place"_).

**Closing it.** In the same commit as the work: set your row's status, PR link and date in
**Live status**; fill in **What the next session needs to know** on your card; prune or add the
backlog lines your milestone completed or discovered. Then open the PR. A milestone is not done
until `pnpm format && pnpm typecheck && pnpm build` are green and the card's **Exit criteria** are
each demonstrably met — evidence on the PR, not an assertion.

**Running two at once.** Two milestones may run concurrently **only if their conflict surfaces are
disjoint** — the ⇉ column says which pairs are safe, and the surfaces are listed so you can check a
pair the column does not name. Both branch from `main`, not from each other.

**Status legend:** ⬜ not started · 🟡 in progress · 🔵 in review · ✅ done · ⛔ blocked

---

## Live status

| M       | milestone                   | kind   | status              | depends on   | ⇉ safe with  | branch / PR                                                                                           | updated    |
| ------- | --------------------------- | ------ | ------------------- | ------------ | ------------ | ----------------------------------------------------------------------------------------------------- | ---------- |
| **M0**  | Product decisions           | owner  | ✅                  | —            | —            | —                                                                                                     | 2026-08-25 |
| **M1**  | Measure the parameters      | spike  | ✅ (applied by M2b) | —            | —            | `claude/routes-travel-time-m1-spike-sn7pod` · [#695](https://github.com/assafmanor/waypoint/pull/695) | 2026-08-25 |
| **M2**  | Shared derivations          | impl   | ✅                  | M0           | M1, M3       | `claude/routes-epic-m2-nkbf4d` · [#694](https://github.com/assafmanor/waypoint/pull/694)              | 2026-08-25 |
| **M2b** | Apply M1's numbers to code  | impl   | ✅ **M4 unblocked** | M1, M2       | M3           | `claude/routes-epic-m2b-q0pxkn` · [#699](https://github.com/assafmanor/waypoint/pull/699)             | 2026-08-25 |
| **M3**  | Design session + mockups    | design | ✅                  | M0           | M1, M2       | `claude/routes-epic-m3-design-kagqpq` · [#696](https://github.com/assafmanor/waypoint/pull/696)       | 2026-08-25 |
| **M4**  | Backend routing module      | impl   | ⬜                  | M1, M2, M2b  | M3           | —                                                                                                     | —          |
| **M5**  | Frontend data layer         | impl   | ⬜                  | M2, M4       | M3, M10      | —                                                                                                     | —          |
| **M6a** | The day reads               | impl   | ⬜                  | M3, M5       | M6b, M7, M9  | —                                                                                                     | —          |
| **M6b** | The hero read               | impl   | ⬜                  | M3, M5       | M6a, M7, M9  | —                                                                                                     | —          |
| **M7**  | The map polyline            | impl   | ⬜                  | M3, M5       | M6a, M6b, M9 | —                                                                                                     | —          |
| **M8**  | Mode per leg + trip default | impl   | ⬜                  | M6a, M6b, M7 | M10          | —                                                                                                     | —          |
| **M9**  | Plan-mode feasibility       | impl   | ⬜                  | M5           | M6a, M6b, M7 | —                                                                                                     | —          |
| **M10** | Offline route pack          | impl   | ⬜                  | M4           | M5–M9        | —                                                                                                     | —          |
| **M11** | Day travel total            | impl   | ⬜                  | M6a          | M8, M10      | —                                                                                                     | —          |
| **M12** | Harden, observe, document   | impl   | ⬜                  | all          | —            | —                                                                                                     | —          |

### M2b — apply M1's numbers to the code ✅

**M1 measured the ceilings into [ADR-0205 §Z](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) and changed no production code** — correctly, since its own card says "produces numbers, not features" and scopes it to `docs/`. **But nobody was assigned to apply them, and that is a gap in this board, not in M1.** `packages/shared/src/routing.ts` on `main` still ships M2's placeholders:

| constant            | was       | now (§Z2)     | how wrong it was                                                                         |
| ------------------- | --------- | ------------- | ---------------------------------------------------------------------------------------- |
| `walking.maxMeters` | `25_000`  | **`5_000`**   | 5× too permissive — admits a **127-minute walk** (Senso-ji → Shinjuku, a real seed pair) |
| `cycling.maxMeters` | `100_000` | **`20_000`**  | 5× — admits 94, 145, 154 and 192-minute rides                                            |
| `driving.maxMeters` | `800_000` | **`300_000`** | 2.7×, and above the provider's own 400 km path limit                                     |
| `ROUTE_MIN_CROW_M`  | _absent_  | **`10`**      | no floor, so a 0.00 km pair costs a matrix cell and a cache row                          |

`ROUTE_COORD_DECIMALS = 5` is confirmed unchanged (§Z1), and `TRAVEL_BUFFER_SECONDS = 5 * 60` stands (§Z6).

**One correction rides with it:** §Z2 measured that once `maxMeters` drops below ADR-0186 §4's 40 km link radius, **`sameClusterOnly` can no longer reject anything** — verified over 2,500+ random global pairs at ≤20 km, every one co-clusters. It looked load-bearing only because M2's placeholders were above the link radius. Do not silently delete the flag; ADR-0205 §Z2 is the record of why it is now inert, and driving still reads it.

**Kind:** implementation, small. **Branch:** `routes/m2b-apply-measurements` — ran as `claude/routes-epic-m2b-q0pxkn`, the branch the session was handed. **Conflict surface:** `packages/shared/src/routing.ts` and its spec, `packages/shared/src/constants.ts`. **Exit criteria:** the four numbers above are the shipped values with the measurement cited beside each; a spec asserts the new floor and each new ceiling at its boundary; `pnpm --filter @waypoint/shared test` green; ADR-0205 §Z amended in place to say the code now matches.

**What the next session needs to know:**

- **The four numbers are shipped and cited** in `routing.ts`; `constants.ts` needed no change — all
  four constants live in `routing.ts`. 365 green in the package (was 362), `pnpm format`,
  `typecheck`, `build` and `lint` green. **M4 may now import `TRAVEL_GATE` as a decided gate.**
- **`ROUTE_MIN_CROW_M` refuses at `< 10 m`, in `admitsTravelMode`**, so a 0.00 km pair yields an
  empty admitted set. **M4 and M6a: that is ADR-0206 §D4's ordinary absence, not an error** — and
  it is the honest read, because the two stops are one place.
- **The 300 km driving ceiling rejects Tokyo→Kyoto.** It was this spec's cross-cluster driving
  fixture and is now the Iceland ring road (Reykjavík→Vík, ~166 km) instead — §Z2 rejects the Kyoto
  pair deliberately, since the provider's own 400 km path limit cannot answer it anyway.
- **`sameClusterOnly` is untouched and now says so at the declaration.** ADR-0205 §Z2's "safe to set
  `false` for all three modes" was **not** taken: flipping it removes a real (if one-sided) refusal,
  which is a behaviour change rather than the application of a measurement. §Z2 is amended in place
  with that resolution. **If M4 or M8 wants the flag flipped, it is a decision to take, not a
  tidy-up.**
- **One number M1 was expected to measure and did not: `ROUTE_BATCH_MAX_STOPS = 24`**, whose comment
  still says "M1 measures what a day actually holds". M1's §Z is silent on it and M2b's card did not
  scope it, so it is left as-is and named here. It binds nothing until M4 builds the endpoint —
  **M4 should either measure it or restate it as a deliberate bound.**

### Owner decisions outstanding (2026-08-25)

M3 drew these and could not settle them. None blocks M1 or M4; each blocks the milestone named.

| #   | question                                                                                                | recommendation                                                                                                                                                                         | blocks  |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | The swap threshold — **30 minutes** of time-to-leave                                                    | take it; the mockup ships a control to disagree on a device                                                                                                                            | M6b     |
| 2   | ~~The leave-by **buffer**~~ — **answered by M1** (ADR-0205 §Z6)                                         | `TRAVEL_BUFFER_SECONDS = 5 * 60` **stands**, with its job narrowed to departure overhead: M1 found the number was doing three jobs and two of them are not buffers. Nothing to decide. | —       |
| 3   | `ליציאה` vs `לצאת` on the tile                                                                          | `ליציאה`, following ADR-0184 §6's `לסגירה` grammar                                                                                                                                     | M6b     |
| 4   | The **three proposed mode icons** (note §8.1)                                                           | needs an explicit yes — `ui/Icon.tsx` has none, so this mints three                                                                                                                    | M6a, M8 |
| 5   | The **transit declaration** (note §8.4) — let someone mark a leg תחב״צ with a "we have no data" warning | genuinely contested against §D9's "absent, not disabled"; do not build unasked                                                                                                         | M8      |

**Read the M3 session note's §9.2 before designing the late state.** M3 corrected itself there: the
app **does** have own-device geolocation (`lib/useGeolocation.ts`, shipping since ADR-0109 §6), and
ADR-0006 defers only member-to-member sharing. The v2 mockup's three-tier late state depends on it.

**The critical path is M0 → M2 → M4 → M5 → M6a/M6b.** Everything else hangs off it or runs beside
it. If only one agent is working, run that path and take M3 before M6.

```
M0 ─┬─ M1 ─┐
    ├─ M2 ─┴─ M4 ─ M5 ─┬─ M6a ─┬─ M8 ─┐
    └─ M3 ─────────────┼─ M6b ─┤      ├─ M12
                       ├─ M7 ──┘      │
                       ├─ M9 ─────────┤
                       └─ M11 ────────┤
              M4 ─ M10 ───────────────┘
```

---

## M0 — Product decisions ✅

**Closed 2026-08-25** by the owner. Both ADRs are now **Accepted**; three answers changed what they
said, and those changes live in [ADR-0206 §Z](../decisions/0206-a-travel-time-belongs-between-two-points.md)
and [ADR-0205 §Y](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) — **read
those two amendments, not just the sections they amend.**

| #   | question                                 | answer                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | V1 without transit?                      | **Yes.** _"I can live without transit on V1."_ §V2's transit row stands; §D9 holds — the mode control says nothing about transit at all.                                                                                                                                                                             |
| 2   | Community server or self-host?           | **Still open — came back as a question.** The trade is weighed in **ADR-0205 §Y1**; the **standing default is the community server** behind §2's port, with the switch triggers named. Reversible by construction, so **nothing is blocked**.                                                                        |
| 3   | Board or horizon for an urgent leave-by? | **The board too — my recommendation was withdrawn.** _"if something is urgent, then it should be on the board and not only the Horizon, right?"_ And it lands as a **swap of the countdown the board already has**, not an addition: see **ADR-0206 §Z1**. §M1's remaining job is the _threshold_, not the question. |
| 4   | Default travel mode?                     | **Inferred per trip from its bookings — derived, never stored — and the switch must be instant.** Which means every gate-admitted mode is fetched together up front: **ADR-0206 §Z2** and **ADR-0205 §Y2**.                                                                                                          |

**What M0 changed downstream:** M4's endpoint takes a set of modes (§Y2), M6b gains the board swap
(§Z1), and M8 becomes inference-plus-override rather than a stored setting (§Z2). Those three cards
are updated.

## M1 — Measure the parameters

**Kind:** spike. **Status 2026-08-25: not started, and M2 raised its stakes.** M2 shipped
`TRAVEL_GATE`'s ceilings (25 km walking, 100 km cycling, 800 km driving) and
`TRAVEL_BUFFER_SECONDS` (5 min) as **deliberate placeholders, sized to be obviously absurd rather
than good** — its own comment says so. M4 is what bakes them into a server that calls a provider,
so **M1 lands before M4, not beside it.** M3 also handed the buffer here (§D5's hedge, drawn as a
0/5/10/15 control).

**Branch:** `routes/m1-measure` · **Conflict surface:** `docs/` only (an ADR-0205
amendment) + throwaway scripts in the scratchpad. **Produces numbers, not features.**

> Ran on `claude/routes-travel-time-m1-spike-sn7pod` rather than `routes/m1-measure` — the session
> was handed that branch name and may not push to another. Same conflict surface either way.

ADR-0205 deliberately left four numbers unpicked, and M0 added a fifth (§Z1's swap threshold is M3's, but the fair-use question below is now load-bearing — ADR-0205 §Y1 names it as a switch trigger). Pick them by measuring against **real trip data
from the dev seed**, not against intuition.

- **The cache-key snap.** ADR-0205 §4 proposes 5 decimals (~1 m), matching `map-region.ts`. Coarser
  buys cross-trip hits between a hand-dropped pin and the same place picked from search, and pays in
  accuracy. Measure the hit rate at 5, 4 and 3 decimals over the seed's places.
- **The mode ceilings.** ADR-0205 §3: the walking/cycling cluster rule and the driving distance
  ceiling. Measure what fraction of real consecutive-stop pairs each admits.
- **Provider behaviour under our actual access pattern** — a day matrix, cold, repeated. Latency
  spread, error shape, and whether the 1 call/s fair-use limit binds.
- **Cluster-gate hit rate**: how many day-adjacent pairs fall in one cluster at all.

**Exit criteria:** every number above written into ADR-0205 as a dated amendment, each as a named
constant with the measurement beside it. No production code changed.

**What the next session needs to know:** all five numbers are in **[ADR-0205 §Z](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md)** —
read it before writing the gate or the cache key. The five that change other people's work:

1. **The dev seed has no coordinates** (§Z0). All 8 `Place` rows are name-only Place-lite,
   `lat`/`lng` `null`. **M4, M5, M6a/b, M7, M9 and M11 cannot be exercised end-to-end against the
   seed as it stands** — whoever hits this first should take the backlog line for it rather than
   hand-patching a local seed. M1's numbers come from those 8 places geocoded by name plus four
   ADR-named trip archetypes; n is small and every rate says so.
2. **M2's `TRAVEL_GATE` placeholders now have their measured values** (§Z2) — walking **5,000**,
   cycling **20,000**, driving **300,000**, replacing 25k/100k/800k. M2 labelled them "still M1's to
   measure", so this is the handoff landing, not a competing proposal. Plus a floor
   `admitsTravelMode` does not have today: **`ROUTE_MIN_CROW_M` = 10**. M2's own finding that "a
   cluster is not a ceiling" is confirmed from the other end (an 11-hour walk, 37.9 km, inside one
   cluster). **What the numbers add: once `maxMeters` is under ADR-0186's 40 km link radius,
   `sameClusterOnly` can no longer reject anything** — verified against the shipped
   `sameTravelCluster` — and the only outcome it can still change is a false negative. Safe to set
   `false` for all three modes. **`ROUTE_COORD_DECIMALS = 5` is confirmed as shipped**, not changed.
3. **The API host is `valhalla1.openstreetmap.de`** (§Z4). The URL in §2 is the demo web app and
   answers `200` with HTML for every API path — the most expensive way to be wrong. **M4.**
4. **Two out-of-range failures, not one** (§Z4). Crow-flies over the limit → `400`, whole matrix
   dies. Road path over → **`200` with a `null` cell**, matrix survives. §2 records only the first.
   **M4 must handle both**, and a null cell is an ordinary absence feeding ADR-0206 §D4's chip.
5. **5 decimals stands, and coarsening is closed** (§Z1). It buys zero measured hits, and rounding
   is the wrong instrument regardless — the provider's road-graph snap already collapses everything
   within ~10 m. If it ever matters, the answer is a ~10 m proximity lookup, not a coarser grid.

6. **The provider's default walking answer is wrong, and M4 must fix it in one line** (§Z7).
   Pedestrian routing **boards scheduled ferries** — Asakusa → Tsukiji returns
   `"Take the 水上バス Ferry"` as a 16.4 km/h maneuver inside a walk, making the default **22.7 min
   optimistic**. And the matrix **silently switches algorithm by batch size** (`timedistancematrix`
   ≤3 points, `costmatrix` above), so the same leg differs by **22.6 min** depending on how many
   stops were in the request — which the `(mode, from, to)` cache key cannot distinguish, making it
   a race. **`use_ferry: 0` on pedestrian and cycling fixes both.** Scope: Tokyo 2/30 legs, NYC
   6/12, Iceland 4/12, Paris 0/20; driving unaffected.
7. **The orphaned leave-by buffer is answered** (§Z6). It was three things: a wrong network (the
   ferry → `use_ferry: 0`), pace (Valhalla assumes **5.1 km/h**, a brisk solo adult, and we serve
   **groups of five** — that is `walking_speed`, a request parameter, not a hedge), and departure
   overhead. Strip the first two into the request and what remains is a constant, so
   **`TRAVEL_BUFFER_SECONDS = 5 * 60` stands**, with its job narrowed to getting out of the door.
8. **A correction to my own numbers** (§Z7). Road/crow is **1.08–1.32, median 1.16** ferry-free, not
   the 2.06 first published; Senso-ji → Tokyo Station is **67 min, ratio 1.17**, not 74/2.14. The
   ceilings are crow-flies and unaffected. With clean ratios a crow ceiling **is** a usable duration
   proxy: **~4,000 m ≈ a 60-minute walk**, if ADR-0206 wants the read bounded at an hour.

Also useful: latency is **~560 ms median, ~1 s tail** for a 6×6 day matrix (faster than the
2026-08-24 research, so §Y2's arithmetic holds with margin); **fair use did not bind** and none of
§Y1's switch triggers fired, so the community server stays the default; and `/status` reports
`tileset_last_modified`, which is the cache-invalidation signal §4 wanted instead of a TTL — **M4
should record it per `RouteLeg`, M12 evicts on a tileset roll.** Cache every cell a matrix returns,
not just the consecutive pairs: the other 25 are already paid for.

---

## M2 — Shared derivations

**Kind:** implementation. **Branch:** `routes/m2-shared` · **Conflict surface:** `packages/shared/src/**` only.
**Read:** `packages/shared/CLAUDE.md`. **This is the true unblocker — both M4 and M5 wait on it.**

Pure functions and shapes, no network, no React, no Nest. All of it testable without a browser.

- **`TRAVEL_MODE`** as a named constant + zod enum (ADR-0095), and the `RouteLeg` / `TravelEstimate`
  shapes both layers import.
- **The polyline decoder, precision as an argument.** ADR-0205 §1's trap: Valhalla encodes at
  **precision 6**; decoded at 5 our Tokyo walk returns `(357.14757, 1397.96481)` — plausible, ten
  times off, no error. **The spec must assert a real decoded coordinate, not a round-trip** — a
  round-trip test passes at the wrong precision.
- **The mode-aware routing gate** (ADR-0205 §3), over `haversineMeters` and `mapDownloadAreas`,
  which are already here. Reuse them; do not add a second clustering.
- **`leaveBy`**, **`freeAfterTravel`** (ADR-0206 §V1.1's correction) and **`daySequenceFits`**
  (§V1.7). These are the whole product logic, and they live here so Plan mode and Trip mode cannot
  disagree about them.

**Exit criteria:** every function specced, including the precision-6 assertion and each gate
boundary; nothing imported from `backend/` or `frontend/`; `pnpm typecheck && pnpm build` green.

**What the next session needs to know:**

**Built on `claude/routes-epic-m2-nkbf4d`** (the session's designated branch, not the card's
`routes/m2-shared`). Two new files — `packages/shared/src/routing.ts` (ADR-0205's substrate) and
`travel-time.ts` (ADR-0206's product logic), the ADRs' own split — plus `TRAVEL_MODE` /
`travelModeSchema` in `constants.ts` / `entities.ts` per this package's convention. 34 specs,
362 green in the package, `pnpm typecheck && pnpm build && pnpm lint` green.

**What M4 imports:** `routeBatchRequestSchema` (stops + a SET of modes + `withShapes`),
`routeBatchSchema` / `routedLegSchema` (three buckets per leg: `estimates`, `refusedModes`,
`pendingModes`), `routeLegSchema` for the Prisma model to mirror, `routeLegKey` for the cache key,
and `routableLegs` for the pre-filter — which takes `clusterLatLngs(...)` over **every coordinate
the trip holds**, not the day's stops, because single-link membership is decided by the chain.

**What M5/M6 import:** `travelEstimateFor` (§Z2's instant switch is this lookup, never a fetch),
`decodeShape` (never `decodePolyline` with a literal precision), `freeAfterTravel`, `leaveBy`,
`daySequenceFits`.

**Four things you will want and this milestone deliberately did not build:**

1. **The derived trip default mode** (§Z2). It reads `Booking[]`, and M8 owns it. Nothing here
   picks a default — no `FALLBACK_TRAVEL_MODE` was added, precisely so M8 does not inherit a guess.
2. **The board's countdown swap** (§Z1) — `leaveBy` is its input, but the threshold at which
   leaving becomes the live question is M3's to measure, and it interacts with
   `TRAVEL_BUFFER_SECONDS` (5 min, a placeholder).
3. **Routing `ERROR_CODE` members** (ADR-0205 §6). Not added preemptively — `constants.ts` says
   promote once a second layer needs the values. **So M4 will have to touch `packages/shared`,
   which is outside its declared conflict surface.** It is one or two lines in `ERROR_CODE`; land
   it after this PR merges rather than in parallel with it.
4. **A duration ladder** (§D3). It formats, so it stays on the frontend; these functions answer in
   seconds and metres and never in words.

**Numbers that are placeholders, all of them labelled as such in the code:** `TRAVEL_GATE`'s three
ceilings and `ROUTE_COORD_DECIMALS` are **M1's to measure**; `TRAVEL_BUFFER_SECONDS` and
`ROUTE_BATCH_MAX_STOPS` are M3's and M1's respectively. Do not tune any of them from taste.

**Three decisions taken here that the ADRs did not, each amended into the ADR in place:**
ADR-0205 §1 (the precision travels **with** the shape — `EncodedShape` — so the tenfold-off bug is
unrepresentable rather than test-covered, and Geoapify's precision 5 is what makes that concrete),
ADR-0205 §3 (**a cluster is not a ceiling** — single-link clustering at 40 km chains a ring road
into one area, so "same cluster only" alone admits a 175 km walk that the provider would answer;
walking and cycling need both, via a per-mode `TRAVEL_GATE` record), and ADR-0205 §6 (the batch
carries `withShapes`, because the matrix returns **no geometry** — durations are one call for a
whole day, a line is one call per leg). ADR-0206 §V1 gained the absent-estimate rule: no estimate
means the slot reads exactly as it does today, and `unknown` is never a verdict.

---

## M3 — Design session + mockups

**Kind:** design. **Branch:** `routes/m3-design` — in the event this ran as `claude/routes-epic-m3-design-kagqpq`, the branch the session was handed. **Conflict surface:** `mockups/**`, `docs/design/mockups.md`, `docs/planning/**`.
**Invoke the `design-mockups` skill** (ADR-0175). RTL, phone-first, both themes, 390×844 **and** 360×640.

**Read ADR-0206 §Z1 first — §M1 changed.** The question is no longer _whether_ the collapsed board
carries an urgent leave-by (the owner says it does) but **at what threshold its countdown swaps** from
`עוד 45 דק׳` to `צאו עוד 10 דק׳`, and how the passed-leave-by state reads as `--miss` without minting a
second live mark. Draw both countdown states on the same board.

Draw and **measure** the five things in ADR-0206 §M — 1) the swap threshold above, 2) the gap
slot carrying three meanings, 3) solid amber against ADR-0125's ground and ADR-0123's pin hues, 4) the late-risk mark reading as status not as a second live mark, 5) the mode control at three
entries.

Two rules that are not negotiable in the drawing: **root rule 4** — no new hue, amber is the travel
time and `--miss` is the risk — and **ADR-0206 §D8**, one solid line at a time, which this session
either confirms by measurement or overturns with one.

**Exit criteria:** mockup(s) in `mockups/` with a catalogue entry in `docs/design/mockups.md`
(ADR-0097); every measurement read from the live DOM and written into ADR-0206 as an amendment;
owner sign-off recorded here. **M6a/M6b/M7 do not start before this closes.**

**What the next session needs to know:**

**Drawn, measured, and reviewed once by the owner.** Current file:
[`a-travel-time-between-two-points-v2.html`](../../mockups/a-travel-time-between-two-points-v2.html);
[`-v1`](../../mockups/a-travel-time-between-two-points-v1.html) stays the record for the board's
countdown swap, which the review did not reopen. Session note:
[2026-08-25 — the board counts to the leaving](2026-08-25-the-board-counts-to-the-leaving.md),
whose **§8 is the review round** and whose **§7 is the ADR-0206 amendment, ready to paste**.

- **The five §M answers, in one line each.** M1: the board's countdown swaps its **unit**
  (`55 · דקות` → `10 · ליציאה`), threshold **30 minutes of time-to-leave**. M2: **the journey is
  a BLOCK between the two cards** (mode mark, duration, leave-by, the leg's real shape drawn
  small, chips on it) that **absorbs** the free-time line and **ignores `GAP_MIN_MINUTES`** —
  the day reads `place · journey · place`. M3: **every leg draws its real path**; §D8 rations
  only the solid amber, which is **a per-theme pair** — see the defect below. M4: ink and word
  only, and **it may not say "you are late"** — see the GPS bullet. M5: four chips
  (`ToggleChip`), on the selected leg, **in the day list and in the Map's sheet — one component,
  two hosts**.
- **⚠ M6a/M6b must not infer that anyone left _from the clock_.** A settle mark is not a
  sensor, so from the clock alone the only supportable claim is `זמן היציאה עבר` — never
  `אתם באיחור`. The user answers with **`בדרך`**, which already exists on the day row and
  **writes nothing today** (`verbs.ts:1361` is a toast). Making it state is a small, real piece
  of §V1.4, and **that floor is what M6a/M6b build.**
- **Own-device position is available and already used — a correction to this card's first
  version.** ADR-0006 puts own-device location **in v1** ("always available, privately,
  on-device"); only member-to-member sharing is deferred, which is what ADR-0205 §8's
  "Not member GPS" means. `lib/useGeolocation.ts` ships and feeds the Map's `קרוב עכשיו`.
  A fix can **earn** the late mark or **withdraw** it entirely — drawn in v2 §3d — but the hook
  is one-shot by design, the fix is never persisted or sent, and an iOS PWA has no background
  position. **This is a new capability for the day surface and wants its own ADR**; do not fold
  it into a routes milestone.
- **The route's shape is NOT in the day list** (measured): at 46×26 two of four real legs differ
  by 3.1px in a 46px box, so the thumbnail says "this is a path" and little else, at every hole
  of the day. Those pixels take `formatDistance` + the existing show-on-map pin instead.
  **M7 is unaffected — the map draws a real path per leg.**
- **Transit becomes declarable** (owner's suggestion, agreed and drawn): a fourth chip that
  promises no estimate and exists to silence a wrong walking number. **Not** a fourth member of
  `travelModeSchema` — the declaration lives on the leg. A declared leg has no leave-by, so the
  board's swap does not fire for it: M6b and M11 both need to know that.
- **Three new `ui/Icon.tsx` glyphs are proposed** (walking/cycling/driving) and drawn in the
  mockup. They need the owner's yes before M8 builds against them.
- **⚠ The coverage sweep found three surfaces this epic had not named** — the session note's
  §10 is the full inventory (15 surfaces, 8 gestures, 10 states), and
  [`where-a-route-shows-up-v1.html`](../../mockups/where-a-route-shows-up-v1.html) draws them:
  - **The Home GlanceCard rail** (nobody's card had it) commits §V1.1's overstatement one
    elevation up — it draws free time as the emptiness between blocks. One new `.seg` kind, no
    redesign; **M6a should take it, and its card does not currently say so.**
  - **Plan's `FreeSlot` is a control, not a statement**, so it _offers_ a slot `gapBetween`
    sized without travel. **M9 owns the feasibility, but the offered number is M6a-shaped** —
    decide which card carries it before either starts.
  - **`near-the-day` ranks by haversine** (`slotStops`/`rankIdeas`), and ADR-0206's own extends
    line promises it "a better metric". **Unowned today** — M9 is the natural home.
- **A route line is NOT tappable in v1**, and M7 should not add it casually: it needs the app's
  first `queryRenderedFeatures` plus a ±10px tolerance box measured at 59% of a pin's width.
- **⚠ M5, fetch ordering:** `DayPeek` mounts both neighbouring days as real surfaces
  (ADR-0200 §7), so a naive per-day fetch fires **three** matrices per swipe. Fetch the visible
  day; let the peek fall back to crow-flies until it becomes visible.
- **The swap is a third arm on an existing ternary,** not new machinery: `Home.tsx:452` already
  swaps that tile for ADR-0184 §6's shutting window (`unit: t.board.closesIn`). **M6b should
  budget one line, not a component** — and it inherits a collision this epic had not named: a
  shutting window and a live leave-by in the same minute, where **the nearer number wins**.
- **⚠ A defect for M7, found by rendering:** `--amber` solid measures **1.72:1 on the day map
  ground** — under the 3:1 floor, the same failure `MAP_CONNECTOR`'s own comment records. The
  route line must be `--amber-deep` light / `--amber` dark, a TypeScript pair switched in JS.
  Do not ship one value.
- **⚠ Two bidi defects that reach any build touching this copy:** `~40` renders `40~` without
  `ltrIsolate`, and `§` is Bidi-neutral so `§D8` renders `D8§` inside Hebrew strings. ADR-0118's
  isolate fixes both.
- **The buffer in the leave-by is NOT settled here** — it is §D5's hedge and a measured number,
  so it belongs with M1's. The mockup exposes it as a control (0/5/10/15) and says so.
- ~~Scope note: the ADR-0206 amendment could not be written from this milestone.~~ **Resolved
  2026-08-25** — `§Z5` is pasted into ADR-0206 verbatim by the docs-only follow-up that also wrote
  this line. **Read ADR-0206 §Z5, not the session note, before M6a/M6b/M7**: the note is
  orientation, the ADR is the decision (root `CLAUDE.md`, _durable vs. scratch_).
- **⚠ Owner sign-off is still open on five items** and M6a/M6b/M8 should not build them unasked —
  see **Owner decisions outstanding** at the head of this board.

---

## M4 — Backend routing module

**Kind:** implementation. **Branch:** `routes/m4-backend` · **Read:** `backend/CLAUDE.md`.
**Conflict surface:** `backend/src/routing/**` (new), `backend/prisma/schema.prisma` + a migration,
`backend/src/common/env.ts`, `validate-config.ts`, `app.module.ts`, `docs/architecture/api-contract.md`.

Build ADR-0205 §6. Every piece has a template already in this codebase — follow it rather than
inventing beside it (rule 8):

| build                                                  | copy the shape of                                            |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| read-through cache + `inFlight` dedupe                 | `MapService.readyOrWarm` / `cached`                          |
| warm-in-background, `202` + `Retry-After`              | ADR-0187's flow, which `map-archive-cache.ts` already parses |
| `RouteLeg` model — no `tripId`, outside the change log | `PlaceEnrichment` (ADR-0166 §6), `FxRateSet` (ADR-0180 §7)   |
| `ROUTING_*` env + kill switch                          | `PUSH_DISABLED` / `DOC_CACHE_DISABLED`                       |
| controller                                             | `MembershipGuard` + `ZodValidationPipe`, like every other    |

**Three things that are easy to get wrong here:**

- **Never touch `ChangeService`.** A route is not data-plane. ADR-0205 §4 says why, and
  `backend/CLAUDE.md` calls the boundary _"the one hard boundary in this codebase"_.
- **The endpoint is batch-shaped, and it carries a SET of modes** (ADR-0205 §Y2, from M0 answer 4):
  a day's ordered stops × every mode the gate admits for them, in one request. A per-mode endpoint
  makes ADR-0206 §Z2's instant mode switch impossible. One request per day, not one per day per mode,
  and not five per mode.
- **The gate runs server-side, before the network.** One out-of-range pair returns 400 for the
  _whole_ matrix — measured. The client must never be able to cause that.

**Exit criteria:** a cold day matrix answers and is cached; a second call hits the cache with no
outbound request (asserted in a spec, not observed by hand); **one request returns every admitted
mode, and a leg the gate refuses for one mode still returns the others**; the gate rejects a
cross-cluster pair without calling out; the kill switch stops every outbound call while the endpoint
still answers from cache; the politeness limiter paces a three-mode warm rather than bursting;
`X-Client-Id` is sent; migration applies clean.

**What the next session needs to know:** _(fill in)_

---

## M5 — Frontend data layer

**Kind:** implementation. **Branch:** `routes/m5-frontend-data` · **Read:** `frontend/CLAUDE.md`.
**Conflict surface:** `frontend/src/lib/travel.ts` (new), the Dexie schema + a version bump,
`frontend/src/lib/api.ts`. **No component changes** — that is M6/M7, and keeping them apart is what
makes those two parallel.

- A Dexie table, **not** `byte-cache` (that is for blobs) and **not** the `CACHE_CHANNELS` registry
  (a route is not a syncable entity and has no client writer) — ADR-0205 §7.
- **A Dexie version bump is a migration on every user's device.** ADR-0186's own warning applies:
  the Dexie name and storage keys _are_ the local cache. Add a table; do not rename anything.
- The read hook returns `estimate | null`, and **`null` is normal** — offline, gated, not yet warm.
  Every consumer falls back to `formatDistance` (ADR-0206 §D4). There is no error state to design.

**Exit criteria:** an estimate survives a reload offline; a cold read returns `null` and does not
throw; the `202`/`Retry-After` path re-asks once and then gives up quietly; no component imports the
provider shape directly.

**What the next session needs to know:** _(fill in)_

---

## M6a — The day reads · M6b — The hero read

**Kind:** implementation. **These two are the product**, and they are split so they can run at once.

**M6a** · branch `routes/m6a-day` · surface: `DayJoinRow.tsx`, `lib/day-joins.ts`, `screens/day.css`,
`i18n/he.ts`. Ships ADR-0206 **§V1.1** (gap minus travel — the correction), **§V1.3** (per-leg
travel) and **§V1.4** (late risk) in the ADR-0159 slot that already exists.

**M6b** · branch `routes/m6b-hero` · surface: the hero horizon components, **the collapsed board's
countdown**, `i18n/he.ts`, `screens/home.css`. Ships **§V1.2** — `~23 דק׳ · צאו ב־18:37` — **between**
two points per §D2, and answers the third of the app's three questions for the first time.

**It also ships ADR-0206 §Z1, which M0 added:** the collapsed board's existing countdown **swaps its
referent** when leaving is the live question — `עוד 45 דק׳` becomes `צאו עוד 10 דק׳`, and a passed
leave-by becomes the `--miss` mark. **A swap, never a second element** — the board's budget is spent
(ADR-0160 §3/§4) and showing both would state a contradiction. M3 sets the threshold.

> **`i18n/he.ts` is in both surfaces.** It is the one guaranteed conflict, it is append-only, and a
> collision in it is trivial to resolve — but whoever lands second rebases rather than merges, so
> the string table stays readable. If that feels risky, run M6a first and M6b after; they are safe
> in either order.

**Both must honour:** §D3 (the ADR-0114 ladder, never seconds), §D5 (`~`, never a promised arrival
clock), §D7 (`--miss-deep` as text for risk), §D10 (no em dash; `·`; lead with the noun to dodge
Hebrew number agreement).

**Exit criteria:** a gap with travel in it no longer overstates free time — **and there is a spec
that fails against today's code**, because §V1.1 is a bug fix and a bug fix without a failing test
is a claim; every string reads correctly RTL at 360px; a `null` estimate renders the crow-flies chip
with no layout shift.

**What the next session needs to know:** _(fill in)_

---

## M7 — The map polyline

**Kind:** implementation. **Branch:** `routes/m7-map` · **Conflict surface:** `MapPane.tsx`
(`DayConnector` only), `screens/map.css`, `constants.ts` (`MAP_CONNECTOR`).

Extend **`DayConnector`** — do not add a layer beside it, and do not adopt
`maplibre-gl-directions` (ADR-0205 §1). It already owns the source/layer ids, the style-reload
guard and the teardown; a route is one more geometry through the same effect.

Spends the treatment `DayConnector`'s own comment reserved: **solid + amber** for the selected or
next leg, dashed neutral for the rest (§D1, §D8).

**The two traps already documented in that file**, both of which will bite again: the style is torn
down and rebuilt by a theme swap, so _"already added" has to be asked rather than remembered_; and a
layer cannot be added before the style exists. Both guards exist — extend them, do not re-derive
them.

**Exit criteria:** the line survives a theme flip and a day change; exactly one solid line renders at
360px in both themes; no layer or source leaks on unmount (assert via `getLayer` after teardown);
`MapPane`'s existing tests stay green.

**What the next session needs to know:** _(fill in)_

---

## M8 — Mode per leg + trip default

**Kind:** implementation. **Branch:** `routes/m8-mode` · **Conflict surface:** `schema.prisma` + a
migration (**for the per-leg override only** — the default is derived, §Z2), `packages/shared` (the
inference), trip settings, the day/hero controls, `he.ts`.

ADR-0206 **§V1.6 as amended by §Z2** — M0 answered this, so it is no longer open:

- **The default is DERIVED from the trip's bookings, not stored.** A car hire (ADR-0162) makes it a
  driving trip. This is ADR-0018/0027's rule applying cleanly — the only thing persisted is a
  per-leg override, and only when someone sets one. **Do not add a `defaultTravelMode` column.**
- **The switch must be instant**, which is M4's job, not this card's: every gate-admitted mode is
  already fetched and cached (§Y2), so switching is a cache read with no request. If a switch here
  triggers a fetch, M4 is wrong, not M8.
- **Three entries, not four** — no transit control at all (§D9), confirmed by M0 answer 1.

**Exit criteria:** switching mode changes every read on the surface at once (they must not disagree)
and issues **no network request** — asserted, not eyeballed; the derived default is right for a
car-hire trip and for a rail-and-flights trip, and changes when a booking is added; an override
survives a reload and an offline session; a driving leg crossing clusters resolves while the walking
one falls back to the crow-flies chip, and that reads as "not this way" rather than as a failure.

---

## M9 — Plan-mode feasibility

**Kind:** implementation. **Branch:** `routes/m9-plan` · **Conflict surface:** `PlanDay` and its
`lib/`, `he.ts`. Uses `daySequenceFits` from M2 — **no new fetch**, the day matrix is already warm.

ADR-0206 **§V1.7**, and its Consequence is the thing to hold on to: Plan mode gains the ability to
say no, which changes its character from a builder to a builder with an opinion. **It must read as
help, not refusal** — and specifically it is not `--miss` on the whole day, which would be the app
scolding you for planning.

**Exit criteria:** an over-stuffed day is flagged and a feasible one is silent; the flag never fires
on a day whose legs are all ungated-out; no gate violation of ADR-0011 (a hard event is never
implicated in "this does not fit").

---

## M10 — Offline route pack

**Kind:** implementation. **Branch:** `routes/m10-offline` · **Conflict surface:**
`backend/src/map/**` (the extract pipeline), `frontend/src/lib/map-archive-cache.ts`,
`useMapArchives.ts`.

ADR-0206 **§V1.8**, and it is cheap **only** because ADR-0186 §5/§6 already built everything it
needs: the region signature, the budget, the LRU, the eviction rules, the metered-connection policy.
Precompute the trip's day-adjacent legs and ship them with the extract.

**The rules it inherits, verbatim:** an artefact is a cache and never data; the current trip is
pinned; a missing pack falls back to reading remotely and re-downloads quietly, **never an error**.
Do not restate them locally — reuse the mechanisms that enforce them.

**Exit criteria:** aeroplane mode on a downloaded trip shows travel times for every day-adjacent
leg; the pack is counted in the existing size readout and removed by the existing delete; a trip
whose places changed rebuilds the pack via the existing signature, not a new one.

---

## M11 — Day travel total

**Kind:** implementation (small). **Branch:** `routes/m11-total` · **Conflict surface:** the day
header or Plan summary, `he.ts`. ADR-0206 **§V1.9** — `3.2 ק״מ · 48 דק׳ הליכה`, from data M6a
already fetched. **Exit criteria:** no new request; hidden rather than zero when nothing is
routable.

---

## M12 — Harden, observe, document

**Kind:** implementation + docs. **Branch:** `routes/m12-harden`.

- **Observability** (the `observability-and-instrumentation` skill): provider latency, error rate,
  cache hit rate, calls-per-day. The hit rate is the number that says whether ADR-0205's whole
  premise held.
- **A kill-switch drill.** Set `ROUTING_DISABLED`, confirm every surface degrades to crow-flies and
  nothing throws. This is the test that ADR-0206 §D4 is real rather than aspirational.
- **Eviction for `RouteLeg`** before it is a size problem, per ADR-0205's Consequences.
- **Docs sync**, which is the part that gets skipped: `docs/architecture/api-contract.md`,
  `sync-and-offline.md`, `tech-stack.md`, `deployment.md`'s env table, and this board closed out.
- **Prune the backlog lines** this epic completed.

---

## V2 — sketched, not planned

Each is its own ADR when it is taken; ADR-0206 §V2 holds the reasons. In rough value order:
**transit** (the 48-minute gap — and its own epic, not a milestone) · **"leave now" notifications**
(unblocks the moment ADR-0197's sweep is built) · **ripple gains travel** (touches ADR-0011's core)
· **optimised day ordering** · **isochrones / reachability** · **elevation & step-free** ·
**live traffic** (last, and it breaks the cache model).

**Do not open a V2 milestone while any V1 milestone is ⬜ or 🟡.** The V1 reads have to be trusted
before anything is built on top of them — which is the same argument ADR-0206 uses to defer ripple.
