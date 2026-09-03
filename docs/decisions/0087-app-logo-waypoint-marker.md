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

**The mark always sits on a contrasting ground, never teal-on-teal.** The app icon and favicon use the **dark board/indigo tile** (`--board`; a full-bleed square since the 2026-09-03 amendment, which took the drawn squircle out), where the teal marker and amber core pop and which matches the trip-mode chrome ("trip mode wants dark"). A light-paper tile is the sanctioned bright alternative. A teal tile is explicitly rejected — the pin disappears into its own color.

**Asset set** (all regenerated from the one geometry — corrected by the 2026-09-03 amendment below):

- `frontend/public/favicon.svg` — the marker on the **full-bleed** dark board tile, no corner radius and no outer stroke. This is the **single source** for every raster icon; `node scripts/gen-app-icons.mjs` cuts all four PNGs from it.
- `frontend/public/icon-mark-bright.svg` — a **circular** ground variant for inline use where the container clips to a circle (the Login `.land-icon` / Join `.join-icon`, the public itinerary's `.sh-brand-mark`).
- `frontend/public/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png` — the same full-bleed tile at four sizes, the marker scaled to 0.66 so it clears the maskable safe zone (the centred circle of 80% diameter; the furthest marker pixel measures **153.5px** of the **204.8px** allowed).
- The Login, Join and install-sheet marks are **inlined SVG** (not `<img>`) so the vector stays crisp at 20–48px — Chrome rasterizes small `<img src="*.svg">` aliased. They are one component, `ui/AppMark.tsx`, whose gradient ids come from `useId` (it replaced two byte-identical copies that differed only in a hand-written `lg-*` / `jg-*` prefix).

Direction **B (Board Pin)** is kept on record in the mockup as the alternate dark app-icon of the same pin family, should a busier icon ever be wanted; it is not shipped.

## Consequences

- **Frontend/assets only.** No backend, shared, or data-model change. `theme_color` (`#1B2A4A`), the manifest name/short*name, and the icon \_wiring* (paths, sizes, maskable purpose) are all unchanged — only the pixels behind the same paths.
- **The mark carries its own ground, so dark mode needs nothing.** It survives the `data-theme` remap unchanged (design-language "Dark mode readiness"); it is not built from `var(--token)` because a brand asset should be identical in both themes.
- **RTL-safe.** The marker is radially symmetric — it never needs mirroring in the Hebrew-first layout.
- **Legible to 16px.** One silhouette, one accent; the favicon holds at tab size.
- **The departure board keeps its meaning inside the app.** The board remains the signature _surface_ (the Now/Next hero, design-language "signature concept"); the logo no longer duplicates it, freeing the mark to say "trip / waypoint" while the board says "now."
- **PNGs are rasterized from the SVG** (headless Chromium at exact sizes) — regenerate them from `favicon.svg` / the full-bleed source whenever the geometry changes, so the set never drifts.

## Amendment (2026-09-03) — the icon draws no shape of its own

**Owner report:** the app icon, the favicon and the inline logo were _"all rounded with an outer stroke … that accidentally looks good on my phone because apps are rounded there anyway, but on Samsung galaxy phones for example they're not, so the round stroke looks weird."_

The stroke was decided above for a real reason — "a teal edge so the dark tile separates from a dark/busy ground" — and the reason does not survive contact with a launcher that supplies its own silhouette. Two things were baked into the pixels that are not ours to decide:

- **The corner radius.** `favicon.svg`, `pwa-192.png` and `pwa-512.png` drew their own squircle (`rx 116`). A platform that rounds then rounds a rounded tile; a platform that does not leaves a rounded tile inside a square slot.
- **The outer stroke**, which is worse, because it is the radius made _visible_. On the two full-bleed assets it was a teal **circle** on a square field, so One UI's mask produced a ring floating inside a squircle — the reported artifact. At 20px on the Join bar the ring was most of the mark.

**The decision:** every icon asset is **full bleed with no corner radius and no outer stroke** — the platform's mask is the only silhouette anywhere. Separation from a dark ground moves off the brand mark and onto the host, as a 1px white-alpha hairline (`--mark-edge`, now named once and spent at `.land-icon` / `.join-icon` / `.sh-brand-mark`; `.join-icon` had none and was relying on the ring). A border is the container's business; a ring reads as part of the logo, which is exactly how this went wrong.

**And the drift trap this ADR left open is closed.** The Consequences above say the PNGs are rasterized from the SVG "so the set never drifts" — but the full-bleed source was never committed, so there was nothing to rasterize _from_, and the four files had duly diverged on three axes at once (radius, stroke, and a 0.72 vs 0.66 marker scale). `favicon.svg` is now that source and `scripts/gen-app-icons.mjs` is the cut, following `deploy-swap-check.mjs`'s pattern for reaching Playwright's Chromium from a root script. Headless Chromium rather than a raster library because the amber core is an `feGaussianBlur`, which lightweight rasterizers drop silently — it would flatten the one glowing element the mark is built around.

**What did not change:** the geometry, the palette, the semantic reading (teal = place, amber = the live "now"), the manifest wiring, `theme_color`, or the marker's optical centring (2% low, which a pin wants). Only the shape the artwork presumes about its container.
