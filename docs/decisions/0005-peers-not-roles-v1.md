# 0005 — Everyone is a peer in v1 (no roles)

**Status:** Proposed
**Date:** 2026-07-09

## Context
A trip has ~5 friends. We could build a permission system (admin/editor/viewer) or treat everyone equally.

## Decision
For v1, **all members are peers**: everyone can view everything and edit soft plans. The `Membership.role` field exists (default `peer`) so roles can be added later without migration.

## Consequences
- Much simpler auth and UI now.
- No protection against a member editing something they "shouldn't" — acceptable among friends.
- Future roles are a non-breaking addition.

## Alternatives considered
- **Full RBAC now:** rejected — overkill for 5 friends, slows v1.
