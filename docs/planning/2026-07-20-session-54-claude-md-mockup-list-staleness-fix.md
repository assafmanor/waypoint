# Session 54 — Fix stale sign-off claims in CLAUDE.md's mockup list

**Date:** 2026-07-20
**Follows:** session 53 (per-domain `CLAUDE.md` guides), which flagged the root
`CLAUDE.md` "Where things are" mockup list as worth a follow-up trim.

## What

Audited every mockup entry in root `CLAUDE.md` against its ADR's actual
`Status` line. Three were stale — each said "awaiting sign-off" or "Proposed"
for a design that had since shipped:

- `booking-presentation-v1.html` (ADR-0059/0063) — Accepted, shipped session
  33 (per `docs/planning/2026-07-18-session-34-*.md`: "the session-32/33
  booking-presentation build … shipped earlier today").
- `plan-home-readiness-v1.html` (ADR-0061) — Accepted (ADR's own status line
  records the sign-off date).
- `document-upload-v1.html` (ADR-0086) — Accepted, shipped as the reusable
  `FilePicker`/`ChoiceGrid` primitives (per the ADR index entry).

Rewrote all three: dropped the "awaiting sign-off" language, marked each
"historical design record … Accepted, shipped", and cut the mechanic-level
prose (scenario chips, exact checklist wording) since it now only duplicates
what the shipped code + the ADR itself already say — the mockup's remaining
job is design rationale, not a build spec.

Left `index-fixes-v1.html` untouched: its ADR-0052/0053/0054 are genuinely
still `Proposed`, so its "Proposed" framing is accurate.

## Not done

A broader rewrite of the mockup list (e.g. dropping fully-superseded entries
like `glance-transition-labels-v1.html` entirely, or condensing every shipped
entry to the same one-liner) was in scope as offered but out of scope for this
pass — the found bug was a factual staleness (wrong status), not general
verbosity; further trimming risks losing information an agent might still
want without a clear accuracy payoff. Flagged in case a future pass wants it.

## Scope

`CLAUDE.md` only (3 lines rewritten). No code, schema, ADR, or backlog change.
