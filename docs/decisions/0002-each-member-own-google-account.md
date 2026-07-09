# 0002 — Each member connects their own Google account

**Status:** Accepted
**Date:** 2026-07-09 (decided during original planning)

## Context
Integrations need Google access (Maps, Gmail import, Calendar). We could use one shared Google account or have each member connect their own.

## Decision
Each member connects **their own** Google account.

## Consequences
- Calendar sync can target each person's personal calendar.
- Gmail import reads each person's own booking emails.
- Requires per-user OAuth and token management (fits real per-user identity — see ADR-0008 auth).

## Alternatives considered
- **Shared Google account:** rejected — can't sync to personal calendars, muddies Gmail import, poor security hygiene.
