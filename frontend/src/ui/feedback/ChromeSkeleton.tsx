// ChromeSkeleton — the mode-themed header bar behind the snapshot skeleton
// (ADR-0105 tier 2: "the chrome is already mode-themed at this point"). Reuses
// the real Header's own `.header.mode-chrome`/`.hdr-top`/`.hdr-trip` classes
// (App.css) so the indigo/plan-paper theming, sizing, and the mode switch's own
// CSS transitions come for free — no parallel header styling. It draws row 1
// only: row 2 needs the trip's dates, which is exactly what has not loaded.
// The trip name/icon render for real when the caller already knows them
// (RootSurface's resolved trips list), so that part never pops in later; only
// the avatar (needs member data the snapshot hasn't loaded) stays a shimmer.
import type { Trip } from '@waypoint/shared';
import type { Mode } from '../../lib/mode';
import { DEFAULT_TRIP_ICON } from '../../constants';
import { Skeleton } from './Skeleton';

export function ChromeSkeleton({
  mode,
  trip,
}: {
  mode: Mode;
  trip?: Pick<Trip, 'name' | 'icon'> | null;
}) {
  return (
    <header className="header mode-chrome" data-mode={mode} aria-hidden="true">
      <div className="hdr-top">
        <div className="hdr-trip">
          <span className="trip-glyph">
            <span className="trip-icon">{trip?.icon ?? DEFAULT_TRIP_ICON}</span>
          </span>
          {trip ? (
            <span className="trip-name">{trip.name}</span>
          ) : (
            <Skeleton shape="line" height={16} width={96} />
          )}
        </div>
        <Skeleton shape="circle" width={26} height={26} />
      </div>
    </header>
  );
}
