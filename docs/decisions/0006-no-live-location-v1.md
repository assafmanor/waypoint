# 0006 — Own-device location in v1; member-to-member location sharing deferred

**Status:** Accepted — own-device IN v1; member-to-member sharing **Deferred** (parked as a suggested future feature)
**Date:** 2026-07-09

## Context
Two distinct things get called "location":
1. **Own-device location** — using the phone's location to power map features ("near me now", pins, distance, nav). Local to the device, not broadcast.
2. **Member-to-member sharing** — broadcasting each member's live location so the group sees each other's dots on the map.

## Decision
- **(1) is IN for v1** and always available (privately, on-device). It powers all the map/location features.
- **(2) is deferred** pending an explicit product decision. If wanted, it becomes an **opt-in** feature per member.

## Consequences
- All location-based features work in v1 without any privacy tradeoff, because nothing is broadcast.
- "Where is everyone?" is not answered in v1 unless (2) is later approved.

## Resolution (2026-07-09)
Member-to-member live location sharing is a **nice idea, deferred** — parked as a **suggested future feature** (opt-in). Not in v1. When picked up it needs its own ADR covering consent, on/off control, and battery/PWA constraints.

## Alternatives considered
- **Conflate the two and defer both:** rejected — would needlessly cripple the map features.
