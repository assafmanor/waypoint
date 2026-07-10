# 0005 — Roles in v1: `admin` (creator) + `peer`

**Status:** Accepted
**Date:** 2026-07-09 (revised 2026-07-10, T-025)

## Context
A trip has ~5 friends. We could build full RBAC (admin/editor/viewer), treat everyone identically, or take a minimal middle path. The original decision was "everyone is a peer, no roles". T-025 revised this: Assaf wants the trip **creator** to be an **admin** from the start, with the specific admin powers defined later — so that "who is the admin" never has to be backfilled.

## Decision
For v1 there are **two roles**: `MembershipRole { admin, peer }`.
- The trip **creator's** membership is `admin`; members who join via invite are `peer`.
- The distinction is **structural from day one**; **enforcement is minimal/deferred** — v1 gates at most the obviously-destructive ops (delete trip, remove a member, revoke an invite), and the full permission matrix is a later task.
- No "exactly one admin" constraint — an admin could later promote another, or the creator could leave. The creator simply *starts* as admin.

## Consequences
- Simple now; roles don't need a migration or an "elect an admin" backfill later.
- Everyday editing (soft plans, bookings, etc.) is still open to all members among friends.
- **Open question for the future roles ADR:** what happens to a trip whose sole admin leaves? (Not solved in v1.)

## Alternatives considered
- **Everyone a peer, no roles (original):** rejected — leaves no owner and forces a later backfill of who's the admin.
- **Full RBAC now:** rejected — overkill for 5 friends, slows v1.
