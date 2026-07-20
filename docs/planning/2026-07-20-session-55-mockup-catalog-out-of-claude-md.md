# Session 55 — Mockup catalog out of root CLAUDE.md

**Date:** 2026-07-20
**Decision:** [ADR-0097](../decisions/0097-mockup-catalog-out-of-root-claude-md.md).
**Follows:** session 54 (fixed staleness in the same mockup list; flagged the
list itself as worth moving, per the user's follow-up).

## What

Moved the ~16-entry mockup catalog out of root `CLAUDE.md`'s "Where things
are" section into a new `docs/design/mockups.md`, listed in `docs/INDEX.md`'s
Design table. Root `CLAUDE.md` now has one pointer line instead of the inlined
list — the same shape as its existing pointer to `docs/decisions/` for ADRs.
Content carried over verbatim (including session 54's staleness fixes); this
was a location change only.

Also audited root `CLAUDE.md` and the three per-domain `CLAUDE.md` files
(ADR-0096) for the same anti-pattern (a long inlined list that duplicates
content better kept in a routed doc) — found no other instance. The
"Non-negotiable rules" and "Conventions" sections are already terse one-liners
with an ADR/doc pointer for detail, and the domain `CLAUDE.md` files don't
carry any comparable enumerable list.

## Why

Root `CLAUDE.md`'s own "Context Engineering" section argues for progressive
disclosure and already applies it to ADRs (routed via `docs/INDEX.md`, never
inlined). The mockup list was the one place that didn't follow its own rule —
it grew one bullet per session as mockups landed, with nobody routing it the
way ADRs already are. Every task loaded all 16 summaries regardless of whether
it touched design at all.

## Scope

New `docs/design/mockups.md`; edits to `CLAUDE.md` (list → pointer),
`docs/INDEX.md` (Design table row + Process & repo boundary router entry),
`docs/decisions/README.md` (chronological index), plus
`docs/decisions/0097-*.md`. No code change.
