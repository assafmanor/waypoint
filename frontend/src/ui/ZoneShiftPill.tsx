// ZoneShiftPill — the one amber time-shift pill of the multi-zone model
// (ADR-0107 session-90 amendment): `🕐 +6 ש׳` / `🕐 −3 ש׳`, the signed clock jump
// a zone crossing costs you. Amber because it is a *time* concept (ADR-0028).
//
// It exists as a component because the same pill had been copy-pasted onto three
// surfaces (`.wp-event-tzdelta`, `.tr-tzdelta`, `.bld-tzdelta`) that differed
// only in class name — and the board + glance would have made five. Surfaces
// pass `className` for their own spacing/size; the dark board passes `on-dark`,
// the one place the amber wash has to change (ADR-0096).
//
// Visibility is decided upstream, not here: `eventZones`/`eventEdgeZone` return
// `deltaMinutes` only for a non-zero shift, so a single-zone trip never renders
// a pill. Callers render it exactly when they have a delta.
import { formatZoneDelta } from '../lib/time';
import { t } from '../i18n/he';
import './zone-shift-pill.css';

export interface ZoneShiftPillProps {
  /** Signed shift in minutes (from `EventZones.deltaMinutes`). */
  minutes: number;
  /** Surface-specific spacing/size, plus `on-dark` on the board. */
  className?: string;
}

export function ZoneShiftPill({ minutes, className }: ZoneShiftPillProps) {
  return (
    <span
      className={className ? `wp-tzshift ${className}` : 'wp-tzshift'}
      dir="ltr"
      title={t.event.zoneShift}
    >
      🕐 {formatZoneDelta(minutes)}
    </span>
  );
}
