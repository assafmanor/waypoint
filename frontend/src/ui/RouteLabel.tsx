// Shared transport route label (ADR-0048/0059 §3): origin → destination for a
// flight/train, laid out RTL (flex, not text bidi) so the origin sits at the
// start/right and the arrow points at the destination regardless of whether the
// place names are Hebrew or Latin. One component behind every route surface — the
// Index row, the booking detail, and the board hero — so a flight reads the same
// everywhere (it shows where it goes, not a name).
import { NavArrow } from './NavArrow';

export function RouteLabel({ from, to }: { from?: string; to?: string }) {
  return (
    <span className="route">
      <bdi>{from ?? '-'}</bdi>
      <span className="arr" aria-hidden="true">
        <NavArrow variant="forward" />
      </span>
      <bdi>{to ?? '-'}</bdi>
    </span>
  );
}
