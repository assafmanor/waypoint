# 0009 — Docs in English, product UI Hebrew/RTL

**Status:** Accepted
**Date:** 2026-07-09

## Context

The product is Hebrew, full RTL. Engineering docs and code identifiers are more maintainable in English, and mixing directions in Markdown/code is awkward.

## Decision

**Documentation and code are written in English.** The **product UI is Hebrew and full RTL.** Hebrew UI strings appear in quotes in docs where relevant.

## Consequences

- Consistent, tooling-friendly docs/code.
- A clear seam between engineering language and product language.
- Translation/copy for the UI is treated as product content, not code.

## Alternatives considered

- **Docs in Hebrew:** rejected — harder to maintain code/doc consistency and tooling.
