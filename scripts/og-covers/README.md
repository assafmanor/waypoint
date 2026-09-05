# The link-preview covers (ADR-0220 §2-3)

**These are HTML, and that is the point.** Each file renders the app's **real, shipped CSS** —
`styles/tokens.css`, `App.css`, `screens/shared-itinerary.css` — inlined by
`scripts/gen-app-icons.mjs`, which then screenshots it at 1200×630 into
`frontend/public/og-*.png`.

## Why not SVG

They were SVG for one day. `og-invite.svg` was `.join-ticket` **hand-transcribed** into
coordinates, and it shipped with `text-anchor="end"` on right-aligned Hebrew — which is the
LEFT edge under `direction="rtl"`, so every line flowed out of the ticket. Invisible in the
markup, obvious in the PNG, and caught only because somebody opened it.

That is the same failure `mockups/tools/inline-app-css.mjs` exists to prevent one layer up:
a drawing that copies CSS by hand drifts from the CSS the moment either changes. Rendering
the shipped rules means the invitation cover **cannot** disagree with the join screen it
advertises, and the live cover cannot disagree with the reader page.

## The rules a cover file follows

- **No `<style>` of its own beyond the `og-*` chrome.** Everything that draws a borrowed
  tree comes from the inlined sheets. If a cover needs a colour, it names the token.
- **Pinned to the light theme.** A PNG has no `data-theme`, so the cutter sets none and the
  `:root` block is what applies. Never write a `[data-theme='dark']` rule here.
- **There is no paper band, and the number that once justified one was measured against the
  wrong surface.** ADR-0220 §2 compared `--paper` to the chat BUBBLE; what sits under the
  image is the card's own TEXT PANEL, which is near-white in a light chat — ⁦1.04:1⁩ — so the
  band and the panel were one light block and it destroyed the boundary it was added to draw.
  A cover's bright region has to be **content** to earn its place: `og-live.html` has one
  because the reader page's body is genuinely part of the page it borrows.
- **Borrow at a width the app actually ships at.** The ticket renders at ⁦390px⁩ — a real
  device stop (ADR-0017) — then scales. Its height is ⁦197.5px⁩ at any width in that range, so
  the wider base is free: at ⁦300px⁩ the ticket fills ⁦63%⁩ of the cover, at ⁦390px⁩ it fills ⁦82%⁩.
  That measurement is why the first cut looked so small, and the scale is not the knob.
- **No trip name, ever.** One PNG is cut at build time and served to every crawler; what
  identifies a trip lives in `og:title`/`og:description`.

Re-cut after touching any of them, or any sheet they read:

    node scripts/gen-app-icons.mjs
