# Session 53 — Per-domain CLAUDE.md guides

**Date:** 2026-07-20
**Decision:** [ADR-0096](../decisions/0096-per-domain-claude-md-guides.md).

## What

Added domain-scoped `CLAUDE.md` guides, additive to the root file, so an agent
working in one package loads only that layer's guidance instead of the whole
repo's breadth:

- `packages/shared/CLAUDE.md` — the constants/enum convention (ADR-0094/0095)
  as a standing rule, what belongs in shared vs. not (no UI copy, no
  clock-aware logic, no frontend/backend-only vocab), keeping in lockstep with
  `schema.prisma`.
- `backend/CLAUDE.md` — the existing infra to reach for before adding new:
  `ChangeService.mutate()`/`mutateMany()` as the only data-plane write path,
  `trip-scope.util.ts` as the shared cross-trip-reference guard, `env.ts`'s
  named env-var constants, `blob-cache.ts`'s two-tier cache as the caching
  template, `ZodValidationPipe` over class-validator.
- `frontend/CLAUDE.md` — the three component layers to check before writing a
  new one (`ui/primitives/`, `ui/domain/`, `ui/feedback/`), the
  `ENTITY_TYPE`-keyed registries (ADR-0094) for state/cache/outbox instead of
  per-entity-type branching, the `TRIP_ACTION`-style named-constant reducer
  convention (ADR-0095).

Root `CLAUDE.md` gained one new non-negotiable rule (#8: reuse existing
infrastructure before adding new) and a pointer to the three files under "Tech
stack".

Each guide's anti-pattern list cites the ADR that already had to fix the
parallel-copy version of that mistake once (ADR-0078 empty/loading/error
shells, ADR-0079 Modal/overlay consolidation, ADR-0094 the applier registry,
ADR-0095 named constants, backend-review B-06 the trip-scope guard) — the
point being that this rule isn't hypothetical, it's a pattern this repo's own
history already paid for once per layer.

## Why an ADR

This is a process/documentation-structure decision (a new file per package,
read by tooling automatically) rather than a product or architecture change,
but it's exactly the kind of "why is it like this six months from now" the ADR
process exists for (ADR-0001), and it partially extends ADR-0046's stance that
the repo's docs are the record — so it got 0096 rather than landing silently.

## Scope / not touched

Four new/edited Markdown files (`CLAUDE.md` ×1 root edit, `packages/shared/`,
`backend/`, `frontend/` ×1 new each), `docs/decisions/0096-*.md`,
`docs/decisions/README.md`, `docs/INDEX.md` (engineering table row + the
Process & repo boundary domain-router entry). No code, schema, or runtime
change; nothing to typecheck/build/test.
