# 0003 — Calendar sync is one-way (trip → personal)

**Status:** Accepted
**Date:** 2026-07-09 (decided during original planning)

## Context
Members want the itinerary reflected in their personal Google Calendar. Two-way sync (edits in either place propagate) is tempting but creates conflict loops.

## Decision
Calendar sync is **one-way**: trip → each member's personal calendar. Editing the calendar event does not change the trip.

## Consequences
- Simple, predictable; no conflict resolution between two sources of truth.
- The trip stays the single source of truth for the itinerary.
- If someone edits the mirrored calendar event, it's overwritten on next sync — acceptable.

## Alternatives considered
- **Two-way sync:** rejected for v1 — "a conflict trap." Revisit only if a strong need appears.
