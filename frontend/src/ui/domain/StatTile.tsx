// StatTile — the small stat tile used on the Plan-mode Home retrospective
// (screens/PlanHome.tsx `.prep-stat`: days / events / bookings) and available to
// any glanceable count. A mono value over a muted label, on a flat card. The
// value is a numeric/short run, so it's dir=ltr + mono (design-language
// typography). The tiles sit in the screen's own grid (`.prep-stats`), so this
// owns just the tile.
//
// Presentational only: value + label via props.
import { type ReactNode } from 'react';
import './stat-tile.css';

export interface StatTileProps {
  /** The stat value — a number or short run (rendered mono, dir=ltr). */
  value: ReactNode;
  label: ReactNode;
}

export function StatTile({ value, label }: StatTileProps) {
  return (
    <div className="wp-stattile">
      <div className="wp-stattile-v" dir="ltr">
        {value}
      </div>
      <div className="wp-stattile-l">{label}</div>
    </div>
  );
}
