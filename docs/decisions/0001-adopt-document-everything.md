# 0001 — Adopt "document everything" + docs handbook + ADRs

**Status:** Accepted
**Date:** 2026-07-09

## Context

This is a long-lived personal project that will be built across many separate sessions (and by AI assistants that start cold each time). Undocumented decisions get lost and re-litigated; context evaporates between sessions.

## Decision

Code and documentation live together under one project folder (`D:\Projects\waypoint`). We maintain a **full engineering handbook** (`docs/`) covering product, design, architecture, integrations, decisions, and dated planning notes. Every consequential decision gets an ADR. Every working session gets a dated note in `docs/planning/`.

_Amended 2026-07-27 (session 144, owner's call). "Every consequential decision" was being read as "every session", and adjustment sessions — re-tune a number, extend an existing rule — were producing a full ADR amendment, a session note, a backlog line and dense code comments for work a reader could follow without any of it. That is not diligence; it delays delivery and dilutes the entries that carry real weight. **The threshold is now what the writing buys:** document what a reader cannot recover from the code (a rejected alternative, a non-obvious why, a constraint that will bite, a number not to "clean up"), amend the existing doc in place rather than adding another, and skip the rest. The "Consequences" line below — "small ongoing overhead, accepted as worth it" — is what this corrects: the overhead stopped being small, and it was no longer buying anything on adjustment work. `CLAUDE.md`'s founding-principle section carries the operative wording._

## Consequences

- Any future session can be brought fully up to speed from the repo alone.
- Small ongoing overhead to keep docs current — accepted as worth it.
- The `docs/INDEX.md` must be kept accurate as the map.

## Alternatives considered

- **Docs in a separate tool (Notion, etc.):** rejected — splits context from code, drifts.
- **Minimal README only:** rejected — insufficient traceability for a multi-session build.
