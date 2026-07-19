# Product Design Review

**Status:** ADVISORY (2026-07-19). A principal-level product-design + product-architecture review. **No production code or product docs were modified** by this review — it is a review artifact only. It deliberately does **not** repeat the three existing reviews (`backend-architecture-review.md`, `frontend-architecture-review.md`, `ui-ux-review.md`); where it touches the same ground (Map, change-feed, sync status) it re-frames the issue at the **product-model / thesis / scope** level and adds the product rule, the infrastructure-alignment, and the roadmap those reviews leave to a product call.

> **Reading note on prior-review status.** The backend review (2026-07-18) predates several fixes now merged. Per `docs/backlog.md`, **B-01–B-13 have shipped** (ADR-0068–0076) and **B-07 shipped** (ADR-0067). This review treats those as resolved and does not re-raise them. Findings below are product-design findings, not code findings.

---

## 1. Executive summary

**Overall product coherence — strong at the core, hollow at the edges.** Waypoint has an unusually disciplined product spine: one load-bearing primitive (hard/soft events, ADR-0011), a derive-don't-store philosophy that keeps state honest (no stored `now`, derived phases, the category time-behaviour profile — ADR-0018/0027/0063), a real-data-only Home that refuses to fake capability (ADR-0045), and a genuinely good offline/sync architecture (client-generated ids, device-wide outbox flush, sign-out teardown, commit-consistent cursor). The documentation culture (76 ADRs, 40 planning notes) is a real asset. Three of the four surfaces (Home, Index, Day-by-day) are built for both modes and are coherent.

**But the product's signature promise is only half-built.** The thesis question — *"what now, what next, and what do I need in the next 30 minutes?"* — has a **temporal half** (built and good) and a **spatial half** (where is it, when do I leave, how do I get there) that is **entirely unbuilt**: the Map tab is a dead placeholder in a primary nav slot, `navigate`/`on-my-way` are toast stubs, no place data is authored (the Places picker is deferred), and calendar sync is stubbed (a toggle that reads nowhere). The collaboration layer ships the sync engine but not the **awareness** it promises (no change-feed, no per-item save confidence). And the "practical layer" pillar has quietly collapsed to WiFi-only.

**Strength of the central thesis:** high and genuinely differentiated *as a concept* — "the live layer during the trip, not the planner before it" is a real wedge. **Consistency of expression:** high in docs, **partial in the build** — the wedge's spatial + awareness dimensions are missing.

**Current v1 focus:** the team has recently invested heavily (sessions 32–40; ADR-0054/0059/0063) in **booking-presentation polish** on the Home hero — refining a well-understood entity — while the thesis-critical spatial and awareness layers stayed unbuilt. This is a scope-sequencing inversion relative to the stated v1 proof ("one real group, one real trip").

**Implementation alignment:** the built product is *narrower* than every product doc claims. `data-model.md` is stale; the PRD/personas/feature-catalog still promise Gmail import, weather/FX, currency, emergency numbers, and calendar sync that are cut or unbuilt.

### Top three user risks
1. **On the ground, the app can't answer "where do we go / when do we leave."** Navigator and go-with-the-flow personas have no live spatial answer; the signature "nearest ATM" scenario is impossible.
2. **A traveler can't tell whether their change reached the group, or see the group's changes.** No per-item sync confidence, no change-feed — the exact failure Waypoint exists to beat (scattering across WhatsApp).
3. **"Encrypted offline documents" over-promises for the reframed audience.** Server-side-at-rest only; the operator can read passports (ADR-0034), a basis ADR-0065's multi-tenant reframe explicitly weakens.

### Top three product-model risks
1. **The "deviate safely" loop is incomplete** — `do-it-now` (the centerpiece of ADR-0027's slip recovery) is unimplemented; `swap` is skip-then-prompt, not a swap.
2. **The editability rule surface is approaching a maintainability ceiling** — mode × tier × day-scope × trip-phase, spread across prose in many ADRs, with no single product-rule catalog.
3. **Sources of truth have drifted** — the living docs no longer describe the built product, violating the founding "docs describe current state" principle.

### Top three infrastructure-alignment risks
1. **The spatial layer needs real place data** (`Place` enrichment, a Places picker, Maps deep-links) — none of which exists; the `Place` registry is name-only.
2. **The awareness layer needs a WS-fed change buffer + a sync-status model** — the substrate (`Change` records, real attribution) exists but is unconsumed by the UI.
3. **Calendar sync needs an incremental-consent path + a calendar module** — neither exists; the scope isn't even requested at sign-in.

### Strongest product decisions (preserve)
Hard/soft as the single primitive; derive-don't-store (phases, `now`, category profile); real-data-only Home; integrations-as-pipes; the offline architecture; minimal 3-input trip creation; the Booking↔Event 1:1 + place-authority ownership model.

### Production-readiness assessment
**Not yet ready for the "one real trip" proof as currently scoped** — not because the built parts are weak (they're strong), but because the trip-mode journey has two load-bearing gaps (spatial answer; group awareness) and one over-promise (documents). It is close: the missing pieces are mostly *product decisions + moderate builds on an existing substrate*, not rewrites.

### Recommended product focus for the next milestone
**Close the trip-mode trust loop before adding anything.** (1) Ship the *minimum* spatial answer — place authoring + a Maps deep-link `navigate` — not the full Map research surface. (2) Ship group awareness — a change-feed + per-item sync status. (3) Complete the deviate-safely verbs (`do-it-now`, real `swap`). (4) Make the document promise honest. (5) Freeze booking-presentation polish and re-sequence the docs to match reality. Everything else (full Map research, Gmail, calendar, weather) is deferrable without weakening the proof.

---

## 2. Scope and methodology

**Documentation reviewed (read in full):** `CLAUDE.md`, `README.md`, `docs/INDEX.md`, `product/vision.md`, `product/modes.md`, `product/prd-v1.md`, `product/feature-catalog.md`, `product/personas.md`, `architecture/overview.md`, `architecture/data-model.md`, `architecture/collaboration-model.md`, `architecture/sync-and-offline.md`, `architecture/api-contract.md`, `architecture/app-shell.md`, `architecture/auth-and-google.md`, `architecture/tech-stack.md`, `integrations/overview.md`, `backlog.md`, and `design/design-language.md` (mode-identity / practical-layer sections).

**ADRs reviewed in depth:** 0011 (hard/soft), 0016/0025/0029/0040 (modes + tiers + day-scope + access window), 0027 (soft lifecycle / slip / shelf), 0044 (settling a finished trip), 0045 (real-data Home), 0059/0063 (booking presentation + category time-profile), 0065 (app scope reframe), plus the domain/sync/auth ADRs summarized via the INDEX router (0018/0019/0022/0038/0047/0048/0051/0054/0067).

**Code inspected (via three inventory sub-agents, cited throughout):** `backend/prisma/schema.prisma` + all NestJS modules/controllers/services + migrations + specs; `frontend/src` routing, the four surfaces, mode system, offline/sync stack, quick-action wiring, practical layer, tests; `packages/shared` entities + schemas + DTOs.

**Flows traced:** trip create → invite → join; pre-trip prep; booking + document entry; trip-mode arrival (mode derivation); Now/Next derivation; slip/recovery; maybe→schedule; offline write → flush → conflict; document offline read; membership removal; multi-trip switching; finished-trip settle.

**Product assumptions tested:** the two-mode model; the four-surface model; hard/soft sufficiency; the offline contract; the collaboration awareness claim; the practical-layer pillar; the thesis wedge's spatial half.

**Infrastructure behavior verified** (by reading code, not running it): sync atomicity + advisory lock + broadcast-after-commit; snapshot/catch-up; socket eviction on removal; outbox + Dexie mirror + blob cache; verb wiring; which integrations are stubbed vs absent.

**Areas that could NOT be verified (inferred, flagged as such):** runtime behavior was not exercised in a browser or against a live server; timezone/DST edge behavior is read from code + ADRs, not observed on a real cross-timezone trip; real-user behavior (the actual point of v1) is unmeasured by definition. No claim below asserts observed runtime behavior where only code was read.

---

## 3. Sources-of-truth assessment

| Product area | Current source of truth | Status | Implementation status | Conflicting sources | Recommended authoritative source | Required documentation action |
|---|---|---|---|---|---|---|
| Vision / thesis | `product/vision.md` (ACCEPTED) | Sound | Temporal half built; spatial + practical halves unbuilt | Five pillars vs built product (Map, practical layer) | Keep vision.md; add a "built vs intended" honesty line | Note which pillars are v1 vs deferred |
| Modes | `product/modes.md` + ADR-0016/0025/0029/0040 | Sound | Implemented (derived, override, tiers, day-scope) | — | modes.md | None (accurate) |
| Navigation / surfaces | `app-shell.md` + feature-catalog | Sound for shell; **Map stale** | Home/Index/Days built; **Map placeholder** | Vision "Map as primary surface" vs reality | app-shell.md + a new surface-responsibility note | Mark Map as deferred in feature-catalog + vision |
| Trip lifecycle | ADR-0040/0044/0033/0024 | Sound but complex | Implemented incl. settle-editable archive | "read-only archive" (0040) vs "settle-editable" (0044) — reconciled but scattered | A single lifecycle state-machine doc | Consolidate the 3-case editability table into one place |
| Events (hard/soft, phases) | `data-model.md` + ADR-0011/0018/0027 | **Stale** | Implemented + richer than doc | `data-model.md` omits `category`, `EventCategory` | `packages/shared/entities.ts` + schema.prisma | Update data-model.md (add category, enums) |
| Bookings / places | ADR-0047/0048/0051 + schema | Sound | Implemented | data-model.md mostly current | schema.prisma + entities.ts | Minor sync |
| Documents | ADR-0015/0034/0052/0055/0058 | Sound | Implemented incl. offline blob cache | "encrypted" wording vs operator-trust model | ADR-0034 (trust) + ADR-0058 (sync) | Clarify the *guarantee* in user-facing terms |
| Collaboration | `collaboration-model.md` (PROPOSED) | **Partly aspirational** | Sync built; **change-feed + presence + sync-status not built** | PRD 4.2 "Noam moved ramen" vs reality | collaboration-model.md, once the feed ships | Mark change-feed/presence as unbuilt |
| Permissions / roles | ADR-0005/0039/0067 | Sound | Implemented (admin/peer, server-enforced, TripBlock) | feature-catalog "roles Must / matrix Won't" | ADR-0039/0067 | None |
| Offline behavior | `sync-and-offline.md` + ADR-0042/0055/0058/0066 | Sound | Implemented (strong) | overview.md "not offline: docs" vs now-cached | sync-and-offline.md | Update overview.md offline model (docs now cache) |
| Sync behavior | `sync-and-offline.md` + ADR-0019/0068 | Sound | Implemented + hardened | — | sync-and-offline.md | None |
| Integrations | `integrations/overview.md` (PROPOSED) | **Aspirational** | **Only Google *sign-in* built**; Maps/Calendar/Gmail/weather/FX absent | tech-stack "Currency/weather v1 Should" vs absent | integrations/overview.md, re-phased | Re-phase: Maps/Calendar are unbuilt, weather/FX cut |
| v1 scope | `prd-v1.md` (DRAFT) + feature-catalog (DRAFT) | **Drifted** | Narrower than documented | PRD/catalog vs built (Gmail, weather, emergency, calendar, Map) | This review's §13 → then a PRD refresh | Refresh PRD scope to match the honest v1 |

**Headline:** the two documents most people would treat as the product's contract — `prd-v1.md` and `product/feature-catalog.md` — are both still `DRAFT` and both describe a broader product than exists. `data-model.md` is stale. This is the single biggest *documentation-authority* problem and it violates the repo's own founding principle (ADR-0001: "docs describe the current state"). See **P-08**.

---

## 4. Product thesis assessment

**The primary user problem.** During a trip, a group's operational truth is scattered — confirmation codes in one person's email, the plan in WhatsApp scroll-back, addresses in screenshots, "when do we leave?" in nobody's head. Waypoint's claim is to be the *single live answer* to "what now / what next / what in 30 minutes," shared and offline-safe.

**The core promise.** One trusted, shared, offline-capable surface that (a) tells you the current + next thing and the free time between, (b) holds every booking/code/document, and (c) lets the group deviate safely without re-messaging.

**Differentiation — genuinely strong as a concept.** Against the alternatives:
- *Group chat / WhatsApp:* linear, not stateful; "what's the plan now" requires scrolling. Waypoint's stateful Now/Next is a real improvement — **if** it answers the whole question.
- *Google Maps lists / Calendar / Notes / screenshots:* store data, don't derive "now/next," aren't shared-stateful, don't distinguish commitments from intentions.
- *TripIt / itinerary planners:* planning-first; weak on the live, on-the-ground, deviate-safely job. This is precisely Waypoint's wedge.
- *Booking-provider apps:* one provider each; no unified index, no group.

**Reasons users would switch:** a *single* place that's true right now, works with no signal, and the whole group sees. **Reasons they'd fall back:** the moment Waypoint can't answer "where is it / when do we leave" (falls back to Maps) or "did everyone see my change?" (falls back to WhatsApp) — and both of those are exactly the unbuilt halves. **This is the crux: the wedge is real, but the current build leaks users back to the two tools it most needs to replace at the two moments it most needs to win.**

**Strength of Now/Next as the wedge:** strong *temporally* (the board, countdown, glance, hard-anchor readout are well-built and derived honestly). **Spatially incomplete** — "next 30 minutes" without "leave-by / navigate" is half an answer (see **P-01**).

**Role of planning:** correctly framed as the *means*, not the point (modes.md). The builder is rich. Risk: planning is data-entry-heavy and its highest-value output (a place you can navigate to) is blocked by the missing place layer.

**Role of collaboration:** claimed as core; currently a *silent* engine — it syncs but doesn't make the group *aware*. Awareness is what beats WhatsApp; without it, collaboration is table-stakes plumbing, not an advantage (see **P-03**).

**Role of offline:** both a requirement *and* a differentiator, and here the build genuinely delivers (index + documents + today, cached, with a real outbox). This is a true strength.

**Is the product narrow enough to prove?** The *documented* product is not (five pillars, many integrations). The *built* product is nearly the right narrow core — it just has the wrong two gaps open. Narrowing the docs to match, then closing those two gaps, yields a provable v1.

### Recommended product-position statement

> **Waypoint is the shared, offline-first "what now / what next" layer a small group leans on *during* a trip — the one place that always knows the current plan, the next commitment, where it is and when to leave, and every code and document, and that keeps the whole group on the same page without re-messaging.** It is not a trip planner, a social network, or a travel suite; planning exists only to make the live layer true, and every integration feeds the live layer or the index rather than owning a screen.

The clause **"where it is and when to leave"** is in the statement deliberately: it is the promise the current build does not yet keep, and it is not optional to the thesis.

---

## 5. Current product model

### Users
A trip is ~5 peers traveling together (ADR-0065: "~5" sizes one trip's group, never the app; the app serves many trips/users, invite-only, grow-later). Five archetypes (personas.md): Organizer, Navigator, Go-with-the-flow, Spontaneous, Worrier. **Coverage today skews to Organizer + Worrier** (prep, index, offline docs are built); **Navigator + Spontaneous are under-served** (Map/navigate + `do-it-now`/`swap` are the unbuilt/incomplete pieces).

### Jobs (condensed)
Before: create · invite · enter bookings/docs · organize days · collect ideas · see what's missing · ensure offline readiness. During: what now/next · when to leave · navigate · get a code/doc · see free time · change a soft plan · react to a delayed hard commitment · communicate a change · survive no-signal · trust a save. After: reference past bookings/docs · settle stragglers · understand why editing is locked · rename/delete.

### Modes
Two modes, **one surface, re-emphasized** (ADR-0016). **Derived** from trip dates + clock in the trip timezone (`lib/mode.ts` `tripPhase()`/`deriveMode()`), never stored. Manual override is **live-window-only, session-only, in-memory** (ADR-0040) — you can drop into Plan from a live trip, but Trip mode only exists while the trip is live. Mode = chrome + emphasis + capability gating, not different screens.

### Surfaces
🏠 Home · 🗺️ Map · 📇 Index · 📅 Day-by-day. **Home, Index, Day-by-day are built for both modes. Map is a placeholder.** Trip-settings is deliberately outside the tabs (header ⚙, ADR-0004/0039).

### Entities (implemented)
`Trip · Membership · Event · Booking · Place · Document · MaybeItem · Change · Invite · TripBlock · CalendarEventLink · User · AuthIdentity · Session`. Event is the sole time authority; Booking↔Event strict 1:1 optional (`Event.bookingId @unique`); location only via `Place` (no free-text `Event.location`); Change is the sync/undo/feed substrate.

### Important states
Event: `planned | done | skipped` (stored) × derived phase `upcoming | now | passed | slipped | unresolved | done | skipped`. Trip phase: `pre | live | past`. Booking presentation: derived `bracketed`/`ambient` × transition windows. Membership: `admin | peer`, plus `TripBlock` (removed). Sync: optimistic → pending (outbox) → synced | failed.

### Collaboration model
Shared: itinerary, index, documents, shelf, (intended) change-feed. Personal: Google connection, calendar target, offline cache, mode override, active-trip pick. Realtime = WS per active trip, in-process fan-out. Conflict = row-level server-authoritative LWW + client-local undo. **Change-feed + presence are specified but unbuilt.**

### Offline model (strong, built)
Whole-trip mirror in Dexie; trip-list + identity cached; documents in the snapshot + Cache-API blob cache; ordered outbox with client-generated ids, write-through to the read cache, device-wide FIFO flush on reconnect; server-only actions (create/join/invite) disabled offline; sign-out wipes all local data (ADR-0066).

### Permissions
Everyday soft-plan editing is open to all members. Governance (edit trip details, promote, remove, delete, rotate invite, unblock) is admin-only, server-enforced (ADR-0039/0067). Last admin leaving auto-promotes.

### Integrations (built vs not)
**Built:** Google *sign-in* only. **Stubbed:** calendar sync (flag + link table, no module, no scope requested). **Absent:** Gmail import, Google Maps/Places calls, weather, FX, emergency numbers, flight status.

### Current v1 scope (as built)
Home (both modes) · Day-by-day (both modes) · Index (bookings + documents, offline) · hard/soft + most quick verbs · maybe-shelf · shared sync + LWW + undo · multi-trip switcher · invites + removal governance · trip settings. **Deliberately/effectively out:** Map, navigate/leave-by, calendar sync, change-feed, per-item sync status, weather/FX/currency/emergency, Gmail, `do-it-now`, real `swap`.

```
                 ┌─────────────────────────── APP SHELL (indigo/neutral) ───────────────────────────┐
   /login ──► resolve active trip ──► /trips (all-trips) ──► TRIP  ──► settings (⚙, admin-governed)
                                                              │
        ┌──────────────── one surface, two modes (derived from dates × clock) ───────────────┐
        │  PLAN (violet, drafting)                         TRIP (indigo+amber, board, live)   │
        │  Home = prep dashboard      Home = departure board (Now/Next, glance, quick-access) │
        │  Day  = itinerary builder   Day  = follow + adjust (verbs, slip, shelf)             │
        │  Index= booking entry       Index= reference (offline)                              │
        │  Map  = research  ◄── UNBUILT ──►  Map = orientation / near-me / navigate  (UNBUILT)│
        └────────────────────────────────────────────────────────────────────────────────────┘
   substrate: Event (time authority) ─?1:1─ Booking ; Place (location) ; Document ; MaybeItem ; Change (sync/undo/feed)
```

---

## 6. Intended versus implemented capability map

| Capability | Product status | Intended behavior | Frontend | Backend | Data-model | Sync | Offline | Main gap | Risk if presented as complete |
|---|---|---|---|---|---|---|---|---|---|
| Now/Next board | Accepted | Live now/next/countdown, hard-anchor, concurrency | ✅ built | ✅ (derived client-side) | ✅ | ✅ | ✅ | Spatial "leave-by" missing | Medium — looks complete, can't say when to leave |
| Day-at-a-glance | Accepted | Derived rail, "remaining", free-until | ✅ | n/a (derived) | ✅ | ✅ | ✅ | None | Low |
| Index (bookings+codes) | Accepted | Offline reference | ✅ | ✅ | ✅ | ✅ | ✅ | None | Low — genuinely strong |
| Documents (offline) | Accepted | Encrypted, offline, view/manage | ✅ | ✅ | ✅ | ✅ | ✅ (blob cache) | **Trust: operator can read** | **High — "encrypted" over-claims** |
| Hard/soft model | Accepted | Guard hard, flow soft | ✅ | ✅ (confirm gate) | ✅ | ✅ | ✅ | None | Low — exemplary |
| Quick verbs | Accepted | done/skip/delay/swap/do-now/navigate | ⚠️ partial | ⚠️ partial | ✅ | ✅ | ✅ | **`do-it-now` missing; `swap`=skip+prompt; `navigate` stub** | **High — deviate-safely loop incomplete** |
| Maybe shelf | Accepted | Park/schedule parking-lot | ✅ | ✅ | ✅ | ✅ | ✅ | Feeder (Map research) missing | Medium |
| Ripple suggestion | Accepted | Suggest soft shifts, never hard | ✅ | ✅ | ✅ (Change) | ✅ | ✅ | No shared zod schema for response | Low |
| Undo | Accepted | Own-last-action, inverse Change | ✅ | ✅ (client-driven) | ✅ | ✅ | ✅ | Single-slot only (as designed) | Low |
| Map / near-me | Accepted (pillar) | Research + orientation + nav | ❌ placeholder | ❌ | ⚠️ Place registry only | n/a | ❌ | **Entire surface** | **Critical — dead primary tab** |
| Navigate-to-next / leave-by | Accepted (deferred) | Deep-link + place data | ❌ toast | ❌ | ⚠️ needs place enrichment | n/a | n/a | **Place data + deep-link** | **High — thesis half** |
| Change-feed | Should (PRD 4.2) | "Noam moved ramen to 20:00" | ❌ | ⚠️ Change exists, unstreamed to feed UI | ✅ (Change) | ✅ substrate | — | **Feed UI + WS buffer** | **High — collaboration awareness** |
| Per-item sync status | (implied) | synced/pending/failed per row | ❌ (global only) | ⚠️ substrate exists | — | ✅ | ✅ | **SyncStatusModel + badge** | **High — save trust** |
| Presence | Could | Who's connected | ⚠️ roster only | ⚠️ presence msg exists | ✅ | ✅ | — | Presence UI | Low |
| Calendar sync (one-way) | Should | trip → personal calendar | ❌ | ❌ (no module/scope) | ✅ (link table) | n/a | n/a | **Whole feature + consent** | Medium — toggle implies it works |
| Gmail import | v1.1 | Parse confirmations → bookings | ❌ | ❌ | ✅ (`source=gmail`) | n/a | n/a | Whole feature (deferred) | Low (deferred) — but personas lean on it |
| Weather / FX | Cut/deferred | Glance cards | ❌ (dead fixture) | ❌ | — | — | — | Whole feature | Low (cut) |
| Currency | Should (display) | Rate display | ❌ (util unused) | ⚠️ field only | ✅ | — | — | Whole feature | Low |
| Emergency numbers | Should | By country, offline | ❌ | ❌ | ❌ | — | — | Whole feature | Medium — worrier persona |
| Invites + removal | Accepted | Code invites, rotate, block | ✅ | ✅ | ✅ | ✅ | partial (join online-only) | None | Low — strong |
| Multi-trip switcher | Should | List + active-trip | ✅ | ✅ | ✅ | ✅ | ✅ (cached) | Overlapping trips deferred | Low |
| Finished-trip archive + settle | Accepted | Read-only structural, settle-editable | ✅ | ✅ | ✅ | ✅ | ✅ | Complexity (3-case rule) | Low |

**The pattern is consistent: the *reference* and *derivation* layers are complete and strong; the *spatial*, *awareness*, and *integration* layers are the gaps — and they are exactly the layers the thesis leans on to beat Maps and WhatsApp.**
---

## 7. Jobs-to-be-done assessment

Each job: situation · motivation · desired outcome · existing alternative · current Waypoint support · main friction · trust req · offline req · collaboration req · success measure.

**Before the trip**

- **Create the trip.** Someone is designated organizer · wants to start fast · a trip exists in one step · a WhatsApp group / shared doc · **Strong** (3-input `/new`, ADR-0032) · none · low · online-only (correctly disabled offline) · none · trip created < 30s.
- **Invite participants.** Trip exists, group must join · get everyone in with no friction · a link that survives planning and travel · WhatsApp link · **Strong** (durable code invite, rotate, preview, ADR-0067) · none · medium (link must be trustworthy/revocable) · online-only · admin governs · all ~5 joined.
- **Enter bookings + docs.** Codes/passports scattered · centralize the truth · every booking/doc in one offline place · screenshots + email · **Strong** (rich booking form, doc upload, offline) · booking entry is data-heavy; **no place authoring** (picker deferred) · high · online to enter, offline to read · shared · index complete.
- **Organize days.** Raw bookings + ideas · a shape for the trip · days with hard anchors + soft flow · a shared doc · **Strong** (builder, gap chips, drag) · heavy for a long trip · medium · shared write · shared · a coherent itinerary.
- **See what's missing.** Anxiety about gaps · confidence nothing fell through · a real-data readiness checklist · mental checklist · **Strong** (ADR-0061 readiness, do-the-thing CTAs) · readiness is advisory only · medium · derived offline · shared · "ready" reads true.
- **Ensure offline readiness.** Weak signal abroad · trust the index will be there · everything cached before departure · manual screenshots · **Good but implicit** — the app caches automatically, but **there is no explicit "you're ready for offline" confirmation** · this is a trust gap (see P-11 discussion) · high · the whole point · shared · index opens with no signal.

**During the trip**

- **What now / next.** On the move · orient in zero taps · current + next + countdown at a glance · WhatsApp scroll · **Strong** (board) · none temporally · high · yes · reads others' changes (if synced) · glance answers without navigation.
- **When to leave.** A hard anchor approaches · not miss it · a leave-by cue accounting for travel · mental math + Maps · **MISSING** — no travel data, no leave-by · **critical gap** · high · would need place data · n/a · miss-rate.
- **Navigate to the next place.** Need to physically get there · turn-by-turn · deep-link to Maps · open Maps manually · **MISSING** (toast stub) · **critical gap** · high · needs place data · n/a · one tap to directions.
- **Retrieve a confirmation code.** At a counter · show the code · code in the index, offline · find the email · **Strong** · none · very high · yes · shared · code shown offline.
- **Open a document.** Border/check-in · show passport/insurance · doc opens offline · find the photo · **Strong** (blob cache) · **first open needs to have happened online** (see offline contract) · very high · previously-opened only · shared · doc opens offline.
- **See free time.** A lull · decide what to do · free-until framing + shelf · guess · **Good** (glance free-until + shelf) · discovery half missing (no Map) · medium · yes · shared · a decision made.
- **Change a soft plan.** Plans shift · adjust without chaos · skip/delay/swap/do-now + ripple · re-message the group · **Partial** — `skip/delay/earlier` work; **`do-it-now` missing, `swap` is skip+prompt** · medium · yes · **should notify the group (no feed)** · change made + seen.
- **React to a delayed hard commitment.** Running late for the ramen reservation · move it safely · guarded hard edit + ripple of softs after · call the restaurant + re-plan manually · **Good** (confirm gate + ripple) · **but "update the reservation" is only a warning, no action** · high · yes · shared · anchor moved, softs offered.
- **Communicate a shared change.** One person changes something · the rest just know · a change-feed · re-message · **MISSING** (no feed) · **high gap** · high · yes · the core collaboration job · others see it without a message.
- **Recover when connectivity is lost.** No signal · keep working · read cache + queued writes · give up, use screenshots · **Strong** (outbox) · none · very high · yes · edits queue · nothing lost.
- **Trust a save synced.** After an edit · confidence it reached the group · a per-item synced marker · re-ask in chat · **MISSING per-item** (global badge only) · **high gap** · very high · yes · shared · user is sure.

**After the trip**

- **Reference past bookings/docs.** Later admin/expense need · retrieve a code/receipt · read-only archive · dig through email · **Strong** · none · high · yes · shared · found.
- **Settle stragglers.** Tidy the record · mark the last dinner done · settle-editable archive · nothing · **Good** (ADR-0044) · the 3-case rule is subtle · low · yes · shared · record accurate.
- **Understand why editing is locked.** Trying to edit a finished trip · know it's intentional · clear "archived" chrome · confusion · **Good** (archive chrome) · none · low · yes · n/a · no confusion.
- **Rename / delete the trip.** Cleanup · manage the list · admin governance · n/a · **Strong** (ADR-0039) · none · medium · online for delete · admin · done.

**Cross-cutting finding from the JTBD map:** every *reference / retrieval / recovery* job is well-served. Every *spatial* job (leave-by, navigate) and every *awareness* job (communicate a change, trust a save) is missing or partial. Two of the three during-trip failure modes the product exists to fix (fall back to Maps; fall back to WhatsApp) are unaddressed at exactly the jobs where they bite.

---

## 8. Product-journey assessment

For each: current · desired · product gap · infra gap · failure behavior · recommended change · validation.

- **First use (zero-state).** *Current:* dormant board, two equal Create/Join CTAs (ADR-0024). *Desired:* same. *Gaps:* none of note. *Failure:* offline → create disabled with reason. *Rec:* none. *Validate:* time-to-first-trip.
- **Trip creation.** *Current:* 3 inputs, live draft, land in trip, prompt invite. *Desired:* same. *Gaps:* timezone/currency auto-derivation from destination is deferred (manual). *Infra:* a destination→tz/currency table. *Failure:* offline disabled. *Rec:* keep; auto-derive tz later. *Validate:* < 30s create.
- **Joining.** *Current:* public preview → one-tap join, auth-resume auto-completes (ADR-0024/0067). *Desired:* same. *Gaps:* none. *Failure:* expired/blocked → friendly dead-end. *Rec:* none. *Validate:* join success rate.
- **Pre-trip planning.** *Current:* readiness checklist with do-the-thing CTAs, builder, booking entry. *Desired:* same + place authoring. *Gap:* **no place authoring** (picker deferred) — the one field that would make navigate work later. *Infra:* Places picker (or name-only Place now). *Failure:* free-text only. *Rec:* ship name-only place authoring now, picker later. *Validate:* % events with a place.
- **Booking entry.** *Current:* all 6 types, route-as-identity for transport, auto-create linked event, notes/WiFi. *Desired:* same, faster. *Gap:* data-heavy; < 30s target unvalidated. *Infra:* Gmail import (deferred) would help. *Failure:* manual. *Rec:* measure entry time on a real trip. *Validate:* seconds-per-booking.
- **Itinerary building.** *Current:* rows, drag-reorder softs, gaps, shelf, cross-day. *Desired:* same. *Gap:* heavy on phone for long trips (tablet is the intended width). *Failure:* fine. *Rec:* none for v1. *Validate:* observe on a real multi-day plan.
- **Trip-mode arrival.** *Current:* auto-derived on `startDate`, board powers on, override live-only. *Desired:* same; location-flip is vNext. *Gap:* mode is date-derived, not arrival-derived (accepted). *Failure:* if dates are wrong, mode is wrong. *Rec:* none for v1. *Validate:* did the switch feel right on day 1.
- **Now/Next use.** *Current:* strong temporally. *Desired:* + leave-by + navigate. *Gap:* **spatial half (P-01)**. *Infra:* place data + deep-link. *Failure:* user opens Maps. *Rec:* ship minimal navigate. *Validate:* did users get spatial answers here or leave the app.
- **Day adjustment.** *Current:* verbs + slip cluster + ripple + undo. *Desired:* + `do-it-now` + real `swap`. *Gap:* **P-02**. *Infra:* verbs.ts + move (now). *Failure:* slip has no one-tap resolve; swap silently skips. *Rec:* complete the verbs. *Validate:* verb usage + error rate.
- **Document retrieval.** *Current:* offline blob cache, view/download. *Desired:* same + honest offline promise. *Gap:* first-open-online requirement is implicit. *Infra:* a "cached for offline ✓" indicator. *Failure:* an un-opened doc is unavailable offline. *Rec:* show per-doc offline-readiness. *Validate:* offline doc-open success.
- **Offline use.** *Current:* comprehensive. *Desired:* same + explicit "ready for offline". *Gap:* no pre-departure offline-readiness confirmation. *Infra:* a readiness check ("all docs cached, snapshot fresh"). *Failure:* silent partial cache. *Rec:* add offline-readiness to the prep checklist. *Validate:* offline incidents.
- **Collaborative change.** *Current:* syncs silently. *Desired:* change-feed + per-item status. *Gap:* **P-03**. *Infra:* WS feed buffer + SyncStatusModel. *Failure:* silent mutation, re-messaging. *Rec:* build both. *Validate:* did users re-confirm changes in WhatsApp.
- **End of trip.** *Current:* archive + settle-editable. *Desired:* same. *Gap:* 3-case editability is subtle. *Failure:* fine. *Rec:* document the rule in one place. *Validate:* settle usage post-trip.
- **Multi-trip use.** *Current:* switcher + active-trip. *Desired:* same; overlapping deferred. *Gap:* overlapping in-progress trips unsupported. *Failure:* picks one. *Rec:* keep deferred. *Validate:* rare in practice.

---

## 9. Product-model assessment

- **Plan vs Trip mode.** *Works:* derived, one surface, live-window-only override, chrome-signaled — conceptually clean and implemented. *Ambiguous:* "editing is de-emphasized not disabled" collides with Tier-3 gating + day-scope + trip-phase; the true rule is a 4-axis matrix, not "two modes." *Overcomplicated:* the union of ADR-0025/0029/0040/0044 rules. *Missing:* a single authoritative statement of "what can I do here." *Simplify:* keep the model; extract one rule table (see §14). *Preserve:* derived mode, live-window override. *Tech:* all client-derived; no schema change to fix — it's a documentation + one-helper consolidation.
- **Hard vs soft.** *Works:* the best decision in the product — one primitive, behavior + rendering + conflict-surface all keyed off it. *Ambiguous:* can an item change type? (yes, Tier-2 flip) — under-documented as a *lifecycle* transition (what happens to a linked booking on flip?). *Missing:* the hard→soft flip's effect on a linked Booking is unspecified. *Preserve:* the binary; resist adding statuses. *Tech:* flip is a PATCH; define the booking-link rule.
- **Booking vs event.** *Works:* strict 1:1 optional, Event = time authority, place-authority rule (ADR-0048/0051) — clean ownership. *Ambiguous:* users needn't understand it (good), but the *unlink vs delete* choice on booking delete is a subtle prompt. *Preserve:* the ownership model. *Tech:* solid.
- **Scheduled vs maybe.** *Works:* parking-lot unification (ADR-0027) is elegant — one idea in exactly one place. *Missing:* the discovery feeder (Map research → +maybe). *Preserve:* the parking-lot model. *Tech:* shelf is a client-side union; sound.
- **Current vs next.** *Works:* fully derived from clock + times; concurrency collapsed to roots. *Ambiguous:* blank-end events never read as "now" (backlog open question). *Missing:* leave-by. *Tech:* `lib/time.ts` — needs a default-duration rule for blank ends.
- **Stored vs derived state.** *Works:* exemplary — `now`, phases, bracketed/ambient, mode, readiness all derived. *Preserve:* this discipline aggressively. *Tech:* the reason offline + sync stay simple.
- **Active vs past trip.** *Works:* pre/live/past phases + archive. *Overcomplicated:* settle-editable exception + 3-case table. *Preserve:* the behavior; consolidate the rule.
- **Member vs admin.** *Works:* everyday-open, governance-gated, server-enforced, last-admin auto-promote, TripBlock. *Missing:* nothing material for v1. *Preserve.*
- **Online vs offline.** *Works:* clear read/write split, server-only actions fenced. *Ambiguous:* per-doc offline-readiness invisible. *Preserve* + surface readiness.
- **Local vs synced change.** *Works:* outbox + optimistic + reconcile. *Missing:* **per-item confidence** — the user can't see local-vs-synced per row. *Tech:* SyncStatusModel over the outbox (substrate exists).

---

## 10. Surface responsibility matrix

| Surface | Primary question | Primary job | Mode-specific behavior | Authoritative data | Primary actions | Offline contract | Collaboration behavior | Main problems | Recommended responsibility |
|---|---|---|---|---|---|---|---|---|---|
| **Home** | "What's true right now?" | Orient in zero taps (Trip); know what's missing (Plan) | Trip=board; Plan=prep dashboard | derived from `events`+clock | tap into Index/day; quick-access; readiness CTAs | full (derived, cached) | reflects synced peer state; **no feed** | no leave-by; silent peer changes | Keep as the live summary + add a change-feed entry point |
| **Map** | "Where is it / near me / how do I get there?" | Orient spatially; research (Plan) | Trip=orientation; Plan=research | `Place` (unpopulated) | search/pin/+maybe; navigate | none (deep-links out) | shared pins | **dead placeholder in a primary slot (P-01)** | Build minimal orientation first (navigate deep-link + pinned events); full research later |
| **Index** | "What's my code / where's my doc?" | Reference, offline | Plan=entry; Trip=reference; archive=washed | `Booking`, `Document` | add/edit/view/manage | full (bookings + doc blobs cached) | shared, synced | none material | Preserve as-is (the strongest surface) |
| **Day-by-day** | "What's the plan for this day?" | Build (Plan); follow+adjust (Trip) | Plan=builder; Trip=follow; past=read-only; finished=settle-editable | `Event` | verbs; edit; drag; shelf; settle | full | shared; **silent** | verb set incomplete (P-02); silent changes | Complete verbs; keep dual role |
| **Trip settings** | "Who's in / manage this trip" | Governance | mode-neutral | `Trip`, `Membership`, `Invite`, `TripBlock` | edit/invite/promote/remove/delete | reads cached; mutations queue | admin-governed, synced | calendar toggle implies a feature that's stubbed | Keep off-tabs; hide/label the calendar toggle until sync ships |
| **App shell** | "Which trip / who am I" | Get into a trip | mode-agnostic (indigo/neutral) | trip list, identity | switch trip, account, back | switch among cached trips | per-device (not synced) | none material | Preserve |
| **Join flow** | "What trip is this / do I join" | Convert invite → membership | n/a | `invitePreview` | preview + join | preview may hydrate from cache; join online | adds membership | none material | Preserve |
| **Trip switcher** | "My trips as a set" | Switch/create | n/a | trip list | pick/create | cached list | per-device | none material | Preserve |

**Structural conclusion:** the four-surface model is sound *except that one of the four is empty*. Map occupies a primary nav slot it cannot yet earn. Two honest options (see P-01): **(a)** build the *minimum* Map (orientation: pinned events + a Maps deep-link) so the slot pays rent, or **(b)** temporarily demote Map out of the primary nav until it has a job — a four-tab bar with a dead tab actively erodes trust in the other three. Option (a) is preferred because it also unblocks navigate/leave-by, which the thesis needs.

---

## 11. Product findings

Findings are consolidated by root cause and ordered by severity. They are **product-design** findings; code-level issues owned by the three prior reviews are not repeated (referenced where relevant). Each uses the required format.

### P-01 — The Now/Next thesis is spatially hollow: no "where is it / when do I leave / navigate"

- **Severity:** Critical · **Confidence:** High · **Category:** thesis / scope / surface
- **Affected users:** all; acutely Navigator (B) and Go-with-the-flow (C)
- **Affected jobs/scenarios:** "when to leave," "navigate to next," "free time → discover," "nearest ATM" (persona scenario 4); trace scenarios 7, 8, 19.
- **Affected surfaces:** Home (board), Map, Day-by-day (navigate verb)
- **Docs/decisions:** vision.md pillars 2–4; ADR-0045 (navigate deferred); ADR-0048/0051 (Place); ADR-0006 (no live location); backlog "Map tab", "Place-picker", "navigate-to-next"
- **Current product behavior:** Home answers "what now/next" temporally; there is no spatial answer anywhere.
- **Current implementation status:** Map = placeholder (`App.tsx` `Placeholder`, no `Map.tsx`, no maps dependency); `navigate`/`on-my-way` = toast stubs (`verbs.ts`); `Place` rows are name-only (no `googlePlaceId`/lat/lng populated); no Google Maps/Places call in the codebase.
- **User problem:** the single question the product is built around — "what do I need in the *next 30 minutes*" — cannot be fully answered on the ground, so the user reopens Google Maps at exactly the moment Waypoint is meant to win.
- **Why it matters:** it's the thesis. A live layer that can't say "leave in 10 min, it's 1.2km away, tap to navigate" is a prettier read-only itinerary. Two personas' primary job lives here.
- **Realistic scenario:** 16:40, next hard anchor is a 17:00 timed ticket across town. The board shows the countdown but not that the group needed to leave 5 minutes ago; no tap-to-navigate. They miss it and blame the app.
- **Root cause:** the spatial pillar was deferred (rationally — it's blocked on Google Cloud setup + a Places picker), but the *nav slot and the thesis were shipped without it*, leaving a promise with no backing.
- **Recommended product behavior:** ship the **minimum spatial answer**, not the full research surface: (1) authorable place data on events (name-only `Place` now, picker later); (2) a Maps **deep-link** `navigate` (does not need live device location — Maps routes from the device — ADR-0006 does not block it); (3) a derived **leave-by hint** *only when a place with coordinates exists* (honest: absent otherwise); (4) minimal Map = pinned events + near-me list, or demote Map from the nav until it has a job.
- **Product rule:** *"Navigate is offered only when the target event resolves to a Place with a usable identifier (googlePlaceId or coords or an unambiguous address); a leave-by hint is shown only when travel time can be estimated; otherwise neither is shown (never a guessed target)."* — a direct application of ADR-0045's real-data-only rule.
- **Scope:** place authoring + deep-link navigate + optional leave-by. **Non-goals:** turn-by-turn in-app, live location sharing (ADR-0006), full Places research surface, offline map tiles.
- **Infrastructure compatibility:** `Place` entity + FKs already exist; Maps deep-links are a URL, no SDK; leave-by needs a distance/time estimate (Maps Distance Matrix or a haversine + speed heuristic).
- **Required technical changes:** Google Cloud project (human, backlog); a Places picker component (or interim name-only place authoring re-added to `EventForm`, per backlog); `Place` enrichment write path (exists: `PATCH /places`); a `navigate(event)` that resolves place → Maps URL; optional Distance Matrix call server-side.
- **Offline implications:** deep-link navigate hands off to Maps (which owns its own offline); leave-by from cached coords works offline with a heuristic; a live Distance Matrix call degrades to the heuristic offline.
- **Synchronization implications:** places are data-plane (`ChangeService`), already synced/offline.
- **Permission implications:** everyday (any member authors a place, like any soft edit).
- **Data/migration implications:** none new (Place exists); enrichment fills existing nullable columns.
- **Dependencies:** Google Cloud setup (also gates calendar sync).
- **Risks:** a wrong deep-link target is worse than none — hence the strict rule above.
- **Product-design scope:** Medium · **Engineering scope:** Medium (interim navigate) → Large (full Map research)
- **Priority:** Highest.
- **Validation:** on the real trip, count spatial questions answered in-app vs. handed off to Maps; navigate taps; missed-anchor incidents.
- **Success signal:** users get "when/where/how to get there" without leaving the app for the common case.

### P-02 — The "deviate safely" loop is incomplete: `do-it-now` missing, `swap` is not a swap

- **Severity:** High · **Confidence:** High · **Category:** domain-model / quick-actions
- **Affected users:** all; acutely Spontaneous (D)
- **Affected jobs/scenarios:** "change a soft plan," slip recovery (scenario 9), maybe→today (scenario 10)
- **Affected surfaces:** Day-by-day, Home (slip cluster)
- **Docs/decisions:** ADR-0027 (slip → **Do it now** / Skip / Pick a time), ADR-0025 (Tier-1 verbs incl. Do-it-now, Swap), vision "real-travel verbs"
- **Current product behavior (documented):** a slipped soft plan surfaces "Slipped — still on?" with **Do it now** as the primary recovery; `swap` replaces one plan with another.
- **Current implementation status:** `do-it-now` is **not implemented as a named verb** (`verbs.ts` inventory); `swap` is implemented as **skip-then-prompt** (sets status skipped + a toast), not a replacement picker; `navigate` stub (see P-01). `skip/delay/earlier/done/restore/schedule/undo/ripple` are wired.
- **User problem:** the flagship "make deviating smooth and safe" moment (vision §Flexibility) is half-built; the most forgiving recovery affordance is absent, and a verb (`swap`) does something other than its name.
- **Why it matters:** "deviate safely" is one of the three things vision says the app must nail; ADR-0027 spent its whole design on the slip loop, whose payoff verb doesn't exist.
- **Realistic scenario:** it's 16:00, the 14:00 soft "temple" slipped. The card offers Skip/Pick-a-time but not one-tap "do it now" → the user manually retimes, friction at the exact moment the app promised zero.
- **Root cause:** the verb set was built incrementally; `do-it-now` and a true `swap` were the last mile and weren't closed.
- **Recommended product behavior:** implement `do-it-now` (retime the event to *now*, ripple following softs, exempt from `MOVE_INTO_PAST` per ADR-0027 §3); either implement `swap` as a real two-item replacement (skip A + schedule B into A's slot) or **rename it** to match "skip" so the verb never lies.
- **Product rule:** *"Every quick verb's name equals its state transition; `do-it-now` targets the current instant and is exempt from the past guard; `swap` atomically vacates one soft slot and fills it, or it is not called swap."*
- **Scope:** two verbs. **Non-goals:** new verbs beyond the ADR-0025 set.
- **Infrastructure compatibility:** fully supported — `POST /events/:id/move` returns ripple; `MOVE_INTO_PAST` handling exists.
- **Required technical changes:** `verbs.ts` add `doItNow` (move→now, +ripple, past-guard exempt); implement/relabel `swap`.
- **Offline implications:** both queue through the outbox like other moves.
- **Synchronization implications:** standard `Change` + ripple; undoable.
- **Permission implications:** everyday (soft events, any member).
- **Data/migration implications:** none.
- **Dependencies:** none.
- **Risks:** `do-it-now` colliding with an existing "now" event → rely on existing concurrency handling.
- **Product-design scope:** Small · **Engineering scope:** Small–Medium
- **Priority:** High.
- **Validation:** slip-cluster interactions; do-it-now taps; swap comprehension.
- **Success signal:** slipped plans are resolved in one tap; no verb surprises users.

### P-03 — Collaboration ships the engine but not the awareness: no change-feed, no per-item sync confidence

- **Severity:** High · **Confidence:** High · **Category:** collaboration-model / trust
- **Affected users:** all members of a shared trip
- **Affected jobs/scenarios:** "communicate a shared change," "trust a save synced" (scenarios 11–13)
- **Affected surfaces:** Home, Day-by-day, Index (all shared surfaces)
- **Docs/decisions:** PRD 4.2 ("Noam moved ramen to 20:00"), collaboration-model.md ("the change-feed is the safety net"), personas; UI/UX U-09/U-04; frontend F-03 (global failed-sync shipped)
- **Current product behavior (documented):** peers see each other's changes near-real-time *and* a lightweight change-feed narrates who changed what; a member can trust a save reached the group.
- **Current implementation status:** sync engine is built (WS + LWW + optimistic + reconcile + global failed-sync badge). **No change-feed UI** (Change records exist server-side but aren't streamed to a feed). **No per-item sync status** — confidence is a transient toast + one global header badge.
- **User problem:** a member changes the plan and no one is *told*; a member makes an edit and can't see, per item, whether it synced. Both push the group back to WhatsApp ("did you see I moved dinner?" / "did my change save?") — the exact behavior Waypoint exists to eliminate.
- **Why it matters:** *awareness*, not raw sync, is what beats a group chat. Without it, collaboration is invisible plumbing and the product's collaboration advantage is unrealized.
- **Realistic scenario:** Noam moves ramen to 20:00 offline; it syncs later; Dana, mid-trip, sees the itinerary silently change (or doesn't notice) and has already walked to the old place.
- **Root cause:** the substrate (Change log, real attribution after F-05) was built for sync/undo but never surfaced as product-facing awareness.
- **Recommended product behavior:** (1) a quiet **change-feed** — a WS-fed recent-changes buffer rendered as "Noam moved ramen to 20:00 · 2m," dismissible, offline-aware (shows on reconnect catch-up); (2) a **per-item sync status** model (`synced | pending | failed`) with a small badge and a retry path, derived from the outbox.
- **Product rule:** *"Every mutation to shared state is attributable and surfaced: it appears in the change-feed with actor + before→after, and its originating item shows a per-item sync state until confirmed synced. A failed shared write is never silently dropped."* (Extends F-03's global surface to per-item.)
- **Scope:** feed + sync-status model. **Non-goals:** notifications/push (deferred), presence GPS (ADR-0006), a full activity log screen.
- **Infrastructure compatibility:** high — `Change` has actor/before/after; WS already streams changes; the outbox already tracks pending/failed.
- **Required technical changes:** FE: a `ChangeFeed` fed by the WS `change` stream + catch-up buffer; a `SyncStatusModel` derived from `outbox` + a `SyncBadge`; a retry/review surface. BE: standardize `Change.after` payloads (backlog deferred item) so feed rendering is consistent; optionally a small `GET /changes` window for the feed's initial fill (endpoint exists).
- **Offline implications:** feed hydrates from catch-up on reconnect; pending items show pending until flushed.
- **Synchronization implications:** feed is a read over the existing Change stream; sync-status reads the outbox — no new sync semantics.
- **Permission implications:** all members read the feed; it shows only shared-state changes (never personal prefs).
- **Data/migration implications:** none (Change exists); standardizing `after` is a service-layer change, not a migration.
- **Dependencies:** F-05 attribution (shipped); the `Change.after` standardization (backlog).
- **Risks:** feed noise → keep it quiet/collapsible; attribution accuracy depends on the standardized payloads.
- **Product-design scope:** Medium · **Engineering scope:** Medium
- **Priority:** High.
- **Validation:** count re-confirmations that leak to WhatsApp; feed opens; failed-save recoveries.
- **Success signal:** the group stops re-messaging plan changes; users trust the app's save state.

### P-04 — "Encrypted offline documents" over-promises for the reframed (multi-tenant) audience

- **Severity:** High · **Confidence:** High · **Category:** trust / privacy / scope
- **Affected users:** all, esp. Worrier (E); anyone storing passports/insurance
- **Affected jobs/scenarios:** store + retrieve sensitive documents; the ADR-0065 grow-later posture
- **Affected surfaces:** Index (documents), settings
- **Docs/decisions:** feature-catalog "Offline encrypted documents (Must)", ADR-0015 (server-side encryption at rest), ADR-0034 (does **not** protect against the operator), ADR-0065 (reframe to many users; explicitly flags that 0034's trust basis is trip-scoped), frontend F-01 (local wipe shipped)
- **Current product behavior:** documents are encrypted **at rest on the server**; the operator (who holds `DOC_ENCRYPTION_KEY`) can decrypt. Local decrypted blobs are wiped on sign-out (F-01/ADR-0066).
- **Current implementation status:** as documented — server-side encryption, blob cache, sign-out teardown. No client-side/end-to-end encryption.
- **User problem:** "encrypted documents" reads, to a normal user storing a passport, as "no one but us can see this." For a **single self-hosted group** that's fine (the operator is a trip-mate — ADR-0034). For the **many-trips/many-users** product ADR-0065 now frames, the operator is a stranger, and "encrypted" is misleading for the most sensitive data in the app.
- **Why it matters:** ADR-0065 itself records that 0034's operator-trust reasoning "does **not** generalize to a public multi-tenant deployment." The product reframed its audience but not its most sensitive promise. This is a promise-vs-capability gap on passports.
- **Realistic scenario:** Waypoint hosts trips for people who don't know the operator; a user uploads a passport believing "encrypted" means private; it isn't private from the host.
- **Root cause:** the encryption model was scoped to a single-trust-domain deployment; the scope reframe (ADR-0065) widened the audience without revisiting the model or the wording.
- **Recommended product behavior:** pick one and make it honest: **(a)** keep v1 as an explicitly single-operator/self-hosted-trust product and *word the feature accurately* ("stored securely; the trip host can access files" — not "end-to-end encrypted"); or **(b)** before any genuinely multi-tenant deployment, stage **client-side encryption** for documents (the alternative ADR-0015/0034 already name). v1 proof (one real trust-domain group) is fine under (a).
- **Product rule:** *"A security word shown to users must match the guarantee the system provides. 'End-to-end / private from the host' may be shown only when documents are client-side encrypted; otherwise the copy states the operator-access reality."*
- **Scope:** wording now; client-side encryption before multi-tenant. **Non-goals:** client-side encryption for v1's single-group proof.
- **Infrastructure compatibility:** wording = trivial; client-side encryption = a substantial crypto/key-management build (key per trip, member key exchange, offline decryption) — Large.
- **Required technical changes:** now — copy in Index/upload + a docs-trust note; later — client-side encryption pipeline + key distribution tied to membership.
- **Offline implications:** client-side encryption must still allow offline decryption on-device (key cached under the same teardown rules as F-01).
- **Synchronization implications:** encrypted blobs already sync as opaque; a key-exchange model would ride membership (data-plane).
- **Permission implications:** decryption capability = trip membership; revocation must revoke key access (hard problem — flag for the ADR).
- **Data/migration implications:** moving to client-side encryption is a one-way re-encryption migration of existing blobs.
- **Dependencies:** the deployment-model decision (single-operator vs multi-tenant) gates which path.
- **Risks:** shipping multi-tenant with server-readable passports is a real privacy exposure; the interim honest wording avoids the trust breach cheaply.
- **Product-design scope:** Small (wording) / Large (E2E) · **Engineering scope:** Small / Large
- **Priority:** High (wording now; E2E gated on multi-tenant).
- **Validation:** does the copy match the model; if multi-tenant is pursued, a security review of the key model.
- **Success signal:** no user believes documents are private from the host when they aren't.

### P-05 — Scope-vs-thesis inversion: booking-presentation polish was prioritized over the thesis-critical spatial + awareness layers

- **Severity:** Medium (High for v1 timing) · **Confidence:** High · **Category:** scope discipline / prioritization
- **Affected users:** all (via what got built vs. not)
- **Affected jobs/scenarios:** the v1 proof itself
- **Affected surfaces:** Home hero (invested), Map + collaboration (deferred)
- **Docs/decisions:** ADR-0054/0059/0063 + sessions 32–40 (booking presentation); vision pillars 2–4 + PRD 4.2 (deferred); PRD §1 (v1 proof = one real trip)
- **Current product behavior:** the Home hero has rich, well-reasoned booking presentation (transition windows, in-transit teal treatment, route-as-identity, category time-profile).
- **Current implementation status:** built and polished across several sessions; meanwhile Map/navigate/change-feed/calendar remain unbuilt.
- **User problem:** none *directly* — the polish is good. The problem is **opportunity cost**: effort went to refining a well-understood, already-legible entity while the two gaps that decide the v1 proof (spatial answer, group awareness) stayed open.
- **Why it matters:** for "one real group, one real trip," the marginal value of hero polish is below the marginal value of P-01/P-03. The proof can fail on the gaps regardless of hero quality.
- **Realistic scenario:** the real-trip test runs; the hero looks great; the group still opens Maps to navigate and WhatsApp to confirm changes — and concludes Waypoint "isn't ready," despite the polish.
- **Root cause:** the recent work followed on-the-ground *review complaints* about existing surfaces (a healthy instinct) rather than the *thesis-completion* backlog; the category-profile refactor (ADR-0063) is genuinely good engineering that pulled effort toward the entity being refactored.
- **Recommended product behavior:** freeze further booking-presentation polish at "good enough" (it is); re-sequence to close P-01/P-02/P-03 before the real-trip test. Keep ADR-0063 (the shared foundation) — it's an asset — but stop spending on hero variants.
- **Product rule:** *"Before a v1-proof feature is polished, the thesis-critical gaps it depends on must be closed; polish of a legible surface never precedes building an illegible-because-absent one."*
- **Scope:** a prioritization decision, not a build. **Non-goals:** reverting the booking-presentation work (keep it).
- **Infrastructure compatibility:** n/a (process finding).
- **Required technical changes:** none; a roadmap re-sequence (§20).
- **Offline / sync / permission implications:** none (process).
- **Data/migration implications:** none.
- **Dependencies:** §13 scope decisions.
- **Risks:** continuing to polish delays the proof.
- **Product-design scope:** Small · **Engineering scope:** n/a
- **Priority:** High (as a sequencing decision).
- **Validation:** does the next milestone close P-01/P-03 before adding polish.
- **Success signal:** the real-trip test runs against a complete trip-mode loop, not a polished-but-partial one.

### P-06 — The editability rule surface is approaching a maintainability ceiling with no single source of truth

- **Severity:** Medium · **Confidence:** High · **Category:** maintainability / product rules
- **Affected users:** indirectly all (via bugs/inconsistency); directly developers
- **Affected jobs/scenarios:** every edit; day adjustment; finished-trip settle
- **Affected surfaces:** Home, Day-by-day, PlanDay, settings
- **Docs/decisions:** ADR-0025 (tiers), 0029 (day-scope), 0040 (access window), 0043 (phases), 0044 (3-case editability), 0016 (modes)
- **Current product behavior:** what a user can do depends on **mode × capability-tier × day-scope × trip-phase**, plus time-presentation depends on **hard/soft × category × bracketed/ambient × phase**. The rules are correct but live as prose spread across ~7 ADRs; ADR-0044 itself notes "editability is three cases, not two."
- **Current implementation status:** enforced across `DayView`/`PlanDay`/`Home` with derivations (`lib/mode.ts`, `time.ts`, `glance.ts`) — well-factored in the derivation libs, but the *rules* have no single canonical statement.
- **User problem:** the risk is future inconsistency — a verb available in one context and not an equivalent one, or a screen that disagrees with another — producing "surprising states" the review brief warns about. Not a current defect; a maintainability trajectory.
- **Why it matters:** each new surface/verb must re-derive the matrix; without one source of truth, drift is likely, and the product's "understandable rules" goal weakens.
- **Realistic scenario:** a new "duplicate event" verb is added; it's gated correctly on tier but not on day-scope, so it appears on a past day — a subtle inconsistency no one catches.
- **Root cause:** the model grew ADR-by-ADR (correctly, per the process) but was never consolidated into one rule table / state machine.
- **Recommended product behavior:** publish a **product-rule catalog** (see §14) as the authoritative statement, and a single capability resolver (`can(action, {mode, tier, dayScope, tripPhase})`) that all surfaces consult, so the rule lives in one place.
- **Product rule:** *"There is exactly one capability-resolution function and one rule catalog; a surface never re-implements gating logic. Time-presentation is resolved by the category profile (ADR-0063) everywhere."*
- **Scope:** consolidation (docs + one helper). **Non-goals:** changing any current behavior.
- **Infrastructure compatibility:** high — the derivations exist; this centralizes them.
- **Required technical changes:** a `capabilities.ts` resolver consumed by the surfaces; the §14 catalog doc.
- **Offline / sync implications:** none (client-derived, as today).
- **Permission implications:** the resolver must not be confused with server authorization (which stays authoritative); it's UI gating only.
- **Data/migration implications:** none.
- **Dependencies:** none.
- **Risks:** over-abstraction — keep the resolver a closed lookup, like the icon/category registries.
- **Product-design scope:** Medium · **Engineering scope:** Small–Medium
- **Priority:** Medium.
- **Validation:** new-feature reviews reference the catalog; fewer gating inconsistencies.
- **Success signal:** "what can I do here" has one answer, in one place.

### P-07 — Calendar sync is a documented v1 "Should" that is fully stubbed, undercutting the "pipes not islands" proof

- **Severity:** Medium · **Confidence:** High · **Category:** integrations / scope honesty
- **Affected users:** all (a visible settings toggle that does nothing)
- **Affected jobs/scenarios:** "add the trip to my own calendar"; ADR-0004 proof
- **Affected surfaces:** trip settings (the toggle), (intended) event write path
- **Docs/decisions:** ADR-0003 (one-way), tech-stack "Calendar v1 Should", auth-and-google (incremental scope), backlog ("nothing reads `calendarSyncEnabled`")
- **Current product behavior:** settings exposes a `calendarSyncEnabled` preference.
- **Current implementation status:** the flag persists/toggles; **no calendar module, no Google Calendar call, no calendar scope requested at sign-in** (`SIGN_IN_SCOPES` = identity only). `CalendarEventLink` exists unused.
- **User problem:** a toggle that implies a working feature but does nothing — a small trust erosion, and the one *easy* integration that would prove "pipes, not islands" (ADR-0004) isn't demonstrated.
- **Why it matters:** calendar sync is the cheapest, lowest-risk pipe and the clearest proof of the pipes principle. Its absence, plus a live toggle, is both a missing proof and a small honesty gap.
- **Realistic scenario:** a member enables the toggle, checks their Google Calendar, sees nothing, and distrusts the app.
- **Root cause:** the flag/link table were scaffolded early; the feature (module + incremental consent) was never built and the toggle wasn't gated on it.
- **Recommended product behavior:** either **build** the one-way sync (it's well-specified: incremental consent → upsert via `CalendarEventLink`, one-way per ADR-0003) as the flagship pipe, **or** hide/label the toggle as "coming soon" until it ships (honest degraded state). Given v1-proof priorities, hiding it now and building it in Phase 4 is defensible; if any integration is built for v1, this is the one.
- **Product rule:** *"A per-member integration toggle is shown only when the integration is functional; otherwise it is absent or explicitly labeled not-yet-available (never a live control with no effect)."*
- **Scope:** hide-or-build decision. **Non-goals:** two-way sync (ADR-0003 trap), reading the calendar back.
- **Infrastructure compatibility:** partial — link table + flag exist; needs a calendar module, the calendar scope in OAuth, and incremental-consent redirect.
- **Required technical changes:** OAuth incremental consent (backlog "lazy incremental OAuth consent"); a calendar service (create/update/delete → Google) triggered on event mutations for consenting members; idempotency via `CalendarEventLink`.
- **Offline implications:** calendar push is online-only server-side work (not offline; matches overview.md).
- **Synchronization implications:** push is a side-effect of event `Change`s; must not block the mutation (fire-and-reconcile).
- **Permission implications:** per-member consent (own `AuthIdentity.scopes`); the toggle is self-only (already `PATCH /members/me`).
- **Data/migration implications:** none (link table exists).
- **Dependencies:** Google Cloud setup (shared with P-01).
- **Risks:** front-loading scopes (avoid — incremental only); Google token/revocation handling.
- **Product-design scope:** Small · **Engineering scope:** Medium (build) / Small (hide)
- **Priority:** Medium.
- **Validation:** if built, sync success rate; if hidden, no dead toggle.
- **Success signal:** no control lies about its effect; if built, trip events appear in personal calendars.

### P-08 — Sources of truth have drifted from the built product (violates ADR-0001)

- **Severity:** Medium · **Confidence:** High · **Category:** documentation authority / coherence
- **Affected users:** developers, future contributors, the PM (decision quality)
- **Affected jobs/scenarios:** any work that trusts the docs; onboarding
- **Affected surfaces:** all (documentation)
- **Docs/decisions:** ADR-0001 (document everything; "docs describe current state"); data-model.md; prd-v1.md; feature-catalog.md; personas.md; integrations/overview.md
- **Current product behavior (intended):** the living docs describe the current product; ADRs hold the why.
- **Current implementation status:** **`data-model.md` is stale** (omits `Invite`, `TripBlock`, `EventCategory` enum, `Event.category`, `MaybeItem.category`, `Trip.icon`); **PRD/feature-catalog are DRAFT and broader than reality** (still list Gmail import, weather/FX, currency, emergency numbers, calendar sync as v1); **personas.md scenario 6 leans on Gmail import** (deferred); **overview.md offline model says "not offline: documents"** (now cached).
- **User problem:** the two documents most likely to be treated as the contract (PRD, feature-catalog) and the core data doc mislead anyone picking up the project — the exact failure the founding principle exists to prevent.
- **Why it matters:** ADR-0001 is the repo's constitution; drift here undermines every downstream "the docs say…" decision, including this review's readers.
- **Realistic scenario:** a new contributor builds against `data-model.md`, misses `category`/`Invite`, and reintroduces drift or a bug.
- **Root cause:** rapid ADR-by-ADR evolution outpaced the living-doc sync (the PRD/catalog stayed DRAFT; data-model.md's header still claims T-026 currency).
- **Recommended product behavior:** a documentation-sync sweep: refresh `data-model.md` from `schema.prisma`/`entities.ts`; move PRD/feature-catalog to reflect the honest v1 (§13); re-phase `integrations/overview.md`; fix the overview offline model; update personas scenario 6. Designate `entities.ts` + `schema.prisma` as the authoritative entity shape (data-model.md is a narrative view).
- **Product rule:** *"When a change alters a documented shape or scope, the living doc is updated in the same change (ADR-0001); `packages/shared/entities.ts` + `schema.prisma` are the authoritative entity shapes, prose docs are views."*
- **Scope:** documentation only. **Non-goals:** rewriting ADRs (they're the immutable record).
- **Infrastructure compatibility:** n/a.
- **Required technical changes:** none.
- **Offline / sync / permission implications:** none.
- **Data/migration implications:** none.
- **Dependencies:** §13 scope decisions (so the PRD refresh reflects the agreed v1).
- **Risks:** none beyond effort.
- **Product-design scope:** Small–Medium · **Engineering scope:** none
- **Priority:** Medium (do alongside §13).
- **Validation:** a doc-vs-schema diff comes back clean.
- **Success signal:** the docs describe the product that exists.

### P-09 — The "practical layer" pillar has collapsed to WiFi-only while still promised; emergency numbers are the cheap, high-trust win

- **Severity:** Medium · **Confidence:** High · **Category:** scope / pillar coherence
- **Affected users:** all; acutely Worrier (E)
- **Affected jobs/scenarios:** "emergency number in a strange country," currency at a glance
- **Affected surfaces:** Home (former glance row), Index/practical
- **Docs/decisions:** vision pillar 5 (practical: currency, language, emergency, documents, WiFi, budget); ADR-0045 (weather/FX/budget removed from Home); feature-catalog (weather/currency/emergency "Should")
- **Current product behavior (intended):** a practical layer with currency, emergency numbers, WiFi, documents.
- **Current implementation status:** **WiFi** (real, hotel-derived) and **documents** (built) ship; **weather** = dead fixture; **currency** = unused util + a settings field; **emergency numbers** = entirely absent.
- **User problem:** the Worrier persona's layer is mostly missing; emergency numbers — the highest-trust, lowest-effort practical item — don't exist, yet the pillar is still promised.
- **Why it matters:** either the pillar should be honestly retired to WiFi+documents, or its cheapest high-value member (emergency numbers) should be restored. Emergency numbers are **static, offline-safe, no integration** — a near-perfect fit for the product's constraints.
- **Realistic scenario:** a member needs the local police/ambulance number with no signal; the app — whose pitch includes exactly this — has nothing.
- **Root cause:** ADR-0045 rightly removed *fixture* practical cards from the Home (real-data-only), but the *real* practical data (emergency numbers by country) was never added, and the pillar's docs weren't reconciled.
- **Recommended product behavior:** add **emergency numbers by country** as static, offline reference (Index or a small practical section), derived from the trip destination; formally retire weather/FX/currency from v1 in the docs (return as pipes later per ADR-0004). Keep the real-data-only discipline (ADR-0045).
- **Product rule:** *"Practical reference is shown only from real, offline-safe data. Emergency numbers derive from the destination country (static table); currency/weather return only as real integration pipes."*
- **Scope:** emergency numbers (static) + doc reconciliation. **Non-goals:** weather/FX in v1.
- **Infrastructure compatibility:** trivial — a static country→numbers table in `packages/shared` (like the destinations/icons registries), no backend, no integration.
- **Required technical changes:** a shared static table + a small practical view; derive country from `Trip.destination`.
- **Offline implications:** fully offline (static, bundled).
- **Synchronization implications:** none (static reference).
- **Permission implications:** read-only, all members.
- **Data/migration implications:** none.
- **Dependencies:** none.
- **Risks:** country resolution from a free-text destination — keep it best-effort with a manual override.
- **Product-design scope:** Small · **Engineering scope:** Small
- **Priority:** Medium.
- **Validation:** did the Worrier reach for it; was it correct/available offline.
- **Success signal:** the practical pillar is either honestly scoped or genuinely useful, never faked.

### P-10 — The discovery→shelf→schedule loop is half-built: ideas can be parked but not discovered

- **Severity:** Low–Medium · **Confidence:** High · **Category:** feature connectivity
- **Affected users:** Navigator (B), Spontaneous (D)
- **Affected jobs/scenarios:** "free time → find something," maybe→today
- **Affected surfaces:** Map (research), maybe-shelf
- **Docs/decisions:** vision pillar 4 (hybrid recommendations: pre-built list + discovery by location/free time); ADR-0027 (shelf parking-lot); backlog (Map research)
- **Current product behavior (intended):** discover places on the Map → park to the shelf → schedule onto a day.
- **Current implementation status:** the shelf + schedule half is built and elegant; the **discovery half (Map research → +maybe)** is unbuilt (Map placeholder); ideas can only be *typed*, not *found*.
- **User problem:** the shelf has no feeder, so "hybrid recommendations" is really "manually typed ideas" — the discovery value is absent.
- **Why it matters:** it's a secondary pillar, but it compounds P-01 (both need place data + Map) and limits the Spontaneous/Navigator value.
- **Realistic scenario:** a free afternoon; the group wants "something nearby"; the app can't surface anything — back to Google Maps.
- **Root cause:** shared root with P-01 (Map + place data deferred).
- **Recommended product behavior:** treat as a Phase-4 follow-on to P-01's spatial layer: once place authoring + Maps exist, add a minimal "search nearby → +maybe" on the Map. Not a v1-proof requirement.
- **Product rule:** *"Discovery feeds the shelf via `Place`; a discovered place becomes a `MaybeItem` with a `placeId`, then schedules like any idea (ADR-0027) — no separate discovery data model."*
- **Scope:** Map research (deferred). **Non-goals:** algorithmic recommendations, ratings/AI enrichment (vNext pipe).
- **Infrastructure compatibility:** depends on P-01's Places work; `MaybeItem.placeId` already exists.
- **Required technical changes:** Map search UI → create `Place` + `MaybeItem`.
- **Offline implications:** discovery is online (Places); the resulting shelf item is offline.
- **Synchronization implications:** standard (shelf is data-plane).
- **Permission implications:** everyday.
- **Data/migration implications:** none.
- **Dependencies:** P-01.
- **Risks:** none material (deferrable).
- **Product-design scope:** Small · **Engineering scope:** Medium
- **Priority:** Low (v1.1).
- **Validation:** shelf-adds from discovery vs typed.
- **Success signal:** free-time decisions happen in-app.

### P-11 — "Now" and offline-readiness have implicit trust semantics that should be made explicit

- **Severity:** Low–Medium · **Confidence:** Medium (inferred from code + ADRs, not observed) · **Category:** trust / clarity
- **Affected users:** all, esp. on cross-timezone travel and weak signal
- **Affected jobs/scenarios:** what-now (timezone), offline readiness (scenarios 19–20, 5)
- **Affected surfaces:** Home, day view, documents
- **Docs/decisions:** ADR-0026 (real clock), ADR-0016 (mode from tz), backlog (`lib/time.ts:220` unresolved wall-clock; blank-end events open question)
- **Current product behavior:** "now"/phases derive in the **trip timezone**; documents cache after first online open; the app caches the whole trip automatically.
- **Current implementation status:** timezone-correct derivation is implemented (F-02 fixed the fixture-offset bug); but (a) blank-end events never read as "now"/ripple (backlog open question), (b) a wall-clock edge case is flagged (`time.ts:220`), and (c) there is **no explicit surfacing** of "which clock is this" or "is this doc/trip cached for offline."
- **User problem:** subtle trust erosion — a traveler in a different device timezone, or relying on an un-opened document offline, may quietly get a wrong or absent answer with no disclosure.
- **Why it matters:** travel info has consequences (missed transport); the product's trust depends on either being right or disclosing uncertainty. These are small, closable gaps.
- **Realistic scenario:** phone still on home time; the board's "now" (trip time) confuses the user with no label explaining which clock it uses; or a passport never opened online is unavailable at the border with no prior warning.
- **Root cause:** correct-by-derivation but under-disclosed; two known time edge cases remain open.
- **Recommended product behavior:** (1) label the board's clock as trip-time where ambiguity is possible; (2) resolve blank-end events with a default-duration rule for the now-window (backlog); (3) surface per-document offline-readiness ("saved for offline ✓") and a pre-departure offline-readiness check.
- **Product rule:** *"Derived time is stated in trip timezone and labeled when the device zone differs; an event with no end gets a default-duration now-window; a document's offline availability is visible before you need it offline."*
- **Scope:** disclosure + two time-rule fixes. **Non-goals:** multi-timezone itineraries (each event in its own zone) — out of v1.
- **Infrastructure compatibility:** high — derivations exist; this adds labels + a default-duration rule.
- **Required technical changes:** `lib/time.ts` default-duration for blank ends; a small offline-readiness indicator over the blob cache; a clock label.
- **Offline implications:** the offline-readiness indicator *is* the offline-trust surface.
- **Synchronization implications:** none.
- **Permission implications:** none.
- **Data/migration implications:** none.
- **Dependencies:** none.
- **Risks:** over-labeling clutter — show the clock label only when device≠trip zone.
- **Product-design scope:** Small · **Engineering scope:** Small–Medium
- **Priority:** Low–Medium.
- **Validation:** cross-timezone comprehension; offline doc-open success.
- **Success signal:** users trust "now" and know what's available offline before losing signal.
---

## 12. Positive product findings (preserve these)

- **Hard/soft as the single core primitive (ADR-0011).** One field drives behavior, rendering, conflict-surface, and ripple eligibility. It genuinely reconciles visibility vs flexibility and shrinks the conflict surface. This is the product's best decision — do not dilute it into a status ramp.
- **Derive-don't-store discipline (ADR-0018/0027/0043/0063).** No stored `now`, derived lifecycle phases, derived bracketed/ambient time-behaviour, derived mode. This is *why* offline and sync stay simple (nothing to reconcile that the clock can recompute) and why nothing goes stale offline. Exemplary; keep applying it (the category time-profile, ADR-0063, is the model to follow for new behavior).
- **Real-data-only Home (ADR-0045).** Removing weather/FX/budget/ATM fixtures rather than shipping fake capability is exactly right for a trust-critical live layer. This decision should be the template for P-01/P-07/P-09 (build real or show honest empty, never fake).
- **The offline/sync architecture.** Client-generated ids (no temp-id swap), a device-wide FIFO outbox with write-through to the read cache, commit-consistent `seq` cursor + advisory lock (ADR-0068), broadcast-after-commit, snapshot+catch-up, sign-out teardown (ADR-0066), documents in the snapshot + blob cache (ADR-0058). This is production-grade thinking at a proportionate scale — a real strength and a differentiator.
- **Integrations-as-pipes (ADR-0004).** A durable guardrail that has correctly prevented integration "islands"; it should govern P-01/P-07/P-10 (each feeds Now/Next or the index).
- **Booking↔Event 1:1 + place-authority ownership (ADR-0047/0048/0051).** Clear answer to "who owns time/location," enforced in the schema (`bookingId @unique`), with a clean unlink-vs-delete distinction. Resists the common trap of duplicated diverging fields.
- **Governance model (ADR-0039/0067).** Everyday-open, governance-gated, server-enforced, with durable revocable invites + removal blocks + last-admin auto-promotion + live-socket eviction. Proportionate and complete for the peer model.
- **Minimal trip creation (ADR-0032) + link-only invite + resume-intent join (ADR-0024/0067).** Low-friction entry that matches the ~5-friend reality.
- **The documentation + ADR culture (ADR-0001/0046).** The supersede-don't-edit discipline, the domain router, the backlog-as-flat-list — this is why the product model is *legible at all* and is a genuine asset for scaling the team.

---

## 13. V1 scope assessment

**The v1 proof (PRD §1):** *"Does this help one real group use Waypoint as its primary 'what now/next' reference for one full real trip?"* Classifications below are measured against that.

| Capability | Classification | User value | Learning value | Infra cost | Dependency cost | Consequence of omission | Recommendation |
|---|---|---|---|---|---|---|---|
| Now/Next board (temporal) | **Essential — built** | High | High | — | — | Fatal | Keep |
| Index (bookings+codes, offline) | **Essential — built** | High | High | — | — | Fatal | Keep |
| Documents (offline) | **Essential — built** | High | High | — | — | Fatal | Keep + honest wording (P-04) |
| Hard/soft + guard | **Essential — built** | High | High | — | — | Fatal | Keep |
| Shared sync + LWW + undo | **Essential — built** | High | High | — | — | Fatal | Keep |
| **Spatial answer (navigate + place data)** | **Essential — NOT built** | High | Very High | Medium | Google Cloud | **Thesis fails its spatial half** | **Build minimal (P-01)** |
| **Change-feed + per-item sync status** | **Essential — NOT built** | High | Very High | Medium | attribution (done) | **Collaboration advantage unrealized** | **Build (P-03)** |
| **`do-it-now` + real `swap`** | **Required support — NOT built** | Medium | High | Small | — | Deviate-safely loop incomplete | **Build (P-02)** |
| Emergency numbers (static) | **Keep if capacity** | Medium | Medium | Small | — | Worrier under-served | Build (P-09) — cheap |
| Maybe-shelf | Required support — built | Medium | Medium | — | — | Discovery weak | Keep |
| Ripple suggestion | Keep — built | Medium | Medium | — | — | Minor | Keep (add shared schema) |
| Multi-trip switcher | Keep — built | Medium | Low | — | — | Minor | Keep |
| Finished-trip archive+settle | Keep — built | Medium | Low | — | — | Minor | Keep; consolidate rule (P-06) |
| **Full Map research surface** | **Defer** | Medium | Medium | Large | Google Cloud | Discovery deferred | v1.1 (P-10) |
| **Calendar one-way sync** | **Defer or build-as-the-one-pipe** | Medium | Medium | Medium | Google Cloud | Toggle must be hidden | Hide toggle now; build Phase 4 (P-07) |
| Gmail import | **Defer** | High | Medium | Large | parsing | Manual entry covers it | v1.1 (as documented) |
| Weather / FX | **Remove from v1** | Low | Low | Medium | integration | None | Retire from docs (P-08) |
| Currency display | **Remove from v1** | Low | Low | Small | — | None | Retire from docs |
| Presence | **Validate manually** | Low | Medium | Small | — | Minor | Observe need first |
| Booking-presentation hero polish | **Done — freeze** | Medium | Low | — | — | None | Stop (P-05) |
| Overlapping in-progress trips | **Defer** | Low | Low | Medium | — | Rare | Keep deferred |
| Retrospective ("trip wrapped") | **Defer** | Low | Low | Medium | — | None | vNext |

### Recommended minimum convincing v1
Everything already built (Home/Index/Docs/Day/hard-soft/sync/undo/shelf/multi-trip/governance) **plus the three thesis-closing builds**: (1) minimal spatial answer (place authoring + Maps deep-link navigate); (2) change-feed + per-item sync status; (3) `do-it-now` + real/renamed `swap`. **Plus** honest document wording (P-04) and the doc-sync sweep (P-08). This is the smallest set that lets the real-trip test actually test the thesis.

### Recommended full v1
Minimum + emergency numbers (P-09) + a derived leave-by hint where coords exist (P-01) + calendar one-way sync as the single proof-of-pipes integration (P-07) + the product-rule catalog (P-06).

### Recommended v1.1
Full Map research surface (P-10) + Gmail import + presence (if validated) + weather/FX as real pipes + richer offline-readiness.

### Explicit non-goals (v1)
Two-way calendar sync (ADR-0003 trap); live GPS/presence location (ADR-0006); public/social/discovery; overlapping in-progress trips; multi-timezone per-event itineraries; AI/web enrichment; client-side document encryption (unless multi-tenant is pursued — P-04); expense splitting; shared photos; flight status; the retrospective.

---

## 14. Product-rule catalog

The authoritative statement of the rules currently scattered across ADRs (addresses P-06). Each: rule · rationale · applies to · exceptions · stored/derived · enforcement layers · offline · sync · tests · owning doc.

| # | Rule | Rationale | Applies to | Exceptions | Stored/Derived | Enforcement | Offline | Sync | Tests required | Owning doc |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | **Mode = derived from trip dates × clock (trip tz); never stored.** Live→Trip, else Plan. | ADR-0016 | all in-trip surfaces | manual override (live-window only, session, per-device) | Derived | client | works (derived) | not synced (personal) | mode-derivation unit tests (exist) | modes.md |
| R2 | **Trip mode exists only in the live window; override is one-directional (Trip→Plan).** | ADR-0040 | mode toggle | — | Derived | client | works | not synced | override visibility tests | modes.md |
| R3 | **Capability tier by blast radius: T1 on-item verbs, T2 single-item structural (sheet), T3 trip-level (Plan only).** | ADR-0025 | all edits | — | rule (derived gate) | client UI + server authz | verbs queue; T3 online-ish | per-op Change | tier-gating tests | modes.md + §14 |
| R4 | **Day-scope gating (Trip mode): past day = no create/edit/move (settle allowed); future = all but do-it-now; today = full.** | ADR-0029/0027 | day view verbs | Plan mode ignores day-scope | Derived (dayScope) | client | works | settle syncs | day-scope tests | ADR-0029 |
| R5 | **Trip-phase editability: live-past-day (Trip) read-only+settle; live-past-day (Plan) fully editable; finished trip = frozen structure, settle-editable.** | ADR-0044 | day view, settle | — | Derived (tripPhase) | client + server (settle is a permitted write) | settle offline-syncable | status Change | the 3-case table tests | ADR-0044 |
| R6 | **Hard-event edits require confirmation; hard events are never auto-moved or rippled.** | ADR-0011 | events kind=hard | — | Stored (`kind`) | client prompt + **server 409 gate** | queues with confirm | Change | hard-guard tests (exist) | ADR-0011 |
| R7 | **Soft events: freely moved; server-authoritative row-level LWW; own-last-action undo.** | ADR-0012/0019 | events kind=soft | — | Stored + LWW | server | queues | Change + undo inverse | LWW + undo tests | sync-and-offline.md |
| R8 | **Quick-verb name = state transition.** done/skip/restore/delay/earlier/**do-it-now**/**swap**/navigate. | ADR-0025/0027 | verbs | — | Stored (status/time) | client + server | queues | Change | per-verb tests | §14 + ADR-0027 |
| R9 | **Booking↔Event strict 1:1 optional; Event owns time; location only via Place; unlink ≠ delete.** | ADR-0047/0048/0051 | bookings/events | — | Stored (`bookingId @unique`) | server | reads cached | Change(s) | linkage tests (exist) | data-model.md |
| R10 | **Maybe = parking lot: an idea is parked, placed, done, or deleted — exactly one.** | ADR-0027 | maybe/soft | — | Derived union (consumed + status) | client | works | Change | shelf tests | ADR-0027 |
| R11 | **Time-presentation by category profile: bracketed (ends matter) + ambientWhenMultiDay; derived, keyed on category (+glyph override).** | ADR-0063 | all time-aware surfaces | — | Derived | client | works | — | profile tests (exist) | ADR-0063 |
| R12 | **Undo = own last action, appends an inverse Change; single-slot, no redo.** | ADR-0019 | verbs | — | Derived from Change | client | works | new Change | undo tests | sync-and-offline.md |
| R13 | **Archive: finished trip read-only structurally; settle editable; rename/delete admin-only.** | ADR-0040/0044/0039 | finished trip | — | Derived phase | client + server | settle offline | Change | archive tests | ADR-0040 |
| R14 | **Membership: everyday-open; governance admin-only, server-enforced; last-admin auto-promote; removal writes a TripBlock + evicts socket.** | ADR-0039/0067/0074 | trip/roster | — | Stored (role, TripBlock) | **server** | mutations queue; join online-only | Change (roster on data-plane) | authz tests (exist) | collaboration-model.md |
| R15 | **Documents: server-side encrypted at rest; offline after first online open; local wipe on sign-out. (Not private from the operator.)** | ADR-0015/0034/0058/0066 | documents | — | Stored blob | server | cached after open | in snapshot | doc tests (exist) | ADR-0034 |
| R16 | **Offline mutations: all shared state via the outbox (client id, write-through, device-wide FIFO flush); server-only actions (create/join/invite) disabled offline.** | ADR-0042 | all writes | create/join/invite | — | client + server | the point | idempotent re-POST | outbox tests (exist) | sync-and-offline.md |
| R17 | **Real-data-only surfaces: never fake a capability; an unbacked element shows an honest empty/add state.** | ADR-0045 | Home + all | — | — | client | — | — | glance/quick tests | ADR-0045 |
| R18 (**new**) | **A control/label may not imply a capability the system lacks** (integration toggles, security words, navigate targets). | this review (P-04/P-07/P-01) | settings, docs, navigate | — | — | client | — | — | copy/gating tests | §14 |

R8's `do-it-now`/`swap` and R18 are the rules the build does not yet satisfy.

---

## 15. Capability and infrastructure alignment matrix

For each recommendation: product capability · user outcome · existing infra · missing capability · FE · BE · data-model · API · sync · offline · permission · integration · migration · operational · testing · stage. Also classified as **[PL]** product-limitation, **[IG]** implementation-gap, **[AD]** architectural-debt, **[DD]** deliberate-deferral.

**P-01 Minimal spatial answer** — outcome: user gets where/when/how without leaving the app. Existing: `Place` + FKs, `PATCH /places`, real-data-only rule. Missing: place authoring UI, Maps deep-link, optional leave-by. FE: Places picker (or interim name-only authoring) + `navigate(event)` + optional Map orientation. BE: none for deep-link; optional Distance Matrix proxy. Data-model: none (fill nullable Place cols). API: exists (`/places`). Sync: places are data-plane (done). Offline: deep-link hands to Maps; leave-by heuristic offline. Permission: everyday. Integration: Google Maps/Places (needs Cloud setup). Migration: none. Operational: Maps API key + quota/billing. Testing: place-resolution + navigate-target unit tests + a "no target → no navigate" test. Stage: **Phase 1 (interim navigate) → Phase 4 (full Map)**. Class: **[IG]+[DD]** (the surface was deferred; the thesis dependency makes the interim an implementation gap).

**P-02 Complete deviate-safely verbs** — outcome: one-tap slip recovery; no lying verbs. Existing: move+ripple+past-guard. Missing: `doItNow`, real `swap`. FE: `verbs.ts`. BE: none (move endpoint suffices). Data-model: none. API: exists. Sync: Change+ripple. Offline: queues. Permission: everyday. Integration: none. Migration: none. Operational: none. Testing: verb-transition tests. Stage: **Phase 1**. Class: **[IG]**.

**P-03 Change-feed + per-item sync status** — outcome: group awareness + save confidence. Existing: `Change` (actor/before/after), WS stream, outbox pending/failed, real attribution. Missing: feed UI + `SyncStatusModel` + standardized `Change.after`. FE: `ChangeFeed` + `SyncBadge` + retry surface. BE: standardize `after` payloads (backlog). Data-model: none. API: `/changes` exists for initial fill. Sync: read over existing stream. Offline: hydrates on catch-up; pending shown. Permission: shared-state only. Integration: none. Migration: none. Operational: none. Testing: feed-render + sync-status-derivation tests. Stage: **Phase 1**. Class: **[IG]**.

**P-04 Honest document promise / (later) E2E** — outcome: security wording matches reality. Existing: server-side encryption, blob cache, sign-out wipe. Missing (now): accurate copy; (later) client-side encryption + key exchange. FE: copy now; decrypt pipeline later. BE: key model later. Data-model: none now; re-encryption migration later. API: none now. Sync: encrypted blobs already opaque. Offline: on-device decrypt (later) under teardown rules. Permission: decryption = membership; revocation must revoke key access (later, hard). Integration: none. Migration: one-way re-encryption (later). Operational: key management (later). Testing: copy/gating now; crypto tests later. Stage: **Phase 0 (wording) → gated on multi-tenant (E2E)**. Class: **[PL]** (single-operator limitation) now; **[AD]** if multi-tenant is pursued without it.

**P-06 Rule catalog + capability resolver** — outcome: one answer to "what can I do here." Existing: derivations in `mode.ts`/`time.ts`. Missing: `capabilities.ts` resolver + the §14 catalog. FE: resolver consumed by surfaces. BE: none (UI gating; server authz stays authoritative). Data-model: none. API: none. Sync: none. Offline: derived. Permission: resolver ≠ authz. Migration: none. Operational: none. Testing: resolver truth-table tests. Stage: **Phase 3**. Class: **[AD]** (debt-prevention).

**P-07 Calendar sync (or hide toggle)** — outcome: trip events in personal calendars, or no dead toggle. Existing: `CalendarEventLink`, flag, `PATCH /members/me`. Missing: calendar module, calendar scope, incremental consent. FE: hide/label now; consent redirect later. BE: calendar service (one-way, fire-and-reconcile). Data-model: none. API: none new (uses link table). Sync: side-effect of event Change, non-blocking. Offline: push is online-only server work. Permission: per-member consent (own scopes). Integration: Google Calendar (Cloud setup). Migration: none. Operational: token refresh/revocation handling. Testing: idempotency (link table) + one-way-only tests. Stage: **hide Phase 0; build Phase 4**. Class: **[DD]** (build) / **[IG]** (the dead toggle).

**P-08 Doc-sync sweep** — outcome: docs describe reality. Existing: schema/entities authoritative. Missing: refreshed data-model.md/PRD/catalog/overview/personas. All-else: none. Stage: **Phase 0**. Class: **[IG]** (documentation).

**P-09 Emergency numbers (static)** — outcome: offline emergency reference. Existing: destinations registry pattern. Missing: country→numbers table + a small view. FE: view. BE: none. Data-model: none (static in shared). API: none. Sync: none. Offline: bundled. Permission: read-only. Integration: none. Migration: none. Operational: keep the table current (rare). Testing: table + country-resolution tests. Stage: **Phase 2**. Class: **[IG]**.

**P-11 Time/offline disclosure** — outcome: trusted "now" + visible offline-readiness. Existing: tz-correct derivation, blob cache. Missing: blank-end default-duration rule, offline-readiness indicator, clock label. FE: indicator + label; `time.ts` rule. BE: none. Data-model: none. API: none. Sync: none. Offline: the indicator is the offline-trust surface. Permission: none. Migration: none. Operational: none. Testing: time-rule + indicator tests. Stage: **Phase 2**. Class: **[IG]**.

**Distinguishing summary:** almost every gap is an **[IG]** (implementation gap on an existing, capable substrate) or **[DD]** (deliberate deferral) — **not** architectural debt or product limitation. That is the good news: the data model, sync engine, and permission model already support what the product needs; the missing pieces are surfaces and consumers, not foundations. The two genuine **[PL]/[AD]** items are the document trust model under multi-tenancy (P-04) and the rule-scatter debt (P-06).

---

## 16. Recommended target product (next coherent milestone)

- **Core promise:** the shared, offline-first live layer that always knows what's now, what's next, **where it is and when to leave**, every code and document, and keeps the whole group on the same page without re-messaging.
- **Primary user:** a member of a ~5-person peer group, on the ground, on a phone, with unreliable signal.
- **Primary moment:** opening the app to answer "what now / next / in 30 minutes" — and getting the *whole* answer (temporal + spatial), then acting or adjusting in one tap that the group sees.
- **Required capabilities:** Now/Next board (temporal, built) + **minimal spatial answer** (navigate + place data) + Index/documents offline (built, honestly worded) + hard/soft + complete deviate-safely verbs + shared sync **with awareness** (change-feed + per-item status).
- **Supporting capabilities:** maybe-shelf, ripple, undo, multi-trip switcher, governance, emergency numbers, readiness checklist, finished-trip archive.
- **Explicitly excluded:** full Map research, Gmail, weather/FX, presence/GPS, overlapping trips, retrospective, two-way calendar, AI enrichment, client-side encryption (unless multi-tenant).
- **Mode model:** unchanged — one surface, two derived modes, live-window override; consolidated behind one capability resolver + rule catalog.
- **Surface model:** four tabs, but **Map earns its slot** with a minimal orientation job (or is demoted until it does). Home stays the live summary + gains a change-feed entry. Index unchanged. Day-by-day gains the complete verb set.
- **Collaboration model:** unchanged engine (LWW + undo) + **the awareness layer it always promised** (feed + per-item status). Presence stays "who's a member," GPS excluded.
- **Offline contract:** unchanged (strong) + explicit per-document/pre-departure offline-readiness surfacing.
- **Trust model:** every derived number is real or absent (ADR-0045); every control matches its capability (R18); documents' guarantee is stated accurately; "now" is labeled when device≠trip zone.
- **Integration model:** pipes-only (ADR-0004); Maps deep-links + (optionally) one-way calendar as the proof; everything else v1.1 pipes.

This is buildable on the existing substrate — the milestone is mostly *consumers of capabilities that already exist* plus one bounded integration (Maps deep-links + place authoring).

---

## 17. Feature and capability specifications

Compact product specs for the high-priority recommendations. States listed use only applicable ones (others noted).

### 17.1 Minimal spatial answer (P-01)

- **User problem:** on the ground, no answer to "where is it / when to leave / navigate."
- **Desired outcome:** for a place-resolved event, one-tap directions and (where coords exist) a leave-by hint; a minimal Map orientation.
- **Entry points:** the board Now/Next card; the day-view event card (`navigate` verb); the Map tab; the "next place" quick-access tile (returns per ADR-0045 when place data exists).
- **Product rules:** R11 (place resolution), R17 (real-data-only), R18 (no guessed target); navigate offered only when the event resolves to a usable place; leave-by shown only when travel time is estimable.
- **States:** Initial (no place → no navigate, honest); Ready (place → navigate enabled); Loading (Places lookup, Plan-time only); Empty (no place authored → "add a place" affordance); Offline (deep-link still works; leave-by via heuristic); Failed (Places lookup fails → fall back to name-only); Unauthorized n/a (everyday); Deleted (place removed → navigate disappears). *Saving/Pending/Conflicted* apply to place *authoring* via the normal outbox, not to navigate itself.
- **Edge cases:** ambiguous free-text place → no deep-link (name-only); transport event → target is the origin (ADR-0048); multi-day ambient → check-in place is the target near check-in.
- **Permissions:** any member authors places + navigates.
- **Offline contract:** navigate deep-links offline (Maps owns offline); leave-by from cached coords + heuristic; live Distance Matrix degrades to heuristic.
- **Sync contract:** places are data-plane (Change + outbox); navigate is a read.
- **Data requirements:** `Place` with `googlePlaceId` or lat/lng (enrichment) or an unambiguous address.
- **API requirements:** `POST/PATCH /places` (exist); optional server Distance-Matrix proxy.
- **Migration:** none (fill nullable columns).
- **Analytics/validation:** navigate taps; spatial-questions-answered-in-app vs handed-to-Maps; missed-anchor incidents.
- **Non-goals:** in-app turn-by-turn, live location, offline tiles, full research.

### 17.2 Change-feed + per-item sync status (P-03)

- **User problem:** peer changes are silent; save confidence is global-only.
- **Desired outcome:** "Noam moved ramen to 20:00 · 2m" awareness + a per-item synced/pending/failed marker with retry.
- **Entry points:** a quiet feed affordance on Home; per-row badges on Day-by-day/Index; a review-failed surface.
- **Product rules:** R7/R12 (LWW+undo), R16 (outbox), plus "shared mutations are attributable and surfaced; no silent drop."
- **States:** Ready (synced, no badge); Saving (optimistic); Pending (queued offline); Saved (confirmed); Failed (badge + retry); Conflicted (LWW resolved → shown in feed, undoable); Offline (feed hydrates on reconnect); Unauthorized (server 404/409 → surfaced, not dropped). Initial/Loading/Empty apply to the feed panel.
- **Edge cases:** an offline-created entity referenced by another before flush (client ids make it safe); a peer edit to an item you have pending (LWW; feed shows both).
- **Permissions:** all members read the feed (shared-state only; never personal prefs).
- **Offline contract:** feed = catch-up buffer on reconnect; pending items show pending.
- **Sync contract:** feed reads the existing WS `change` stream + `/changes` initial fill; status derives from the outbox.
- **Data requirements:** `Change` (exists); standardized `after` payloads.
- **API requirements:** `/changes` (exists); standardize service `after` writes.
- **Migration:** none.
- **Analytics/validation:** WhatsApp re-confirmations avoided; feed opens; failed-save recoveries.
- **Non-goals:** push notifications, GPS presence, a full activity-log screen.

### 17.3 Complete deviate-safely verbs (P-02)

- **User problem:** slip recovery isn't one-tap; `swap` lies.
- **Desired outcome:** `do-it-now` retimes to now (+ripple); `swap` truly replaces (or is renamed).
- **Entry points:** slip cluster (Home/Day), event card verb strip.
- **Product rules:** R8 (name=transition), ADR-0027 §3 (do-it-now past-guard exempt), R6 (hard events route through the confirm gate).
- **States:** Ready; Saving (optimistic move); Pending (offline queue); Saved; Failed (toast + retry); Conflicted (LWW); Offline (queues). Others n/a.
- **Edge cases:** do-it-now onto an occupied "now" (concurrency handling); do-it-now on a hard event (confirm gate); swap across days (Plan concern, blocked in Trip).
- **Permissions:** everyday (soft); hard via confirm.
- **Offline/sync:** standard move Change + ripple; undoable.
- **Data/API:** `POST /events/:id/move` (exists).
- **Migration:** none.
- **Analytics/validation:** do-it-now usage; swap comprehension; verb error rate.
- **Non-goals:** verbs beyond the ADR-0025 set.

### 17.4 Emergency numbers (P-09)

- **User problem:** no offline emergency reference for the Worrier.
- **Desired outcome:** local emergency numbers by destination, offline.
- **Entry points:** Index practical section (or a small Home practical card).
- **Product rules:** R17 (real-data-only — a static table is real data).
- **States:** Ready; Empty (country unresolved → manual country pick); Offline (bundled — always available). Others n/a.
- **Edge cases:** free-text destination that doesn't resolve → manual override; multi-country trips → show by current/selected country.
- **Permissions:** read-only, all members.
- **Offline/sync:** fully offline; no sync (static).
- **Data/API:** a static `country → {police, ambulance, fire, ...}` table in `packages/shared`; none.
- **Migration:** none.
- **Analytics/validation:** was it reached; correct/available offline.
- **Non-goals:** live emergency services, geolocation.

### 17.5 Honest document guarantee (P-04, wording track)

- **User problem:** "encrypted" implies private-from-host; it isn't.
- **Desired outcome:** copy that matches the operator-access reality; E2E only if multi-tenant.
- **Entry points:** upload sheet, document list, a docs-trust note.
- **Product rules:** R15, R18 (no capability-implying label).
- **States:** all document states unchanged; only copy changes.
- **Edge cases:** the multi-tenant deployment decision → triggers the E2E track.
- **Permissions:** unchanged.
- **Offline/sync:** unchanged.
- **Data/API/migration:** none (wording).
- **Analytics/validation:** does copy match model; (if E2E) a security review.
- **Non-goals:** client-side encryption for the single-group v1 proof.
---

## 18. Maintainable product and implementation architecture

The recommendations must not be shipped as unrelated tickets. Resolve shared foundations first.

### Product foundations (define/confirm before any surface work)
- **Canonical terminology:** *event* (hard/soft), *booking*, *place*, *maybe/idea*, *phase* (derived), *mode* (derived), *tier*, *day-scope*, *trip-phase*, *bracketed/ambient*. Publish once (glossary in modes.md/data-model.md); every doc and label uses these words only.
- **Product modes:** R1–R2 (derived, live-window override) — settled; keep.
- **Trip lifecycle:** R13 + the 3-case editability table (ADR-0044) — consolidate into one state machine (§18 domain model).
- **Entity ownership:** R9 (Event=time, Place=location, Booking=commitment) — settled; keep.
- **State definitions:** stored vs derived per entity (§9) — publish the split so no one stores a derivable state.
- **Permissions:** R14 (everyday-open, governance server-enforced) — settled.
- **Offline guarantees / sync guarantees:** R16/R7/R12 — settled; add the offline-readiness *surfacing* (P-11).
- **Error taxonomy:** the global envelope + codes (ADR-0070) — settled; extend with the failed-shared-write UX (P-03).
- **Trust & freshness indicators:** R17 + R18 + P-11 — the *new* foundation this review adds; every surface consults it.
- **Integration provenance:** `source`/provenance on entities (ADR-0004/modes.md 🔭) — keep separable for future enrichment.

### Domain model
- **Preserve as-is:** User, AuthIdentity, Session, Trip, Membership, Event, Booking, Place, Document, MaybeItem, Change, Invite, TripBlock, CalendarEventLink. The model is sound and *ahead* of the UI.
- **Extend (fields, no new entities):** `Place` enrichment (`googlePlaceId`/lat/lng populated by the picker) for P-01; standardized `Change.after` for P-03. Static tables (emergency numbers, tz/currency-by-destination) live in `packages/shared`, **not** the DB (P-09) — they're reference, not trip state.
- **Relationships to clarify (docs, not schema):** the hard↔soft flip's effect on a linked Booking (P-model §9); unlink-vs-delete prompt semantics.
- **Derived state (never store):** now, phase, mode, bracketed/ambient, leave-by, sync-status, capability gates. **Persisted:** kind, status, times, roles, TripBlock, membership, blobs.
- **Invariants:** `Event.bookingId @unique`; place-authority (linked event's `placeId` null); one Invite per trip; a trip is never admin-less.
- **State machines to publish:** Event (status × phase), Trip (pre/live/past + archive), Membership (peer/admin/removed), Offline-mutation (optimistic→pending→synced|failed→conflict-resolved), Booking (linked/unlinked). §14 is the starting catalog.
- **Migration needs:** none for the v1-proof recommendations except (later) the document re-encryption if E2E is pursued.

### Shared contracts (`packages/shared`)
- Add: a `rippleSuggestion` response schema (currently unmodeled — backend §10); a `SyncStatus` enum (`synced|pending|failed`); a `ChangeFeedItem` view schema (actor + entity + before/after summary); a static `EMERGENCY_NUMBERS` table + `CATEGORY`-style helpers; `CategoryTimeProfile` (exists). Keep zod-first (ADR-0023).
- Error contract: add a documented failed-shared-write shape the feed/retry surface reads.
- No breaking changes to existing entity schemas.

### Backend capabilities
- **Endpoints:** none new for P-02/P-03 core (reuse `/events/:id/move`, `/changes`, WS). New: an optional Distance-Matrix proxy (P-01, later); a calendar module (P-07, Phase 4). 
- **Transactions/idempotency:** unchanged (already correct via `ChangeService`).
- **Standardize `Change.after`** (backlog deferred item) — a prerequisite for a clean feed (P-03).
- **Authorization:** unchanged (server authz stays the source of truth; the FE capability resolver is UI-only, R3).
- **Background work:** calendar push (fire-and-reconcile) only when P-07 is built; keep in-process (no queue needed at scale, per ADR-0065's bright line).
- **Metrics:** add reliability telemetry for sync flush/failed-writes (feeds P-03 + §22).

### Frontend capabilities
- **State ownership:** one `capabilities.ts` resolver (P-06); one `SyncStatusModel` derived from the outbox (P-03); one `ChangeFeed` store fed by WS + catch-up.
- **Cache/pending behavior:** unchanged (strong); surface per-item pending/failed (P-03) and per-doc offline-readiness (P-11).
- **Conflict presentation:** the feed shows LWW outcomes; per-item badges show failed; retry path.
- **Permission gating:** the resolver gates UI; never treat it as authorization.
- **Reusable patterns:** consolidate the editing grammar (defer to UI/UX U-01/U-02, but the *rules* those components enforce come from §14).
- **Capability detection:** navigate/leave-by shown only when place data + estimability exist (R18).

### Product surfaces (which consumes what)
- **Home:** change-feed entry, spatial answer on the board, offline-readiness in prep. **Day-by-day:** complete verbs, per-item sync badges. **Index:** honest doc wording, emergency numbers (or a small practical view), per-item sync badges. **Map:** minimal orientation (or demote). **Settings:** hide/label the calendar toggle. **No new top-level surface** — every recommendation feeds an existing tab (ADR-0004).

### Documentation ownership
- **Vision:** which pillars are v1 vs deferred. **Modes:** R1–R4 + glossary. **PRD:** the honest v1 scope (§13). **Feature-catalog:** re-phase. **Architecture (data-model/sync/collaboration/overview):** refresh to reality (P-08). **ADRs:** new decisions get new ADRs (spatial-answer scope; change-feed; do-it-now/swap; document-guarantee wording; the deployment-trust-domain decision). **API contract:** add the ripple + feed + sync-status shapes. **Product-rule catalog (§14):** the single authoritative rule statement — new. No rule is copied into multiple docs without pointing to the catalog.

### Testing architecture
- **Domain-rule tests:** the §14 catalog as a truth table (capability resolver). **API contract tests:** ripple/feed/sync-status schemas (OpenAPI contract spec exists). **Authorization tests:** unchanged (strong). **Sync tests:** feed hydration + per-item status derivation + failed-write surfacing. **Offline tests:** navigate deep-link offline; per-doc offline-readiness; emergency numbers offline. **Migration tests:** only if E2E docs (later). **E2E scenario tests:** the missing Playwright smoke (backlog) + the trip-mode loop (arrive → now/next → navigate → adjust → see feed). **Product acceptance tests:** the §21 real-trip criteria.

### Observability and analytics
- **Product events:** navigate taps, verb usage, feed opens, spatial-answered-in-app, offline doc opens. **Reliability events:** flush success/failure, WS reconnects, snapshot/catch-up. **Sync diagnostics:** failed-write counts, conflict counts. **Integration diagnostics:** (later) calendar push success. **Privacy:** no document contents, no location, no message contents; counts + coarse timing only (§22).

---

## 19. Recommendation dependency graph

| Rec | Product-decision prereq | Design prereq | FE prereq | BE prereq | Schema prereq | Sync prereq | Migration prereq | Enables | Blocks | Sequence |
|---|---|---|---|---|---|---|---|---|---|---|
| **P-08** doc-sync | §13 scope agreed | — | — | — | — | — | — | honest planning for all | everything's clarity | **1st (Phase 0)** |
| **P-04** wording | deployment trust-domain decision | copy | copy | — | — | — | — | honest docs promise | multi-tenant launch | Phase 0 |
| **P-06** rule catalog+resolver | §14 confirmed | — | resolver | — | — | — | — | consistent gating | future surface drift | Phase 0/3 |
| **P-02** verbs | ADR for do-it-now/swap | verb UX | verbs.ts | — (reuse move) | — | move+ripple | — | deviate-safely loop | slip recovery | **Phase 1** |
| **P-03** feed+status | feed scope ADR | feed/badge UX | ChangeFeed+SyncStatus | standardize `after` | SyncStatus/FeedItem schema | WS+catch-up (exist) | — | collaboration awareness | trust in shared edits | **Phase 1** |
| **P-01** spatial (interim) | navigate-scope ADR | picker/navigate UX | Places authoring+navigate | (opt) Distance proxy | Place enrichment (fields exist) | places data-plane (done) | — | leave-by, quick-tile, discovery | thesis spatial half | **Phase 1–2** (needs Google Cloud) |
| **P-09** emergency numbers | — | small view | view | — | static table (shared) | — | — | Worrier value | — | Phase 2 |
| **P-11** time/offline disclosure | — | indicators | time rule+indicators | — | — | — | — | trust in "now"/offline | — | Phase 2 |
| **P-07** calendar (build) | keep-or-cut decision | consent UX | consent redirect | calendar module | — (link table exists) | side-effect push | — | proof-of-pipes | — | Phase 4 (or hide toggle Phase 0) |
| **P-10** Map research | — | research UX | Map search→+maybe | — | Place (P-01) | shelf (done) | — | discovery loop | — | Phase 4 |
| **P-05** freeze polish | prioritization decision | — | — | — | — | — | — | capacity for P-01/P-03 | — | **immediate** |

**Critical path to a provable v1:** Google Cloud setup (human) → P-01 interim navigate + P-02 verbs + P-03 feed/status → real-trip test. P-08/P-04-wording/P-05 are near-free and go first. Ordering is by *thesis dependency*, never by visual impact.

---

## 20. Phased product roadmap

### Phase 0 — Resolve product contracts (near-zero build)
- **User outcome:** none directly; everyone (human + agent) works from an honest, single source of truth.
- **Product decisions:** confirm the honest v1 scope (§13); decide the **deployment trust-domain** (single-operator vs multi-tenant → gates P-04); decide **navigate-scope** and **change-feed-scope** (new ADRs); decide **calendar: hide or build**.
- **Frontend:** hide/label the calendar toggle (P-07); document-guarantee copy (P-04).
- **Backend:** none.
- **Data-model/sync/offline:** none.
- **Migration:** none.
- **Analytics:** define the §22 event set.
- **Validation:** a doc-vs-schema diff comes back clean.
- **Dependencies:** none.
- **Risks:** analysis-only paralysis — timebox it.
- **Exit criteria:** PRD/feature-catalog/data-model.md refreshed; §14 catalog published; the four decisions recorded as ADRs; no dead/lying controls remain.
- **Excluded:** any new feature build.

### Phase 1 — Protect the core promise (make Now/Next + shared state trustworthy)
- **User outcome:** on the ground, the user gets the *whole* now/next answer (incl. navigate) and can trust that their changes reach — and reveal — the group.
- **Product decisions:** the Phase-0 ADRs.
- **Frontend:** interim navigate + name-only place authoring (P-01); `do-it-now` + real/renamed `swap` (P-02); `ChangeFeed` + `SyncStatusModel` + `SyncBadge` + retry (P-03).
- **Backend:** standardize `Change.after` (P-03); (interim navigate needs no BE).
- **Data-model:** none (Place fields exist).
- **Sync/offline:** feed hydration on catch-up; per-item status from the outbox.
- **Migration:** none.
- **Analytics:** navigate taps, verb usage, feed opens, failed-write recoveries.
- **Validation:** internal dogfood of the trip-mode loop.
- **Dependencies:** Google Cloud setup for real place enrichment (name-only works meanwhile).
- **Risks:** Places/Maps setup latency — ship name-only + deep-link first.
- **Exit criteria:** a member can navigate to the next place, resolve a slip in one tap, and see + trust group changes.
- **Excluded:** full Map research, calendar, weather.

### Phase 2 — Complete essential trip journeys
- **User outcome:** the Worrier and the offline traveler are covered; "now" and offline-readiness are trustworthy.
- **Frontend:** emergency numbers view (P-09); offline-readiness indicators + clock label (P-11); leave-by hint where coords exist (P-01).
- **Backend:** (optional) Distance-Matrix proxy for leave-by.
- **Data-model:** static tables in shared (emergency, tz/currency-by-destination).
- **Sync/offline:** per-doc offline-readiness over the blob cache.
- **Migration:** none.
- **Analytics:** emergency-numbers reach, offline doc-open success.
- **Validation:** the §21 real-trip test can run against a complete loop.
- **Exit criteria:** the full-v1 set (§13) is built and honest.
- **Excluded:** calendar, Gmail, full Map.

### Phase 3 — Consolidate and simplify
- **User outcome:** fewer surprising states; a durable, maintainable model.
- **Frontend:** the `capabilities.ts` resolver adopted by all surfaces (P-06); consolidate the editing grammar (UI/UX U-01/U-02 — the *rules* from §14).
- **Backend:** retire any superseded paths; orphan-blob reconciler (backlog) if scale warrants.
- **Data-model/sync:** none.
- **Migration:** remove dead fixtures/util (weather, unused money) once docs are re-phased.
- **Analytics:** none new.
- **Validation:** new-feature reviews cite §14; fewer gating inconsistencies.
- **Exit criteria:** one rule catalog, one resolver, no duplicated gating logic.
- **Excluded:** new capabilities.

### Phase 4 — Validate and enrich (only what the real trip justified)
- **User outcome:** proven enrichments — the pipes that earned their place.
- **Frontend/Backend:** calendar one-way sync (P-07) as the proof-of-pipes; full Map research + discovery→shelf (P-10); weather/FX as real pipes if the trip showed demand; Gmail import (v1.1).
- **Data-model:** none new (all pipes feed existing entities).
- **Sync/offline:** calendar push online-only; Map research online, shelf offline.
- **Migration:** none (or E2E doc re-encryption if multi-tenant, P-04).
- **Analytics:** integration success rates.
- **Validation:** each enrichment gated on observed real-trip demand.
- **Exit criteria:** enrichments shipped only where the trip data justified them.
- **Excluded:** anything the real trip didn't demand.

---

## 21. Real-trip validation plan

The whole point of v1 (PRD §1). Design a low-intrusion field test with one real ~5-person group on one real trip.

### Before the trip
- **Setup:** organizer creates the trip, enters all bookings + documents + a place on each key event, invites the group; every member installs the PWA and signs in.
- **Data-completeness checks:** run the readiness checklist to green; confirm every hard anchor has a code and (where possible) a place; confirm documents are uploaded.
- **Participant onboarding:** each member opens the app once online (to seed the cache), opens each document once (to cache blobs), and confirms they can see the itinerary.
- **Offline preparation:** each member toggles airplane mode pre-departure and confirms the index + today + documents render (this *is* the offline-readiness test P-11 would automate).
- **Baseline interviews (5–10 min each):** "how do you coordinate on trips today?" (WhatsApp/Maps/screenshots baseline); "what do you expect to open this for?"
- **Usage hypotheses:** (H1) members open Waypoint first for "what now/next"; (H2) they navigate from the app; (H3) plan changes propagate without a WhatsApp message; (H4) the index works offline; (H5) the group doesn't fall back to screenshots for codes.

### During the trip (observational, non-intrusive)
- **Usage observation:** which surfaces get opened, when (near events?), by whom (all members or just the organizer?).
- **Behavioral signals:** app-opens near scheduled events; navigate taps; code/document opens; verb usage; feed opens.
- **Reliability signals:** offline incidents; failed writes; reconnect/catch-up events; any stale-data confusion.
- **Trigger-based micro-questions (one-tap, opt-in):** after a navigate ("did this get you there?"), after an offline session ("did everything you needed load?"), after a plan change ("did the group see it without you messaging?").
- **Offline incidents:** log every "no signal" moment and whether the needed info was there.
- **Collaboration incidents:** every plan change — did others notice via the app or via chat?
- **Workarounds adopted:** every time someone opens WhatsApp/Maps/screenshots *instead of* Waypoint — the single most important signal (each is a thesis leak).

### After the trip
- **Individual interviews:** what did you open it for; what did you fall back to; what did you trust/distrust.
- **Group retrospective:** did it keep us on the same page; what was missing.
- **Feature-use review:** the analytics vs the hypotheses.
- **Trust failures:** any wrong time/place/code/save; any "I thought it synced but it didn't."
- **Missing/unused capabilities:** what people wanted; what no one touched.
- **Comparison with alternatives:** for each job, did Waypoint or WhatsApp/Maps/screenshots win.

### Decision thresholds
- **Continue the current thesis** if: members opened it first for now/next, navigated from it, and mostly didn't fall back to Maps/WhatsApp for the core jobs (H1–H3 mostly true).
- **Narrow the scope** if: only the index/documents got real use (retrieval, not the live layer) → double down on the reference layer, reconsider the live-layer ambition.
- **Change the mode model** if: users were confused about what they could do where (validates P-06 urgency) or fought the auto-switch.
- **Invest in Map** if: the dominant fall-back was Google Maps for navigate/where (validates P-01 as the top priority) — likely.
- **Invest in richer offline editing** if: offline write conflicts caused real pain (unlikely at ~5).
- **Invest in integrations** if: manual booking/calendar entry was the main friction (→ Gmail/calendar).
- **Defer collaboration complexity** if: the group was small/synchronous enough that silent sync sufficed (would down-rank P-03 — test it explicitly).
- **Reconsider the PWA platform** if: install friction, iOS push/background, or offline-tiles were repeated blockers (revisit trigger already in PRD §3).

---

## 22. Product metrics

A small, privacy-conscious set. For each: question · event/source · required context · privacy constraint · interpretation limit · decision it informs. **No document contents, no location, no message contents, no free text** — counts + coarse timing only.

- **North-star:** *Did the group use Waypoint as the primary "what now/next" reference during the trip?* — Source: app-opens during the live window, weighted by opens within ±30 min of a scheduled event. Context: trip-phase, member. Privacy: open counts only. Limit: opens ≠ value; pair with interviews. Decision: continue/narrow the thesis.
- **Activation:** *Did all members get in and ready?* — % of invited who joined + opened once online + cached docs. Privacy: membership only. Limit: readiness ≠ usage. Decision: onboarding friction.
- **Preparation readiness:** *How complete was the trip at departure?* — readiness % at `startDate`; % hard anchors with code + place. Privacy: counts. Limit: completeness ≠ correctness. Decision: planning friction, P-01 place-data need.
- **During-trip engagement:** *Who engaged — all or just the organizer?* — distinct members opening per day. Privacy: member counts. Limit: lurkers read without acting. Decision: is it a group product or an organizer product.
- **Now/Next usefulness:** *Did Home answer without further navigation?* — Home-opens with no subsequent tab switch within N sec. Privacy: nav events. Limit: proxy. Decision: board sufficiency.
- **Spatial usefulness (P-01):** *Did users get spatial answers in-app?* — navigate taps; (if measurable) app→Maps handoffs vs in-app resolves. Privacy: tap counts, no coordinates. Limit: can't see what happened in Maps. Decision: Map/navigate priority.
- **Index usefulness:** *Did they retrieve codes/docs from the app?* — code/document opens. Privacy: open counts, never contents. Limit: proxy. Decision: index value (likely high).
- **Offline success (P-11):** *Did offline work when needed?* — offline sessions with ≥1 successful read; offline doc-open failures (un-cached). Privacy: counts. Limit: can't detect "gave up." Decision: offline-readiness surfacing.
- **Change propagation (P-03):** *Did group changes propagate + get noticed?* — changes made vs feed-opens vs (trigger-question) "seen without a message." Privacy: counts. Limit: noticing is self-reported. Decision: change-feed value.
- **Quick-action use (P-02):** *Did they adjust in-app?* — verb counts by type incl. do-it-now/swap. Privacy: counts. Limit: proxy. Decision: verb completeness.
- **Failure & recovery:** *Did anything break trust?* — failed writes, conflicts, reconnects, stale-data reports. Privacy: reliability counts. Limit: silent failures under-counted. Decision: reliability investment.
- **Post-trip retention:** *Did they return to the archive?* — post-`endDate` opens; settle actions. Privacy: counts. Limit: low signal. Decision: archive/retrospective value.
- **Fall-back rate (the anti-metric):** *How often did they use WhatsApp/Maps/screenshots instead?* — primarily qualitative (during-trip observation), since we can't instrument other apps. The single most decision-relevant signal — treat interviews as authoritative here.

Avoid: vanity opens-per-day without the near-event weighting; any metric that would need location or content capture.

---

## 23. Quick wins

Changes that clarify a rule or a journey, fit the target architecture, and make no unsupported promise (per the brief, a one-off UI patch is *not* a product quick win):

- **Hide/label the calendar-sync toggle (P-07).** Removes a control that lies. Tiny; pure honesty.
- **Correct the document-security copy (P-04 wording).** "Stored securely; the trip host can access files" — matches ADR-0034. Tiny; closes a trust over-claim.
- **Rename `swap` to match its real behavior (P-02, half).** Until a true swap ships, the verb must not lie (R8/R18). Tiny.
- **Refresh `data-model.md` from the schema (P-08, part).** Add `Invite`, `TripBlock`, `EventCategory`, `category`, `Trip.icon`. Restores the founding principle; unblocks correct future work.
- **Fix the overview offline model line** ("not offline: documents" → documents now cache). One line; prevents a wrong mental model.
- **Add the `rippleSuggestion` shared schema.** Closes a contract hole (backend §10) so the response is validated/serialized like everything else.
- **Add a pre-departure offline-readiness item to the prep checklist (P-11, part).** "All documents saved for offline ✓" — reuses the readiness pattern; converts an implicit guarantee into a visible one.

Each is small, durable, aligned with the target product, and reduces a real ambiguity or over-promise — not throwaway UI.

---

## 24. Open questions and assumptions

Grouped; each: why it matters · what depends on it · how to resolve · can work proceed before resolution.

**Product**
- *Is the spatial layer in v1 or v1.1?* — Decides whether the real-trip test can prove the thesis. Depends: P-01 phasing, roadmap. Resolve: a product decision now (this review recommends minimal-in-v1). Proceed: name-only place authoring can start regardless.
- *Is Map a primary nav tab or demoted until it has a job?* — IA coherence. Depends: nav structure. Resolve: decide with P-01. Proceed: interim navigate doesn't require the tab.
- *Is the change-feed in near-term scope, or is silent sync acceptable for ~5 synchronous travelers?* — Collaboration value. Depends: P-03. Resolve: a real-trip hypothesis (test H3 explicitly). Proceed: build per-item sync-status regardless (it's the save-trust half).
- *Retire weather/FX/currency from v1 docs, or keep as "coming"?* — Scope honesty. Depends: P-08/P-09. Resolve: cut from v1 (recommended). Proceed: yes.

**User research**
- *Do all members engage, or only the organizer?* — Whether it's a group product. Resolve: the real trip. Proceed: yes (design for peers, measure breadth).
- *Which fall-backs dominate (Maps vs WhatsApp vs screenshots)?* — Top-priority signal for P-01 vs P-03. Resolve: field observation. Proceed: yes.

**Design**
- *One editing grammar consolidation (UI/UX U-01/U-02) — scope now or Phase 3?* — Maintainability. Depends: P-06. Resolve: sequence after the thesis-closers. Proceed: yes (rules first, components later).

**Frontend**
- *Selected-day-in-URL, timezone auto-derivation, zoom/WCAG scope* — carried from the frontend/UI-UX reviews; product-adjacent but not thesis-blocking. Resolve: with those reviews' roadmaps. Proceed: yes.

**Backend**
- *Standardize `Change.after` now (prereq for the feed) or later?* — P-03 quality. Resolve: do it with the feed. Proceed: feed design can start.

**Data model**
- *Hard↔soft flip's effect on a linked Booking?* — An under-specified transition. Resolve: a small rule (recommend: flip is allowed; the booking link persists; presentation follows category profile). Proceed: yes.

**Synchronization**
- *Is per-item sync status the agreed direction, or is a global list enough?* (mirrors frontend Q2/UI-UX U-04). Resolve: a product decision (recommend per-item). Proceed: build the model; UI can start global and enrich.

**Offline behavior**
- *Should offline-readiness be surfaced per-document and pre-departure?* (P-11). Resolve: yes (cheap, high-trust). Proceed: yes.

**Permissions**
- *Any need beyond admin/peer for v1?* — feature-catalog defers the matrix. Resolve: keep two roles (ADR-0005). Proceed: yes.

**Integrations**
- *Build one-way calendar as the proof-of-pipes, or defer entirely?* — P-07. Depends: Google Cloud setup, capacity. Resolve: hide toggle now; decide build in Phase 4. Proceed: yes (hidden).

**Operations**
- *Single-operator/self-hosted vs multi-tenant deployment?* — **The pivotal question**: gates the document trust model (P-04), ADR-0034's validity, and future privacy posture (ADR-0065 flagged this exact boundary). Resolve: an explicit deployment-model decision + ADR. Proceed: v1 proof runs fine as single-operator; do **not** launch multi-tenant with server-readable passports until resolved.

**Privacy**
- *Does the analytics set (§22) stay content/location-free?* — Trust + the invite-only privacy stance. Resolve: adopt the §22 constraints as policy. Proceed: yes.

---

*End of Product Design Review. This document is advisory; it changed no product code or product docs. Its recommendations should be actioned in the phased order of §20, resolving the Phase-0 contracts (and especially the deployment-model question in §24) before dependent surface work.*



