# 0105 — Loading states: a board power-on boot, a content-shaped snapshot skeleton, a determinate upload row

**Status:** Accepted (2026-07-22) — design accepted; build tracked in [backlog.md](../backlog.md)
**Date:** 2026-07-22
**Relates:** [0078](0078-feedback-state-family.md) (the feedback-state family this extends — `LoadingState`/`Skeleton` and the shared `Spinner`), [0052](0052-document-lifecycle-view-manage-and-feedback.md) (the shared `Spinner`), [0028](0028-plan-violet-color-budget-dark-ready.md) (the color budget — amber = time; the "amber is an accent, not a ground" call sits here), [0082](0082-adopt-non-color-design-tokens.md) (tokens + the "dark mode is a remap, inert until `data-theme='dark'`" readiness posture the dark boot rides), [0092](0092-unsynced-treatment-and-change-groups.md) / [0091](0091-sync-badge-cloud-and-silent-when-synced.md) (the pending-write dim + cloud-up marker the upload row _is_), [0056](0056-faster-document-uploads.md) (the outbox upload the determinate progress rides), [0016](0016-plan-trip-modes-one-surface.md) / [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (mode is _derived_ — so boot can't know it). Designed in [`mockups/loading-states-v1.html`](../../mockups/loading-states-v1.html).

## Context

The design-language names loading a first-class state ("States are first-class, offline is a feature"), but the app's three loading moments were each solved separately and read as three unrelated things:

- **Boot** (`shell.booting` / `BootScreen`) — a bare centered `<h1>` with the word `טוען…` and **no motion at all**. Shown on first load, the auth check, route-chunk fetches, and the trips-list load. It is the first thing a user sees and the one place a board surface is allowed (nothing else is on screen), yet it is the weakest surface in the app.
- **Snapshot** (`snapshot.loading` / `LoadingState`, ADR-0078) — already chrome-preserving, but the skeleton is anonymous shimmer bars: it reads as "some list is loading", not "your trip".
- **Upload** (`docs.upload.saving`) — the pending doc row (ADR-0092) shows an indeterminate spinner + `מעלה…` in its trailing slot. An upload has a **known size**, so a spinner under-informs on the weak connections this app assumes abroad.

Three weights of one problem, never designed as one thing.

## Decision

**One loading language in three weights**, motif = a filling departure-line that echoes the shipped day-progress and readiness bars. Every surface reads only real palette tokens; **amber stays a time accent, never a ground** (see Alternatives).

### Boot (tier 3) — the loud "board power-on"

The dormant departure board warming up: an amber glow that **ramps** (a warm-up, deliberately **not** the reserved live pulse — a boot is not "live this minute"), a mono clock settling, and the departure-line sweeping. Mono carries the numerals only — JetBrains Mono has no Hebrew glyphs, so `טוען…` stays in the heading face and a split-flap of the word is impossible.

**Theme-aware, not mode-aware.** Theme (light/dark) is a device/OS setting known immediately at boot; _mode_ (Plan/Trip) is derived from a trip the snapshot has not loaded yet (ADR-0016/0040), so boot cannot know it and reads as **brand, not mode** — no per-mode variant. Light and dark differ by **how much dark is on screen** (the design-language dark-mode rule: "in the light theme the body stays paper; in dark mode both go dark"), not by restyling the board:

- **Light** = a genuinely light **cool-paper (`--screen`) day ground**, ink numerals, and a small amber halo behind the clock.
- **Dark** = the **night board**, amber lit, full-bleed (OLED). **Designed here but not implemented in this work** — a token remap that stays inert until the `data-theme='dark'` toggle ships (ADR-0082 dark-mode readiness).

### Snapshot (tier 2) — a content-shaped skeleton

Replace the anonymous shimmer with a skeleton that **pre-draws the real Home**, so content _settles_ rather than replaces. This is the **one loading tier that needs a per-mode variant**, because the chrome is already mode-themed at this point and the content it resolves into differs: **Trip** Home is the dark board hero + glance rail + list; **Plan** Home is the violet prep dashboard + readiness bar + checklist. A dark-board skeleton resolving into a violet hero would jar, so each shape-matches its mode. Extends ADR-0078's `Skeleton` primitive; no new mechanism.

### Upload (tier 1) — a determinate row status

Not a screen: the optimistic doc row dims to provisional and carries the cloud-up sync marker (ADR-0091/0092), status in the trailing slot. **Determinate `NN%` + a mini-bar** while uploading (size is known, so show it), **replacing the indeterminate `מעלה…` spinner**; offline stays the static `ממתין להעלאה` (nothing is uploading until the network returns). Mode-independent by design — the pending-row status is sync grammar (`--sync-*` + dim + cloud-up), deliberately orthogonal to the amber/teal/plan budget. The shared `Spinner` (ADR-0052) stays for the genuinely-unknowable cases (form submits, document open/decrypt) — just not here, where size is known.

## Consequences

- The first-run surface becomes the product's signature (the departure board), motion-ful, on a genuinely light day ground — no more naked word, no dark flash before a light app.
- Perceived-performance win on the snapshot: the frame is pre-drawn per mode, so Home appears to settle in rather than pop.
- The determinate upload needs **upload-progress reporting** from the upload call — the one real build cost; it rides ADR-0056's outbox upload. Until that lands the row can fall back to the offline `ממתין להעלאה` grammar, but the indeterminate spinner is retired for this surface.
- **Dark boot is drawn but dormant.** It ships only when the `data-theme='dark'` toggle does (ADR-0082 / U-08); building the light boot must leave the board remap-ready (tokened), not hard-code light values.
- The build is tracked in `backlog.md` (light boot + content-shaped skeleton now; dark boot + determinate upload gated on their prerequisites); nothing here changes shipped behavior yet — this is design.

## Alternatives considered

- **A full amber field for the light boot.** Tried and **rejected**: amber = time, used sparingly (ADR-0028); a whole amber ground spends the budget and reads off-palette. Amber is kept to the clock + its halo. This "amber is an accent, not a ground" line is the durable takeaway.
- **A calm brand-mark boot** (the Waypoint marker on paper, quiet). Rejected: the boot is the one place the loud board is allowed and the strongest brand moment available; a quiet mark under-uses it.
- **Indigo or warm-paper light grounds.** Set aside in favor of cool paper (`--screen`): indigo stayed dark (didn't read as a genuinely light day), warm paper (`--paper`) was warmer than wanted; `--screen` is the neutral the whole app already sits on.
- **A per-mode boot.** Rejected as impossible, not just unwanted: mode is derived from a trip the snapshot hasn't loaded at boot (ADR-0016/0040), so the screen cannot know it. Theme can and does vary; mode cannot.
- **Keep the indeterminate upload spinner.** Rejected for this surface: an upload has a known size, so a determinate bar is honest where a spinner that "could mean anything" is not — the spinner stays only for truly-unknowable waits.
- **A subtle same-shade light/dark boot (token-only remap).** Rejected: the board is dark in both themes, so remapping its hex alone left the two frames near-identical; the light/dark difference has to be _how much dark is on screen_, per the design-language dark-mode rule.
