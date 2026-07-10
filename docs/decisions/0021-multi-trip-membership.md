# 0021 — Multi-trip membership & active-trip state

**Status:** Accepted
**Date:** 2026-07-10

## Context

A user routinely plans/joins **more than one trip** (a future trip while another is in progress). The PRD already listed "multiple trips as a simple list" as in-scope-but-unpolished. T-025 confirmed what this needs architecturally.

## Decision

- **The data model already supports it** — `Membership` is a User×Trip join with `@@unique([tripId, userId])`; `GET /trips` and `/me` are already multi-trip; nothing in the backend assumes a single trip (no trip claim in the JWT, per-trip guard/snapshot/changes/WS channel). **No schema change.**
- **"Active trip" is per-device client state** — a selected `tripId` in `localStorage`, not synced (same class as the mode override, ADR-0016). The 4-tab surface, WS subscription, and mode derivation are all scoped to it.
- **A minimal trip switcher / trip list** is the app entry point (pick a trip → enter its surface). This is navigation _between_ trip instances, not a new in-trip screen, so it does not violate "the trip is the only surface" (ADR-0004). Minimal in v1; polish deferred.
- **Mode derivation generalized** — default active trip = the one currently in-progress → else nearest upcoming → else most recent; each trip's Plan/Trip mode derives independently.

## Consequences

- New client work only: a switcher + active-trip state (new task) that slightly widens the mode-switch (T-019) and Home (T-008) tasks.
- **Deferred:** overlapping in-progress trips (two trips both "now") — default to last-opened + let the user switch; a real "which is primary now" resolution waits until it actually happens.
- PRD clarified: the simple multi-trip list is **in** for v1.

## Alternatives considered

- **Single trip per user in v1:** rejected — doesn't match real usage, and the model already costs nothing to support many.
- **Server-side "active trip":** rejected — it's a per-device view preference, not shared trip state.
