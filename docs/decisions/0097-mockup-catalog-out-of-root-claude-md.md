# 0097 — Mockup catalog moves out of root CLAUDE.md into docs/design/mockups.md

**Status:** Accepted
**Date:** 2026-07-20
**Relates:** ADR-0096 (per-domain `CLAUDE.md` guides; this extends the same progressive-disclosure argument to a different piece of root `CLAUDE.md`), the "Agent Instructions: Context Engineering" section of root `CLAUDE.md` (the rule this brings the mockup list into compliance with).

## Context

Root `CLAUDE.md`'s "Where things are" section carried ~16 bullet points, one
per file in `mockups/`, each a dense paragraph of what the mockup shows, which
ADR(s) it promotes, and what it supersedes. That block was roughly 40% of the
file by size, fully inlined and loaded on **every** session regardless of
whether the task touches design or mockups at all.

This is the exact anti-pattern root `CLAUDE.md`'s own "Context Engineering"
section argues against: "never load all documentation at once... reading the
whole `docs/` tree up front is the failure mode." The file already avoids this
for ADRs — they aren't inlined; `CLAUDE.md` points to `docs/INDEX.md`'s router
table, and an agent reads only the ADR(s) for its domain. The mockup list had
no equivalent router; it grew one bullet at a time as each new mockup landed,
with nobody routing it the way ADRs already are.

A pass looking for other instances of the same pattern elsewhere in root
`CLAUDE.md` (long inlined lists that duplicate content better kept in a routed
doc) found none — the "Non-negotiable rules" and "Conventions" sections are
already terse one-liners with an ADR/doc pointer for detail, matching the
established pattern. The three per-domain `CLAUDE.md` files added in ADR-0096
were checked the same way and don't exhibit it either.

## Decision

Move the mockup catalog to **`docs/design/mockups.md`**, listed in
`docs/INDEX.md`'s Design table like every other design doc. Root `CLAUDE.md`'s
"Where things are" keeps one line pointing to it, the same shape as its
pointer to `docs/decisions/` for ADRs.

## Consequences

- Any task that doesn't touch design/mockups (the majority) no longer loads
  ~16 paragraphs of mockup detail as part of reading the root file.
- Mockups are now discoverable the same way every other doc category is — via
  `docs/INDEX.md` — rather than being the one category special-cased into
  root `CLAUDE.md`.
- One more file to keep current: `docs/design/mockups.md` needs updating in
  the same change whenever a mockup is added or a listed one is superseded/
  ships, exactly as the mockup block already required inside `CLAUDE.md`
  (no new maintenance burden, just relocated).
- Content itself is unchanged (verbatim move, including the staleness fixes
  from session 54) — this ADR is a location decision, not a content one.

## Alternatives considered

**Leave it in root `CLAUDE.md`, just trim the prose per entry.** Rejected:
trimming reduces the cost but doesn't remove it — every task still loads
every mockup summary, including a Backend-only task that will never open
`mockups/`. The router pattern already proven for ADRs solves this properly.

**Fold it into `design-language.md` instead of a new file.** Rejected:
`design-language.md` documents the palette/type/component system itself; the
mockup catalog is a different kind of index (a table of contents over
`mockups/*.html`, closer in shape to `decisions/README.md`'s ADR index than to
a design-system spec). Keeping them separate keeps each doc's job singular.
