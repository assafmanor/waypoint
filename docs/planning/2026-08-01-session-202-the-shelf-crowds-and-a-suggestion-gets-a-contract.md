# 2026-08-01 · session 202 — the shelf crowds, and a suggestion gets a contract

**Output:** one mockup, one new ADR, one amendment. **No production code.** Everything below is designed and none of it is built.

- [`mockups/shelf-crowded-v1.html`](../../mockups/shelf-crowded-v1.html) — catalogued in [design/mockups.md](../design/mockups.md)
- [ADR-0151](../decisions/0151-a-suggestion-has-a-source-and-a-reason.md) — the suggestion contract + strategy registry
- [ADR-0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) — session-202 amendment, the shelf itself
- [backlog.md](../backlog.md) — one line, decided-not-built, carrying the six-step build order

This note is orientation only. The ADRs are the decision and the backlog is the work; **do not cite this file to justify anything** (root `CLAUDE.md`, durable vs. scratch).

## How it went

Started as a consultation, not a task: _"I want to consult the behavior and look of the maybe cards + shelf"_, with two reports — finding a card among tens of ideas, and the cards being large next to the events.

Reading the tree turned two reports into five findings, and the third was the one nobody had reported: `GapFillSheet` is handed `maybeItems.filter((m) => !m.consumed)` (`PlanDay.tsx:920`), the whole pool, unsorted and unsearchable, on the surface whose entire question is _which idea fits this slot_. It is invisible because that sheet is opened far less often than the shelf is looked at, and it is the worse of the two.

The finding that reframed the rest: **ADR-0116's own Consequences deferred a shelf filter row with a condition attached** — _"earn it when the strip crowds"_ — and deferred the pool sort beside it. ADR-0115 then put `＋ אולי` one tap from a Google result and ADR-0135 put `＋ שיבוץ ליום` on the map's place card. Supply rose an order of magnitude while the container stayed two strips. The report is that deferral's own trigger firing, which is why the shelf half is an amendment in place rather than a new ADR.

## What the mockup changed about the advice that produced it

Recorded because all three were wrong in chat before they were right in a browser, and each changed a conclusion:

1. **"Shrink the card" is not the lever.** The strip holds **two cards at any usable width** — three would need 102px, which carries no title. The first tile draft was 148px and moved the visible-card count by zero. Shrinking buys vertical; the horizontal half is only fixable by capping the strip, which is what promoted the Map handoff from a nicety to load-bearing.
2. **The card:event ratio was measured against the wrong row.** Against a wrapping event title it is 1.29×; against a plain collapsed row, 1.53×. The panel now reads the shortest `.wp-event` on the frame.
3. **The panel was answering a neighbouring question.** Every row was a _size_ and the report was a _distance_ — "hard to **find** the card you want". `positionOf` was added, and it needed the fixture reordered to insertion order before it meant anything: **3 · 18 · 18** shipped against **1** proposed.

A fourth, on the tile itself: a one-line title clamp was tried and the render rejected it on sight (`מוזיאון…`). The height comes out of the action line, which carries nothing — never the title.

## The owner's reframe, and the one line drawn against it

Presented with the ranking proposal, the owner reframed it: a backend endpoint for recommended items with filters (day, category, location), flexible enough to grow to different strategies and to places nobody added.

Right about the strategies — a comparator inside a `sort` fits exactly one rule and is rewritten for the second. Half right about the server, and the half that does not hold is **non-negotiable rule 5**: the shelf and the gap sheet are the on-the-ground surfaces, and server-ranked they lose their order offline, which is the defect the ranking exists to fix. `haversineMeters` already ships client-side for the Map's near-me sort, documented as staying correct offline, over data already in trip state.

ADR-0151 takes both halves: the contract and the registry are shared, and **where a strategy runs is a property of the strategy** (`LOCAL` / `REMOTE`), so the endpoint hosts the ones that cannot run locally and is reserved rather than built.

One point was sharpened after the owner asked whether this build lays the foundation or only reorders things: **a surface calls the registry, never a strategy**. With one strategy registered the indirection buys nothing visible — that is expected, it is the seam, and the seam is the deliverable.

## State at the end of the session

Nothing built. Six steps in the backlog, first three independent of each other. One question genuinely open and it is a device pass rather than a measurement (ADR-0017): whether the Map handoff reads as _"the rest are over there"_ or as being thrown off the surface mid-build. Steps 1–5 do not wait on it.
