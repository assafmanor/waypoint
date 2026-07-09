# 0010 — Keep private material out of the repo

**Status:** Accepted
**Date:** 2026-07-09

## Context
Some material belongs in the shareable/committable project (product, design, architecture, decisions, code). Other material is personal or sensitive — real people's data, credentials, private planning scratch, and personal workflow tooling — and must never be committed. In addition, **committed files should not reference or depend on that private material**: the repo must stand on its own for anyone who clones it.

## Decision
Private/personal material lives in a **local, gitignored area** alongside the working tree, excluded via `.gitignore`. Rule of thumb: *"Would I be fine pushing this to the remote?"* If no → it stays local and out of the repo.

Two rules keep this clean:
1. **No committed file references the private area** (no scripts that call into it, no docs or config that point at it, no links). The only committed mention is the `.gitignore` rule that excludes it — that's the exclusion mechanism, not a dependency.
2. **Agent/tooling guidance about the private area lives in gitignored local config** (e.g. a local, non-committed guidance file the tools read), never in committed files.

Formalized, shareable planning is promoted from the private area into `docs/` when it becomes a real decision.

## Consequences
- Everything still lives under one project folder (manage it all in one place), but the committed repo is self-contained and leaks nothing private.
- A grep for the private area's name across committed files returns only `.gitignore`.
- Zero risk of committing personal data or secrets if `.gitignore` is respected.

## Alternatives considered
- **Reference the private area from committed docs/scripts:** rejected — breaks on clone and exposes private structure; the trigger for this decision.
- **No separation:** rejected — risks leaking personal data into git.
