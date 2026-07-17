// The shared directional nav arrow. An SVG (not a Unicode arrow glyph) so the
// icon is optically centered in its box on every platform — fallback arrow
// glyphs sit off the baseline and drift low/left in a fixed-size button.
//
// Keyed by logical direction, not a fixed shape: `forward` advances/opens,
// `back` returns. Drawn for the RTL locale (forward points left); an LTR locale
// mirrors both via the [dir='ltr'] rules in the .nav-arrow CSS, so direction
// "flips for free" the same way the textual arrows in i18n/he.ts do.
//
// Decorative by default (aria-hidden) — it rides alongside a labelled control.
// Size + colour ride on the parent's font-size / color (screens.css .nav-arrow).
export function NavArrow({
  variant = 'forward',
  className = '',
}: {
  variant?: 'forward' | 'back';
  className?: string;
}) {
  return (
    <svg
      className={`nav-arrow nav-arrow-${variant} ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12H4m6-6l-6 6 6 6" />
    </svg>
  );
}
