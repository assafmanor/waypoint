# 0087 — App logo: the Waypoint marker

**Status:** Accepted
**Date:** 2026-07-20
**Relates:** [0028](0028-adopt-design-language.md) (the semantic-color budget the mark must obey), [0017](0017-mobile-first-device-targets.md) (phone-primary — the mark ships as a PWA/home-screen icon), [0007](0007-platform-pwa.md) (installable PWA — the icon set this replaces)

Mockup: [`mockups/logo-v1.html`](../../mockups/logo-v1.html) — four explored directions, the chosen one fitted into the landing + invite screens.

## Context

The app shipped with a placeholder brand mark: a departure-board tile (three rows, an amber "now" row + blip) as `favicon.svg`, the four PWA/apple-touch PNGs, and an inline "bright" variant (an amber disc with dark board rows) on the Login and Join top bars. It was on-palette but never designed as a logo — it read as _dark_, it didn't say "travel" to someone who didn't already know the departure-board metaphor, and it never drew the product's own name.

The brief (2026-07-20, Assaf): a logo in the theme of trips, relatively bright, inside the existing design language and color scheme, that fits the app. Four directions were explored on both grounds (cool-paper + board-dark) and fitted into the landing and invite screens (`mockups/logo-v1.html`): **A** a waypoint marker with an amber core, **B** a marker holding a mini departure board, **C** a brighter evolution of the shipped board tile, **D** an RTL route to an amber destination.

## Decision

**The mark is the Waypoint marker (direction A):** a map marker (**teal — place**) with a glowing **amber core** (**the live "now"**). It draws the product's name literally (a waypoint _is_ a marked place), reads as travel at a glance, and stays inside the color budget — teal = place and amber = time/now are not decorative here, they combine on purpose: _a place that knows what's next_ (ADR-0028, CLAUDE.md rule 4). The amber core is the one glowing element; the marker body stays calm, mirroring the board's "the trip is speaking" hierarchy.

**The mark always sits on a contrasting ground, never teal-on-teal.** The app icon and favicon use the **dark board/indigo tile** (`--board` → the squircle), where the teal marker and amber core pop and which matches the trip-mode chrome ("trip mode wants dark"). A light-paper tile is the sanctioned bright alternative. A teal tile is explicitly rejected — the pin disappears into its own color.

**Asset set** (all regenerated from the one geometry):

- `frontend/public/favicon.svg` — the marker on the dark squircle tile (`rx 116`).
- `frontend/public/icon-mark-bright.svg` — a **circular** ground variant for inline use where the container clips to a circle (the Login `.land-icon` / Join `.join-icon`).
- `frontend/public/pwa-192.png`, `pwa-512.png` — the squircle tile.
- `frontend/public/pwa-maskable-512.png`, `apple-touch-icon.png` — **full-bleed** board background with the marker scaled to ~60% into the mask safe-zone (iOS/Android apply their own rounding).
- The Login and Join top-bar marks are **inlined SVG** (not `<img>`) so the vector stays crisp at 20–34px — Chrome rasterizes small `<img src="*.svg">` aliased. They mirror `icon-mark-bright.svg` with page-unique gradient ids (`lg-*` / `jg-*`).

Direction **B (Board Pin)** is kept on record in the mockup as the alternate dark app-icon of the same pin family, should a busier icon ever be wanted; it is not shipped.

## Consequences

- **Frontend/assets only.** No backend, shared, or data-model change. `theme_color` (`#1B2A4A`), the manifest name/short_name, and the icon _wiring_ (paths, sizes, maskable purpose) are all unchanged — only the pixels behind the same paths.
- **The mark carries its own ground, so dark mode needs nothing.** It survives the `data-theme` remap unchanged (design-language "Dark mode readiness"); it is not built from `var(--token)` because a brand asset should be identical in both themes.
- **RTL-safe.** The marker is radially symmetric — it never needs mirroring in the Hebrew-first layout.
- **Legible to 16px.** One silhouette, one accent; the favicon holds at tab size.
- **The departure board keeps its meaning inside the app.** The board remains the signature _surface_ (the Now/Next hero, design-language "signature concept"); the logo no longer duplicates it, freeing the mark to say "trip / waypoint" while the board says "now."
- **PNGs are rasterized from the SVG** (headless Chromium at exact sizes) — regenerate them from `favicon.svg` / the full-bleed source whenever the geometry changes, so the set never drifts.
