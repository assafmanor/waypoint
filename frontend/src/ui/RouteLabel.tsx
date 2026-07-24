// Shared transport route label (ADR-0048/0059 §3): origin → destination for a
// flight/train, laid out RTL (flex, not text bidi) so the origin sits at the
// start/right and the arrow points at the destination regardless of whether the
// place names are Hebrew or Latin. One component behind every route surface — the
// Index row, the booking detail, and the board hero — so a flight reads the same
// everywhere (it shows where it goes, not a name).
//
// Width-starved surfaces (the day timeline row) don't pass longer names through a
// different layout — they pass SHORTER names (`shortPlaceLabel`) and fall back to
// a destination-primary line if even those don't fit; `routeDisplay` owns that
// choice, so this component stays a dumb inline label.
import { NavArrow } from './NavArrow';

/** Placeholder for an endpoint that isn't picked yet. A plain dash reads as
 *  "no value" (never an em dash — root CLAUDE.md's copy rule). */
const NO_ENDPOINT = '-';

export function RouteLabel({ from, to }: { from?: string; to?: string }) {
  return (
    <span className="route">
      <bdi>{from ?? NO_ENDPOINT}</bdi>
      <span className="arr" aria-hidden="true">
        <NavArrow variant="forward" />
      </span>
      <bdi>{to ?? NO_ENDPOINT}</bdi>
    </span>
  );
}
