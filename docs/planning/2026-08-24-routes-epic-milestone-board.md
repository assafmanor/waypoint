# Routes & travel time — the milestone board

**Date opened:** 2026-08-24
**Status:** **M0 open — the epic is blocked on owner answers.** Nothing is built.
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

| M       | milestone                   | kind   | status | depends on   | ⇉ safe with  | branch / PR | updated    |
| ------- | --------------------------- | ------ | ------ | ------------ | ------------ | ----------- | ---------- |
| **M0**  | Product decisions           | owner  | ⬜     | —            | —            | —           | 2026-08-24 |
| **M1**  | Measure the parameters      | spike  | ⬜     | M0           | M2, M3       | —           | —          |
| **M2**  | Shared derivations          | impl   | ⬜     | M0           | M1, M3       | —           | —          |
| **M3**  | Design session + mockups    | design | ⬜     | M0           | M1, M2       | —           | —          |
| **M4**  | Backend routing module      | impl   | ⬜     | M1, M2       | M3           | —           | —          |
| **M5**  | Frontend data layer         | impl   | ⬜     | M2, M4       | M3, M10      | —           | —          |
| **M6a** | The day reads               | impl   | ⬜     | M3, M5       | M6b, M7, M9  | —           | —          |
| **M6b** | The hero read               | impl   | ⬜     | M3, M5       | M6a, M7, M9  | —           | —          |
| **M7**  | The map polyline            | impl   | ⬜     | M3, M5       | M6a, M6b, M9 | —           | —          |
| **M8**  | Mode per leg + trip default | impl   | ⬜     | M6a, M6b, M7 | M10          | —           | —          |
| **M9**  | Plan-mode feasibility       | impl   | ⬜     | M5           | M6a, M6b, M7 | —           | —          |
| **M10** | Offline route pack          | impl   | ⬜     | M4           | M5–M9        | —           | —          |
| **M11** | Day travel total            | impl   | ⬜     | M6a          | M8, M10      | —           | —          |
| **M12** | Harden, observe, document   | impl   | ⬜     | all          | —            | —           | —          |

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

## M0 — Product decisions

**Kind:** owner · no code, no branch. **Blocks the entire epic.**

Four questions. ADR-0205 and ADR-0206 are `Proposed` until they are answered; M0 closes by
recording the answers here and flipping both to `Accepted`.

1. **Is V1 without transit acceptable?** Senso-ji→Tokyo Station is 73 min walking and 25 min by
   train. ADR-0206 §D9 says we stay silent about transit rather than half-promise it. _If the answer
   is no, V2's transit line becomes M1 and the epic is a much larger one._
2. **Does a community server belong on the critical path?** FOSSGIS Valhalla is free, fair-use and
   run by volunteers — behind our proxy and our cache, but on the path the first time. The
   alternative is operating Valhalla ourselves from the start (a Railway service, a volume, a
   per-region graph build).
3. **Does the collapsed board carry an urgent leave-by, or only the horizon?** ADR-0206 §M1
   recommends the horizon alone. This is the one that most changes the design session.
4. **Is a per-trip default travel mode right**, or should it be per-day, or inferred from the trip's
   transport bookings? (A trip with a car hire is a driving trip; ADR-0162 already knows that.)

**Answers:** _(record here)_

---

## M1 — Measure the parameters

**Kind:** spike. **Branch:** `routes/m1-measure` · **Conflict surface:** `docs/` only (an ADR-0205
amendment) + throwaway scripts in the scratchpad. **Produces numbers, not features.**

ADR-0205 deliberately left four numbers unpicked. Pick them by measuring against **real trip data
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

**What the next session needs to know:** _(fill in)_

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

**What the next session needs to know:** _(fill in)_

---

## M3 — Design session + mockups

**Kind:** design. **Branch:** `routes/m3-design` · **Conflict surface:** `mockups/**`, `docs/design/mockups.md`, `docs/planning/**`.
**Invoke the `design-mockups` skill** (ADR-0175). RTL, phone-first, both themes, 390×844 **and** 360×640.

Draw and **measure** the five things in ADR-0206 §M — 1) where an urgent leave-by lives, 2) the gap
slot carrying three meanings, 3) solid amber against ADR-0125's ground and ADR-0123's pin hues, 4) the late-risk mark reading as status not as a second live mark, 5) the mode control at three
entries.

Two rules that are not negotiable in the drawing: **root rule 4** — no new hue, amber is the travel
time and `--miss` is the risk — and **ADR-0206 §D8**, one solid line at a time, which this session
either confirms by measurement or overturns with one.

**Exit criteria:** mockup(s) in `mockups/` with a catalogue entry in `docs/design/mockups.md`
(ADR-0097); every measurement read from the live DOM and written into ADR-0206 as an amendment;
owner sign-off recorded here. **M6a/M6b/M7 do not start before this closes.**

**What the next session needs to know:** _(fill in)_

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
- **The endpoint is batch-shaped**, carrying a day's ordered stops. One matrix call, not five.
- **The gate runs server-side, before the network.** One out-of-range pair returns 400 for the
  _whole_ matrix — measured. The client must never be able to cause that.

**Exit criteria:** a cold day matrix answers and is cached; a second call hits the cache with no
outbound request (asserted in a spec, not observed by hand); the gate rejects a cross-cluster pair
without calling out; the kill switch stops every outbound call while the endpoint still answers
from cache; `X-Client-Id` is sent; migration applies clean.

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

**M6b** · branch `routes/m6b-hero` · surface: the hero horizon components, `i18n/he.ts`,
`screens/home.css`. Ships **§V1.2** — `~23 דק׳ · צאו ב־18:37` — **between** two points, per §D2, and
answers the third of the app's three questions for the first time.

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
migration, `packages/shared` (the trip shape), trip settings, the day/hero controls, `he.ts`.

ADR-0206 **§V1.6**. A leg-level mode defaulted by the trip — and **three entries, not four**: no
transit control at all (§D9). Whether the default is per-trip, per-day or inferred from the trip's
transport bookings is **M0 question 4**; do not guess it here.

**Exit criteria:** switching mode changes every read on the surface at once (they must not disagree);
the default survives a reload and an offline session; a driving leg crossing clusters resolves while
the walking one falls back, and that reads as intended rather than broken.

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
