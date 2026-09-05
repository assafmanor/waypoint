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
- **`.og-band` is the paper strip every cover ends with**, and it is not decoration: the
  board tile alone measures ⁦1.25:1⁩ against a dark WhatsApp bubble, so a cover with no bright
  region has no edge in a dark chat. It says what the link IS.
- **Borrow at a width the app actually ships at.** The ticket renders at ⁦390px⁩ — a real
  device stop (ADR-0017) — then scales. Its height is ⁦197.5px⁩ at any width in that range, so
  the wider base is free: at ⁦300px⁩ the ticket fills ⁦63%⁩ of the cover, at ⁦390px⁩ it fills ⁦82%⁩.
  That measurement is why the first cut looked so small, and the scale is not the knob.
- **No trip name, ever.** One PNG is cut at build time and served to every crawler; what
  identifies a trip lives in `og:title`/`og:description`.

Re-cut after touching any of them, or any sheet they read:

    node scripts/gen-app-icons.mjs
