// Shared SVG icon primitive. The app's body font (Assistant) has no glyphs for
// symbol characters like ▾ ↩ ↺ ⬇, so the browser substitutes a fallback whose
// baseline sits low — the glyph drifts down inside its box. These SVGs render
// identically on every platform and centre cleanly. See NavArrow for the line
// nav arrows (forward/back, RTL-mirrored); this covers the non-arrow symbols.
//
// Size rides on the parent's font-size (1em), colour on currentColor, so a call
// site styles the icon by styling its container — same as the glyph it replaces.
// `dir` rotates the icon (canonical orientation points down / is upright).

type IconName = 'caret' | 'undo' | 'reset' | 'download' | 'settings';
type Dir = 'up' | 'right' | 'down' | 'left';

const PATHS: Record<IconName, string> = {
  caret: 'M5 9l7 7 7-7z',
  undo: 'M9 14L4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4',
  reset: 'M3 4v6h6M3.5 15a9 9 0 1 0 2.2-9.4L3 10',
  download: 'M12 3v12m-5-5l5 5 5-5M5 20h14',
  // Cog outline + centre circle (replaces the lone ⚙ emoji-as-control, U-11).
  settings:
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
};
const FILLED: ReadonlySet<IconName> = new Set(['caret']);
const ROTATE: Record<Dir, number> = { down: 0, left: 90, up: 180, right: 270 };

export function Icon({
  name,
  dir,
  className = '',
}: {
  name: IconName;
  dir?: Dir;
  className?: string;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={`icon ${className}`.trim()}
      style={dir ? { transform: `rotate(${ROTATE[dir]}deg)` } : undefined}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
