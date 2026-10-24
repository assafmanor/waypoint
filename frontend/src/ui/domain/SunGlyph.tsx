// **The daylight widget's marks** — five small skies: sunrise, sunset, golden
// hour, and the two polar states.
//
// ── Why these are not emoji ────────────────────────────────────────────────
// They shipped as 🌅 🌇 ✨ ☀️ 🌑, filed as content on the reasoning a category
// badge is. The owner's call reversed that, and the design language already
// carried the argument: these are chrome the app DRAWS — nothing behind them is
// an entity, the app computed every one from a latitude and a date — which is
// what ADR-0138's 2026-08-02 amendment settled for empty states in the same
// words. Its corollary applies verbatim: _a mark baked into a copy string can
// only ever be an emoji_, so `polarDay`/`polarNight` gave theirs up and the call
// site draws them.
//
// A second reason, particular to the pair: 🌅 and 🌇 are the platform's most
// confusable emoji — two orange discs over two gradients — and at the size the
// foot renders them they are the same smudge.
//
// ── Why not `ui/Icon.tsx` ──────────────────────────────────────────────────
// That primitive is one `<path>`, `fill: none`, `currentColor`; its contract is
// that a call site colours it by colouring its container. These carry a gradient
// each and would have to break it. The rule was never "an icon is monochrome" —
// it is that **a control** inherits text colour so it looks like the text around
// it. Nothing here is tappable; they mark facts on an illustration, so they take
// the illustration's palette.
//
// ── What they are, and the correction that got them here ──────────────────
// Each is a **porthole onto the sky drawn directly above it**: the widget's own
// four-stop ramp, clipped to a circle, with `--sun-disc` at the height that
// names the moment and `.sun-horizon`'s hairline where it is crossing. Every
// value is a token this card already spends — which is the whole design, and it
// was arrived at by getting it wrong first.
//
// **The first version was drawn in literal saturated hex** (a #c9552f dusk, a
// gradient sun with a radial glow) and it was pretty and off-language. Measured
// in chroma, composited over `--card`: those tiles ran **59-62**, against
// `--amber` at **63.6** — the app's decorative palettes sit at **18-25**
// ("always pastel/muted", design-language) and this card's own sky at **10-22**.
// A mark cannot be licensed as illustration at a chroma that reads as a
// semantic hue, and `sun-widget.css`'s licence for the sky is that exact
// measurement. Repainted from the ramp, the tiles land inside it by
// construction: they are literally a slice of the gradient behind them.
//
// **The cost of that correction, stated rather than hidden:** the pair is more
// alike than the loud version was. The morning tile leans on `--sun-day` and the
// evening one on `--sun-twilight` to buy back what muting spent, and the sun's
// height — clear of the horizon at dawn, cut by it at dusk — is the second
// channel. Rendered at ⁦13 / 15 / 17⁩ against the real stylesheet, in both
// themes, before this was settled.
//
// The tiles do **not** invert in dark, for the reason `sun-widget.css` gives for
// the sky: they are a picture of a sky. What changes is the ramp underneath
// them, which the stylesheet already themes — so there is no second palette here
// to keep in step.
//
// No RTL variant: every tile is symmetric about its vertical axis, so `Icon`'s
// `MIRRORED` problem does not arise. Which direction a day runs is the arc's
// business, not a mark's.
import { useId } from 'react';

export type SunGlyphName = 'sunrise' | 'sunset' | 'golden' | 'polar-day' | 'polar-night';

/** A gradient stop: how far down the tile, and which rung of the ramp. Rendered
 *  as a CLASS, never a `stop-color` attribute — an SVG presentation attribute is
 *  not parsed as CSS, so `stop-color="var(--sun-day)"` silently paints black.
 *  Cost one render to find. */
type Stop = readonly [number, 'night' | 'twilight' | 'dawn' | 'day'];

interface Spec {
  readonly sky: readonly Stop[];
  /** Where the sun sits, or `null` for a sky that has none. */
  readonly sun: { readonly cy: number; readonly r: number } | null;
  /** The horizon's y, or `null` where the tile states no crossing. */
  readonly horizon: number | null;
  readonly rays?: boolean;
  /** `[cx, cy, r, opacity]`. */
  readonly stars?: readonly (readonly [number, number, number, number])[];
}

const GLYPH = {
  // Day above, warm at the horizon, the night it has just left below.
  sunrise: {
    sky: [
      [0, 'day'],
      [0.3, 'day'],
      [0.56, 'dawn'],
      [0.8, 'twilight'],
      [1, 'night'],
    ],
    sun: { cy: 12.8, r: 4.2 },
    horizon: 17.2,
  },
  // The same tile read downward — twilight arriving rather than day — and the
  // sun BELOW its line rather than above.
  sunset: {
    sky: [
      [0, 'twilight'],
      [0.26, 'twilight'],
      [0.52, 'dawn'],
      [0.76, 'night'],
      [1, 'night'],
    ],
    sun: { cy: 16.4, r: 4.2 },
    horizon: 15.4,
  },
  // Warm through and through, and the one tile with no horizon: golden hour is
  // the only fact on the foot that is a RANGE rather than a crossing, so drawing
  // it one would say something untrue of it.
  golden: {
    sky: [
      [0, 'dawn'],
      [1, 'dawn'],
    ],
    sun: { cy: 13.4, r: 4.4 },
    horizon: null,
  },
  // Rays, which neither crossing gets, and no horizon: the sun is not at the
  // horizon today, it is up and stays up.
  'polar-day': {
    sky: [
      [0, 'day'],
      [1, 'day'],
    ],
    sun: { cy: 11.8, r: 4 },
    horizon: null,
    rays: true,
  },
  // The only tile with no sun in it at all, which is the whole statement.
  'polar-night': {
    sky: [
      [0, 'night'],
      [1, 'night'],
    ],
    sun: null,
    horizon: 16.5,
    stars: [
      [7.5, 7, 1, 0.8],
      [16, 5.6, 0.8, 0.6],
      [18.4, 10.6, 0.7, 0.45],
    ],
  },
} as const satisfies Record<SunGlyphName, Spec>;

const RAYS = 'M12 3.6v2 M5 11.8h2 M17 11.8h2 M6.6 6.3 8 7.7 M17.4 6.3 16 7.7';

export function SunGlyph({ name, className = '' }: { name: SunGlyphName; className?: string }) {
  // `useId` returns colons — legal in an XML name, and a trap the moment anyone
  // reaches for one of these with a CSS selector. Stripped once, here.
  const uid = useId().replace(/:/g, '');
  const spec: Spec = GLYPH[name];
  const [clip, sky] = ['clip', 'sky'].map((k) => `${uid}-sun-${k}`);

  return (
    <svg className={`sun-glyph ${className}`.trim()} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx={12} cy={12} r={11} />
        </clipPath>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          {spec.sky.map(([offset, rung]) => (
            <stop key={offset} offset={offset} className={`sg-${rung}`} />
          ))}
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {/* The card behind the wash, so the ramp's alphas composite exactly as
            they do in the sky band above — same values, same ground. */}
        <rect width={24} height={24} className="sg-card" />
        <rect width={24} height={24} fill={`url(#${sky})`} />
        {spec.stars?.map(([cx, cy, r, opacity]) => (
          <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} className="sg-star" opacity={opacity} />
        ))}
        {spec.horizon !== null && <path d={`M0 ${spec.horizon}h24`} className="sg-horizon" />}
        {spec.rays && <path d={RAYS} className="sg-ray" />}
        {spec.sun && (
          <>
            {/* Drawn AFTER the horizon so the halo spills across it, which is
                what the eye reads as the light being AT the horizon. It is
                `.sun-disc-ring`'s treatment on the arc, at a tile's scale. */}
            <circle cx={12} cy={spec.sun.cy} r={spec.sun.r + 2} className="sg-halo" />
            <circle cx={12} cy={spec.sun.cy} r={spec.sun.r} className="sg-sun" />
          </>
        )}
      </g>
      {/* An edge, so a pale tile does not dissolve into a pale card. */}
      <circle cx={12} cy={12} r={10.5} className="sg-edge" />
    </svg>
  );
}
