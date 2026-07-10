# 0007 — Platform: mobile-first PWA

**Status:** Accepted
**Date:** 2026-07-09

## Context

A private 5-person tool needs to run on phones on the ground. Options: native apps, a PWA, or a native shell around web.

## Decision

**Mobile-first responsive PWA** — installable to the home screen, offline for index/documents, one codebase, no app-store friction.

## Consequences

- One codebase, instant install-from-link, easy updates.
- Give up some native niceties: background location, rich iOS push, true offline maps. Accepted for v1.
- **Revisit trigger:** if reliable push or background location becomes core, wrap the same web app in a Capacitor shell.

## Alternatives considered

- **Native (iOS/Android):** rejected — app-store overhead and per-platform builds unjustified for a private tool.
- **Capacitor shell now:** deferred — start as pure PWA, add a shell only if a concrete need bites.
