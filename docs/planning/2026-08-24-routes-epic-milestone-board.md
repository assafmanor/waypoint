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

| M       | milestone                   | kind   | status | depends on   | ⇉ safe with  | branch / PR                                                                                     | updated    |
| ------- | --------------------------- | ------ | ------ | ------------ | ------------ | ----------------------------------------------------------------------------------------------- | ---------- |
| **M0**  | Product decisions           | owner  | ⬜     | —            | —            | —                                                                                               | 2026-08-24 |
| **M1**  | Measure the parameters      | spike  | ⬜     | M0           | M2, M3       | —                                                                                               | —          |
| **M2**  | Shared derivations          | impl   | ⬜     | M0           | M1, M3       | —                                                                                               | —          |
| **M3**  | Design session + mockups    | design | 🔵     | M0           | M1, M2       | `claude/routes-epic-m3-design-kagqpq` · [#696](https://github.com/assafmanor/waypoint/pull/696) | 2026-08-25 |
| **M4**  | Backend routing module      | impl   | ⬜     | M1, M2       | M3           | —                                                                                               | —          |
| **M5**  | Frontend data layer         | impl   | ⬜     | M2, M4       | M3, M10      | —                                                                                               | —          |
| **M6a** | The day reads               | impl   | ⬜     | M3, M5       | M6b, M7, M9  | —                                                                                               | —          |
| **M6b** | The hero read               | impl   | ⬜     | M3, M5       | M6a, M7, M9  | —                                                                                               | —          |
| **M7**  | The map polyline            | impl   | ⬜     | M3, M5       | M6a, M6b, M9 | —                                                                                               | —          |
| **M8**  | Mode per leg + trip default | impl   | ⬜     | M6a, M6b, M7 | M10          | —                                                                                               | —          |
| **M9**  | Plan-mode feasibility       | impl   | ⬜     | M5           | M6a, M6b, M7 | —                                                                                               | —          |
| **M10** | Offline route pack          | impl   | ⬜     | M4           | M5–M9        | —                                                                                               | —          |
| **M11** | Day travel total            | impl   | ⬜     | M6a          | M8, M10      | —                                                                                               | —          |
| **M12** | Harden, observe, document   | impl   | ⬜     | all          | —            | —                                                                                               | —          |

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

**Kind:** spike. **Branch:** `routes/m1-measure` · **Conflict surface:** `docs/` only (an ADR-0205
amendment) + throwaway scripts in the scratchpad. **Produces numbers, not features.**

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

**Drawn and measured** in [`mockups/a-travel-time-between-two-points-v1.html`](../../mockups/a-travel-time-between-two-points-v1.html)
(catalogued; both themes, 390×844 and 360×640, every number read from the live DOM). The
session note is [2026-08-25 — the board counts to the leaving](2026-08-25-the-board-counts-to-the-leaving.md).

- **The five §M answers, in one line each.** M1: the board's countdown swaps its **unit**
  (`55 · דקות` → `10 · ליציאה` → `7 · באיחור`), threshold **30 minutes of time-to-leave**.
  M2: the travel is a **run inside `.day-gap`'s existing label**, and it **ignores
  `GAP_MIN_MINUTES`**. M3: solid amber, but **a per-theme pair** — see the defect below.
  M4: ink and word only, `--miss-deep` on paper and the board's `.tlabel.missed` recipe on the
  board. M5: **three word chips in `ToggleChip`**, on the selected/next leg only.
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
- **⚠ Scope note, per the protocol's "say so on the PR":** the exit criterion asking for the
  measurements as an **ADR-0206 amendment** could not be met from this milestone — `docs/decisions/`
  is outside M3's declared conflict surface and M1/M2 were running in parallel. The amendment is
  written **verbatim and ready to paste** as §7 of the session note (a `§Z5` block). Whoever holds
  `docs/decisions/` next — the first of M1/M2/M4 to land, or a docs-only follow-up — should paste
  it in unchanged and prune this bullet. **Owner sign-off is also still open** (the three questions
  in the note's §6), so this row stays 🔵 rather than ✅.

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
