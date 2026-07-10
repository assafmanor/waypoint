# 0001 — Adopt "document everything" + docs handbook + ADRs

**Status:** Accepted
**Date:** 2026-07-09

## Context

This is a long-lived personal project that will be built across many separate sessions (and by AI assistants that start cold each time). Undocumented decisions get lost and re-litigated; context evaporates between sessions.

## Decision

Code and documentation live together under one project folder (`D:\Projects\waypoint`). We maintain a **full engineering handbook** (`docs/`) covering product, design, architecture, integrations, decisions, and dated planning notes. Every consequential decision gets an ADR. Every working session gets a dated note in `docs/planning/`.

## Consequences

- Any future session can be brought fully up to speed from the repo alone.
- Small ongoing overhead to keep docs current — accepted as worth it.
- The `docs/INDEX.md` must be kept accurate as the map.

## Alternatives considered

- **Docs in a separate tool (Notion, etc.):** rejected — splits context from code, drifts.
- **Minimal README only:** rejected — insufficient traceability for a multi-session build.
