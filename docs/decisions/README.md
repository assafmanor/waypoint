# Architecture Decision Records (ADRs)

This is the project's memory. Docs elsewhere describe _what is true now_; ADRs preserve _what we decided and why_, so decisions are never silently reversed or re-litigated.

## What earns an ADR

Any decision that is expensive to reverse or that a future contributor would otherwise question: product scope calls, platform/tech choices, data-model shapes, collaboration rules, integration boundaries. If you'd want to know "why is it like this?" six months from now, write one.

## Process

1. Copy the template below into `NNNN-short-title.md` (next number).
2. Fill it in. Keep it short — a screen, not an essay.
3. Set **Status**: `Proposed` → `Accepted` → (later) `Superseded by NNNN`.
4. Add it to the index below.
5. Never edit an Accepted ADR's decision; instead write a new ADR that supersedes it.

## Template

```markdown
# NNNN — Title

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context

What forces are at play? What problem are we deciding on?

## Decision

What we chose.

## Consequences

What becomes easier, harder, or constrained as a result.

## Alternatives considered

What else we weighed and why we didn't pick it.
```

## Index

| #                                                   | Title                                                                                                             | Status   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-adopt-document-everything.md)           | Adopt "document everything" + docs handbook + ADRs                                                                | Accepted |
| [0002](0002-each-member-own-google-account.md)      | Each member connects their own Google account                                                                     | Accepted |
| [0003](0003-one-way-calendar-sync.md)               | Calendar sync is one-way (trip → personal)                                                                        | Accepted |
| [0004](0004-integrations-are-pipes.md)              | Integrations are pipes, not screens                                                                               | Accepted |
| [0005](0005-peers-not-roles-v1.md)                  | Roles in v1: `admin` (creator) + `peer`                                                                           | Accepted |
| [0006](0006-no-live-location-v1.md)                 | Own-device location in v1; member sharing deferred                                                                | Accepted |
| [0007](0007-platform-pwa.md)                        | Platform: mobile-first PWA                                                                                        | Accepted |
| [0008](0008-backend-supabase.md)                    | Backend: traditional self-owned Node/TypeScript service                                                           | Accepted |
| [0009](0009-docs-english-ui-hebrew.md)              | Docs in English, product UI Hebrew/RTL                                                                            | Accepted |
| [0010](0010-repo-vs-internal.md)                    | Keep private material out of the repo                                                                             | Accepted |
| [0011](0011-hard-soft-event-model.md)               | Hard/soft event model as the core primitive                                                                       | Accepted |
| [0012](0012-conflict-lww-undo.md)                   | Conflicts: last-writer-wins + undo for v1                                                                         | Accepted |
| [0013](0013-google-only-auth-v1.md)                 | Google-only authentication for v1                                                                                 | Accepted |
| [0014](0014-budget-display-only-v1.md)              | Budget is display-only in v1                                                                                      | Accepted |
| [0015](0015-document-encryption-server-side.md)     | Document encryption: server-side at rest                                                                          | Accepted |
| [0016](0016-plan-trip-modes-one-surface.md)         | Plan/Trip modes = one surface; auto-by-date switch + manual override                                              | Accepted |
| [0017](0017-mobile-first-device-targets.md)         | Mobile-first; phone-primary device targets (tablet 2nd, desktop minimum)                                          | Accepted |
| [0018](0018-timeline-data-model-shape.md)           | Timeline & data-model shape (drop Day, no stored `now`, `endDate`, client ids, roles)                             | Accepted |
| [0019](0019-sync-protocol.md)                       | Sync protocol: monotonic change log, atomic write path, snapshot + catch-up                                       | Accepted |
| [0020](0020-auth-session-architecture.md)           | Auth & session architecture (memory JWT + rotating refresh, single-origin, `AuthIdentity`)                        | Accepted |
| [0021](0021-multi-trip-membership.md)               | Multi-trip membership & active-trip client state                                                                  | Accepted |
| [0022](0022-control-plane-vs-data-plane.md)         | Control plane vs. data plane: only the data plane routes through ChangeService                                    | Accepted |
| [0023](0023-zod-first-entities-and-openapi.md)      | Zod-first entity shapes; OpenAPI generated from schemas                                                           | Accepted |
| [0024](0024-app-shell-and-trip-lifecycle.md)        | App shell & trip-lifecycle navigation (thin shell; login/zero-state/create/join/switcher)                         | Accepted |
| [0025](0025-trip-mode-edit-capability-tiers.md)     | Trip-mode edit capability tiers & the Plan escape (refines 0016)                                                  | Accepted |
| [0026](0026-real-clock-and-dev-time-travel.md)      | Real clock as the time source + dev time-travel                                                                   | Accepted |
| [0027](0027-soft-item-lifecycle-shelf-slip.md)      | Soft-item lifecycle: derived phases, slip/Do-it-now, shelf as a parking lot                                       | Accepted |
| [0028](0028-plan-violet-color-budget-dark-ready.md) | Plan violet + Night/Day mode identity, semantic color budget, dark-mode-ready tokens                              | Accepted |
| [0029](0029-trip-mode-day-scope-gating.md)          | Trip-mode day-scope: verb gating for past and future days (refines 0025, 0027)                                    | Accepted |
| [0030](0030-join-is-link-only.md)                   | Joining a trip is link-only — no short invite codes (paste-a-link covers app-first arrivals)                      | Accepted |
| [0031](0031-hosting-on-railway.md)                  | Hosting: Railway, one project (single-origin service, Postgres; buckets later)                                    | Accepted |
| [0032](0032-minimal-trip-creation.md)               | Trip creation is minimal: destination → dates → auto-suggested name; currency/budget/timezone derived or deferred | Accepted |
