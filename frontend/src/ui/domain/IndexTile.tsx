// The Index landing's tile (ADR-0098): bookings and documents stay peers
// (ADR-0049 §3) as two equally-weighted entry points into their own dedicated
// screen. Net-new — no existing component fit (StatTile is a static
// value+label, not a tappable navigational card). Presentational only: all
// data via props, two call sites (bookings/documents).
import { type ReactNode } from 'react';
import { NavArrow } from '../NavArrow';
import './index-tile.css';

export interface IndexTileProps {
  /** Leading badge glyph (emoji) — decorative, hidden from a11y. */
  icon: ReactNode;
  title: string;
  /** Item count, shown as a small pill beside the title. */
  count: number;
  /** One-line preview ("next: <title> · <when>" for bookings, the document-type
   *  groups for documents) — may carry JSX (e.g. a RouteLabel). */
  subtitle: ReactNode;
  onOpen: () => void;
}

export function IndexTile({ icon, title, count, subtitle, onOpen }: IndexTileProps) {
  return (
    <button type="button" className="wp-idx-tile" onClick={onOpen}>
      <span className="wp-idx-tile-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="wp-idx-tile-main">
        <span className="wp-idx-tile-top">
          <span className="wp-idx-tile-t">{title}</span>
          <span className="wp-idx-tile-count" dir="ltr">
            {count}
          </span>
        </span>
        <span className="wp-idx-tile-sub">{subtitle}</span>
      </span>
      <span className="wp-idx-tile-chev" aria-hidden="true">
        <NavArrow variant="forward" />
      </span>
    </button>
  );
}
