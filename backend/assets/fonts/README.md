# PDF-only fonts

The itinerary PDF (ADR-0213 §4) inlines every face it uses as a data URL, because the
renderer aborts all network requests before setting content — a font it cannot read is a
document that prints boxes. Assistant, Secular One and JetBrains Mono come from the built
app (`frontend/src/assets/fonts`, copied into the image as `/app/pdf-fonts`). This directory
holds the one face the **app** has no use for.

## `noto-emoji.woff2`

Noto Emoji, monochrome, regular — `@fontsource/noto-emoji@5.3.0`'s
`files/noto-emoji-emoji-400-normal.woff2`, the `emoji` unicode-range subset. SIL Open Font
License 1.1, like the three faces above.

**Why it is vendored rather than left to the container.** An event's `icon` is an emoji and
therefore content (`packages/shared/src/icons.ts`), and `node:22-slim` + `fonts-liberation`
has no emoji coverage at all — so every icon printed as a rectangle in the field while the
same render on a developer's machine looked right, because a desktop has emoji fonts
(owner report, 2026-08-30). Vendoring is what makes the output independent of the host.

**Monochrome, not `NotoColorEmoji`.** The document is a fixed light palette that must stay
legible in grayscale, the colour file is ~10 MB against this one's 460 KB, and a CBDT bitmap
face embeds into a PDF as images rather than as text — so the glyph would stop being
extractable, which is the property `scripts/verify-pdf-smoke.mjs` checks.

**Not subsetted to the curated icon set.** `icon` is a free string (ADR-0038), and a trip's
glyph can be any country flag, so coverage has to be the whole emoji range.
