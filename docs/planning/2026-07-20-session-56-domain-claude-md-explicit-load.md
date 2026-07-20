# Session 56 — Domain CLAUDE.md files: explicit read, not implicit auto-load

**Date:** 2026-07-20
**Decision:** amendment to [ADR-0096](../decisions/0096-per-domain-claude-md-guides.md).

## What

The user asked: what happens to the per-domain `CLAUDE.md` guidance (session 53,
ADR-0096) when a chat opens at the repo root instead of inside `backend/`/
`frontend`/`packages/shared`? Answer: nothing, automatically — the nested
files only enter context once the agent is reading/editing inside that
directory, and a root-opened session (the common case) starts with only root
`CLAUDE.md`. A task could be discussed, even partly reasoned about, before any
file in that tree is touched, with no domain guidance loaded at all.

Fixed with one new bullet in root `CLAUDE.md`'s "Agent Instructions: Context
Engineering" section (loaded by every session regardless of cwd): identify
which package(s) a task touches as early as possible and explicitly read that
package's `CLAUDE.md`, rather than waiting for it to load implicitly. This
mirrors the section's existing ADR-router bullet ("read the router first...
locate the specific ADR(s)... and read only those") — domain `CLAUDE.md` files
now get the same explicit-lookup treatment.

Recorded as a same-day amendment to ADR-0096 (the ADR-0052 precedent for a
minor same-decision refinement: a dated `## Amendment` section in the existing
file, not a new ADR number) rather than a new decision — the original decision
didn't change, just how it's guaranteed to actually fire.

## Scope

`CLAUDE.md` (one new bullet), `docs/decisions/0096-*.md` (amendment section).
No code change.
