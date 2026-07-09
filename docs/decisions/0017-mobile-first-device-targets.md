# 0017 — Mobile-first; phone-primary device targets

**Status:** Accepted
**Date:** 2026-07-09

## Context
The app is used almost entirely on a **phone**, on the ground and in hand. **Tablet** use is occasional — most likely in **Plan mode**, where heavier input/arranging benefits from more screen. **Desktop/PC** is rare. This shapes layout, touch targets, and where design effort goes.

## Decision
Design and build **mobile-first, phone-primary**, with an explicit device hierarchy:

1. **Phone (primary)** — the design baseline. Every screen must be excellent at ~360–430px wide, one-handed, touch-first, glanceable. Trip mode especially is phone-only in practice.
2. **Tablet (secondary)** — supported and *nice*, especially **Plan mode** (itinerary building, booking entry, research benefit from width). Layouts should scale up gracefully (e.g. wider columns, side-by-side lists) rather than just stretching the phone column.
3. **Desktop (graceful minimum)** — must work and not look broken, but gets no bespoke design effort. A comfortable centered/max-width layout is enough.

Corollaries:
- Touch-first: adequate tap targets, thumb-reachable primary actions, no hover-only affordances.
- Performance and offline matter more because it's a phone on foreign networks.
- Responsive by breakpoints, not a separate desktop UI.

## Consequences
- The design language carries a device hierarchy and breakpoints; mockups are authored at phone width first.
- Plan-mode designs (T-018) must include a tablet layout, not just phone.
- The current frontend's fixed ~480px column is a phone-first placeholder; real breakpoints come with the screen work.

## Alternatives considered
- **Responsive-equal across devices:** rejected — wastes effort on desktop that won't be used and dilutes the phone experience.
- **Phone-only (no tablet care):** rejected — tablet is a real, if secondary, Plan-mode context.
