# 0096 — Per-domain CLAUDE.md guides + reuse-existing-infrastructure as a standing rule

**Status:** Accepted
**Date:** 2026-07-20
**Relates:** ADR-0094/0095 (the named-constants/registry pattern this generalizes into doctrine), ADR-0078/0079 (the feedback-family and single-Modal consolidations this rule would have preempted), ADR-0001 (document everything), ADR-0046 (repo-as-record).

## Context

The root `CLAUDE.md` is one file for the whole monorepo. It states cross-cutting
product/architecture rules (hard/soft, integrations-are-pipes, color budget,
offline reads, mobile-first) but says nothing about how to work _within_ a
layer — what infrastructure already exists there and should be extended rather
than re-invented.

That gap had a cost, visible after the fact in this repo's own history: several
ADRs exist specifically to _undo_ parallel one-off copies that accumulated before
someone noticed and generalized them —

- ADR-0094 replaced per-entity-type `if`/`else` sync branching with one
  table-driven applier registry, after it had been written out longhand at each
  call site.
- ADR-0095 found `ERROR_CODE`-shaped values hand-duplicated as loose consts
  between `lib/api.ts` and the backend's raw string throws, and outbox/reducer/
  sync-state discriminants spelled as bare literals — a typo away from a silent
  runtime bug.
- ADR-0078 replaced roughly six bespoke empty/loading/error `<div>` shells with
  one feedback-state family.
- ADR-0079 replaced three separate confirm-dialog implementations and ad hoc
  `createPortal` overlays with one `Modal` primitive (now lint-enforced).

In every case the fix was the same shape: find the one place doing this job,
generalize it, delete the copies. The codebase does not yet say "look for that
place _before_ writing the copy" anywhere a contributor or agent would read it
before starting. The rule exists only as a lesson buried across five ADRs.

Separately, `CLAUDE.md`'s own "Context Engineering" section already argues for
progressive disclosure — load the router and only the ADR(s) for the domain in
front of you, not the whole `docs/` tree. Claude Code (and compatible tooling)
resolves a nested `CLAUDE.md` per directory automatically, so a domain-scoped
file is the same progressive-disclosure principle applied to code, not just docs.

## Decision

Add three domain-scoped guides, each read **in addition to** the root
`CLAUDE.md` when working in that tree, not instead of it:

- `packages/shared/CLAUDE.md`
- `backend/CLAUDE.md`
- `frontend/CLAUDE.md`

Each states, for its layer: the existing infrastructure to reach for by name
(with the file it lives in), the concrete anti-pattern that infra replaced or
guards against (citing the ADR where relevant), and the constants/enum
convention already established by ADR-0094/0095 applied as a standing rule, not
a one-time cleanup.

The root `CLAUDE.md` gets one new non-negotiable rule generalizing the pattern
above — reuse existing infrastructure before adding new, and when none exists,
build it reusable — plus a pointer to the three files.

## Consequences

- A contributor or agent touching only `frontend/` (say) now has, one directory
  up, a short list of "the component/state/cache layer that already does this"
  before reaching for a new one-off — the exact question ADR-0078/0079/0094
  answered the expensive way, after the copies already existed.
- Nested files are additive: reading `frontend/CLAUDE.md` does not exempt
  anyone from the root file's cross-cutting rules (hard/soft, colors, offline,
  mobile-first, back/overlay invariants). No content is duplicated between
  them beyond a couple of one-line pointers.
- Three more files to keep in sync with the code as new infra lands — same
  maintenance shape as an ADR or architecture doc; the same "update the doc in
  the same change" rule already governs it (root `CLAUDE.md`, "Founding
  principle").
- This is process/documentation-shape, not product behavior — no code,
  schema, or runtime change.

## Alternatives considered

**Fold this into `docs/engineering/conventions.md` instead of new `CLAUDE.md`
files.** Rejected: `conventions.md` is prose read on demand; `CLAUDE.md` files
are auto-loaded per directory by the tooling this project is built around, which
is the entire point of putting the reuse-lookup table where the agent is already
standing instead of one hop away.

**One combined root section instead of three files.** Rejected: it would force
loading backend infra references while doing frontend-only work and vice versa,
against the Context Engineering rule the root file already states.

## Amendment (2026-07-20, same day) — explicit proactive read, not implicit auto-load

The original decision assumed the auto-load-per-directory mechanism was
sufficient on its own. It isn't: most sessions open at the repo **root**, which
loads only root `CLAUDE.md` — a nested `backend/CLAUDE.md`-style file only
enters context once the agent is actually reading/editing inside that
directory. A task discussed and even partly reasoned about before any file in
that tree is touched can proceed with no domain guidance loaded at all, silently
defeating the whole point of ADR-0096.

Fixed by adding an explicit instruction to root `CLAUDE.md`'s "Context
Engineering" section (which every session does load): identify which
package(s) a task touches as early as possible and **actively read** that
package's `CLAUDE.md`, rather than relying on it having loaded implicitly.
This mirrors the existing ADR-router instruction in the same section ("read
the router first... locate the specific ADR(s)... and read only those") —
domain `CLAUDE.md` files get the identical explicit-lookup treatment ADRs
already had.
