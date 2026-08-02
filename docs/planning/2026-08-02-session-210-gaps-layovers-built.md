# 2026-08-02 · session 210 — the day's gaps, and the journeys inside them

Designed and built in one session: [`mockups/day-gaps-and-layovers-v1.html`](../../mockups/day-gaps-and-layovers-v1.html) → [ADR-0159](../decisions/0159-the-day-says-what-is-between-two-events.md). The decisions and their reasons live in the ADR; this note is only what the **build** found that a future session would otherwise re-derive.

## What the design round cost, and why it was worth two passes

The first mockup drew the layover as a dotted rail in the badge column. The owner read it on a phone and the report was one sentence — _"the striped line in the layover gap does not sit well between the flights"_ — with a screenshot of the case that made it obvious: a now-line landing between the two legs, cutting the rail in half. Neither the drawing nor the arithmetic in the file could have caught that, because both were about the rail in isolation. **The frame that broke it was the one with a neighbour in it**, which is the reusable lesson: draw the mark beside the thing most likely to collide with it, not alone.

## Three build findings

- **Legs are normalised on READ, not kept in sync by a setter.** `BookingSheet` holds `legs: LegTimes[]` while the number of legs comes from the route (`stops + 1`), so the two can disagree for a render when a stop is added. `resizeLegs(legs, legCount)` at read time makes the mismatch unrepresentable; a `useEffect` syncing them would have been a second source of truth with a frame of lag.
- **The step table had to become a function.** `STEP_FIELDS` was exhaustive over the field union by `satisfies`, which is impossible once field names carry an index (`out-start-1`). `stepOf(field)` is **total** instead of exhaustive — every field has a step or it does not compile — which is the property the table was standing in for. Recorded in ADR-0155's amendment because the next stepped form will meet the same wall.
- **Six round-trip tests failed on the step count, and that was the design landing.** The return moved to its own step, so a round trip is four steps. Every failure was a `next()` count or a label, none was behaviour — but it is worth noting that the suite had encoded the three-step flow in six places, which is what made the change visible rather than silent.

## One thing that is NOT ours

`backend`'s unit suite fails 149 tests on `main` as well (`Property 'user' does not exist on type 'PrismaService'` and friends) — it needs `prisma:generate` plus a database. Verified by stashing the branch and re-running. Frontend + shared are green (2397 + 122).

## The groundwork left behind

The owner asked for the now-line to eventually say where we actually are, **inside** a running event. Nothing about that shipped, but the placement moved to `lib/now-line.ts` as one derivation with two hosts and an object return, so the generalization is an added field rather than a rewrite of two inline copies. Backlogged with the open questions named.
