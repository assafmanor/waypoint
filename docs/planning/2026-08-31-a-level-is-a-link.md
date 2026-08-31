# A level is a link — ADR-0213's tenth pass

**Date:** 2026-08-31
**Subject:** the owner asked for three privacy options at once instead of one. The answer turned out to delete a mechanism rather than add one, and costing it found a defect that is already live.

## What came in

> _"I want to change the trip sharing infra and sharing design. I want to be able to share with different privacy options (summary, full schedule, everything), and not choose only one. Different links, maybe link generated per viewing option idk. We need to mockup this and think how to do this."_

Drawn and measured in [`a-level-is-a-link-not-a-setting-v1.html`](../../mockups/a-level-is-a-link-not-a-setting-v1.html). The decision is [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s tenth amendment, §1–§6. **Proposed, not built.**

## The finding: this is a removal

The request reads like "add links". Reading `ShareItinerarySheet.tsx` first turns it into something better.

§5 gave the trip one link and made the level a **setting** on it. The third pass (2026-08-30) then had to make that setting write immediately — a debounced `upsertTripShare`, plus `levelSaved` (`הלינק החי מעודכן · תקציר`) whose only job is to say out loud that the link just changed under whoever already holds it. Both exist purely because one link carries a level. They are the smallest honest repair to a model that cannot serve two audiences, not features anyone wanted.

Make the level the link's identity and all of it goes: no draft, no debounce for the level, no announcement, and no way for a URL in someone's hands to start showing something else. **The proposal is less code than what ships**, and the rendered sheet is the same height as today's — 525.6px against 525.6px.

The generalisable form:

> When a request asks for a capability, check whether the thing blocking it is a repair. A mechanism that exists only to make a limitation survivable is not load-bearing; it is the limitation's shadow, and it leaves with it.

## The other finding: the migration is free, and the schema said so

`TripShare` already stores `detailLevel` per row. Swapping `tripId @unique` for `@@unique([tripId, detailLevel])` is satisfied trivially by every existing row, so **no data moves and no shipped `/s/<code>` stops resolving**. `upsertTripShareSchema` already carries `detailLevel`, so `PUT` needs no shape change at all, and today's `DELETE …/share` ("stop sharing this trip") is already exactly the stop-all button the design needs.

That was written down a year of sessions ago: the schema comment at `TripShare` says _"One row per trip (`tripId @unique`) is the v1 decision … several independently revocable audience links is an access-management feature"_, and the backlog line repeated it. **A deferral that names its own lift is worth more than one that just says "later".**

## Costing it found something already broken

Three links means up to three `ItineraryNarrative` rows, since the cache is keyed by `shareId`. Chasing whether that could be deduplicated found that it should never have been per-share: the narrative input is built from _this_ projection's days, and `placeName` is set only after the Summary early return — so **the same trip already generates a different narrative depending on which level opens it, today, with one link**.

The fix is two lines of policy (key on `tripId`; include `placeName` at every level, which is Summary-public already since it reaches the model through `routeLabels`), and it is correct with or without multi-link. It is in the backlog as its own item, not buried in the feature's.

## What the render found, which reading could not

The measurement table first reported the sheet's group gap as **12px**. The app's is 16px, and the ADR says so.

`.modal-form` sets `gap: var(--space-3)` and `.share-sheet` sets `gap: var(--space-4)` — both a single class, so the winner is decided purely by which stylesheet is emitted last. My manifest listed `screens.css` first, copied from `sharing-and-inviting-are-one-control-v1.html`, which lists it first too. The app's order is the opposite: `App.tsx` imports `screens/Home` at :64, which reaches `HostTasks` → `TaskSheet` → `FormActions` → `form-actions.css` long before its own `import './screens.css'` at :113.

The previous file never saw this because its own proposed block re-declared `.share-sheet { gap: var(--space-4) }` on top of the inlined cascade — it was measuring its proposal, which happened to be the right number, for a reason that had nothing to do with the manifest. **An inlining mockup's manifest is not a list of sheets it needs; it is a claim about the app's cascade**, and a specificity tie is where a wrong claim shows up.

## Forks put to the owner, and the answers

None yet — this is the drawing. Three are named in the mockup's notes panel and the amendment's §6, with a recommendation each:

1. **Level-keyed links (recommended) against arbitrary named links.** Named links are the backlog's real access-management item and need a label field, a list screen and a divergence policy; the question asked is answered in full without them, and the schema path stays open.
2. **The live mark's hue** — `--ok` recommended, from rule 4 rather than taste: a live link is a status, and `--cta` resolves to `var(--ink)` in light where it merges with the selected card's own ring. Both are a control in the file.
3. **The mark's diameter**, 7px against 9px, left to a device pass because a dot's weight cannot be settled in a desktop screenshot.
