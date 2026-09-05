# The link-preview covers (ADR-0220 §2-3, per-trip since its 2026-09-06 amendment)

**These are HTML, and that is the point.** Each file renders the app's **real, shipped CSS** —
`styles/tokens.css`, `App.css`, `screens/shared-itinerary.css` — inlined and screenshotted at
1200×630.

## Two programs fill these files

- **`scripts/gen-app-icons.mjs`**, at build time, with `defaults.json`'s generic text → the
  committed `frontend/public/og-*.png`.
- **`backend/src/spa/og-cover.template.ts`**, per request, with a real trip's icon, name,
  destination and dates → what a crawler actually gets for `/join/<code>` and `/s/<code>`.

One template, two fillings, so the fallback cannot drift from the thing it falls back from.
A `{{slot}}` is escaped text; a `{{{slot}}}` is markup we build ourselves (the avatar row, the
brand mark's data URL) and is never handed anything a user typed. **Both fillers throw on a
slot they have no value for** — a slot added for one of them would otherwise ship as literal
braces baked into a PNG.

The committed PNGs are the **degradation path**, not the normal one: they are served when a
render fails, when the renderer is busy past its deadline, or when a code does not resolve
(where there are no facts to draw and inventing some would be an existence oracle). The
homepage cover has no slots at all — it has no trip to draw.

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
- **Nothing that goes stale.** A cover is cached by us and then by every chat app that ever
  fetched it, so what it carries has to still be true a month later: an icon, a name, a
  destination, a date range. **Not** a countdown (`בעוד 6 ימים` is true for a day), not
  `עודכן לפני…`, not a live roster — the face row is capped and the sentence beside it carries
  the real number.
  (This replaces **"No trip name, ever"**, which read as a privacy rule and was not one: the
  `og:title` beside the image has named the trip since ADR-0220 §5. It was a consequence of
  cutting one PNG at build time, and the 2026-09-06 amendment removed the cause.)
- **The prose range and the numeric range are not interchangeable.** `.ticket-meta` is body
  font and takes `heTripRange` (`5 באוגוסט – 28 בספטמבר`); `.sh-dates` is `--font-mono`, which
  is JetBrains Mono and ships **Latin only** by design, so it takes `heTripRangeNumeric`
  (`05.08–28.09`). The element's own CSS decides, not taste.

Re-cut after touching any of them, or any sheet they read:

    node scripts/gen-app-icons.mjs
