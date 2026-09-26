# 2026-09-26 — The archive is rose

**Decision:** [ADR-0240](../decisions/0240-the-archive-is-rose.md) · **Mockup:** [`past-trip-v1.html`](../../mockups/past-trip-v1.html) · **Epic:** [build plan](2026-09-25-a-finished-trip-is-a-memory-build-plan.md) §1A · **Drawn 2026-09-25, decided 2026-09-26. Nothing built.**

## The ask

> We should maybe come up with a whole new color palette for past trips.

ADR-0239 §6 ruled out Plan's violet and the past-day wash, and fixed three constraints: both themes, no collision with amber, teal or violet, and the semantic hues keep their meanings inside it. Phase 1A owed the palette, the chrome, the memory Home, the day list as a record, the Index, and /trips.

## How it was looked at

The app was run as the investigation ran it: seed, `DEV_AUTH=1`, clock pinned to 2026-10-06 12:00 Tokyo. Six rows were settled `done`, `בר קוקטיילים` was settled `skipped`, and two rows were left unresolved, so the trip looked lived-in. Each surface's `.app` DOM and the dev build's stylesheet order were captured, and the mockup embeds that DOM as its "before". Each "after" is the same DOM with the proposal applied.

## What the render found

- **A shipped defect:** a skipped row never renders on a finished trip. `PlanDay.tsx:411` keeps it when read-only, then `buildTimeTree` (`lib/time.ts:826`) drops it before layout. ADR-0044 says what we skipped is part of the record. It is written into Phase 3.3.
- **The header carries its own `--chrome-bg`** (`.mode-chrome[data-mode='plan']`), so the first render's rose band stopped at `.app` and the header stayed violet. The build sets the phase on the header too.
- **Rose mixed off the dark `--card` comes out violet**, at hue 292–305° and 3.6 ΔE00 from Plan's band. The dark band is a literal.
- **Every day pill on a finished trip is at opacity 0.45** (`.wp-daypill.past`), so the strip was already the wash ADR-0239 retired.
- **The archive row marks "done" twice** (the chip and a 32px circle), and **`.tag-done` is 3.03:1 as ink**.
- **The reader's route strip was deleted from the phone** for truncating stops to initials, so the Home's strip is cities, wraps, and is absent on a one-city trip.
- **A measurement trap worth keeping:** flipping `data-theme` to read both themes caught the tab bar mid-transition (2.00:1). The file disables transitions while it measures.

## The forks put to the owner, and the answers

1. **Which hue?** Rose, moss or sepia, each measured against amber, teal, violet, `--ok` and `--miss` in both themes, with the line at ΔE00 15 (the app's tightest shipped pair is teal against `--ok` at 11.6). Rose's nearest is 19.5; moss's is `--ok` at 14.6; sepia's is amber at 13.3 in dark. **Owner: _"Rose, as per your recommendation."_**
2. **The posture drawn with it:** the anchor's age (`לפני · 4 ימים`), the done circle leaving the record row, the stragglers in the cover card's footer, a contact sheet of only the days with records, the cover in /trips' flag slot. Presented with the palette and accepted with it.
3. **Split into phases, write the ADR, build later** (owner). The phases are ADR-0240's table: 3.1 tokens, then 3.2–3.5 in parallel, then 4.x and 6B.1–6B.2 on the existing epic numbering.

## Left for the device pass

The cover's height (168 decided, 200 and 232 drawn), rose on real glass in dark, and the two standing touch-floor debts the archive inherits: `.new-event-btn`'s 26px and the settle slot's 32px.
