# 0111 — Places field mask stays at the Pro tier; `rating`/`userRatingsTotal` deferred off the Phase-1 pick

**Status:** Accepted (implementation-time cost decision for the Places picker's Phase-1 backend slice)
**Date:** 2026-07-23
**Refines:** [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §3 (discharges its explicit "confirm the field→tier mapping against Google's live docs at implementation, don't hardcode a recalled one" accuracy note, and pins the concrete field mask the proxy sends), [0109](0109-map-tab-design.md) §9 (defers the "cached Google rating pulled into Phase-1 enrichment" call — the columns land, the paid fetch doesn't yet) (relates [0106](0106-maps-and-places-epic-scope-and-phasing.md) §5 cost discipline, [0110](0110-maps-and-places-frontend-architecture.md) the FE contract)

## Context

ADR-0108 §3 set the rule — "request only what we cache, stay in the cheapest SKU tier that returns those fields" — and deliberately left the exact field→tier mapping to be confirmed at implementation, because Google's tiers move (the ADR-0106 accuracy note). Building the Phase-1 proxy forced that confirmation. Against Google's **live** Place Details (New) field→tier list (confirmed 2026-07-23, not recalled):

| Field (mask path)                    | SKU tier       |
| ------------------------------------ | -------------- |
| `id`, `formattedAddress`, `location` | **Essentials** |
| `displayName`                        | **Pro**        |
| `rating`, `userRatingCount`          | **Enterprise** |

You are billed at the **highest** tier present in the mask. So the field set ADR-0109 §9 wanted cached on the pick — `id` / `name` / `address` / `location` **+ `rating` / `userRatingCount`** — spans Essentials + Pro + Enterprise and bills every pick at **Enterprise** (~$20/1,000, **1,000**/month free). Dropping the two rating fields bills at **Pro** (~$17/1,000, **5,000**/month free). `rating`/`userRatingCount` are the _only_ Enterprise-tier fields in the set — there is no cheaper way to obtain a rating.

Two facts make this a real choice rather than a rounding error, even though ADR-0106 §5 established that steady-state spend at this app's scale (small groups, dedup-before-spend, each place enriched at most once per trip) sits inside either free tier: including the rating **cuts the free-tier headroom 5×** (5,000 → 1,000 picks/month), and **nothing in the Phase-1 backend slice — or in Phase 2/3 — renders a rating yet** (the ★ meta tag is later FE work). So the paid Enterprise fetch would buy nothing observable now while spending the scarcer allowance.

## Decision

**The Phase-1 Place Details field mask is `id,displayName,formattedAddress,location` — the Pro tier — and `rating`/`userRatingsTotal` are deferred off the pick.** The `Place.rating` / `Place.userRatingsTotal` columns (and their `@waypoint/shared` `placeSchema` mirror) are **still added** as specified — they are cheap, nullable, and part of the migration — they simply stay `null` until we opt in. Opting in later is a **one-line change** to the field mask constant in `google-places.client.ts`, with no migration and no schema change.

- The mask lives as one named constant (`PLACE_DETAILS_FIELD_MASK`) with the tier reasoning in a comment beside it, so the cost lever is legible at the one place it's set (ADR-0108 §3).
- The columns exist so that (a) the schema matches ADR-0109 §9 / ADR-0110's data model, keeping the FE/BE shapes in sync (non-negotiable rule 3), and (b) turning ratings on is a mask edit, not a migration under load.

**Why keep the columns rather than drop them too:** ripping them out would contradict ADR-0109 §9 / ADR-0110 (which mirror them in `placeSchema` and the map's rendering plan) and force a second migration when ratings are wanted. A nullable column with no writer costs nothing; a schema divergence between the layers costs a bug. The reversible, low-cost half (the columns) ships; only the recurring-cost half (the Enterprise fetch) waits.

## Consequences

- **Every Phase-1 pick bills at the Pro tier** (~$17/1,000, 5,000/month free) instead of Enterprise (~$20/1,000, 1,000/month free) — 5× the free headroom, for a star nothing renders yet.
- **`Place.rating` / `Place.userRatingsTotal` are present but always `null` in Phase 1.** Any consumer must treat them as optional (they already are, in `placeSchema`).
- **Turning ratings on is a deliberate, one-line, documented step**, taken when a surface actually renders the ★ (Phase 2/3) and the Enterprise tier is a conscious trade — not an accident of the mask. The `PLACE_DETAILS_FIELD_MASK` comment says exactly what to add and what it costs.
- **ADR-0108 §3's accuracy note is discharged**: the field→tier mapping is confirmed against live docs and recorded here, so the next session doesn't re-recall it.
- **The cost model in ADR-0108 §4/§5 is unaffected** — dedup-before-spend, the per-member·trip throttle, and the Phase-0 budget alert / per-SKU quota cap all still bound spend; this only lowers the per-pick tier and widens the free headroom.

## Alternatives considered

- **Include `rating`/`userRatingCount` now (Enterprise tier), as ADR-0109 §9 literally specced.** Rejected for Phase 1: it spends the 5× scarcer Enterprise allowance for a field no surface renders until a later phase. Revisit when the ★ is actually built.
- **Drop the `rating`/`userRatingsTotal` columns entirely (not just the fetch).** Rejected: it diverges the `Place` shape from ADR-0109 §9 / ADR-0110 and forces a second migration to add them back. A nullable, writer-less column is free; keeping the data model whole is worth it.
- **A runtime/env flag to include the atmosphere fields per request.** Rejected as premature: the mask is a single constant and the opt-in is a one-line edit reviewed as code — a config knob adds surface area for no current need (ADR-0096 reuse-before-adding).
