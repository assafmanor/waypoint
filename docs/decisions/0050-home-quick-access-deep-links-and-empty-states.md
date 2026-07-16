# 0050 — Home quick-access: deep-link targets and derived-vs-managed empty states

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0045](0045-trip-home-real-data-only.md) (the three-shortcut quick-access grid this governs), [0047](0047-booking-event-linkage-and-notes.md) (WiFi now comes from the hotel Booking)

## Context

ADR-0045 reworked Trip-Home's quick-access to three real shortcuts (next confirmation code, WiFi, documents) and `mockups/trip-home-refinements-v1.html` explored their empty states as dashed "＋ add" tiles. Two things then changed the ground under those empty states: ADR-0047 §6 moved WiFi from a manually-added `TripNote` onto the hotel `Booking` (so "add a WiFi code" no longer exists), and building the Index tab (ADR-0047/0048/0049) made the shortcuts' **targets** concrete. This ADR settles what each tile points at and how it behaves when its data is absent, so Home and the Index stay consistent.

## Decision

**1. Every quick-access tile deep-links into the Index.** Tapping **הכרטיס הבא** opens that booking in the Index (its row / merged edit sheet); **מסמכים** opens the Index documents section; **קוד WiFi** copies the password. The tiles are entry points into the Index, not standalone surfaces (ADR-0004 — the Index is where this data lives).

**2. Tiles are either _derived_ or _managed_, and that decides their empty state:**

- **Derived tiles — הכרטיס הבא, קוד WiFi.** They reflect real derived data and are **absent when there is no source**: no upcoming booking with a confirmation code → no "הכרטיס הבא"; no active/next hotel `Booking` with WiFi → no WiFi tile (ADR-0047 §6). The grid **reflows** to what's real (3 → 2 → …). There is **no manual "add"** on a derived tile — you add a booking, not a "next code"; WiFi comes from the hotel booking, not a keypad. This **removes** the "＋ הוסיפו קוד WiFi" empty tile that `trip-home-refinements-v1` previously showed.
- **Managed tile — מסמכים.** Documents are a section the user fills directly, so the tile is **always present** as a shortcut, and when the trip has no documents yet it carries the **＋ invite** ("הוסיפו מסמך") that deep-links to the Index documents add flow. An add-affordance here is honest (the user is the source), unlike on a derived tile.

**3. The "navigate to next" fourth tile stays deferred** to the maps/location work (ADR-0045) — unchanged.

## Consequences

- A brand-new trip (no coded booking, no hotel, no documents) shows just the **מסמכים** tile with its ＋ — an honest, non-empty starting point, not a wall of dead "add" cards.
- `trip-home-v3.html` documents the deep-link targets and the derived/managed split inline; `trip-home-refinements-v1.html`'s section A is reworked to show the three real states (full / no-hotel reflow / new-trip) and no longer shows a manual WiFi-add tile.
- The rule composes with ADR-0045's "real-data-only home": derived tiles never fake data, and the one add-affordance that remains (documents) points at a section the user genuinely owns.
- No new data or schema — every tile's presence is derived from existing state (next coded booking, hotel booking's `details.wifi`, document count).

## Alternatives considered

- **Keep the "＋ add WiFi code" empty tile** (as `trip-home-refinements-v1` had it). Rejected: ADR-0047 §6 makes WiFi a derived value from the hotel booking; a manual WiFi add would reintroduce the second source of truth that ADR eliminated.
- **Make the documents tile absent when empty too** (strict real-data-only parity with the derived tiles). Rejected: documents are user-managed, not derived, so an add-invite is legitimate; and it avoids a brand-new trip showing zero quick-access tiles.
- **Keep tiles always visible but greyed/disabled when empty.** Rejected: a disabled derived tile is a dead card (the thing ADR-0045 removed); absence + reflow reads cleaner than a row of greyed placeholders.
