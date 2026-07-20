# Session 58 — Rule 8 extended: generalize a similar one-off, ask before a major refactor

**Date:** 2026-07-20
**Decision:** amendment 2 to [ADR-0096](../decisions/0096-per-domain-claude-md-guides.md).

## What

The user asked for a specific addition to root `CLAUDE.md`'s reuse-existing-
infrastructure rule (rule 8, ADR-0096): its original wording covered "generalized
infra exists → extend it" and "nothing exists → build it reusable," but said
nothing about the middle case — nothing generalized exists yet, but a similar
**one-off** already does almost the same thing at a single call site. Left
unstated, the default is a second one-off beside the first, which is exactly
the failure mode ADR-0078/0079/0094/0095 each had to undo later.

Rule 8 now says: check for a similar one-off first, and generalize it (to
cover both the old case and the new one) instead of duplicating it. And: if
that generalization would be a substantial refactor rather than a small
extraction, ask before doing it — don't silently take on the larger scope,
and don't silently fall back to duplicating instead.

Recorded as a second same-day amendment to ADR-0096 (same decision family as
the explicit-read amendment from session 56), not a new ADR — it refines how
rule 8 is applied, not the underlying decision that infra should be reused.

## Scope

`CLAUDE.md` (rule 8 reworded), `docs/decisions/0096-*.md` (Amendment 2 section).
No code change.
