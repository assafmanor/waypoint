# Session 51 — Outbox verbs as a named constant

**Date:** 2026-07-20
**Relates:** the shared domain-enum pattern in [`packages/shared/src/constants.ts`](../../packages/shared/src/constants.ts) (`ENTITY_TYPE`, `CHANGE_ACTION`) this mirrors.

## Motivation

The offline write outbox discriminated its ops with bare string literals
(`{ verb: 'setStatus' }`, `case 'createBooking':`, `op.verb === 'removeMember'`)
spread across the enqueue sites, both flush/lookup switches, and the cache
mirror. A typo (`'setStstus'`) compiled fine and silently misrouted a write.
The domain enums that the backend Change log and frontend both key off
(`ENTITY_TYPE`, `CHANGE_ACTION`) were already named constants — the outbox verb
was the last magic-string discriminator.

## Change

- **`lib/outbox.ts`** — added `OUTBOX_VERB` (one named value per op) and
  `OutboxVerb = (typeof OUTBOX_VERB)[keyof typeof OUTBOX_VERB]`. The `OutboxOp`
  union arms now discriminate on `typeof OUTBOX_VERB.X` (narrowing unchanged),
  and every `case`/comparison references the constant.
- **`lib/cache.ts`, `state/verbs.ts`, `state/trip-state.tsx`** — all `verb: '…'`
  enqueue sites and `switch (op.verb)` arms reference `OUTBOX_VERB.*`.
- Tests (`outbox`, `cache`, `verbs`, `SyncReviewSheet`) construct ops via the
  constant too, so no `verb: '<string>'` literal remains in the frontend.

## Placement (why not `@waypoint/shared`)

Co-located with `OutboxOp` in `lib/outbox.ts`, not lifted into
`@waypoint/shared`. The outbox is the **frontend's** offline write queue — the
server never receives a verb; each maps to a REST call in `runOp`. Unlike
`ENTITY_TYPE`/`CHANGE_ACTION` (cross-cutting, backend + frontend), the verb has
no backend consumer, so the shape source-of-truth package is the wrong home.
Keeping the const next to the union it feeds means adding a verb touches one file.

## Not a change

The remaining per-verb repetition (union arms + exhaustive `switch` cases) is
the discriminated-union pattern, compiler-enforced for exhaustiveness — the same
way `ENTITY_TYPE` appears across many switch arms. Only the magic strings were
removed; the single source of truth is now `OUTBOX_VERB`. The i18n
`t.sync.verb` map stays keyed by the wire strings (translation keys, cast
`Record<string, string>`), so `t.sync.verb[f.verb]` is unaffected.

## Verification

- `pnpm --filter @waypoint/frontend test` — 571 pass (59 files).
- `typecheck` + `build` clean; `lint` 0 errors; `format` clean.

## Scope / not touched

Frontend only. No model/schema/backend change; the appliers and registries
(ADR-0094) are untouched.
