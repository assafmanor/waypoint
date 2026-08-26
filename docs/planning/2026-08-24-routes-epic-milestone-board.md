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

**And flip the rows your predecessors could not.** Before anything else, check every 🔵 row in
**Live status** and set the ones whose PR has merged to ✅. This costs one look and it is genuinely
your job rather than theirs: a session can only ever claim 🔵 about itself — it cannot know whether
the PR it is opening will be merged — so **you are the first reader who can see the answer**. Left
undone the board goes stale in exactly one direction, and it has three times.

**Working it.**

- **One milestone, one branch, one PR.** Branch `routes/mN-slug`, named in the card.
- **Touch only the files in your card's Conflict surface.** If the work genuinely needs a file
  outside it, that is a signal the milestone was scoped wrong: say so on the PR and update the card
  rather than widening quietly.
- **A decision you take that the ADR did not** — a constant, a rejected alternative, a constraint
  found by building — is **amended into the ADR in place**, in the same commit. Not a new ADR, not a
  new note (root `CLAUDE.md`, _"amend that doc in place"_).

**Closing it.** In the same commit as the work: set your row to **🔵** with its PR link and date in
**Live status** — 🔵 and not ✅, for the reason under the legend; fill in **What the next session
needs to know** on your card; prune or add the backlog lines your milestone completed or
discovered. Then open the PR. A milestone is not done
until `pnpm format && pnpm typecheck && pnpm build` are green and the card's **Exit criteria** are
each demonstrably met — evidence on the PR, not an assertion.

**Running two at once.** Two milestones may run concurrently **only if their conflict surfaces are
disjoint** — the ⇉ column says which pairs are safe, and the surfaces are listed so you can check a
pair the column does not name. Both branch from `main`, not from each other.

**Status legend:** ⬜ not started · 🟡 in progress · 🔵 in review · ✅ done · ⛔ blocked

The middle of that list is where the board rots, so the two statuses either side of the merge are
defined rather than left to taste. **🔵 is "work done, PR open"** — the last thing a session can
truthfully say about itself, and therefore what every milestone lands as. **✅ is "merged"**, which
only a later reader can assert; it is written by the next session under _Opening a milestone_,
never by the one that did the work.

---

## Live status

| M       | milestone                   | kind   | status                    | depends on   | ⇉ safe with  | branch / PR                                                                                                                                                                                                          | updated    |
| ------- | --------------------------- | ------ | ------------------------- | ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **M0**  | Product decisions           | owner  | ✅                        | —            | —            | —                                                                                                                                                                                                                    | 2026-08-25 |
| **M1**  | Measure the parameters      | spike  | ✅ (applied by M2b)       | —            | —            | `claude/routes-travel-time-m1-spike-sn7pod` · [#695](https://github.com/assafmanor/waypoint/pull/695)                                                                                                                | 2026-08-25 |
| **M1b** | Make the dev seed routable  | impl   | ✅                        | —            | all          | `claude/dev-seed-routable-m1b-6il7cq` · [#700](https://github.com/assafmanor/waypoint/pull/700)                                                                                                                      | 2026-08-25 |
| **M2**  | Shared derivations          | impl   | ✅                        | M0           | M1, M3       | `claude/routes-epic-m2-nkbf4d` · [#694](https://github.com/assafmanor/waypoint/pull/694)                                                                                                                             | 2026-08-25 |
| **M2b** | Apply M1's numbers to code  | impl   | ✅ **M4 unblocked**       | M1, M2       | M3           | `claude/routes-epic-m2b-q0pxkn` · [#699](https://github.com/assafmanor/waypoint/pull/699)                                                                                                                            | 2026-08-25 |
| **M3**  | Design session + mockups    | design | ✅                        | M0           | M1, M2       | `claude/routes-epic-m3-design-kagqpq` · [#696](https://github.com/assafmanor/waypoint/pull/696)                                                                                                                      | 2026-08-25 |
| **M4**  | Backend routing module      | impl   | ✅ **M5/M10 unblocked**   | M1, M2, M2b  | M3           | `claude/m4-backend-routing-0giz72` · [#702](https://github.com/assafmanor/waypoint/pull/702)                                                                                                                         | 2026-08-25 |
| **M5**  | Frontend data layer         | impl   | ✅ **M6/M7/M9 unblocked** | M2, M4       | M3, M10      | `claude/routes-frontend-protocol-fix-9t521y` · [#704](https://github.com/assafmanor/waypoint/pull/704)                                                                                                               | 2026-08-25 |
| **M6a** | The day reads               | impl   | ⬜                        | M3, M5       | M6b, M7, M9  | —                                                                                                                                                                                                                    | —          |
| **M6b** | The hero read               | impl   | ✅ (+ 1 field fix)        | M3, M5       | M6a, M7, M9  | `claude/m6b-hero-read-routes-wlxj67` · [#712](https://github.com/assafmanor/waypoint/pull/712)                                                                                                                       | 2026-08-26 |
| **M6c** | A fix withdraws the mark    | impl   | ✅                        | M6b          | M6a, M7, M9  | `claude/m6b-hero-read-routes-wlxj67` · [#713](https://github.com/assafmanor/waypoint/pull/713)                                                                                                                       | 2026-08-26 |
| **M6d** | A claim stands on something | impl   | 🔵                        | M6b, M6c     | M6a, M7, M9  | `claude/m6b-hero-read-routes-wlxj67` · [#714](https://github.com/assafmanor/waypoint/pull/714)                                                                                                                       | 2026-08-26 |
| **M7**  | The map polyline            | impl   | ✅                        | M3, M5       | M6a, M6b, M9 | `claude/routes-map-polyline-m7-baqobz` · [#706](https://github.com/assafmanor/waypoint/pull/706) · [#707](https://github.com/assafmanor/waypoint/pull/707)                                                           | 2026-08-25 |
| **M7b** | The lines read as a route   | design | ✅                        | M7           | M8, M9       | `claude/routes-map-polyline-m7-baqobz` · [#708](https://github.com/assafmanor/waypoint/pull/708)                                                                                                                     | 2026-08-25 |
| **M7c** | The day's bookends          | impl   | ✅ (+ 2 field fixes)      | M7, M7b      | M8, M9       | `claude/routes-map-polyline-m7-baqobz` · [#709](https://github.com/assafmanor/waypoint/pull/709) · [#710](https://github.com/assafmanor/waypoint/pull/710) · [#711](https://github.com/assafmanor/waypoint/pull/711) | 2026-08-26 |
| **M8**  | Mode per leg + trip default | impl   | ⬜                        | M6a, M6b, M7 | M10          | —                                                                                                                                                                                                                    | —          |
| **M9**  | Plan-mode feasibility       | impl   | ⬜                        | M5           | M6a, M6b, M7 | —                                                                                                                                                                                                                    | —          |
| **M10** | Offline route pack          | impl   | ⬜                        | M4           | M5–M9        | —                                                                                                                                                                                                                    | —          |
| **M11** | Day travel total            | impl   | ⬜                        | M6a          | M8, M10      | —                                                                                                                                                                                                                    | —          |
| **M12** | Harden, observe, document   | impl   | ⬜                        | all          | —            | —                                                                                                                                                                                                                    | —          |

### M2b — apply M1's numbers to the code ✅

**M1 measured the ceilings into [ADR-0205 §Z](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) and changed no production code** — correctly, since its own card says "produces numbers, not features" and scopes it to `docs/`. **But nobody was assigned to apply them, and that is a gap in this board, not in M1.** `packages/shared/src/routing.ts` on `main` still ships M2's placeholders:

| constant            | was       | now (§Z2)     | how wrong it was                                                                 |
| ------------------- | --------- | ------------- | -------------------------------------------------------------------------------- |
| `walking.maxMeters` | `25_000`  | **`15_000`**  | measured at `5_000`, then raised by the owner — ADR-0205 §Z8, and the note below |
| `cycling.maxMeters` | `100_000` | **`20_000`**  | 5× — admits 94, 145, 154 and 192-minute rides                                    |
| `driving.maxMeters` | `800_000` | **`300_000`** | 2.7×, and above the provider's own 400 km path limit                             |
| `ROUTE_MIN_CROW_M`  | _absent_  | **`10`**      | no floor, so a 0.00 km pair costs a matrix cell and a cache row                  |

`ROUTE_COORD_DECIMALS = 5` is confirmed unchanged (§Z1), and `TRAVEL_BUFFER_SECONDS = 5 * 60` stands (§Z6).

**One correction rides with it:** §Z2 measured that once `maxMeters` drops below ADR-0186 §4's 40 km link radius, **`sameClusterOnly` can no longer reject anything** — verified over 2,500+ random global pairs at ≤20 km, every one co-clusters. It looked load-bearing only because M2's placeholders were above the link radius. Do not silently delete the flag; ADR-0205 §Z2 is the record of why it is now inert, and driving still reads it.

**Kind:** implementation, small. **Branch:** `routes/m2b-apply-measurements` — ran as `claude/routes-epic-m2b-q0pxkn`, the branch the session was handed. **Conflict surface:** `packages/shared/src/routing.ts` and its spec, `packages/shared/src/constants.ts`. **Exit criteria:** the four numbers above are the shipped values with the measurement cited beside each; a spec asserts the new floor and each new ceiling at its boundary; `pnpm --filter @waypoint/shared test` green; ADR-0205 §Z amended in place to say the code now matches.

**What the next session needs to know:**

- **The four numbers are shipped and cited** in `routing.ts`; `constants.ts` needed no change — all
  four constants live in `routing.ts`. 367 green in the package (was 362), `pnpm format`,
  `typecheck`, `build` and `lint` green. **M4 may now import `TRAVEL_GATE` as a decided gate.**
- **⚠ Walking is 15 km, not §Z2's measured 5 km — the owner raised it** on reading this PR
  ("there are times where we'd prefer walking for the fun of it"), recorded as **ADR-0205 §Z8**.
  §Z2's number was never a provider limit; it was a judgement about usefulness, and the owner made
  it the other way. **Two invariants now hold the new number in place and both are specced:** every
  cluster-bound ceiling stays under ADR-0186 §4's 40 km link radius (or §Z2's "`sameClusterOnly` is
  inert" quietly stops being true), and walking ≤ cycling ≤ driving (or the mode control reads as
  broken). **A future raise past 40 km fails a test, by design.**
- **The driving ceiling cannot be raised, and ADR-0205 §Z9 is the record of why** — asked of a real
  Iceland trip. 300 km crow is the provider's hard 400 km _path_ limit ÷ the worst measured ratio,
  and one over-limit pair `400`s the whole day matrix (§Z4). Every plausible ring-road leg is under
  it (longest real one measured: Reykjavík → Mývatn, 284 km crow); the two that are not are legs the
  provider itself refuses. **§Z9 names the one cheap way to move it and it is M4's shape, not a
  number: send over-ceiling pairs in their own request, where a refusal costs only that pair.**
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

### Owner decisions — ✅ ALL CLOSED (2026-08-25)

Answered by the owner and recorded in **[ADR-0206 §AA](../decisions/0206-a-travel-time-belongs-between-two-points.md)**. Nothing on this epic waits on a decision any more.

| #   | question                | answer                                                                                                                                                                                                          | who builds it |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | The swap threshold      | **30 minutes** of time-to-leave, as measured — `LEAVE_BY_SWAP_MINUTES = 30` (§AA1)                                                                                                                              | M6b           |
| 2   | The leave-by buffer     | `TRAVEL_BUFFER_SECONDS = 5 * 60` **stands**, scope narrowed to departure overhead — answered by M1 (ADR-0205 §Z6)                                                                                               | done          |
| 3   | The tile's unit word    | **`ליציאה`**, following ADR-0184 §6's `לסגירה` (§AA2)                                                                                                                                                           | M6b           |
| 4   | The three mode icons    | **Mint them** — `ui/Icon.tsx` gains walk, car, bicycle. ADR-0138 §4's "icons are UI" already settled the grammar; §Z5's word chips were a consequence of the icons not existing (§AA3)                          | M6a, M8       |
| 5   | The transit declaration | **Yes, as a suppression mark** — and it reverses what ADR-0206 argued. A person may declare תחב״צ; it suppresses the wrong walking estimate and keeps the distance. Read §AA4 in full before building it (§AA4) | M8            |

**Two things fall out of #4 and #5 that the cards did not carry:**

- **M6a and M8 own three new `Icon` entries**, and ADR-0138's rule that a glyph carries a content
  rule applies — draw them at 24px before coding.
- **⚠ M8 gains scope, and it needs the mockup extended first.** The transit mark is a fourth stored
  mode value with **no provider**: it rides M8's existing per-leg override, `TRAVEL_GATE` never sees
  it, and no request is ever made. §Z5 raised it as a question and never resolved it into a drawn
  state, so the mark, the suppressed-duration row and the "no estimate" copy want adding to
  `a-travel-time-between-two-points-v2.html` before M8 codes them. Small addition to an existing
  file, not a new design session.

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

1. **The dev seed has no coordinates** (§Z0) — **closed by M1b, 2026-08-25; the seed is routable
   and §Z0 says so in place.** All 8 `Place` rows were name-only Place-lite, `lat`/`lng` `null`, so
   **M4, M5, M6a/b, M7, M9 and M11 could not be exercised end-to-end against the seed at all**.
   Read M1b's card, not the backlog line, for what the fixture now holds. M1's numbers come from
   those 8 places geocoded by name plus four ADR-named trip archetypes; n is small and every rate
   says so — and M1b's coordinates are close to but not identical with that geocode, so the rates
   are worth re-deriving before they are cited again.
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

## M1b — Make the dev seed routable ✅

**This milestone was not on the board, and it is the same gap M2b was.** M1's finding 1 named it —
the seed's eight `Place` rows were name-only Place-lite (ADR-0147) with `lat`/`lng` `null`
(ADR-0205 §Z0) — and gave it a backlog line, but no card and nobody assigned. **M4, M5, M6a/b, M7,
M9 and M11 all need a routable trip**, so it lands before M4 rather than beside it.

**Kind:** implementation, small. **Branch:** `routes/m1b-seed` — ran as
`claude/dev-seed-routable-m1b-6il7cq`, the branch the session was handed. **Conflict surface:**
`backend/prisma/seed.mjs` only, plus this board, `docs/backlog.md` and ADR-0205 §Z0 — disjoint from
every other card, so it is ⇉ safe with all of them.

**Exit criteria:** every `Place` row carries real coordinates; the seed exercises, deliberately and
with a comment naming the path each case is for, a walkable day, a gate-REFUSED leg, a multi-cluster
pair, the existing 0.00 km pairs, a gap travel genuinely eats, and a second trip with a car hire;
**additive only** (no existing row renamed, renumbered or restructured); the e2e suite green.

**What the next session needs to know:**

- **The seed is routable, and the fixture is a contract rather than a side effect.** Two comment
  tables in `seed.mjs` — one above `PLACES`, one above the Iceland trip — say which gate path every
  consecutive pair is for. **Change a coordinate and you change some milestone's fixture**, so read
  the table for the case you are about to move.
- **What the gate actually answers, read back out of the seeded database through the shipped
  `routableLegs` / `clusterLatLngs` / `TRAVEL_GATE`** — measured, not estimated:

  | trip                           | day   | leg                      |      crow | admitted                        |
  | ------------------------------ | ----- | ------------------------ | --------: | ------------------------------- |
  | Tokyo (10 places, 3 clusters)  | today | Asakusa → Tsukiji        |   5.59 km | walking / driving / cycling     |
  |                                | today | Tsukiji → Senso-ji       |   5.97 km | walking / driving / cycling     |
  |                                | today | Senso-ji → Shinjuku      |   9.12 km | walking / driving / cycling     |
  |                                | today | Shinjuku → Shinjuku      |   0.00 km | **REFUSED** — the 10 m floor    |
  |                                | today | Shinjuku ↔ Golden Gai ×2 |   0.61 km | walking / driving / cycling     |
  |                                | today | Shinjuku → Shinjuku      |   0.00 km | **REFUSED** — the 10 m floor    |
  |                                | DAY+1 | Ueno → Ginza             |   4.86 km | walking / driving / cycling     |
  | Iceland (5 places, 3 clusters) | D+0   | Blue Lagoon → Reykjavík  |  38.55 km | **driving only**, ONE cluster   |
  |                                | D+1   | Reykjavík → Vík          | 165.39 km | driving only, **cross-cluster** |
  |                                | D+2   | Vík → Höfn               | 208.04 km | driving only, cross-cluster     |
  |                                | D+3   | Höfn → Reykjavík         | 325.98 km | **REFUSED** — over the ceiling  |

- **The two REFUSED kinds are different, and both are features.** `0.00 km` is `ROUTE_MIN_CROW_M`'s
  floor — four events share `pl-shinjuku`, the pair §Z2 measured it against — and `325.98 km` is
  over the driving ceiling, which §Z9 asked this exact drive about and refused to raise. Both are
  ADR-0206 §D4's ordinary absence. **M4 and M6a: neither is an error path.**
- **The `38.55 km` leg is the one that separates the gate's two halves.** It sits inside ONE cluster
  and is still driving-only, because it is over walking's 15 km and cycling's 20 km. Anything
  claiming to test "the cluster gate" against a distance refusal should use it.
- **An ambient row is not a stop.** The hotel span and the car hire have `endDate > date`, so
  ADR-0054 renders them as backdrops and they contribute no leg — which is why each Iceland day
  carries two real stops of its own. A one-stop day has nothing to route and the seed keeps one of
  those too (the outbound-flight day).
- **The second trip exists for M8, and only M8 could have asked for it.** `trip-iceland-26` carries
  ADR-0162's `car` booking, because a default mode derived from bookings (ADR-0206 §Z2) cannot be
  exercised by a trip of flights, a hotel and a restaurant. **Tokyo is now the negative case and
  Iceland the positive one.** A mixed trip — a hire among flights — is unbuilt and is M8's to add if
  it wants one. It is set 30 days out so two trips never compete for "today"; if a milestone needs
  the road trip to BE today, move `ICE_DAY`, do not add a third trip.
- **`timezone` came with the coordinates, and it is the one thing here a reader could mistake for a
  routing change.** The picker resolves a zone from the coordinate through geo-tz
  (`places.service.ts`), so a coordinate with no zone is a row the app never writes. Visible
  consequence: `pl-tlv` is now `Asia/Jerusalem`, which makes the outbound flight a real ADR-0107
  zone crossing for the first time. That is the fixture becoming correct.
- **§Z2's rates can now be re-measured, and should be.** §Z0 measured the seed's places _geocoded by
  name_; these are the coordinates a picker would fill, so they are close but not identical —
  Senso-ji → Shinjuku is **9.12 km** here against §Z2's 8.58 km. No gate outcome moves (both admit),
  but a rate quoted to two digits should be re-derived before it is cited again.
- **One number in the seed is arithmetic, not a provider answer.** The DAY+1 gap is sized from §Z2's
  measured 4.9 km/h over §Z7's 1.16 median road/crow — ~69 min for 4.86 km. **M4 will get the real
  duration and it will differ.** The fixture's job is that travel visibly eats a chunk of a 2:30 gap
  and that both readings clear `GAP_MIN_MINUTES`, which holds at any plausible pace.

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
- **Found by M2b (ADR-0205 §Z9): the day matrix is what makes the driving ceiling conservative.**
  Because a single over-limit pair `400`s every leg in the request, the ceiling has to be the
  provider's 400 km path limit ÷ the _worst_ observed road/crow ratio. **Send a pair the gate would
  refuse in its own request instead and a refusal costs only that pair** — which is the one cheap
  way this epic has to route legs between 300 km and the provider's real boundary. Not required for
  V1; decide it here rather than leaving the ceiling looking like taste.

**Exit criteria:** a cold day matrix answers and is cached; a second call hits the cache with no
outbound request (asserted in a spec, not observed by hand); **one request returns every admitted
mode, and a leg the gate refuses for one mode still returns the others**; the gate rejects a
cross-cluster pair without calling out; the kill switch stops every outbound call while the endpoint
still answers from cache; the politeness limiter paces a three-mode warm rather than bursting;
`X-Client-Id` is sent; migration applies clean.

**What the next session needs to know:**

- **`POST /trips/:tripId/routes` is live, and it answers the seed for real.** Documented in
  [`architecture/api-contract.md`](../architecture/api-contract.md#routes--travel-time-adr-0205).
  Body is `routeBatchRequestSchema`, answer is `routeBatchSchema` — both already shipped by M2, so
  **M5 has no new shape to learn**. `200` when everything asked for is answered, **`202` +
  `Retry-After` while anything is warming**, and the body is the same shape either way.
- **Every exit criterion was verified end to end against the seeded database and the live
  provider**, not only in a spec. The three named cases behave as M1b's tables promise, and all
  three are features:

  | leg                     |    crow | what the endpoint answers                                       |
  | ----------------------- | ------: | --------------------------------------------------------------- |
  | Shinjuku → Shinjuku     | 0.00 km | `refusedModes: [all 3]`, **no upstream call, no row**           |
  | Höfn → Reykjavík        |  326 km | `refusedModes: [all 3]`, **no upstream call**                   |
  | Blue Lagoon → Reykjavík | 38.6 km | `driving` only · 57.6 min / 53.5 km; walking+cycling refused    |
  | Asakusa → Tsukiji       | 5.59 km | walking **86.8 min / 6.23 km** — ferry-free, so §Z7 is honoured |

- **Three decisions M4 took that the ADRs left open, all amended into ADR-0205 in place** (no new
  ADR, per the protocol): **`walking_speed: 4.5`** (§Z6 measured the options and left the choice —
  4.5 and not 4.0 because ADR-0206 §D5 cuts both ways and the departure buffer is already its own
  constant); **`ROUTE_BATCH_MAX_STOPS = 24` restated as a deliberate bound** (§Z4 — the provider's
  real limit is **2,500 cells**, not stops: 26 points answers, 51 does not); and **§Z9 point 1
  built** (below).
- **§Z9's "isolate the long pairs" is built, and it turned out to be a stricter rule than that.**
  `matrix-batches.ts` holds one invariant — _a request may only contain pairs the mode's ceiling
  admits_ — because a matrix answers **every** pair among the points it is sent, not just the
  consecutive ones. So a day carrying one long leg would otherwise ship a cross pair nobody gated,
  and §Z4's `400` would take the whole day down. A long leg now arrives alone as a consequence
  rather than as a special case. **The ceilings did not move and are still not M4's to move** —
  but raising the driving one is now a one-number change instead of a shape change.
- **`M8`, read this before you touch `sameClusterOnly`:** the flag is still inert on distance
  (§Z2), and the **one** thing it can still change is specced — a stop the trip does not hold sits
  in no cluster, so walking and cycling are refused for it while driving answers. That is a real
  behaviour, not a theoretical one, and flipping the flag removes it.
- **Two files outside the card's conflict surface were touched, both deliberately.**
  `architecture/deployment.md` is the smaller one and is simply a gap in the card: the routing
  vars belong in Railway's env table, and that section's kill-switch warning **enumerates the
  switches by name**, so adding a fifth without amending it would have left a doc that is wrong
  rather than merely incomplete. (`ROUTING_DISABLED` joined the four that read truthiness rather
  than `FX_DISABLED`'s `=== '1'` — so the collapse that note has wanted since ADR-0197 is still
  one switch to move, not four.) The other is rule 8's call rather than a shortcut:
  `enrichment/outbound-fetch.ts` gained `POST` + custom headers and an `OutboundHttpError` that
  carries status and body. That file's own header says it is _"the
  process's ONE outbound seat"_ and that _"a second fetcher would be a second place to get SSRF
  wrong"_ — and ADR-0166 §8 had already named ETA as a consumer of it. The allowlist stays **code**
  (`valhalla1.openstreetmap.de` is a line in it), so a self-hosted router is two lines, not one.
- **The `RouteLeg` table is outside `ChangeService` and must stay there.** No `tripId`, one writer,
  nothing to undo. Its only non-key index is `tilesetAt` — **that index exists for M12** and for
  nothing else (§Z5: evict on a tileset roll, never on a TTL).
- **M10 (offline route pack) reads from this and needs no new endpoint.** Every cell a matrix
  returns is cached, not just the consecutive pairs, so a day's non-adjacent pairs are already
  stored: a reorder or an inserted stop costs nothing.
- **A shape is one call per leg and the warm paces at 8 per pass**, deliberately — a 24-stop day in
  three modes would otherwise be 69 upstream calls at 1/s. **Nothing is dropped**: a leg not
  reached stays in `pendingModes`, so the next ask continues where this one stopped. **M7 draws one
  line at a time (ADR-0206 §D8), so this should never bind in practice** — say so if it does.
- **The trap that cost the most time here was not the provider.** `PolitenessLimiter` had a
  defaulted `number` constructor argument and `@Injectable()`, so Nest tried to inject `Number` and
  **aborted the worker process** — which surfaces only when the whole `AppModule` is constructed
  (`openapi-contract.spec.ts`, `throttler.e2e.spec.ts`), and as a native crash rather than an
  error. It is bound through a factory now. If a routing spec passes and those two die, look there.

---

## M5 — Frontend data layer

**Kind:** implementation. **Branch:** `routes/m5-frontend-data` · **Read:** `frontend/CLAUDE.md`.
**Conflict surface:** `frontend/src/lib/travel.ts` (new), the Dexie schema + a version bump,
`frontend/src/lib/api.ts`, and the one line of `lib/cache.ts` that a new table costs — its own
comments say a dedicated table means "a schema version bump plus edits to `wipeLocalData`", so the
sign-out wipe is part of adding one rather than a widening. **No component changes** — that is
M6/M7, and keeping them apart is what makes those two parallel.

- A Dexie table, **not** `byte-cache` (that is for blobs) and **not** the `CACHE_CHANNELS` registry
  (a route is not a syncable entity and has no client writer) — ADR-0205 §7.
- **A Dexie version bump is a migration on every user's device.** ADR-0186's own warning applies:
  the Dexie name and storage keys _are_ the local cache. Add a table; do not rename anything.
- The read hook returns `estimate | null`, and **`null` is normal** — offline, gated, not yet warm.
  Every consumer falls back to `formatDistance` (ADR-0206 §D4). There is no error state to design.

**Exit criteria:** an estimate survives a reload offline; a cold read returns `null` and does not
throw; the `202`/`Retry-After` path re-asks once and then gives up quietly; no component imports the
provider shape directly.

**What the next session needs to know:**

- **The whole surface is `useDayTravel({ tripId, stops, modes? })` → `estimateFor(from, to, mode)`,
  which answers `TravelEstimate | null`.** `stops` is the day's ordered coordinates; `modes`
  defaults to all of them, so ADR-0206 §Z2's mode switch is a read from what is already held. There
  is no loading flag and no error state to render — `null` is offline, refused, warming and
  provider-down alike (§D4), and every consumer falls back to `formatDistance`. **Nothing else is
  exported for a component**: `fetchRoutes` and the Dexie helpers exist for this hook and for M10.
- **Nothing is passed in for "am I the visible day" or "am I offline".** Both are read inside the
  hook — `useIsDayPreview()` and `useIsOffline()` — because both are facts about the app rather than
  about the day. **That is what answers the card's fetch-ordering warning:** a peek reads Dexie and
  never asks, so a swipe costs one matrix and not three. A day you have already visited therefore
  peeks with its real numbers, and one you have not falls back to the crow-flies chip until the
  swipe commits. Two specs hold it, and both fail if the guard is removed.
- **The day's identity is a CONTENT fingerprint, never the `stops` array.** A day surface derives
  its stops each render and re-renders on the clock, so an array dep would re-ask on a render that
  changed nothing. The effects depend on the joined leg keys and read the values through a ref. **If
  a consumer sees a request per second, that is the fingerprint changing** — a coordinate being
  rebuilt with different float noise, most likely — not the hook polling.
- **A day answered in full is remembered for the session** (a module-level set), so swiping back and
  forth costs nothing. Dexie cannot answer that question on its own: a refused mode is never a row,
  so "do we hold every key we would ask about" is false forever for any day with one refusal in it.
  **A day that came back still warming is deliberately not remembered** — that is how it gets its
  numbers: opening it again asks again.
- **⚠ M8: `TRAVEL_MODES` is the default, and this layer reads it as "every mode the endpoint can
  answer".** ADR-0206 §AA4's תחב״צ mark is a stored mode value with **no provider** — no gate, no
  request, ever — so it must not join that list, or every day will ask for a route nobody can
  compute. `TRAVEL_GATE`'s `Record<TravelMode, TravelGateRule>` is the tripwire: adding the value
  stops that record compiling until somebody answers this.
- **⚠ M7 has no way to ask for a line, and its conflict surface says it may not add one.** The
  request carries `withShapes` and `TravelEstimate` carries `shape`, but this hook never asks for
  geometry: a matrix has none, so a drawable line is a call per leg, and ADR-0206 §D8 draws one at a
  time. That is a shape decision M7 should make rather than one M5 should guess — so **M7's card
  wants `lib/travel.ts` added to its conflict surface**, and the ask it needs is small (one two-stop
  request with `withShapes: true` for the selected leg, cached and read through the same key).
- **The Dexie table is `routeLegs` at version 5, keyed by `routeLegKey` — the server's own spelling,
  imported, never re-derived.** Two spellings is a client that can never hit a row the server
  stored. It carries no `tripId` (nothing for `clearTripCache` to do), it is cleared by
  `wipeLocalData`, and `cachedAt` is provenance rather than an expiry — indexed only because it is
  the ordering an eviction sweep would need. **M10 reads and writes this table** rather than
  inventing a second store beside it.
- **`202` is a success and the body says so.** `retryAfterSeconds` on the envelope is zod-validated
  and duplicates the `Retry-After` header, so nothing here parses the header — `res.ok` already
  covers `202`. The wait is clamped, because a value we do not control must not park a timer for an
  hour.

---

## M6a — The day reads · M6b — The hero read

**Kind:** implementation. **These two are the product**, and they are split so they can run at once.

**M6a** · branch `routes/m6a-day` · surface: `DayJoinRow.tsx`, `lib/day-joins.ts`, `screens/day.css`,
`i18n/he.ts`. Ships ADR-0206 **§V1.1** (gap minus travel — the correction), **§V1.3** (per-leg
travel) and **§V1.4** (late risk) in the ADR-0159 slot that already exists.

**M6b** · branch `routes/m6b-hero` — ran as `claude/m6b-hero-read-routes-wlxj67`, the branch the
session was handed · surface: the hero horizon components, **the collapsed board's countdown**,
`i18n/he.ts`, `screens/home.css`. Ships **§V1.2** — `~23 דק׳ · צאו ב־18:37` — **between**
two points per §D2, and answers the third of the app's three questions for the first time.

> **M6b's surface was four files wider than this card said**, and the card was wrong rather than the
> work: `screens/Home.tsx` is the host of both the board and the hero and derives every datum either
> one renders, so "the collapsed board's countdown" is a line in `Home.tsx` and a class in
> `board.css`. Plus three new files — `lib/hero-travel.ts` (the arithmetic), `lib/on-way.ts`
> (`בדרך` as state) and `lib/duration.ts`'s `approxDuration`, which **M6a needs too**: the hedged
> `~N דק׳` is one function or it is two that will disagree. `screens/home.css` was NOT touched — the
> hero's stylesheet is `ui/domain/hero-lift.css`, which is where the block lives.

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

> **The first clause is M6a's, not M6b's**, and saying so is not a narrowing: §V1.1 is the gap slot,
> which is `DayJoinRow`'s. M6b's own exit criteria are the second and third, plus §Z1's three arms
> and §V1.2's line. Both are met and measured — see below.

**What the next session needs to know (M6b, 2026-08-26)** — note:
[2026-08-26](2026-08-26-the-board-counts-to-the-leaving-for-real.md):

- **§V1.2 and §Z1 are shipped.** The horizon carries `~23 דק׳ · צאו ב־18:37` in a `.hero-trv` block
  under `.wp-board-divider` — **between** the two points, so §D2 answers ADR-0160 §U0's admission
  rule rather than spending it — and the collapsed board's one countdown swaps its unit
  (`דקות` → `ליציאה` → `מהיציאה`, the last in `--miss`). ADR-0206 **§AE** is the build log; read it
  rather than the session note.
- **The swap is one `Home.tsx` ternary, as the card predicted, and `Board`/`HeroLift` gained one
  optional field between them** (`countdown.missed`). The tile is `.wp-board-countdown.missed`,
  reusing `.tlabel.missed`'s recipe — no new value.
- **⚠ The mode word was dropped and then restored** (§AE6). The mockup's §1d draws
  `הליכה · ~40 דק׳ · צאו ב־18:37`; the milestone brief quotes the sentence without the mode, and the
  first build followed the quote. **The drawing is the spec; a brief quoting it is not.** `הליכה`
  leading is also §D10's own dodge, and it is free — measured at 360, every state is the height it
  was without it. The three words are `t.travelMode`, a `Record<TravelMode, string>` at the top
  level of `he.ts` because **M6a's journey block and M8's control name the same three things**.
- **Four decisions were taken WITHOUT going back to a mockup, on the owner's instruction to draw
  only what is not trivial** — §AE's preamble records which and why, using this board's own
  precedent (M7c's second field report: a word in an existing slot spends no new axis). The one
  that is not a drawing question is `בדרך`'s storage, and it is flagged for the owner rather than
  settled.
- **The third unit word is `מהיציאה`, and it is a decision this milestone took** (§AE1). §Z5 measured
  `ליציאה` for the live arm and left the passed arm's word open; v1 drew `באיחור`, which v2 §3 then
  refused because the app has no sensor. `מהיציאה` is the same noun with the preposition flipped —
  the minutes are counted FROM the leave-by instead of TO it — and it claims nothing about a person.
- **⚠ The tile widens to ⁦76.58px⁩ whenever its VALUE steps to `H:MM`, and that is shipped behaviour,
  not this milestone's.** Measured in Chromium at 360: all four unit words (`דקות`, `לסגירה`,
  `ליציאה`, `מהיציאה`) fit the ⁦74px⁩ tile unchanged, but `2:00 · שעות` — arm 1, on `main` today, for
  any next event an hour or more out — is ⁦76.58px⁩ and breaks a long `הבא בתור` title onto a second
  line (⁦21px⁩ → ⁦41px⁩). A leave-by passed by over an hour reaches the same rung. **Backlogged, not
  fixed here:** it is not the swap's, and fixing it is a `.wp-board-next-row` question.
- **`בדרך` writes now** (`lib/on-way.ts`), which is what withdraws the mark. **It is a DEVICE mark**
  and the toast says so — it used to read `שותף לקבוצה` over a verb that wrote nothing, which made
  it the one confirmation in the app that was false. The group-visible version is a stored field
  plus a migration plus a cache mirror, and it is on the backlog rather than smuggled into a routes
  milestone. **M6a reads the same module** for the day row's own mark.
- **The collision is settled in code and specced both ways** (§Z5 §M1): `Home.tsx` compares
  `closingMins` against `minutesToLeave` and the nearer wins, with a passed leave-by negative and so
  always nearer. `Home.leave-by.test.tsx` asserts both directions and the passed case.
- **⚠ M6a: the leg's ORIGIN is a shared question and this card answered it one way.**
  `travelOrigin` takes the primary now point, else the latest stop that has already started **on
  the clock's own day** — never further back, because the stop before that is somewhere you have
  already left and offering it would invent a position. That is deliberately the same leg
  `DayJoinRow` measures a hole with, so **if M6a derives its own origin differently the two
  surfaces will state different leave-bys for one journey.** Reuse it. Its one gap is §AD's
  bookends: the stay you woke in is the honest origin for a morning before anything has started,
  and reaching it needs `buildDayStopSequence` plus the Map's place-usage index — a widening of
  M6b's surface rather than a line in it, and §AE3 says so.
- **A leg declared תחב״צ (§AA4) cannot fire the swap, and it is by construction rather than by a
  guard**: the declaration is not a member of `travelModeSchema`, so `estimateFor` cannot be asked
  for it, so `travelSeconds` is `null` and `heroLeaveBy` answers `null`. M8 needs to keep it that
  way — the moment anything makes it a `TravelMode`, the board starts counting to a departure
  nobody can estimate.
- **Own-device position was NOT built**, per this board's own instruction. It is still the thing
  that would let the mark be **withdrawn** rather than only answered, and it still wants its own ADR
  (M3's card, ADR-0006).
- **⚠ Verified by measurement, because reading the code cannot settle it:** the `~` must sit INSIDE
  the bidi isolate with the digits. Measured in Chromium at 360 — with the isolate the `~` renders
  at x⁦314⁩ and the `2` at x⁦326⁩ (reads `~23`); without it the `~` is at x⁦336⁩, to the RIGHT of both
  digits (reads `23~`). `approxDuration` owns it so no caller can get it wrong again.

---

## M6c — A position withdraws a claim the clock made

**Kind:** implementation, off a field report on M6b's first real day. **Decides:**
[ADR-0207](../decisions/0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) · **Drawn already:**
[`a-travel-time-between-two-points-v2.html`](../../mockups/a-travel-time-between-two-points-v2.html)
**§3d**, which drew all three tiers and was never built · **Note:**
[2026-08-26](2026-08-26-a-fix-withdraws-the-mark.md).

Owner, twice, from the shipped board: _"the app doesn't recognize that I'm no longer at the last stop
and close to the next one so it shows me being late… the distance and time should be relative to your
actual GPS location or else it should be more clear that this doesn't take your real location into
account."_ They were ⁦200m⁩ from the door, **and the Map tab was drawing their blue dot beside that
stop's pin at the same moment.**

**M6b was not wrong on its own terms and that is the point.** §AE3 measures the leg between two
SCHEDULED stops, so the number described the plan correctly. The defect is the **silence**: the app
had a position, was already using it fifty pixels away, and did not let the surface making a claim
about the traveller consult it. **The board's own instruction was that this "wants its own ADR" — so
the ADR is the deliverable alongside the code, not a step that was skipped.**

**The thesis, and it is what keeps the change small:** a fix decides what we may **claim**, never what
we **estimate**. No route request is ever issued from a position, so ADR-0205 §4's place-keyed cache is
untouched. Four stances, `unknown` first because it is the default:

| stance      | the fix says           | the surface then                            |
| ----------- | ---------------------- | ------------------------------------------- |
| `unknown`   | nothing usable         | reads **exactly** as M6b shipped            |
| `at-origin` | still at the last stop | **earns** the mark — `עדיין כאן` beside it  |
| `en-route`  | along the leg          | withdraws it, with nobody pressing anything |
| `arrived`   | at the next stop       | reports no journey at all                   |

**What the next session needs to know:**

- **Home never prompts** (§3). It calls `request()` only when `permission === 'granted'`, so anyone
  who has used the Map gets the fix free and anyone who has not is never asked. **A prompt on Home
  needs its own reason-first card and its own decision** (ADR-0109 §6) — do not add one casually.
- **`useGeolocation` grew `fixedAt` and `accuracyMeters`.** Both come straight off the browser's
  `GeolocationPosition`; neither existed because "near me now" answers the instant it asks. The
  timestamp is the platform's, never stamped on arrival — with `maximumAge` set the browser may hand
  back an older fix, and re-stamping would call it fresh.
- **⚠ Two bugs the arithmetic hid, both found by writing the spec and the render rather than by
  reading the diff.** The radius was `min(accuracy, fraction)`, which let the leg's fraction cap it
  **below the fix's own error bar** — the exact noise §5 exists to refuse. And `en-route` tested
  "closer to the destination than the origin", which only fires past the **midpoint**, so somebody a
  third of the way along kept a mark they had plainly answered. Both are specced now.
- **⚠ And one the render caught:** the `en-route` line printed the duration twice
  (`~12 דק׳ · בדרך · נותרו ~12 דק׳`). The bare number is the ambiguity §6 exists to remove, so the
  labelled one survives and the `duration` slot goes empty on that arm.
- **Measured at 360:** every action row is 2 lines at ⁦46px⁩ and `עדיין כאן` costs **zero extra
  lines** — the `--miss` row was already two because of the `בדרך` button. No horizontal overflow.
- **`בדרך` is reversible now** (§7) — `clearOnWay`, the toast's undo, and `ביטול סימון` on the row
  because a toast is transient and a mark is not. **M6a inherits that too.**
- **Two numbers are judgements, not measurements**, and both are on the backlog with §D5's buffer:
  `ARRIVAL_FRACTION` (0.12) and `ARRIVAL_RADIUS_MAX_M` (⁦2km⁩). They want a real day.
- **What this does NOT do:** the group still learns nothing from a sensor (ADR-0006 §8 untouched —
  the position is never persisted or sent), and `near-the-day`'s "better metric" is now one step away
  but unbuilt.

---

## M6d — A claim stands on something, and a toast tells the truth

**Kind:** implementation, off three reports in one message after M6c deployed. **Decides:**
[ADR-0208](../decisions/0208-a-claim-needs-something-to-stand-on.md) · **Amends** ADR-0206 §AE1 and
§AE3, **extends** ADR-0207 · **Note:**
[2026-08-26](2026-08-26-a-claim-stands-on-something.md).

Owner, from the deployed board: _"`15 מהיציאה` is not clear enough. It should say that you're late
right? But the phrasing is bad"_ · _"when you're past a stop and not exactly on it, it shows you as on
the way because we skipped"_ · _"when I click on postpone on the day view, a pop up says postponed but
it doesn't allow it"_.

**Two of the three are the same mistake:** the app asserting something it had not earned.

| report                  | what it was                                                  | what it is now                                                        |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `15 · מהיציאה`          | "counted from the departure" — grammar right, reading wrong  | `15 · דקות באיחור · ליציאה` — how much, that it is lateness, what for |
| on the way after a skip | a skipped stop was still the leg's origin                    | a **denied** claim, which licenses nothing alone                      |
| `נדחה` on a refusal     | `applyDelay` swallowed its own failure and resolved normally | the verb reports it, and checks the target first                      |

**What the next session needs to know:**

- **`travelOrigin` returns a CLAIM, not an event** (`{ event?, denied }`). Anything that grows a
  second consumer — M6a's day row, M9's feasibility — inherits the denial instead of rediscovering
  it, which is the reason it lives in the derivation rather than in `Home.tsx`.
- **A skip says nothing about place in EITHER direction**, and that is the whole rule. It is why the
  origin is not replaced by the previous non-skipped stop: that swaps a wrong claim for a staler one,
  and errs toward a **louder** app, since a longer leg is an earlier leave-by is a more confident late
  mark. Do not "fix" this by walking back.
- **The gate is on the request.** `useDayTravel` is handed no stops when the claim is denied and no
  fix backs it, so there is one boolean and the estimate, the tile and the horizon row cannot
  disagree — and a leg nobody may be shown costs nothing against §D8.
- **`באיחור` is now sayable, and the reason is cumulative.** Three withdrawals have to fail first
  (`בדרך`, a fix on the leg, a claim that stands). If any of them is ever removed, §1's argument goes
  with it. `אתם באיחור` as a **sentence** is still refused, and a spec holds the tile's word out of
  the hero row.
- **⚠ The word alone was not enough, and that was reported within the hour.** _"15 what? Minutes?
  And what does this mean — that the event started 15 minutes ago or that we should've left?"_ The
  unit slot has always carried **either** the measure (`דקות`) **or** the referent (`ליציאה`), and
  `באיחור` carried neither, so the number floated against the board's default referent — the next
  event. The arm now spends a **second unit line** on all three parts, and two rules come with it:
  the measure word is `formatCountdown`'s own (a hardcoded `דק׳` labels `1:10` as minutes the first
  time a drive is an hour late), and the lines are **explicit** rather than a `max-width` and a hope.
- **The tile's shape is `BoardCountdown` now, named in `Board.tsx` and imported by `HeroLift`** —
  those two render two copies of the same markup, so a field added to one and not the other is how
  the collapsed board and the hero start disagreeing about one leave-by.
- **⚠ Two specs were passing for the wrong reason and the verb fix exposed them.** The delay gate's
  mocks returned a bare event where `moveEvent` parses a `{ event }` envelope, so `zod` threw, the
  verb swallowed it, and `applied` was hardcoded `true` — a spec asserting a successful apply against
  a response that fails in production. They also never pinned the clock, so the new past-target guard
  refused every fixture nudge; `frontend/CLAUDE.md`'s rule, and this is what it is for.
- **Ripple was never the problem and is fully built** — the backend returns a suggestion for an
  overlap and `DayView` renders it with yes/no. What refused the reported move was `MOVE_INTO_PAST`.
- **Deliberately not built:** re-anchoring the nudge to NOW so a late stop can be postponed at all.
  It is the strongest rejected option and it is blocked on ripple learning a **clearing** delta rather
  than the mover's own — backlogged, with the reasoning in ADR-0208's alternatives.
- **Measured at 360 against the real stylesheet:** `באיחור` ⁦30.50px⁩ / `מהיציאה` ⁦37.81px⁩ /
  `ליציאה` ⁦30.27px⁩ all fit one line in a ⁦48px⁩ content box — which is why the ambiguity was cheap
  and the fix is not. `דקות באיחור` is ⁦55.63px⁩ and `שעות באיחור` ⁦56.39px⁩, so the tile goes to
  ⁦81.63/82.39px⁩ wide and ⁦55→68px⁩ tall: **⁦6px⁩ of board height and ⁦7.6px⁩ of the `הבא בתור` title,
  in this arm only**, and nothing at all where the title already wraps (row ⁦86px⁩ either way). The
  one-line alternatives were rejected on the same numbers — `באיחור ליציאה` needs an ⁦89.56px⁩ tile
  and the full sentence ⁦107.73px⁩.

---

## M7 — The map polyline

**Kind:** implementation. **Branch:** `routes/m7-map` · **Conflict surface:** `MapPane.tsx`
(`DayConnector` only), `screens/map.css`, `constants.ts` (`MAP_CONNECTOR`), **and
`frontend/src/lib/travel.ts` + its spec** — widened 2026-08-25, see the box below. **Widened once
more while building, to `screens/Map.tsx`** — the reason is under _What the next session needs to
know_; `screens/map.css` turned out not to be needed at all (a MapLibre layer is painted from
TypeScript, not from a stylesheet).

> **⚠ Read this first: as carded before today, M7 could not draw anything.** M5's handoff found it
> and could not fix it — another card is not M5's to edit. `useDayTravel` deliberately **never asks
> for geometry**: a matrix returns none, so a drawable line is a call per leg, and ADR-0206 §D8 draws
> **one at a time**. M4's endpoint already carries `withShapes` and `TravelEstimate` already carries
> `shape`, so nothing new is needed on the wire — what is missing is the _ask_, and M5 was right that
> the shape of that ask is **M7's decision rather than M5's guess**. Hence the wider surface.
>
> **What to add, and keep it this small:** one two-stop request with `withShapes: true` for the
> **selected or next** leg only, cached and read back through the same key `useDayTravel` already
> uses — so the line and the day's numbers cannot disagree about a leg. It is an addition to
> `lib/travel.ts`, not a second data layer beside it (rule 8), and **not** a change to
> `useDayTravel`'s own request: that hook stays geometry-free, because widening it would put a
> per-leg call behind every day view and §D8 exists to prevent exactly that.
>
> **The tripwire if you get it wrong:** a day of N legs issuing N shape calls. One line drawn means
> one shape asked for.

Extend **`DayConnector`** — do not add a layer beside it, and do not adopt
`maplibre-gl-directions` (ADR-0205 §1). It already owns the source/layer ids, the style-reload
guard and the teardown; a route is one more geometry through the same effect.

Spends the treatment `DayConnector`'s own comment reserved: **solid + amber** for the selected or
next leg, dashed neutral for the rest (§D1, §D8).

> **⚠ "dashed neutral for the rest" means the DASH, not a straight line — this wording misled M7
> and cost a follow-up.** ADR-0206 §Z5 §M3 is the decision: _"every leg draws its REAL path; §D8
> rations the SOLID AMBER, not the truth of the line."_ Every leg is drawn along its route; exactly
> one of them is solid amber. A leg with no shape yet falls back to its straight segment (§D4), and
> that is the only straight line left. See §AB5.</br>
> The rule that would have caught it is already in root `CLAUDE.md`: **if the board and an ADR
> disagree about a decision, the ADR wins and the board is stale.**

**The two traps already documented in that file**, both of which will bite again: the style is torn
down and rebuilt by a theme swap, so _"already added" has to be asked rather than remembered_; and a
layer cannot be added before the style exists. Both guards exist — extend them, do not re-derive
them.

**Exit criteria:** the line survives a theme flip and a day change; exactly one solid line renders at
360px in both themes; no layer or source leaks on unmount (assert via `getLayer` after teardown);
`MapPane`'s existing tests stay green.

**What the next session needs to know:**

- **The surface needed `screens/Map.tsx` and the card could not have avoided it.** The shape ask is
  a hook (`useLegShape`) and it needs a `tripId` and a selection; `MapPane` is presentational by
  ADR-0096's `ui/domain` rule — _"every pin arrives as PRIMITIVES"_ — so the container is the only
  place that can call it. What landed there is small and is the whole of it: one memo that picks the
  leg, one hook call, one prop. **`DayConnector` was extended, not duplicated**, and the ids, the
  style-reload guard and the teardown are the ones that were already there.
- **`useLegShape({ tripId, leg, mode? })` → `readonly LatLng[] | null` is the whole new surface of
  `lib/travel.ts`.** One two-stop `withShapes` request, read back through the same `routeLegKey` and
  the same Dexie table `useDayTravel` uses. `useDayTravel` is **unchanged** and still geometry-free.
  `null` is ordinary, exactly as it is there.
- **Four decisions the ADR did not carry are now in it, as [ADR-0206 §AB](../decisions/0206-a-travel-time-belongs-between-two-points.md#ab-amendment-2026-08-25--what-m7-settled-by-drawing-the-line).**
  Read it before M8 touches the mode control: **§AB3 is M8's** — one line drawn buys one mode's
  geometry today, and §Z5 §M5's request-free mode switch is finished by widening `modes: [mode]` to
  the modes the gate admits for that leg. §AB1 (the route draws in Trip mode too, unlike the dashed
  connector) and §AB2 (the leg is the one arriving AT the stop you asked about) are the two a
  reader would otherwise have to reverse-engineer from the code.
- **⚠ Do not "fix" the shape being overwritten by the day's matrix with a read-modify-write.** It
  was built, and it broke M5's `does not re-ask a day it already answered in full` spec
  intermittently: reading before writing lands the write one IndexedDB transaction later than the
  next mount's read, so the day comes up empty and never re-reads. `cacheTravelEstimates` stays a
  plain `bulkPut`; `useLegShape` holds the line from the other side by recording only a leg that
  answered with **nothing** as unaskable. §AB4 has the full account.
- **`connectorLayer()` in `MapPane.test.tsx` used to find the first `type: 'line'` layer.** There
  are two now, so it — and its new sibling `routeLayer()` — look up by **id**. A third geometry
  should do the same rather than reintroduce the type search.
- **`travel.test.ts` registers no auto-cleanup**, so every `renderHook` there must be unmounted: a
  hook left mounted keeps its effects and its in-flight promises alive inside the next test, which
  is how a warming leg was seen re-asking before its timer had moved.
- **Not done, and not M7's:** the mode chips on the map's `SnapSheet` (§Z5 §M5) are M8's, and the
  `בדרך` verb turning the drawn leg teal (§Z5 §M4) waits on that verb becoming state.

**Follow-up ([#707](https://github.com/assafmanor/waypoint/pull/707)), from two owner reports on the
merged milestone — read this before M8:**

- **The line was drawn for PEDESTRIANS on every trip**, because `useLegShape`'s `mode` was optional
  with a `walking` default and nothing else in the frontend ever named a mode. That reaches Valhalla
  as `pedestrian` costing, so a leg the trip drives came back routed through alleys and parks. The
  owner reported it from a route they knew. **It does follow real roads** — Valhalla `/route`,
  per-mode costing, precision 6 carried on the record — so the defect was never the geometry, it was
  the mode we asked for. §Z2's derivation is built (`derivedTravelMode`) and **`mode` is now
  required**, so the next caller cannot fall into a default.
- **Plan mode drew nothing unless you tapped a pin.** `nextStopId` is Trip-mode only, so the
  `selected → next` rule had no second arm to fall back on there. It is now `selected → next →
the day's first leg` (§AB2, amended).
- **Every leg now draws its REAL path, and the routed lines REPLACED the straight dashes** (§Z5
  §M3, reported by the owner: _"they should replace all straight dashed lines between stops"_). M7
  drew one real path and left the rest straight, having read §M3 as aspirational — it is not. The
  dash's meaning moves with it: from ADR-0121 §10's _"this is the order, not the route"_ to _"this
  leg is not the one you are looking at"_. §AB5 has the reasoning.
- **`useLegShape` is gone; `useDayShapes` replaced it** — one request for the whole day's geometry
  in one mode. **The card's tripwire still holds on its own terms**: `routableLegs` pairs stops
  consecutively, so N stops is N-1 legs in ONE batch from this device; the per-leg `/route` calls
  are the server's, paced at `SHAPE_CALLS_PER_PASS` and cached. It is deliberately **separate from
  `useDayTravel`**, which stays geometry-free because the day LIST draws nothing.
- **⚠ Still open and genuinely M8's:** a `train`/`transit` booking's two ends are a leg like any
  other, so they draw a road route whenever the pair is inside the mode's ceiling. §AA4's
  declaration is the designed answer; whether it also suppresses the POLYLINE is undecided. The M8
  card carries this.

---

## M7b — The lines read as a route (design)

**Kind:** design session **+ the build**, both in one PR on the owner's approval. **Mockup:**
[`mockups/the-days-lines-read-as-a-route-v1.html`](../../mockups/the-days-lines-read-as-a-route-v1.html) ·
**Decides:** [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) **§AC** ·
**Note:** [2026-08-25](2026-08-25-the-days-lines-read-as-a-route.md).

Four reports off the shipped canvas, after the owner ran M7 on a real trip. Mocked up first, as the
owner asked, then approved and built in the same PR.

**What §AC settled, and the two that are deletions:**

- **§AC1 — Plan mode spends no amber.** §AB2's third arm (`→ the day's first leg`) is **deleted**;
  §D8's "selected or next" stands as written. The arm existed only because Plan drew nothing, and
  §AB5 removed that reason in the same PR. **The general lesson, because it will recur: a fallback
  that exists to stop a surface being empty must be re-examined the moment something else fills it.**
- **§AC2 — a selected stop** marks the leg **arriving** at it in amber (§AB2's own choice, so the two
  cannot disagree), the departing leg by weight, everything else at `line-opacity` 0.45. Two amber
  legs was drawn and rejected: 2× §D8's ration, and it reads as a highlighted route rather than a
  marked stop.
- **§AC3 — a leg ends in a solid DOT**, and the ⚠ for whoever builds it: **the obvious answer does
  not work.** A "collar" (a plain gap before the pin) is invisible on a line that is already made of
  gaps — the shipped dash is 5px on / 5px off, so a 9px collar is 1.8× a gap the eye discards. It is
  drawn in the mockup beside the measurement that kills it so nobody re-proposes it. **Cost: a third
  source/layer pair in `DayConnector`** (a `circle` layer over the trimmed endpoints).
- **§AC4 — no leg numbering.** ADR-0121 §6 already put the order on the pins, for the same reason.
- **§AC5 — an off-network stop gets an approach stub**, not a stitch: the router snaps every endpoint
  to the nearest edge, so the gap is permanent rather than a defect. Stitching straight to the pin
  claims a path nobody walks. **One stub per STOP, never one per leg end** — drawn per end it appears twice at an interior stop and meets in a V, which is a double claim rather than a busy
  picture, since a stop meets the network in one place. It runs to the **arriving** leg's endpoint
  (§AB2's own choice), falling back to the departing leg only for the day's first stop.

**What the build learned, and §AC6 records:** the collar is a **screen** distance, so the drawn
geometry is a function of the camera — `DayConnector` projects, trims in pixels, unprojects, and
re-derives on `zoomend` (never `zoom`, which would churn every frame of a pinch). It is **2 sources
and 4 layers**, not the one pair §AC3 predicted: the three line treatments share one source and split
by `filter`, and only the dots need a point source of their own. `connector` and `route`
**consolidated** into one `MapDayLeg[]`, because two props describing one set of lines can disagree
about which leg is which.

**Still a feel call, still unspent:** the stub threshold (⁦16px⁩) and the dot radius (⁦3⁩ / ⁦3.4⁩) ship as
the mockup's defaults and want a device pass.

**What the next session needs to know:** the mockup's own two render findings are traps for any map
mockup, not just this one. **A map canvas is the one surface in this RTL app that is not RTL** — pins
placed with `inset-inline-start` land mirrored against an SVG whose `x` is measured from the left,
which is why no pin sat on its own route in the first render (`map-split-v2.html` has the same
mirroring, harmless because its connector is decorative). And **`§` is Bidi-neutral**, so `§D8`
renders `D8§` inside Hebrew — already recorded in §Z5 from the first routes mockup, and it still
reached this one.

---

## M7c — The day's bookends

**Kind:** implementation, in [#709](https://github.com/assafmanor/waypoint/pull/709) at the owner's
instruction. **Decides:** [ADR-0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md)
(2026-08-25 amendment) · [ADR-0182](../decisions/0182-a-day-is-a-sequence-you-can-step-through.md) §3
(amended) · [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) **§AD** ·
**Note:** [2026-08-25](2026-08-25-the-day-starts-and-ends-where-you-sleep.md).

Owner, off M7b's canvas: _"Now that we have real paths, I'm starting to feel the absence of some
stops from the day schedule (the numbered stops), mostly the hotels … you can infer for certain that
you're gonna start the day in a hotel and end in a hotel."_

**What it changes, and it is two independent gaps rather than one:**

- **A stay bookends the day.** A `countsNights` ambient span joins `buildDayStopSequence` as its
  first stop when it covered last night and its last when it covers tonight — so a check-in day ends
  there, a check-out day begins there, and a strictly middle night is **both**. A middle night was
  invisible for a reason no re-sorting could have reached: it is `prominence: 'ambient'` with no edge
  and no clock, so it never entered the sequence at all.
- **A soft-timed booking sorts at its own instant again.** The sequence's sort asks `moment.at`
  rather than `knowsMoment`, sinking only the genuinely clockless. That is ADR-0182 §3's 2026-08-11
  unification **reversed for this one sequence** and left standing for the list — the owner's second
  class, _"car rentals etc. that are from time X or until Y"_, which the sink had been drawing
  nowhere at all.

**The crux, and it was not in either derivation:** `screens/Map.tsx` filtered `pin.order != null`, so
the **visible number** was the gate on the polyline, on `mapsDayRouteUrl` and on the card's
traversal. It reads `dayStops` now — the same derivation one step earlier, where a stop holds a
position whether or not it can defend a number.

### M7c's field reports — two fixes off the shipped canvas

**Both are M7c's, not milestones of their own**, and both amended
[ADR-0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md) in place. Recorded here
because a fix that changed a documented decision and left no mark on the tracker is the failure this
board exists to prevent — and because the second one **replaced** the first one's rule rather than
adding to it, which is only legible if both are on the page.

**[#710](https://github.com/assafmanor/waypoint/pull/710) — the ordering caveat, and the map says
which end of the day the hotel was.** Note:
[2026-08-26](2026-08-26-which-end-of-the-day-the-hotel-was.md). Two things in one PR.

A `first` bookend was pinned to position 0 unconditionally, which is wrong on the night you check in
at 02:00 and out that morning: the midnight car pick-up that brought you there sorted after the
hotel. The rule written for it was _nothing whose instant precedes the stay's own check-in sorts
after it_ — an instant comparison, so no dawn cut-off and no zone. **That rule is gone; see #711
below.** It is left on the page rather than edited out because the sentence was fine and the input
was not, which is the transferable half.

And the pin now says which end of the day it was. Three things were swallowing a word that already
existed, and the loudest was a **zoom rule asking about the pane when the question was about the
pin** — the neutral tag dropped under `[data-pins='dot']` in every scope,
but in day scope only `.aside` degrades — so a full-size stop below ⁦zoom 11⁩ (a ~⁦30km⁩ span) kept its
size and lost its word. Deleted, not rescoped: the corrected rule is inert. Beyond that, a stay is
now exempt from ADR-0141's `behind` silence (its word says which END of the day this was, which the
afternoon does not falsify) and a middle night, which carries no edge to name, says `לינת לילה`.
**No mockup needed and that was the owner's call** — a word in an existing slot spends no new axis,
where a mark would have spent one on a ladder §AC3 already records as full. Numbering was rejected
for the reason that turned out diagnostic: a number is an ordinal and one pin cannot wear two, while
"both ends of the day" is a single coherent state.

**[#711](https://github.com/assafmanor/waypoint/pull/711) — a floor is not an arrival, so the night
sorts before the bed.** Same note, second round. #710's rule **moved nothing on the day it was
written for**: `startsAt` on a lodging span is a **floor** — the hour the room opens, which
[ADR-0171](../decisions/0171-a-time-can-be-a-floor-or-a-ceiling.md) §10b exists to say is not a
moment — and it was used as one. The room was available from 15:00 the previous afternoon while the
owner was still in the air until 23:20, so every stop of the day fell after it. The replacement asks
**two** questions, and either alone answers a different day wrongly: a **floor** before dawn sorts
before the stay, a **known** moment (a 06:30 flight) never does. Dawn is `dayWindowMs`'s own 07:00
boundary, resolved by the screen and handed in as an instant, and lifted out of `Home.tsx` so the
glance's rail and the day's route cannot disagree about where dawn is (root rule 8).

**The transferable finding, and it is a testing one:** the specs shipped green through all of it. The
fixture carried a 02:00 check-in **because that is what the rule was reasoning about** — a fixture
built from the rule proves the rule — and the spec covering the owner's actual shape existed and
asserted `moves NOTHING`. **Before writing the fixture, take the shape from the report.**

**Three owner answers this card is built on**, all put as forks before any code:

| asked                             | answered                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| what does a bookend get?          | **sequence + route, no number**                                                                                                           |
| does the day timeline grow a row? | **sequence only, no new rows**                                                                                                            |
| which other class did you mean?   | **soft-timed bookings** (a car hire "from X"/"until Y"), not flights — which are `exact` at both ends and were already numbered and drawn |

**Cost:** two files, ~⁦60⁩ lines of derivation. The leg count grows by up to two per day and it is
still **one** `withShapes` request (§Z5 §M3) — `routableLegs` pairs consecutively, so a longer stop
list is a longer request, not more of them. A day whose only stops are one stay's two ends collapses
to a single stop and asks for nothing.

**One spec changed sides rather than being deleted**, the shape this branch has now used three times:
`gives a ceiling no number once it can ask what the time means` asserted the check-out sinking to the
day's tail — its third answer, after "sorted at 11:00 between two flights". It now asserts the hotel
leading the day, with the `order` column untouched.

---

## M8 — Mode per leg + trip default

**Kind:** implementation. **Branch:** `routes/m8-mode` · **Conflict surface:** `schema.prisma` + a
migration (**for the per-leg override only** — the default is derived, §Z2), ~~`packages/shared`
(the inference)~~, trip settings, the day/hero controls, `he.ts`.

> **⚠ The inference already shipped, in M7's follow-up ([#707](https://github.com/assafmanor/waypoint/pull/707)).**
> `derivedTravelMode(bookings)` is in `packages/shared/src/routing.ts` with its specs — M7 drew its
> first lines with a hardcoded `walking`, the owner reported the pedestrian route it produced, and
> a wrong line on the canvas could not wait for this milestone. **What is left for M8 is what §Z2
> always said was the persisted half:** the per-leg override (the column, the migration, the
> control) — plus §AA4's declared תחב״צ, which rides the same column. The derivation is per TRIP,
> so the two cases it deliberately gets wrong are exactly the ones the override exists for: a hire
> held for part of a longer trip, and a single walk inside a driving trip.
>
> **And the second half of the same report is still open**, because it is genuinely M8's: a
> `train` or `transit` booking's own two ends are drawn as a road route between them whenever the
> pair is under the mode's ceiling (Senso-ji → Tokyo Station is 4.6 km, well inside walking's
> 15 km — §Z5's own "73 min walking against 25 by train" example, now on the canvas as a line).
> §AA4's declaration is the designed answer and it suppresses the estimate; **decide whether it
> suppresses the polyline too**, and say so on the card before coding.

ADR-0206 **§V1.6 as amended by §Z2** — M0 answered this, so it is no longer open:

- **The default is DERIVED from the trip's bookings, not stored.** A car hire (ADR-0162) makes it a
  driving trip. This is ADR-0018/0027's rule applying cleanly — the only thing persisted is a
  per-leg override, and only when someone sets one. **Do not add a `defaultTravelMode` column.**
- **The switch must be instant**, which is M4's job, not this card's: every gate-admitted mode is
  already fetched and cached (§Y2), so switching is a cache read with no request. If a switch here
  triggers a fetch, M4 is wrong, not M8.
- **FOUR entries now, not three** — the owner reversed this on 2026-08-25 (**ADR-0206 §AA4**, and
  §D9 is amended for it). Walk, drive, cycle **and תחב״צ**. The transit entry is a stored mode value
  with **no provider**: it rides this card's own per-leg override, `TRAVEL_GATE` never sees it, and
  **no request is ever made**. It **suppresses the duration and keeps the distance** — the point is
  silence where the app would otherwise show a walking number for a journey nobody will walk. Never
  inferred; only a person sets it. **Read §AA4 before building it, and extend the v2 mockup first**
  — the mark, the suppressed-duration row and the "no estimate" copy were never drawn.
- **The three modes get real icons** (§AA3): `ui/Icon.tsx` gains walk, car and bicycle. ADR-0138 §4's
  "icons are UI" is the grammar, and its rule that a glyph carries a content rule applies — draw
  them at 24px before coding. The תחב״צ entry needs a fourth, or a deliberate reason to stay a word.

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
